import type { PrismaClient } from '@prisma/client';

import { prisma as defaultPrisma } from '@/lib/db';
import { userVisibleForFeatureWhere } from '@/lib/policy/userLifecycle';

export const USER_LEADERBOARD_PAGE_SIZE = 25;

export type UserLeaderboardSort = 'tokens' | 'premium';

/**
 * Shape of a single entry in the all-time user leaderboard. Locked in by
 * `getUserLeaderboardAllTime.itest.ts` (Phase 0 baseline).
 */
export interface UserLeaderboardEntry {
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
 * All-time user leaderboard (no `since` filter). Excludes deleted, suspended,
 * and non-public users via `userPubliclyVisibleWhere()`.
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

  const stats = await prisma.userStat.findMany({
    where: { user: userVisibleForFeatureWhere('leaderboard') },
    include: { user: { select: { username: true, avatarUrl: true } } },
    orderBy: sort === 'premium' ? { premiumRequests: 'desc' } : { totalTokens: 'desc' },
    take: USER_LEADERBOARD_PAGE_SIZE,
    skip: (page - 1) * USER_LEADERBOARD_PAGE_SIZE,
  });

  return stats.map((s, i) => ({
    rank: (page - 1) * USER_LEADERBOARD_PAGE_SIZE + i + 1,
    username: s.user.username,
    avatarUrl: s.user.avatarUrl,
    totalTokens: s.totalTokens.toString(),
    premiumRequests: s.premiumRequests,
    totalRequests: s.totalRequests,
    currentStreakDays: s.currentStreakDays,
    rolling30DayTokens: s.rolling30DayTokens.toString(),
    topModel: s.topModel,
    workspaceCount: s.workspaceCount,
  }));
}
