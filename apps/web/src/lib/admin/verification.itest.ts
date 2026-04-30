import test from 'node:test';
import assert from 'node:assert/strict';
import type { PrismaClient } from '@prisma/client';

import { withTestDb } from '../test/withTestDb';
import {
  listVerificationHandler,
  verificationDetailHandler,
  type ListVerificationResponse,
  type VerificationDetail,
} from './verification';
import { buildAdminRequest, seedAdminSession } from './test/seedAdminSession';

const LIST = 'https://admin.example.com/api/admin/verification';

let nextGithubId = 2_000_000;
async function seedUser(prisma: PrismaClient) {
  const username = `vu-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return prisma.user.create({
    data: { username, displayName: username, githubId: nextGithubId++ },
    select: { id: true, username: true },
  });
}

async function seedVerification(
  prisma: PrismaClient,
  userId: string,
  status: string,
  extras: Record<string, unknown> = {},
) {
  return prisma.userVerification.create({
    data: {
      userId,
      githubBillingStatus: status as never,
      githubBillingConnected: status !== 'NOT_CONNECTED',
      ...extras,
    },
  });
}

test('verification list: 401 without session', async () => {
  await withTestDb(async ({ prisma }) => {
    const res = await listVerificationHandler(buildAdminRequest(LIST, null), { prisma });
    assert.equal(res.status, 401);
  });
});

test('verification list: filters by status', async () => {
  await withTestDb(async ({ prisma }) => {
    const session = await seedAdminSession(prisma, { role: 'READ_ONLY' });
    const a = await seedUser(prisma);
    const b = await seedUser(prisma);
    const c = await seedUser(prisma);
    await seedVerification(prisma, a.id, 'HEALTHY');
    await seedVerification(prisma, b.id, 'MISMATCH');
    await seedVerification(prisma, c.id, 'HEALTHY');

    const res = await listVerificationHandler(
      buildAdminRequest(`${LIST}?status=HEALTHY`, session),
      { prisma },
    );
    assert.equal(res.status, 200);
    const body = (await res.json()) as ListVerificationResponse;
    assert.equal(body.entries.length, 2);
    for (const row of body.entries) {
      assert.equal(row.githubBillingStatus, 'HEALTHY');
    }
  });
});

test('verification list: includes username (joined from User)', async () => {
  await withTestDb(async ({ prisma }) => {
    const session = await seedAdminSession(prisma);
    const u = await seedUser(prisma);
    await seedVerification(prisma, u.id, 'WARNING');

    const res = await listVerificationHandler(
      buildAdminRequest(`${LIST}?status=WARNING`, session),
      { prisma },
    );
    const body = (await res.json()) as ListVerificationResponse;
    assert.equal(body.entries.length, 1);
    assert.equal(body.entries[0].username, u.username);
  });
});

test('verification detail: 404 when no verification row', async () => {
  await withTestDb(async ({ prisma }) => {
    const session = await seedAdminSession(prisma);
    const u = await seedUser(prisma);
    const res = await verificationDetailHandler(
      buildAdminRequest(`${LIST}/${u.id}`, session),
      { params: { userId: u.id } },
      { prisma },
    );
    assert.equal(res.status, 404);
  });
});

test('verification detail: returns full row', async () => {
  await withTestDb(async ({ prisma }) => {
    const session = await seedAdminSession(prisma);
    const u = await seedUser(prisma);
    await seedVerification(prisma, u.id, 'MISMATCH', {
      currentPeriodKey: '2026-04',
      localPremiumRequests: 412n,
      verifiedPremiumRequests: 401n,
      differenceAbsolute: 11n,
      mismatchScore: 5,
    });

    const res = await verificationDetailHandler(
      buildAdminRequest(`${LIST}/${u.id}`, session),
      { params: { userId: u.id } },
      { prisma },
    );
    assert.equal(res.status, 200);
    const body = (await res.json()) as VerificationDetail;
    assert.equal(body.userId, u.id);
    assert.equal(body.username, u.username);
    assert.equal(body.githubBillingStatus, 'MISMATCH');
    assert.equal(body.currentPeriodKey, '2026-04');
    assert.equal(body.localPremiumRequests, '412');
    assert.equal(body.verifiedPremiumRequests, '401');
    assert.equal(body.differenceAbsolute, '11');
    assert.equal(body.mismatchScore, 5);
  });
});
