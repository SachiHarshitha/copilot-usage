import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  AgentSnapshotSchema,
  SnapshotPayloadSchema,
  findForbiddenFields,
  type AgentSnapshot,
} from '@copilot-usage/shared-schema';
import { checkRateLimit } from '@/lib/ratelimit';
import bcrypt from 'bcryptjs';
import { createHash } from 'crypto';
import { computeStreaks } from '@/lib/streak';
import { aggregateCanonical, writeCanonical } from '@/lib/agent-ingest';
import { detectPayloadVersion, translateV1ToV2 } from '@/lib/upload-translate';
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
 * Authenticated upload endpoint. Validates payload, upserts UsageDaily + UserStat + RepoStat.
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
  const forbidden = findForbiddenFields(body);
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

  // Dispatch on payload contract version. Both legacy (v1) and canonical
  // (v2) snapshots are accepted during the migration window.
  const version = detectPayloadVersion(body);

  if (version === 'v2') {
    return handleV2Upload({
      body,
      userId,
      deviceId,
      tokenId,
      ipHash,
      userAgentHash: createHash('sha256')
        .update(request.headers.get('user-agent') ?? '')
        .digest('hex'),
      payloadHash: createHash('sha256').update(rawPayload).digest('hex'),
      payloadBytes,
    });
  }

  const parsed = SnapshotPayloadSchema.safeParse(body);
  if (!parsed.success) {
    await logRejectedUpload({
      userId,
      deviceId,
      ipHash,
      payloadBytes,
    });
    return NextResponse.json(
      { error: 'Validation failed.', details: parsed.error.issues.slice(0, 5) },
      { status: 400 }
    );
  }

  const payload = parsed.data;
  const canonical = aggregateCanonical(
    translateV1ToV2(payload, payload.clientUploadedAt)
  );

  // --- Time window check ---
  const clientTime = new Date(payload.clientUploadedAt).getTime();
  const now = Date.now();
  if (clientTime < now - 24 * 60 * 60 * 1000 || clientTime > now + 5 * 60 * 1000) {
    await logRejectedUpload({
      userId,
      deviceId,
      ipHash,
      payloadBytes,
      bucketCount: payload.dailyBuckets.length,
      earliestDate: payload.dailyBuckets.length > 0 ? new Date(payload.dailyBuckets[0].date) : null,
      latestDate: payload.dailyBuckets.length > 0 ? new Date(payload.dailyBuckets[payload.dailyBuckets.length - 1].date) : null,
    });
    return NextResponse.json({ error: 'clientUploadedAt is out of allowed time window.' }, { status: 400 });
  }

  // --- Validate daily bucket dates ---
  for (const bucket of payload.dailyBuckets) {
    if (new Date(bucket.date).getTime() > clientTime) {
      await logRejectedUpload({
        userId,
        deviceId,
        ipHash,
        payloadBytes,
        bucketCount: payload.dailyBuckets.length,
        earliestDate: payload.dailyBuckets.length > 0 ? new Date(payload.dailyBuckets[0].date) : null,
        latestDate: payload.dailyBuckets.length > 0 ? new Date(payload.dailyBuckets[payload.dailyBuckets.length - 1].date) : null,
      });
      return NextResponse.json({ error: `Daily bucket date ${bucket.date} is in the future.` }, { status: 400 });
    }
  }

  // --- Single transaction: upsert UsageDaily + recompute UserStat + upsert RepoStat ---
  try {
    await prisma.$transaction(async (tx) => {
      // 1. Upsert UsageDaily for each daily bucket
      for (const bucket of payload.dailyBuckets) {
        const bucketDate = new Date(bucket.date);
        const totalTokens = bucket.promptTokens + bucket.outputTokens;
        await tx.usageDaily.upsert({
          where: {
            userId_deviceId_date: { userId, deviceId, date: bucketDate },
          },
          update: {
            totalRequests: bucket.requests,
            promptTokens: bucket.promptTokens,
            outputTokens: bucket.outputTokens,
            totalTokens,
            premiumRequests: bucket.premiumRequests,
          },
          create: {
            userId,
            deviceId,
            date: bucketDate,
            totalRequests: bucket.requests,
            promptTokens: bucket.promptTokens,
            outputTokens: bucket.outputTokens,
            totalTokens,
            premiumRequests: bucket.premiumRequests,
          },
        });
      }

      // 2. Recompute UserStat from all UsageDaily rows for this user
      const agg = await tx.usageDaily.aggregate({
        where: { userId },
        _sum: {
          totalRequests: true,
          promptTokens: true,
          outputTokens: true,
          totalTokens: true,
          premiumRequests: true,
        },
      });

      const usageRows = await tx.usageDaily.findMany({
        where: { userId },
        select: {
          date: true,
          totalTokens: true,
        },
        orderBy: { date: 'asc' },
      });

      const { currentStreakDays, bestStreakDays } = computeStreaks(usageRows);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const weekStart = new Date(today);
      weekStart.setDate(weekStart.getDate() - 6);

      const rolling30Start = new Date(today);
      rolling30Start.setDate(rolling30Start.getDate() - 29);

      let weeklyTokens = BigInt(0);
      let rolling30DayTokens = BigInt(0);
      for (const row of usageRows) {
        const bucketDate = new Date(row.date);
        bucketDate.setHours(0, 0, 0, 0);
        if (bucketDate >= weekStart) {
          weeklyTokens += row.totalTokens;
        }
        if (bucketDate >= rolling30Start) {
          rolling30DayTokens += row.totalTokens;
        }
      }

      // Find top model from the payload's model breakdown
      let topModel: string | null = null;
      if (payload.modelBreakdown.length > 0) {
        topModel = payload.modelBreakdown.reduce((a, b) => (b.requests > a.requests ? b : a)).modelId;
      }

      await tx.userStat.upsert({
        where: { userId },
        update: {
          totalRequests: agg._sum.totalRequests || 0,
          promptTokens: agg._sum.promptTokens || BigInt(0),
          outputTokens: agg._sum.outputTokens || BigInt(0),
          totalTokens: agg._sum.totalTokens || BigInt(0),
          weeklyTokens,
          rolling30DayTokens,
          premiumRequests: agg._sum.premiumRequests || 0,
          currentStreakDays,
          bestStreakDays,
          workspaceCount: payload.workspaceCount,
          sessionCount: payload.sessionCount,
          topModel,
          lastSyncedAt: new Date(),
        },
        create: {
          userId,
          totalRequests: agg._sum.totalRequests || 0,
          promptTokens: agg._sum.promptTokens || BigInt(0),
          outputTokens: agg._sum.outputTokens || BigInt(0),
          totalTokens: agg._sum.totalTokens || BigInt(0),
          weeklyTokens,
          rolling30DayTokens,
          premiumRequests: agg._sum.premiumRequests || 0,
          currentStreakDays,
          bestStreakDays,
          workspaceCount: payload.workspaceCount,
          sessionCount: payload.sessionCount,
          topModel,
          lastSyncedAt: new Date(),
        },
      });

      // 3. Upsert RepoStat for each repo entry
      for (const repo of payload.repos) {
        const repoIdentity =
          repo.displayMode === 'github'
            ? `github:${repo.githubRepo}`
            : `alias:${repo.aliasLabel}`;

        await tx.repoStat.upsert({
          where: { userId_repoIdentity: { userId, repoIdentity } },
          update: {
            displayMode: repo.displayMode,
            githubRepo: repo.githubRepo,
            aliasLabel: repo.aliasLabel,
            requests: repo.requests,
            promptTokens: repo.promptTokens,
            outputTokens: repo.outputTokens,
            totalTokens: repo.promptTokens + repo.outputTokens,
            tokens30d: repo.promptTokens + repo.outputTokens,
            premiumReqs: repo.premiumRequests,
            topModel: repo.topModel,
            lastSyncedAt: new Date(),
          },
          create: {
            userId,
            repoIdentity,
            displayMode: repo.displayMode,
            githubRepo: repo.githubRepo,
            aliasLabel: repo.aliasLabel,
            requests: repo.requests,
            promptTokens: repo.promptTokens,
            outputTokens: repo.outputTokens,
            totalTokens: repo.promptTokens + repo.outputTokens,
            tokens30d: repo.promptTokens + repo.outputTokens,
            premiumReqs: repo.premiumRequests,
            topModel: repo.topModel,
          },
        });
      }

      // 4. Canonical (v2) writes: ProductStat / ProviderStat / ModelStat etc.
      //    Additive — does not affect legacy reads.
      await writeCanonical(tx, userId, deviceId, canonical);
    });

    // Update device last seen
    await prisma.device.update({
      where: { id: deviceId },
      data: { lastSeenAt: new Date() },
    });
  } catch (err) {
    console.error('Upload transaction failed:', err);
    // Log failed upload
    await prisma.uploadLog.create({
      data: {
        userId,
        deviceId,
        ipHash,
        payloadBytes,
        bucketCount: payload.dailyBuckets.length,
        earliestDate: payload.dailyBuckets.length > 0 ? new Date(payload.dailyBuckets[0].date) : null,
        latestDate: payload.dailyBuckets.length > 0 ? new Date(payload.dailyBuckets[payload.dailyBuckets.length - 1].date) : null,
        accepted: false,
      },
    });
    await recordUploadAudit({
      userId,
      deviceId,
      tokenId,
      ipHash,
      userAgentHash: createHash('sha256')
        .update(request.headers.get('user-agent') ?? '')
        .digest('hex'),
      payloadHash: createHash('sha256').update(rawPayload).digest('hex'),
      accepted: false,
      rejectionCode: 'v1_transaction_failed',
      clientTimestamp: new Date(payload.clientUploadedAt),
    });

    return NextResponse.json({ error: 'Internal server error during upload.' }, { status: 500 });
  }

  // --- Audit log (best-effort, outside transaction) ---
  const log = await prisma.uploadLog.create({
    data: {
      userId,
      deviceId,
      ipHash,
      payloadBytes,
      bucketCount: payload.dailyBuckets.length,
      earliestDate: payload.dailyBuckets.length > 0 ? new Date(payload.dailyBuckets[0].date) : null,
      latestDate: payload.dailyBuckets.length > 0 ? new Date(payload.dailyBuckets[payload.dailyBuckets.length - 1].date) : null,
      accepted: true,
    },
  });

  await recordUploadAudit({
    userId,
    deviceId,
    tokenId,
    ipHash,
    userAgentHash: createHash('sha256')
      .update(request.headers.get('user-agent') ?? '')
      .digest('hex'),
    payloadHash: createHash('sha256').update(rawPayload).digest('hex'),
    accepted: true,
    clientTimestamp: new Date(payload.clientUploadedAt),
  });

  return NextResponse.json({ ok: true, logId: log.id });
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
