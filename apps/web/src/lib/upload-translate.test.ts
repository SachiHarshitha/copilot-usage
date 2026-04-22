import assert from 'node:assert/strict';
import test from 'node:test';

import type { SnapshotPayload } from '@copilot-usage/shared-schema';
import { AgentSnapshotSchema } from '@copilot-usage/shared-schema';

import {
  COPILOT_PRODUCT,
  COPILOT_PROVIDER,
  COPILOT_SURFACE,
  COPILOT_VSCODE_ADAPTER,
  detectPayloadVersion,
  translateV1ToV2,
} from './upload-translate';

const v1Payload: SnapshotPayload = {
  clientUploadedAt: '2026-04-21T12:00:00.000Z',
  workspaceCount: 1,
  sessionCount: 3,
  dailyBuckets: [
    { date: '2026-04-20', requests: 10, promptTokens: 200, outputTokens: 150, premiumRequests: 1 },
    { date: '2026-04-21', requests: 5, promptTokens: 100, outputTokens: 80, premiumRequests: 0 },
  ],
  repos: [],
  modelBreakdown: [{ modelId: 'copilot/gpt-4o', requests: 15, totalTokens: 530 }],
};

test('detectPayloadVersion identifies v1 payloads', () => {
  assert.equal(detectPayloadVersion(v1Payload), 'v1');
});

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
});

test('detectPayloadVersion returns unknown for nonsense', () => {
  assert.equal(detectPayloadVersion(null), 'unknown');
  assert.equal(detectPayloadVersion('a string'), 'unknown');
  assert.equal(detectPayloadVersion({ random: true }), 'unknown');
});

test('translateV1ToV2 produces a schema-valid AgentSnapshot', () => {
  const snapshot = translateV1ToV2(v1Payload, '2026-04-21T12:00:00.000Z');
  const parsed = AgentSnapshotSchema.safeParse(snapshot);
  if (!parsed.success) console.error(parsed.error.flatten());
  assert.equal(parsed.success, true);
});

test('translateV1ToV2 sets the correct adapter source for the legacy Copilot path', () => {
  const snapshot = translateV1ToV2(v1Payload);
  assert.equal(snapshot.source.adapter, COPILOT_VSCODE_ADAPTER);
  assert.equal(snapshot.source.provider, COPILOT_PROVIDER);
  assert.equal(snapshot.source.product, COPILOT_PRODUCT);
  assert.equal(snapshot.source.surface, COPILOT_SURFACE);
  assert.equal(snapshot.source.adapterVersion, 'legacy-v1');
});

test('translateV1ToV2 maps every v1 daily bucket 1:1', () => {
  const snapshot = translateV1ToV2(v1Payload);
  assert.equal(snapshot.dailyBuckets?.length, v1Payload.dailyBuckets.length);
  for (let i = 0; i < v1Payload.dailyBuckets.length; i++) {
    const src = v1Payload.dailyBuckets[i];
    const dst = snapshot.dailyBuckets![i];
    assert.equal(dst.date, src.date);
    assert.equal(dst.requests, src.requests);
    assert.equal(dst.inputTokens, src.promptTokens);
    assert.equal(dst.outputTokens, src.outputTokens);
    assert.equal(dst.premiumRequests, src.premiumRequests);
  }
});

test('translateV1ToV2 emits no run-level detail (v1 lacks it)', () => {
  const snapshot = translateV1ToV2(v1Payload);
  assert.equal(snapshot.runs, undefined);
});
