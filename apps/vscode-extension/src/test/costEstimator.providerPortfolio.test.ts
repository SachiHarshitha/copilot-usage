import * as assert from 'assert';
import { buildProviderEstimates } from '../features/costEstimator/calc/providers';
import {
  buildProviderDecisionSurface,
  computeFitScorePct,
} from '../features/costEstimator/calc/providerPortfolio';
import { ModelMonthlyUsageEntry, ProviderModelCostContext } from '../features/costEstimator/calc/modelMix';
import { CostEstimate, CostEstimatorSettings, UsageEstimate } from '../features/costEstimator/types';

function usage(partial: Partial<UsageEstimate>): UsageEstimate {
  return {
    rangeLabel: 'Test',
    rangeStart: '2026-05-01',
    rangeEnd: '2026-05-31',
    daysInRange: 30,
    observedInputTokens: 0,
    observedOutputTokens: 0,
    observedCachedInputTokens: undefined,
    observedCacheWriteTokens: undefined,
    monthlyInputTokens: 0,
    monthlyOutputTokens: 0,
    monthlyCachedInputTokens: undefined,
    monthlyCacheWriteTokens: undefined,
    dataCompleteness: 'partial',
    ...partial,
  };
}

function settings(partial: Partial<CostEstimatorSettings>): CostEstimatorSettings {
  return {
    selectedPlan: 'pro_plus',
    billingModel: 'individual_monthly',
    extraBudgetUsd: 0,
    selectedModelId: 'claude-opus-4.6',
    defaultRange: 'last_30_days',
    ...partial,
  };
}

function selectedCost(usd: number, credits: number): CostEstimate {
  return {
    modelId: 'claude-opus-4.6',
    modelDisplayName: 'Claude Opus 4.6',
    estimatedMonthlyUsd: usd,
    estimatedMonthlyCredits: credits,
    inputCostUsd: 0,
    outputCostUsd: 0,
    cachedInputCostUsd: 0,
    cacheWriteCostUsd: 0,
    hasCacheInputEstimate: false,
    hasCacheWriteEstimate: false,
  };
}

function aggregateProviderUsage(mix: ModelMonthlyUsageEntry[]): ProviderModelCostContext['providerMonthlyUsage'] {
  const totals = new Map<string, { input: number; output: number; total: number }>();
  let allTokens = 0;
  for (const entry of mix) {
    const key = entry.provider;
    const current = totals.get(key) ?? { input: 0, output: 0, total: 0 };
    current.input += entry.inputTokens;
    current.output += entry.outputTokens;
    current.total += entry.inputTokens + entry.outputTokens;
    allTokens += entry.inputTokens + entry.outputTokens;
    totals.set(key, current);
  }

  const result: ProviderModelCostContext['providerMonthlyUsage'] = {};
  for (const [provider, value] of totals.entries()) {
    result[provider as keyof ProviderModelCostContext['providerMonthlyUsage']] = {
      inputTokens: value.input,
      outputTokens: value.output,
      totalTokens: value.total,
      share: allTokens > 0 ? value.total / allTokens : 0,
    };
  }
  return result;
}

function modelContext(mix: ModelMonthlyUsageEntry[], monthlyUsd: number): ProviderModelCostContext {
  const totalMonthlyInputTokens = mix.reduce((sum, entry) => sum + entry.inputTokens, 0);
  const totalMonthlyOutputTokens = mix.reduce((sum, entry) => sum + entry.outputTokens, 0);
  return {
    monthlyUsd,
    monthlyCredits: Math.ceil(monthlyUsd / 0.01),
    knownModelCoveragePct: 100,
    providerMonthlyUsage: aggregateProviderUsage(mix),
    modelMonthlyUsage: mix,
    totalMonthlyInputTokens,
    totalMonthlyOutputTokens,
  };
}

suite('Cost Estimator: provider portfolio decision surface', () => {
  test('fit score formula uses family+tier+exact weighting', () => {
    const score = computeFitScorePct(0.8, 0.6, 0.2);
    assert.strictEqual(score, 61);
  });

  test('Opus-heavy baseline: Anthropic family high, OpenAI/Gemini downgrade risk', () => {
    const mix: ModelMonthlyUsageEntry[] = [
      { modelId: 'claude-opus-4.6', provider: 'Anthropic', category: 'Powerful', inputTokens: 16_051_864, outputTokens: 109_542 },
      { modelId: 'claude-opus-4.7', provider: 'Anthropic', category: 'Powerful', inputTokens: 2_142_007, outputTokens: 17_647 },
      { modelId: 'claude-sonnet-4.6', provider: 'Anthropic', category: 'Versatile', inputTokens: 1_221_691, outputTokens: 11_835 },
      { modelId: 'gpt-5.3-codex', provider: 'OpenAI', category: 'Powerful', inputTokens: 1_593_442, outputTokens: 10_186 },
      { modelId: 'claude-sonnet-4.5', provider: 'Anthropic', category: 'Versatile', inputTokens: 235_900, outputTokens: 11_464 },
    ];
    const context = modelContext(mix, 101.8);

    const rows = buildProviderEstimates(
      usage({ monthlyInputTokens: context.totalMonthlyInputTokens, monthlyOutputTokens: context.totalMonthlyOutputTokens }),
      settings({ selectedModelId: 'claude-opus-4.6' }),
      selectedCost(101.8, 10_180),
      context,
    );

    const surface = buildProviderDecisionSurface(rows, context.modelMonthlyUsage, context.monthlyUsd);

    const anthropic = surface.portfolios.find(item => item.productId === 'anthropic-api-claude-sonnet-4.6');
    assert.ok(anthropic);
    assert.ok((anthropic?.familyCoverageByCostShare ?? 0) > 0.9);
    assert.ok((anthropic?.tierCoverageByCostShare ?? 0) > 0.9);
    assert.ok((anthropic?.exactModelCoverageByCostShare ?? 0) < (anthropic?.familyCoverageByCostShare ?? 1));

    const openAiRef = surface.portfolios.find(item => item.productId === 'openai-api-gpt-5.4');
    assert.ok(openAiRef);
    assert.ok((openAiRef?.exactModelCoverageByCostShare ?? 1) < 0.1);
    assert.ok((openAiRef?.familyCoverageByCostShare ?? 1) < 0.2);
    assert.ok((openAiRef?.tierCoverageByCostShare ?? 0) > 0.85);
    assert.strictEqual(openAiRef?.label, 'Cheaper with downgrade risk');

    const geminiRef = surface.portfolios.find(item => item.productId === 'gemini-api-gemini-3.1-pro');
    assert.ok(geminiRef);
    assert.ok((geminiRef?.exactModelCoverageByCostShare ?? 1) < 0.05);
    assert.ok((geminiRef?.familyCoverageByCostShare ?? 1) < 0.05);
    assert.ok((geminiRef?.tierCoverageByCostShare ?? 0) > 0.85);
    assert.strictEqual(geminiRef?.label, 'Cheaper with downgrade risk');
  });

  test('Unresolved router/wrapper products require model selection and hide savings', () => {
    const mix: ModelMonthlyUsageEntry[] = [
      { modelId: 'claude-opus-4.6', provider: 'Anthropic', category: 'Powerful', inputTokens: 8_000_000, outputTokens: 60_000 },
      { modelId: 'claude-opus-4.7', provider: 'Anthropic', category: 'Powerful', inputTokens: 6_000_000, outputTokens: 40_000 },
      { modelId: 'claude-sonnet-4.6', provider: 'Anthropic', category: 'Versatile', inputTokens: 1_200_000, outputTokens: 10_000 },
    ];
    const context = modelContext(mix, 95);

    const rows = buildProviderEstimates(
      usage({ monthlyInputTokens: context.totalMonthlyInputTokens, monthlyOutputTokens: context.totalMonthlyOutputTokens }),
      settings({ selectedModelId: 'claude-opus-4.6' }),
      selectedCost(95, 9_500),
      context,
    );

    const surface = buildProviderDecisionSurface(rows, context.modelMonthlyUsage, context.monthlyUsd);

    const openRouter = surface.portfolios.find(item => item.productId === 'openrouter-payg');
    const openCodeZen = surface.portfolios.find(item => item.productId === 'opencode-zen');
    const openCodeByok = surface.portfolios.find(item => item.productId === 'opencode-byok');
    const clineByok = surface.portfolios.find(item => item.productId === 'cline-byok');

    for (const row of [openRouter, openCodeZen, openCodeByok, clineByok]) {
      assert.ok(row);
      assert.strictEqual(row?.estimateKind, 'requires-model-selection');
      assert.ok(row?.label === 'Select model portfolio first' || row?.label === 'Select provider first');
      assert.strictEqual(row?.hideSavings, true);
      assert.ok(row?.capabilityRisk === 'unknown' || row?.capabilityRisk === 'high');
      assert.strictEqual(row?.equivalenceConfidence, 'low');
    }
  });

  test('Negative savings never results in Cost-only cheaper label', () => {
    const mix: ModelMonthlyUsageEntry[] = [
      { modelId: 'claude-opus-4.6', provider: 'Anthropic', category: 'Powerful', inputTokens: 6_000_000, outputTokens: 70_000 },
      { modelId: 'claude-opus-4.7', provider: 'Anthropic', category: 'Powerful', inputTokens: 4_500_000, outputTokens: 45_000 },
      { modelId: 'gpt-5.3-codex', provider: 'OpenAI', category: 'Powerful', inputTokens: 800_000, outputTokens: 8_000 },
    ];
    const context = modelContext(mix, 120);

    const rows = buildProviderEstimates(
      usage({ monthlyInputTokens: context.totalMonthlyInputTokens, monthlyOutputTokens: context.totalMonthlyOutputTokens }),
      settings({ selectedModelId: 'claude-opus-4.6' }),
      selectedCost(120, 12_000),
      context,
    );

    const surface = buildProviderDecisionSurface(rows, context.modelMonthlyUsage, context.monthlyUsd);
    const offenders = surface.portfolios
      .filter(item => (item.savingsUsd ?? 0) <= 0)
      .filter(item => item.label === 'Cost-only cheaper');
    assert.deepStrictEqual(offenders.map(item => item.productId), []);
  });

  test('Plan-fit products keep plan-fit label/hideSavings and expose availability semantics', () => {
    const mix: ModelMonthlyUsageEntry[] = [
      { modelId: 'claude-sonnet-4.6', provider: 'Anthropic', category: 'Versatile', inputTokens: 2_000_000, outputTokens: 50_000 },
      { modelId: 'gpt-5.2-codex', provider: 'OpenAI', category: 'Powerful', inputTokens: 1_500_000, outputTokens: 40_000 },
    ];
    const context = modelContext(mix, 25);

    const rows = buildProviderEstimates(
      usage({ monthlyInputTokens: context.totalMonthlyInputTokens, monthlyOutputTokens: context.totalMonthlyOutputTokens }),
      settings({ selectedModelId: 'claude-sonnet-4.6' }),
      selectedCost(25, 2_500),
      context,
    );

    const surface = buildProviderDecisionSurface(rows, context.modelMonthlyUsage, context.monthlyUsd);

    const claudePlan = surface.portfolios.find(item => item.productId === 'claude-code-pro');
    assert.ok(claudePlan);
    assert.strictEqual(claudePlan?.estimateKind, 'plan-fit');
    assert.strictEqual(claudePlan?.label, 'Plan fit only');
    assert.strictEqual(claudePlan?.hideSavings, true);
    assert.strictEqual(claudePlan?.planAdequacy, 'not-evaluated');
    assert.ok(['high', 'medium', 'low', 'unknown'].includes(claudePlan?.modelAvailability ?? 'unknown'));
    assert.ok((claudePlan?.notes ?? []).some(note => note.includes('not evaluated in this version')));
  });

  test('BYOK wrappers keep zero coverage and select-provider label', () => {
    const mix: ModelMonthlyUsageEntry[] = [
      { modelId: 'claude-opus-4.6', provider: 'Anthropic', category: 'Powerful', inputTokens: 3_000_000, outputTokens: 50_000 },
      { modelId: 'gpt-5.3-codex', provider: 'OpenAI', category: 'Powerful', inputTokens: 1_000_000, outputTokens: 20_000 },
    ];
    const context = modelContext(mix, 30);

    const rows = buildProviderEstimates(
      usage({ monthlyInputTokens: context.totalMonthlyInputTokens, monthlyOutputTokens: context.totalMonthlyOutputTokens }),
      settings({ selectedModelId: 'claude-opus-4.6' }),
      selectedCost(30, 3_000),
      context,
    );

    const surface = buildProviderDecisionSurface(rows, context.modelMonthlyUsage, context.monthlyUsd);

    const byokRows = surface.portfolios.filter(item => ['opencode-byok', 'cline-byok', 'roo-code-byok', 'kilo-byok', 'continue-byok'].includes(item.productId));
    assert.ok(byokRows.length >= 3);
    for (const row of byokRows) {
      assert.strictEqual(row.label, 'Select provider first');
      assert.strictEqual(row.hideSavings, true);
      assert.strictEqual(row.exactModelCoverageByCostShare, 0);
      assert.strictEqual(row.familyCoverageByCostShare, 0);
      assert.strictEqual(row.tierCoverageByCostShare, 0);
      assert.strictEqual(row.equivalenceConfidence, 'low');
    }
  });
});
