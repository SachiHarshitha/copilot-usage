export const IDE_LEADERBOARD_PAGE_SIZE = 25;

export type IdeLeaderboardSort = 'tokens' | 'premium' | 'requests';

const IDE_SORTS: IdeLeaderboardSort[] = ['tokens', 'premium', 'requests'];

export function normalizeIdeLeaderboardSort(value: string | null | undefined): IdeLeaderboardSort {
  if (!value) return 'tokens';
  if (IDE_SORTS.includes(value as IdeLeaderboardSort)) {
    return value as IdeLeaderboardSort;
  }
  return 'tokens';
}

export function normalizeIdeLeaderboardPage(value: string | null | undefined): number {
  const page = Number.parseInt(value || '1', 10);
  if (!Number.isFinite(page) || page < 1) {
    return 1;
  }
  return page;
}

export function buildIdeLeaderboardHref(options: { page: number; sort: IdeLeaderboardSort }): string {
  const params = new URLSearchParams();
  if (options.page > 1) params.set('page', String(options.page));
  if (options.sort !== 'tokens') params.set('sort', options.sort);
  const suffix = params.toString();
  return `/leaderboard/ides${suffix ? `?${suffix}` : ''}`;
}

export function formatSurfaceLabel(surface: string): string {
  switch (surface) {
    case 'vscode':
      return 'VS Code';
    case 'jetbrains':
      return 'JetBrains';
    case 'terminal':
      return 'Terminal';
    case 'browser':
      return 'Browser';
    case 'github':
      return 'GitHub';
    case 'cloud':
      return 'Cloud';
    default:
      return surface ? surface.charAt(0).toUpperCase() + surface.slice(1) : 'Unknown';
  }
}
