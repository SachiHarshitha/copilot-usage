import { type NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

/**
 * DELETE /api/verification/github
 *
 * Self-service disconnect of the authenticated user's GitHub-billing
 * verification linkage. Idempotent: a 200 is returned even when the user
 * has no `UserVerification` row yet.
 *
 * Refresh (POST /api/verification/github/refresh) is intentionally not
 * exposed at launch — it depends on the GitHub-billing fetch worker
 * (Verification Task 3.6). See `docs/launch-readiness-gap-analysis.md`.
 */
export async function DELETE(_req: NextRequest): Promise<NextResponse> {
  const sessionUser = await getSessionUser();
  if (!sessionUser?.userId) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const existing = await prisma.userVerification.findUnique({
    where: { userId: sessionUser.userId },
    select: { userId: true },
  });
  if (!existing) {
    return NextResponse.json({ ok: true, cleared: false });
  }

  await prisma.userVerification.update({
    where: { userId: sessionUser.userId },
    data: {
      githubBillingConnected: false,
      githubBillingStatus: 'NOT_CONNECTED',
      verifiedAt: null,
      lastHealthyAt: null,
      currentPeriodKey: null,
      localPremiumRequests: null,
      verifiedPremiumRequests: null,
      differenceAbsolute: null,
      differencePercent: null,
      mismatchScore: 0,
      // Manual badge overrides in AdminBadgeOverride continue to take
      // precedence on read; the eligibility flag here just resets to false.
      publicBadgeEligible: false,
    },
  });

  return NextResponse.json({ ok: true, cleared: true });
}

export const dynamic = 'force-dynamic';
