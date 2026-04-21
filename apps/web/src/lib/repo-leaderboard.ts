export const REPO_LEADERBOARD_PAGE_SIZE = 25;

export type RepoLeaderboardSort = 'tokens' | 'tokens30d' | 'premium' | 'requests';

const REPO_SORTS: RepoLeaderboardSort[] = ['tokens', 'tokens30d', 'premium', 'requests'];

export function normalizeRepoLeaderboardSort(value: string | null | undefined): RepoLeaderboardSort {
  if (!value) return 'tokens';
  if (REPO_SORTS.includes(value as RepoLeaderboardSort)) {
    return value as RepoLeaderboardSort;
  }
  return 'tokens';
}

export function normalizeRepoLeaderboardPage(value: string | null | undefined): number {
  const page = Number.parseInt(value || '1', 10);
  if (!Number.isFinite(page) || page < 1) {
    return 1;
  }
  return page;
}

export function buildRepoLeaderboardHref(options: {
  page: number;
  sort: RepoLeaderboardSort;
}): string {
  const params = new URLSearchParams();
  if (options.page > 1) params.set('page', String(options.page));
  if (options.sort !== 'tokens') params.set('sort', options.sort);
  const suffix = params.toString();
  return `/leaderboard/repos${suffix ? `?${suffix}` : ''}`;
}
