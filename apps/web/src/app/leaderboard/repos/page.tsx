import Link from 'next/link';
import { getRepoLeaderboardEntries } from '@/lib/repo-leaderboard-data';
import {
  REPO_LEADERBOARD_PAGE_SIZE,
  buildRepoLeaderboardHref,
  normalizeRepoLeaderboardPage,
  normalizeRepoLeaderboardSort,
  type RepoLeaderboardSort,
} from '@/lib/repo-leaderboard';

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
  const sort = normalizeRepoLeaderboardSort(params.sort);
  const page = normalizeRepoLeaderboardPage(params.page);

  const entries = await getRepoLeaderboardEntries({ sort, page });

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-2">Repo Leaderboard</h1>
      <p className="text-sm text-[#8b949e] mb-6">
        Public repositories ranked by cumulative Copilot usage from opt-in profiles.
      </p>

      <div className="flex gap-3 mb-6 flex-wrap">
        <FilterLink sort={sort} activeSort="tokens" label="By Tokens" />
        <FilterLink sort={sort} activeSort="tokens30d" label="By 30d Tokens" />
        <FilterLink sort={sort} activeSort="premium" label="By Premium" />
        <FilterLink sort={sort} activeSort="requests" label="By Requests" />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#30363d] text-[#8b949e]">
              <th className="text-left py-3 px-2 w-12">#</th>
              <th className="text-left py-3 px-2">Repo</th>
              <th className="text-left py-3 px-2">Repo Rank</th>
              <th className="text-right py-3 px-2">Total Tokens</th>
              <th className="text-right py-3 px-2">30d Tokens</th>
              <th className="text-right py-3 px-2">Premium Reqs</th>
              <th className="text-right py-3 px-2">Requests</th>
              <th className="text-right py-3 px-2">Contributors</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr>
                <td colSpan={8} className="py-12 text-center text-[#8b949e]">
                  No public repositories yet.
                </td>
              </tr>
            )}
            {entries.map((entry) => {
              const [owner, repo] = entry.repoSlug.split('/');
              const repoHref = entry.topUsername ? `/r/${entry.topUsername}/${entry.repoSlug}` : null;
              const rankBadgeUrl = `/api/badges/repo/${owner}/${repo}/leaderboard.svg`;

              return (
                <tr key={`${entry.rank}-${entry.repoSlug}`} className="border-b border-[#21262d] hover:bg-[#161b22]">
                  <td className="py-3 px-2 text-[#8b949e]">{entry.rank}</td>
                  <td className="py-3 px-2">
                    <div className="flex items-center gap-2">
                      {entry.topAvatarUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={entry.topAvatarUrl} alt="" className="w-6 h-6 rounded-full" />
                      )}
                      {repoHref ? (
                        <Link href={repoHref} className="text-white font-medium no-underline hover:underline">
                          {entry.repoSlug}
                        </Link>
                      ) : (
                        <span className="text-white font-medium">{entry.repoSlug}</span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={rankBadgeUrl} alt={`${entry.repoSlug} rank`} className="h-7 w-auto" />
                  </td>
                  <td className="py-3 px-2 text-right font-mono">{Number(entry.totalTokens).toLocaleString()}</td>
                  <td className="py-3 px-2 text-right font-mono">{Number(entry.tokens30d).toLocaleString()}</td>
                  <td className="py-3 px-2 text-right font-mono">{entry.premiumRequests.toFixed(1)}</td>
                  <td className="py-3 px-2 text-right font-mono">{entry.totalRequests.toLocaleString()}</td>
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
            className="text-sm border border-[#30363d] px-3 py-1.5 rounded-md no-underline hover:border-[#8b949e]"
          >
            ← Previous
          </Link>
        )}
        {entries.length === REPO_LEADERBOARD_PAGE_SIZE && (
          <Link
            href={buildRepoLeaderboardHref({ page: page + 1, sort })}
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
          : 'border border-[#30363d] text-[#8b949e] hover:border-[#8b949e] hover:text-white'
      }`}
    >
      {label}
    </Link>
  );
}
