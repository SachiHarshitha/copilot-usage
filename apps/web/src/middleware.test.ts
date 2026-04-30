import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

const SECRET = 'test-proxy-secret-abcdefghij';

function buildReq(
  pathname: string,
  headers: Record<string, string> = {},
): NextRequest {
  return new NextRequest(`https://admin.example.com${pathname}`, {
    method: 'GET',
    headers,
  });
}

async function loadMiddleware() {
  // Re-import per test so env changes take effect.
  const mod = await import(`./middleware?ts=${Date.now()}`);
  return mod.middleware as (req: NextRequest) => Response;
}

test('middleware passes through non-admin paths untouched', async () => {
  process.env.ADMIN_INTERNAL_PROXY_SECRET = SECRET;
  delete process.env.ADMIN_NETWORK_GUARD;
  const middleware = await loadMiddleware();
  const res = middleware(buildReq('/api/public/data'));
  assert.equal(res.status, 200);
  // Hardening headers must NOT be applied to public surface.
  assert.equal(res.headers.get('Cache-Control'), null);
});

test('middleware returns 404 on /admin without trusted-origin headers', async () => {
  process.env.ADMIN_INTERNAL_PROXY_SECRET = SECRET;
  delete process.env.ADMIN_NETWORK_GUARD;
  const middleware = await loadMiddleware();
  const res = middleware(buildReq('/admin/dashboard'));
  assert.equal(res.status, 404);
});

test('middleware returns 404 when the proxy secret is wrong', async () => {
  process.env.ADMIN_INTERNAL_PROXY_SECRET = SECRET;
  delete process.env.ADMIN_NETWORK_GUARD;
  const middleware = await loadMiddleware();
  const res = middleware(
    buildReq('/admin/dashboard', {
      'x-internal-source': 'admin-loopback',
      'x-internal-proxy-secret': 'wrong-secret-value-1234567',
    }),
  );
  assert.equal(res.status, 404);
});

test('middleware allows requests with matching trusted-origin headers and adds hardening', async () => {
  process.env.ADMIN_INTERNAL_PROXY_SECRET = SECRET;
  delete process.env.ADMIN_NETWORK_GUARD;
  const middleware = await loadMiddleware();
  const res = middleware(
    buildReq('/admin/dashboard', {
      'x-internal-source': 'admin-loopback',
      'x-internal-proxy-secret': SECRET,
    }),
  );
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
  assert.equal(res.headers.get('X-Robots-Tag'), 'noindex, nofollow');
  assert.equal(res.headers.get('Referrer-Policy'), 'no-referrer');
  assert.equal(res.headers.get('X-Content-Type-Options'), 'nosniff');
});

test('middleware returns 404 when the proxy secret env var is missing', async () => {
  delete process.env.ADMIN_INTERNAL_PROXY_SECRET;
  delete process.env.ADMIN_NETWORK_GUARD;
  const middleware = await loadMiddleware();
  const res = middleware(
    buildReq('/admin/dashboard', {
      'x-internal-source': 'admin-loopback',
      'x-internal-proxy-secret': SECRET,
    }),
  );
  assert.equal(res.status, 404);
});

test('ADMIN_NETWORK_GUARD=disabled bypasses the trusted-origin check', async () => {
  delete process.env.ADMIN_INTERNAL_PROXY_SECRET;
  process.env.ADMIN_NETWORK_GUARD = 'disabled';
  const middleware = await loadMiddleware();
  const res = middleware(buildReq('/admin/dashboard'));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
});

test('safeEqual constant-time path resists length-mismatch oracle (404, no throw)', async () => {
  process.env.ADMIN_INTERNAL_PROXY_SECRET = SECRET;
  delete process.env.ADMIN_NETWORK_GUARD;
  const middleware = await loadMiddleware();
  // Wildly different length should not throw.
  const res = middleware(
    buildReq('/admin/dashboard', {
      'x-internal-source': 'admin-loopback',
      'x-internal-proxy-secret': 'x',
    }),
  );
  assert.equal(res.status, 404);
});
