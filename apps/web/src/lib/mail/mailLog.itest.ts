import { test } from 'node:test';
import assert from 'node:assert/strict';

import { withTestDb } from '../test/withTestDb';

test('MailLog persists a SENT row with hashed recipient', async () => {
  await withTestDb(async ({ prisma }) => {
    const row = await prisma.mailLog.create({
      data: {
        recipientHash: 'sha256:abc',
        templateId: 'account-suspended',
        providerMessageId: 'smtp-1',
        status: 'SENT',
      },
    });
    assert.equal(row.status, 'SENT');
    assert.equal(row.attempts, 1);
    assert.equal(row.errorReason, null);
    assert.ok(row.createdAt instanceof Date);
  });
});

test('MailLog persists a FAILED row with errorReason and attempt count', async () => {
  await withTestDb(async ({ prisma }) => {
    const row = await prisma.mailLog.create({
      data: {
        recipientHash: 'sha256:def',
        templateId: 'device-revoked',
        status: 'FAILED',
        errorReason: 'connection refused',
        attempts: 2,
      },
    });
    assert.equal(row.status, 'FAILED');
    assert.equal(row.attempts, 2);
    assert.equal(row.errorReason, 'connection refused');
    assert.equal(row.providerMessageId, null);
  });
});

test('MailLog is queryable by recipientHash for delivery history', async () => {
  await withTestDb(async ({ prisma }) => {
    const recipientHash = 'sha256:user-1';
    await prisma.mailLog.createMany({
      data: [
        { recipientHash, templateId: 'account-suspended', status: 'SENT' },
        { recipientHash, templateId: 'device-revoked', status: 'FAILED', errorReason: 'x' },
        { recipientHash: 'sha256:user-2', templateId: 'account-suspended', status: 'SENT' },
      ],
    });
    const history = await prisma.mailLog.findMany({
      where: { recipientHash },
      orderBy: { createdAt: 'asc' },
    });
    assert.equal(history.length, 2);
    assert.deepEqual(history.map((r) => r.templateId), ['account-suspended', 'device-revoked']);
  });
});
