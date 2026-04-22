import { NextRequest, NextResponse } from 'next/server';
import { getIdeLeaderboardEntries } from '@/lib/ide-leaderboard-data';
import {
  IDE_LEADERBOARD_PAGE_SIZE,
  normalizeIdeLeaderboardPage,
  normalizeIdeLeaderboardSort,
} from '@/lib/ide-leaderboard';

/**
 * GET /api/leaderboard/ides?sort=tokens|premium|requests&page=1
 */
export async function GET(request: NextRequest) {
  const sort = normalizeIdeLeaderboardSort(request.nextUrl.searchParams.get('sort'));
  const page = normalizeIdeLeaderboardPage(request.nextUrl.searchParams.get('page'));

  const entries = await getIdeLeaderboardEntries({ sort, page });

  return NextResponse.json({
    entries: entries.map((entry) => ({
      rank: entry.rank,
      surface: entry.surface,
      totalTokens: entry.totalTokens.toString(),
      totalRequests: entry.totalRequests,
      premiumRequests: entry.premiumRequests,
      userCount: entry.userCount,
    })),
    sort,
    page,
    pageSize: IDE_LEADERBOARD_PAGE_SIZE,
  });
}
