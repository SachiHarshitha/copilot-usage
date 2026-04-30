import test from 'node:test';
import assert from 'node:assert/strict';

import { adminAuthRateLimiter } from './rateLimit';

// We pull the loginHandler late so the prisma import inside it isn't evaluated
// for tests we don't run end-to-end here; we just verify the rate-limiting
// behaviour at the HTTP layer.
test('login route returns 429 when the per-IP budget is exhausted', async () => {
  adminAuthRateLimiter.reset();

  const { NextRequest } = await import('next/server');
  const { loginHandler } = await import('./routeHandlers');

  const buildReq = () =>
    new NextRequest('https://admin.example.com/api/admin/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.99' },
      body: JSON.stringify({ email: '', password: '' }),
    });

  // 10/min → first 10 attempts get past the limiter (and fail validation
  // with 400 because email/password are blank). The 11th must be 429.
  let lastStatus = 0;
  for (let i = 0; i < 10; i += 1) {
    const res = await loginHandler(buildReq());
    lastStatus = res.status;
    assert.notEqual(res.status, 429, `attempt ${i + 1} should not be rate limited`);
  }
  // lastStatus is 400 (bad input) — proves we got past the limiter.
  assert.equal(lastStatus, 400);

  const blocked = await loginHandler(buildReq());
  assert.equal(blocked.status, 429);
  assert.ok(blocked.headers.get('Retry-After'));
  const body = await blocked.json();
  assert.equal(body.error, 'rate_limited');
});

test('logout route always clears the cookie', async () => {
  adminAuthRateLimiter.reset();

  const { NextRequest } = await import('next/server');
  const { logoutHandler } = await import('./routeHandlers');

  const req = new NextRequest('https://admin.example.com/api/admin/auth/logout', {
    method: 'POST',
    headers: { 'x-forwarded-for': '203.0.113.10' },
  });
  const res = await logoutHandler(req);
  assert.equal(res.status, 200);
  const setCookie = res.headers.get('Set-Cookie') ?? '';
  assert.match(setCookie, /__Host-promptstreak_admin_sid=; .*Max-Age=0/);
});
