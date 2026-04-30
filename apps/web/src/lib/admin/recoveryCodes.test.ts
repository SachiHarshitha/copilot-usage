import assert from 'node:assert/strict';
import test from 'node:test';

import {
  generateRecoveryCodes,
  hashRecoveryCode,
  verifyRecoveryCode,
} from './recoveryCodes';

test('generateRecoveryCodes returns 10 codes by default', () => {
  const codes = generateRecoveryCodes();
  assert.equal(codes.length, 10);
});

test('generateRecoveryCodes honours the count argument', () => {
  assert.equal(generateRecoveryCodes(5).length, 5);
  assert.equal(generateRecoveryCodes(20).length, 20);
});

test('every recovery code matches the XXXXX-XXXXX format using base32 characters', () => {
  const codes = generateRecoveryCodes(50);
  for (const code of codes) {
    assert.match(code, /^[A-Z2-7]{5}-[A-Z2-7]{5}$/);
  }
});

test('recovery codes are unique across a large sample', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 5_000; i += 1) {
    for (const code of generateRecoveryCodes(10)) {
      assert.equal(seen.has(code), false, `collision: ${code}`);
      seen.add(code);
    }
  }
});

test('hashRecoveryCode produces a bcrypt hash and verifyRecoveryCode round-trips', async () => {
  const [code] = generateRecoveryCodes(1);
  const hash = await hashRecoveryCode(code);
  assert.match(hash, /^\$2[aby]\$/);
  assert.equal(await verifyRecoveryCode(code, hash), true);
  assert.equal(await verifyRecoveryCode('AAAAA-BBBBB', hash), false);
});

test('verifyRecoveryCode accepts codes regardless of case and surrounding whitespace', async () => {
  const [code] = generateRecoveryCodes(1);
  const hash = await hashRecoveryCode(code);
  assert.equal(await verifyRecoveryCode(code.toLowerCase(), hash), true);
  assert.equal(await verifyRecoveryCode(`  ${code}  `, hash), true);
});

test('verifyRecoveryCode returns false on a malformed hash without throwing', async () => {
  assert.equal(await verifyRecoveryCode('AAAAA-BBBBB', 'not-a-bcrypt-hash'), false);
});
