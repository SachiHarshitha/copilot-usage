import test from 'node:test';
import assert from 'node:assert/strict';

import { MetricsCache } from './metrics';

function fakeClock(initialMs: number) {
  let now = initialMs;
  return {
    advance(ms: number) {
      now += ms;
    },
    clock: { now: () => new Date(now) },
  };
}

test('MetricsCache: returns cached value within TTL without recomputing', async () => {
  const { clock } = fakeClock(1_000_000);
  const cache = new MetricsCache(60_000, clock);
  let calls = 0;
  const compute = async () => {
    calls++;
    return calls;
  };
  const a = await cache.get('k', compute);
  const b = await cache.get('k', compute);
  assert.equal(a, 1);
  assert.equal(b, 1);
  assert.equal(calls, 1);
});

test('MetricsCache: recomputes after TTL expires', async () => {
  const f = fakeClock(1_000_000);
  const cache = new MetricsCache(60_000, f.clock);
  let calls = 0;
  const compute = async () => ++calls;
  await cache.get('k', compute);
  f.advance(59_999);
  await cache.get('k', compute);
  assert.equal(calls, 1, 'still within TTL');
  f.advance(2);
  await cache.get('k', compute);
  assert.equal(calls, 2, 'recomputed after TTL');
});

test('MetricsCache: keys are independent', async () => {
  const { clock } = fakeClock(0);
  const cache = new MetricsCache(60_000, clock);
  const a = await cache.get('a', async () => 'A');
  const b = await cache.get('b', async () => 'B');
  assert.equal(a, 'A');
  assert.equal(b, 'B');
});

test('MetricsCache: invalidate(key) drops just that key', async () => {
  const { clock } = fakeClock(0);
  const cache = new MetricsCache(60_000, clock);
  let aCalls = 0;
  let bCalls = 0;
  await cache.get('a', async () => ++aCalls);
  await cache.get('b', async () => ++bCalls);
  cache.invalidate('a');
  await cache.get('a', async () => ++aCalls);
  await cache.get('b', async () => ++bCalls);
  assert.equal(aCalls, 2);
  assert.equal(bCalls, 1);
});

test('MetricsCache: invalidate() with no key clears everything', async () => {
  const { clock } = fakeClock(0);
  const cache = new MetricsCache(60_000, clock);
  let calls = 0;
  await cache.get('a', async () => ++calls);
  await cache.get('b', async () => ++calls);
  cache.invalidate();
  await cache.get('a', async () => ++calls);
  await cache.get('b', async () => ++calls);
  assert.equal(calls, 4);
});
