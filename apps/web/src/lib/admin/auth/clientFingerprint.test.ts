import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getClientIpFromHeaders,
  hashEmail,
  hashIp,
  hashUserAgent,
} from './clientFingerprint';

test('hashIp returns null for empty input', () => {
  assert.equal(hashIp(null), null);
  assert.equal(hashIp(undefined), null);
  assert.equal(hashIp(''), null);
  assert.equal(hashIp('   '), null);
});

test('hashIp is deterministic and case/whitespace tolerant', () => {
  const a = hashIp('203.0.113.5');
  const b = hashIp('  203.0.113.5  ');
  assert.equal(a, b);
  assert.equal(a!.length, 64);
});

test('hashIp differs for different IPs', () => {
  assert.notEqual(hashIp('203.0.113.5'), hashIp('203.0.113.6'));
});

test('hashUserAgent and hashEmail produce 64-hex digests', () => {
  assert.match(hashUserAgent('Mozilla/5.0')!, /^[0-9a-f]{64}$/);
  assert.match(hashEmail('admin@example.com'), /^[0-9a-f]{64}$/);
});

test('hashEmail normalizes case and whitespace', () => {
  assert.equal(hashEmail('ADMIN@example.com'), hashEmail('  admin@example.com '));
});

test('getClientIpFromHeaders prefers x-forwarded-for first hop', () => {
  const h = new Headers({ 'x-forwarded-for': '203.0.113.5, 10.0.0.1' });
  assert.equal(getClientIpFromHeaders(h), '203.0.113.5');
});

test('getClientIpFromHeaders falls back to x-real-ip then unknown', () => {
  assert.equal(
    getClientIpFromHeaders(new Headers({ 'x-real-ip': '198.51.100.7' })),
    '198.51.100.7',
  );
  assert.equal(getClientIpFromHeaders(new Headers()), 'unknown');
});
