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
import { getDictionary } from '@/lib/i18n/dictionary';
import { getRequestLocale } from '@/lib/i18n/server';

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
  const locale = await getRequestLocale();
  const dictionary = getDictionary(locale);
  const numberFormatter = new Intl.NumberFormat(locale);
  const sort = normalizeIdeLeaderboardSort(params.sort);
  const page = normalizeIdeLeaderboardPage(params.page);

  const entries = await getIdeLeaderboardEntries({ sort, page });

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-2">{dictionary.ideLeaderboard.title}</h1>
      <p className="text-sm text-[#8b949e] mb-6">
        {dictionary.ideLeaderboard.subtitle}
      </p>

      <div className="flex gap-3 mb-6 flex-wrap">
        <Link
          href="/leaderboard"
          className="text-sm border border-[#30363d] text-[#8b949e] px-3 py-1 rounded-md no-underline hover:border-[#8b949e] hover:text-white"
        >
          {dictionary.ideLeaderboard.userLeaderboard}
        </Link>
        <Link
          href="/leaderboard/repos"
          className="text-sm border border-[#30363d] text-[#8b949e] px-3 py-1 rounded-md no-underline hover:border-[#8b949e] hover:text-white"
        >
          {dictionary.ideLeaderboard.repoLeaderboard}
        </Link>
      </div>

      <div className="flex gap-3 mb-6 flex-wrap">
        <FilterLink sort={sort} activeSort="tokens" label={dictionary.ideLeaderboard.byTokens} />
        <FilterLink sort={sort} activeSort="premium" label={dictionary.ideLeaderboard.byPremium} />
        <FilterLink sort={sort} activeSort="requests" label={dictionary.ideLeaderboard.byRequests} />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#30363d] text-[#8b949e]">
              <th className="text-left py-3 px-2 w-12">#</th>
              <th className="text-left py-3 px-2">{dictionary.ideLeaderboard.colSurface}</th>
              <th className="text-right py-3 px-2">{dictionary.ideLeaderboard.colTotalTokens}</th>
              <th className="text-right py-3 px-2">{dictionary.ideLeaderboard.colPremiumReqs}</th>
              <th className="text-right py-3 px-2">{dictionary.ideLeaderboard.colRequests}</th>
              <th className="text-right py-3 px-2">{dictionary.ideLeaderboard.colPublicUsers}</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr>
                <td colSpan={6} className="py-12 text-center text-[#8b949e]">
                  {dictionary.ideLeaderboard.empty}
                </td>
              </tr>
            )}
            {entries.map((entry) => (
              <tr key={`${entry.rank}-${entry.surface}`} className="border-b border-[#21262d] hover:bg-[#161b22]">
                <td className="py-3 px-2 text-[#8b949e]">{entry.rank}</td>
                <td className="py-3 px-2 text-white font-medium">{formatSurfaceLabel(entry.surface)}</td>
                <td className="py-3 px-2 text-right font-mono">{numberFormatter.format(Number(entry.totalTokens))}</td>
                <td className="py-3 px-2 text-right font-mono">{entry.premiumRequests.toFixed(1)}</td>
                <td className="py-3 px-2 text-right font-mono">{numberFormatter.format(entry.totalRequests)}</td>
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
            {dictionary.ideLeaderboard.prev}
          </Link>
        )}
        {entries.length === IDE_LEADERBOARD_PAGE_SIZE && (
          <Link
            href={buildIdeLeaderboardHref({ page: page + 1, sort })}
            className="text-sm border border-[#30363d] px-3 py-1.5 rounded-md no-underline hover:border-[#8b949e]"
          >
            {dictionary.ideLeaderboard.next}
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
