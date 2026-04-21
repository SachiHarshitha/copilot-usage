import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getDeterministicDevGithubId,
  getDevTestAccountConfig,
  isLocalhostUrl,
  shouldAutoCreateDevTestAccount,
  shouldEnableDevLogin,
} from './auth-policy';

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

test('dev test account config is disabled by default', () => {
  const config = getDevTestAccountConfig({
    NODE_ENV: 'development',
    NEXTAUTH_URL: 'http://localhost:3000',
    ENABLE_DEV_LOGIN: 'true',
  });

  assert.equal(config.enabled, false);
  assert.equal(config.username, 'localtest');
});

test('dev test account config enables only when explicitly opted in', () => {
  const config = getDevTestAccountConfig({
    NODE_ENV: 'development',
    NEXTAUTH_URL: 'http://localhost:3000',
    ENABLE_DEV_LOGIN: 'true',
    ENABLE_DEV_TEST_ACCOUNT: 'true',
    DEV_TEST_ACCOUNT_USERNAME: 'QaUser',
    DEV_TEST_ACCOUNT_DISPLAY_NAME: 'QA User',
  });

  assert.equal(config.enabled, true);
  assert.equal(config.username, 'qauser');
  assert.equal(config.displayName, 'QA User');
});

test('shouldAutoCreateDevTestAccount only allows the configured local test username', () => {
  const env = {
    NODE_ENV: 'development',
    NEXTAUTH_URL: 'http://localhost:3000',
    ENABLE_DEV_LOGIN: 'true',
    ENABLE_DEV_TEST_ACCOUNT: 'true',
    DEV_TEST_ACCOUNT_USERNAME: 'localqa',
  };

  assert.equal(shouldAutoCreateDevTestAccount('localqa', env), true);
  assert.equal(shouldAutoCreateDevTestAccount('LOCALQA', env), true);
  assert.equal(shouldAutoCreateDevTestAccount('someone-else', env), false);
});

test('getDeterministicDevGithubId is stable and negative for local-only identities', () => {
  const id1 = getDeterministicDevGithubId('localqa');
  const id2 = getDeterministicDevGithubId('LOCALQA');
  const id3 = getDeterministicDevGithubId('another-user');

  assert.equal(id1, id2);
  assert.equal(id1 !== id3, true);
  assert.equal(id1 < 0, true);
});
