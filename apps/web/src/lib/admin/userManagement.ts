import { NextRequest, NextResponse } from 'next/server';
import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';

import { prisma as defaultPrisma } from '@/lib/db';
import { adminAuthErrorToResponse, requireAdmin } from '@/lib/admin/requireAdmin';

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
