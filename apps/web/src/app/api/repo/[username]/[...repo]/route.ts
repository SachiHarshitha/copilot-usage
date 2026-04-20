import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * GET /api/repo/[username]/[...repo] — Public repo stats.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ username: string; repo: string[] }> }
) {
  const { username, repo } = await params;
  const repoSlug = repo.join('/');

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !user.profilePublic) {
    return NextResponse.json({ error: 'User not found.' }, { status: 404 });
  }

  const repoIdentity = `github:${repoSlug}`;
  const repoStat = await prisma.repoStat.findUnique({
    where: { userId_repoIdentity: { userId: user.id, repoIdentity } },
  });

  if (!repoStat || !repoStat.isPublic) {
    return NextResponse.json({ error: 'Repo not found or private.' }, { status: 404 });
  }

  return NextResponse.json({
    repoIdentity: repoStat.repoIdentity,
    displayMode: repoStat.displayMode,
    githubRepo: repoStat.githubRepo,
    aliasLabel: repoStat.aliasLabel,
    requests: repoStat.requests,
    promptTokens: repoStat.promptTokens.toString(),
    outputTokens: repoStat.outputTokens.toString(),
    totalTokens: repoStat.totalTokens.toString(),
    premiumReqs: repoStat.premiumReqs,
    topModel: repoStat.topModel,
    lastSyncedAt: repoStat.lastSyncedAt,
  });
}
