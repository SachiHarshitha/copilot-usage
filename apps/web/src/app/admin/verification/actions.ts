'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/db';
import { ADMIN_SESSION_COOKIE_NAME } from '@/lib/admin/sessionCookie';
import { getActiveAdmin } from '@/lib/admin/auth/loginActions';
import {
  createBadgeOverrideCore,
  type CreateBadgeOverrideResult,
} from '@/lib/admin/badgeOverrides';
import type { AdminActor } from '@/lib/admin/userManagement';

const ROLE_RANK: Record<AdminActor['role'], number> = {
  READ_ONLY: 0,
  MODERATOR: 1,
  ADMIN: 2,
  SUPER_ADMIN: 3,
};

async function getAdminOr401(): Promise<AdminActor> {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE_NAME)?.value;
  if (!token) redirect('/admin/login');
  const admin = await getActiveAdmin(prisma, token);
  if (!admin) redirect('/admin/login');
  return { id: admin.id, email: admin.email, role: admin.role as AdminActor['role'] };
}

function requireRole(admin: AdminActor, min: AdminActor['role']): void {
  if (ROLE_RANK[admin.role] < ROLE_RANK[min]) throw new Error('forbidden');
}

export async function createBadgeOverrideAction(
  userId: string,
  eligible: boolean,
  reason: string,
  expiresAtIso: string | null,
  confirm: boolean,
): Promise<CreateBadgeOverrideResult> {
  if (confirm !== true) throw new Error('confirm_required');
  if (typeof eligible !== 'boolean') throw new Error('eligible_required');
  if (typeof reason !== 'string' || reason.trim().length === 0) {
    throw new Error('reason_required');
  }

  let expiresAt: Date | null = null;
  if (expiresAtIso) {
    const parsed = new Date(expiresAtIso);
    if (Number.isNaN(parsed.getTime())) throw new Error('expires_at_invalid');
    if (parsed.getTime() <= Date.now()) throw new Error('expires_at_in_past');
    expiresAt = parsed;
  }

  const admin = await getAdminOr401();
  requireRole(admin, 'ADMIN');

  const result = await createBadgeOverrideCore(prisma, admin, userId, {
    eligible,
    reason: reason.trim().slice(0, 500),
    expiresAt,
  });
  revalidatePath('/admin/verification');
  revalidatePath(`/admin/verification/${userId}`);
  return result;
}
