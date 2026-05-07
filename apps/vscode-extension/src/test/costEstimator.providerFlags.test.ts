import * as assert from 'assert';
import {
  classifyProviderRelativeCost,
  classifySavingsVsBaseline,
  providerComparableMonthlyUsd,
  providerNearMarginUsd,
} from '../features/costEstimator/calc/providers';
import { ProviderEstimate } from '../features/costEstimator/types';

function provider(partial: Partial<ProviderEstimate>): ProviderEstimate {
  return {
    productId: 'test-product',
    provider: 'Test Provider',
    product: 'Test Product',
    billingKind: 'token_metered',
    estimateKind: 'exact_formula',
    confidence: 'high',
    assumptions: [],
    caveats: [],
    sourceUrls: [],
    isStale: false,
    requiresManualReview: false,
    ...partial,
  };
}

suite('Cost Estimator: provider relative cost flags', () => {
  test('uses a minimum near-current margin of two dollars', () => {
    assert.strictEqual(providerNearMarginUsd(5), 2);
  });

  test('uses ten percent margin when baseline is higher', () => {
    assert.strictEqual(providerNearMarginUsd(100), 10);
  });

  test('classifies lower provider cost as cheaper', () => {
    const row = provider({ monthlyCost: { expected: 16, currency: 'USD' } });
    const result = classifyProviderRelativeCost(row, 20);

    assert.strictEqual(result.flag, 'cheaper');
    assert.strictEqual(result.deltaUsd, -4);
  });

  test('classifies close provider cost as near current', () => {
    const row = provider({ monthlyCost: { expected: 21.5, currency: 'USD' } });
    const result = classifyProviderRelativeCost(row, 20);

    assert.strictEqual(result.flag, 'near_current');
    assert.strictEqual(result.marginUsd, 2);
  });

  test('classifies higher provider cost as higher', () => {
    const row = provider({ monthlyCost: { expected: 24.5, currency: 'USD' } });
    const result = classifyProviderRelativeCost(row, 20);

    assert.strictEqual(result.flag, 'higher');
    assert.strictEqual(result.deltaUsd, 4.5);
  });

  test('derives comparable monthly cost from range midpoint', () => {
    const row = provider({ monthlyCost: { low: 10, high: 14, currency: 'USD' } });

    assert.strictEqual(providerComparableMonthlyUsd(row), 12);
  });

  test('returns unavailable when monthly cost is missing', () => {
    const row = provider({ monthlyCost: undefined });
    const result = classifyProviderRelativeCost(row, 20);

    assert.strictEqual(result.flag, 'unavailable');
    assert.strictEqual(result.deltaUsd, undefined);
  });

  test('treats small savings as near current using baseline buffer', () => {
    const result = classifySavingsVsBaseline(2.74, 40);

    assert.strictEqual(result.flag, 'near_current');
    assert.strictEqual(result.marginUsd, 4);
  });

  test('classifies savings above the buffer as significant savings', () => {
    const result = classifySavingsVsBaseline(5.5, 40);

    assert.strictEqual(result.flag, 'significant_savings');
    assert.strictEqual(result.marginUsd, 4);
  });

  test('classifies negative savings outside the buffer as higher', () => {
    const result = classifySavingsVsBaseline(-4.5, 40);

    assert.strictEqual(result.flag, 'higher');
    assert.strictEqual(result.marginUsd, 4);
  });
});
