import { prisma } from '@/lib/db';
import Link from 'next/link';

interface SearchParams {
  sort?: string;
  since?: string;
  page?: string;
}

const PAGE_SIZE = 25;

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const sort = params.sort === 'premium' ? 'premium' : 'tokens';
  const since = params.since; // '7d' | '30d' | undefined (all-time)
  const page = Math.max(1, parseInt(params.page || '1', 10));

  let entries: {
    userId: string;
    username: string;
    avatarUrl: string | null;
    totalTokens: bigint;
    premiumRequests: number;
    totalRequests: number;
    topModel: string | null;
    workspaceCount: number;
    currentStreakDays: number;
  }[] = [];

  if (!since) {
    // All-time: read from UserStat (fast indexed)
    const stats = await prisma.userStat.findMany({
      where: {
        user: { profilePublic: true },
      },
      include: { user: true },
      orderBy: sort === 'premium' ? { premiumRequests: 'desc' } : { totalTokens: 'desc' },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    });

    entries = stats.map((s) => ({
      userId: s.userId,
      username: s.user.username,
      avatarUrl: s.user.avatarUrl,
      totalTokens: s.totalTokens,
      premiumRequests: s.premiumRequests,
      totalRequests: s.totalRequests,
      topModel: s.topModel,
      workspaceCount: s.workspaceCount,
        currentStreakDays: s.currentStreakDays,
    }));
  } else {
    // Date-filtered: aggregate UsageDaily
    const days = since === '7d' ? 7 : 30;
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);

    const rows = await prisma.$queryRaw<
      {
        userId: string;
        totalTokens: bigint;
        premiumRequests: number;
        totalRequests: number;
      }[]
    >`
      SELECT ud."userId",
             SUM(ud."totalTokens")::bigint AS "totalTokens",
             SUM(ud."premiumRequests")::float AS "premiumRequests",
             SUM(ud."totalRequests")::int AS "totalRequests"
      FROM "UsageDaily" ud
      JOIN "User" u ON u.id = ud."userId"
      WHERE u."profilePublic" = true
        AND ud.date >= ${sinceDate}
      GROUP BY ud."userId"
      ORDER BY ${sort === 'premium' ? `"premiumRequests"` : `"totalTokens"`} DESC
      LIMIT ${PAGE_SIZE}
      OFFSET ${(page - 1) * PAGE_SIZE}
    `;

    const userIds = rows.map((r) => r.userId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      include: { userStat: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    entries = rows.map((r) => {
      const user = userMap.get(r.userId);
      return {
        userId: r.userId,
        username: user?.username || 'unknown',
        avatarUrl: user?.avatarUrl || null,
        totalTokens: r.totalTokens,
        premiumRequests: r.premiumRequests,
        totalRequests: r.totalRequests,
        topModel: user?.userStat?.topModel || null,
        workspaceCount: user?.userStat?.workspaceCount || 0,
        currentStreakDays: user?.userStat?.currentStreakDays || 0,
      };
    });
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Leaderboard</h1>

      <div className="flex gap-3 mb-4 flex-wrap">
        <Link
          href="/leaderboard/repos"
          className="text-sm border border-[#30363d] text-[#8b949e] px-3 py-1 rounded-md no-underline hover:border-[#8b949e] hover:text-white"
        >
          Repo Leaderboard
        </Link>
        <Link
          href="/leaderboard/ides"
          className="text-sm border border-[#30363d] text-[#8b949e] px-3 py-1 rounded-md no-underline hover:border-[#8b949e] hover:text-white"
        >
          IDE Ranking
        </Link>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <FilterLink href="/leaderboard" active={!since} label="All Time" />
        <FilterLink href={`/leaderboard?since=30d&sort=${sort}`} active={since === '30d'} label="Last 30 Days" />
        <FilterLink href={`/leaderboard?since=7d&sort=${sort}`} active={since === '7d'} label="Last 7 Days" />
        <span className="text-[#30363d]">|</span>
        <FilterLink href={`/leaderboard?sort=tokens${since ? `&since=${since}` : ''}`} active={sort === 'tokens'} label="By Tokens" />
        <FilterLink href={`/leaderboard?sort=premium${since ? `&since=${since}` : ''}`} active={sort === 'premium'} label="By Premium" />
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#30363d] text-[#8b949e]">
              <th className="text-left py-3 px-2 w-12">#</th>
              <th className="text-left py-3 px-2">User</th>
              <th className="text-left py-3 px-2">Rank</th>
              <th className="text-right py-3 px-2">Total Tokens</th>
              <th className="text-right py-3 px-2">Streak</th>
              <th className="text-right py-3 px-2">Premium Reqs</th>
              <th className="text-right py-3 px-2">Requests</th>
              <th className="text-right py-3 px-2">Top Model</th>
              <th className="text-right py-3 px-2">Workspaces</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr>
                <td colSpan={9} className="py-12 text-center text-[#8b949e]">
                  No public users yet. Be the first to share your stats!
                </td>
              </tr>
            )}
            {entries.map((e, i) => (
              <tr key={e.userId} className="border-b border-[#21262d] hover:bg-[#161b22]">
                <td className="py-3 px-2 text-[#8b949e]">{(page - 1) * PAGE_SIZE + i + 1}</td>
                <td className="py-3 px-2">
                  <Link href={`/u/${e.username}`} className="flex items-center gap-2 no-underline">
                    {e.avatarUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={e.avatarUrl} alt="" className="w-6 h-6 rounded-full" />
                    )}
                    <span className="text-white font-medium">{e.username}</span>
                  </Link>
                </td>
                <td className="py-3 px-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/badges/${e.username}/rank.svg`} alt={`${e.username} rank`} className="h-7 w-auto" />
                </td>
                <td className="py-3 px-2 text-right font-mono">{Number(e.totalTokens).toLocaleString()}</td>
                <td className="py-3 px-2 text-right font-mono">🔥 {e.currentStreakDays}</td>
                <td className="py-3 px-2 text-right font-mono">{e.premiumRequests.toFixed(1)}</td>
                <td className="py-3 px-2 text-right font-mono">{e.totalRequests.toLocaleString()}</td>
                <td className="py-3 px-2 text-right text-[#8b949e]">{e.topModel || '–'}</td>
                <td className="py-3 px-2 text-right">{e.workspaceCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex gap-3 mt-6 justify-center">
        {page > 1 && (
          <Link
            href={`/leaderboard?page=${page - 1}${sort !== 'tokens' ? `&sort=${sort}` : ''}${since ? `&since=${since}` : ''}`}
            className="text-sm border border-[#30363d] px-3 py-1.5 rounded-md no-underline hover:border-[#8b949e]"
          >
            ← Previous
          </Link>
        )}
        {entries.length === PAGE_SIZE && (
          <Link
            href={`/leaderboard?page=${page + 1}${sort !== 'tokens' ? `&sort=${sort}` : ''}${since ? `&since=${since}` : ''}`}
            className="text-sm border border-[#30363d] px-3 py-1.5 rounded-md no-underline hover:border-[#8b949e]"
          >
            Next →
          </Link>
        )}
      </div>
    </div>
  );
}

function FilterLink({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={`text-sm px-3 py-1 rounded-md no-underline ${
        active
          ? 'bg-brand-600 text-white'
          : 'border border-[#30363d] text-[#8b949e] hover:border-[#8b949e] hover:text-white'
      }`}
    >
      {label}
    </Link>
  );
}
