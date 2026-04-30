import test from 'node:test';
import assert from 'node:assert/strict';
import type { PrismaClient } from '@prisma/client';

import { withTestDb } from '../test/withTestDb';
import { MetricsCache } from './metrics';
import {
  metricsOverviewHandler,
  type MetricsOverviewResponse,
} from './metricsOverview';
import { buildAdminRequest, seedAdminSession } from './test/seedAdminSession';

const URL = 'https://admin.example.com/api/admin/metrics/overview';
const T_NOW = new Date('2026-04-15T12:30:00Z');
const FIXED_CLOCK = { now: () => T_NOW };

let nextGithubId = 5_000_000;
async function seedUser(prisma: PrismaClient) {
  const username = `u-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const u = await prisma.user.create({
    data: { username, displayName: username, githubId: nextGithubId++ },
    select: { id: true },
  });
  return u.id;
}

test('metrics overview: 401 without session', async () => {
  await withTestDb(async ({ prisma }) => {
    const cache = new MetricsCache(60_000, FIXED_CLOCK);
    const res = await metricsOverviewHandler(buildAdminRequest(URL, null), {
      prisma,
      cache,
      clock: FIXED_CLOCK,
    });
    assert.equal(res.status, 401);
  });
});

test('metrics overview: returns combined snapshot', async () => {
  await withTestDb(async ({ prisma }) => {
    const session = await seedAdminSession(prisma, { role: 'READ_ONLY' });
    const userId = await seedUser(prisma);
    await prisma.uploadAudit.create({
      data: {
        userId,
        signatureStatus: 'VALID' as never,
        accepted: true,
        receivedAt: T_NOW,
      },
    });
    await prisma.uploadAudit.create({
      data: {
        userId,
        signatureStatus: 'INVALID' as never,
        accepted: false,
        receivedAt: T_NOW,
      },
    });
    await prisma.userVerification.create({
      data: { userId, publicBadgeEligible: true, githubBillingStatus: 'HEALTHY' as never },
    });
    await prisma.verificationAnomaly.create({
      data: {
        userId,
        code: 'PREMIUM_MISMATCH_LARGE' as never,
        severity: 'HIGH' as never,
        summary: 't',
      },
    });

    const cache = new MetricsCache(60_000, FIXED_CLOCK);
    const res = await metricsOverviewHandler(buildAdminRequest(URL, session), {
      prisma,
      cache,
      clock: FIXED_CLOCK,
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as MetricsOverviewResponse;
    assert.equal(body.generatedAt, T_NOW.toISOString());
    assert.equal(body.uploadsPerHour.length, 24);
    assert.equal(body.signatureStatusShare.VALID, 1);
    assert.equal(body.signatureStatusShare.INVALID, 1);
    assert.equal(body.verifiedEligibleUsers, 1);
    assert.equal(body.anomaliesBySeverity.HIGH, 1);
    assert.equal(body.activeUsers, 1);
  });
});

test('metrics overview: cache returns stable snapshot within TTL', async () => {
  await withTestDb(async ({ prisma }) => {
    const session = await seedAdminSession(prisma);
    const userId = await seedUser(prisma);
    await prisma.uploadAudit.create({
      data: {
        userId,
        signatureStatus: 'VALID' as never,
        accepted: true,
        receivedAt: T_NOW,
      },
    });

    const cache = new MetricsCache(60_000, FIXED_CLOCK);
    const first = await metricsOverviewHandler(buildAdminRequest(URL, session), {
      prisma,
      cache,
      clock: FIXED_CLOCK,
    });
    const firstBody = (await first.json()) as MetricsOverviewResponse;

    // Insert another row; cached snapshot must not reflect it.
    await prisma.uploadAudit.create({
      data: {
        userId,
        signatureStatus: 'VALID' as never,
        accepted: true,
        receivedAt: T_NOW,
      },
    });

    const second = await metricsOverviewHandler(buildAdminRequest(URL, session), {
      prisma,
      cache,
      clock: FIXED_CLOCK,
    });
    const secondBody = (await second.json()) as MetricsOverviewResponse;

    assert.equal(secondBody.signatureStatusShare.VALID, firstBody.signatureStatusShare.VALID);

    cache.invalidate('overview');
    const third = await metricsOverviewHandler(buildAdminRequest(URL, session), {
      prisma,
      cache,
      clock: FIXED_CLOCK,
    });
    const thirdBody = (await third.json()) as MetricsOverviewResponse;
    assert.equal(thirdBody.signatureStatusShare.VALID, 2);
  });
});
