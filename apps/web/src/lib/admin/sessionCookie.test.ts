import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ADMIN_SESSION_COOKIE_NAME,
  clearSessionCookie,
  serializeSessionCookie,
} from './sessionCookie';

test('ADMIN_SESSION_COOKIE_NAME uses the __Host- prefix', () => {
  assert.equal(ADMIN_SESSION_COOKIE_NAME, '__Host-promptstreak_admin_sid');
});

test('serializeSessionCookie emits all hardening flags', () => {
  const cookie = serializeSessionCookie('token-value', { maxAgeSeconds: 1800 });
  assert.ok(cookie.startsWith(`${ADMIN_SESSION_COOKIE_NAME}=token-value;`));
  assert.match(cookie, /;\s*Path=\//);
  assert.match(cookie, /;\s*HttpOnly(?:;|$)/);
  assert.match(cookie, /;\s*Secure(?:;|$)/);
  assert.match(cookie, /;\s*SameSite=Strict(?:;|$)/);
  assert.match(cookie, /;\s*Max-Age=1800(?:;|$)/);
});

test('serializeSessionCookie URL-encodes the token to defeat header injection', () => {
  const cookie = serializeSessionCookie('a;b=c\nd', { maxAgeSeconds: 60 });
  assert.equal(cookie.includes(';b=c'), false);
  assert.equal(cookie.includes('\n'), false);
  assert.ok(cookie.includes('a%3Bb%3Dc%0Ad'));
});

test('clearSessionCookie returns a Max-Age=0 expiring cookie with the same flags', () => {
  const cookie = clearSessionCookie();
  assert.ok(cookie.startsWith(`${ADMIN_SESSION_COOKIE_NAME}=;`));
  assert.match(cookie, /;\s*Max-Age=0(?:;|$)/);
  assert.match(cookie, /;\s*Path=\//);
  assert.match(cookie, /;\s*HttpOnly(?:;|$)/);
  assert.match(cookie, /;\s*Secure(?:;|$)/);
  assert.match(cookie, /;\s*SameSite=Strict(?:;|$)/);
});
