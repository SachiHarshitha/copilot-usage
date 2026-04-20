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
