import test from 'node:test';
import assert from 'node:assert/strict';

import { withTestDb } from '../../test/withTestDb';
import { logAdminAction, withAuditedAction } from './audit';

test('logAdminAction writes a row with hashed email and metadata.status', async () => {
  await withTestDb(async ({ prisma }) => {
    const admin = await prisma.adminUser.create({
      data: { email: 'a@example.com', passwordHash: 'h' },
    });

    const { id } = await logAdminAction(prisma, {
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'LOGIN_PASSWORD',
      ipHash: 'iphash',
      metadata: { foo: 'bar' },
    });

    const row = await prisma.adminActionLog.findUnique({ where: { id } });
    assert.ok(row);
    assert.equal(row!.action, 'LOGIN_PASSWORD');
    assert.equal(row!.adminUserId, admin.id);
    assert.notEqual(row!.adminEmailHash, admin.email);
    assert.match(row!.adminEmailHash, /^[0-9a-f]{64}$/);
    assert.deepEqual(row!.metadata, { status: 'SUCCEEDED', foo: 'bar' });
  });
});

test('logAdminAction tolerates unknown adminUserId by storing null', async () => {
  await withTestDb(async ({ prisma }) => {
    const { id } = await logAdminAction(prisma, {
      adminUserId: null,
      adminEmail: 'unknown@example.com',
      action: 'LOGIN_PASSWORD',
      status: 'FAILED',
      reason: 'unknown email',
    });
    const row = await prisma.adminActionLog.findUnique({ where: { id } });
    assert.equal(row!.adminUserId, null);
    assert.deepEqual(row!.metadata, {
      status: 'FAILED',
      reason: 'unknown email',
    });
  });
});

test('withAuditedAction marks SUCCEEDED on resolved handlers', async () => {
  await withTestDb(async ({ prisma }) => {
    const admin = await prisma.adminUser.create({
      data: { email: 'b@example.com', passwordHash: 'h' },
    });
    const result = await withAuditedAction(prisma, {
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'TEST_OK',
      run: async () => 42,
    });
    assert.equal(result, 42);
    const rows = await prisma.adminActionLog.findMany({
      where: { action: 'TEST_OK' },
      orderBy: { createdAt: 'asc' },
    });
    // Append-only: ATTEMPTED row + SUCCEEDED row.
    assert.equal(rows.length, 2);
    assert.equal((rows[0].metadata as { status: string }).status, 'ATTEMPTED');
    assert.equal((rows[1].metadata as { status: string }).status, 'SUCCEEDED');
    assert.equal((rows[1].metadata as { attemptId: string }).attemptId, rows[0].id);
  });
});

test('withAuditedAction marks FAILED and re-throws on rejected handlers', async () => {
  await withTestDb(async ({ prisma }) => {
    const admin = await prisma.adminUser.create({
      data: { email: 'c@example.com', passwordHash: 'h' },
    });
    await assert.rejects(
      withAuditedAction(prisma, {
        adminUserId: admin.id,
        adminEmail: admin.email,
        action: 'TEST_FAIL',
        run: async () => {
          throw new Error('boom');
        },
      }),
      /boom/,
    );
    const rows = await prisma.adminActionLog.findMany({
      where: { action: 'TEST_FAIL' },
      orderBy: { createdAt: 'asc' },
    });
    // Append-only: ATTEMPTED row + FAILED row.
    assert.equal(rows.length, 2);
    assert.equal((rows[0].metadata as { status: string }).status, 'ATTEMPTED');
    const meta = rows[1].metadata as { status: string; reason: string };
    assert.equal(meta.status, 'FAILED');
    assert.equal(meta.reason, 'boom');
  });
});
