import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { AdminUser } from '@prisma/client';

import { prisma } from '@/lib/db';
import { ADMIN_SESSION_COOKIE_NAME } from './sessionCookie';
import { validateSession } from './session';

/**
 * Server-side page guard for all authenticated admin pages.
 *
 * Checks the session cookie, validates the session, and ensures 2FA has been
 * completed. Redirects to the appropriate login step on any failure:
 *  - No cookie / invalid session → /admin/login
 *  - Session exists but 2FA not completed → /admin/login/verify
 *
 * Returns the fully authenticated AdminUser on success.
 */
export async function requireAdminPage(): Promise<AdminUser> {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE_NAME)?.value;
  if (!token) redirect('/admin/login');

  const result = await validateSession(prisma, token);
  if (!result) redirect('/admin/login');
  if (!result.session.twoFactorCompletedAt) redirect('/admin/login/verify');

  return result.adminUser;
}
