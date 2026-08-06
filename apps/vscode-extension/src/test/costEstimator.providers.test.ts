import * as assert from 'assert';
import { buildProviderEstimates } from '../features/costEstimator/calc/providers';
import { ProviderModelCostContext } from '../features/costEstimator/calc/modelMix';
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
    selectedModelId: 'claude-sonnet-4.6',
    defaultRange: 'last_30_days',
    usageSource: 'local',
    includeFlexAllowance: true,
    ...partial,
  };
}

function selectedCost(usd: number, credits: number): CostEstimate {
  return {
    modelId: 'claude-sonnet-4.6',
    modelDisplayName: 'Claude Sonnet 4.6',
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

function modelContext(partial: Partial<ProviderModelCostContext>): ProviderModelCostContext {
  return {
    monthlyUsd: 0,
    monthlyCredits: 0,
    knownModelCoveragePct: 100,
    providerMonthlyUsage: {},
    modelMonthlyUsage: [],
    totalMonthlyInputTokens: 0,
    totalMonthlyOutputTokens: 0,
    ...partial,
  };
}

suite('Cost Estimator: provider comparison estimates', () => {
  test('token-metered rows return exact formula monthly cost', () => {
    const rows = buildProviderEstimates(
      usage({ monthlyInputTokens: 10_000_000, monthlyOutputTokens: 0 }),
      settings({}),
      selectedCost(57.5, 5750),
    );

    const openAi = rows.find(row => row.productId === 'openai-api-gpt-5.4');
    assert.ok(openAi);
    assert.strictEqual(openAi!.estimateKind, 'exact_formula');
    assert.strictEqual(openAi!.monthlyCost?.expected, 25);
  });

  test('token-metered rows use provider-matched model usage when model mix context is available', () => {
    const rows = buildProviderEstimates(
      usage({ monthlyInputTokens: 10_000_000, monthlyOutputTokens: 0 }),
      settings({}),
      selectedCost(57.5, 5750),
      modelContext({
        monthlyUsd: 57.5,
        monthlyCredits: 5750,
        providerMonthlyUsage: {
          OpenAI: {
            inputTokens: 2_000_000,
            outputTokens: 0,
            totalTokens: 2_000_000,
            share: 1,
          },
        },
      }),
    );

    const openAi = rows.find(row => row.productId === 'openai-api-gpt-5.4');
    assert.ok(openAi);
    assert.strictEqual(openAi!.monthlyCost?.expected, 5);
    assert.ok(openAi!.assumptions.some(item => item.toLowerCase().includes('observed openai model usage')));
  });

  test('token-metered rows are marked non-comparable when no matching provider model usage exists', () => {
    const rows = buildProviderEstimates(
      usage({ monthlyInputTokens: 10_000_000, monthlyOutputTokens: 0 }),
      settings({}),
      selectedCost(57.5, 5750),
      modelContext({
        monthlyUsd: 57.5,
        monthlyCredits: 5750,
        providerMonthlyUsage: {
          Anthropic: {
            inputTokens: 2_000_000,
            outputTokens: 0,
            totalTokens: 2_000_000,
            share: 1,
          },
        },
      }),
    );

    const openAi = rows.find(row => row.productId === 'openai-api-gpt-5.4');
    assert.ok(openAi);
    assert.strictEqual(openAi!.monthlyCost, undefined);
    assert.ok(openAi!.caveats.some(item => item.toLowerCase().includes('not directly comparable')));
  });

  test('subscription and quota rows are never exact bills', () => {
    const rows = buildProviderEstimates(
      usage({ monthlyInputTokens: 1_000_000, monthlyOutputTokens: 100_000 }),
      settings({}),
      selectedCost(20, 2000),
    );

    const codexPlus = rows.find(row => row.productId === 'codex-plus');
    const claudeCodeMax20x = rows.find(row => row.productId === 'claude-code-max-20x');
    assert.ok(codexPlus);
    assert.ok(claudeCodeMax20x);
    assert.notStrictEqual(codexPlus!.estimateKind, 'exact_formula');
    assert.notStrictEqual(claudeCodeMax20x!.estimateKind, 'exact_formula');
    assert.strictEqual(codexPlus!.estimateKind, 'plan_fit');
    assert.strictEqual(claudeCodeMax20x!.estimateKind, 'plan_fit');
  });

  test('Copilot Pro+ row includes subscription plus overage for current credit usage', () => {
    const rows = buildProviderEstimates(
      usage({ monthlyInputTokens: 1_000_000, monthlyOutputTokens: 100_000 }),
      settings({}),
      selectedCost(116.18, 11_618),
    );

    const copilotProPlus = rows.find(row => row.productId === 'copilot-pro-plus');
    assert.ok(copilotProPlus);
    assert.strictEqual(copilotProPlus!.estimateKind, 'plan_fit');
    assert.strictEqual(copilotProPlus!.monthlyCost?.expected, 116.18);
  });

  test('BYOK wrapper rows delegate to selected model cost when token rates are not explicit', () => {
    const rows = buildProviderEstimates(
      usage({ monthlyInputTokens: 4_000_000, monthlyOutputTokens: 500_000 }),
      settings({ selectedModelId: 'claude-sonnet-4.6' }),
      selectedCost(34.5, 3450),
    );

    const opencode = rows.find(row => row.productId === 'opencode-byok');
    assert.ok(opencode);
    assert.strictEqual(opencode!.estimateKind, 'exact_formula');
    assert.strictEqual(opencode!.monthlyCost?.expected, 34.5);
    assert.ok(opencode!.assumptions.some(item => item.toLowerCase().includes('delegates billing')));
  });

  test('stale rows are flagged using lastCheckedAt + staleAfterDays', () => {
    const now = Date.parse('2026-07-01T00:00:00Z');
    const rows = buildProviderEstimates(
      usage({ monthlyInputTokens: 1_000_000, monthlyOutputTokens: 1_000_000 }),
      settings({}),
      selectedCost(22.05, 2205),
      now,
    );

    const cursor = rows.find(row => row.productId === 'cursor-pro');
    assert.ok(cursor);
    assert.strictEqual(cursor!.isStale, true);
    assert.ok(cursor!.caveats.some(item => item.toLowerCase().includes('stale')));
  });

  test('local model rows default to zero direct provider cost', () => {
    const rows = buildProviderEstimates(
      usage({ monthlyInputTokens: 500_000, monthlyOutputTokens: 300_000 }),
      settings({}),
      selectedCost(10.5, 1050),
    );

    const local = rows.find(row => row.productId === 'local-model-runner');
    assert.ok(local);
    assert.strictEqual(local!.monthlyCost?.expected, 0);
  });

  test('token-metered rows reprice the full model mix as a range when modelMonthlyUsage is provided', () => {
    const rows = buildProviderEstimates(
      usage({ monthlyInputTokens: 2_000_000, monthlyOutputTokens: 0 }),
      settings({}),
      selectedCost(6, 600),
      modelContext({
        monthlyUsd: 6,
        monthlyCredits: 600,
        totalMonthlyInputTokens: 2_000_000,
        totalMonthlyOutputTokens: 0,
        modelMonthlyUsage: [
          { modelId: 'gpt-5.4', provider: 'OpenAI', category: 'Versatile', inputTokens: 1_000_000, outputTokens: 0 },
          { modelId: 'claude-sonnet-4.6', provider: 'Anthropic', category: 'Versatile', inputTokens: 1_000_000, outputTokens: 0 },
        ],
        providerMonthlyUsage: {
          OpenAI: { inputTokens: 1_000_000, outputTokens: 0, totalTokens: 1_000_000, share: 0.5 },
          Anthropic: { inputTokens: 1_000_000, outputTokens: 0, totalTokens: 1_000_000, share: 0.5 },
        },
      }),
    );

    const openAi = rows.find(row => row.productId === 'openai-api-gpt-5.4');
    assert.ok(openAi);
    assert.strictEqual(openAi!.estimateKind, 'range');
    // OpenAI Versatile input median = $2/M, 2M tokens => $4 expected.
    assert.strictEqual(openAi!.monthlyCost?.expected, 4);
    // Flat reference at GPT-5.4 input $2.5/M, 2M tokens => $5 high bound.
    assert.strictEqual(openAi!.monthlyCost?.high, 5);
    assert.strictEqual(openAi!.monthlyCost?.low, 3.4);
    assert.ok(openAi!.assumptions.some(item => item.toLowerCase().includes('reprices your full observed model mix')));
  });
});