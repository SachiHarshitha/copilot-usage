import { NextRequest, NextResponse } from 'next/server';
import { getRepoLeaderboardEntries } from '@/lib/repo-leaderboard-data';
import {
  REPO_LEADERBOARD_PAGE_SIZE,
  normalizeRepoLeaderboardPage,
  normalizeRepoLeaderboardSort,
} from '@/lib/repo-leaderboard';

/**
 * GET /api/leaderboard/repos?sort=tokens|tokens30d|premium|requests&page=1
 */
export async function GET(request: NextRequest) {
  const sort = normalizeRepoLeaderboardSort(request.nextUrl.searchParams.get('sort'));
  const page = normalizeRepoLeaderboardPage(request.nextUrl.searchParams.get('page'));

  const entries = await getRepoLeaderboardEntries({ sort, page });

  return NextResponse.json({
    entries: entries.map((entry) => ({
      rank: entry.rank,
      repoSlug: entry.repoSlug,
      totalTokens: entry.totalTokens.toString(),
      tokens30d: entry.tokens30d.toString(),
      totalRequests: entry.totalRequests,
      premiumRequests: entry.premiumRequests,
      contributorCount: entry.contributorCount,
      topUsername: entry.topUsername,
      topAvatarUrl: entry.topAvatarUrl,
    })),
    sort,
    page,
    pageSize: REPO_LEADERBOARD_PAGE_SIZE,
  });
}
