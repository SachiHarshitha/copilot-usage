import assert from 'node:assert/strict';
import test from 'node:test';

import { CONTENT_SECURITY_POLICY, getSecurityHeaders } from './security-headers';

function hasHeader(headers: { key: string; value: string }[], key: string): boolean {
  return headers.some((header) => header.key === key);
}

test('CSP includes clickjacking and object restrictions', () => {
  assert.equal(CONTENT_SECURITY_POLICY.includes("frame-ancestors 'none'"), true);
  assert.equal(CONTENT_SECURITY_POLICY.includes("object-src 'none'"), true);
});

test('base security headers are present in non-production mode', () => {
  const headers = getSecurityHeaders(false);
  assert.equal(hasHeader(headers, 'Content-Security-Policy'), true);
  assert.equal(hasHeader(headers, 'Referrer-Policy'), true);
  assert.equal(hasHeader(headers, 'X-Content-Type-Options'), true);
  assert.equal(hasHeader(headers, 'X-Frame-Options'), true);
  assert.equal(hasHeader(headers, 'Permissions-Policy'), true);
  assert.equal(hasHeader(headers, 'Strict-Transport-Security'), false);
});

test('HSTS is added only in production mode', () => {
  const headers = getSecurityHeaders(true);
  assert.equal(hasHeader(headers, 'Strict-Transport-Security'), true);
});
