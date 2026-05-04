import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

import { withTestDb } from '@/lib/test/withTestDb';
import {
  ensurePrivacySettings,
  ensureUserIdentity,
  findUserByGithubId,
  isIdentityCryptoEnabled,
} from './identitySync';
import {
  __resetIdentityCryptoForTests,
  decryptGithubId,
  hmacGithubId,
} from '@/lib/crypto/identityCrypto';

/**
 * Set up identity-crypto env for the entire file. Restored afterwards so we
 * don't leak state into sibling itests.
 */
const KEY = randomBytes(32).toString('base64');
const PEPPER = randomBytes(32).toString('base64');
const ORIGINAL_ENV = {
  IDENTITY_ENCRYPTION_KEYS: process.env.IDENTITY_ENCRYPTION_KEYS,
  IDENTITY_ENCRYPTION_ACTIVE_KEY: process.env.IDENTITY_ENCRYPTION_ACTIVE_KEY,
  IDENTITY_HMAC_PEPPER: process.env.IDENTITY_HMAC_PEPPER,
};

test.before(() => {
  process.env.IDENTITY_ENCRYPTION_KEYS = JSON.stringify({ '1': KEY });
  process.env.IDENTITY_ENCRYPTION_ACTIVE_KEY = '1';
  process.env.IDENTITY_HMAC_PEPPER = PEPPER;
  __resetIdentityCryptoForTests();
});

test.after(() => {
  for (const [k, v] of Object.entries(ORIGINAL_ENV)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  __resetIdentityCryptoForTests();
});

/* --------------------------- isIdentityCryptoEnabled ------------------- */

test('isIdentityCryptoEnabled: true only when all three env vars are set', () => {
  assert.equal(
    isIdentityCryptoEnabled({
      IDENTITY_ENCRYPTION_KEYS: 'x',
      IDENTITY_ENCRYPTION_ACTIVE_KEY: '1',
      IDENTITY_HMAC_PEPPER: 'y',
    } as unknown as NodeJS.ProcessEnv),
    true,
  );
  assert.equal(
    isIdentityCryptoEnabled({
      IDENTITY_ENCRYPTION_KEYS: 'x',
      IDENTITY_ENCRYPTION_ACTIVE_KEY: '1',
    } as unknown as NodeJS.ProcessEnv),
    false,
  );
  assert.equal(isIdentityCryptoEnabled({} as unknown as NodeJS.ProcessEnv), false);
});

/* --------------------------- ensurePrivacySettings --------------------- */

test('ensurePrivacySettings: idempotent + privacy-first defaults', async () => {
  await withTestDb(async ({ prisma }) => {
    const u = await prisma.user.create({
      data: { githubId: 210001, username: 'p1c-priv' },
    });

    assert.equal(await ensurePrivacySettings(prisma, u.id), true, 'creates on first call');
    assert.equal(await ensurePrivacySettings(prisma, u.id), false, 'no-op on second call');

    const ps = await prisma.privacySettings.findUniqueOrThrow({ where: { userId: u.id } });
    assert.equal(ps.profilePublic, false, 'privacy-first defaults');
    assert.equal(ps.leaderboardOptIn, false);
    assert.equal(ps.badgesEnabled, false);
  });
});

/* --------------------------- ensureUserIdentity ------------------------ */

test('ensureUserIdentity: writes encrypted githubId + correct HMAC', async () => {
  await withTestDb(async ({ prisma }) => {
    const u = await prisma.user.create({
      data: { githubId: 210010, username: 'p1c-id-1' },
    });

    assert.equal(await ensureUserIdentity(prisma, u), true);

    const id = await prisma.userIdentity.findUniqueOrThrow({ where: { userId: u.id } });
    assert.equal(id.githubIdHmac, hmacGithubId(210010));
    assert.equal(id.keyVersion, 1);
    assert.equal(decryptGithubId(id.githubIdCiphertext), '210010');
    assert.equal(id.emailHmac, null, 'no email on legacy user → null');
    assert.equal(id.emailCiphertext, null);

    // Idempotency.
    assert.equal(await ensureUserIdentity(prisma, u), false);
  });
});

test('ensureUserIdentity: no-op when identity crypto is disabled', async () => {
  await withTestDb(async ({ prisma }) => {
    const u = await prisma.user.create({
      data: { githubId: 210020, username: 'p1c-id-disabled' },
    });
    const created = await ensureUserIdentity(prisma, u, {} as unknown as NodeJS.ProcessEnv);
    assert.equal(created, false);
    const row = await prisma.userIdentity.findUnique({ where: { userId: u.id } });
    assert.equal(row, null);
  });
});

/* --------------------------- findUserByGithubId ------------------------ */

test('findUserByGithubId: prefers identity HMAC lookup', async () => {
  await withTestDb(async ({ prisma }) => {
    const u = await prisma.user.create({
      data: { githubId: 210030, username: 'p1c-find-hmac' },
    });
    await ensureUserIdentity(prisma, u);

    const found = await findUserByGithubId(prisma, 210030);
    assert.ok(found);
    assert.equal(found!.id, u.id);
  });
});

test('findUserByGithubId: falls back to legacy githubId column when no UserIdentity exists', async () => {
  await withTestDb(async ({ prisma }) => {
    const u = await prisma.user.create({
      data: { githubId: 210040, username: 'p1c-find-legacy' },
    });
    // Deliberately do NOT call ensureUserIdentity — simulates a pre-Phase-1c user.
    const found = await findUserByGithubId(prisma, 210040);
    assert.ok(found);
    assert.equal(found!.id, u.id);
  });
});

test('findUserByGithubId: returns null for unknown id', async () => {
  await withTestDb(async ({ prisma }) => {
    const found = await findUserByGithubId(prisma, 999999999);
    assert.equal(found, null);
  });
});

test('findUserByGithubId: legacy-fallback path is used when identity crypto is disabled', async () => {
  await withTestDb(async ({ prisma }) => {
    const u = await prisma.user.create({
      data: { githubId: 210050, username: 'p1c-find-disabled' },
    });
    const found = await findUserByGithubId(prisma, 210050, {} as unknown as NodeJS.ProcessEnv);
    assert.ok(found);
    assert.equal(found!.id, u.id);
  });
});
