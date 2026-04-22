import assert from 'node:assert/strict';
import test from 'node:test';

import { computeRankPercentile } from './data';

test('computeRankPercentile supports bigint inputs', () => {
  const percentile = computeRankPercentile(1n, 10n);
  assert.equal(percentile, 100);
});

test('computeRankPercentile supports mixed numeric types', () => {
  const percentile = computeRankPercentile(3n, 10);
  assert.equal(percentile, 80);
});

test('computeRankPercentile returns null for invalid values', () => {
  assert.equal(computeRankPercentile(null, 10n), null);
  assert.equal(computeRankPercentile(2n, 0n), null);
  assert.equal(computeRankPercentile(0, 10), null);
});
