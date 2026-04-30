import { NextRequest, NextResponse } from 'next/server';
import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';

import { prisma as defaultPrisma } from '@/lib/db';
import { adminAuthErrorToResponse, requireAdmin } from '@/lib/admin/requireAdmin';
import { withAuditedAction } from '@/lib/admin/auth/audit';
import { readJson, type AdminActor } from '@/lib/admin/userManagement';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

interface HandlerDeps {
  prisma?: PrismaClient;
}

export interface AnomalyEntry {
  id: string;
  userId: string;
  code: string;
  severity: string;
  summary: string;
  detectedAt: string;
  resolvedAt: string | null;
  resolution: string | null;
}

export interface ListAnomaliesResponse {
  entries: AnomalyEntry[];
  nextCursor: string | null;
}

export interface AnomalyDetail extends AnomalyEntry {
  detailsJson: unknown;
}

/**
 * GET /api/admin/anomalies — paginated, filterable list of verification
 * anomalies. Read-only; any authenticated admin may view.
 *
 * Filters (all optional, all compose):
 * - severity: LOW|MEDIUM|HIGH|CRITICAL
 * - code: see VerificationAnomalyCode
 * - unresolved=true: only rows with resolvedAt IS NULL
 * - userId: scope to one user
 * - cursor / limit: cursor pagination keyed on id; limit clamped to MAX_LIMIT.
 *
 * Default sort is detectedAt DESC, id DESC for deterministic ordering when
 * many rows share the same detectedAt.
 */
export async function listAnomaliesHandler(
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
  const severity = params.get('severity') || undefined;
  const code = params.get('code') || undefined;
  const userId = params.get('userId') || undefined;
  const unresolved = params.get('unresolved') === 'true';
  const cursor = params.get('cursor');
  const rawLimit = parseInt(params.get('limit') ?? '', 10);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0
    ? Math.min(rawLimit, MAX_LIMIT)
    : DEFAULT_LIMIT;

  const where: Prisma.VerificationAnomalyWhereInput = {};
  if (severity) where.severity = severity as Prisma.VerificationAnomalyWhereInput['severity'];
  if (code) where.code = code as Prisma.VerificationAnomalyWhereInput['code'];
  if (userId) where.userId = userId;
  if (unresolved) where.resolvedAt = null;

  const rows = await prisma.verificationAnomaly.findMany({
    where,
    orderBy: [{ detectedAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      userId: true,
      code: true,
      severity: true,
      summary: true,
      detectedAt: true,
      resolvedAt: true,
      resolution: true,
    },
  });

  const hasMore = rows.length > limit;
  const visible = hasMore ? rows.slice(0, limit) : rows;
  const entries: AnomalyEntry[] = visible.map((r) => ({
    id: r.id,
    userId: r.userId,
    code: r.code,
    severity: r.severity,
    summary: r.summary,
    detectedAt: r.detectedAt.toISOString(),
    resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
    resolution: r.resolution,
  }));

  const body: ListAnomaliesResponse = {
    entries,
    nextCursor: hasMore ? visible[visible.length - 1].id : null,
  };
  return NextResponse.json(body);
}

/**
 * GET /api/admin/anomalies/[id] — single-row detail including the opaque
 * detailsJson blob. Read-only.
 */
export async function anomalyDetailHandler(
  req: NextRequest,
  ctx: { params: { id: string } | Promise<{ id: string }> },
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
  const row = await prisma.verificationAnomaly.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      userId: true,
      code: true,
      severity: true,
      summary: true,
      detectedAt: true,
      resolvedAt: true,
      resolution: true,
      detailsJson: true,
    },
  });
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const body: AnomalyDetail = {
    id: row.id,
    userId: row.userId,
    code: row.code,
    severity: row.severity,
    summary: row.summary,
    detectedAt: row.detectedAt.toISOString(),
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
    resolution: row.resolution,
    detailsJson: row.detailsJson,
  };
  return NextResponse.json(body);
}

/**
 * POST /api/admin/anomalies/[id]/resolve — marks an open anomaly resolved.
 * Body: { resolution: string, confirm: true }. Idempotent: returns ok with
 * `noop: true` when already resolved. MODERATOR or higher.
 */
export async function resolveAnomalyHandler(
  req: NextRequest,
  ctx: { params: { id: string } | Promise<{ id: string }> },
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
  const body = await readJson<{ confirm?: boolean; resolution?: unknown }>(req);
  if (!body || body.confirm !== true) {
    return NextResponse.json({ error: 'confirm_required' }, { status: 400 });
  }
  if (typeof body.resolution !== 'string' || body.resolution.trim().length === 0) {
    return NextResponse.json({ error: 'resolution_required' }, { status: 400 });
  }

  const result = await resolveAnomalyCore(prisma, admin, params.id, body.resolution);
  if (result.error === 'not_found') {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, ...(result.noop ? { noop: true } : {}) });
}

export type ResolveAnomalyResult =
  | { ok: true; noop?: boolean; error?: undefined }
  | { ok?: false; noop?: undefined; error: 'not_found' };

/**
 * Mark an open anomaly resolved. Idempotent — when the row is already
 * resolved, returns `{ ok:true, noop:true }` without emitting another audit
 * row. Shared between the REST handler and the admin server action so both
 * surfaces stay in lock-step.
 *
 * The caller is responsible for authentication + role gating
 * (`MODERATOR` minimum) and for trimming the resolution string above the
 * 500-char cap. Returns `{ error:'not_found' }` for an unknown id rather
 * than throwing, since both call sites want to surface that as a normal HTTP
 * 404 response.
 */
export async function resolveAnomalyCore(
  prisma: PrismaClient,
  admin: AdminActor,
  anomalyId: string,
  resolutionRaw: string,
): Promise<ResolveAnomalyResult> {
  const resolution = resolutionRaw.trim().slice(0, 500);
  const row = await prisma.verificationAnomaly.findUnique({
    where: { id: anomalyId },
    select: { id: true, resolvedAt: true, code: true, severity: true, userId: true },
  });
  if (!row) return { error: 'not_found' };
  if (row.resolvedAt) return { ok: true, noop: true };

  const resolvedAt = new Date();
  await withAuditedAction(prisma, {
    adminUserId: admin.id,
    adminEmail: admin.email,
    action: 'ANOMALY_RESOLVE',
    targetType: 'VerificationAnomaly',
    targetId: row.id,
    before: { resolvedAt: null },
    after: { resolvedAt: resolvedAt.toISOString(), resolution },
    metadata: { code: row.code, severity: row.severity, userId: row.userId },
    run: async () => {
      await prisma.verificationAnomaly.update({
        where: { id: row.id },
        data: { resolvedAt, resolution },
      });
    },
  });

  return { ok: true };
}
