import * as assert from 'assert';
import {
  fallbackRateFor,
  creditsForRequest,
  parseCreditRatesFromCatalog,
  AI_CREDIT_USD_VALUE,
} from '../core/credits';
import { estimateModelCost } from '../features/costEstimator/calc/cost';
import { MODEL_PRICING } from '../features/costEstimator/pricing/models';

suite('Credits: fallbackRateFor', () => {
  test('derives credit rates from MODEL_PRICING (USD ÷ credit value)', () => {
    const rate = fallbackRateFor('claude-opus-4.7');
    assert.ok(rate);
    const pricing = MODEL_PRICING['claude-opus-4.7'];
    assert.strictEqual(rate!.inputPerMillion, pricing.inputPerMillion / AI_CREDIT_USD_VALUE);
    assert.strictEqual(rate!.outputPerMillion, pricing.outputPerMillion / AI_CREDIT_USD_VALUE);
  });

  test('normalizes copilot/ prefixed ids before lookup', () => {
    assert.deepStrictEqual(
      fallbackRateFor('copilot/claude-opus-4.7'),
      fallbackRateFor('claude-opus-4.7'),
    );
  });

  test('returns undefined for unknown models', () => {
    assert.strictEqual(fallbackRateFor('totally-made-up-model'), undefined);
  });
});

suite('Credits: creditsForRequest', () => {
  test('fallback matches USD cost × 100 (1 credit = $0.01)', () => {
    // 10M input + 300K output @ Claude Opus 4.7 → $57.50 → 5750 credits
    const credits = creditsForRequest('claude-opus-4.7', 10_000_000, 300_000);
    assert.strictEqual(Math.round(credits), 5750);

    const usd = estimateModelCost(
      {
        rangeLabel: 'T', rangeStart: '2026-01-01', rangeEnd: '2026-01-31', daysInRange: 30,
        observedInputTokens: 0, observedOutputTokens: 0,
        monthlyInputTokens: 10_000_000, monthlyOutputTokens: 300_000,
        dataCompleteness: 'partial',
      },
      MODEL_PRICING['claude-opus-4.7'],
    ).estimatedMonthlyUsd;
    assert.strictEqual(Math.round(credits), Math.round(usd / AI_CREDIT_USD_VALUE));
  });

  test('real catalog rates take precedence over the fallback table', () => {
    const rates = new Map([
      ['claude-opus-4.7', { inputPerMillion: 999, outputPerMillion: 1 }],
    ]);
    const credits = creditsForRequest('claude-opus-4.7', 1_000_000, 0, rates);
    assert.strictEqual(credits, 999);
  });

  test('returns 0 for unknown model and undefined id', () => {
    assert.strictEqual(creditsForRequest('totally-made-up-model', 1_000_000, 1_000_000), 0);
    assert.strictEqual(creditsForRequest(undefined, 1_000_000, 1_000_000), 0);
  });
});

suite('Credits: parseCreditRatesFromCatalog', () => {
  test('reads token_prices.default into a credit-rate map keyed by id and family', () => {
    const catalog = JSON.stringify([
      {
        id: 'claude-opus-4.8-fast',
        capabilities: { family: 'claude-opus-4.8-fast' },
        billing: { token_prices: { default: { input_price: 1000, output_price: 5000 } } },
      },
    ]);
    const rates = parseCreditRatesFromCatalog(catalog);
    assert.deepStrictEqual(rates.get('claude-opus-4.8-fast'), {
      inputPerMillion: 1000,
      outputPerMillion: 5000,
    });
    // credits computed from real rates: 0.5M input + 0.1M output
    const credits = creditsForRequest('claude-opus-4.8-fast', 500_000, 100_000, rates);
    assert.strictEqual(credits, 0.5 * 1000 + 0.1 * 5000);
  });

  test('ignores entries without numeric default prices', () => {
    const catalog = JSON.stringify([
      { id: 'no-billing' },
      { id: 'no-default', billing: { token_prices: {} } },
      { id: 'bad-types', billing: { token_prices: { default: { input_price: 'x' } } } },
    ]);
    const rates = parseCreditRatesFromCatalog(catalog);
    assert.strictEqual(rates.size, 0);
  });

  test('returns an empty map for invalid JSON or non-array input', () => {
    assert.strictEqual(parseCreditRatesFromCatalog('not json').size, 0);
    assert.strictEqual(parseCreditRatesFromCatalog('{"id":"x"}').size, 0);
  });
});
