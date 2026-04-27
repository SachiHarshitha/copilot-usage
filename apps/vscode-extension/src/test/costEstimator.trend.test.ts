import * as assert from 'assert';
import { computeTrendInsight } from '../features/costEstimator/calc/trend';
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

const NOW = Date.UTC(2026, 3, 27);
const DAY = 86400000;

suite('Cost Estimator: computeTrendInsight', () => {
  test('Recent 30d above 3-month average → "higher" label', () => {
    // 90-day window: 1000 tokens spread evenly each day = 90,000 total → 30,000/mo avg
    // Recent 30d: pump 42,600 tokens (42% above 30,000)
    const events: RequestEvent[] = [];
    for (let d = 31; d < 90; d++) { events.push(ev(NOW - d * DAY, 1000, 0)); }
    for (let d = 0; d < 30; d++) { events.push(ev(NOW - d * DAY, 1420, 0)); }
    const t = computeTrendInsight(events, NOW);
    assert.ok(t);
    assert.ok(t!.label.includes('higher'));
    assert.ok(t!.deltaPct > 30 && t!.deltaPct < 60);
  });

  test('Recent 30d below 3-month average → "lower" label', () => {
    const events: RequestEvent[] = [];
    for (let d = 31; d < 90; d++) { events.push(ev(NOW - d * DAY, 2000, 0)); }
    for (let d = 0; d < 30; d++) { events.push(ev(NOW - d * DAY, 500, 0)); }
    const t = computeTrendInsight(events, NOW);
    assert.ok(t);
    assert.ok(t!.label.includes('lower'));
    assert.ok(t!.deltaPct < 0);
  });

  test('Less than 30 days of data → null', () => {
    const events = [ev(NOW - 5 * DAY, 1000, 0)];
    const t = computeTrendInsight(events, NOW);
    assert.strictEqual(t, null);
  });

  test('Empty events → null', () => {
    const t = computeTrendInsight([], NOW);
    assert.strictEqual(t, null);
  });
});
