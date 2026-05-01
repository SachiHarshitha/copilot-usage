import type { PrismaClient } from '@prisma/client';

import { prisma as defaultPrisma } from '@/lib/db';
import { isUserPubliclyVisible } from '@/lib/policy/userLifecycle';

/**
 * Shape returned by GET /api/profile/[username] on success. Locked in by
 * `loadProfileByUsername.itest.ts` — Phase 0 baseline characterization. Any
 * intentional schema/privacy change in later phases must update both this
 * type and the itest in the same commit.
 */
export interface PublicProfileResponse {
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  createdAt: Date;
  stats: {
    totalRequests: number;
    promptTokens: string;
    outputTokens: string;
    totalTokens: string;
    weeklyTokens: string;
    rolling30DayTokens: string;
    premiumRequests: number;
    currentStreakDays: number;
    bestStreakDays: number;
    workspaceCount: number;
    sessionCount: number;
    topModel: string | null;
    lastSyncedAt: Date | null;
  } | null;
  repos: Array<{
    repoIdentity: string;
    displayMode: string;
    githubRepo: string | null;
    aliasLabel: string | null;
    requests: number;
    totalTokens: string;
    premiumReqs: number;
    topModel: string | null;
  }>;
}

/**
 * Load the public profile payload for a username. Returns `null` for users
 * who are missing, deleted, suspended, or not `profilePublic`. Only public
 * repos are included.
 *
 * Pulled out of the route handler so itests can exercise it against
 * `withTestDb` without booting the Next runtime.
 */
export async function loadProfileByUsername(
  username: string,
  prisma: PrismaClient = defaultPrisma,
): Promise<PublicProfileResponse | null> {
  const user = await prisma.user.findUnique({
    where: { username },
    include: {
      userStat: true,
      repoStats: {
        where: { isPublic: true },
        orderBy: { totalTokens: 'desc' },
        take: 10,
      },
    },
  });

  if (!user || !isUserPubliclyVisible(user)) {
    return null;
  }

  return {
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt,
    stats: user.userStat
      ? {
          totalRequests: user.userStat.totalRequests,
          promptTokens: user.userStat.promptTokens.toString(),
          outputTokens: user.userStat.outputTokens.toString(),
          totalTokens: user.userStat.totalTokens.toString(),
          weeklyTokens: user.userStat.weeklyTokens.toString(),
          rolling30DayTokens: user.userStat.rolling30DayTokens.toString(),
          premiumRequests: user.userStat.premiumRequests,
          currentStreakDays: user.userStat.currentStreakDays,
          bestStreakDays: user.userStat.bestStreakDays,
          workspaceCount: user.userStat.workspaceCount,
          sessionCount: user.userStat.sessionCount,
          topModel: user.userStat.topModel,
          lastSyncedAt: user.userStat.lastSyncedAt,
        }
      : null,
    repos: user.repoStats.map((r) => ({
      repoIdentity: r.repoIdentity,
      displayMode: r.displayMode,
      githubRepo: r.githubRepo,
      aliasLabel: r.aliasLabel,
      requests: r.requests,
      totalTokens: r.totalTokens.toString(),
      premiumReqs: r.premiumReqs,
      topModel: r.topModel,
    })),
  };
}
