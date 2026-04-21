import { prisma } from '@/lib/db';
import { notFound } from 'next/navigation';
import Link from 'next/link';

export default async function RepoPage({
  params,
}: {
  params: Promise<{ username: string; repo: string[] }>;
}) {
  const { username, repo } = await params;
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
        <Link href={`/u/${username}`} className="text-sm text-[#8b949e] hover:text-white">
          ← Back to {username}&apos;s profile
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-white mb-2">{repoSlug}</h1>
      <p className="text-sm text-[#8b949e] mb-8">
        by <Link href={`/u/${username}`}>@{username}</Link>
        {' · '}Last synced {repoStat.lastSyncedAt.toLocaleDateString()}
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <KpiCard label="Total Tokens" value={Number(repoStat.totalTokens).toLocaleString()} />
        <KpiCard label="Requests" value={repoStat.requests.toLocaleString()} />
        <KpiCard label="Prompt Tokens" value={Number(repoStat.promptTokens).toLocaleString()} />
        <KpiCard label="Output Tokens" value={Number(repoStat.outputTokens).toLocaleString()} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <KpiCard label="Premium Requests" value={repoStat.premiumReqs.toFixed(1)} />
        <KpiCard label="Top Model" value={repoStat.topModel || 'N/A'} />
      </div>

      <div className="mt-8 bg-[#161b22] border border-[#30363d] rounded-lg p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Embed Repo Badges</h2>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={leaderboardBadgeUrl} alt="Repo rank badge" className="mb-2" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={tokensBadgeUrl} alt="Repo token badge" className="mb-2" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={modelsBadgeUrl} alt="Repo models badge" className="mb-3" />

        <code className="block bg-[#0d1117] text-xs p-2 rounded border border-[#30363d] break-all mb-2">
          {`[![PromptStreak Rank](${baseUrl}${leaderboardBadgeUrl})](${baseUrl}/r/${username}/${owner}/${repoName})`}
        </code>
        <code className="block bg-[#0d1117] text-xs p-2 rounded border border-[#30363d] break-all mb-2">
          {`[![PromptStreak Tokens](${baseUrl}${tokensBadgeUrl})](${baseUrl}/r/${username}/${owner}/${repoName})`}
        </code>
        <code className="block bg-[#0d1117] text-xs p-2 rounded border border-[#30363d] break-all">
          {`[![PromptStreak Models](${baseUrl}${modelsBadgeUrl})](${baseUrl}/r/${username}/${owner}/${repoName})`}
        </code>
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
