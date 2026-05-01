import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';

import {
  __resetIdentityCryptoForTests,
  activeIdentityKeyVersion,
  blindIndexEquals,
  decryptEmail,
  decryptGithubId,
  decryptWithIdentityRing,
  encryptEmail,
  encryptGithubId,
  encryptWithIdentityRing,
  hmacEmail,
  hmacGithubId,
  loadIdentityKeyRingFromEnv,
  normalizeEmail,
  normalizeGithubId,
  type IdentityKeyRing,
} from './identityCrypto';

const KEY_B64_1 = randomBytes(32).toString('base64');
const KEY_B64_2 = randomBytes(32).toString('base64');
const PEPPER_B64 = randomBytes(32).toString('base64');

function ring(active = 1): IdentityKeyRing {
  return {
    activeVersion: active,
    keys: new Map<number, Buffer>([
      [1, Buffer.from(KEY_B64_1, 'base64')],
      [2, Buffer.from(KEY_B64_2, 'base64')],
    ]),
    pepper: Buffer.from(PEPPER_B64, 'base64'),
  };
}

function withEnv(overrides: Record<string, string | undefined>, fn: () => void): void {
  const original: Record<string, string | undefined> = {};
  for (const k of Object.keys(overrides)) original[k] = process.env[k];
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  __resetIdentityCryptoForTests();
  try {
    fn();
  } finally {
    for (const [k, v] of Object.entries(original)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    __resetIdentityCryptoForTests();
  }
}

/* --------------------------- env loading ------------------------------- */

test('loadIdentityKeyRingFromEnv: parses keys, active version, pepper', () => {
  const r = loadIdentityKeyRingFromEnv({
    IDENTITY_ENCRYPTION_KEYS: JSON.stringify({ '1': KEY_B64_1, '2': KEY_B64_2 }),
    IDENTITY_ENCRYPTION_ACTIVE_KEY: '2',
    IDENTITY_HMAC_PEPPER: PEPPER_B64,
  } as unknown as NodeJS.ProcessEnv);
  assert.equal(r.activeVersion, 2);
  assert.equal(r.keys.size, 2);
  assert.equal(r.pepper.length, 32);
});

test('loadIdentityKeyRingFromEnv: rejects non-integer version labels', () => {
  assert.throws(
    () =>
      loadIdentityKeyRingFromEnv({
        IDENTITY_ENCRYPTION_KEYS: JSON.stringify({ v1: KEY_B64_1 }),
        IDENTITY_ENCRYPTION_ACTIVE_KEY: 'v1',
        IDENTITY_HMAC_PEPPER: PEPPER_B64,
      } as unknown as NodeJS.ProcessEnv),
    /positive integer/i,
  );
});

test('loadIdentityKeyRingFromEnv: rejects active version not in ring', () => {
  assert.throws(
    () =>
      loadIdentityKeyRingFromEnv({
        IDENTITY_ENCRYPTION_KEYS: JSON.stringify({ '1': KEY_B64_1 }),
        IDENTITY_ENCRYPTION_ACTIVE_KEY: '7',
        IDENTITY_HMAC_PEPPER: PEPPER_B64,
      } as unknown as NodeJS.ProcessEnv),
    /not present/i,
  );
});

test('loadIdentityKeyRingFromEnv: rejects wrong pepper length', () => {
  assert.throws(
    () =>
      loadIdentityKeyRingFromEnv({
        IDENTITY_ENCRYPTION_KEYS: JSON.stringify({ '1': KEY_B64_1 }),
        IDENTITY_ENCRYPTION_ACTIVE_KEY: '1',
        IDENTITY_HMAC_PEPPER: Buffer.alloc(16).toString('base64'),
      } as unknown as NodeJS.ProcessEnv),
    /32 bytes/i,
  );
});

test('loadIdentityKeyRingFromEnv: rejects wrong key length', () => {
  assert.throws(
    () =>
      loadIdentityKeyRingFromEnv({
        IDENTITY_ENCRYPTION_KEYS: JSON.stringify({ '1': Buffer.alloc(16).toString('base64') }),
        IDENTITY_ENCRYPTION_ACTIVE_KEY: '1',
        IDENTITY_HMAC_PEPPER: PEPPER_B64,
      } as unknown as NodeJS.ProcessEnv),
    /32 bytes/i,
  );
});

/* --------------------------- encrypt / decrypt ------------------------- */

test('encrypt + decrypt round-trip GitHub ID under multiple versions', () => {
  for (const v of [1, 2]) {
    const r = ring(v);
    const ct = encryptWithIdentityRing('123456789', r);
    assert.match(ct, new RegExp(`^${v}:`), 'ciphertext encodes active version');
    assert.equal(decryptWithIdentityRing(ct, r), '123456789');
  }
});

test('encrypt produces a unique IV per call (no determinism)', () => {
  const r = ring();
  const seen = new Set<string>();
  for (let i = 0; i < 50; i++) {
    const ct = encryptWithIdentityRing('42', r);
    const iv = ct.split(':')[1];
    assert.ok(!seen.has(iv), 'IV must be unique');
    seen.add(iv);
  }
});

test('decrypt with rotated active key still reads historical ciphertext', () => {
  const oldRing = ring(1);
  const ct = encryptWithIdentityRing('abc@example.com', oldRing); // version=1
  const newRing = ring(2); // active is 2 but key 1 is still in ring
  assert.equal(decryptWithIdentityRing(ct, newRing), 'abc@example.com');
});

test('decrypt rejects ciphertext referencing an unknown key version', () => {
  const r: IdentityKeyRing = {
    activeVersion: 1,
    keys: new Map([[1, Buffer.from(KEY_B64_1, 'base64')]]),
    pepper: Buffer.from(PEPPER_B64, 'base64'),
  };
  const ct = encryptWithIdentityRing('x', { ...r, activeVersion: 1 });
  // Rebuild the ciphertext so it claims version 9
  const parts = ct.split(':');
  parts[0] = '9';
  assert.throws(() => decryptWithIdentityRing(parts.join(':'), r), /Unknown identity key version/);
});

test('decrypt rejects malformed ciphertext', () => {
  const r = ring();
  assert.throws(() => decryptWithIdentityRing('not-a-ciphertext', r), /Invalid identity ciphertext/);
});

test('decrypt rejects tampered ciphertext (GCM auth tag failure)', () => {
  const r = ring();
  const ct = encryptWithIdentityRing('99', r);
  const parts = ct.split(':');
  // Flip a bit in the ciphertext payload.
  const tampered = Buffer.from(parts[3], 'base64');
  tampered[0] ^= 0x01;
  parts[3] = tampered.toString('base64');
  assert.throws(() => decryptWithIdentityRing(parts.join(':'), r));
});

/* --------------------------- HMAC blind index -------------------------- */

test('normalizeGithubId collapses string and number forms', () => {
  assert.equal(normalizeGithubId('12345'), normalizeGithubId(12345));
});

test('hmacGithubId: deterministic, 43-char base64url, distinct domain from email', () => {
  withEnv(
    {
      IDENTITY_ENCRYPTION_KEYS: JSON.stringify({ '1': KEY_B64_1 }),
      IDENTITY_ENCRYPTION_ACTIVE_KEY: '1',
      IDENTITY_HMAC_PEPPER: PEPPER_B64,
    },
    () => {
      const a = hmacGithubId('12345');
      const b = hmacGithubId(12345);
      assert.equal(a, b, 'string and number forms collapse');
      assert.equal(a.length, 43, 'base64url(32B) → 43 chars');
      assert.match(a, /^[A-Za-z0-9_-]{43}$/);
      // Domain separation: same numeric input as email-shaped string must differ.
      const e = hmacEmail('12345@example.com');
      assert.notEqual(a, e);
    },
  );
});

test('hmacEmail: case + whitespace insensitive via normalization', () => {
  withEnv(
    {
      IDENTITY_ENCRYPTION_KEYS: JSON.stringify({ '1': KEY_B64_1 }),
      IDENTITY_ENCRYPTION_ACTIVE_KEY: '1',
      IDENTITY_HMAC_PEPPER: PEPPER_B64,
    },
    () => {
      assert.equal(hmacEmail('Foo@Example.com'), hmacEmail('  foo@example.com  '));
    },
  );
});

test('hmac varies when the pepper rotates (force re-hash on pepper change)', () => {
  let h1!: string;
  withEnv(
    {
      IDENTITY_ENCRYPTION_KEYS: JSON.stringify({ '1': KEY_B64_1 }),
      IDENTITY_ENCRYPTION_ACTIVE_KEY: '1',
      IDENTITY_HMAC_PEPPER: PEPPER_B64,
    },
    () => {
      h1 = hmacGithubId('555');
    },
  );
  withEnv(
    {
      IDENTITY_ENCRYPTION_KEYS: JSON.stringify({ '1': KEY_B64_1 }),
      IDENTITY_ENCRYPTION_ACTIVE_KEY: '1',
      IDENTITY_HMAC_PEPPER: randomBytes(32).toString('base64'),
    },
    () => {
      const h2 = hmacGithubId('555');
      assert.notEqual(h1, h2);
    },
  );
});

test('blindIndexEquals: constant-time equality of two HMACs', () => {
  withEnv(
    {
      IDENTITY_ENCRYPTION_KEYS: JSON.stringify({ '1': KEY_B64_1 }),
      IDENTITY_ENCRYPTION_ACTIVE_KEY: '1',
      IDENTITY_HMAC_PEPPER: PEPPER_B64,
    },
    () => {
      const a = hmacGithubId('1');
      const b = hmacGithubId('1');
      const c = hmacGithubId('2');
      assert.equal(blindIndexEquals(a, b), true);
      assert.equal(blindIndexEquals(a, c), false);
      assert.equal(blindIndexEquals(a, a.slice(0, -1)), false, 'length mismatch is false, not throw');
    },
  );
});

/* --------------------------- normalization ----------------------------- */

test('normalizeGithubId rejects negatives, zero, non-numeric', () => {
  assert.throws(() => normalizeGithubId(0), /positive integer/);
  assert.throws(() => normalizeGithubId(-5), /positive integer/);
  assert.throws(() => normalizeGithubId('012'), /positive integer string/);
  assert.throws(() => normalizeGithubId('1.5'), /positive integer string/);
  assert.throws(() => normalizeGithubId(0n), /positive integer/);
  assert.equal(normalizeGithubId('99999999999999999999'), '99999999999999999999');
  assert.equal(normalizeGithubId(99999999999n), '99999999999');
});

test('normalizeEmail rejects malformed addresses', () => {
  assert.throws(() => normalizeEmail(''), /1\.\.254/);
  assert.throws(() => normalizeEmail('no-at-sign'), /valid address/);
  assert.throws(() => normalizeEmail('a@b'), /valid address/);
  assert.equal(normalizeEmail('  USER@Domain.IO  '), 'user@domain.io');
});

/* --------------------------- env-bound facade -------------------------- */

test('encryptGithubId/decryptGithubId round-trip via process env', () => {
  withEnv(
    {
      IDENTITY_ENCRYPTION_KEYS: JSON.stringify({ '1': KEY_B64_1, '2': KEY_B64_2 }),
      IDENTITY_ENCRYPTION_ACTIVE_KEY: '2',
      IDENTITY_HMAC_PEPPER: PEPPER_B64,
    },
    () => {
      assert.equal(activeIdentityKeyVersion(), 2);
      const ct = encryptGithubId(987654321);
      assert.match(ct, /^2:/);
      assert.equal(decryptGithubId(ct), '987654321');
    },
  );
});

test('encryptEmail/decryptEmail round-trip and normalization is preserved', () => {
  withEnv(
    {
      IDENTITY_ENCRYPTION_KEYS: JSON.stringify({ '1': KEY_B64_1 }),
      IDENTITY_ENCRYPTION_ACTIVE_KEY: '1',
      IDENTITY_HMAC_PEPPER: PEPPER_B64,
    },
    () => {
      const ct = encryptEmail('  Alice@Example.COM  ');
      assert.equal(decryptEmail(ct), 'alice@example.com');
    },
  );
});
