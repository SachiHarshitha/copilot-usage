import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { SnapshotPayloadSchema } from '@copilot-usage/shared-schema';
import { checkRateLimit } from '@/lib/ratelimit';
import bcrypt from 'bcryptjs';
import { createHash } from 'crypto';
import { computeStreaks } from '@/lib/streak';

/**
 * POST /api/upload
 * Authenticated upload endpoint. Validates payload, upserts UsageDaily + UserStat + RepoStat.
 */
export async function POST(request: NextRequest) {
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

  const secretValid = await bcrypt.compare(secret, device.secretHash);
  if (!secretValid) {
    return NextResponse.json({ error: 'Invalid token.' }, { status: 401 });
  }

  const userId = device.userId;
  const deviceId = device.id;

  // --- Rate limit ---
  const rateCheck = await checkRateLimit(deviceId);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded.' },
      { status: 429, headers: { 'Retry-After': String(rateCheck.retryAfterSeconds) } }
    );
  }

  // --- Parse and validate payload ---
  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 65536) {
      return NextResponse.json({ error: 'Payload too large (64KB max).' }, { status: 413 });
    }
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  const parsed = SnapshotPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed.', details: parsed.error.issues.slice(0, 5) },
      { status: 400 }
    );
  }

  const payload = parsed.data;

  // --- Time window check ---
  const clientTime = new Date(payload.clientUploadedAt).getTime();
  const now = Date.now();
  if (clientTime < now - 24 * 60 * 60 * 1000 || clientTime > now + 5 * 60 * 1000) {
    return NextResponse.json({ error: 'clientUploadedAt is out of allowed time window.' }, { status: 400 });
  }

  // --- Validate daily bucket dates ---
  for (const bucket of payload.dailyBuckets) {
    if (new Date(bucket.date).getTime() > clientTime) {
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
    });

    // Update device last seen
    await prisma.device.update({
      where: { id: deviceId },
      data: { lastSeenAt: new Date() },
    });
  } catch (err) {
    console.error('Upload transaction failed:', err);
    // Log failed upload
    const ipHash = createHash('sha256')
      .update(request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown')
      .digest('hex');

    await prisma.uploadLog.create({
      data: {
        userId,
        deviceId,
        ipHash,
        payloadBytes: JSON.stringify(body).length,
        bucketCount: payload.dailyBuckets.length,
        earliestDate: payload.dailyBuckets.length > 0 ? new Date(payload.dailyBuckets[0].date) : null,
        latestDate: payload.dailyBuckets.length > 0 ? new Date(payload.dailyBuckets[payload.dailyBuckets.length - 1].date) : null,
        accepted: false,
      },
    });

    return NextResponse.json({ error: 'Internal server error during upload.' }, { status: 500 });
  }

  // --- Audit log (best-effort, outside transaction) ---
  const ipHash = createHash('sha256')
    .update(request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown')
    .digest('hex');

  const log = await prisma.uploadLog.create({
    data: {
      userId,
      deviceId,
      ipHash,
      payloadBytes: JSON.stringify(body).length,
      bucketCount: payload.dailyBuckets.length,
      earliestDate: payload.dailyBuckets.length > 0 ? new Date(payload.dailyBuckets[0].date) : null,
      latestDate: payload.dailyBuckets.length > 0 ? new Date(payload.dailyBuckets[payload.dailyBuckets.length - 1].date) : null,
      accepted: true,
    },
  });

  return NextResponse.json({ ok: true, logId: log.id });
}
