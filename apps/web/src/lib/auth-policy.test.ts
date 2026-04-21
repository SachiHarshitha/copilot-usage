import assert from 'node:assert/strict';
import test from 'node:test';

import { isLocalhostUrl, shouldEnableDevLogin } from './auth-policy';

test('isLocalhostUrl validates localhost and 127.0.0.1 only', () => {
  assert.equal(isLocalhostUrl('http://localhost:3000'), true);
  assert.equal(isLocalhostUrl('https://127.0.0.1:8443'), true);
  assert.equal(isLocalhostUrl('https://promptstreak.dev'), false);
  assert.equal(isLocalhostUrl(undefined), false);
});

test('shouldEnableDevLogin is disabled by default', () => {
  assert.equal(
    shouldEnableDevLogin({
      NODE_ENV: 'development',
      NEXTAUTH_URL: 'http://localhost:3000',
    }),
    false
  );
});

test('shouldEnableDevLogin requires dev mode and explicit opt-in', () => {
  assert.equal(
    shouldEnableDevLogin({
      NODE_ENV: 'production',
      ENABLE_DEV_LOGIN: 'true',
      NEXTAUTH_URL: 'http://localhost:3000',
    }),
    false
  );

  assert.equal(
    shouldEnableDevLogin({
      NODE_ENV: 'development',
      ENABLE_DEV_LOGIN: 'true',
      NEXTAUTH_URL: 'http://localhost:3000',
    }),
    true
  );
});

test('shouldEnableDevLogin blocks non-local URLs unless explicitly overridden', () => {
  assert.equal(
    shouldEnableDevLogin({
      NODE_ENV: 'development',
      ENABLE_DEV_LOGIN: 'true',
      NEXTAUTH_URL: 'https://promptstreak.dev',
    }),
    false
  );

  assert.equal(
    shouldEnableDevLogin({
      NODE_ENV: 'development',
      ENABLE_DEV_LOGIN: 'true',
      ALLOW_DEV_LOGIN_NONLOCAL: 'true',
      NEXTAUTH_URL: 'https://promptstreak.dev',
    }),
    true
  );
});
