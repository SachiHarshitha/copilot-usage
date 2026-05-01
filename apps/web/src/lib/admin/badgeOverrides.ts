import { NextRequest, NextResponse } from 'next/server';
import type { PrismaClient } from '@prisma/client';

import { prisma as defaultPrisma } from '@/lib/db';
import { adminAuthErrorToResponse, requireAdmin } from '@/lib/admin/requireAdmin';
import { withAuditedAction } from '@/lib/admin/auth/audit';
import { readJson, type AdminActor } from '@/lib/admin/userManagement';

const REASON_MAX = 500;

interface HandlerDeps {
  prisma?: PrismaClient;
}

export interface ActiveBadgeOverride {
  id: string;
  userId: string;
  eligible: boolean;
  reason: string;
  expiresAt: string | null;
  createdAt: string;
  createdById: string | null;
}

/**
 * Look up the most recent non-expired override for a user.
 *
 * "Active" means the most-recently-created row whose `expiresAt` is either
 * null or strictly greater than `now`. We deliberately ignore older rows
 * even if they have not expired yet — a newer row always supersedes an older
 * one regardless of relative expiry, mirroring the append-only semantics in
 * the schema doc-comment.
 */
export async function findActiveBadgeOverride(
  prisma: PrismaClient,
  userId: string,
  now: Date = new Date(),
): Promise<ActiveBadgeOverride | null> {
  const row = await prisma.adminBadgeOverride.findFirst({
    where: {
      userId,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: [{ createdAt: 'desc' }],
  });
  if (!row) return null;
  return {
    id: row.id,
    userId: row.userId,
    eligible: row.eligible,
    reason: row.reason,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    createdById: row.createdById,
  };
}

/**
 * Resolve final badge eligibility by layering an active manual override on top
 * of the value computed by the regular pipeline. When no active override
 * exists, returns `computed` unchanged.
 *
 * Verification Task 4.1's `recomputeBadgeEligibility` is expected to call this
 * as the last step of its computation so the `UserVerification.publicBadgeEligible`
 * column always reflects an outstanding admin decision. C.4 ships this helper
 * up-front so the wiring is a one-line change once Task 4.1 lands.
 */
export async function resolveBadgeEligibility(
  prisma: PrismaClient,
  userId: string,
  computed: boolean,
  now: Date = new Date(),
): Promise<boolean> {
  const override = await findActiveBadgeOverride(prisma, userId, now);
  if (!override) return computed;
  return override.eligible;
}

export interface CreateBadgeOverrideInput {
  eligible: boolean;
  reason: string;
  expiresAt: Date | null;
}

export type CreateBadgeOverrideResult =
  | { ok: true; override: ActiveBadgeOverride }
  | { ok?: false; error: 'not_found' };

/**
 * Insert a `AdminBadgeOverride` row, write an audit record, and mirror the
 * resolved eligibility into `UserVerification.publicBadgeEligible` (when a
 * row exists) so the public surface picks it up immediately.
 *
 * Caller is responsible for authentication + role gating (ADMIN minimum) and
 * for normalising the `reason` and `expiresAt` values. Returns
 * `{ error:'not_found' }` for an unknown userId so REST + server-action
 * call-sites can surface a normal 404.
 */
export async function createBadgeOverrideCore(
  prisma: PrismaClient,
  admin: AdminActor,
  userId: string,
  input: CreateBadgeOverrideInput,
): Promise<CreateBadgeOverrideResult> {
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!target) return { error: 'not_found' };

  const previousVerification = await prisma.userVerification.findUnique({
    where: { userId: target.id },
    select: { publicBadgeEligible: true },
  });

  const created = await withAuditedAction(prisma, {
    adminUserId: admin.id,
    adminEmail: admin.email,
    action: 'BADGE_OVERRIDE_CREATE',
    targetType: 'User',
    targetId: target.id,
    before: previousVerification
      ? { publicBadgeEligible: previousVerification.publicBadgeEligible }
      : { publicBadgeEligible: null },
    after: { publicBadgeEligible: input.eligible },
    metadata: {
      reason: input.reason,
      expiresAt: input.expiresAt ? input.expiresAt.toISOString() : null,
    },
    run: async () => {
      const row = await prisma.adminBadgeOverride.create({
        data: {
          userId: target.id,
          eligible: input.eligible,
          reason: input.reason,
          expiresAt: input.expiresAt,
          createdById: admin.id,
        },
      });
      if (previousVerification) {
        await prisma.userVerification.update({
          where: { userId: target.id },
          data: { publicBadgeEligible: input.eligible },
        });
      }
      return row;
    },
  });

  return {
    ok: true,
    override: {
      id: created.id,
      userId: created.userId,
      eligible: created.eligible,
      reason: created.reason,
      expiresAt: created.expiresAt ? created.expiresAt.toISOString() : null,
      createdAt: created.createdAt.toISOString(),
      createdById: created.createdById,
    },
  };
}

/**
 * POST /api/admin/users/[id]/badge-override — append a manual override.
 *
 * Body: `{ eligible: boolean, reason: string, expiresAt?: string|null, confirm: true }`.
 * ADMIN role required — overrides bypass the verification pipeline entirely
 * so this is one rung above MODERATOR.
 */
export async function createBadgeOverrideHandler(
  req: NextRequest,
  ctx: { params: { id: string } | Promise<{ id: string }> },
  deps: HandlerDeps = {},
): Promise<NextResponse> {
  const prisma = deps.prisma ?? defaultPrisma;

  let admin: AdminActor;
  try {
    admin = await requireAdmin(req, { prisma, minRole: 'ADMIN' });
  } catch (err) {
    const res = adminAuthErrorToResponse(err);
    if (res) return res;
    throw err;
  }

  const params = await Promise.resolve(ctx.params);
  const body = await readJson<{
    eligible?: unknown;
    reason?: unknown;
    expiresAt?: unknown;
    confirm?: unknown;
  }>(req);
  if (!body || body.confirm !== true) {
    return NextResponse.json({ error: 'confirm_required' }, { status: 400 });
  }
  if (typeof body.eligible !== 'boolean') {
    return NextResponse.json({ error: 'eligible_required' }, { status: 400 });
  }
  if (typeof body.reason !== 'string' || body.reason.trim().length === 0) {
    return NextResponse.json({ error: 'reason_required' }, { status: 400 });
  }

  let expiresAt: Date | null = null;
  if (body.expiresAt !== undefined && body.expiresAt !== null && body.expiresAt !== '') {
    if (typeof body.expiresAt !== 'string') {
      return NextResponse.json({ error: 'expires_at_invalid' }, { status: 400 });
    }
    const parsed = new Date(body.expiresAt);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json({ error: 'expires_at_invalid' }, { status: 400 });
    }
    if (parsed.getTime() <= Date.now()) {
      return NextResponse.json({ error: 'expires_at_in_past' }, { status: 400 });
    }
    expiresAt = parsed;
  }

  const result = await createBadgeOverrideCore(prisma, admin, params.id, {
    eligible: body.eligible,
    reason: body.reason.trim().slice(0, REASON_MAX),
    expiresAt,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }
  return NextResponse.json({ ok: true, override: result.override }, { status: 201 });
}
