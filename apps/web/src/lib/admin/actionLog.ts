import { NextRequest, NextResponse } from 'next/server';
import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';

import { prisma as defaultPrisma } from '@/lib/db';
import { adminAuthErrorToResponse, requireAdmin } from '@/lib/admin/requireAdmin';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

interface HandlerDeps {
  prisma?: PrismaClient;
}

export interface ActionLogEntry {
  id: string;
  adminUserId: string | null;
  adminEmailHash: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  before: unknown;
  after: unknown;
  metadata: unknown;
  createdAt: string;
}

export interface ActionLogResponse {
  entries: ActionLogEntry[];
  nextCursor: string | null;
}

/**
 * GET /api/admin/action-log — read-only audit log. NO mutations. Filters
 * compose; cursor pagination keyed on `id`. The response intentionally
 * surfaces the email-hash, not the email — auditors correlate via hash.
 *
 * Read-only access for any authenticated admin (READ_ONLY upward).
 */
export async function listActionLogHandler(
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
  const adminUserId = params.get('adminUserId') || undefined;
  const targetType = params.get('targetType') || undefined;
  const targetId = params.get('targetId') || undefined;
  const action = params.get('action') || undefined;
  const fromRaw = params.get('from');
  const toRaw = params.get('to');
  const cursor = params.get('cursor');
  const rawLimit = parseInt(params.get('limit') ?? '', 10);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0
    ? Math.min(rawLimit, MAX_LIMIT)
    : DEFAULT_LIMIT;

  const from = fromRaw ? new Date(fromRaw) : null;
  const to = toRaw ? new Date(toRaw) : null;
  if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) {
    return NextResponse.json({ error: 'invalid_date' }, { status: 400 });
  }

  const where: Prisma.AdminActionLogWhereInput = {};
  if (adminUserId) where.adminUserId = adminUserId;
  if (targetType) where.targetType = targetType;
  if (targetId) where.targetId = targetId;
  if (action) where.action = action;
  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: from } : {}),
      ...(to ? { lte: to } : {}),
    };
  }

  const rows = await prisma.adminActionLog.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      adminUserId: true,
      adminEmailHash: true,
      action: true,
      targetType: true,
      targetId: true,
      before: true,
      after: true,
      metadata: true,
      createdAt: true,
    },
  });

  const hasMore = rows.length > limit;
  const visible = hasMore ? rows.slice(0, limit) : rows;
  const entries: ActionLogEntry[] = visible.map((r) => ({
    id: r.id,
    adminUserId: r.adminUserId,
    adminEmailHash: r.adminEmailHash,
    action: r.action,
    targetType: r.targetType,
    targetId: r.targetId,
    before: r.before,
    after: r.after,
    metadata: r.metadata,
    createdAt: r.createdAt.toISOString(),
  }));

  const body: ActionLogResponse = {
    entries,
    nextCursor: hasMore ? visible[visible.length - 1].id : null,
  };
  return NextResponse.json(body);
}
