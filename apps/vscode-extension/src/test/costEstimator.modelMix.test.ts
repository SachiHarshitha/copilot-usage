import * as assert from 'assert';
import { RequestEvent } from '../core/types';
import { buildProviderModelCostContext } from '../features/costEstimator/calc/modelMix';

const NOW = Date.parse('2026-06-01T00:00:00Z');

function event(modelId: string | undefined, promptTokens: number, outputTokens: number): RequestEvent {
  return {
    chatSessionId: 'session-1',
    requestIndex: 0,
    requestId: 'req-1',
    modelId,
    timestampMs: Date.parse('2026-05-20T00:00:00Z'),
    promptTokens,
    outputTokens,
    toolCallRounds: 0,
    tokensEstimated: false,
  };
}

suite('Cost Estimator: model mix context', () => {
  test('builds monthly blended baseline and provider shares from selected window models', () => {
    const context = buildProviderModelCostContext(
      [
        event('gpt-5.4', 1_000_000, 0),
        event('claude-sonnet-4.6', 1_000_000, 0),
      ],
      'last_30_days',
      NOW,
    );

    assert.ok(context);
    assert.strictEqual(context!.monthlyUsd, 5.5);
    assert.strictEqual(context!.providerMonthlyUsage.OpenAI?.inputTokens, 1_000_000);
    assert.strictEqual(context!.providerMonthlyUsage.Anthropic?.inputTokens, 1_000_000);
    assert.strictEqual(context!.providerMonthlyUsage.OpenAI?.share, 0.5);
    assert.strictEqual(context!.providerMonthlyUsage.Anthropic?.share, 0.5);
  });

  test('reports known-model coverage when unknown model ids are present', () => {
    const context = buildProviderModelCostContext(
      [
        event('gpt-5.4', 1_000, 1_000),
        event('unknown-model-id', 3_000, 1_000),
        event(undefined, 2_000, 0),
      ],
      'last_30_days',
      NOW,
    );

    assert.ok(context);
    assert.strictEqual(context!.knownModelCoveragePct, 25);
  });
});
