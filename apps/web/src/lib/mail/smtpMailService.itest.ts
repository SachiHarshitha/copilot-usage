import { test } from 'node:test';
import assert from 'node:assert/strict';

import { withTestDb } from '../test/withTestDb';
import { hashEmail } from '../admin/auth/clientFingerprint';
import { SmtpMailService, type MailTransporter } from './smtpMailService';
import { _resetMailTemplates, registerMailTemplate } from './templates';
import type { SmtpConfig } from './smtpConfig';

const config: SmtpConfig = {
  host: 'smtp.example.com',
  port: 587,
  secure: false,
  user: 'noreply@example.com',
  password: 'pw',
  from: 'Promptstreak <noreply@example.com>',
};

interface CapturedSend {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
}

function makeTransporter(impl: (i: CapturedSend, attempt: number) => Promise<{ messageId: string }>): {
  transporter: MailTransporter;
  sent: CapturedSend[];
} {
  const sent: CapturedSend[] = [];
  let attempt = 0;
  return {
    sent,
    transporter: {
      async sendMail(opts) {
        attempt += 1;
        sent.push(opts);
        return impl(opts, attempt);
      },
    },
  };
}

function registerTestTemplate(): void {
  _resetMailTemplates();
  registerMailTemplate<{ name: string }>({
    id: 'test-template',
    render: (vars) => ({
      subject: `Hello ${vars.name}`,
      text: `Hi ${vars.name}`,
      html: `<p>Hi ${vars.name}</p>`,
    }),
  });
}

test('SmtpMailService: empty `to` is a no-op (no transporter call, no MailLog row)', async () => {
  await withTestDb(async ({ prisma }) => {
    registerTestTemplate();
    const { transporter, sent } = makeTransporter(async () => ({ messageId: 'x' }));
    const svc = new SmtpMailService({ prisma, transporter, config });
    const result = await svc.send({ to: [], templateId: 'test-template', variables: { name: 'a' } });
    assert.deepEqual(result, { attempted: false, messageId: null });
    assert.equal(sent.length, 0);
    assert.equal(await prisma.mailLog.count(), 0);
  });
});

test('SmtpMailService: successful send writes SENT MailLog with hashed recipient and providerMessageId', async () => {
  await withTestDb(async ({ prisma }) => {
    registerTestTemplate();
    const { transporter, sent } = makeTransporter(async () => ({ messageId: 'smtp-abc' }));
    const svc = new SmtpMailService({ prisma, transporter, config });
    const result = await svc.send({
      to: ['user@example.com'],
      templateId: 'test-template',
      variables: { name: 'Sam' },
    });
    assert.equal(result.attempted, true);
    assert.equal(result.messageId, 'smtp-abc');
    assert.equal(sent.length, 1);
    assert.equal(sent[0].from, config.from);
    assert.equal(sent[0].to, 'user@example.com');
    assert.equal(sent[0].subject, 'Hello Sam');
    const logs = await prisma.mailLog.findMany();
    assert.equal(logs.length, 1);
    assert.equal(logs[0].status, 'SENT');
    assert.equal(logs[0].attempts, 1);
    assert.equal(logs[0].providerMessageId, 'smtp-abc');
    assert.equal(logs[0].templateId, 'test-template');
    assert.equal(logs[0].recipientHash, hashEmail('user@example.com'));
    // Plaintext recipient must not appear anywhere in the row.
    assert.equal(JSON.stringify(logs[0]).includes('user@example.com'), false);
  });
});

test('SmtpMailService: retries once on transient failure and records attempts=2', async () => {
  await withTestDb(async ({ prisma }) => {
    registerTestTemplate();
    const { transporter } = makeTransporter(async (_, attempt) => {
      if (attempt === 1) throw new Error('temporary smtp blip');
      return { messageId: 'smtp-retry' };
    });
    const svc = new SmtpMailService({ prisma, transporter, config });
    const result = await svc.send({
      to: ['retry@example.com'],
      templateId: 'test-template',
      variables: { name: 'R' },
    });
    assert.equal(result.messageId, 'smtp-retry');
    const logs = await prisma.mailLog.findMany();
    assert.equal(logs.length, 1);
    assert.equal(logs[0].status, 'SENT');
    assert.equal(logs[0].attempts, 2);
  });
});

test('SmtpMailService: marks FAILED after both attempts fail; messageId is null', async () => {
  await withTestDb(async ({ prisma }) => {
    registerTestTemplate();
    const { transporter } = makeTransporter(async () => {
      throw new Error('smtp down');
    });
    const svc = new SmtpMailService({ prisma, transporter, config });
    const result = await svc.send({
      to: ['fail@example.com'],
      templateId: 'test-template',
      variables: { name: 'F' },
    });
    assert.equal(result.attempted, true);
    assert.equal(result.messageId, null);
    const logs = await prisma.mailLog.findMany();
    assert.equal(logs.length, 1);
    assert.equal(logs[0].status, 'FAILED');
    assert.equal(logs[0].attempts, 2);
    assert.equal(logs[0].errorReason, 'smtp down');
    assert.equal(logs[0].providerMessageId, null);
  });
});

test('SmtpMailService: writes one MailLog per recipient when sending to multiple addresses', async () => {
  await withTestDb(async ({ prisma }) => {
    registerTestTemplate();
    let i = 0;
    const { transporter } = makeTransporter(async () => ({ messageId: `mid-${++i}` }));
    const svc = new SmtpMailService({ prisma, transporter, config });
    const result = await svc.send({
      to: ['a@example.com', 'b@example.com'],
      templateId: 'test-template',
      variables: { name: 'team' },
    });
    assert.equal(result.attempted, true);
    assert.equal(result.messageId, 'mid-2');
    const logs = await prisma.mailLog.findMany({ orderBy: { createdAt: 'asc' } });
    assert.equal(logs.length, 2);
    assert.equal(logs[0].recipientHash, hashEmail('a@example.com'));
    assert.equal(logs[1].recipientHash, hashEmail('b@example.com'));
  });
});

test('SmtpMailService: throws on unknown templateId before touching SMTP', async () => {
  await withTestDb(async ({ prisma }) => {
    _resetMailTemplates();
    const { transporter, sent } = makeTransporter(async () => ({ messageId: 'x' }));
    const svc = new SmtpMailService({ prisma, transporter, config });
    await assert.rejects(
      svc.send({ to: ['x@example.com'], templateId: 'no-such-template', variables: {} }),
      /unknown mail template/,
    );
    assert.equal(sent.length, 0);
    assert.equal(await prisma.mailLog.count(), 0);
  });
});
