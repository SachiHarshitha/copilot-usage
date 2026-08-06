import * as assert from 'assert';
import { RequestEvent } from '../core/types';
import { computeModelStats, computeDailyStats } from '../core/aggregator';

function event(overrides: Partial<RequestEvent> = {}): RequestEvent {
  return {
    chatSessionId: 'session-a',
    requestIndex: 0,
    modelId: 'gpt-4.1',
    timestampMs: Date.UTC(2025, 5, 15, 10, 0, 0),
    promptTokens: 100,
    outputTokens: 20,
    toolCallRounds: 1,
    tokensEstimated: false,
    ...overrides,
  };
}

/** Local calendar day key, matching how the aggregator buckets events. */
function dayKey(timestampMs: number): string {
  const d = new Date(timestampMs);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

suite('Aggregator: model stats token split', () => {
  test('prompt and output tokens are tracked separately and still sum to the total', () => {
    const stats = computeModelStats([
      event({ promptTokens: 100, outputTokens: 20 }),
      event({ promptTokens: 300, outputTokens: 80 }),
    ]);

    assert.strictEqual(stats.length, 1);
    assert.strictEqual(stats[0].promptTokens, 400);
    assert.strictEqual(stats[0].outputTokens, 100);
    assert.strictEqual(stats[0].totalTokens, 500);
    assert.strictEqual(stats[0].requests, 2);
  });

  test('each model keeps its own token split', () => {
    const stats = computeModelStats([
      event({ modelId: 'gpt-4.1', promptTokens: 10, outputTokens: 1 }),
      event({ modelId: 'claude-sonnet-4.5', promptTokens: 500, outputTokens: 50 }),
    ]);

    const byModel = new Map(stats.map(s => [s.modelId, s]));
    assert.strictEqual(byModel.get('gpt-4.1')?.promptTokens, 10);
    assert.strictEqual(byModel.get('gpt-4.1')?.outputTokens, 1);
    assert.strictEqual(byModel.get('claude-sonnet-4.5')?.promptTokens, 500);
    assert.strictEqual(byModel.get('claude-sonnet-4.5')?.outputTokens, 50);
  });
});

suite('Aggregator: daily stats', () => {
  const dayOne = Date.UTC(2025, 5, 15, 10, 0, 0);
  const dayTwo = Date.UTC(2025, 5, 16, 10, 0, 0);

  test('days are returned in ascending date order', () => {
    const daily = computeDailyStats([
      event({ timestampMs: dayTwo }),
      event({ timestampMs: dayOne }),
    ]);

    assert.deepStrictEqual(daily.map(d => d.date), [dayKey(dayOne), dayKey(dayTwo)]);
  });

  test('tool rounds, premium units and credits are accumulated per day', () => {
    const daily = computeDailyStats([
      event({ timestampMs: dayOne, toolCallRounds: 3 }),
      event({ timestampMs: dayOne, toolCallRounds: 4 }),
    ]);

    assert.strictEqual(daily.length, 1);
    assert.strictEqual(daily[0].toolCallRounds, 7);
    assert.strictEqual(daily[0].requests, 2);
    assert.ok(daily[0].premium > 0, 'premium units were not accumulated');
    assert.ok(daily[0].credits > 0, 'credits were not accumulated');
  });

  test('sessions are counted distinctly, and a session spanning two days counts on both', () => {
    const daily = computeDailyStats([
      event({ chatSessionId: 'a', timestampMs: dayOne }),
      event({ chatSessionId: 'a', timestampMs: dayOne, requestIndex: 1 }),
      event({ chatSessionId: 'b', timestampMs: dayOne }),
      event({ chatSessionId: 'a', timestampMs: dayTwo, requestIndex: 2 }),
    ]);

    const byDay = new Map(daily.map(d => [d.date, d]));
    assert.strictEqual(byDay.get(dayKey(dayOne))?.sessions, 2, 'repeat requests in one session must not double count');
    assert.strictEqual(byDay.get(dayKey(dayTwo))?.sessions, 1);
  });

  test('premium and credits are rounded to two decimals', () => {
    const daily = computeDailyStats([event({ timestampMs: dayOne })]);
    assert.strictEqual(daily[0].premium, Number(daily[0].premium.toFixed(2)));
    assert.strictEqual(daily[0].credits, Number(daily[0].credits.toFixed(2)));
  });

  test('an empty event list produces no rows', () => {
    assert.deepStrictEqual(computeDailyStats([]), []);
  });
});
