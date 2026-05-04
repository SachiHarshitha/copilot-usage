import { Prisma, type PrismaClient } from '@prisma/client';

import { computeStreaks } from '@/lib/streak';

export interface CanonicalUserStats {
  totalRequests: number;
  promptTokens: bigint;
  outputTokens: bigint;
  totalTokens: bigint;
  weeklyTokens: bigint;
  rolling30DayTokens: bigint;
  premiumRequests: number;
  currentStreakDays: number;
  bestStreakDays: number;
  workspaceCount: number;
  sessionCount: number;
  topModel: string | null;
  lastSyncedAt: Date | null;
}

export interface CanonicalRepoStats {
  id: string;
  repoIdentity: string;
  displayMode: 'github' | 'alias';
  githubRepo: string | null;
  aliasLabel: string | null;
  isPublic: boolean;
  requests: number;
  promptTokens: bigint;
  outputTokens: bigint;
  totalTokens: bigint;
  tokens30d: bigint;
  premiumReqs: number;
  topModel: string | null;
  lastSyncedAt: Date | null;
}

function getRolling30Start(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const rolling30Start = new Date(today);
  rolling30Start.setDate(rolling30Start.getDate() - 29);
  return rolling30Start;
}

function getWeekStart(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekStart = new Date(today);
  weekStart.setDate(weekStart.getDate() - 6);
  return weekStart;
}

function parseRepoIdentity(repoIdentity: string): {
  displayMode: 'github' | 'alias';
  githubRepo: string | null;
  aliasLabel: string | null;
} {
  if (repoIdentity.startsWith('github:')) {
    return {
      displayMode: 'github',
      githubRepo: repoIdentity.slice('github:'.length),
      aliasLabel: null,
    };
  }

  if (repoIdentity.startsWith('alias:')) {
    return {
      displayMode: 'alias',
      githubRepo: null,
      aliasLabel: repoIdentity.slice('alias:'.length),
    };
  }

  return {
    displayMode: 'alias',
    githubRepo: null,
    aliasLabel: repoIdentity,
  };
}

export async function getCanonicalUserStats(
  prisma: PrismaClient,
  userId: string
): Promise<CanonicalUserStats | null> {
  const [
    allTimeAgg,
    weeklyAgg,
    rollingAgg,
    dailyTokenRows,
    distinctRepos,
    runCount,
    topModelRows,
    latestUsage,
  ] = await Promise.all([
    prisma.modelUsageDaily.aggregate({
      where: { userId },
      _sum: {
        requestCount: true,
        inputTokens: true,
        outputTokens: true,
        totalTokens: true,
        premiumRequests: true,
      },
    }),
    prisma.modelUsageDaily.aggregate({
      where: { userId, date: { gte: getWeekStart() } },
      _sum: { totalTokens: true },
    }),
    prisma.modelUsageDaily.aggregate({
      where: { userId, date: { gte: getRolling30Start() } },
      _sum: { totalTokens: true },
    }),
    prisma.modelUsageDaily.groupBy({
      by: ['date'],
      where: { userId },
      _sum: { totalTokens: true },
      orderBy: { date: 'asc' },
    }),
    prisma.modelUsageDaily.findMany({
      where: { userId, repoIdentity: { not: '' } },
      select: { repoIdentity: true },
      distinct: ['repoIdentity'],
    }),
    prisma.agentRun.count({ where: { userId } }),
    prisma.modelUsageDaily.groupBy({
      by: ['modelId'],
      where: { userId },
      _sum: { requestCount: true },
      orderBy: { _sum: { requestCount: 'desc' } },
      take: 1,
    }),
    prisma.modelUsageDaily.aggregate({
      where: { userId },
      _max: { date: true },
    }),
  ]);

  const hasUsage =
    (allTimeAgg._sum.requestCount ?? 0) > 0 ||
    (allTimeAgg._sum.totalTokens ?? BigInt(0)) > BigInt(0);
  if (!hasUsage && runCount === 0) {
    return null;
  }

  const streakRows = dailyTokenRows.map((row) => ({
    date: row.date,
    totalTokens: row._sum.totalTokens ?? BigInt(0),
  }));
  const { currentStreakDays, bestStreakDays } = computeStreaks(streakRows);

  return {
    totalRequests: allTimeAgg._sum.requestCount ?? 0,
    promptTokens: allTimeAgg._sum.inputTokens ?? BigInt(0),
    outputTokens: allTimeAgg._sum.outputTokens ?? BigInt(0),
    totalTokens: allTimeAgg._sum.totalTokens ?? BigInt(0),
    weeklyTokens: weeklyAgg._sum.totalTokens ?? BigInt(0),
    rolling30DayTokens: rollingAgg._sum.totalTokens ?? BigInt(0),
    premiumRequests: allTimeAgg._sum.premiumRequests ?? 0,
    currentStreakDays,
    bestStreakDays,
    workspaceCount: distinctRepos.length,
    sessionCount: runCount,
    topModel: topModelRows[0]?.modelId ?? null,
    lastSyncedAt: latestUsage._max.date,
  };
}

export async function getCanonicalRepoStatsList(
  prisma: PrismaClient,
  userId: string,
  options?: {
    publicOnly?: boolean;
    repoIdentity?: string;
    take?: number;
  }
): Promise<CanonicalRepoStats[]> {
  const publicOnly = options?.publicOnly === true;
  const repoIdentity = options?.repoIdentity;

  const where = {
    userId,
    repoIdentity: repoIdentity ?? { not: '' },
  } satisfies Prisma.ModelUsageDailyWhereInput;

  const [aggRows, rollingRows, visibilityRows, topModelRows] = await Promise.all([
    prisma.modelUsageDaily.groupBy({
      by: ['repoIdentity'],
      where,
      _sum: {
        requestCount: true,
        inputTokens: true,
        outputTokens: true,
        totalTokens: true,
        premiumRequests: true,
      },
      _max: { date: true },
    }),
    prisma.modelUsageDaily.groupBy({
      by: ['repoIdentity'],
      where: {
        ...where,
        date: { gte: getRolling30Start() },
      },
      _sum: { totalTokens: true },
    }),
    prisma.repoVisibilitySettings.findMany({
      where: repoIdentity ? { userId, repoIdentity } : { userId },
      select: { repoIdentity: true, isPublic: true },
    }),
    prisma.$queryRaw<Array<{ repoIdentity: string; modelId: string }>>(
      Prisma.sql`
        WITH ranked AS (
          SELECT
            mud."repoIdentity" AS "repoIdentity",
            mud."modelId" AS "modelId",
            ROW_NUMBER() OVER (
              PARTITION BY mud."repoIdentity"
              ORDER BY SUM(mud."requestCount") DESC, mud."modelId" ASC
            ) AS rn
          FROM "ModelUsageDaily" mud
          WHERE mud."userId" = ${userId}
            AND mud."repoIdentity" <> ''
            ${repoIdentity ? Prisma.sql`AND mud."repoIdentity" = ${repoIdentity}` : Prisma.empty}
          GROUP BY mud."repoIdentity", mud."modelId"
        )
        SELECT "repoIdentity", "modelId"
        FROM ranked
        WHERE rn = 1
      `
    ),
  ]);

  const visibilityMap = new Map(visibilityRows.map((row) => [row.repoIdentity, row.isPublic] as const));
  const rollingMap = new Map(rollingRows.map((row) => [row.repoIdentity, row._sum.totalTokens ?? BigInt(0)] as const));
  const topModelMap = new Map(topModelRows.map((row) => [row.repoIdentity, row.modelId] as const));

  let repos = aggRows
    .flatMap((row) => {
      const identity = row.repoIdentity;
      if (!identity || identity.length === 0) {
        return [];
      }
      const parsed = parseRepoIdentity(identity);
      return [{
        id: identity,
        repoIdentity: identity,
        displayMode: parsed.displayMode,
        githubRepo: parsed.githubRepo,
        aliasLabel: parsed.aliasLabel,
        isPublic: visibilityMap.get(identity) ?? false,
        requests: row._sum.requestCount ?? 0,
        promptTokens: row._sum.inputTokens ?? BigInt(0),
        outputTokens: row._sum.outputTokens ?? BigInt(0),
        totalTokens: row._sum.totalTokens ?? BigInt(0),
        tokens30d: rollingMap.get(identity) ?? BigInt(0),
        premiumReqs: row._sum.premiumRequests ?? 0,
        topModel: topModelMap.get(identity) ?? null,
        lastSyncedAt: row._max.date ?? null,
      } satisfies CanonicalRepoStats];
    })
    .sort((a, b) => {
      if (a.totalTokens === b.totalTokens) return a.repoIdentity.localeCompare(b.repoIdentity);
      return a.totalTokens > b.totalTokens ? -1 : 1;
    });

  if (publicOnly) {
    repos = repos.filter((repo) => repo.isPublic);
  }

  if (typeof options?.take === 'number' && options.take > 0) {
    repos = repos.slice(0, options.take);
  }

  return repos;
}

export async function getCanonicalRepoStatsByIdentity(
  prisma: PrismaClient,
  userId: string,
  repoIdentity: string
): Promise<CanonicalRepoStats | null> {
  const rows = await getCanonicalRepoStatsList(prisma, userId, {
    repoIdentity,
    take: 1,
  });
  return rows[0] ?? null;
}
