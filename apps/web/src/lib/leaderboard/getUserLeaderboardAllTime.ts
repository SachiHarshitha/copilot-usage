import { Prisma, type PrismaClient } from '@prisma/client';

import { getCanonicalUserStats } from '@/lib/canonical-stats';
import { prisma as defaultPrisma } from '@/lib/db';
import { userVisibleForFeatureSql } from '@/lib/policy/userLifecycle';

export const USER_LEADERBOARD_PAGE_SIZE = 25;

export type UserLeaderboardSort = 'tokens' | 'premium';

/**
 * Shape of a single entry in the all-time user leaderboard. Locked in by
 * `getUserLeaderboardAllTime.itest.ts` (Phase 0 baseline).
 */
export interface UserLeaderboardEntry {
  userId: string;
  rank: number;
  username: string;
  avatarUrl: string | null;
  totalTokens: string;
  premiumRequests: number;
  totalRequests: number;
  currentStreakDays: number;
  rolling30DayTokens: string;
  topModel: string | null;
  workspaceCount: number;
}

/**
 * All-time user leaderboard (no `since` filter). Includes users who are
 * publicly leaderboard-visible even when they currently have zero usage.
 * Deleted, suspended, or non-public users are excluded by
 * `userVisibleForFeatureSql('leaderboard')`.
 *
 * Pulled out of /api/leaderboard so itests can characterize the privacy
 * cascade without going through the route. The date-filtered branch of the
 * route (raw SQL) is left in the route handler — it is a separate code path
 * and will get its own characterization when Phase 1 schema changes touch it.
 */
export async function getUserLeaderboardAllTime(
  options: { sort: UserLeaderboardSort; page: number },
  prisma: PrismaClient = defaultPrisma,
): Promise<UserLeaderboardEntry[]> {
  const { sort } = options;
  const page = Math.max(1, options.page);
  const offset = (page - 1) * USER_LEADERBOARD_PAGE_SIZE;

  const orderBy =
    sort === 'premium'
      ? Prisma.raw('"premiumRequests" DESC, "totalTokens" DESC, "userId" ASC')
      : Prisma.raw('"totalTokens" DESC, "premiumRequests" DESC, "userId" ASC');

  const rows = await prisma.$queryRaw<
    Array<{ userId: string; totalTokens: bigint; premiumRequests: number; totalRequests: number }>
  >(Prisma.sql`
    SELECT u.id AS "userId",
           COALESCE(SUM(mud."totalTokens"), 0)::bigint AS "totalTokens",
           COALESCE(SUM(mud."premiumRequests"), 0)::float AS "premiumRequests",
           COALESCE(SUM(mud."requestCount"), 0)::int AS "totalRequests"
    FROM "User" u
    LEFT JOIN "ModelUsageDaily" mud ON mud."userId" = u.id
    WHERE ${userVisibleForFeatureSql('u', 'leaderboard')}
    GROUP BY u.id
    ORDER BY ${orderBy}
    LIMIT ${USER_LEADERBOARD_PAGE_SIZE}
    OFFSET ${offset}
  `);

  if (rows.length === 0) {
    return [];
  }

  const userIds = rows.map((row) => row.userId);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, username: true, avatarUrl: true },
  });
  const userMap = new Map(users.map((user) => [user.id, user] as const));

  const enrichedStats = await Promise.all(
    rows.map((row) => getCanonicalUserStats(prisma, row.userId))
  );
  const statsByUser = new Map(
    rows.map((row, index) => [row.userId, enrichedStats[index]] as const)
  );

  return rows.map((row, index) => {
    const user = userMap.get(row.userId);
    const stats = statsByUser.get(row.userId);
    return {
      userId: row.userId,
      rank: offset + index + 1,
      username: user?.username ?? 'unknown',
      avatarUrl: user?.avatarUrl ?? null,
      totalTokens: row.totalTokens.toString(),
      premiumRequests: row.premiumRequests,
      totalRequests: row.totalRequests,
      currentStreakDays: stats?.currentStreakDays ?? 0,
      rolling30DayTokens: (stats?.rolling30DayTokens ?? row.totalTokens).toString(),
      topModel: stats?.topModel ?? null,
      workspaceCount: stats?.workspaceCount ?? 0,
    };
  });
}
