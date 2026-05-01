import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';

import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { tagsForUserChange } from '@/lib/cache/tags';
import {
  getClientIpFromHeaders,
  hashIp,
  hashUserAgent,
} from '@/lib/admin/auth/clientFingerprint';
import {
  loadPrivacySettings,
  updatePrivacySettings,
  type PrivacySettingsPatch,
} from '@/lib/privacy/privacySettings';

/**
 * Phase 2 — independent privacy controls.
 *
 *   GET /api/settings/privacy
 *     → { profilePublic, leaderboardOptIn, badgesEnabled,
 *         policyVersion, policyAcceptedAt }
 *
 *   PATCH /api/settings/privacy
 *     body: any subset of { profilePublic, leaderboardOptIn, badgesEnabled }
 *     Each field that actually changes is recorded as a `ConsentEvent` with
 *     the request's hashed IP + UA for audit. Withdrawal is symmetric to
 *     grant — both flow through the same handler.
 */

function getUserAgent(request: NextRequest): string | null {
  const ua = request.headers.get('user-agent');
  return ua ? ua.slice(0, 500) : null;
}

export async function GET() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }
  const view = await loadPrivacySettings(prisma, sessionUser.userId);
  return NextResponse.json({
    profilePublic: view.profilePublic,
    leaderboardOptIn: view.leaderboardOptIn,
    badgesEnabled: view.badgesEnabled,
    policyVersion: view.policyVersion,
    policyAcceptedAt: view.policyAcceptedAt?.toISOString() ?? null,
  });
}

export async function PATCH(request: NextRequest) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body.' }, { status: 400 });
  }

  const patch: PrivacySettingsPatch = {};
  const b = body as Record<string, unknown>;
  for (const key of ['profilePublic', 'leaderboardOptIn', 'badgesEnabled'] as const) {
    if (typeof b[key] === 'boolean') patch[key] = b[key] as boolean;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update.' }, { status: 400 });
  }

  const ipHash = hashIp(getClientIpFromHeaders(request.headers));
  const userAgent = getUserAgent(request);
  const userAgentHash = hashUserAgent(userAgent);

  const result = await updatePrivacySettings(prisma, sessionUser.userId, patch, {
    ipHash,
    // Persist the hashed UA — the raw UA is request-only context that has no
    // place in our long-lived audit log.
    userAgent: userAgentHash,
  });

  // Invalidate every cache fragment that depends on the user's public surface.
  // Best-effort: outside a request context (e.g. tests) revalidateTag throws.
  if (result.changedKinds.length > 0) {
    for (const tag of tagsForUserChange(sessionUser.userId, sessionUser.username)) {
      try {
        revalidateTag(tag);
      } catch {
        /* ignore */
      }
    }
  }

  return NextResponse.json({
    ok: true,
    profilePublic: result.after.profilePublic,
    leaderboardOptIn: result.after.leaderboardOptIn,
    badgesEnabled: result.after.badgesEnabled,
    changed: result.changedKinds,
  });
}
