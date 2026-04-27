import * as assert from 'assert';
import { computePlanImpact } from '../features/costEstimator/calc/plan';
import { CostEstimate, CostEstimatorSettings } from '../features/costEstimator/types';

function cost(credits: number): CostEstimate {
  return {
    modelId: 'x',
    modelDisplayName: 'X',
    estimatedMonthlyUsd: credits * 0.01,
    estimatedMonthlyCredits: credits,
    inputCostUsd: 0,
    outputCostUsd: 0,
    cachedInputCostUsd: 0,
    cacheWriteCostUsd: 0,
    hasCacheInputEstimate: false,
    hasCacheWriteEstimate: false,
  };
}

function settings(partial: Partial<CostEstimatorSettings>): CostEstimatorSettings {
  return {
    selectedPlan: 'pro_plus',
    billingModel: 'individual_monthly',
    extraBudgetUsd: 0,
    selectedModelId: 'claude-sonnet-4.6',
    defaultRange: 'last_30_days',
    ...partial,
  };
}

suite('Cost Estimator: computePlanImpact', () => {
  test('Spec §28.2 — 5750 credits on Pro+ → overage 1850, extra $18.50', () => {
    const r = computePlanImpact(cost(5750), settings({ selectedPlan: 'pro_plus' }));
    assert.strictEqual(r.includedCredits, 3900);
    assert.strictEqual(r.overageCredits, 1850);
    assert.strictEqual(Math.round(r.estimatedExtraUsd! * 100) / 100, 18.5);
    assert.strictEqual(r.isWithinIncludedAllowance, false);
  });

  test('Spec §28.3 — extra budget $25 covers 1850-credit overage', () => {
    const r = computePlanImpact(cost(5750), settings({ selectedPlan: 'pro_plus', extraBudgetUsd: 25 }));
    assert.strictEqual(r.extraBudgetCredits, 2500);
    assert.strictEqual(r.isCoveredByExtraBudget, true);
    assert.strictEqual(r.status, 'over_allowance_within_budget');
  });

  test('Within Pro allowance', () => {
    const r = computePlanImpact(cost(500), settings({ selectedPlan: 'pro' }));
    assert.strictEqual(r.includedCredits, 1000);
    assert.strictEqual(r.overageCredits, 0);
    assert.strictEqual(r.isWithinIncludedAllowance, true);
    assert.strictEqual(r.status, 'within_allowance');
  });

  test('Spec §28.5 — Business plan emits pooled-allowance warning', () => {
    const r = computePlanImpact(cost(5750), settings({ selectedPlan: 'business' }));
    assert.strictEqual(r.status, 'pooled_org');
    assert.ok(r.warnings.some(w => w.includes('1,900 credits per assigned user')));
  });

  test('Enterprise plan emits enterprise pooled warning', () => {
    const r = computePlanImpact(cost(5750), settings({ selectedPlan: 'enterprise' }));
    assert.ok(r.warnings.some(w => w.includes('3,900 credits per assigned user')));
  });

  test('Mobile billing emits no-extra-credits warning', () => {
    const r = computePlanImpact(cost(100), settings({ billingModel: 'mobile_ios_android' }));
    assert.ok(r.warnings.some(w => w.toLowerCase().includes('mobile')));
  });

  test('Annual billing emits transition warning', () => {
    const r = computePlanImpact(cost(100), settings({ billingModel: 'individual_annual' }));
    assert.ok(r.warnings.some(w => w.toLowerCase().includes('annual')));
  });

  test('Over allowance + insufficient budget → exceeds_budget status', () => {
    const r = computePlanImpact(cost(5750), settings({ selectedPlan: 'pro_plus', extraBudgetUsd: 5 }));
    assert.strictEqual(r.status, 'over_allowance_exceeds_budget');
    assert.strictEqual(r.isCoveredByExtraBudget, false);
  });
});
