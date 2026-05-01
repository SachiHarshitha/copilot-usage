import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { isUserPubliclyVisible } from '@/lib/policy/userLifecycle';

/**
 * GET /api/profile/[username]
 * Returns public profile data for a user.
 *
 * Lifecycle gating: deleted (deletedAt set) and suspended users return 404
 * regardless of `profilePublic`. See `lib/policy/userLifecycle.ts`.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;

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
    return NextResponse.json({ error: 'User not found or profile is private.' }, { status: 404 });
  }

  return NextResponse.json({
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
  });
}
