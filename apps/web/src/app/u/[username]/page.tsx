import { prisma } from '@/lib/db';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { computeRank, computeUnlockedLifetime, computeUnlockedStreak } from '@/lib/badge-stats';

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;

  const user = await prisma.user.findUnique({
    where: { username },
    include: {
      userStat: true,
      repoStats: {
        where: { isPublic: true },
        orderBy: { totalTokens: 'desc' },
        take: 10,
      },
    },
  });

  if (!user || !user.profilePublic) {
    notFound();
  }

  const stat = user.userStat;
  const baseUrl = 'https://promptstreak.dev';
  const rank = stat ? computeRank(stat.rolling30DayTokens || BigInt(0)) : null;
  const unlockedLifetime = stat ? computeUnlockedLifetime(stat.totalTokens || BigInt(0)) : [];
  const unlockedStreak = stat ? computeUnlockedStreak(stat.bestStreakDays || 0) : [];
  const featuredAchievements = [...new Set([...unlockedLifetime.slice(-3), ...unlockedStreak.slice(-3)])].slice(-4);

  const streakBadgeUrl = `/api/badges/${username}/streak.svg`;
  const lifetimeBadgeUrl = `/api/badges/${username}/lifetime.svg`;
  const rankBadgeUrl = `/api/badges/${username}/rank.svg`;
  const weeklyBadgeUrl = `/api/badges/${username}/weekly.svg`;
  const repoBadgeUrl = `/api/badges/${username}/repo.svg`;
  const rankCardUrl = rank ? `/api/badges/${username}/ranks/${rank.key}.svg` : null;

  const badgeMarkdownSamples = [
    `![PromptStreak Streak](${baseUrl}${streakBadgeUrl})`,
    `![PromptStreak Lifetime](${baseUrl}${lifetimeBadgeUrl})`,
    `![PromptStreak Rank](${baseUrl}${rankBadgeUrl})`,
    `![PromptStreak Weekly](${baseUrl}${weeklyBadgeUrl})`,
    `![PromptStreak Top Repo](${baseUrl}${repoBadgeUrl})`,
  ];

  const cardUrl = `/card/${username}.svg`;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        {user.avatarUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.avatarUrl} alt="" className="w-16 h-16 rounded-full" />
        )}
        <div>
          <h1 className="text-2xl font-bold text-white">{user.displayName || user.username}</h1>
          <p className="text-sm text-[#8b949e]">
            @{user.username} · Joined {user.createdAt.toLocaleDateString()}
            {stat?.lastSyncedAt && ` · Last synced ${stat.lastSyncedAt.toLocaleDateString()}`}
          </p>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <KpiCard label="Total Tokens" value={stat ? Number(stat.totalTokens).toLocaleString() : '0'} />
        <KpiCard label="Current Streak" value={stat ? `${stat.currentStreakDays} days` : '0'} />
        <KpiCard label="Premium Requests" value={stat ? stat.premiumRequests.toFixed(1) : '0'} />
        <KpiCard label="30-Day Tokens" value={stat ? Number(stat.rolling30DayTokens).toLocaleString() : '0'} />
        <KpiCard label="Best Streak" value={stat ? `${stat.bestStreakDays} days` : '0'} />
      </div>

      {/* Additional stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        <KpiCard label="Total Requests" value={stat ? stat.totalRequests.toLocaleString() : '0'} />
        <KpiCard label="This Week" value={stat ? Number(stat.weeklyTokens).toLocaleString() : '0'} />
        <KpiCard label="Prompt Tokens" value={stat ? Number(stat.promptTokens).toLocaleString() : '0'} />
        <KpiCard label="Output Tokens" value={stat ? Number(stat.outputTokens).toLocaleString() : '0'} />
        <KpiCard label="Top Model" value={stat?.topModel || 'N/A'} />
        <KpiCard label="Workspaces" value={stat ? stat.workspaceCount.toString() : '0'} />
      </div>

      {/* Rank card */}
      {rankCardUrl && (
        <div className="mb-8 bg-[#161b22] border border-[#30363d] rounded-lg p-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-white">Current Rank</h2>
            <Link href={`/u/${username}/achievements`} className="text-xs text-[#8b949e] hover:text-white no-underline">
              View full achievements
            </Link>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={rankCardUrl} alt={`${rank?.label || 'Rank'} badge`} className="max-w-[320px]" />
        </div>
      )}

      {/* Achievement preview */}
      {featuredAchievements.length > 0 && (
        <div className="mb-8 bg-[#161b22] border border-[#30363d] rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Unlocked Achievements</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {featuredAchievements.map((key) => {
              const url = `/api/badges/${username}/achievements/${key}.svg`;
              return (
                <div key={key} className="bg-[#0d1117] border border-[#30363d] rounded-lg p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`Achievement ${key}`} className="w-full max-w-[380px]" />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Public Repos */}
      {user.repoStats.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-white mb-4">Public Repos / Projects</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#30363d] text-[#8b949e]">
                  <th className="text-left py-2 px-2">Repo</th>
                  <th className="text-right py-2 px-2">Tokens</th>
                  <th className="text-right py-2 px-2">Requests</th>
                  <th className="text-right py-2 px-2">Premium</th>
                  <th className="text-right py-2 px-2">Top Model</th>
                </tr>
              </thead>
              <tbody>
                {user.repoStats.map((r) => {
                  const displayName =
                    r.displayMode === 'github' && r.githubRepo
                      ? r.githubRepo
                      : r.aliasLabel || r.repoIdentity;
                  const href =
                    r.displayMode === 'github' && r.githubRepo
                      ? `/r/${username}/${r.githubRepo}`
                      : null;
                  return (
                    <tr key={r.id} className="border-b border-[#21262d]">
                      <td className="py-2 px-2">
                        {href ? (
                          <Link href={href}>{displayName}</Link>
                        ) : (
                          <span className="text-[#c9d1d9]">{displayName}</span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-right font-mono">
                        {Number(r.totalTokens).toLocaleString()}
                      </td>
                      <td className="py-2 px-2 text-right font-mono">{r.requests.toLocaleString()}</td>
                      <td className="py-2 px-2 text-right font-mono">{r.premiumReqs.toFixed(1)}</td>
                      <td className="py-2 px-2 text-right text-[#8b949e]">{r.topModel || '–'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Badge / Card Embed */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Embed in your README</h2>
        <div className="mb-4">
          <p className="text-xs text-[#8b949e] mb-2">Dynamic badges:</p>
          <div className="space-y-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={streakBadgeUrl} alt="Streak badge" className="mb-1" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={lifetimeBadgeUrl} alt="Lifetime badge" className="mb-1" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={rankBadgeUrl} alt="Rank badge" className="mb-1" />
          </div>
        </div>

        <div className="mb-4">
          <p className="text-xs text-[#8b949e] mb-1">Markdown snippets:</p>
          {badgeMarkdownSamples.map((sample) => (
            <code key={sample} className="block bg-[#0d1117] text-xs p-2 rounded border border-[#30363d] break-all mb-2">
              {sample}
            </code>
          ))}
        </div>

        <div className="mb-4">
          <p className="text-xs text-[#8b949e] mb-1">Legacy badge:</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/badge/${username}.svg?stat=tokens&label=PromptStreak`} alt="promptstreak.dev badge" className="mb-2" />
          <code className="block bg-[#0d1117] text-xs p-2 rounded border border-[#30363d] break-all">
            {`![PromptStreak](${baseUrl}/badge/${username}.svg?stat=tokens&label=PromptStreak)`}
          </code>
        </div>

        <div>
          <p className="text-xs text-[#8b949e] mb-1">Stat Card:</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cardUrl} alt="promptstreak.dev card" className="mb-2 max-w-[400px]" />
          <code className="block bg-[#0d1117] text-xs p-2 rounded border border-[#30363d] break-all">
            {`![promptstreak.dev](${baseUrl}${cardUrl})`}
          </code>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
      <p className="text-xs text-[#8b949e] mb-1">{label}</p>
      <p className="text-xl font-bold text-white">{value}</p>
    </div>
  );
}
