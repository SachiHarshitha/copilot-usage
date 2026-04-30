import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildOtpauthUri,
  decodeBase32,
  encodeBase32,
  generateTotp,
  generateTotpSecret,
  verifyTotp,
} from './totp';

// =====================================================================
// Base32 (RFC 4648) round-trips
// =====================================================================

test('base32 encode/decode round-trips arbitrary buffers', () => {
  for (const sample of [Buffer.from(''), Buffer.from('f'), Buffer.from('foob'), Buffer.from('foobar')]) {
    assert.deepEqual(decodeBase32(encodeBase32(sample)), sample);
  }
});

test('base32 encoding matches RFC 4648 vectors', () => {
  // From RFC 4648 §10
  assert.equal(encodeBase32(Buffer.from('')), '');
  assert.equal(encodeBase32(Buffer.from('f')), 'MY======');
  assert.equal(encodeBase32(Buffer.from('fo')), 'MZXQ====');
  assert.equal(encodeBase32(Buffer.from('foo')), 'MZXW6===');
  assert.equal(encodeBase32(Buffer.from('foob')), 'MZXW6YQ=');
  assert.equal(encodeBase32(Buffer.from('fooba')), 'MZXW6YTB');
  assert.equal(encodeBase32(Buffer.from('foobar')), 'MZXW6YTBOI======');
});

test('decodeBase32 is case-insensitive and tolerates spaces and missing padding', () => {
  assert.deepEqual(decodeBase32('mzxw6ytb'), Buffer.from('fooba'));
  assert.deepEqual(decodeBase32('MZXW 6YTB'), Buffer.from('fooba'));
  assert.deepEqual(decodeBase32('MZXW6YTB'), Buffer.from('fooba'));
  assert.deepEqual(decodeBase32('MZXW6YQ'), Buffer.from('foob'));
});

// =====================================================================
// generateTotpSecret
// =====================================================================

test('generateTotpSecret returns a 32-character (160-bit) base32 string', () => {
  for (let i = 0; i < 32; i += 1) {
    const secret = generateTotpSecret();
    assert.match(secret, /^[A-Z2-7]+$/);
    const decoded = decodeBase32(secret);
    assert.equal(decoded.length, 20);
  }
});

// =====================================================================
// RFC 6238 Appendix B test vectors (HMAC-SHA1, 8-digit codes, 30s step)
// secret = "12345678901234567890" (ASCII), encoded as base32
// =====================================================================

const RFC_SECRET_ASCII = '12345678901234567890';
const RFC_SECRET = encodeBase32(Buffer.from(RFC_SECRET_ASCII));

const RFC_VECTORS: Array<{ time: number; expected: string }> = [
  { time: 59, expected: '94287082' },
  { time: 1111111109, expected: '07081804' },
  { time: 1111111111, expected: '14050471' },
  { time: 1234567890, expected: '89005924' },
  { time: 2000000000, expected: '69279037' },
  { time: 20000000000, expected: '65353130' },
];

for (const v of RFC_VECTORS) {
  test(`generateTotp matches RFC 6238 vector at t=${v.time}`, () => {
    const code = generateTotp(RFC_SECRET, { time: v.time, digits: 8 });
    assert.equal(code, v.expected);
  });
}

// =====================================================================
// verifyTotp
// =====================================================================

test('verifyTotp accepts the code generated for the same time slot', () => {
  const secret = generateTotpSecret();
  const now = 1_700_000_000;
  const code = generateTotp(secret, { time: now });
  assert.equal(verifyTotp(code, secret, { time: now, window: 1 }), true);
});

test('verifyTotp accepts codes from the previous and next 30s slot when window=1', () => {
  const secret = generateTotpSecret();
  const now = 1_700_000_000;
  const prev = generateTotp(secret, { time: now - 30 });
  const next = generateTotp(secret, { time: now + 30 });
  assert.equal(verifyTotp(prev, secret, { time: now, window: 1 }), true);
  assert.equal(verifyTotp(next, secret, { time: now, window: 1 }), true);
});

test('verifyTotp rejects codes from outside the allowed window', () => {
  const secret = generateTotpSecret();
  const now = 1_700_000_000;
  const tooOld = generateTotp(secret, { time: now - 120 });
  assert.equal(verifyTotp(tooOld, secret, { time: now, window: 1 }), false);
});

test('verifyTotp rejects codes generated with a different secret', () => {
  const secretA = generateTotpSecret();
  const secretB = generateTotpSecret();
  const now = 1_700_000_000;
  const code = generateTotp(secretA, { time: now });
  assert.equal(verifyTotp(code, secretB, { time: now, window: 1 }), false);
});

test('verifyTotp rejects malformed codes (non-digit, wrong length)', () => {
  const secret = generateTotpSecret();
  assert.equal(verifyTotp('abcdef', secret), false);
  assert.equal(verifyTotp('12345', secret), false);
  assert.equal(verifyTotp('1234567', secret), false);
  assert.equal(verifyTotp('', secret), false);
});

// =====================================================================
// otpauth:// URI
// =====================================================================

test('buildOtpauthUri produces an otpauth URI with required params', () => {
  const secret = 'JBSWY3DPEHPK3PXP';
  const uri = buildOtpauthUri({
    secret,
    accountName: 'admin@example.com',
    issuer: 'PromptStreak Admin',
  });
  assert.match(uri, /^otpauth:\/\/totp\//);
  assert.ok(uri.includes('secret=JBSWY3DPEHPK3PXP'));
  assert.ok(uri.includes('issuer=PromptStreak%20Admin'));
  assert.ok(uri.includes('algorithm=SHA1'));
  assert.ok(uri.includes('digits=6'));
  assert.ok(uri.includes('period=30'));
  // Label should be "Issuer:Account" url-encoded
  assert.ok(uri.includes('PromptStreak%20Admin:admin%40example.com'));
});
