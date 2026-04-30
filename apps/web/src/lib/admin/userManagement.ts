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
