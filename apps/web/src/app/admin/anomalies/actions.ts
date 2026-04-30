'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/db';
import { ADMIN_SESSION_COOKIE_NAME } from '@/lib/admin/sessionCookie';
import { getActiveAdmin } from '@/lib/admin/auth/loginActions';
import { resolveAnomalyCore, type ResolveAnomalyResult } from '@/lib/admin/anomalies';
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

export async function resolveAnomalyAction(
  anomalyId: string,
  resolution: string,
  confirm: boolean,
): Promise<ResolveAnomalyResult> {
  if (confirm !== true) throw new Error('confirm_required');
  if (typeof resolution !== 'string' || resolution.trim().length === 0) {
    throw new Error('resolution_required');
  }
  const admin = await getAdminOr401();
  requireRole(admin, 'MODERATOR');
  const result = await resolveAnomalyCore(prisma, admin, anomalyId, resolution);
  revalidatePath('/admin/anomalies');
  revalidatePath(`/admin/anomalies/${anomalyId}`);
  return result;
}
