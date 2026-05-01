import { NextResponse } from 'next/server';

import { loadProfileByUsername } from '@/lib/profile/loadProfileByUsername';

/**
 * GET /api/profile/[username]
 * Returns public profile data for a user.
 *
 * Lifecycle gating: deleted (deletedAt set) and suspended users return 404
 * regardless of `profilePublic`. See `lib/policy/userLifecycle.ts`.
 *
 * Response shape and filtering rules are characterized by
 * `lib/profile/loadProfileByUsername.itest.ts` (Phase 0 baseline).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;
  const profile = await loadProfileByUsername(username);
  if (!profile) {
    return NextResponse.json({ error: 'User not found or profile is private.' }, { status: 404 });
  }
  return NextResponse.json(profile);
}
