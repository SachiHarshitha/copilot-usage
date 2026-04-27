import * as assert from 'assert';
import { estimateModelCost } from '../features/costEstimator/calc/cost';
import { MODEL_PRICING } from '../features/costEstimator/pricing/models';
import { UsageEstimate } from '../features/costEstimator/types';

function usage(partial: Partial<UsageEstimate>): UsageEstimate {
  return {
    rangeLabel: 'Test',
    rangeStart: '2026-01-01',
    rangeEnd: '2026-01-31',
    daysInRange: 30,
    observedInputTokens: 0,
    observedOutputTokens: 0,
    monthlyInputTokens: 0,
    monthlyOutputTokens: 0,
    dataCompleteness: 'partial',
    ...partial,
  };
}

suite('Cost Estimator: estimateModelCost', () => {
  test('Spec §28.1 — 10M input + 300K output @ Claude Opus 4.7 → $57.50, 5750 credits', () => {
    const u = usage({ monthlyInputTokens: 10_000_000, monthlyOutputTokens: 300_000 });
    const c = estimateModelCost(u, MODEL_PRICING['claude-opus-4.7']);
    assert.strictEqual(Math.round(c.inputCostUsd * 100) / 100, 50);
    assert.strictEqual(Math.round(c.outputCostUsd * 100) / 100, 7.5);
    assert.strictEqual(Math.round(c.estimatedMonthlyUsd * 100) / 100, 57.5);
    assert.strictEqual(c.estimatedMonthlyCredits, 5750);
  });

  test('Spec §28.4 — undefined cache fields treated as 0, no NaN', () => {
    const u = usage({ monthlyInputTokens: 1_000_000, monthlyOutputTokens: 100_000 });
    const c = estimateModelCost(u, MODEL_PRICING['claude-sonnet-4.6']);
    assert.strictEqual(c.cachedInputCostUsd, 0);
    assert.strictEqual(c.cacheWriteCostUsd, 0);
    assert.ok(!Number.isNaN(c.estimatedMonthlyUsd));
    assert.strictEqual(c.hasCacheInputEstimate, false);
    assert.strictEqual(c.hasCacheWriteEstimate, false);
  });

  test('Cached input + cache write costs sum correctly when present', () => {
    const u = usage({
      monthlyInputTokens: 1_000_000,
      monthlyOutputTokens: 1_000_000,
      monthlyCachedInputTokens: 1_000_000,
      monthlyCacheWriteTokens: 1_000_000,
    });
    const c = estimateModelCost(u, MODEL_PRICING['claude-sonnet-4.6']);
    // 3 + 15 + 0.30 + 3.75 = 22.05
    assert.strictEqual(Math.round(c.estimatedMonthlyUsd * 100) / 100, 22.05);
    assert.strictEqual(c.hasCacheInputEstimate, true);
    assert.strictEqual(c.hasCacheWriteEstimate, true);
  });

  test('AI Credits round up (Math.ceil)', () => {
    const u = usage({ monthlyInputTokens: 1, monthlyOutputTokens: 0 });
    const c = estimateModelCost(u, MODEL_PRICING['claude-opus-4.7']);
    // 1 / 1_000_000 * 5 = 0.000005 USD → 0.0005 credits → ceil = 1
    assert.strictEqual(c.estimatedMonthlyCredits, 1);
  });
});
