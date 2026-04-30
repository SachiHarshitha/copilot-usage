import { test } from 'node:test';
import assert from 'node:assert/strict';

import { withTestDb } from '../../test/withTestDb';
import { hashPassword } from '../password';
import { InMemoryMailService } from '../../mail/mailService';
import {
  FAILED_LOGIN_LOCKOUT_THRESHOLD,
  loginWithPassword,
} from './loginActions';

const STRONG_PW = 'CorrectHorse9!Battery';
const ctx = { ipHash: 'sha256:ip-a', userAgentHash: 'sha256:ua-a' };

test('lockout email is sent exactly once on the threshold-crossing failure', async () => {
  await withTestDb(async ({ prisma }) => {
    const admin = await prisma.adminUser.create({
      data: { email: 'lockmail@example.com', passwordHash: await hashPassword(STRONG_PW) },
    });
    const mail = new InMemoryMailService();
    for (let i = 0; i < FAILED_LOGIN_LOCKOUT_THRESHOLD; i += 1) {
      await loginWithPassword(prisma, { email: admin.email, password: 'wrong!1A', ...ctx }, { mail });
    }
    const lockoutMails = mail.sent.filter((m) => m.templateId === 'admin-lockout');
    assert.equal(lockoutMails.length, 1);
    assert.deepEqual(lockoutMails[0].to, [admin.email]);
    const vars = lockoutMails[0].variables as { duration: string; unlocksAt: string };
    assert.match(vars.duration, /minutes/);
    assert.ok(new Date(vars.unlocksAt).getTime() > Date.now());
  });
});

test('lockout email is not sent when mail dep is omitted', async () => {
  await withTestDb(async ({ prisma }) => {
    const admin = await prisma.adminUser.create({
      data: { email: 'nolockmail@example.com', passwordHash: await hashPassword(STRONG_PW) },
    });
    for (let i = 0; i < FAILED_LOGIN_LOCKOUT_THRESHOLD; i += 1) {
      await loginWithPassword(prisma, { email: admin.email, password: 'wrong!1A', ...ctx });
    }
    const reread = await prisma.adminUser.findUniqueOrThrow({ where: { id: admin.id } });
    assert.ok(reread.lockedUntil, 'still locks the account without the mail dep');
  });
});

test('new-IP login sends admin-login-from-new-ip on the first login from that ipHash', async () => {
  await withTestDb(async ({ prisma }) => {
    const admin = await prisma.adminUser.create({
      data: { email: 'newip@example.com', passwordHash: await hashPassword(STRONG_PW) },
    });
    const mail = new InMemoryMailService();
    const r = await loginWithPassword(
      prisma,
      { email: admin.email, password: STRONG_PW, ipHash: 'sha256:fresh-ip', userAgentHash: null },
      { mail },
    );
    assert.equal(r.ok, true);
    const newIpMails = mail.sent.filter((m) => m.templateId === 'admin-login-from-new-ip');
    assert.equal(newIpMails.length, 1);
    assert.deepEqual(newIpMails[0].to, [admin.email]);
  });
});

test('new-IP email is suppressed when the same ipHash logged in successfully recently', async () => {
  await withTestDb(async ({ prisma }) => {
    const admin = await prisma.adminUser.create({
      data: { email: 'sameip@example.com', passwordHash: await hashPassword(STRONG_PW) },
    });
    const mail = new InMemoryMailService();
    const sameCtx = { ipHash: 'sha256:same-ip', userAgentHash: null };
    await loginWithPassword(prisma, { email: admin.email, password: STRONG_PW, ...sameCtx }, { mail });
    await loginWithPassword(prisma, { email: admin.email, password: STRONG_PW, ...sameCtx }, { mail });
    const newIpMails = mail.sent.filter((m) => m.templateId === 'admin-login-from-new-ip');
    assert.equal(newIpMails.length, 1, 'first login emails, second from same IP does not');
  });
});

test('new-IP email is not sent when ipHash is null (no fingerprint to compare)', async () => {
  await withTestDb(async ({ prisma }) => {
    const admin = await prisma.adminUser.create({
      data: { email: 'nullip@example.com', passwordHash: await hashPassword(STRONG_PW) },
    });
    const mail = new InMemoryMailService();
    await loginWithPassword(
      prisma,
      { email: admin.email, password: STRONG_PW, ipHash: null, userAgentHash: null },
      { mail },
    );
    const newIpMails = mail.sent.filter((m) => m.templateId === 'admin-login-from-new-ip');
    assert.equal(newIpMails.length, 0);
  });
});
