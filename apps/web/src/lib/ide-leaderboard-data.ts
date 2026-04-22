import { prisma } from './db';
import { IDE_LEADERBOARD_PAGE_SIZE, type IdeLeaderboardSort } from './ide-leaderboard';

export interface IdeLeaderboardEntry {
  rank: number;
  surface: string;
  totalTokens: bigint;
  totalRequests: number;
  premiumRequests: number;
  userCount: number;
}

interface IdeLeaderboardRow {
  surface: string;
  total_tokens: bigint;
  total_requests: number;
  premium_requests: number;
  user_count: number;
}

function orderByClause(sort: IdeLeaderboardSort): string {
  switch (sort) {
    case 'premium':
      return 'premium_requests DESC, total_tokens DESC';
    case 'requests':
      return 'total_requests DESC, total_tokens DESC';
    case 'tokens':
    default:
      return 'total_tokens DESC, total_requests DESC';
  }
}

export async function getIdeLeaderboardEntries(options: {
  sort: IdeLeaderboardSort;
  page: number;
}): Promise<IdeLeaderboardEntry[]> {
  const offset = (options.page - 1) * IDE_LEADERBOARD_PAGE_SIZE;
  const orderBy = orderByClause(options.sort);

  const rows = await prisma.$queryRawUnsafe<IdeLeaderboardRow[]>(
    `
      SELECT
        mud.surface,
        SUM(mud."totalTokens")::bigint AS total_tokens,
        SUM(mud."requestCount")::int AS total_requests,
        SUM(mud."premiumRequests")::float AS premium_requests,
        COUNT(DISTINCT mud."userId")::int AS user_count
      FROM "ModelUsageDaily" mud
      JOIN "User" u ON u.id = mud."userId"
      WHERE u."profilePublic" = true
      GROUP BY mud.surface
      ORDER BY ${orderBy}
      LIMIT $1
      OFFSET $2
    `,
    IDE_LEADERBOARD_PAGE_SIZE,
    offset
  );

  return rows.map((row, index) => ({
    rank: offset + index + 1,
    surface: row.surface,
    totalTokens: row.total_tokens,
    totalRequests: row.total_requests,
    premiumRequests: row.premium_requests,
    userCount: row.user_count,
  }));
}
