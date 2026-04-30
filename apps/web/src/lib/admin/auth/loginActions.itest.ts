import test from 'node:test';
import assert from 'node:assert/strict';

import { withTestDb } from '../../test/withTestDb';
import { hashPassword } from '../password';
import { provisionAdmin } from '../provisioning';
import { decryptToken } from '../../crypto/tokenEncryption';
import { generateTotp } from '../totp';
import {
  AuthError,
  FAILED_LOGIN_LOCKOUT_THRESHOLD,
  confirmTwoFactor,
  getActiveAdmin,
  loginWithPassword,
  logout,
  setupTwoFactor,
  verifyRecoveryCode,
  verifyTwoFactor,
} from './loginActions';

const ctx = { ipHash: 'iphash', userAgentHash: 'uahash' };
const STRONG_PW = 'Correct-Horse-Battery-9!';

test('loginWithPassword + setupTwoFactor + confirmTwoFactor → fully authenticated', async () => {
  await withTestDb(async ({ prisma }) => {
    // Seed admin without going through provisioning to start with no TOTP.
    const admin = await prisma.adminUser.create({
      data: {
        email: 'fresh@example.com',
        passwordHash: await hashPassword(STRONG_PW),
      },
    });

    const login = await loginWithPassword(prisma, {
      email: admin.email,
      password: STRONG_PW,
      ...ctx,
    });
    assert.equal(login.ok, true);
    if (!login.ok) return;
    assert.equal(login.requires2fa, 'setup');

    const setup = await setupTwoFactor(prisma, login.token, ctx);
    assert.match(setup.secret, /^[A-Z2-7]+=*$/);
    assert.match(setup.otpauthUri, /^otpauth:\/\/totp\//);

    const code = generateTotp(setup.secret);
    const confirmed = await confirmTwoFactor(prisma, login.token, code, ctx);
    assert.equal(confirmed.recoveryCodes.length, 10);

    // Session should now be fully authenticated.
    const active = await getActiveAdmin(prisma, login.token);
    assert.ok(active);
    assert.equal(active!.email, admin.email);
  });
});

test('returning admin: loginWithPassword + verifyTwoFactor', async () => {
  await withTestDb(async ({ prisma }) => {
    const provisioned = await provisionAdmin(prisma, {
      email: 'returning@example.com',
      password: STRONG_PW,
    });
    // Mark the secret as confirmed (provisioning leaves it unconfirmed).
    await prisma.adminTotpSecret.update({
      where: { adminUserId: provisioned.adminUser.id },
      data: { confirmedAt: new Date() },
    });

    const login = await loginWithPassword(prisma, {
      email: provisioned.adminUser.email,
      password: STRONG_PW,
      ...ctx,
    });
    assert.equal(login.ok, true);
    if (!login.ok) return;
    assert.equal(login.requires2fa, 'verify');

    // Half-authenticated session: getActiveAdmin must refuse it.
    assert.equal(await getActiveAdmin(prisma, login.token), null);

    const code = generateTotp(provisioned.totpSecret);
    const verified = await verifyTwoFactor(prisma, login.token, code, ctx);
    assert.equal(verified.adminUser.id, provisioned.adminUser.id);

    const active = await getActiveAdmin(prisma, login.token);
    assert.ok(active);
  });
});

test('verifyRecoveryCode consumes one code and completes 2FA', async () => {
  await withTestDb(async ({ prisma }) => {
    const provisioned = await provisionAdmin(prisma, {
      email: 'recovery@example.com',
      password: STRONG_PW,
    });
    await prisma.adminTotpSecret.update({
      where: { adminUserId: provisioned.adminUser.id },
      data: { confirmedAt: new Date() },
    });

    const login = await loginWithPassword(prisma, {
      email: provisioned.adminUser.email,
      password: STRONG_PW,
      ...ctx,
    });
    assert.equal(login.ok, true);
    if (!login.ok) return;

    const oneCode = provisioned.recoveryCodes[0];
    const result = await verifyRecoveryCode(prisma, login.token, oneCode, ctx);
    assert.equal(result.remaining, 9);
    assert.ok(await getActiveAdmin(prisma, login.token));

    // Same code cannot be reused (it is now marked used).
    // Open a fresh session, then try.
    const next = await loginWithPassword(prisma, {
      email: provisioned.adminUser.email,
      password: STRONG_PW,
      ...ctx,
    });
    assert.equal(next.ok, true);
    if (!next.ok) return;
    await assert.rejects(verifyRecoveryCode(prisma, next.token, oneCode, ctx), /invalid_code/);
  });
});

test('wrong password and unknown email both return invalid_credentials', async () => {
  await withTestDb(async ({ prisma }) => {
    await prisma.adminUser.create({
      data: { email: 'a@example.com', passwordHash: await hashPassword(STRONG_PW) },
    });
    const wrong = await loginWithPassword(prisma, {
      email: 'a@example.com',
      password: 'wrong-password-1!',
      ...ctx,
    });
    const unknown = await loginWithPassword(prisma, {
      email: 'nobody@example.com',
      password: STRONG_PW,
      ...ctx,
    });
    assert.equal(wrong.ok, false);
    assert.equal(unknown.ok, false);
    if (!wrong.ok) assert.equal(wrong.reason, 'invalid_credentials');
    if (!unknown.ok) assert.equal(unknown.reason, 'invalid_credentials');
  });
});

test('account locks after the configured number of failed attempts', async () => {
  await withTestDb(async ({ prisma }) => {
    const admin = await prisma.adminUser.create({
      data: { email: 'lock@example.com', passwordHash: await hashPassword(STRONG_PW) },
    });
    for (let i = 0; i < FAILED_LOGIN_LOCKOUT_THRESHOLD; i += 1) {
      await loginWithPassword(prisma, {
        email: admin.email,
        password: 'wrong-password!',
        ...ctx,
      });
    }
    // Even with the right password, the account is now locked.
    const result = await loginWithPassword(prisma, {
      email: admin.email,
      password: STRONG_PW,
      ...ctx,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, 'account_locked');
      assert.ok((result.retryAfterSeconds ?? 0) > 0);
    }
    const reread = await prisma.adminUser.findUnique({ where: { id: admin.id } });
    assert.ok(reread!.lockedUntil);
  });
});

test('logout revokes the session; subsequent token use is rejected', async () => {
  await withTestDb(async ({ prisma }) => {
    const provisioned = await provisionAdmin(prisma, {
      email: 'logout@example.com',
      password: STRONG_PW,
    });
    await prisma.adminTotpSecret.update({
      where: { adminUserId: provisioned.adminUser.id },
      data: { confirmedAt: new Date() },
    });
    const login = await loginWithPassword(prisma, {
      email: provisioned.adminUser.email,
      password: STRONG_PW,
      ...ctx,
    });
    assert.equal(login.ok, true);
    if (!login.ok) return;
    const code = generateTotp(provisioned.totpSecret);
    await verifyTwoFactor(prisma, login.token, code, ctx);
    assert.ok(await getActiveAdmin(prisma, login.token));
    await logout(prisma, login.token, ctx);
    assert.equal(await getActiveAdmin(prisma, login.token), null);
  });
});

test('setupTwoFactor refuses when a confirmed secret already exists', async () => {
  await withTestDb(async ({ prisma }) => {
    const provisioned = await provisionAdmin(prisma, {
      email: 'already@example.com',
      password: STRONG_PW,
    });
    await prisma.adminTotpSecret.update({
      where: { adminUserId: provisioned.adminUser.id },
      data: { confirmedAt: new Date() },
    });
    const login = await loginWithPassword(prisma, {
      email: provisioned.adminUser.email,
      password: STRONG_PW,
      ...ctx,
    });
    assert.equal(login.ok, true);
    if (!login.ok) return;
    await assert.rejects(setupTwoFactor(prisma, login.token, ctx), /totp_already_confirmed/);
  });
});

test('AuthError is thrown for invalid sessions on every step-2 endpoint', async () => {
  await withTestDb(async ({ prisma }) => {
    await assert.rejects(setupTwoFactor(prisma, 'no-such-token', ctx), AuthError);
    await assert.rejects(confirmTwoFactor(prisma, 'no-such-token', '000000', ctx), AuthError);
    await assert.rejects(verifyTwoFactor(prisma, 'no-such-token', '000000', ctx), AuthError);
    await assert.rejects(verifyRecoveryCode(prisma, 'no-such-token', 'XXXXX-XXXXX', ctx), AuthError);
  });
});

test('login audit row is written for both success and failure', async () => {
  await withTestDb(async ({ prisma }) => {
    const admin = await prisma.adminUser.create({
      data: { email: 'audit@example.com', passwordHash: await hashPassword(STRONG_PW) },
    });
    await loginWithPassword(prisma, { email: admin.email, password: 'wrong!1A', ...ctx });
    await loginWithPassword(prisma, { email: admin.email, password: STRONG_PW, ...ctx });
    const rows = await prisma.adminActionLog.findMany({
      where: { action: 'LOGIN_PASSWORD' },
      orderBy: { createdAt: 'asc' },
    });
    assert.equal(rows.length, 2);
    const [failed, succeeded] = rows;
    assert.equal((failed.metadata as { status: string }).status, 'FAILED');
    assert.equal((succeeded.metadata as { status: string }).status, 'SUCCEEDED');
  });
});

test('confirmTwoFactor stores secret encrypted (round-trips through crypto helper)', async () => {
  await withTestDb(async ({ prisma }) => {
    const admin = await prisma.adminUser.create({
      data: { email: 'enc@example.com', passwordHash: await hashPassword(STRONG_PW) },
    });
    const login = await loginWithPassword(prisma, {
      email: admin.email,
      password: STRONG_PW,
      ...ctx,
    });
    assert.equal(login.ok, true);
    if (!login.ok) return;
    const setup = await setupTwoFactor(prisma, login.token, ctx);
    const stored = await prisma.adminTotpSecret.findUnique({
      where: { adminUserId: admin.id },
    });
    assert.notEqual(stored!.encryptedSecret, setup.secret);
    assert.equal(decryptToken(stored!.encryptedSecret), setup.secret);
  });
});
