import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { getCanonicalUserStats } from '@/lib/canonical-stats';
import { prisma } from '@/lib/db';
import {
  userVisibleForFeatureSql,
} from '@/lib/policy/userLifecycle';
import {
  USER_LEADERBOARD_PAGE_SIZE,
  getUserLeaderboardAllTime,
  type UserLeaderboardSort,
} from '@/lib/leaderboard/getUserLeaderboardAllTime';

const PAGE_SIZE = USER_LEADERBOARD_PAGE_SIZE;

/**
 * GET /api/leaderboard?sort=tokens|premium&since=7d|30d&page=1
 *
 * The all-time path (no `since`) is characterized by
 * `lib/leaderboard/getUserLeaderboardAllTime.itest.ts` (Phase 0 baseline).
 */
export async function GET(request: NextRequest) {
  const sort: UserLeaderboardSort =
    request.nextUrl.searchParams.get('sort') === 'premium' ? 'premium' : 'tokens';
  const since = request.nextUrl.searchParams.get('since');
  const page = Math.max(1, parseInt(request.nextUrl.searchParams.get('page') || '1', 10));

  if (!since) {
    const entries = await getUserLeaderboardAllTime({ sort, page });
    return NextResponse.json({ entries, page, pageSize: PAGE_SIZE });
  }

  // Date-filtered
  const days = since === '7d' ? 7 : 30;
  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - days);

  const orderBy =
    sort === 'premium'
      ? Prisma.raw('"premiumRequests" DESC, "totalTokens" DESC, "userId" ASC')
      : Prisma.raw('"totalTokens" DESC, "premiumRequests" DESC, "userId" ASC');
  const rows = await prisma.$queryRaw<
    { userId: string; totalTokens: bigint; premiumRequests: number; totalRequests: number }[]
  >(Prisma.sql`
    SELECT u.id AS "userId",
           COALESCE(SUM(mud."totalTokens"), 0)::bigint AS "totalTokens",
           COALESCE(SUM(mud."premiumRequests"), 0)::float AS "premiumRequests",
           COALESCE(SUM(mud."requestCount"), 0)::int AS "totalRequests"
    FROM "User" u
    LEFT JOIN "ModelUsageDaily" mud
      ON mud."userId" = u.id
     AND mud."date" >= ${sinceDate}
    WHERE ${userVisibleForFeatureSql('u', 'leaderboard')}
    GROUP BY u.id
    ORDER BY ${orderBy}
    LIMIT ${PAGE_SIZE}
    OFFSET ${(page - 1) * PAGE_SIZE}
  `);

  const userIds = rows.map((r) => r.userId);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, username: true, avatarUrl: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));
  const userStats = await Promise.all(rows.map((r) => getCanonicalUserStats(prisma, r.userId)));
  const statsByUser = new Map(rows.map((r, index) => [r.userId, userStats[index]] as const));

  return NextResponse.json({
    entries: rows.map((r, i) => {
      const user = userMap.get(r.userId);
      const stats = statsByUser.get(r.userId);
      return {
        rank: (page - 1) * PAGE_SIZE + i + 1,
        username: user?.username || 'unknown',
        avatarUrl: user?.avatarUrl || null,
        totalTokens: r.totalTokens.toString(),
        premiumRequests: r.premiumRequests,
        totalRequests: r.totalRequests,
        currentStreakDays: stats?.currentStreakDays ?? 0,
        rolling30DayTokens: (stats?.rolling30DayTokens ?? r.totalTokens).toString(),
        topModel: stats?.topModel ?? null,
        workspaceCount: stats?.workspaceCount ?? 0,
      };
    }),
    page,
    pageSize: PAGE_SIZE,
  });
}
