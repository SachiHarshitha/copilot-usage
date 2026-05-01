import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getUploadClientIp,
  isTrustedUploadProxyRequest,
  UPLOAD_PROXY_SECRET_HEADER,
} from './upload-security';

test('getUploadClientIp trusts only valid x-real-ip values', () => {
  const valid = new Headers({ 'x-real-ip': '203.0.113.5' });
  const invalid = new Headers({ 'x-real-ip': 'not-an-ip' });
  const missing = new Headers();

  assert.equal(getUploadClientIp(valid), '203.0.113.5');
  assert.equal(getUploadClientIp(invalid), 'unknown');
  assert.equal(getUploadClientIp(missing), 'unknown');
});

test('isTrustedUploadProxyRequest allows non-production requests without proxy secret', () => {
  const headers = new Headers();
  assert.equal(
    isTrustedUploadProxyRequest(headers, {
      NODE_ENV: 'development',
      UPLOAD_INTERNAL_PROXY_SECRET: undefined,
    }),
    true
  );
});

test('isTrustedUploadProxyRequest fails closed in production when secret is missing', () => {
  const headers = new Headers();
  assert.equal(
    isTrustedUploadProxyRequest(headers, {
      NODE_ENV: 'production',
      UPLOAD_INTERNAL_PROXY_SECRET: undefined,
    }),
    false
  );
});

test('isTrustedUploadProxyRequest rejects mismatched proxy secret in production', () => {
  const headers = new Headers({ [UPLOAD_PROXY_SECRET_HEADER]: 'wrong-secret' });
  assert.equal(
    isTrustedUploadProxyRequest(headers, {
      NODE_ENV: 'production',
      UPLOAD_INTERNAL_PROXY_SECRET: 'expected-secret',
    }),
    false
  );
});

test('isTrustedUploadProxyRequest accepts matching proxy secret in production', () => {
  const headers = new Headers({ [UPLOAD_PROXY_SECRET_HEADER]: 'expected-secret' });
  assert.equal(
    isTrustedUploadProxyRequest(headers, {
      NODE_ENV: 'production',
      UPLOAD_INTERNAL_PROXY_SECRET: 'expected-secret',
    }),
    true
  );
});
