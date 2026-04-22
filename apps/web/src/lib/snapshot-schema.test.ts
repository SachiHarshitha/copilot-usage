import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AgentSnapshotSchema,
  SnapshotPayloadSchema,
  type AgentSnapshot,
  type SnapshotPayload,
} from '@copilot-usage/shared-schema';

const validV1Payload: SnapshotPayload = {
  clientUploadedAt: new Date().toISOString(),
  workspaceCount: 2,
  sessionCount: 5,
  dailyBuckets: [
    {
      date: '2026-04-21',
      requests: 12,
      promptTokens: 1000,
      outputTokens: 800,
      premiumRequests: 0,
    },
  ],
  repos: [],
  modelBreakdown: [
    { modelId: 'copilot/gpt-4o', requests: 12, totalTokens: 1800 },
  ],
};

test('v1 SnapshotPayloadSchema still parses legacy uploads (backward compat)', () => {
  const parsed = SnapshotPayloadSchema.safeParse(validV1Payload);
  assert.equal(parsed.success, true);
});

test('v1 schema rejects unknown shape', () => {
  const parsed = SnapshotPayloadSchema.safeParse({ foo: 'bar' });
  assert.equal(parsed.success, false);
});

const validV2Snapshot: AgentSnapshot = {
  schemaVersion: 2,
  source: {
    adapter: 'github-copilot-vscode',
    adapterVersion: '0.1.0',
    provider: 'github',
    product: 'copilot',
    surface: 'vscode',
  },
  observedAt: new Date().toISOString(),
  runs: [
    {
      runId: 'run-1',
      modelCalls: [
        {
          modelId: 'copilot/gpt-4o',
          requestCount: 1,
          inputTokens: 100,
          outputTokens: 50,
          sourceOfTruth: 'observed',
        },
      ],
    },
  ],
};

test('v2 AgentSnapshotSchema accepts a minimal valid snapshot', () => {
  const parsed = AgentSnapshotSchema.safeParse(validV2Snapshot);
  if (!parsed.success) {
    console.error(parsed.error.flatten());
  }
  assert.equal(parsed.success, true);
});

test('v2 AgentSnapshotSchema requires runs or dailyBuckets', () => {
  const parsed = AgentSnapshotSchema.safeParse({
    schemaVersion: 2,
    source: validV2Snapshot.source,
    observedAt: new Date().toISOString(),
  });
  assert.equal(parsed.success, false);
});

test('v2 AgentSnapshotSchema requires sourceOfTruth on every model call', () => {
  const parsed = AgentSnapshotSchema.safeParse({
    schemaVersion: 2,
    source: validV2Snapshot.source,
    observedAt: new Date().toISOString(),
    runs: [
      {
        runId: 'run-1',
        modelCalls: [{ modelId: 'copilot/gpt-4o', requestCount: 1 }],
      },
    ],
  });
  assert.equal(parsed.success, false);
});

test('v2 AgentSnapshotSchema accepts dailyBuckets-only payloads', () => {
  const parsed = AgentSnapshotSchema.safeParse({
    schemaVersion: 2,
    source: {
      adapter: 'provider-billing-export',
      adapterVersion: '0.0.1',
      provider: 'anthropic',
      product: 'claude-code',
      surface: 'cloud',
    },
    observedAt: new Date().toISOString(),
    dailyBuckets: [
      {
        date: '2026-04-21',
        requests: 50,
        inputTokens: 12000,
        outputTokens: 8000,
        costMicros: 250000,
      },
    ],
  });
  assert.equal(parsed.success, true);
});

test('v2 schemaVersion must be literal 2', () => {
  const parsed = AgentSnapshotSchema.safeParse({
    ...validV2Snapshot,
    schemaVersion: 1,
  });
  assert.equal(parsed.success, false);
});
