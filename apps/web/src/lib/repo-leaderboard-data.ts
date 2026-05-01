import { Prisma, type PrismaClient } from '@prisma/client';

import { prisma as defaultPrisma } from './db';
import { userVisibleForFeatureSql } from './policy/userLifecycle';
import { REPO_LEADERBOARD_PAGE_SIZE, type RepoLeaderboardSort } from './repo-leaderboard';

export interface RepoLeaderboardEntry {
  rank: number;
  repoSlug: string;
  totalTokens: bigint;
  tokens30d: bigint;
  totalRequests: number;
  premiumRequests: number;
  contributorCount: number;
  topUsername: string | null;
  topAvatarUrl: string | null;
}

interface RepoLeaderboardRow {
  repo_slug: string;
  total_tokens: bigint;
  tokens_30d: bigint;
  total_requests: number;
  premium_reqs: number;
  contributor_count: number;
  top_username: string | null;
  top_avatar_url: string | null;
}

function assertUnreachable(value: never): never {
  throw new Error(`Unhandled repo leaderboard sort value: ${String(value)}`);
}

function orderByClause(sort: RepoLeaderboardSort): Prisma.Sql {
  switch (sort) {
    case 'premium':
      return Prisma.raw('premium_reqs DESC, total_tokens DESC');
    case 'requests':
      return Prisma.raw('total_requests DESC, total_tokens DESC');
    case 'tokens30d':
      return Prisma.raw('tokens_30d DESC, total_tokens DESC');
    case 'tokens':
      return Prisma.raw('total_tokens DESC, tokens_30d DESC');
  }

  return assertUnreachable(sort);
}

export async function getRepoLeaderboardEntries(
  options: {
    sort: RepoLeaderboardSort;
    page: number;
  },
  prisma: PrismaClient = defaultPrisma,
): Promise<RepoLeaderboardEntry[]> {
  const offset = (options.page - 1) * REPO_LEADERBOARD_PAGE_SIZE;
  const orderBy = orderByClause(options.sort);

  const rows = await prisma.$queryRaw<RepoLeaderboardRow[]>(
    Prisma.sql`
      WITH public_repo_stats AS (
        SELECT
          rs."githubRepo" AS repo_slug,
          rs."userId" AS user_id,
          rs."totalTokens" AS total_tokens,
          rs."tokens30d" AS tokens_30d,
          rs."requests" AS total_requests,
          rs."premiumReqs" AS premium_reqs
        FROM "RepoStat" rs
        JOIN "User" u ON u.id = rs."userId"
        WHERE rs."isPublic" = true
          AND rs."githubRepo" IS NOT NULL
          AND ${userVisibleForFeatureSql('u', 'leaderboard')}
      ),
      repo_totals AS (
        SELECT
          repo_slug,
          SUM(total_tokens)::bigint AS total_tokens,
          SUM(tokens_30d)::bigint AS tokens_30d,
          SUM(total_requests)::int AS total_requests,
          SUM(premium_reqs)::float AS premium_reqs,
          COUNT(*)::int AS contributor_count
        FROM public_repo_stats
        GROUP BY repo_slug
      ),
      top_contributor AS (
        SELECT
          prs.repo_slug,
          u.username AS top_username,
          u."avatarUrl" AS top_avatar_url,
          ROW_NUMBER() OVER (
            PARTITION BY prs.repo_slug
            ORDER BY prs.total_tokens DESC, prs.tokens_30d DESC, prs.user_id ASC
          ) AS contributor_rank
        FROM public_repo_stats prs
        JOIN "User" u ON u.id = prs.user_id
      )
      SELECT
        rt.repo_slug,
        rt.total_tokens,
        rt.tokens_30d,
        rt.total_requests,
        rt.premium_reqs,
        rt.contributor_count,
        tc.top_username,
        tc.top_avatar_url
      FROM repo_totals rt
      LEFT JOIN top_contributor tc
        ON tc.repo_slug = rt.repo_slug
       AND tc.contributor_rank = 1
      ORDER BY ${orderBy}
      LIMIT ${REPO_LEADERBOARD_PAGE_SIZE}
      OFFSET ${offset}
    `
  );

  return rows.map((row, index) => ({
    rank: offset + index + 1,
    repoSlug: row.repo_slug,
    totalTokens: row.total_tokens,
    tokens30d: row.tokens_30d,
    totalRequests: row.total_requests,
    premiumRequests: row.premium_reqs,
    contributorCount: row.contributor_count,
    topUsername: row.top_username,
    topAvatarUrl: row.top_avatar_url,
  }));
}
