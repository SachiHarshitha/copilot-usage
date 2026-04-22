import assert from 'node:assert/strict';
import test from 'node:test';

import type { AgentSnapshot } from '@copilot-usage/shared-schema';

import { aggregateCanonical } from './agent-ingest';

const baseSource = {
  adapter: 'claude-code-cli',
  adapterVersion: '0.1.0',
  provider: 'anthropic',
  product: 'claude-code',
  surface: 'terminal' as const,
};

test('aggregateCanonical handles a single run with one model call', () => {
  const snapshot: AgentSnapshot = {
    schemaVersion: 2,
    source: baseSource,
    observedAt: '2026-04-21T12:00:00.000Z',
    runs: [
      {
        runId: 'run-1',
        startedAt: '2026-04-20T10:00:00.000Z',
        modelCalls: [
          {
            modelId: 'claude-sonnet-4.6',
            requestCount: 4,
            inputTokens: 1000,
            outputTokens: 500,
            costMicros: 25000,
            sourceOfTruth: 'observed',
          },
        ],
      },
    ],
  };
  const agg = aggregateCanonical(snapshot);

  assert.equal(agg.runs.length, 1);
  assert.equal(agg.runs[0].runExternalId, 'run-1');
  assert.equal(agg.modelDaily.length, 1);
  assert.equal(agg.modelDaily[0].date, '2026-04-20');
  assert.equal(agg.modelDaily[0].modelId, 'claude-sonnet-4.6');
  assert.equal(agg.modelDaily[0].requestCount, 4);
  assert.equal(agg.modelDaily[0].inputTokens, 1000n);
  assert.equal(agg.modelDaily[0].outputTokens, 500n);

  const productKey = 'anthropic|claude-code';
  assert.equal(agg.productTotals.get(productKey)?.totalRequests, 4);
  assert.equal(agg.productTotals.get(productKey)?.totalTokens, 1500n);
  assert.equal(agg.providerTotals.get('anthropic')?.totalTokens, 1500n);
  assert.equal(agg.modelTotals.get('anthropic|claude-code|claude-sonnet-4.6')?.totalTokens, 1500n);
});

test('aggregateCanonical merges multiple model calls of the same model on the same day', () => {
  const snapshot: AgentSnapshot = {
    schemaVersion: 2,
    source: baseSource,
    observedAt: '2026-04-21T12:00:00.000Z',
    runs: [
      {
        runId: 'r1',
        startedAt: '2026-04-20T10:00:00.000Z',
        modelCalls: [
          { modelId: 'claude-sonnet-4.6', requestCount: 2, inputTokens: 100, outputTokens: 50, sourceOfTruth: 'observed' },
          { modelId: 'claude-sonnet-4.6', requestCount: 3, inputTokens: 200, outputTokens: 80, sourceOfTruth: 'observed' },
        ],
      },
    ],
  };
  const agg = aggregateCanonical(snapshot);
  assert.equal(agg.modelDaily.length, 1);
  assert.equal(agg.modelDaily[0].requestCount, 5);
  assert.equal(agg.modelDaily[0].inputTokens, 300n);
  assert.equal(agg.modelDaily[0].outputTokens, 130n);
});

test('aggregateCanonical attaches repoIdentity from run.repoRef', () => {
  const snapshot: AgentSnapshot = {
    schemaVersion: 2,
    source: baseSource,
    observedAt: '2026-04-21T12:00:00.000Z',
    runs: [
      {
        runId: 'r1',
        startedAt: '2026-04-20T10:00:00.000Z',
        repoRef: { mode: 'github', githubRepo: 'foo/bar' },
        modelCalls: [
          { modelId: 'm', requestCount: 1, sourceOfTruth: 'observed' },
        ],
      },
    ],
  };
  const agg = aggregateCanonical(snapshot);
  assert.equal(agg.modelDaily[0].repoIdentity, 'github:foo/bar');
});

test('aggregateCanonical aggregates actions per type per day', () => {
  const snapshot: AgentSnapshot = {
    schemaVersion: 2,
    source: baseSource,
    observedAt: '2026-04-21T12:00:00.000Z',
    runs: [
      {
        runId: 'r1',
        startedAt: '2026-04-20T10:00:00.000Z',
        actions: [
          { type: 'tool_call', count: 3 },
          { type: 'tool_call', count: 2 },
          { type: 'file_edit', count: 1, filesTouched: 4 },
        ],
      },
    ],
  };
  const agg = aggregateCanonical(snapshot);
  const tool = agg.actionDaily.find((r) => r.actionType === 'tool_call');
  const edit = agg.actionDaily.find((r) => r.actionType === 'file_edit');
  assert.equal(tool?.count, 5);
  assert.equal(edit?.count, 1);
  assert.equal(edit?.filesTouched, 4);
});

test('aggregateCanonical falls back to observedAt date when run.startedAt is missing', () => {
  const snapshot: AgentSnapshot = {
    schemaVersion: 2,
    source: baseSource,
    observedAt: '2026-04-21T12:00:00.000Z',
    runs: [
      {
        runId: 'r1',
        modelCalls: [{ modelId: 'm', requestCount: 1, sourceOfTruth: 'observed' }],
      },
    ],
  };
  const agg = aggregateCanonical(snapshot);
  assert.equal(agg.modelDaily[0].date, '2026-04-21');
});

test('aggregateCanonical produces product/provider totals from dailyBuckets only (no modelDaily)', () => {
  const snapshot: AgentSnapshot = {
    schemaVersion: 2,
    source: baseSource,
    observedAt: '2026-04-21T12:00:00.000Z',
    dailyBuckets: [
      { date: '2026-04-21', requests: 10, inputTokens: 500, outputTokens: 200, costMicros: 7500 },
    ],
  };
  const agg = aggregateCanonical(snapshot);
  assert.equal(agg.modelDaily.length, 0);
  assert.equal(agg.modelTotals.size, 0);
  assert.equal(agg.productTotals.get('anthropic|claude-code')?.totalRequests, 10);
  assert.equal(agg.productTotals.get('anthropic|claude-code')?.totalTokens, 700n);
  assert.equal(agg.providerTotals.get('anthropic')?.costMicros, 7500n);
});
