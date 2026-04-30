import test from 'node:test';
import assert from 'node:assert/strict';
import type { PrismaClient } from '@prisma/client';

import { withTestDb } from '../test/withTestDb';
import {
  uploadsPerHour,
  signatureStatusShare,
  activeDevices,
  activeUsers,
  verifiedEligibleUsers,
  anomaliesBySeverity,
} from './metrics';

let nextGithubId = 4_000_000;
async function seedUser(prisma: PrismaClient) {
  const username = `u-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const u = await prisma.user.create({
    data: { username, displayName: username, githubId: nextGithubId++ },
    select: { id: true },
  });
  return u.id;
}

async function seedAudit(
  prisma: PrismaClient,
  opts: {
    userId: string;
    receivedAt?: Date;
    signatureStatus?: string;
    accepted?: boolean;
  },
) {
  return prisma.uploadAudit.create({
    data: {
      userId: opts.userId,
      receivedAt: opts.receivedAt ?? new Date(),
      signatureStatus: (opts.signatureStatus ?? 'VALID') as never,
      accepted: opts.accepted ?? true,
    },
    select: { id: true },
  });
}

const T_NOW = new Date('2026-04-15T12:30:00Z');
const FIXED_CLOCK = { now: () => T_NOW };

test('uploadsPerHour: buckets rows into the trailing N hours', async () => {
  await withTestDb(async ({ prisma }) => {
    const userId = await seedUser(prisma);
    // Two in current hour bucket (12:xx), one in 11:xx, one in 10:xx.
    await seedAudit(prisma, { userId, receivedAt: new Date('2026-04-15T12:05:00Z') });
    await seedAudit(prisma, { userId, receivedAt: new Date('2026-04-15T12:25:00Z') });
    await seedAudit(prisma, { userId, receivedAt: new Date('2026-04-15T11:50:00Z') });
    await seedAudit(prisma, { userId, receivedAt: new Date('2026-04-15T10:00:00Z') });
    // Outside window:
    await seedAudit(prisma, { userId, receivedAt: new Date('2026-04-14T11:00:00Z') });

    const points = await uploadsPerHour(prisma, 24, FIXED_CLOCK);
    assert.equal(points.length, 24);
    const last = points[points.length - 1];
    const second = points[points.length - 2];
    const third = points[points.length - 3];
    assert.equal(last.hour, '2026-04-15T12:00:00.000Z');
    assert.equal(last.count, 2);
    assert.equal(second.count, 1);
    assert.equal(third.count, 1);
    const totalAfter4 = points.slice(0, -3).reduce((a, p) => a + p.count, 0);
    assert.equal(totalAfter4, 0, 'rows older than the window are excluded');
  });
});

test('signatureStatusShare: counts rows by status within window', async () => {
  await withTestDb(async ({ prisma }) => {
    const userId = await seedUser(prisma);
    await seedAudit(prisma, { userId, signatureStatus: 'VALID', receivedAt: T_NOW });
    await seedAudit(prisma, { userId, signatureStatus: 'VALID', receivedAt: T_NOW });
    await seedAudit(prisma, { userId, signatureStatus: 'INVALID', receivedAt: T_NOW });
    await seedAudit(prisma, {
      userId,
      signatureStatus: 'VALID',
      receivedAt: new Date('2026-04-10T00:00:00Z'),
    });

    const share = await signatureStatusShare(prisma, 24, FIXED_CLOCK);
    assert.equal(share.VALID, 2);
    assert.equal(share.INVALID, 1);
  });
});

test('activeDevices: counts non-revoked devices seen in window', async () => {
  await withTestDb(async ({ prisma }) => {
    const userId = await seedUser(prisma);
    await prisma.device.create({
      data: {
        userId,
        tokenId: 'tok-fresh',
        secretHash: 'h',
        lastSeenAt: new Date('2026-04-14T00:00:00Z'),
      },
    });
    await prisma.device.create({
      data: {
        userId,
        tokenId: 'tok-stale',
        secretHash: 'h',
        lastSeenAt: new Date('2026-04-01T00:00:00Z'),
      },
    });
    await prisma.device.create({
      data: {
        userId,
        tokenId: 'tok-revoked',
        secretHash: 'h',
        lastSeenAt: new Date('2026-04-14T00:00:00Z'),
        revokedAt: new Date('2026-04-15T00:00:00Z'),
      },
    });

    const n = await activeDevices(prisma, 7, FIXED_CLOCK);
    assert.equal(n, 1);
  });
});

test('activeUsers: counts distinct users with uploads in window', async () => {
  await withTestDb(async ({ prisma }) => {
    const u1 = await seedUser(prisma);
    const u2 = await seedUser(prisma);
    const u3 = await seedUser(prisma);
    await seedAudit(prisma, { userId: u1, receivedAt: T_NOW });
    await seedAudit(prisma, { userId: u1, receivedAt: T_NOW });
    await seedAudit(prisma, { userId: u2, receivedAt: T_NOW });
    await seedAudit(prisma, { userId: u3, receivedAt: new Date('2026-03-01T00:00:00Z') });

    const n = await activeUsers(prisma, 7, FIXED_CLOCK);
    assert.equal(n, 2);
  });
});

test('verifiedEligibleUsers: counts publicBadgeEligible rows', async () => {
  await withTestDb(async ({ prisma }) => {
    const a = await seedUser(prisma);
    const b = await seedUser(prisma);
    const c = await seedUser(prisma);
    await prisma.userVerification.create({
      data: { userId: a, publicBadgeEligible: true, githubBillingStatus: 'HEALTHY' },
    });
    await prisma.userVerification.create({
      data: { userId: b, publicBadgeEligible: true, githubBillingStatus: 'HEALTHY' },
    });
    await prisma.userVerification.create({
      data: { userId: c, publicBadgeEligible: false, githubBillingStatus: 'WARNING' },
    });

    const n = await verifiedEligibleUsers(prisma);
    assert.equal(n, 2);
  });
});

test('anomaliesBySeverity: groups unresolved by severity', async () => {
  await withTestDb(async ({ prisma }) => {
    const userId = await seedUser(prisma);
    const seed = (severity: string, resolved = false) =>
      prisma.verificationAnomaly.create({
        data: {
          userId,
          code: 'PREMIUM_MISMATCH_MINOR' as never,
          severity: severity as never,
          summary: 't',
          resolvedAt: resolved ? new Date() : null,
        },
      });
    await seed('LOW');
    await seed('LOW');
    await seed('HIGH');
    await seed('CRITICAL');
    await seed('HIGH', true); // resolved → excluded

    const out = await anomaliesBySeverity(prisma);
    assert.equal(out.LOW, 2);
    assert.equal(out.HIGH, 1);
    assert.equal(out.CRITICAL, 1);
    assert.equal(out.MEDIUM ?? 0, 0);
  });
});
