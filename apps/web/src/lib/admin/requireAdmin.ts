import { NextRequest, NextResponse } from 'next/server';
import type { AdminRole, AdminUser, PrismaClient } from '@prisma/client';

import { prisma as defaultPrisma } from '@/lib/db';
import { ADMIN_SESSION_COOKIE_NAME } from './sessionCookie';
import { getActiveAdmin } from './auth/loginActions';

/** Hierarchy used by {@link requireAdmin}'s minRole comparison. */
const ROLE_RANK: Record<AdminRole, number> = {
  READ_ONLY: 0,
  MODERATOR: 1,
  ADMIN: 2,
  SUPER_ADMIN: 3,
};

export class AdminAuthRequiredError extends Error {
  readonly status: 401 | 403;
  constructor(status: 401 | 403, message: string) {
    super(message);
    this.status = status;
    this.name = 'AdminAuthRequiredError';
  }
}

export interface RequireAdminOptions {
  /** Minimum role permitted. Defaults to `READ_ONLY` (any logged-in admin). */
  minRole?: AdminRole;
  /** Override the Prisma client (used by tests pointing at a test DB). */
  prisma?: PrismaClient;
}

/**
 * Resolve the fully-authenticated admin behind the request, or throw.
 *
 * Throws {@link AdminAuthRequiredError} with status 401 when no valid session
 * cookie is present (or the session is half-authenticated, expired, or
 * revoked) and 403 when the admin is below the required role.
 *
 * Use {@link adminAuthErrorToResponse} to convert the thrown error into a
 * deterministic JSON response — that helper exists so route handlers don't
 * each pick their own error shape.
 */
export async function requireAdmin(
  req: NextRequest,
  opts: RequireAdminOptions = {},
): Promise<AdminUser> {
  const prisma = opts.prisma ?? defaultPrisma;
  const token = req.cookies.get(ADMIN_SESSION_COOKIE_NAME)?.value ?? '';
  const admin = await getActiveAdmin(prisma, token);
  if (!admin) {
    throw new AdminAuthRequiredError(401, 'admin_session_required');
  }
  const minRole = opts.minRole ?? 'READ_ONLY';
  if (ROLE_RANK[admin.role] < ROLE_RANK[minRole]) {
    throw new AdminAuthRequiredError(403, 'admin_role_insufficient');
  }
  return admin;
}

/**
 * Convert an {@link AdminAuthRequiredError} into a NextResponse. Returns
 * `null` for any other error so the caller can choose to re-throw.
 */
export function adminAuthErrorToResponse(err: unknown): NextResponse | null {
  if (err instanceof AdminAuthRequiredError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  return null;
}
