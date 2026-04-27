import * as assert from 'assert';
import { RequestEvent } from '../core/types';
import { filterEventsByCostRange, normalizeModelId, pickMostUsedModelId } from '../features/costEstimator/calc/modelSelection';

function ev(modelId: string, timestampMs: number): RequestEvent {
  return {
    chatSessionId: 's',
    requestIndex: 0,
    modelId,
    timestampMs,
    promptTokens: 100,
    outputTokens: 50,
    toolCallRounds: 0,
    tokensEstimated: false,
  };
}

suite('Cost Estimator: model auto-selection helpers', () => {
  const NOW = Date.UTC(2026, 3, 27);
  const DAY = 86400000;
  const available = ['gpt-5.3-codex', 'claude-sonnet-4.6', 'claude-opus-4.7'];

  test('normalizeModelId strips copilot/ prefix and lowercases', () => {
    assert.strictEqual(normalizeModelId('copilot/Claude-Opus-4.7'), 'claude-opus-4.7');
  });

  test('picks model with most requests', () => {
    const events = [
      ev('copilot/claude-sonnet-4.6', NOW),
      ev('copilot/claude-opus-4.7', NOW),
      ev('copilot/claude-opus-4.7', NOW),
    ];

    const result = pickMostUsedModelId(events, available);
    assert.strictEqual(result, 'claude-opus-4.7');
  });

  test('ties are broken by total tokens', () => {
    const base = ev('copilot/gpt-5.3-codex', NOW);
    const heavy = ev('copilot/claude-sonnet-4.6', NOW);
    heavy.promptTokens = 999;
    heavy.outputTokens = 1;

    const events = [base, ev('copilot/gpt-5.3-codex', NOW), heavy, ev('copilot/claude-sonnet-4.6', NOW)];
    const result = pickMostUsedModelId(events, available);
    assert.strictEqual(result, 'claude-sonnet-4.6');
  });

  test('ignores non-billable or unknown models', () => {
    const events = [
      ev('copilot/unknown-preview-model', NOW),
      ev('copilot/unknown-preview-model', NOW),
      ev('copilot/claude-opus-4.7', NOW),
    ];
    const result = pickMostUsedModelId(events, available);
    assert.strictEqual(result, 'claude-opus-4.7');
  });

  test('filters events using active range', () => {
    const events = [
      ev('copilot/claude-opus-4.7', NOW - 3 * DAY),
      ev('copilot/claude-opus-4.7', NOW - 40 * DAY),
    ];

    const filtered = filterEventsByCostRange(events, 'last_7_days', NOW);
    assert.strictEqual(filtered.length, 1);
    assert.strictEqual(filtered[0].modelId, 'copilot/claude-opus-4.7');
  });
});
