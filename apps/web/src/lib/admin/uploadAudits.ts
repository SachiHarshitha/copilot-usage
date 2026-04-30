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

export interface UploadAuditEntry {
  id: string;
  userId: string;
  deviceId: string | null;
  tokenId: string | null;
  receivedAt: string;
  clientTimestamp: string | null;
  clientVersion: string | null;
  payloadHash: string | null;
  signatureStatus: string;
  chainHead: string | null;
  previousChainHead: string | null;
  accepted: boolean;
  rejectionCode: string | null;
}

export interface ListUploadAuditsResponse {
  entries: UploadAuditEntry[];
  nextCursor: string | null;
}

/**
 * GET /api/admin/upload-audits — paginated, filterable search over the
 * upload audit log. Read-only; any authenticated admin may view. ipHash and
 * userAgentHash are deliberately omitted from the projection so that the
 * default triage view never surfaces them.
 *
 * Filters (all optional, all compose):
 * - userId, tokenId, deviceId: exact match
 * - signatureStatus: see UploadSignatureStatus enum
 * - accepted=true|false: filter by acceptance
 * - from / to: ISO timestamps, inclusive lower / exclusive upper bound on
 *   receivedAt
 * - cursor / limit: cursor pagination keyed on id
 *
 * Sort is receivedAt DESC, id DESC for deterministic ordering when many rows
 * share the same receivedAt.
 */
export async function listUploadAuditsHandler(
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
  const userId = params.get('userId') || undefined;
  const tokenId = params.get('tokenId') || undefined;
  const deviceId = params.get('deviceId') || undefined;
  const signatureStatus = params.get('signatureStatus') || undefined;
  const acceptedRaw = params.get('accepted');
  const from = params.get('from');
  const to = params.get('to');
  const cursor = params.get('cursor');
  const rawLimit = parseInt(params.get('limit') ?? '', 10);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0
    ? Math.min(rawLimit, MAX_LIMIT)
    : DEFAULT_LIMIT;

  const where: Prisma.UploadAuditWhereInput = {};
  if (userId) where.userId = userId;
  if (tokenId) where.tokenId = tokenId;
  if (deviceId) where.deviceId = deviceId;
  if (signatureStatus) {
    where.signatureStatus = signatureStatus as Prisma.UploadAuditWhereInput['signatureStatus'];
  }
  if (acceptedRaw === 'true') where.accepted = true;
  else if (acceptedRaw === 'false') where.accepted = false;
  if (from || to) {
    where.receivedAt = {};
    if (from) {
      const d = new Date(from);
      if (!Number.isNaN(d.getTime())) (where.receivedAt as Prisma.DateTimeFilter).gte = d;
    }
    if (to) {
      const d = new Date(to);
      if (!Number.isNaN(d.getTime())) (where.receivedAt as Prisma.DateTimeFilter).lt = d;
    }
  }

  const rows = await prisma.uploadAudit.findMany({
    where,
    orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      userId: true,
      deviceId: true,
      tokenId: true,
      receivedAt: true,
      clientTimestamp: true,
      clientVersion: true,
      payloadHash: true,
      signatureStatus: true,
      chainHead: true,
      previousChainHead: true,
      accepted: true,
      rejectionCode: true,
    },
  });

  const hasMore = rows.length > limit;
  const visible = hasMore ? rows.slice(0, limit) : rows;
  const entries: UploadAuditEntry[] = visible.map((r) => ({
    id: r.id,
    userId: r.userId,
    deviceId: r.deviceId,
    tokenId: r.tokenId,
    receivedAt: r.receivedAt.toISOString(),
    clientTimestamp: r.clientTimestamp ? r.clientTimestamp.toISOString() : null,
    clientVersion: r.clientVersion,
    payloadHash: r.payloadHash,
    signatureStatus: r.signatureStatus,
    chainHead: r.chainHead,
    previousChainHead: r.previousChainHead,
    accepted: r.accepted,
    rejectionCode: r.rejectionCode,
  }));

  const body: ListUploadAuditsResponse = {
    entries,
    nextCursor: hasMore ? visible[visible.length - 1].id : null,
  };
  return NextResponse.json(body);
}
