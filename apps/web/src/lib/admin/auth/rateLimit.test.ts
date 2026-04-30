import test from 'node:test';
import assert from 'node:assert/strict';

import { createRateLimiter } from './rateLimit';

test('allows up to capacity attempts then refuses', () => {
  const rl = createRateLimiter();
  const t0 = 1_000_000;
  for (let i = 0; i < 5; i += 1) {
    const r = rl.consume({ key: 'ip:1', perMinute: 5 }, t0);
    assert.equal(r.allowed, true, `attempt ${i + 1} should be allowed`);
  }
  const denied = rl.consume({ key: 'ip:1', perMinute: 5 }, t0);
  assert.equal(denied.allowed, false);
  assert.ok(denied.retryAfterSeconds >= 1, 'retry-after must be >= 1s');
});

test('refills proportionally over time', () => {
  const rl = createRateLimiter();
  const t0 = 0;
  // Burn through all 5 tokens at t0.
  for (let i = 0; i < 5; i += 1) rl.consume({ key: 'k', perMinute: 5 }, t0);
  assert.equal(rl.consume({ key: 'k', perMinute: 5 }, t0).allowed, false);
  // 12s later we should have refilled exactly 1 token (5 per minute → 1 per 12s).
  const t1 = t0 + 12_000;
  assert.equal(rl.consume({ key: 'k', perMinute: 5 }, t1).allowed, true);
  // No more headroom right after.
  assert.equal(rl.consume({ key: 'k', perMinute: 5 }, t1).allowed, false);
});

test('different keys do not share buckets', () => {
  const rl = createRateLimiter();
  for (let i = 0; i < 5; i += 1) {
    assert.equal(rl.consume({ key: 'ip:a', perMinute: 5 }, 0).allowed, true);
  }
  assert.equal(rl.consume({ key: 'ip:b', perMinute: 5 }, 0).allowed, true);
});

test('zero perMinute denies everything', () => {
  const rl = createRateLimiter();
  assert.equal(rl.consume({ key: 'k', perMinute: 0 }, 0).allowed, false);
});

test('reset clears all bucket state', () => {
  const rl = createRateLimiter();
  for (let i = 0; i < 5; i += 1) rl.consume({ key: 'k', perMinute: 5 }, 0);
  assert.equal(rl.consume({ key: 'k', perMinute: 5 }, 0).allowed, false);
  rl.reset();
  assert.equal(rl.consume({ key: 'k', perMinute: 5 }, 0).allowed, true);
});
