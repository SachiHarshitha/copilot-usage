import test from 'node:test';
import assert from 'node:assert/strict';
import type { PrismaClient } from '@prisma/client';

import { withTestDb } from '../test/withTestDb';
import {
  listAnomaliesHandler,
  anomalyDetailHandler,
  resolveAnomalyHandler,
  type ListAnomaliesResponse,
  type AnomalyDetail,
} from './anomalies';
import { buildAdminRequest, seedAdminSession } from './test/seedAdminSession';

const LIST = 'https://admin.example.com/api/admin/anomalies';

let nextGithubId = 1_000_000;
async function seedUser(prisma: PrismaClient, username = `u-${Date.now()}-${Math.random().toString(36).slice(2)}`) {
  const u = await prisma.user.create({
    data: { username, displayName: username, githubId: nextGithubId++ },
    select: { id: true },
  });
  return u.id;
}

async function seedAnomaly(
  prisma: PrismaClient,
  opts: {
    userId: string;
    code?: string;
    severity?: string;
    detectedAt?: Date;
    resolvedAt?: Date | null;
    summary?: string;
    detailsJson?: object;
  },
) {
  return prisma.verificationAnomaly.create({
    data: {
      userId: opts.userId,
      code: (opts.code ?? 'PREMIUM_MISMATCH_MINOR') as never,
      severity: (opts.severity ?? 'LOW') as never,
      summary: opts.summary ?? 'test',
      detailsJson: (opts.detailsJson ?? null) as never,
      detectedAt: opts.detectedAt ?? new Date(),
      resolvedAt: opts.resolvedAt ?? null,
    },
    select: { id: true },
  });
}

test('anomalies list: 401 without session', async () => {
  await withTestDb(async ({ prisma }) => {
    const res = await listAnomaliesHandler(buildAdminRequest(LIST, null), { prisma });
    assert.equal(res.status, 401);
  });
});

test('anomalies list: returns rows newest-first by detectedAt', async () => {
  await withTestDb(async ({ prisma }) => {
    const session = await seedAdminSession(prisma, { role: 'READ_ONLY' });
    const userId = await seedUser(prisma);
    const t0 = new Date('2026-04-01T00:00:00Z');
    await seedAnomaly(prisma, { userId, detectedAt: t0, summary: 'oldest' });
    await seedAnomaly(prisma, {
      userId,
      detectedAt: new Date(t0.getTime() + 60_000),
      summary: 'middle',
    });
    await seedAnomaly(prisma, {
      userId,
      detectedAt: new Date(t0.getTime() + 120_000),
      summary: 'newest',
    });

    const res = await listAnomaliesHandler(buildAdminRequest(LIST, session), { prisma });
    assert.equal(res.status, 200);
    const body = (await res.json()) as ListAnomaliesResponse;
    assert.equal(body.entries.length, 3);
    assert.equal(body.entries[0].summary, 'newest');
    assert.equal(body.entries[2].summary, 'oldest');
  });
});

test('anomalies list: filters compose (severity, code, unresolved=true)', async () => {
  await withTestDb(async ({ prisma }) => {
    const session = await seedAdminSession(prisma);
    const userId = await seedUser(prisma);
    await seedAnomaly(prisma, { userId, code: 'PREMIUM_MISMATCH_MINOR', severity: 'LOW' });
    await seedAnomaly(prisma, {
      userId,
      code: 'PREMIUM_MISMATCH_LARGE',
      severity: 'HIGH',
      summary: 'wanted',
    });
    await seedAnomaly(prisma, {
      userId,
      code: 'PREMIUM_MISMATCH_LARGE',
      severity: 'HIGH',
      resolvedAt: new Date(),
      summary: 'resolved',
    });

    const res = await listAnomaliesHandler(
      buildAdminRequest(
        `${LIST}?severity=HIGH&code=PREMIUM_MISMATCH_LARGE&unresolved=true`,
        session,
      ),
      { prisma },
    );
    const body = (await res.json()) as ListAnomaliesResponse;
    assert.equal(body.entries.length, 1);
    assert.equal(body.entries[0].summary, 'wanted');
  });
});

test('anomalies detail: 404 for unknown id', async () => {
  await withTestDb(async ({ prisma }) => {
    const session = await seedAdminSession(prisma);
    const url = `${LIST}/missing-id`;
    const res = await anomalyDetailHandler(
      buildAdminRequest(url, session),
      { params: { id: 'missing-id' } },
      { prisma },
    );
    assert.equal(res.status, 404);
  });
});

test('anomalies detail: returns row with detailsJson', async () => {
  await withTestDb(async ({ prisma }) => {
    const session = await seedAdminSession(prisma);
    const userId = await seedUser(prisma);
    const a = await seedAnomaly(prisma, {
      userId,
      summary: 'detail row',
      detailsJson: { foo: 'bar', n: 7 },
    });

    const res = await anomalyDetailHandler(
      buildAdminRequest(`${LIST}/${a.id}`, session),
      { params: { id: a.id } },
      { prisma },
    );
    assert.equal(res.status, 200);
    const body = (await res.json()) as AnomalyDetail;
    assert.equal(body.id, a.id);
    assert.equal(body.summary, 'detail row');
    assert.deepEqual(body.detailsJson, { foo: 'bar', n: 7 });
  });
});

test('anomalies list: cursor pagination caps and continues', async () => {
  await withTestDb(async ({ prisma }) => {
    const session = await seedAdminSession(prisma);
    const userId = await seedUser(prisma);
    const base = new Date('2026-04-01T00:00:00Z').getTime();
    for (let i = 0; i < 5; i++) {
      await seedAnomaly(prisma, {
        userId,
        detectedAt: new Date(base + i * 1000),
        summary: `row-${i}`,
      });
    }
    const r1 = await listAnomaliesHandler(
      buildAdminRequest(`${LIST}?limit=2`, session),
      { prisma },
    );
    const b1 = (await r1.json()) as ListAnomaliesResponse;
    assert.equal(b1.entries.length, 2);
    assert.ok(b1.nextCursor);
    const r2 = await listAnomaliesHandler(
      buildAdminRequest(`${LIST}?limit=2&cursor=${b1.nextCursor}`, session),
      { prisma },
    );
    const b2 = (await r2.json()) as ListAnomaliesResponse;
    assert.equal(b2.entries.length, 2);
    assert.notEqual(b1.entries[0].id, b2.entries[0].id);
  });
});

// ---------------- C.2 resolve ----------------

test('anomaly resolve: 401 without session', async () => {
  await withTestDb(async ({ prisma }) => {
    const userId = await seedUser(prisma);
    const a = await seedAnomaly(prisma, { userId });
    const res = await resolveAnomalyHandler(
      buildAdminRequest(`${LIST}/${a.id}/resolve`, null, {
        method: 'POST',
        body: JSON.stringify({ confirm: true, resolution: 'fixed' }),
      }),
      { params: { id: a.id } },
      { prisma },
    );
    assert.equal(res.status, 401);
  });
});

test('anomaly resolve: READ_ONLY admin gets 403', async () => {
  await withTestDb(async ({ prisma }) => {
    const session = await seedAdminSession(prisma, { role: 'READ_ONLY' });
    const userId = await seedUser(prisma);
    const a = await seedAnomaly(prisma, { userId });
    const res = await resolveAnomalyHandler(
      buildAdminRequest(`${LIST}/${a.id}/resolve`, session, {
        method: 'POST',
        body: JSON.stringify({ confirm: true, resolution: 'fixed' }),
      }),
      { params: { id: a.id } },
      { prisma },
    );
    assert.equal(res.status, 403);
  });
});

test('anomaly resolve: 400 without confirm', async () => {
  await withTestDb(async ({ prisma }) => {
    const session = await seedAdminSession(prisma, { role: 'MODERATOR' });
    const userId = await seedUser(prisma);
    const a = await seedAnomaly(prisma, { userId });
    const res = await resolveAnomalyHandler(
      buildAdminRequest(`${LIST}/${a.id}/resolve`, session, {
        method: 'POST',
        body: JSON.stringify({ resolution: 'fixed' }),
      }),
      { params: { id: a.id } },
      { prisma },
    );
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, 'confirm_required');
  });
});

test('anomaly resolve: 400 without resolution string', async () => {
  await withTestDb(async ({ prisma }) => {
    const session = await seedAdminSession(prisma, { role: 'MODERATOR' });
    const userId = await seedUser(prisma);
    const a = await seedAnomaly(prisma, { userId });
    const res = await resolveAnomalyHandler(
      buildAdminRequest(`${LIST}/${a.id}/resolve`, session, {
        method: 'POST',
        body: JSON.stringify({ confirm: true, resolution: '   ' }),
      }),
      { params: { id: a.id } },
      { prisma },
    );
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, 'resolution_required');
  });
});

test('anomaly resolve: marks resolved + writes audit row', async () => {
  await withTestDb(async ({ prisma }) => {
    const session = await seedAdminSession(prisma, { role: 'MODERATOR' });
    const userId = await seedUser(prisma);
    const a = await seedAnomaly(prisma, { userId, summary: 'to-resolve' });

    const res = await resolveAnomalyHandler(
      buildAdminRequest(`${LIST}/${a.id}/resolve`, session, {
        method: 'POST',
        body: JSON.stringify({ confirm: true, resolution: 'investigated; benign' }),
      }),
      { params: { id: a.id } },
      { prisma },
    );
    assert.equal(res.status, 200);

    const row = await prisma.verificationAnomaly.findUnique({ where: { id: a.id } });
    assert.ok(row?.resolvedAt);
    assert.equal(row?.resolution, 'investigated; benign');

    const audit = await prisma.adminActionLog.findFirst({
      where: {
        action: 'ANOMALY_RESOLVE',
        targetId: a.id,
        metadata: { path: ['status'], equals: 'SUCCEEDED' },
      },
    });
    assert.ok(audit);
  });
});

test('anomaly resolve: idempotent on already-resolved row', async () => {
  await withTestDb(async ({ prisma }) => {
    const session = await seedAdminSession(prisma, { role: 'MODERATOR' });
    const userId = await seedUser(prisma);
    const a = await seedAnomaly(prisma, { userId, resolvedAt: new Date() });
    const res = await resolveAnomalyHandler(
      buildAdminRequest(`${LIST}/${a.id}/resolve`, session, {
        method: 'POST',
        body: JSON.stringify({ confirm: true, resolution: 'noop' }),
      }),
      { params: { id: a.id } },
      { prisma },
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.noop, true);
  });
});
