import * as assert from 'assert';
import { KpiTotals, MeteredRound } from '../core/types';
import {
  aggregateMetered,
  computeMeteredDaily,
  computeMeteredModelStats,
  filterMeteredByStartMs,
  reconcileUsage,
} from '../core/meteredUsage';

function round(overrides: Partial<MeteredRound> = {}): MeteredRound {
  return {
    chatSessionId: 'session-a',
    workspaceId: 'ws-a',
    modelId: 'copilot/claude-opus-5',
    timestampMs: Date.UTC(2026, 7, 5, 12, 0, 0),
    inputTokens: 0,
    outputTokens: 0,
    cachedTokens: 0,
    credits: 0,
    hasCredits: true,
    ...overrides,
  };
}

function kpis(overrides: Partial<KpiTotals> = {}): KpiTotals {
  return {
    totalRequests: 7,
    totalPromptTokens: 624856,
    totalOutputTokens: 12041,
    totalToolCallRounds: 134,
    totalPremium: 7,
    totalCredits: 342.53,
    workspaceCount: 1,
    sessionCount: 1,
    ...overrides,
  };
}

suite('Metered usage: aggregation and reconciliation', () => {
  test('aggregates rounds and coverage, then computes reconciliation stats', () => {
    const rounds: MeteredRound[] = [
      round({ inputTokens: 15476435, outputTokens: 160966, cachedTokens: 15062455, credits: 1414.24 }),
      ...Array.from({ length: 137 }, (_, i) => round({
        chatSessionId: `session-${i + 2}`,
        timestampMs: Date.UTC(2026, 7, 5, 12, 0, i + 1),
      })),
    ];

    const metered = aggregateMetered(rounds, 7, ['0.58.0']);
    assert.strictEqual(metered.rounds, 138);
    assert.strictEqual(metered.userMessages, 7);
    assert.strictEqual(metered.inputTokens, 15476435);
    assert.strictEqual(metered.outputTokens, 160966);
    assert.strictEqual(metered.cachedTokens, 15062455);
    assert.strictEqual(metered.credits, 1414.24);
    assert.strictEqual(metered.roundsWithCredits, 138);
    assert.strictEqual(metered.coverage, 1);

    const recon = reconcileUsage(kpis(), metered, 0.95);
    assert.strictEqual(recon.visibleRequests, 7);
    assert.strictEqual(recon.meteredRounds, 138);
    assert.ok(Math.abs(recon.roundsPerRequest - (138 / 7)) < 1e-9);
    assert.strictEqual(recon.visibleTokens, 636897);
    assert.strictEqual(recon.meteredTokens, 15637401);
    assert.strictEqual(recon.estimatedCredits, 342.53);
    assert.strictEqual(recon.meteredCredits, 1414.24);
    assert.strictEqual(recon.creditDelta, 1071.71);
    assert.strictEqual(recon.confidence, 'exact');
  });

  test('filters rows by start timestamp and computes per-day/per-model rollups', () => {
    const rows = [
      round({ modelId: 'copilot/claude-opus-5', timestampMs: Date.UTC(2026, 7, 4, 23, 59, 59), inputTokens: 10, outputTokens: 1, credits: 1 }),
      round({ modelId: 'copilot/gpt-5.3-codex', timestampMs: Date.UTC(2026, 7, 5, 0, 0, 0), inputTokens: 20, outputTokens: 2, credits: 2 }),
      round({ modelId: 'copilot/gpt-5.3-codex', timestampMs: Date.UTC(2026, 7, 6, 0, 0, 0), inputTokens: 30, outputTokens: 3, credits: 3 }),
    ];

    const filtered = filterMeteredByStartMs(rows, Date.UTC(2026, 7, 5, 0, 0, 0));
    assert.strictEqual(filtered.length, 2);

    const daily = computeMeteredDaily(filtered);
    assert.deepStrictEqual(daily.map(d => d.date), ['2026-08-05', '2026-08-06']);
    assert.strictEqual(daily[0].credits, 2);
    assert.strictEqual(daily[1].credits, 3);

    const modelStats = computeMeteredModelStats(filtered);
    assert.strictEqual(modelStats.length, 1);
    assert.strictEqual(modelStats[0].modelId, 'copilot/gpt-5.3-codex');
    assert.strictEqual(modelStats[0].rounds, 2);
    assert.strictEqual(modelStats[0].credits, 5);
  });

  test('coverage thresholds map to exact/partial/unavailable', () => {
    const exact = aggregateMetered([round()], 1, []);
    assert.strictEqual(reconcileUsage(kpis(), exact, 0.95).confidence, 'exact');

    const partial = aggregateMetered([
      round({ hasCredits: true, credits: 1 }),
      round({ hasCredits: false, credits: 0 }),
      round({ hasCredits: false, credits: 0 }),
      round({ hasCredits: false, credits: 0 }),
      round({ hasCredits: false, credits: 0 }),
    ], 1, []);
    assert.strictEqual(reconcileUsage(kpis(), partial, 0.95).confidence, 'partial');

    const unavailable = aggregateMetered([
      round({ hasCredits: false, credits: 0 }),
      round({ hasCredits: false, credits: 0 }),
      round({ hasCredits: false, credits: 0 }),
      round({ hasCredits: false, credits: 0 }),
      round({ hasCredits: false, credits: 0 }),
      round({ hasCredits: false, credits: 0 }),
      round({ hasCredits: false, credits: 0 }),
      round({ hasCredits: false, credits: 0 }),
      round({ hasCredits: false, credits: 0 }),
      round({ hasCredits: false, credits: 0 }),
    ], 1, []);
    assert.strictEqual(reconcileUsage(kpis(), unavailable, 0.95).confidence, 'unavailable');
  });

  test('zero denominators do not produce NaN or Infinity', () => {
    const empty = aggregateMetered([], 0, []);
    const recon = reconcileUsage(kpis({ totalRequests: 0, totalPromptTokens: 0, totalOutputTokens: 0 }), empty, 0.95);
    assert.strictEqual(recon.roundsPerRequest, 0);
    assert.strictEqual(recon.tokenAmplification, 0);
    assert.strictEqual(Number.isFinite(recon.roundsPerRequest), true);
    assert.strictEqual(Number.isFinite(recon.tokenAmplification), true);
  });
});
