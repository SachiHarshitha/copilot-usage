import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  AgentSnapshotSchema,
  findForbiddenFields,
  type AgentSnapshot,
} from '@copilot-usage/shared-schema';
import { checkRateLimit } from '@/lib/ratelimit';
import bcrypt from 'bcryptjs';
import { createHash } from 'crypto';
import { aggregateCanonical, writeCanonical } from '@/lib/agent-ingest';
import { detectPayloadVersion } from '@/lib/upload-translate';
import { getUploadClientIp, isTrustedUploadProxyRequest } from '@/lib/upload-security';

interface RejectedUploadLogInput {
  userId: string;
  deviceId: string;
  tokenId?: string | null;
  ipHash: string;
  userAgentHash?: string | null;
  payloadBytes: number;
  payloadHash?: string | null;
  bucketCount?: number;
  earliestDate?: Date | null;
  latestDate?: Date | null;
  rejectionCode?: string;
}

/**
 * Best-effort audit row written for every upload (accepted or rejected).
 * Today no signed-upload protocol is wired, so `signatureStatus` is always
 * `MISSING`. Once verification Task 3.x lands, callers will pass the
 * resolved status (VALID / INVALID / STALE_TIMESTAMP / REPLAYED_NONCE / …).
 *
 * Failures are swallowed because the audit row must never block an upload
 * response — the primary `UploadLog` row remains the source of truth for
 * accept/reject and is still written by the existing call sites.
 */
async function recordUploadAudit(input: {
  userId: string;
  deviceId: string;
  tokenId?: string | null;
  ipHash: string;
  userAgentHash?: string | null;
  payloadHash?: string | null;
  accepted: boolean;
  rejectionCode?: string | null;
  signatureStatus?:
    | 'VALID'
    | 'MISSING'
    | 'INVALID'
    | 'STALE_TIMESTAMP'
    | 'REPLAYED_NONCE'
    | 'BODY_HASH_MISMATCH'
    | 'DEVICE_REVOKED';
  clientTimestamp?: Date | null;
  clientVersion?: string | null;
}): Promise<void> {
  try {
    await prisma.uploadAudit.create({
      data: {
        userId: input.userId,
        deviceId: input.deviceId,
        tokenId: input.tokenId ?? null,
        clientTimestamp: input.clientTimestamp ?? null,
        clientVersion: input.clientVersion ?? null,
        payloadHash: input.payloadHash ?? null,
        signatureStatus: input.signatureStatus ?? 'MISSING',
        accepted: input.accepted,
        rejectionCode: input.rejectionCode ?? null,
        ipHash: input.ipHash,
        userAgentHash: input.userAgentHash ?? null,
      },
    });
  } catch {
    // Best effort only — never block uploads on audit failures.
  }
}

async function logRejectedUpload({
  userId,
  deviceId,
  tokenId = null,
  ipHash,
  userAgentHash = null,
  payloadBytes,
  payloadHash = null,
  bucketCount = 0,
  earliestDate = null,
  latestDate = null,
  rejectionCode,
}: RejectedUploadLogInput): Promise<void> {
  try {
    await prisma.uploadLog.create({
      data: {
        userId,
        deviceId,
        ipHash,
        payloadBytes,
        bucketCount,
        earliestDate,
        latestDate,
        accepted: false,
      },
    });
  } catch {
    // Best effort only.
  }
  await recordUploadAudit({
    userId,
    deviceId,
    tokenId,
    ipHash,
    userAgentHash,
    payloadHash,
    accepted: false,
    rejectionCode: rejectionCode ?? null,
  });
}

/**
 * POST /api/upload
 * Authenticated upload endpoint. Validates payload, upserts canonical v2 facts/rollups.
 */
export async function POST(request: NextRequest) {
  if (!isTrustedUploadProxyRequest(request.headers)) {
    return NextResponse.json({ error: 'Upload request is not from a trusted proxy.' }, { status: 403 });
  }

  // --- Authenticate via split device token ---
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing Bearer token.' }, { status: 401 });
  }

  const fullToken = authHeader.slice(7);
  const dotIndex = fullToken.indexOf('.');
  if (dotIndex === -1) {
    return NextResponse.json({ error: 'Invalid token format.' }, { status: 401 });
  }

  const tokenId = fullToken.slice(0, dotIndex);
  const secret = fullToken.slice(dotIndex + 1);

  const device = await prisma.device.findUnique({
    where: { tokenId },
    include: { user: true },
  });

  if (!device || device.revokedAt) {
    return NextResponse.json({ error: 'Invalid or revoked token.' }, { status: 401 });
  }

  // Reject uploads from suspended or soft-deleted accounts. Admin actions
  // (suspend / soft-delete) take effect on the next upload because we check
  // the user's lifecycle state on every request.
  if (device.user.status !== 'ACTIVE' || device.user.deletedAt !== null) {
    return NextResponse.json({ error: 'Account suspended.' }, { status: 401 });
  }

  const secretValid = await bcrypt.compare(secret, device.secretHash);
  if (!secretValid) {
    return NextResponse.json({ error: 'Invalid token.' }, { status: 401 });
  }

  const userId = device.userId;
  const deviceId = device.id;
  const ipHash = createHash('sha256').update(getUploadClientIp(request.headers)).digest('hex');

  // --- Rate limit ---
  const rateCheck = await checkRateLimit({ deviceId, userId, ipHash });
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded.' },
      { status: 429, headers: { 'Retry-After': String(rateCheck.retryAfterSeconds) } }
    );
  }

  // --- Parse and validate payload ---
  let body: unknown;
  let rawPayload = '';
  try {
    rawPayload = await request.text();
    if (rawPayload.length > 65536) {
      await logRejectedUpload({
        userId,
        deviceId,
        ipHash,
        payloadBytes: rawPayload.length,
      });
      return NextResponse.json({ error: 'Payload too large (64KB max).' }, { status: 413 });
    }
    body = JSON.parse(rawPayload);
  } catch {
    await logRejectedUpload({
      userId,
      deviceId,
      ipHash,
      payloadBytes: rawPayload.length,
    });
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  const payloadBytes = rawPayload.length;

  // --- Forbidden-content denylist ---
  // Reject payloads that contain raw user content (prompts, completions,
  // code, terminal output, secrets, diffs, chat transcripts, etc.) at any
  // depth. We log only field *names*, never values, so the audit trail
  // never echoes private data. See acceptance criteria §1.
  const forbidden = findForbiddenFields(body, {
    allowList: new Set(['source']),
  });
  if (forbidden.length > 0) {
    await logRejectedUpload({
      userId,
      deviceId,
      ipHash,
      payloadBytes,
    });
    return NextResponse.json(
      {
        error: 'Forbidden content fields rejected.',
        reason: 'forbidden_field',
        fields: forbidden,
      },
      { status: 400 }
    );
  }

  // Dispatch on payload contract version. Runtime is v2-only.
  const version = detectPayloadVersion(body);
  const userAgentHash = createHash('sha256')
    .update(request.headers.get('user-agent') ?? '')
    .digest('hex');
  const payloadHash = createHash('sha256').update(rawPayload).digest('hex');

  if (version !== 'v2') {
    await logRejectedUpload({
      userId,
      deviceId,
      tokenId,
      ipHash,
      userAgentHash,
      payloadBytes,
      payloadHash,
      rejectionCode: 'unsupported_schema_version',
    });
    return NextResponse.json(
      {
        error: 'Unsupported upload schema. Only schemaVersion=2 payloads are accepted.',
        reason: 'unsupported_schema_version',
      },
      { status: 400 }
    );
  }

  return handleV2Upload({
    body,
    userId,
    deviceId,
    tokenId,
    ipHash,
    userAgentHash,
    payloadHash,
    payloadBytes,
  });
}

// ---------------------------------------------------------------------------
// V2 (agent-agnostic) upload handler
//
// Validates an `AgentSnapshot`, enforces the same time-window guard as the
// legacy path, then writes only the canonical (v2) tables. Legacy tables are
// not touched because v2 payloads may originate from non-Copilot adapters.
// ---------------------------------------------------------------------------
async function handleV2Upload({
  body,
  userId,
  deviceId,
  tokenId,
  ipHash,
  userAgentHash,
  payloadHash,
  payloadBytes,
}: {
  body: unknown;
  userId: string;
  deviceId: string;
  tokenId: string;
  ipHash: string;
  userAgentHash: string;
  payloadHash: string;
  payloadBytes: number;
}): Promise<NextResponse> {
  const parsed = AgentSnapshotSchema.safeParse(body);
  if (!parsed.success) {
    await logRejectedUpload({
      userId,
      deviceId,
      tokenId,
      ipHash,
      userAgentHash,
      payloadBytes,
      payloadHash,
      rejectionCode: 'v2_validation_failed',
    });
    return NextResponse.json(
      { error: 'Validation failed.', details: parsed.error.issues.slice(0, 5) },
      { status: 400 }
    );
  }

  const snapshot: AgentSnapshot = parsed.data;

  const observed = new Date(snapshot.observedAt).getTime();
  const now = Date.now();
  if (observed < now - 24 * 60 * 60 * 1000 || observed > now + 5 * 60 * 1000) {
    await logRejectedUpload({
      userId,
      deviceId,
      tokenId,
      ipHash,
      userAgentHash,
      payloadBytes,
      payloadHash,
      rejectionCode: 'v2_stale_observed_at',
    });
    return NextResponse.json(
      { error: 'observedAt is out of allowed time window.' },
      { status: 400 }
    );
  }

  const canonical = aggregateCanonical(snapshot);

  try {
    await prisma.$transaction(async (tx) => {
      await writeCanonical(tx, userId, deviceId, canonical);
    });

    await prisma.device.update({
      where: { id: deviceId },
      data: { lastSeenAt: new Date() },
    });
  } catch (err) {
    console.error('V2 upload transaction failed:', err);
    await prisma.uploadLog.create({
      data: {
        userId,
        deviceId,
        ipHash,
        payloadBytes,
        bucketCount: snapshot.dailyBuckets?.length ?? 0,
        earliestDate: null,
        latestDate: null,
        accepted: false,
      },
    });
    await recordUploadAudit({
      userId,
      deviceId,
      tokenId,
      ipHash,
      userAgentHash,
      payloadHash,
      accepted: false,
      rejectionCode: 'v2_transaction_failed',
      clientTimestamp: new Date(snapshot.observedAt),
    });
    return NextResponse.json({ error: 'Internal server error during upload.' }, { status: 500 });
  }

  const log = await prisma.uploadLog.create({
    data: {
      userId,
      deviceId,
      ipHash,
      payloadBytes,
      bucketCount: snapshot.dailyBuckets?.length ?? 0,
      earliestDate: null,
      latestDate: null,
      accepted: true,
    },
  });

  await recordUploadAudit({
    userId,
    deviceId,
    tokenId,
    ipHash,
    userAgentHash,
    payloadHash,
    accepted: true,
    clientTimestamp: new Date(snapshot.observedAt),
  });

  return NextResponse.json({ ok: true, logId: log.id, contract: 'v2' });
}
