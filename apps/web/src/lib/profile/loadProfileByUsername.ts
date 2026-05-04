import type { PrismaClient } from '@prisma/client';

import {
  getCanonicalRepoStatsList,
  getCanonicalUserStats,
} from '@/lib/canonical-stats';
import { prisma as defaultPrisma } from '@/lib/db';
import { isUserVisibleForFeature } from '@/lib/policy/userLifecycle';

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
    include: { privacySettings: true },
  });

  if (!user || !isUserVisibleForFeature(user, 'profile')) {
    return null;
  }

  const [stats, repos] = await Promise.all([
    getCanonicalUserStats(prisma, user.id),
    getCanonicalRepoStatsList(prisma, user.id, {
      publicOnly: true,
      take: 10,
    }),
  ]);

  return {
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt,
    stats: stats
      ? {
          totalRequests: stats.totalRequests,
          promptTokens: stats.promptTokens.toString(),
          outputTokens: stats.outputTokens.toString(),
          totalTokens: stats.totalTokens.toString(),
          weeklyTokens: stats.weeklyTokens.toString(),
          rolling30DayTokens: stats.rolling30DayTokens.toString(),
          premiumRequests: stats.premiumRequests,
          currentStreakDays: stats.currentStreakDays,
          bestStreakDays: stats.bestStreakDays,
          workspaceCount: stats.workspaceCount,
          sessionCount: stats.sessionCount,
          topModel: stats.topModel,
          lastSyncedAt: stats.lastSyncedAt,
        }
      : null,
    repos: repos.map((r) => ({
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
