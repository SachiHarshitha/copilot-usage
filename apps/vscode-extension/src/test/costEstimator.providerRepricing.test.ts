import * as assert from 'assert';
import {
  buildProviderTierRates,
  repriceMixAtFlatRate,
  repriceMixAtTierEquivalent,
} from '../features/costEstimator/calc/providerRepricing';
import { ModelMonthlyUsageEntry } from '../features/costEstimator/calc/modelMix';

suite('Cost Estimator: provider repricing', () => {
  test('buildProviderTierRates derives tier medians from MODEL_PRICING (OpenAI)', () => {
    const rates = buildProviderTierRates('OpenAI');
    assert.ok(rates.Versatile);
    assert.strictEqual(rates.Versatile!.inputPerMTok, 2);
    assert.strictEqual(rates.Versatile!.outputPerMTok, 14);
    assert.ok(rates.Lightweight);
    assert.ok(rates.Powerful);
  });

  test('repriceMixAtTierEquivalent prices each model at the target provider tier rate', () => {
    const mix: ModelMonthlyUsageEntry[] = [
      { modelId: 'gpt-5.4', provider: 'OpenAI', category: 'Versatile', inputTokens: 1_000_000, outputTokens: 0 },
      { modelId: 'claude-sonnet-4.6', provider: 'Anthropic', category: 'Versatile', inputTokens: 1_000_000, outputTokens: 0 },
    ];

    const result = repriceMixAtTierEquivalent('OpenAI', mix);
    assert.ok(result);
    // OpenAI Versatile input median = $2/M; 2M tokens => $4.
    assert.strictEqual(result!.monthlyUsd, 4);
    assert.strictEqual(result!.unmatchedTokenShare, 0);
  });

  test('repriceMixAtFlatRate multiplies all monthly tokens by the card reference rate', () => {
    const cost = repriceMixAtFlatRate({ inputPerMTok: 2.5, outputPerMTok: 15 }, 2_000_000, 0);
    assert.strictEqual(cost, 5);
  });
});
