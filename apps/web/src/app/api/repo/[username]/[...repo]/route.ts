import { NextResponse } from 'next/server';
import { getCanonicalRepoStatsByIdentity } from '@/lib/canonical-stats';
import { prisma } from '@/lib/db';
import { isUserVisibleForFeature } from '@/lib/policy/userLifecycle';

/**
 * GET /api/repo/[username]/[...repo] — Public repo stats.
 *
 * Lifecycle gating: deleted/suspended users are hidden regardless of
 * `profilePublic`. See `lib/policy/userLifecycle.ts`.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ username: string; repo: string[] }> }
) {
  const { username, repo } = await params;
  const repoSlug = repo.join('/');

  const user = await prisma.user.findUnique({
    where: { username },
    include: { privacySettings: true },
  });
  if (!user || !isUserVisibleForFeature(user, 'profile')) {
    return NextResponse.json({ error: 'User not found.' }, { status: 404 });
  }

  const repoIdentity = `github:${repoSlug}`;
  const repoStats = await getCanonicalRepoStatsByIdentity(prisma, user.id, repoIdentity);

  if (!repoStats || !repoStats.isPublic) {
    return NextResponse.json({ error: 'Repo not found or private.' }, { status: 404 });
  }

  return NextResponse.json({
    repoIdentity: repoStats.repoIdentity,
    displayMode: repoStats.displayMode,
    githubRepo: repoStats.githubRepo,
    aliasLabel: repoStats.aliasLabel,
    requests: repoStats.requests,
    promptTokens: repoStats.promptTokens.toString(),
    outputTokens: repoStats.outputTokens.toString(),
    totalTokens: repoStats.totalTokens.toString(),
    premiumReqs: repoStats.premiumReqs,
    topModel: repoStats.topModel,
    lastSyncedAt: repoStats.lastSyncedAt,
  });
}
