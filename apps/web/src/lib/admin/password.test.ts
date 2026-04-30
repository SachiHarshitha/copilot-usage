import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertPasswordStrength,
  hashPassword,
  verifyPassword,
} from './password';

test('hashPassword produces a bcrypt hash with cost >= 12', async () => {
  const hash = await hashPassword('correct horse battery staple');
  assert.match(hash, /^\$2[aby]\$/);
  const cost = Number(hash.split('$')[2]);
  assert.ok(cost >= 12, `expected cost >= 12, got ${cost}`);
});

test('verifyPassword accepts the correct password and rejects wrong ones', async () => {
  const hash = await hashPassword('correct horse battery staple');
  assert.equal(await verifyPassword('correct horse battery staple', hash), true);
  assert.equal(await verifyPassword('wrong password 12345!', hash), false);
});

test('hashPassword produces a different hash each time (salted)', async () => {
  const a = await hashPassword('correct horse battery staple');
  const b = await hashPassword('correct horse battery staple');
  assert.notEqual(a, b);
});

test('verifyPassword returns false on a malformed hash without throwing', async () => {
  assert.equal(await verifyPassword('anything', 'not-a-bcrypt-hash'), false);
});

test('assertPasswordStrength rejects passwords shorter than 12 characters', () => {
  assert.throws(() => assertPasswordStrength('Short1!a'), /at least 12/i);
});

test('assertPasswordStrength rejects passwords missing character classes', () => {
  assert.throws(() => assertPasswordStrength('alllowercaseletters'), /character classes|uppercase|digit|symbol/i);
  assert.throws(() => assertPasswordStrength('ALLUPPERCASELETTERS'), /character classes|lowercase|digit|symbol/i);
  assert.throws(() => assertPasswordStrength('NoDigitsHereJustLetters'), /digit/i);
});

test('assertPasswordStrength rejects common weak passwords from the deny list', () => {
  assert.throws(() => assertPasswordStrength('Password1234!'), /common|weak/i);
  assert.throws(() => assertPasswordStrength('Qwerty123456!'), /common|weak/i);
});

test('assertPasswordStrength accepts a strong password', () => {
  assert.doesNotThrow(() => assertPasswordStrength('Tr0ub4dor&3-correct-horse'));
});
