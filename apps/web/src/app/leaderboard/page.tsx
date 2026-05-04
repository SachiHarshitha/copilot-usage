import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getCanonicalUserStats } from '@/lib/canonical-stats';
import { getUserLeaderboardAllTime } from '@/lib/leaderboard/getUserLeaderboardAllTime';
import Link from 'next/link';
import Image from 'next/image';
import { getAllowedAvatarUrl } from '@/lib/profile-menu';
import {
  userVisibleForFeatureSql,
} from '@/lib/policy/userLifecycle';
import { getDictionary } from '@/lib/i18n/dictionary';
import { getRequestLocale } from '@/lib/i18n/server';

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
  const locale = await getRequestLocale();
  const dictionary = getDictionary(locale);
  const numberFormatter = new Intl.NumberFormat(locale);
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
    const stats = await getUserLeaderboardAllTime({ sort, page }, prisma);
    entries = stats.map((s) => ({
      userId: s.userId,
      username: s.username,
      avatarUrl: s.avatarUrl,
      totalTokens: BigInt(s.totalTokens),
      premiumRequests: s.premiumRequests,
      totalRequests: s.totalRequests,
      topModel: s.topModel,
      workspaceCount: s.workspaceCount,
      currentStreakDays: s.currentStreakDays,
    }));
  } else {
    // Date-filtered: aggregate canonical ModelUsageDaily
    const days = since === '7d' ? 7 : 30;
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);
    const orderBy =
      sort === 'premium'
        ? Prisma.raw('"premiumRequests" DESC, "totalTokens" DESC, "userId" ASC')
        : Prisma.raw('"totalTokens" DESC, "premiumRequests" DESC, "userId" ASC');

    const rows = await prisma.$queryRaw<
      {
        userId: string;
        totalTokens: bigint;
        premiumRequests: number;
        totalRequests: number;
      }[]
    >(Prisma.sql`
      SELECT u.id AS "userId",
             COALESCE(SUM(mud."totalTokens"), 0)::bigint AS "totalTokens",
             COALESCE(SUM(mud."premiumRequests"), 0)::float AS "premiumRequests",
             COALESCE(SUM(mud."requestCount"), 0)::int AS "totalRequests"
      FROM "User" u
      LEFT JOIN "ModelUsageDaily" mud
        ON mud."userId" = u.id
       AND mud."date" >= ${sinceDate}
      WHERE ${userVisibleForFeatureSql('u', 'leaderboard')}
      GROUP BY u.id
      ORDER BY ${orderBy}
      LIMIT ${PAGE_SIZE}
      OFFSET ${(page - 1) * PAGE_SIZE}
    `);

    const userIds = rows.map((r) => r.userId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, username: true, avatarUrl: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));
    const userStats = await Promise.all(rows.map((r) => getCanonicalUserStats(prisma, r.userId)));
    const statsByUser = new Map(rows.map((r, index) => [r.userId, userStats[index]] as const));

    entries = rows.map((r) => {
      const user = userMap.get(r.userId);
      const stats = statsByUser.get(r.userId);
      return {
        userId: r.userId,
        username: user?.username || 'unknown',
        avatarUrl: user?.avatarUrl || null,
        totalTokens: r.totalTokens,
        premiumRequests: r.premiumRequests,
        totalRequests: r.totalRequests,
        topModel: stats?.topModel || null,
        workspaceCount: stats?.workspaceCount || 0,
        currentStreakDays: stats?.currentStreakDays || 0,
      };
    });
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-[var(--foreground)] mb-6">{dictionary.leaderboard.title}</h1>

      <div className="flex gap-3 mb-4 flex-wrap">
        <Link
          href="/leaderboard/repos"
          className="text-sm border border-[var(--card-border)] text-[var(--text-secondary)] px-3 py-1 rounded-md no-underline hover:border-[var(--text-secondary)] hover:text-[var(--foreground)]"
        >
          {dictionary.leaderboard.repoLeaderboard}
        </Link>
        <Link
          href="/leaderboard/ides"
          className="text-sm border border-[var(--card-border)] text-[var(--text-secondary)] px-3 py-1 rounded-md no-underline hover:border-[var(--text-secondary)] hover:text-[var(--foreground)]"
        >
          {dictionary.leaderboard.ideRanking}
        </Link>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <FilterLink href="/leaderboard" active={!since} label={dictionary.leaderboard.allTime} />
        <FilterLink href={`/leaderboard?since=30d&sort=${sort}`} active={since === '30d'} label={dictionary.leaderboard.last30d} />
        <FilterLink href={`/leaderboard?since=7d&sort=${sort}`} active={since === '7d'} label={dictionary.leaderboard.last7d} />
        <span className="text-[var(--card-border)]">|</span>
        <FilterLink href={`/leaderboard?sort=tokens${since ? `&since=${since}` : ''}`} active={sort === 'tokens'} label={dictionary.leaderboard.byTokens} />
        <FilterLink href={`/leaderboard?sort=premium${since ? `&since=${since}` : ''}`} active={sort === 'premium'} label={dictionary.leaderboard.byPremium} />
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--card-border)] text-[var(--text-secondary)]">
              <th className="text-left py-3 px-2 w-12">#</th>
              <th className="text-left py-3 px-2">{dictionary.leaderboard.colUser}</th>
              <th className="text-left py-3 px-2">{dictionary.leaderboard.colRank}</th>
              <th className="text-right py-3 px-2">{dictionary.leaderboard.colTotalTokens}</th>
              <th className="text-right py-3 px-2">{dictionary.leaderboard.colStreak}</th>
              <th className="text-right py-3 px-2">{dictionary.leaderboard.colPremiumReqs}</th>
              <th className="text-right py-3 px-2">{dictionary.leaderboard.colRequests}</th>
              <th className="text-right py-3 px-2">{dictionary.leaderboard.colTopModel}</th>
              <th className="text-right py-3 px-2">{dictionary.leaderboard.colWorkspaces}</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr>
                <td colSpan={9} className="py-12 text-center text-[var(--text-secondary)]">
                  {dictionary.leaderboard.empty}
                </td>
              </tr>
            )}
            {entries.map((e, i) => {
              const safeAvatarUrl = getAllowedAvatarUrl(e.avatarUrl);

              return (
                <tr key={e.userId} className="border-b border-[var(--surface-hover)] hover:bg-[var(--surface-elevated)]">
                  <td className="py-3 px-2 text-[var(--text-secondary)]">{(page - 1) * PAGE_SIZE + i + 1}</td>
                  <td className="py-3 px-2">
                    <Link href={`/u/${e.username}`} className="flex items-center gap-2 no-underline">
                      {safeAvatarUrl && (
                        <Image src={safeAvatarUrl} alt="" width={24} height={24} className="w-6 h-6 rounded-full" />
                      )}
                      <span className="text-[var(--foreground)] font-medium">{e.username}</span>
                    </Link>
                  </td>
                  <td className="py-3 px-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/badges/${e.username}/rank.svg`} alt={`${e.username} rank`} className="h-7 w-auto" />
                  </td>
                  <td className="py-3 px-2 text-right font-mono">{numberFormatter.format(Number(e.totalTokens))}</td>
                  <td className="py-3 px-2 text-right font-mono">🔥 {e.currentStreakDays}</td>
                  <td className="py-3 px-2 text-right font-mono">{e.premiumRequests.toFixed(1)}</td>
                  <td className="py-3 px-2 text-right font-mono">{numberFormatter.format(e.totalRequests)}</td>
                  <td className="py-3 px-2 text-right text-[var(--text-secondary)]">{e.topModel || '–'}</td>
                  <td className="py-3 px-2 text-right">{e.workspaceCount}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex gap-3 mt-6 justify-center">
        {page > 1 && (
          <Link
            href={`/leaderboard?page=${page - 1}${sort !== 'tokens' ? `&sort=${sort}` : ''}${since ? `&since=${since}` : ''}`}
            className="text-sm border border-[var(--card-border)] px-3 py-1.5 rounded-md no-underline hover:border-[var(--text-secondary)]"
          >
            {dictionary.leaderboard.prev}
          </Link>
        )}
        {entries.length === PAGE_SIZE && (
          <Link
            href={`/leaderboard?page=${page + 1}${sort !== 'tokens' ? `&sort=${sort}` : ''}${since ? `&since=${since}` : ''}`}
            className="text-sm border border-[var(--card-border)] px-3 py-1.5 rounded-md no-underline hover:border-[var(--text-secondary)]"
          >
            {dictionary.leaderboard.next}
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
          : 'border border-[var(--card-border)] text-[var(--text-secondary)] hover:border-[var(--text-secondary)] hover:text-[var(--foreground)]'
      }`}
    >
      {label}
    </Link>
  );
}
