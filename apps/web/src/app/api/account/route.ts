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

  const response = NextResponse.json({ ok: true });

  // Clear NextAuth/Auth.js session cookies so deleted accounts are signed out immediately.
  response.cookies.set('next-auth.session-token', '', { path: '/', maxAge: 0, httpOnly: true, sameSite: 'lax' });
  response.cookies.set('__Secure-next-auth.session-token', '', {
    path: '/',
    maxAge: 0,
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
  });
  response.cookies.set('authjs.session-token', '', { path: '/', maxAge: 0, httpOnly: true, sameSite: 'lax' });
  response.cookies.set('__Secure-authjs.session-token', '', {
    path: '/',
    maxAge: 0,
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
  });

  return response;
}
