import { test } from 'node:test';
import assert from 'node:assert/strict';

import { loadMailConfig, SMTP_PASSWORD_SECRET_PATH } from './smtpConfig';

const baseEnv = {
  SMTP_HOST: 'smtp.example.com',
  SMTP_PORT: '587',
  SMTP_SECURE: 'false',
  SMTP_USER: 'noreply@example.com',
  MAIL_FROM: 'Promptstreak <noreply@example.com>',
  SMTP_PASSWORD: 'env-password',
} satisfies NodeJS.ProcessEnv;

test('loadMailConfig reads all SMTP env vars and falls back to env password', () => {
  const cfg = loadMailConfig(baseEnv, () => null);
  assert.equal(cfg.host, 'smtp.example.com');
  assert.equal(cfg.port, 587);
  assert.equal(cfg.secure, false);
  assert.equal(cfg.user, 'noreply@example.com');
  assert.equal(cfg.from, 'Promptstreak <noreply@example.com>');
  assert.equal(cfg.password, 'env-password');
});

test('loadMailConfig prefers the docker-secret password over the env var', () => {
  const cfg = loadMailConfig(baseEnv, (path) => {
    assert.equal(path, SMTP_PASSWORD_SECRET_PATH);
    return 'secret-from-file';
  });
  assert.equal(cfg.password, 'secret-from-file');
});

test('loadMailConfig honours SMTP_PASSWORD_FILE override path', () => {
  const env = { ...baseEnv, SMTP_PASSWORD_FILE: '/custom/path' };
  let calledWith: string | null = null;
  loadMailConfig(env, (path) => {
    calledWith = path;
    return 'x';
  });
  assert.equal(calledWith, '/custom/path');
});

test('loadMailConfig parses SMTP_SECURE truthy variants', () => {
  for (const v of ['true', 'TRUE', '1', 'yes', 'on']) {
    const cfg = loadMailConfig({ ...baseEnv, SMTP_SECURE: v }, () => null);
    assert.equal(cfg.secure, true, `expected ${v} → true`);
  }
});

test('loadMailConfig throws when SMTP_HOST missing', () => {
  const env = { ...baseEnv, SMTP_HOST: undefined };
  assert.throws(() => loadMailConfig(env, () => null), /SMTP_HOST/);
});

test('loadMailConfig throws when MAIL_FROM missing', () => {
  const env = { ...baseEnv, MAIL_FROM: '' };
  assert.throws(() => loadMailConfig(env, () => null), /MAIL_FROM/);
});

test('loadMailConfig throws on an out-of-range SMTP_PORT', () => {
  const env = { ...baseEnv, SMTP_PORT: '70000' };
  assert.throws(() => loadMailConfig(env, () => null), /SMTP_PORT/);
});

test('loadMailConfig throws when neither secret nor env password is set', () => {
  const env = { ...baseEnv, SMTP_PASSWORD: undefined };
  assert.throws(() => loadMailConfig(env, () => null), /SMTP password missing/);
});
