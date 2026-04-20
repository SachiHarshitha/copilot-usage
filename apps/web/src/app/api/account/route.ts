import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

/**
 * DELETE /api/account — Hard delete the user and all cascade data.
 */
export async function DELETE() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  // Prisma cascades will handle Device, UsageDaily, UploadLog, UserStat, RepoStat
  await prisma.user.delete({
    where: { id: sessionUser.userId },
  });

  return NextResponse.json({ ok: true });
}
