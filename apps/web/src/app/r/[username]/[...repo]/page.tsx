import { prisma } from '@/lib/db';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getDictionary } from '@/lib/i18n/dictionary';
import { getRequestLocale } from '@/lib/i18n/server';

export default async function RepoPage({
  params,
}: {
  params: Promise<{ username: string; repo: string[] }>;
}) {
  const { username, repo } = await params;
  const locale = await getRequestLocale();
  const dictionary = getDictionary(locale);
  const numberFormatter = new Intl.NumberFormat(locale);
  const dateFormatter = new Intl.DateTimeFormat(locale);
  const repoSlug = repo.join('/');

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !user.profilePublic) notFound();

  const repoIdentity = `github:${repoSlug}`;
  const repoStat = await prisma.repoStat.findUnique({
    where: { userId_repoIdentity: { userId: user.id, repoIdentity } },
  });

  if (!repoStat || !repoStat.isPublic) notFound();

  const baseUrl = 'https://promptstreak.dev';
  const [owner, repoName] = repoSlug.split('/');
  const leaderboardBadgeUrl = `/api/badges/repo/${owner}/${repoName}/leaderboard.svg`;
  const tokensBadgeUrl = `/api/badges/repo/${owner}/${repoName}/tokens.svg`;
  const modelsBadgeUrl = `/api/badges/repo/${owner}/${repoName}/models.svg`;

  return (
    <div>
      <div className="mb-6">
        <Link href={`/u/${username}`} className="text-sm text-[var(--text-secondary)] hover:text-[var(--foreground)]">
          ← {dictionary.repoPage.back} @{username}
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-[var(--foreground)] mb-2">{repoSlug}</h1>
      <p className="text-sm text-[var(--text-secondary)] mb-8">
        {dictionary.repoPage.by} <Link href={`/u/${username}`}>@{username}</Link>
        {' · '}
        {dictionary.repoPage.lastSynced} {dateFormatter.format(repoStat.lastSyncedAt)}
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <KpiCard label={dictionary.repoPage.totalTokens} value={numberFormatter.format(Number(repoStat.totalTokens))} />
        <KpiCard label={dictionary.repoPage.requests} value={numberFormatter.format(repoStat.requests)} />
        <KpiCard label={dictionary.repoPage.promptTokens} value={numberFormatter.format(Number(repoStat.promptTokens))} />
        <KpiCard label={dictionary.repoPage.outputTokens} value={numberFormatter.format(Number(repoStat.outputTokens))} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <KpiCard label={dictionary.repoPage.premiumRequests} value={repoStat.premiumReqs.toFixed(1)} />
        <KpiCard label={dictionary.repoPage.topModel} value={repoStat.topModel || dictionary.repoPage.na} />
      </div>

      <div className="mt-8 bg-[var(--surface-elevated)] border border-[var(--card-border)] rounded-lg p-6">
        <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">{dictionary.repoPage.embedTitle}</h2>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={leaderboardBadgeUrl} alt="Repo rank badge" className="mb-2" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={tokensBadgeUrl} alt="Repo token badge" className="mb-2" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={modelsBadgeUrl} alt="Repo models badge" className="mb-3" />

        <code className="block bg-[var(--background)] text-xs p-2 rounded border border-[var(--card-border)] break-all mb-2">
          {`[![PromptStreak Rank](${baseUrl}${leaderboardBadgeUrl})](${baseUrl}/r/${username}/${owner}/${repoName})`}
        </code>
        <code className="block bg-[var(--background)] text-xs p-2 rounded border border-[var(--card-border)] break-all mb-2">
          {`[![PromptStreak Tokens](${baseUrl}${tokensBadgeUrl})](${baseUrl}/r/${username}/${owner}/${repoName})`}
        </code>
        <code className="block bg-[var(--background)] text-xs p-2 rounded border border-[var(--card-border)] break-all">
          {`[![PromptStreak Models](${baseUrl}${modelsBadgeUrl})](${baseUrl}/r/${username}/${owner}/${repoName})`}
        </code>
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
