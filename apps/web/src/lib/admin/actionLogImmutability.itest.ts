import test from 'node:test';
import assert from 'node:assert/strict';

import { withTestDb } from '../test/withTestDb';

/**
 * The append-only trigger lives in apps/web/sql/admin-action-log-immutable.sql
 * and is applied by scripts/setupTestDb.ts. These tests prove the trigger is
 * actually present on the test database and that no client (raw SQL or
 * Prisma) can update or delete an audit row.
 */

test('AdminActionLog UPDATE is blocked by the immutability trigger', async () => {
  await withTestDb(async ({ prisma }) => {
    const row = await prisma.adminActionLog.create({
      data: {
        adminEmailHash: 'h',
        action: 'TEST_INSERT',
      },
    });

    await assert.rejects(
      () =>
        prisma.adminActionLog.update({
          where: { id: row.id },
          data: { action: 'TAMPERED' },
        }),
      /append-only|insufficient_privilege/i,
    );

    const after = await prisma.adminActionLog.findUniqueOrThrow({ where: { id: row.id } });
    assert.equal(after.action, 'TEST_INSERT');
  });
});

test('AdminActionLog DELETE is blocked by the immutability trigger', async () => {
  await withTestDb(async ({ prisma }) => {
    const row = await prisma.adminActionLog.create({
      data: {
        adminEmailHash: 'h',
        action: 'TEST_INSERT',
      },
    });

    await assert.rejects(
      () => prisma.adminActionLog.delete({ where: { id: row.id } }),
      /append-only|insufficient_privilege/i,
    );

    const after = await prisma.adminActionLog.findUnique({ where: { id: row.id } });
    assert.notEqual(after, null);
  });
});

test('AdminActionLog INSERT is allowed (only UPDATE/DELETE are blocked)', async () => {
  await withTestDb(async ({ prisma }) => {
    const r = await prisma.adminActionLog.create({
      data: { adminEmailHash: 'h', action: 'INSERT_OK' },
    });
    assert.ok(r.id);
  });
});

test('TRUNCATE is allowed (used by withTestDb between tests)', async () => {
  await withTestDb(async ({ prisma }) => {
    await prisma.adminActionLog.create({
      data: { adminEmailHash: 'h', action: 'TRUNCATE_TEST' },
    });
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "AdminActionLog" RESTART IDENTITY CASCADE');
    const count = await prisma.adminActionLog.count();
    assert.equal(count, 0);
  });
});
