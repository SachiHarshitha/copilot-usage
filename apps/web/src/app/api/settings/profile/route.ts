import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

/**
 * GET /api/settings/profile — Fetch full user settings.
 * PATCH /api/settings/profile — Update profile visibility / display name.
 */
export async function GET() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: sessionUser.userId },
    include: {
      repoStats: { orderBy: { totalTokens: 'desc' } },
      devices: { where: { revokedAt: null }, orderBy: { createdAt: 'desc' } },
    },
  });

  if (!user) {
    return NextResponse.json({ error: 'User not found.' }, { status: 404 });
  }

  return NextResponse.json({
    displayName: user.displayName || user.username,
    profilePublic: user.profilePublic,
    username: user.username,
    repos: user.repoStats.map((r) => ({
      id: r.id,
      repoIdentity: r.repoIdentity,
      displayMode: r.displayMode,
      githubRepo: r.githubRepo,
      aliasLabel: r.aliasLabel,
      isPublic: r.isPublic,
    })),
    devices: user.devices.map((d) => ({
      id: d.id,
      name: d.name,
      tokenId: d.tokenId,
      lastSeenAt: d.lastSeenAt?.toISOString() || null,
      createdAt: d.createdAt.toISOString(),
    })),
  });
}

export async function PATCH(request: NextRequest) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  const body = await request.json();
  const update: Record<string, unknown> = {};

  if (typeof body.profilePublic === 'boolean') {
    update.profilePublic = body.profilePublic;
  }
  if (typeof body.displayName === 'string' && body.displayName.length <= 100) {
    update.displayName = body.displayName;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update.' }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: sessionUser.userId },
    data: update,
  });

  return NextResponse.json({ ok: true });
}
