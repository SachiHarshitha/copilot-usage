import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/db';
import type { PublicRepoBadgeSummary, PublicUserBadgeSummary } from './types';

export function computeRankPercentile(
  rank: number | bigint | null | undefined,
  repoCount: number | bigint | null | undefined
): number | null {
  if (rank == null || repoCount == null) return null;

  const rankNum = typeof rank === 'bigint' ? Number(rank) : rank;
  const repoCountNum = typeof repoCount === 'bigint' ? Number(repoCount) : repoCount;

  if (!Number.isFinite(rankNum) || !Number.isFinite(repoCountNum) || repoCountNum <= 0 || rankNum <= 0) {
    return null;
  }

  return Number((((repoCountNum - rankNum + 1) / repoCountNum) * 100).toFixed(2));
}

function formatRepoDisplay(repo: {
  displayMode: string;
  githubRepo: string | null;
  aliasLabel: string | null;
  repoIdentity: string;
}): string {
  if (repo.displayMode === 'github' && repo.githubRepo) return repo.githubRepo;
  if (repo.aliasLabel) return repo.aliasLabel;
  return repo.repoIdentity;
}

const getPublicUserBadgeSummaryCached = unstable_cache(
  async (username: string): Promise<PublicUserBadgeSummary | null> => {
    const user = await prisma.user.findUnique({
      where: { username },
      include: {
        userStat: true,
        repoStats: {
          where: { isPublic: true },
          orderBy: { totalTokens: 'desc' },
          take: 1,
        },
        _count: {
          select: {
            repoStats: {
              where: { isPublic: true },
            },
          },
        },
      },
    });

    if (!user || !user.profilePublic || !user.userStat) {
      return null;
    }

    return {
      username: user.username,
      displayName: user.displayName || user.username,
      lifetimeTokens: user.userStat.totalTokens || BigInt(0),
      totalRequests: user.userStat.totalRequests || 0,
      premiumRequests: user.userStat.premiumRequests || 0,
      weeklyTokens: user.userStat.weeklyTokens || BigInt(0),
      rolling30DayTokens: user.userStat.rolling30DayTokens || BigInt(0),
      currentStreakDays: user.userStat.currentStreakDays || 0,
      bestStreakDays: user.userStat.bestStreakDays || 0,
      topRepoName: user.repoStats[0] ? formatRepoDisplay(user.repoStats[0]) : null,
      publicRepoCount: user._count.repoStats,
    };
  },
  ['public-user-badge-summary-v1'],
  { revalidate: 300 }
);

const getPublicRepoBadgeSummaryCached = unstable_cache(
  async (repoSlug: string): Promise<PublicRepoBadgeSummary | null> => {
    const where = {
      isPublic: true,
      githubRepo: repoSlug,
      user: { profilePublic: true },
    };

    const aggregate = await prisma.repoStat.aggregate({
      where,
      _sum: {
        totalTokens: true,
        tokens30d: true,
        requests: true,
        premiumReqs: true,
      },
      _count: {
        _all: true,
      },
    });

    if (!aggregate._count._all) {
      return null;
    }

    const rankRows = await prisma.$queryRaw<{ repo_rank: number | bigint; repo_count: number | bigint }[]>`
      WITH repo_totals AS (
        SELECT rs."githubRepo" AS "githubRepo", SUM(rs."totalTokens")::bigint AS total_tokens
        FROM "RepoStat" rs
        JOIN "User" u ON u.id = rs."userId"
        WHERE rs."isPublic" = true
          AND rs."githubRepo" IS NOT NULL
          AND u."profilePublic" = true
        GROUP BY rs."githubRepo"
      ),
      ranked AS (
        SELECT
          "githubRepo",
          DENSE_RANK() OVER (ORDER BY total_tokens DESC) AS repo_rank,
          COUNT(*) OVER () AS repo_count
        FROM repo_totals
      )
      SELECT repo_rank, repo_count
      FROM ranked
      WHERE "githubRepo" = ${repoSlug}
      LIMIT 1
    `;

    const rank = rankRows[0]?.repo_rank ?? null;
    const repoCount = rankRows[0]?.repo_count ?? null;

    const modelRows = await prisma.repoStat.findMany({
      where,
      select: { topModel: true },
      distinct: ['topModel'],
      take: 3,
    });

    const models = modelRows
      .map((row) => row.topModel)
      .filter((model): model is string => !!model && model.trim().length > 0);

    const primaryModelRow = await prisma.repoStat.findFirst({
      where,
      orderBy: { totalTokens: 'desc' },
      select: { topModel: true },
    });

    const percentile = computeRankPercentile(rank, repoCount);

    return {
      repoSlug,
      totalTokens: aggregate._sum.totalTokens || BigInt(0),
      tokens30d: aggregate._sum.tokens30d || aggregate._sum.totalTokens || BigInt(0),
      requests: aggregate._sum.requests || 0,
      premiumRequests: aggregate._sum.premiumReqs || 0,
      rank,
      percentile,
      models,
      primaryModel: primaryModelRow?.topModel || null,
    };
  },
  ['public-repo-badge-summary-v1'],
  { revalidate: 300 }
);

export async function getPublicUserBadgeSummary(username: string): Promise<PublicUserBadgeSummary | null> {
  return getPublicUserBadgeSummaryCached(username);
}

export async function getPublicRepoBadgeSummary(owner: string, repo: string): Promise<PublicRepoBadgeSummary | null> {
  return getPublicRepoBadgeSummaryCached(`${owner}/${repo}`);
}
