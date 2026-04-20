import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

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

  for (const entry of body.repos) {
    if (typeof entry.id !== 'string' || typeof entry.isPublic !== 'boolean') continue;

    // Only update repos that belong to this user
    await prisma.repoStat.updateMany({
      where: { id: entry.id, userId: sessionUser.userId },
      data: { isPublic: entry.isPublic },
    });
  }

  return NextResponse.json({ ok: true });
}
