import Link from 'next/link';
import { getIdeLeaderboardEntries } from '@/lib/ide-leaderboard-data';
import {
  IDE_LEADERBOARD_PAGE_SIZE,
  buildIdeLeaderboardHref,
  formatSurfaceLabel,
  normalizeIdeLeaderboardPage,
  normalizeIdeLeaderboardSort,
  type IdeLeaderboardSort,
} from '@/lib/ide-leaderboard';

interface SearchParams {
  sort?: string;
  page?: string;
}

export default async function IdeLeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const sort = normalizeIdeLeaderboardSort(params.sort);
  const page = normalizeIdeLeaderboardPage(params.page);

  const entries = await getIdeLeaderboardEntries({ sort, page });

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-2">IDE Ranking</h1>
      <p className="text-sm text-[#8b949e] mb-6">
        Public surfaces ranked by coding-agent usage across all public profiles.
      </p>

      <div className="flex gap-3 mb-6 flex-wrap">
        <Link
          href="/leaderboard"
          className="text-sm border border-[#30363d] text-[#8b949e] px-3 py-1 rounded-md no-underline hover:border-[#8b949e] hover:text-white"
        >
          User Leaderboard
        </Link>
        <Link
          href="/leaderboard/repos"
          className="text-sm border border-[#30363d] text-[#8b949e] px-3 py-1 rounded-md no-underline hover:border-[#8b949e] hover:text-white"
        >
          Repo Leaderboard
        </Link>
      </div>

      <div className="flex gap-3 mb-6 flex-wrap">
        <FilterLink sort={sort} activeSort="tokens" label="By Tokens" />
        <FilterLink sort={sort} activeSort="premium" label="By Premium" />
        <FilterLink sort={sort} activeSort="requests" label="By Requests" />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#30363d] text-[#8b949e]">
              <th className="text-left py-3 px-2 w-12">#</th>
              <th className="text-left py-3 px-2">IDE / Surface</th>
              <th className="text-right py-3 px-2">Total Tokens</th>
              <th className="text-right py-3 px-2">Premium Reqs</th>
              <th className="text-right py-3 px-2">Requests</th>
              <th className="text-right py-3 px-2">Public Users</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr>
                <td colSpan={6} className="py-12 text-center text-[#8b949e]">
                  No public usage data yet.
                </td>
              </tr>
            )}
            {entries.map((entry) => (
              <tr key={`${entry.rank}-${entry.surface}`} className="border-b border-[#21262d] hover:bg-[#161b22]">
                <td className="py-3 px-2 text-[#8b949e]">{entry.rank}</td>
                <td className="py-3 px-2 text-white font-medium">{formatSurfaceLabel(entry.surface)}</td>
                <td className="py-3 px-2 text-right font-mono">{Number(entry.totalTokens).toLocaleString()}</td>
                <td className="py-3 px-2 text-right font-mono">{entry.premiumRequests.toFixed(1)}</td>
                <td className="py-3 px-2 text-right font-mono">{entry.totalRequests.toLocaleString()}</td>
                <td className="py-3 px-2 text-right font-mono">{entry.userCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex gap-3 mt-6 justify-center">
        {page > 1 && (
          <Link
            href={buildIdeLeaderboardHref({ page: page - 1, sort })}
            className="text-sm border border-[#30363d] px-3 py-1.5 rounded-md no-underline hover:border-[#8b949e]"
          >
            ← Previous
          </Link>
        )}
        {entries.length === IDE_LEADERBOARD_PAGE_SIZE && (
          <Link
            href={buildIdeLeaderboardHref({ page: page + 1, sort })}
            className="text-sm border border-[#30363d] px-3 py-1.5 rounded-md no-underline hover:border-[#8b949e]"
          >
            Next →
          </Link>
        )}
      </div>
    </div>
  );
}

function FilterLink({
  sort,
  activeSort,
  label,
}: {
  sort: IdeLeaderboardSort;
  activeSort: IdeLeaderboardSort;
  label: string;
}) {
  const href = buildIdeLeaderboardHref({ page: 1, sort: activeSort });

  return (
    <Link
      href={href}
      className={`text-sm px-3 py-1 rounded-md no-underline ${
        sort === activeSort
          ? 'bg-brand-600 text-white'
          : 'border border-[#30363d] text-[#8b949e] hover:border-[#8b949e] hover:text-white'
      }`}
    >
      {label}
    </Link>
  );
}
