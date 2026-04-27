import * as assert from 'assert';
import { buildUsageEstimate } from '../features/costEstimator/calc/usage';
import { RequestEvent } from '../core/types';

function ev(timestampMs: number, prompt: number, output: number): RequestEvent {
  return {
    chatSessionId: 's',
    requestIndex: 0,
    promptTokens: prompt,
    outputTokens: output,
    toolCallRounds: 0,
    tokensEstimated: false,
    timestampMs,
  };
}

const NOW = Date.UTC(2026, 3, 27);  // April 27, 2026
const DAY = 86400000;

suite('Cost Estimator: buildUsageEstimate', () => {
  test('7-day range with 1.8M input tokens normalizes to ≈7.71M monthly', () => {
    const events = [ev(NOW - 1 * DAY, 1_800_000, 0)];
    const u = buildUsageEstimate(events, 'last_7_days', NOW);
    assert.strictEqual(u.observedInputTokens, 1_800_000);
    // 1.8M * 30/7 ≈ 7,714,286
    assert.ok(Math.abs(u.monthlyInputTokens - 7_714_286) <= 1);
  });

  test('Empty events → all zeros, missing_cache_data', () => {
    const u = buildUsageEstimate([], 'last_30_days', NOW);
    assert.strictEqual(u.observedInputTokens, 0);
    assert.strictEqual(u.observedOutputTokens, 0);
    assert.strictEqual(u.monthlyInputTokens, 0);
    assert.strictEqual(u.dataCompleteness, 'missing_cache_data');
  });

  test('Events without timestamps are skipped', () => {
    const noTs = ev(NOW, 100, 100);
    delete (noTs as { timestampMs?: number }).timestampMs;
    const events = [noTs, ev(NOW - 1 * DAY, 500, 200)];
    const u = buildUsageEstimate(events, 'last_7_days', NOW);
    assert.strictEqual(u.observedInputTokens, 500);
    assert.strictEqual(u.observedOutputTokens, 200);
  });

  test('Events outside the range are excluded', () => {
    const events = [
      ev(NOW - 1 * DAY, 100, 100),
      ev(NOW - 100 * DAY, 9999, 9999),  // way outside last_7_days
    ];
    const u = buildUsageEstimate(events, 'last_7_days', NOW);
    assert.strictEqual(u.observedInputTokens, 100);
    assert.strictEqual(u.observedOutputTokens, 100);
  });

  test('all_time uses dataset span (earliest -> latest), not now', () => {
    const events = [
      ev(NOW - 60 * DAY, 600, 0),
      ev(NOW - 1 * DAY, 100, 0),
    ];
    const u = buildUsageEstimate(events, 'all_time', NOW);
    assert.strictEqual(u.observedInputTokens, 700);
    assert.strictEqual(u.daysInRange, 59);
    assert.strictEqual(u.rangeStart, new Date(NOW - 60 * DAY).toISOString().slice(0, 10));
    assert.strictEqual(u.rangeEnd, new Date(NOW - 1 * DAY).toISOString().slice(0, 10));
    assert.strictEqual(u.rangeLabel, 'All time');
  });

  test('all_time window remains stable when "now" is far after latest event', () => {
    const events = [
      ev(NOW - 500 * DAY, 300, 0),
      ev(NOW - 450 * DAY, 700, 0),
    ];

    // Even if "now" is much later, all_time should be based on dataset span.
    const u = buildUsageEstimate(events, 'all_time', NOW);
    assert.strictEqual(u.daysInRange, 50);
    assert.strictEqual(u.rangeEnd, new Date(NOW - 450 * DAY).toISOString().slice(0, 10));
  });
});
