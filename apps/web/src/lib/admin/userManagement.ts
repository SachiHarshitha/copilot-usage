import { NextRequest, NextResponse } from 'next/server';
import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';

import { prisma as defaultPrisma } from '@/lib/db';
import { adminAuthErrorToResponse, requireAdmin } from '@/lib/admin/requireAdmin';
import { withAuditedAction } from '@/lib/admin/auth/audit';
import { mailService as defaultMailService, type MailService } from '@/lib/mail/mailService';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

export interface UserListEntry {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  profilePublic: boolean;
  createdAt: string;
  githubId: number;
  totalTokens: string;
}

export interface UserListResponse {
  entries: UserListEntry[];
  nextCursor: string | null;
}

interface HandlerDeps {
  prisma?: PrismaClient;
  mail?: MailService;
}

/**
 * Implementation of `GET /api/admin/users`. The route file is a one-line
 * re-export — keeping the logic in a plain function makes it directly
 * testable against the test database without spinning up a Next.js server.
 */
export async function listUsersHandler(
  req: NextRequest,
  deps: HandlerDeps = {},
): Promise<NextResponse> {
  const prisma = deps.prisma ?? defaultPrisma;

  try {
    await requireAdmin(req, { prisma });
  } catch (err) {
    const res = adminAuthErrorToResponse(err);
    if (res) return res;
    throw err;
  }

  const params = req.nextUrl.searchParams;
  const rawQuery = (params.get('query') ?? '').trim();
  const rawLimit = parseInt(params.get('limit') ?? '', 10);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0
    ? Math.min(rawLimit, MAX_LIMIT)
    : DEFAULT_LIMIT;
  const cursor = params.get('cursor');

  const where: Prisma.UserWhereInput = {};
  if (rawQuery.length > 0) {
    // Username is the only public identifier on the User model. Email lives
    // on AdminUser, not User, so search is intentionally username-only.
    where.username = { contains: rawQuery, mode: 'insensitive' };
  }

  const rows = await prisma.user.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1, // fetch one extra to detect a next page
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      profilePublic: true,
      createdAt: true,
      githubId: true,
      userStat: { select: { totalTokens: true } },
    },
  });

  const hasMore = rows.length > limit;
  const trimmed = hasMore ? rows.slice(0, limit) : rows;
  const entries: UserListEntry[] = trimmed.map((u) => ({
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    avatarUrl: u.avatarUrl,
    profilePublic: u.profilePublic,
    createdAt: u.createdAt.toISOString(),
    githubId: u.githubId,
    totalTokens: (u.userStat?.totalTokens ?? 0n).toString(),
  }));

  const body: UserListResponse = {
    entries,
    nextCursor: hasMore ? trimmed[trimmed.length - 1].id : null,
  };
  return NextResponse.json(body);
}

export interface UserDetailResponse {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  profilePublic: boolean;
  createdAt: string;
  githubId: number;
  totalTokens: string;
  /** Active (non-revoked) device count. */
  deviceCount: number;
  /** Total device count including revoked, for forensic context. */
  deviceCountAll: number;
  /** Number of UploadLog entries in the last 30 days. */
  recentUploads30d: number;
  /**
   * Verification surface placeholder. The VerificationAnomaly model does not
   * yet exist in the schema; this field exists so the response shape is
   * stable when verification ops land.
   */
  verificationStatus: 'unknown';
  /** Anomaly count placeholder, see verificationStatus comment. */
  recentAnomalies30d: 0;
}

interface UserDetailParams {
  id: string;
}

/**
 * Implementation of `GET /api/admin/users/[id]`. Returns a single user with
 * derived counts (devices, recent uploads). Returns 404 when the id does not
 * resolve. Returns no GitHub tokens, no encrypted secrets, no device secrets.
 */
export async function userDetailHandler(
  req: NextRequest,
  ctx: { params: UserDetailParams | Promise<UserDetailParams> },
  deps: HandlerDeps = {},
): Promise<NextResponse> {
  const prisma = deps.prisma ?? defaultPrisma;

  try {
    await requireAdmin(req, { prisma });
  } catch (err) {
    const res = adminAuthErrorToResponse(err);
    if (res) return res;
    throw err;
  }

  const params = await Promise.resolve(ctx.params);
  const id = params.id;
  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  }

  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [user, deviceCount, deviceCountAll, recentUploads30d] = await Promise.all([
    prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        profilePublic: true,
        createdAt: true,
        githubId: true,
        userStat: { select: { totalTokens: true } },
      },
    }),
    prisma.device.count({ where: { userId: id, revokedAt: null } }),
    prisma.device.count({ where: { userId: id } }),
    prisma.uploadLog.count({ where: { userId: id, uploadedAt: { gte: since30d } } }),
  ]);

  if (!user) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const body: UserDetailResponse = {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    profilePublic: user.profilePublic,
    createdAt: user.createdAt.toISOString(),
    githubId: user.githubId,
    totalTokens: (user.userStat?.totalTokens ?? 0n).toString(),
    deviceCount,
    deviceCountAll,
    recentUploads30d,
    verificationStatus: 'unknown',
    recentAnomalies30d: 0,
  };
  return NextResponse.json(body);
}

// ---------------------------------------------------------------------------
// Mutations (B.3)
// ---------------------------------------------------------------------------

/**
 * Read JSON safely. Returns null when the body is missing or malformed so the
 * caller can decide whether that is an error in context.
 */
async function readJson<T = unknown>(req: NextRequest): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Standard mutation envelope. We require `{ confirm: true }` so a misclick or
 * stray request never destroys account state.
 */
function requireConfirm(body: { confirm?: unknown } | null): NextResponse | null {
  if (!body || body.confirm !== true) {
    return NextResponse.json({ error: 'confirm_required' }, { status: 400 });
  }
  return null;
}

/**
 * POST /api/admin/users/[id]/suspend — sets User.status = SUSPENDED. Idempotent
 * when already suspended (returns ok with `noop: true`). Sends an
 * `account-suspended` mail (no-op for users without a recorded address).
 *
 * Requires MODERATOR or higher.
 */
export async function suspendUserHandler(
  req: NextRequest,
  ctx: { params: { id: string } | Promise<{ id: string }> },
  deps: HandlerDeps = {},
): Promise<NextResponse> {
  const prisma = deps.prisma ?? defaultPrisma;
  const mail = deps.mail ?? defaultMailService;

  let admin;
  try {
    admin = await requireAdmin(req, { prisma, minRole: 'MODERATOR' });
  } catch (err) {
    const res = adminAuthErrorToResponse(err);
    if (res) return res;
    throw err;
  }

  const params = await Promise.resolve(ctx.params);
  const body = await readJson<{ confirm?: boolean }>(req);
  const reject = requireConfirm(body);
  if (reject) return reject;

  const target = await prisma.user.findUnique({
    where: { id: params.id },
    select: { id: true, status: true, deletedAt: true, username: true },
  });
  if (!target) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (target.deletedAt) {
    return NextResponse.json({ error: 'user_deleted' }, { status: 409 });
  }
  if (target.status === 'SUSPENDED') {
    return NextResponse.json({ ok: true, noop: true });
  }

  await withAuditedAction(prisma, {
    adminUserId: admin.id,
    adminEmail: admin.email,
    action: 'USER_SUSPEND',
    targetType: 'User',
    targetId: target.id,
    before: { status: target.status },
    after: { status: 'SUSPENDED' },
    run: async () => {
      await prisma.user.update({
        where: { id: target.id },
        data: { status: 'SUSPENDED' },
      });
      // No `email` column on User today, so this is a no-op send. The call
      // exists so Phase G can make it a real notification with one swap.
      await mail.send({
        to: [],
        templateId: 'account-suspended',
        variables: { username: target.username },
      });
    },
  });

  return NextResponse.json({ ok: true });
}

/**
 * POST /api/admin/users/[id]/restore — clears suspension. Does NOT send mail.
 * Idempotent for already-active users.
 */
export async function restoreUserHandler(
  req: NextRequest,
  ctx: { params: { id: string } | Promise<{ id: string }> },
  deps: HandlerDeps = {},
): Promise<NextResponse> {
  const prisma = deps.prisma ?? defaultPrisma;

  let admin;
  try {
    admin = await requireAdmin(req, { prisma, minRole: 'MODERATOR' });
  } catch (err) {
    const res = adminAuthErrorToResponse(err);
    if (res) return res;
    throw err;
  }

  const params = await Promise.resolve(ctx.params);
  const body = await readJson<{ confirm?: boolean }>(req);
  const reject = requireConfirm(body);
  if (reject) return reject;

  const target = await prisma.user.findUnique({
    where: { id: params.id },
    select: { id: true, status: true, deletedAt: true },
  });
  if (!target) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (target.deletedAt) {
    return NextResponse.json({ error: 'user_deleted' }, { status: 409 });
  }
  if (target.status === 'ACTIVE') {
    return NextResponse.json({ ok: true, noop: true });
  }

  await withAuditedAction(prisma, {
    adminUserId: admin.id,
    adminEmail: admin.email,
    action: 'USER_RESTORE',
    targetType: 'User',
    targetId: target.id,
    before: { status: target.status },
    after: { status: 'ACTIVE' },
    run: async () => {
      await prisma.user.update({
        where: { id: target.id },
        data: { status: 'ACTIVE' },
      });
    },
  });

  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/admin/users/[id] — soft delete. Sets `deletedAt`, anonymizes
 * username/displayName/avatar, revokes every device. Preserves UploadLog and
 * AdminActionLog rows for forensics. Idempotent — calling twice is a no-op.
 *
 * Requires ADMIN or higher (more destructive than suspend).
 */
export async function deleteUserHandler(
  req: NextRequest,
  ctx: { params: { id: string } | Promise<{ id: string }> },
  deps: HandlerDeps = {},
): Promise<NextResponse> {
  const prisma = deps.prisma ?? defaultPrisma;

  let admin;
  try {
    admin = await requireAdmin(req, { prisma, minRole: 'ADMIN' });
  } catch (err) {
    const res = adminAuthErrorToResponse(err);
    if (res) return res;
    throw err;
  }

  const params = await Promise.resolve(ctx.params);
  const body = await readJson<{ confirm?: boolean }>(req);
  const reject = requireConfirm(body);
  if (reject) return reject;

  const target = await prisma.user.findUnique({
    where: { id: params.id },
    select: { id: true, username: true, deletedAt: true },
  });
  if (!target) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (target.deletedAt) {
    return NextResponse.json({ ok: true, noop: true });
  }

  const tombstoneUsername = `deleted-${target.id}`;
  await withAuditedAction(prisma, {
    adminUserId: admin.id,
    adminEmail: admin.email,
    action: 'USER_SOFT_DELETE',
    targetType: 'User',
    targetId: target.id,
    before: { username: target.username },
    after: { username: tombstoneUsername },
    run: async () => {
      // Single transaction: anonymize the user row, revoke every device.
      // GitHub credential storage doesn't exist in the schema yet — when it
      // lands the `delete` for it goes here, inside this transaction.
      await prisma.$transaction([
        prisma.user.update({
          where: { id: target.id },
          data: {
            deletedAt: new Date(),
            username: tombstoneUsername,
            displayName: null,
            avatarUrl: null,
            profilePublic: false,
          },
        }),
        prisma.device.updateMany({
          where: { userId: target.id, revokedAt: null },
          data: { revokedAt: new Date() },
        }),
      ]);
    },
  });

  return NextResponse.json({ ok: true });
}
