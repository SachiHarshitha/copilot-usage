import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { softDeleteSelfCore } from '@/lib/account/selfDelete';

/**
 * DELETE /api/account — User-initiated soft delete.
 *
 * Sets `status=ACTIVE, deletedAt=now()`, anonymizes username/displayName/avatar,
 * forces `profilePublic=false`, revokes every device, and invalidates all
 * public caches for the user. Public surfaces (profile/badges/leaderboards)
 * therefore drop the user before this response returns.
 *
 * Idempotent — a duplicate call after the user is already soft-deleted is a
 * no-op and still clears session cookies.
 *
 * The full two-step request/confirm flow + async anonymization job lands in
 * Phase 5 of the GDPR rollout. This endpoint covers the immediate-takedown
 * acceptance criteria (§10) for MVP.
 */
export async function DELETE() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  try {
    await softDeleteSelfCore(prisma, sessionUser.userId);
  } catch (err) {
    if (err instanceof Error && err.message === 'user_not_found') {
      // Stale session: user row is already gone. Treat as success and let
      // the cookie-clearing path below sign the client out cleanly.
    } else {
      throw err;
    }
  }

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
