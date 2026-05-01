import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { prisma } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { leaderboardTag, repoSlugTag, userTag } from '@/lib/cache/tags';

/**
 * PATCH /api/settings/repos — Bulk update repo visibility.
 * Body: { repos: [{ id: string, isPublic: boolean }] }
 */
export async function PATCH(request: NextRequest) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  const body = await request.json();
  if (!Array.isArray(body.repos)) {
    return NextResponse.json({ error: 'Invalid payload.' }, { status: 400 });
  }

  const affectedSlugs = new Set<string>();
  for (const entry of body.repos) {
    if (typeof entry.id !== 'string' || typeof entry.isPublic !== 'boolean') continue;

    // Only update repos that belong to this user
    await prisma.repoStat.updateMany({
      where: { id: entry.id, userId: sessionUser.userId },
      data: { isPublic: entry.isPublic },
    });

    // Look up the slug so we can invalidate per-repo caches. We re-read
    // because updateMany doesn't return the row.
    const row = await prisma.repoStat.findFirst({
      where: { id: entry.id, userId: sessionUser.userId },
      select: { githubRepo: true },
    });
    if (row?.githubRepo) affectedSlugs.add(row.githubRepo);
  }

  // Invalidate user-level + per-slug + leaderboard fragments. Best-effort.
  const tags = new Set<string>([userTag(sessionUser.userId), leaderboardTag()]);
  for (const slug of affectedSlugs) tags.add(repoSlugTag(slug));
  for (const tag of tags) {
    try {
      revalidateTag(tag);
    } catch {
      // ignore: revalidateTag may throw outside a request context (tests)
    }
  }

  return NextResponse.json({ ok: true });
}
