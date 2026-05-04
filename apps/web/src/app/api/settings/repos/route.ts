import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { prisma } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { leaderboardTag, repoSlugTag, userTag } from '@/lib/cache/tags';

/**
 * PATCH /api/settings/repos — Bulk update repo visibility.
 * Body: { repos: [{ id: string, isPublic: boolean }] }
 *
 * `id` is the canonical repoIdentity (for example `github:owner/repo`).
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

    const repoIdentity = entry.id.trim();
    if (!repoIdentity) continue;

    const ownsRepo = await prisma.modelUsageDaily.findFirst({
      where: {
        userId: sessionUser.userId,
        repoIdentity,
      },
      select: { id: true },
    });
    if (!ownsRepo) continue;

    await prisma.repoVisibilitySettings.upsert({
      where: {
        userId_repoIdentity: {
          userId: sessionUser.userId,
          repoIdentity,
        },
      },
      update: {
        isPublic: entry.isPublic,
      },
      create: {
        userId: sessionUser.userId,
        repoIdentity,
        isPublic: entry.isPublic,
      },
    });

    const slug = repoIdentity.startsWith('github:') ? repoIdentity.slice('github:'.length) : null;
    if (slug) affectedSlugs.add(slug);
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
