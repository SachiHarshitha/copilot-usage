import { prisma } from '@/lib/db';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {
  getCanonicalRepoStatsList,
  getCanonicalUserStats,
} from '@/lib/canonical-stats';
import { computeRank, computeUnlockedLifetime, computeUnlockedStreak } from '@/lib/badge-stats';
import { getSessionUser } from '@/lib/auth';
import { canViewProfile } from '@/lib/profile-policy';
import { getAllowedAvatarUrl } from '@/lib/profile-menu';
import { getDictionary } from '@/lib/i18n/dictionary';
import { getRequestLocale } from '@/lib/i18n/server';

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const sessionUser = await getSessionUser();
  const locale = await getRequestLocale();
  const dictionary = getDictionary(locale);
  const numberFormatter = new Intl.NumberFormat(locale);
  const dateFormatter = new Intl.DateTimeFormat(locale);

  const user = await prisma.user.findUnique({
    where: { username },
    include: {
      privacySettings: true,
    },
  });

  if (
    !user ||
    !canViewProfile({
      user,
      viewerUserId: sessionUser?.userId || null,
    })
  ) {
    notFound();
  }

  const [stat, publicRepos] = await Promise.all([
    getCanonicalUserStats(prisma, user.id),
    getCanonicalRepoStatsList(prisma, user.id, {
      publicOnly: true,
      take: 10,
    }),
  ]);

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
  const safeAvatarUrl = getAllowedAvatarUrl(user.avatarUrl);

  return (
    <div>
      {/* Suspension notice — only shown to the account owner */}
      {user.status === 'SUSPENDED' && sessionUser?.userId === user.id && (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-[var(--alert-border)] bg-[var(--alert-bg)] px-4 py-3 text-sm text-[var(--alert-text)]">
          <span className="mt-0.5 text-[var(--alert-accent)]">⚠</span>
          <div>
            <p className="mb-1 font-medium text-[var(--alert-text)]">{dictionary.profile.suspendedTitle}</p>
            <p className="text-[var(--alert-text)]">
              {dictionary.profile.suspendedBody}{' '}
              <Link href="/contact" className="underline text-[var(--alert-link)] hover:text-[var(--alert-accent)]">
                {dictionary.profile.contactSupport}
              </Link>{' '}
              {dictionary.profile.suspendedErrorTail}
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        {safeAvatarUrl && (
          <Image src={safeAvatarUrl} alt="" width={64} height={64} className="w-16 h-16 rounded-full" />
        )}
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">{user.displayName || user.username}</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            @{user.username} · {dictionary.profile.joined} {dateFormatter.format(user.createdAt)}
            {stat?.lastSyncedAt && ` · ${dictionary.profile.lastSynced} ${dateFormatter.format(stat.lastSyncedAt)}`}
          </p>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <KpiCard label={dictionary.profile.totalTokens} value={stat ? numberFormatter.format(Number(stat.totalTokens)) : '0'} />
        <KpiCard label={dictionary.profile.currentStreak} value={stat ? `${stat.currentStreakDays} ${dictionary.profile.days}` : '0'} />
        <KpiCard label={dictionary.profile.premiumRequests} value={stat ? stat.premiumRequests.toFixed(1) : '0'} />
        <KpiCard label={dictionary.profile.rolling30d} value={stat ? numberFormatter.format(Number(stat.rolling30DayTokens)) : '0'} />
        <KpiCard label={dictionary.profile.bestStreak} value={stat ? `${stat.bestStreakDays} ${dictionary.profile.days}` : '0'} />
      </div>

      {/* Additional stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        <KpiCard label={dictionary.profile.totalRequests} value={stat ? numberFormatter.format(stat.totalRequests) : '0'} />
        <KpiCard label={dictionary.profile.thisWeek} value={stat ? numberFormatter.format(Number(stat.weeklyTokens)) : '0'} />
        <KpiCard label={dictionary.profile.promptTokens} value={stat ? numberFormatter.format(Number(stat.promptTokens)) : '0'} />
        <KpiCard label={dictionary.profile.outputTokens} value={stat ? numberFormatter.format(Number(stat.outputTokens)) : '0'} />
        <KpiCard label={dictionary.profile.topModel} value={stat?.topModel || dictionary.profile.na} />
        <KpiCard label={dictionary.profile.workspaces} value={stat ? stat.workspaceCount.toString() : '0'} />
      </div>

      {/* Rank card */}
      {rankCardUrl && (
        <div className="mb-8 bg-[var(--surface-elevated)] border border-[var(--card-border)] rounded-lg p-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-[var(--foreground)]">{dictionary.profile.currentRank}</h2>
            <Link href={`/u/${username}/achievements`} className="text-xs text-[var(--text-secondary)] hover:text-[var(--foreground)] no-underline">
              {dictionary.profile.viewAchievements}
            </Link>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={rankCardUrl} alt={`${rank?.label || 'Rank'} badge`} className="max-w-[320px]" />
        </div>
      )}

      {/* Achievement preview */}
      {featuredAchievements.length > 0 && (
        <div className="mb-8 bg-[var(--surface-elevated)] border border-[var(--card-border)] rounded-lg p-6">
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">{dictionary.profile.unlockedAchievements}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {featuredAchievements.map((key) => {
              const url = `/api/badges/${username}/achievements/${key}.svg`;
              return (
                <div key={key} className="bg-[var(--background)] border border-[var(--card-border)] rounded-lg p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`Achievement ${key}`} className="w-full max-w-[380px]" />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Public Repos */}
      {publicRepos.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">{dictionary.profile.publicRepos}</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--card-border)] text-[var(--text-secondary)]">
                  <th className="text-left py-2 px-2">{dictionary.profile.colRepo}</th>
                  <th className="text-right py-2 px-2">{dictionary.profile.colTokens}</th>
                  <th className="text-right py-2 px-2">{dictionary.profile.colRequests}</th>
                  <th className="text-right py-2 px-2">{dictionary.profile.colPremium}</th>
                  <th className="text-right py-2 px-2">{dictionary.profile.colTopModel}</th>
                </tr>
              </thead>
              <tbody>
                {publicRepos.map((r) => {
                  const displayName =
                    r.displayMode === 'github' && r.githubRepo
                      ? r.githubRepo
                      : r.aliasLabel || r.repoIdentity;
                  const href =
                    r.displayMode === 'github' && r.githubRepo
                      ? `/r/${username}/${r.githubRepo}`
                      : null;
                  return (
                    <tr key={r.id} className="border-b border-[var(--surface-hover)]">
                      <td className="py-2 px-2">
                        {href ? (
                          <Link href={href}>{displayName}</Link>
                        ) : (
                          <span className="text-[var(--foreground)]">{displayName}</span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-right font-mono">
                        {numberFormatter.format(Number(r.totalTokens))}
                      </td>
                      <td className="py-2 px-2 text-right font-mono">{numberFormatter.format(r.requests)}</td>
                      <td className="py-2 px-2 text-right font-mono">{r.premiumReqs.toFixed(1)}</td>
                      <td className="py-2 px-2 text-right text-[var(--text-secondary)]">{r.topModel || '–'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Badge / Card Embed */}
      <div className="bg-[var(--surface-elevated)] border border-[var(--card-border)] rounded-lg p-6">
        <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">{dictionary.profile.embedTitle}</h2>
        <div className="mb-4">
          <p className="text-xs text-[var(--text-secondary)] mb-2">{dictionary.profile.dynamicBadges}</p>
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
          <p className="text-xs text-[var(--text-secondary)] mb-1">{dictionary.profile.markdownSnippets}</p>
          {badgeMarkdownSamples.map((sample) => (
            <code key={sample} className="block bg-[var(--background)] text-xs p-2 rounded border border-[var(--card-border)] break-all mb-2">
              {sample}
            </code>
          ))}
        </div>

        <div className="mb-4">
          <p className="text-xs text-[var(--text-secondary)] mb-1">{dictionary.profile.legacyBadge}</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/badge/${username}.svg?stat=tokens&label=PromptStreak`} alt="promptstreak.dev badge" className="mb-2" />
          <code className="block bg-[var(--background)] text-xs p-2 rounded border border-[var(--card-border)] break-all">
            {`![PromptStreak](${baseUrl}/badge/${username}.svg?stat=tokens&label=PromptStreak)`}
          </code>
        </div>

        <div>
          <p className="text-xs text-[var(--text-secondary)] mb-1">{dictionary.profile.statCard}</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cardUrl} alt="promptstreak.dev card" className="mb-2 max-w-[400px]" />
          <code className="block bg-[var(--background)] text-xs p-2 rounded border border-[var(--card-border)] break-all">
            {`![promptstreak.dev](${baseUrl}${cardUrl})`}
          </code>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[var(--surface-elevated)] border border-[var(--card-border)] rounded-lg p-4">
      <p className="text-xs text-[var(--text-secondary)] mb-1">{label}</p>
      <p className="text-xl font-bold text-[var(--foreground)]">{value}</p>
    </div>
  );
}
