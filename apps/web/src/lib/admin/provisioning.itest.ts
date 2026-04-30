import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';

import { decryptToken } from '../crypto/tokenEncryption';
import { verifyPassword } from './password';
import { provisionAdmin } from './provisioning';
import { verifyRecoveryCode } from './recoveryCodes';
import { withTestDb } from '../test/withTestDb';

function uniqEmail(): string {
  return `admin-${randomBytes(4).toString('hex')}@Example.COM`;
}

test('provisionAdmin creates AdminUser with hashed password and lowercased email', async () => {
  await withTestDb(async ({ prisma }) => {
    const email = uniqEmail();
    const result = await provisionAdmin(prisma, {
      email,
      password: 'Tr0ub4dor&3-correct-horse',
      role: 'ADMIN',
    });

    assert.equal(result.adminUser.email, email.toLowerCase());
    assert.equal(result.adminUser.role, 'ADMIN');
    assert.notEqual(result.adminUser.passwordHash, 'Tr0ub4dor&3-correct-horse');
    assert.equal(
      await verifyPassword('Tr0ub4dor&3-correct-horse', result.adminUser.passwordHash),
      true,
    );
  });
});

test('provisionAdmin rejects weak passwords before touching the DB', async () => {
  await withTestDb(async ({ prisma }) => {
    await assert.rejects(
      () =>
        provisionAdmin(prisma, {
          email: uniqEmail(),
          password: 'short',
        }),
      /at least 12/i,
    );
    assert.equal(await prisma.adminUser.count(), 0);
  });
});

test('provisionAdmin defaults to READ_ONLY role when not specified', async () => {
  await withTestDb(async ({ prisma }) => {
    const result = await provisionAdmin(prisma, {
      email: uniqEmail(),
      password: 'Tr0ub4dor&3-correct-horse',
    });
    assert.equal(result.adminUser.role, 'READ_ONLY');
  });
});

test('provisionAdmin refuses duplicate emails (case-insensitive)', async () => {
  await withTestDb(async ({ prisma }) => {
    const email = uniqEmail();
    await provisionAdmin(prisma, {
      email,
      password: 'Tr0ub4dor&3-correct-horse',
    });
    await assert.rejects(
      () =>
        provisionAdmin(prisma, {
          email: email.toUpperCase(),
          password: 'Tr0ub4dor&3-correct-horse',
        }),
      /already exists/i,
    );
  });
});

test('provisionAdmin stores an encrypted (unconfirmed) TOTP secret', async () => {
  await withTestDb(async ({ prisma }) => {
    const result = await provisionAdmin(prisma, {
      email: uniqEmail(),
      password: 'Tr0ub4dor&3-correct-horse',
    });

    const stored = await prisma.adminTotpSecret.findUnique({
      where: { adminUserId: result.adminUser.id },
    });
    assert.ok(stored);
    assert.equal(stored.confirmedAt, null);
    assert.notEqual(stored.encryptedSecret, result.totpSecret);
    // Must round-trip through the key ring
    assert.equal(decryptToken(stored.encryptedSecret), result.totpSecret);
  });
});

test('provisionAdmin returns a Google Authenticator-style otpauth:// URI', async () => {
  await withTestDb(async ({ prisma }) => {
    const result = await provisionAdmin(prisma, {
      email: 'Operator@Example.com',
      password: 'Tr0ub4dor&3-correct-horse',
    });
    assert.match(result.otpauthUri, /^otpauth:\/\/totp\/Promptstreak%20Admin:operator%40example\.com\?/);
    assert.match(result.otpauthUri, /secret=/);
    assert.match(result.otpauthUri, /issuer=Promptstreak%20Admin/);
  });
});

test('provisionAdmin creates 10 single-use recovery codes (hashed only)', async () => {
  await withTestDb(async ({ prisma }) => {
    const result = await provisionAdmin(prisma, {
      email: uniqEmail(),
      password: 'Tr0ub4dor&3-correct-horse',
    });
    assert.equal(result.recoveryCodes.length, 10);
    for (const code of result.recoveryCodes) {
      assert.match(code, /^[A-Z2-7]{5}-[A-Z2-7]{5}$/);
    }
    const stored = await prisma.adminRecoveryCode.findMany({
      where: { adminUserId: result.adminUser.id },
    });
    assert.equal(stored.length, 10);
    for (const row of stored) {
      assert.notEqual(row.codeHash, result.recoveryCodes[0]);
      assert.equal(row.usedAt, null);
    }
    // Spot-check that the first plaintext verifies against exactly one stored hash
    let matches = 0;
    for (const row of stored) {
      if (await verifyRecoveryCode(result.recoveryCodes[0], row.codeHash)) matches += 1;
    }
    assert.equal(matches, 1);
  });
});
