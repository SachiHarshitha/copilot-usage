import { NextRequest, NextResponse } from 'next/server';
import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';

import { prisma as defaultPrisma } from '@/lib/db';
import { adminAuthErrorToResponse, requireAdmin } from '@/lib/admin/requireAdmin';
import { withAuditedAction } from '@/lib/admin/auth/audit';
import { getClientIpFromHeaders, hashIp, hashUserAgent } from '@/lib/admin/auth/clientFingerprint';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

interface HandlerDeps {
  prisma?: PrismaClient;
}

export interface VerificationEntry {
  userId: string;
  username: string | null;
  githubBillingConnected: boolean;
  githubBillingStatus: string;
  currentPeriodKey: string | null;
  /** BigInts serialized as decimal strings to survive JSON. */
  localPremiumRequests: string | null;
  verifiedPremiumRequests: string | null;
  differenceAbsolute: string | null;
  mismatchScore: number;
  trustScore: number;
  publicBadgeEligible: boolean;
  verifiedAt: string | null;
  lastCheckedAt: string | null;
}

export interface ListVerificationResponse {
  entries: VerificationEntry[];
  nextCursor: string | null;
}

export interface VerificationDetail extends VerificationEntry {
  lastHealthyAt: string | null;
  differencePercent: string | null;
  createdAt: string;
  updatedAt: string;
}

function bigToString(b: bigint | null | undefined): string | null {
  return b === null || b === undefined ? null : b.toString();
}

/**
 * GET /api/admin/verification — list users with a UserVerification row.
 *
 * Filters:
 * - status: VerificationStatus enum value
 * - cursor / limit: cursor pagination keyed on userId
 *
 * Sort: lastCheckedAt DESC, NULLS LAST (so freshly-checked rows surface first
 * but never-checked rows still appear at the bottom). Joined with User to
 * surface the username — admins triage by name, not by id.
 */
export async function listVerificationHandler(
  req: NextRequest,
  deps: HandlerDeps = {},
): Promise<NextResponse> {
  const prisma = deps.prisma ?? defaultPrisma;

  try {
    await requireAdmin(req, { prisma });
  } catch (err) {
    const res = adminAuthErrorToResponse(err);
    if (res) return res;
    throw err;
  }

  const params = req.nextUrl.searchParams;
  const status = params.get('status') || undefined;
  const cursor = params.get('cursor');
  const rawLimit = parseInt(params.get('limit') ?? '', 10);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0
    ? Math.min(rawLimit, MAX_LIMIT)
    : DEFAULT_LIMIT;

  const where: Prisma.UserVerificationWhereInput = {};
  if (status) where.githubBillingStatus = status as Prisma.UserVerificationWhereInput['githubBillingStatus'];

  const rows = await prisma.userVerification.findMany({
    where,
    orderBy: [{ lastCheckedAt: { sort: 'desc', nulls: 'last' } }, { userId: 'asc' }],
    take: limit + 1,
    ...(cursor ? { cursor: { userId: cursor }, skip: 1 } : {}),
  });
  const userIds = rows.map((r) => r.userId);
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, username: true },
      })
    : [];
  const usernameById = new Map(users.map((u) => [u.id, u.username]));

  const hasMore = rows.length > limit;
  const visible = hasMore ? rows.slice(0, limit) : rows;
  const entries: VerificationEntry[] = visible.map((r) => ({
    userId: r.userId,
    username: usernameById.get(r.userId) ?? null,
    githubBillingConnected: r.githubBillingConnected,
    githubBillingStatus: r.githubBillingStatus,
    currentPeriodKey: r.currentPeriodKey,
    localPremiumRequests: bigToString(r.localPremiumRequests),
    verifiedPremiumRequests: bigToString(r.verifiedPremiumRequests),
    differenceAbsolute: bigToString(r.differenceAbsolute),
    mismatchScore: r.mismatchScore,
    trustScore: r.trustScore,
    publicBadgeEligible: r.publicBadgeEligible,
    verifiedAt: r.verifiedAt ? r.verifiedAt.toISOString() : null,
    lastCheckedAt: r.lastCheckedAt ? r.lastCheckedAt.toISOString() : null,
  }));

  const body: ListVerificationResponse = {
    entries,
    nextCursor: hasMore ? visible[visible.length - 1].userId : null,
  };
  return NextResponse.json(body);
}

/**
 * GET /api/admin/verification/[userId] — single-row detail. 404 when the user
 * has no UserVerification row yet (i.e., never connected GitHub billing).
 *
 * Note: refresh + disconnect endpoints are intentionally NOT implemented in
 * this slice. They depend on the GitHub-billing fetch logic from Verification
 * Task 3.6, which is not yet in this codebase. Reading verification state is
 * useful immediately for triage; mutating it lands when 3.6 does.
 */
export async function verificationDetailHandler(
  req: NextRequest,
  ctx: { params: { userId: string } | Promise<{ userId: string }> },
  deps: HandlerDeps = {},
): Promise<NextResponse> {
  const prisma = deps.prisma ?? defaultPrisma;

  try {
    await requireAdmin(req, { prisma });
  } catch (err) {
    const res = adminAuthErrorToResponse(err);
    if (res) return res;
    throw err;
  }

  const params = await Promise.resolve(ctx.params);
  const row = await prisma.userVerification.findUnique({ where: { userId: params.userId } });
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const user = await prisma.user.findUnique({
    where: { id: row.userId },
    select: { username: true },
  });

  const body: VerificationDetail = {
    userId: row.userId,
    username: user?.username ?? null,
    githubBillingConnected: row.githubBillingConnected,
    githubBillingStatus: row.githubBillingStatus,
    currentPeriodKey: row.currentPeriodKey,
    localPremiumRequests: bigToString(row.localPremiumRequests),
    verifiedPremiumRequests: bigToString(row.verifiedPremiumRequests),
    differenceAbsolute: bigToString(row.differenceAbsolute),
    mismatchScore: row.mismatchScore,
    trustScore: row.trustScore,
    publicBadgeEligible: row.publicBadgeEligible,
    verifiedAt: row.verifiedAt ? row.verifiedAt.toISOString() : null,
    lastCheckedAt: row.lastCheckedAt ? row.lastCheckedAt.toISOString() : null,
    lastHealthyAt: row.lastHealthyAt ? row.lastHealthyAt.toISOString() : null,
    differencePercent: row.differencePercent ? row.differencePercent.toString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
  return NextResponse.json(body);
}

/**
 * Disconnect a user's GitHub-billing verification linkage.
 *
 * Implementable today without the GitHub-billing fetch worker (Verification
 * Task 3.6): we simply zero out the recorded verification state. Refresh,
 * by contrast, requires that worker and stays out of the launch surface.
 *
 * Idempotent: a 200 response is returned whether or not a `UserVerification`
 * row existed. The mutation is wrapped in `withAuditedAction` so the admin
 * action log captures the actor + before/after snapshot.
 */
export async function disconnectVerificationCore(
  prisma: PrismaClient,
  admin: { id: string; email: string },
  userId: string,
  audit: { ipHash: string | null; userAgentHash: string | null },
): Promise<{ ok: true; cleared: boolean } | { error: 'not_found' }> {
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!target) return { error: 'not_found' };

  const before = await prisma.userVerification.findUnique({
    where: { userId: target.id },
  });

  await withAuditedAction(prisma, {
    adminUserId: admin.id,
    adminEmail: admin.email,
    action: 'VERIFICATION_DISCONNECT',
    targetType: 'User',
    targetId: target.id,
    ipHash: audit.ipHash,
    userAgentHash: audit.userAgentHash,
    before: before
      ? {
          githubBillingConnected: before.githubBillingConnected,
          githubBillingStatus: before.githubBillingStatus,
          publicBadgeEligible: before.publicBadgeEligible,
        }
      : null,
    after: {
      githubBillingConnected: false,
      githubBillingStatus: 'NOT_CONNECTED',
      publicBadgeEligible: false,
    },
    run: async () => {
      if (!before) return;
      await prisma.userVerification.update({
        where: { userId: target.id },
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
          // Eligibility resets to false; manual badge overrides remain in
          // AdminBadgeOverride and continue to take precedence on read.
          publicBadgeEligible: false,
        },
      });
    },
  });

  return { ok: true, cleared: !!before };
}

/**
 * POST /api/admin/verification/[userId]/disconnect — admin disconnect handler.
 *
 * Refresh is intentionally NOT exposed at launch: it requires the GitHub-
 * billing fetch worker (Verification Task 3.6). See `docs/launch-readiness-
 * gap-analysis.md` for the launch-claim boundary.
 */
export async function disconnectVerificationHandler(
  req: NextRequest,
  ctx: { params: { userId: string } | Promise<{ userId: string }> },
  deps: HandlerDeps = {},
): Promise<NextResponse> {
  const prisma = deps.prisma ?? defaultPrisma;

  let admin;
  try {
    admin = await requireAdmin(req, { prisma, minRole: 'MODERATOR' });
  } catch (err) {
    const res = adminAuthErrorToResponse(err);
    if (res) return res;
    throw err;
  }

  const params = await Promise.resolve(ctx.params);
  const ip = getClientIpFromHeaders(req.headers);
  const result = await disconnectVerificationCore(
    prisma,
    { id: admin.id, email: admin.email },
    params.userId,
    {
      ipHash: hashIp(ip),
      userAgentHash: hashUserAgent(req.headers.get('user-agent')),
    },
  );
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }
  return NextResponse.json(result);
}