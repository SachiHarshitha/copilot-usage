import assert from 'node:assert/strict';
import test from 'node:test';

import { AgentSnapshotSchema } from '@copilot-usage/shared-schema';

import {
  detectPayloadVersion,
} from './upload-translate';

test('detectPayloadVersion identifies v2 payloads', () => {
  const v2 = {
    schemaVersion: 2,
    source: {
      adapter: 'x',
      adapterVersion: '1',
      provider: 'p',
      product: 'q',
      surface: 'vscode',
    },
    observedAt: '2026-04-21T00:00:00.000Z',
    runs: [{ runId: 'r' }],
  };
  assert.equal(detectPayloadVersion(v2), 'v2');
  assert.equal(AgentSnapshotSchema.safeParse(v2).success, true);
});

test('detectPayloadVersion returns unknown for legacy v1 payload shape', () => {
  const legacyLike = {
    clientUploadedAt: '2026-04-21T12:00:00.000Z',
    workspaceCount: 1,
    sessionCount: 3,
    dailyBuckets: [
      {
        date: '2026-04-20',
        requests: 10,
        promptTokens: 200,
        outputTokens: 150,
        premiumRequests: 1,
      },
    ],
    repos: [],
    modelBreakdown: [{ modelId: 'copilot/gpt-4o', requests: 15, totalTokens: 530 }],
  };
  assert.equal(detectPayloadVersion(legacyLike), 'unknown');
});

test('detectPayloadVersion returns unknown for nonsense', () => {
  assert.equal(detectPayloadVersion(null), 'unknown');
  assert.equal(detectPayloadVersion('a string'), 'unknown');
  assert.equal(detectPayloadVersion({ random: true }), 'unknown');
});
