import test from 'node:test';
import assert from 'node:assert/strict';

import { withTestDb } from '../test/withTestDb';
import { listActionLogHandler, type ActionLogResponse } from './actionLog';
import { buildAdminRequest, seedAdminSession } from './test/seedAdminSession';

const BASE = 'https://admin.example.com/api/admin/action-log';

async function seedRows(prisma: import('@prisma/client').PrismaClient, adminUserId: string) {
  // Seed deterministic rows across two actions and two targets.
  const baseTime = new Date('2025-01-01T00:00:00Z').getTime();
  const data = [
    { action: 'USER_SUSPEND', targetType: 'User', targetId: 'u1', offset: 0 },
    { action: 'USER_SUSPEND', targetType: 'User', targetId: 'u2', offset: 1 },
    { action: 'USER_RESTORE', targetType: 'User', targetId: 'u1', offset: 2 },
    { action: 'DEVICE_REVOKE', targetType: 'Device', targetId: 'd1', offset: 3 },
  ];
  for (const row of data) {
    await prisma.adminActionLog.create({
      data: {
        adminUserId,
        adminEmailHash: 'hash-of-email',
        action: row.action,
        targetType: row.targetType,
        targetId: row.targetId,
        createdAt: new Date(baseTime + row.offset * 1000),
        metadata: { status: 'SUCCEEDED' },
      },
    });
  }
}

test('action log: 401 without session', async () => {
  await withTestDb(async ({ prisma }) => {
    const res = await listActionLogHandler(buildAdminRequest(BASE, null), { prisma });
    assert.equal(res.status, 401);
  });
});

test('action log: returns rows newest-first for any authenticated admin (READ_ONLY ok)', async () => {
  await withTestDb(async ({ prisma }) => {
    const session = await seedAdminSession(prisma, { role: 'READ_ONLY' });
    // seedAdminSession itself writes enrollment audit rows; clear them to
    // make this test's assertions about ordering deterministic.
    await prisma.adminActionLog.deleteMany({});
    await seedRows(prisma, session.adminId);

    const res = await listActionLogHandler(buildAdminRequest(BASE, session), { prisma });
    assert.equal(res.status, 200);
    const body = (await res.json()) as ActionLogResponse;
    assert.equal(body.entries.length, 4);
    // Newest first: DEVICE_REVOKE was the last one written.
    assert.equal(body.entries[0].action, 'DEVICE_REVOKE');
  });
});

test('action log: filters by action, targetType, targetId compose', async () => {
  await withTestDb(async ({ prisma }) => {
    const session = await seedAdminSession(prisma);
    await seedRows(prisma, session.adminId);

    const res = await listActionLogHandler(
      buildAdminRequest(`${BASE}?action=USER_SUSPEND&targetType=User&targetId=u1`, session),
      { prisma },
    );
    assert.equal(res.status, 200);
    const body = (await res.json()) as ActionLogResponse;
    assert.equal(body.entries.length, 1);
    assert.equal(body.entries[0].action, 'USER_SUSPEND');
    assert.equal(body.entries[0].targetId, 'u1');
  });
});

test('action log: from / to date filters work', async () => {
  await withTestDb(async ({ prisma }) => {
    const session = await seedAdminSession(prisma);
    await prisma.adminActionLog.deleteMany({});
    await seedRows(prisma, session.adminId);

    const res = await listActionLogHandler(
      buildAdminRequest(
        `${BASE}?from=2025-01-01T00:00:01Z&to=2025-01-01T00:00:02Z`,
        session,
      ),
      { prisma },
    );
    const body = (await res.json()) as ActionLogResponse;
    // Inclusive on both ends → 2 rows in the [01s, 02s] window.
    assert.equal(body.entries.length, 2);
  });
});

test('action log: invalid date param → 400', async () => {
  await withTestDb(async ({ prisma }) => {
    const session = await seedAdminSession(prisma);
    const res = await listActionLogHandler(
      buildAdminRequest(`${BASE}?from=not-a-date`, session),
      { prisma },
    );
    assert.equal(res.status, 400);
  });
});

test('action log: cursor pagination walks every row exactly once', async () => {
  await withTestDb(async ({ prisma }) => {
    const session = await seedAdminSession(prisma);
    await prisma.adminActionLog.deleteMany({});
    await seedRows(prisma, session.adminId);

    const seen = new Set<string>();
    let cursor: string | null = null;
    let pages = 0;
    do {
      const url = cursor ? `${BASE}?limit=2&cursor=${cursor}` : `${BASE}?limit=2`;
      const res = await listActionLogHandler(buildAdminRequest(url, session), { prisma });
      const body = (await res.json()) as ActionLogResponse;
      for (const e of body.entries) {
        assert.equal(seen.has(e.id), false, 'row appeared twice');
        seen.add(e.id);
      }
      cursor = body.nextCursor;
      pages += 1;
      assert.ok(pages < 10, 'runaway pagination');
    } while (cursor);
    assert.equal(seen.size, 4);
  });
});
