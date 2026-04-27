import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';

import {
  __resetTokenEncryptionForTests,
  currentKeyVersion,
  decryptToken,
  decryptWithKeyRing,
  encryptToken,
  encryptWithKeyRing,
  loadKeyRingFromEnv,
  type KeyRing,
} from './tokenEncryption';

function makeKey(): string {
  return randomBytes(32).toString('base64');
}

function makeRing(activeVersion = 'v1'): KeyRing {
  const key1 = Buffer.from(makeKey(), 'base64');
  return { activeVersion, keys: new Map([[activeVersion, key1]]) };
}

function makeMultiVersionRing(active: string): KeyRing {
  return {
    activeVersion: active,
    keys: new Map([
      ['v1', Buffer.from(makeKey(), 'base64')],
      ['v2', Buffer.from(makeKey(), 'base64')],
    ]),
  };
}

test('encryptWithKeyRing → decryptWithKeyRing round-trip preserves plaintext', () => {
  const ring = makeRing();
  for (const plaintext of ['', 'short', 'a'.repeat(4096), 'ghu_abcd1234'.repeat(8)]) {
    const ct = encryptWithKeyRing(plaintext, ring);
    assert.equal(decryptWithKeyRing(ct, ring), plaintext);
  }
});

test('encrypted output starts with the active key version', () => {
  const ring = makeRing('v3');
  const ct = encryptWithKeyRing('hello', ring);
  assert.equal(ct.split(':')[0], 'v3');
});

test('encrypt produces 4 colon-separated parts: version, iv, tag, ciphertext', () => {
  const ring = makeRing();
  const ct = encryptWithKeyRing('hello', ring);
  assert.equal(ct.split(':').length, 4);
});

test('IV is unique across encryptions of the same plaintext', () => {
  const ring = makeRing();
  const seen = new Set<string>();
  for (let i = 0; i < 1000; i += 1) {
    const ct = encryptWithKeyRing('same', ring);
    const iv = ct.split(':')[1];
    assert.equal(seen.has(iv), false, `IV collision after ${i} samples`);
    seen.add(iv);
  }
});

test('tampered ciphertext throws on decrypt', () => {
  const ring = makeRing();
  const ct = encryptWithKeyRing('secret', ring);
  const [version, iv, tag, body] = ct.split(':');
  const flipped = Buffer.from(body, 'base64');
  flipped[0] ^= 0xff;
  const tampered = [version, iv, tag, flipped.toString('base64')].join(':');
  assert.throws(() => decryptWithKeyRing(tampered, ring));
});

test('tampered auth tag throws on decrypt', () => {
  const ring = makeRing();
  const ct = encryptWithKeyRing('secret', ring);
  const [version, iv, tag, body] = ct.split(':');
  const flipped = Buffer.from(tag, 'base64');
  flipped[0] ^= 0xff;
  const tampered = [version, iv, flipped.toString('base64'), body].join(':');
  assert.throws(() => decryptWithKeyRing(tampered, ring));
});

test('ciphertext with unknown key version throws on decrypt', () => {
  const ring = makeRing();
  const ct = encryptWithKeyRing('secret', ring);
  const parts = ct.split(':');
  parts[0] = 'vX';
  assert.throws(() => decryptWithKeyRing(parts.join(':'), ring), /unknown key version/i);
});

test('malformed ciphertext throws on decrypt', () => {
  const ring = makeRing();
  assert.throws(() => decryptWithKeyRing('not-valid', ring), /invalid ciphertext format/i);
  assert.throws(() => decryptWithKeyRing('a:b:c', ring), /invalid ciphertext format/i);
});

test('ciphertext encrypted with v1 still decrypts when active key is v2', () => {
  const ring = makeMultiVersionRing('v1');
  const ct = encryptWithKeyRing('legacy-secret', ring);
  assert.equal(ct.split(':')[0], 'v1');

  const rotated: KeyRing = { ...ring, activeVersion: 'v2' };
  assert.equal(decryptWithKeyRing(ct, rotated), 'legacy-secret');

  const reEncrypted = encryptWithKeyRing('legacy-secret', rotated);
  assert.equal(reEncrypted.split(':')[0], 'v2');
});

test('loadKeyRingFromEnv parses a valid env and returns the active key ring', () => {
  const k1 = makeKey();
  const k2 = makeKey();
  const env = {
    GITHUB_TOKEN_ENCRYPTION_KEYS: JSON.stringify({ v1: k1, v2: k2 }),
    GITHUB_TOKEN_ENCRYPTION_ACTIVE_KEY: 'v2',
  };
  const ring = loadKeyRingFromEnv(env);
  assert.equal(ring.activeVersion, 'v2');
  assert.equal(ring.keys.size, 2);
  assert.equal(ring.keys.get('v1')!.length, 32);
  assert.equal(ring.keys.get('v2')!.length, 32);
});

test('loadKeyRingFromEnv throws when GITHUB_TOKEN_ENCRYPTION_KEYS is missing', () => {
  assert.throws(
    () => loadKeyRingFromEnv({ GITHUB_TOKEN_ENCRYPTION_ACTIVE_KEY: 'v1' }),
    /GITHUB_TOKEN_ENCRYPTION_KEYS/,
  );
});

test('loadKeyRingFromEnv throws when GITHUB_TOKEN_ENCRYPTION_ACTIVE_KEY is missing', () => {
  assert.throws(
    () => loadKeyRingFromEnv({ GITHUB_TOKEN_ENCRYPTION_KEYS: JSON.stringify({ v1: makeKey() }) }),
    /GITHUB_TOKEN_ENCRYPTION_ACTIVE_KEY/,
  );
});

test('loadKeyRingFromEnv throws on invalid JSON', () => {
  assert.throws(
    () =>
      loadKeyRingFromEnv({
        GITHUB_TOKEN_ENCRYPTION_KEYS: 'not-json',
        GITHUB_TOKEN_ENCRYPTION_ACTIVE_KEY: 'v1',
      }),
    /valid JSON/i,
  );
});

test('loadKeyRingFromEnv throws when a key decodes to fewer than 32 bytes', () => {
  const shortKey = randomBytes(16).toString('base64');
  assert.throws(
    () =>
      loadKeyRingFromEnv({
        GITHUB_TOKEN_ENCRYPTION_KEYS: JSON.stringify({ v1: shortKey }),
        GITHUB_TOKEN_ENCRYPTION_ACTIVE_KEY: 'v1',
      }),
    /32 bytes/,
  );
});

test('loadKeyRingFromEnv throws when active key is not in the map', () => {
  assert.throws(
    () =>
      loadKeyRingFromEnv({
        GITHUB_TOKEN_ENCRYPTION_KEYS: JSON.stringify({ v1: makeKey() }),
        GITHUB_TOKEN_ENCRYPTION_ACTIVE_KEY: 'v9',
      }),
    /active key version "v9"/i,
  );
});

test('loadKeyRingFromEnv throws when the keys map is empty', () => {
  assert.throws(
    () =>
      loadKeyRingFromEnv({
        GITHUB_TOKEN_ENCRYPTION_KEYS: '{}',
        GITHUB_TOKEN_ENCRYPTION_ACTIVE_KEY: 'v1',
      }),
  );
});

test('module-level encryptToken/decryptToken/currentKeyVersion use process env', () => {
  const k1 = makeKey();
  const prevKeys = process.env.GITHUB_TOKEN_ENCRYPTION_KEYS;
  const prevActive = process.env.GITHUB_TOKEN_ENCRYPTION_ACTIVE_KEY;
  process.env.GITHUB_TOKEN_ENCRYPTION_KEYS = JSON.stringify({ v1: k1 });
  process.env.GITHUB_TOKEN_ENCRYPTION_ACTIVE_KEY = 'v1';
  __resetTokenEncryptionForTests();
  try {
    assert.equal(currentKeyVersion(), 'v1');
    const ct = encryptToken('hello');
    assert.equal(decryptToken(ct), 'hello');
  } finally {
    if (prevKeys === undefined) delete process.env.GITHUB_TOKEN_ENCRYPTION_KEYS;
    else process.env.GITHUB_TOKEN_ENCRYPTION_KEYS = prevKeys;
    if (prevActive === undefined) delete process.env.GITHUB_TOKEN_ENCRYPTION_ACTIVE_KEY;
    else process.env.GITHUB_TOKEN_ENCRYPTION_ACTIVE_KEY = prevActive;
    __resetTokenEncryptionForTests();
  }
});
