'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/db';
import { ADMIN_SESSION_COOKIE_NAME } from '@/lib/admin/sessionCookie';
import { getActiveAdmin } from '@/lib/admin/auth/loginActions';
import {
  restoreUserCore,
  softDeleteUserCore,
  suspendUserCore,
  type AdminActor,
  type CoreActionResult,
} from '@/lib/admin/userManagement';
import { revokeDeviceCore } from '@/lib/admin/deviceManagement';

const ROLE_RANK: Record<AdminActor['role'], number> = {
  READ_ONLY: 0,
  MODERATOR: 1,
  ADMIN: 2,
  SUPER_ADMIN: 3,
};

/**
 * Resolve the current admin from the loopback session cookie. Redirects to
 * the login page when no valid session exists. Use this at the top of every
 * server action so every privileged operation re-validates the session.
 */
async function getAdminOr401(): Promise<AdminActor> {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE_NAME)?.value;
  if (!token) redirect('/admin/login');
  const admin = await getActiveAdmin(prisma, token);
  if (!admin) redirect('/admin/login');
  return { id: admin.id, email: admin.email, role: admin.role as AdminActor['role'] };
}

function requireRole(admin: AdminActor, min: AdminActor['role']): void {
  if (ROLE_RANK[admin.role] < ROLE_RANK[min]) {
    throw new Error('forbidden');
  }
}

export async function suspendUserAction(
  userId: string,
  confirm: boolean,
): Promise<CoreActionResult> {
  if (confirm !== true) throw new Error('confirm_required');
  const admin = await getAdminOr401();
  requireRole(admin, 'MODERATOR');
  const result = await suspendUserCore(prisma, admin, userId);
  revalidatePath(`/admin/users/${userId}`);
  revalidatePath('/admin/users');
  return result;
}

export async function restoreUserAction(
  userId: string,
  confirm: boolean,
): Promise<CoreActionResult> {
  if (confirm !== true) throw new Error('confirm_required');
  const admin = await getAdminOr401();
  requireRole(admin, 'MODERATOR');
  const result = await restoreUserCore(prisma, admin, userId);
  revalidatePath(`/admin/users/${userId}`);
  revalidatePath('/admin/users');
  return result;
}

export async function softDeleteUserAction(
  userId: string,
  confirm: boolean,
): Promise<CoreActionResult> {
  if (confirm !== true) throw new Error('confirm_required');
  const admin = await getAdminOr401();
  requireRole(admin, 'ADMIN');
  const result = await softDeleteUserCore(prisma, admin, userId);
  revalidatePath(`/admin/users/${userId}`);
  revalidatePath('/admin/users');
  return result;
}

export async function revokeDeviceAction(
  deviceId: string,
  userIdForRevalidate: string,
  confirm: boolean,
): Promise<CoreActionResult> {
  if (confirm !== true) throw new Error('confirm_required');
  const admin = await getAdminOr401();
  requireRole(admin, 'MODERATOR');
  const result = await revokeDeviceCore(prisma, admin, deviceId);
  revalidatePath(`/admin/users/${userIdForRevalidate}`);
  return result;
}
