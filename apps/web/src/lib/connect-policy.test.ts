import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDeviceName,
  isTrustedRequestOrigin,
  isValidDeviceCode,
} from './connect-policy';

test('isValidDeviceCode accepts valid code characters', () => {
  assert.equal(isValidDeviceCode('abcDEF12:_.-xyz'), true);
});

test('isValidDeviceCode rejects short and invalid characters', () => {
  assert.equal(isValidDeviceCode('short7'), false);
  assert.equal(isValidDeviceCode('contains space'), false);
  assert.equal(isValidDeviceCode('bad/slash'), false);
});

test('isTrustedRequestOrigin accepts matching origin header', () => {
  assert.equal(
    isTrustedRequestOrigin('https://promptstreak.dev', null, 'https://promptstreak.dev'),
    true
  );
});

test('isTrustedRequestOrigin accepts matching referer when origin missing', () => {
  assert.equal(
    isTrustedRequestOrigin(null, 'https://promptstreak.dev/connect?code=abcd1234', 'https://promptstreak.dev'),
    true
  );
});

test('isTrustedRequestOrigin rejects mismatched or invalid values', () => {
  assert.equal(
    isTrustedRequestOrigin('https://evil.example', null, 'https://promptstreak.dev'),
    false
  );
  assert.equal(
    isTrustedRequestOrigin(null, 'not-a-url', 'https://promptstreak.dev'),
    false
  );
  assert.equal(isTrustedRequestOrigin(null, null, 'https://promptstreak.dev'), false);
});

test('buildDeviceName uses an 8-character prefix', () => {
  assert.equal(buildDeviceName('ABCDEFGH1234'), 'Device ABCDEFGH');
});
