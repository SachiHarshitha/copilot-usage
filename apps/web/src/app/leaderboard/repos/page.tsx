import Link from 'next/link';
import Image from 'next/image';
import { getRepoLeaderboardEntries } from '@/lib/repo-leaderboard-data';
import {
  REPO_LEADERBOARD_PAGE_SIZE,
  buildRepoLeaderboardHref,
  normalizeRepoLeaderboardPage,
  normalizeRepoLeaderboardSort,
  type RepoLeaderboardSort,
} from '@/lib/repo-leaderboard';
import { getAllowedAvatarUrl } from '@/lib/profile-menu';
import { getDictionary } from '@/lib/i18n/dictionary';
import { getRequestLocale } from '@/lib/i18n/server';

interface SearchParams {
  sort?: string;
  page?: string;
}

export default async function RepoLeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const locale = await getRequestLocale();
  const dictionary = getDictionary(locale);
  const numberFormatter = new Intl.NumberFormat(locale);
  const sort = normalizeRepoLeaderboardSort(params.sort);
  const page = normalizeRepoLeaderboardPage(params.page);

  const entries = await getRepoLeaderboardEntries({ sort, page });

  return (
    <div>
      <h1 className="text-2xl font-bold text-[var(--foreground)] mb-2">{dictionary.repoLeaderboard.title}</h1>
      <p className="text-sm text-[var(--text-secondary)] mb-6">
        {dictionary.repoLeaderboard.subtitle}
      </p>

      <div className="flex gap-3 mb-4 flex-wrap">
        <Link
          href="/leaderboard"
          className="text-sm border border-[var(--card-border)] text-[var(--text-secondary)] px-3 py-1 rounded-md no-underline hover:border-[var(--text-secondary)] hover:text-[var(--foreground)]"
        >
          {dictionary.repoLeaderboard.userLeaderboard}
        </Link>
        <Link
          href="/leaderboard/ides"
          className="text-sm border border-[var(--card-border)] text-[var(--text-secondary)] px-3 py-1 rounded-md no-underline hover:border-[var(--text-secondary)] hover:text-[var(--foreground)]"
        >
          {dictionary.repoLeaderboard.ideRanking}
        </Link>
      </div>

      <div className="flex gap-3 mb-6 flex-wrap">
        <FilterLink sort={sort} activeSort="tokens" label={dictionary.repoLeaderboard.byTokens} />
        <FilterLink sort={sort} activeSort="tokens30d" label={dictionary.repoLeaderboard.by30dTokens} />
        <FilterLink sort={sort} activeSort="premium" label={dictionary.repoLeaderboard.byPremium} />
        <FilterLink sort={sort} activeSort="requests" label={dictionary.repoLeaderboard.byRequests} />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--card-border)] text-[var(--text-secondary)]">
              <th className="text-left py-3 px-2 w-12">#</th>
              <th className="text-left py-3 px-2">{dictionary.repoLeaderboard.colRepo}</th>
              <th className="text-left py-3 px-2">{dictionary.repoLeaderboard.colRepoRank}</th>
              <th className="text-right py-3 px-2">{dictionary.repoLeaderboard.colTotalTokens}</th>
              <th className="text-right py-3 px-2">{dictionary.repoLeaderboard.col30dTokens}</th>
              <th className="text-right py-3 px-2">{dictionary.repoLeaderboard.colPremiumReqs}</th>
              <th className="text-right py-3 px-2">{dictionary.repoLeaderboard.colRequests}</th>
              <th className="text-right py-3 px-2">{dictionary.repoLeaderboard.colContributors}</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr>
                <td colSpan={8} className="py-12 text-center text-[var(--text-secondary)]">
                  {dictionary.repoLeaderboard.empty}
                </td>
              </tr>
            )}
            {entries.map((entry) => {
              const [owner, repo] = entry.repoSlug.split('/');
              const repoHref = entry.topUsername ? `/r/${entry.topUsername}/${entry.repoSlug}` : null;
              const rankBadgeUrl = `/api/badges/repo/${owner}/${repo}/leaderboard.svg`;
              const safeAvatarUrl = getAllowedAvatarUrl(entry.topAvatarUrl);

              return (
                <tr key={`${entry.rank}-${entry.repoSlug}`} className="border-b border-[var(--surface-hover)] hover:bg-[var(--surface-elevated)]">
                  <td className="py-3 px-2 text-[var(--text-secondary)]">{entry.rank}</td>
                  <td className="py-3 px-2">
                    <div className="flex items-center gap-2">
                      {safeAvatarUrl && (
                        <Image src={safeAvatarUrl} alt="" width={24} height={24} className="w-6 h-6 rounded-full" />
                      )}
                      {repoHref ? (
                        <Link href={repoHref} className="text-[var(--foreground)] font-medium no-underline hover:underline">
                          {entry.repoSlug}
                        </Link>
                      ) : (
                        <span className="text-[var(--foreground)] font-medium">{entry.repoSlug}</span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={rankBadgeUrl} alt={`${entry.repoSlug} rank`} className="h-7 w-auto" />
                  </td>
                  <td className="py-3 px-2 text-right font-mono">{numberFormatter.format(Number(entry.totalTokens))}</td>
                  <td className="py-3 px-2 text-right font-mono">{numberFormatter.format(Number(entry.tokens30d))}</td>
                  <td className="py-3 px-2 text-right font-mono">{entry.premiumRequests.toFixed(1)}</td>
                  <td className="py-3 px-2 text-right font-mono">{numberFormatter.format(entry.totalRequests)}</td>
                  <td className="py-3 px-2 text-right font-mono">{entry.contributorCount}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex gap-3 mt-6 justify-center">
        {page > 1 && (
          <Link
            href={buildRepoLeaderboardHref({ page: page - 1, sort })}
            className="text-sm border border-[var(--card-border)] px-3 py-1.5 rounded-md no-underline hover:border-[var(--text-secondary)]"
          >
            {dictionary.repoLeaderboard.prev}
          </Link>
        )}
        {entries.length === REPO_LEADERBOARD_PAGE_SIZE && (
          <Link
            href={buildRepoLeaderboardHref({ page: page + 1, sort })}
            className="text-sm border border-[var(--card-border)] px-3 py-1.5 rounded-md no-underline hover:border-[var(--text-secondary)]"
          >
            {dictionary.repoLeaderboard.next}
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
  sort: RepoLeaderboardSort;
  activeSort: RepoLeaderboardSort;
  label: string;
}) {
  const href = buildRepoLeaderboardHref({ page: 1, sort: activeSort });

  return (
    <Link
      href={href}
      className={`text-sm px-3 py-1 rounded-md no-underline ${
        sort === activeSort
          ? 'bg-brand-600 text-white'
          : 'border border-[var(--card-border)] text-[var(--text-secondary)] hover:border-[var(--text-secondary)] hover:text-[var(--foreground)]'
      }`}
    >
      {label}
    </Link>
  );
}
