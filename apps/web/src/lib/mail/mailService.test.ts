import test from 'node:test';
import assert from 'node:assert/strict';

import { InMemoryMailService } from './mailService';

test('InMemoryMailService records sends and returns a messageId', async () => {
  const mail = new InMemoryMailService();
  const res = await mail.send({
    to: ['ops@example.com'],
    templateId: 'account-suspended',
    variables: { username: 'alice' },
  });
  assert.equal(res.attempted, true);
  assert.notEqual(res.messageId, null);
  assert.equal(mail.sent.length, 1);
  assert.equal(mail.sent[0].templateId, 'account-suspended');
});

test('InMemoryMailService is a no-op when there are no recipients', async () => {
  const mail = new InMemoryMailService();
  const res = await mail.send({
    to: [],
    templateId: 'device-revoked',
    variables: {},
  });
  assert.equal(res.attempted, false);
  assert.equal(res.messageId, null);
  assert.equal(mail.sent.length, 0);
});

test('reset() empties the in-memory queue', async () => {
  const mail = new InMemoryMailService();
  await mail.send({ to: ['a@b.c'], templateId: 'device-revoked', variables: {} });
  mail.reset();
  assert.equal(mail.sent.length, 0);
});
