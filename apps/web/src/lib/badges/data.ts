import { unstable_cache } from 'next/cache';
import { Prisma } from '@prisma/client';
import {
  getCanonicalRepoStatsList,
  getCanonicalUserStats,
} from '@/lib/canonical-stats';
import { prisma } from '@/lib/db';
import {
  leaderboardTag,
  repoSlugTag,
  userBadgesByUsernameTag,
} from '@/lib/cache/tags';
import {
  isUserVisibleForFeature,
  userVisibleForFeatureSql,
} from '@/lib/policy/userLifecycle';
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

async function fetchPublicUserBadgeSummary(username: string): Promise<PublicUserBadgeSummary | null> {
  const user = await prisma.user.findUnique({
    where: { username },
    include: { privacySettings: true },
  });

  if (!user || !isUserVisibleForFeature(user, 'badges')) {
    return null;
  }

  const [stats, publicRepos] = await Promise.all([
    getCanonicalUserStats(prisma, user.id),
    getCanonicalRepoStatsList(prisma, user.id, { publicOnly: true }),
  ]);

  return {
    username: user.username,
    displayName: user.displayName || user.username,
    lifetimeTokens: Number(stats?.totalTokens ?? BigInt(0)),
    totalRequests: stats?.totalRequests ?? 0,
    premiumRequests: stats?.premiumRequests ?? 0,
    weeklyTokens: Number(stats?.weeklyTokens ?? BigInt(0)),
    rolling30DayTokens: Number(stats?.rolling30DayTokens ?? BigInt(0)),
    currentStreakDays: stats?.currentStreakDays ?? 0,
    bestStreakDays: stats?.bestStreakDays ?? 0,
    topRepoName: publicRepos[0] ? formatRepoDisplay(publicRepos[0]) : null,
    publicRepoCount: publicRepos.length,
  };
}

const getPublicRepoBadgeSummaryCached = unstable_cache(
  async (repoSlug: string): Promise<PublicRepoBadgeSummary | null> => {
    const repoIdentity = `github:${repoSlug}`;
    const rolling30Start = new Date();
    rolling30Start.setHours(0, 0, 0, 0);
    rolling30Start.setDate(rolling30Start.getDate() - 29);

    const aggregateRows = await prisma.$queryRaw<
      Array<{
        totalTokens: bigint | null;
        tokens30d: bigint | null;
        requests: number | null;
        premiumRequests: number | null;
      }>
    >(Prisma.sql`
      SELECT
        SUM(mud."totalTokens")::bigint AS "totalTokens",
        SUM(CASE WHEN mud."date" >= ${rolling30Start} THEN mud."totalTokens" ELSE 0 END)::bigint AS "tokens30d",
        SUM(mud."requestCount")::int AS "requests",
        SUM(mud."premiumRequests")::float AS "premiumRequests"
      FROM "ModelUsageDaily" mud
      JOIN "RepoVisibilitySettings" rvs
        ON rvs."userId" = mud."userId"
       AND rvs."repoIdentity" = mud."repoIdentity"
      JOIN "User" u ON u.id = mud."userId"
      WHERE mud."repoIdentity" = ${repoIdentity}
        AND rvs."isPublic" = true
        AND ${userVisibleForFeatureSql('u', 'badges')}
    `);

    const aggregate = aggregateRows[0];
    if (!aggregate || aggregate.totalTokens === null) {
      return null;
    }

    const rankRows = await prisma.$queryRaw<{ repo_rank: number | bigint; repo_count: number | bigint }[]>(
      Prisma.sql`
      WITH repo_totals AS (
        SELECT mud."repoIdentity" AS "repoIdentity", SUM(mud."totalTokens")::bigint AS total_tokens
        FROM "ModelUsageDaily" mud
        JOIN "RepoVisibilitySettings" rvs
          ON rvs."userId" = mud."userId"
         AND rvs."repoIdentity" = mud."repoIdentity"
        JOIN "User" u ON u.id = mud."userId"
        WHERE mud."repoIdentity" LIKE 'github:%'
          AND rvs."isPublic" = true
          AND ${userVisibleForFeatureSql('u', 'badges')}
        GROUP BY mud."repoIdentity"
      ),
      ranked AS (
        SELECT
          "repoIdentity",
          DENSE_RANK() OVER (ORDER BY total_tokens DESC) AS repo_rank,
          COUNT(*) OVER () AS repo_count
        FROM repo_totals
      )
      SELECT repo_rank, repo_count
      FROM ranked
      WHERE "repoIdentity" = ${repoIdentity}
      LIMIT 1
    `
    );

    const rank = rankRows[0]?.repo_rank ?? null;
    const repoCount = rankRows[0]?.repo_count ?? null;

    const modelRows = await prisma.$queryRaw<Array<{ modelId: string }>>(
      Prisma.sql`
        SELECT mud."modelId" AS "modelId"
        FROM "ModelUsageDaily" mud
        JOIN "RepoVisibilitySettings" rvs
          ON rvs."userId" = mud."userId"
         AND rvs."repoIdentity" = mud."repoIdentity"
        JOIN "User" u ON u.id = mud."userId"
        WHERE mud."repoIdentity" = ${repoIdentity}
          AND rvs."isPublic" = true
          AND ${userVisibleForFeatureSql('u', 'badges')}
        GROUP BY mud."modelId"
        ORDER BY SUM(mud."requestCount") DESC, mud."modelId" ASC
        LIMIT 3
      `
    );
    const models = modelRows.map((row) => row.modelId);

    const percentile = computeRankPercentile(rank, repoCount);

    return {
      repoSlug,
      totalTokens: aggregate.totalTokens || BigInt(0),
      tokens30d: aggregate.tokens30d || aggregate.totalTokens || BigInt(0),
      requests: aggregate.requests || 0,
      premiumRequests: aggregate.premiumRequests || 0,
      rank: rank === null ? null : Number(rank),
      percentile,
      models,
      primaryModel: models[0] ?? null,
    };
  },
  ['public-repo-badge-summary-v1'],
  { revalidate: 300, tags: ['public-repo-badge-summary'] }
);

export async function getPublicUserBadgeSummary(username: string): Promise<PublicUserBadgeSummary | null> {
  // Single unstable_cache layer keyed per-username so revalidateTag(userBadgesByUsernameTag(username))
  // correctly invalidates this entry and re-runs the DB query.
  return unstable_cache(
    () => fetchPublicUserBadgeSummary(username),
    ['public-user-badge-summary-by-username-v1', username],
    { revalidate: 300, tags: [userBadgesByUsernameTag(username), leaderboardTag()] }
  )();
}

export async function getPublicRepoBadgeSummary(owner: string, repo: string): Promise<PublicRepoBadgeSummary | null> {
  const slug = `${owner}/${repo}`;
  return unstable_cache(
    () => getPublicRepoBadgeSummaryCached(slug),
    ['public-repo-badge-summary-by-slug-v1', slug],
    { revalidate: 300, tags: [repoSlugTag(slug), leaderboardTag()] }
  )();
}
