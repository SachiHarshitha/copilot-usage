import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AgentSnapshotSchema,
  FORBIDDEN_CONTENT_FIELDS,
  findForbiddenFields,
  type AgentSnapshot,
} from '@copilot-usage/shared-schema';

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

// --- strictness + denylist ---

test('v2 strict schema rejects unknown top-level field', () => {
  const parsed = AgentSnapshotSchema.safeParse({
    ...validV2Snapshot,
    smuggled: 'extra',
  });
  assert.equal(parsed.success, false);
});

test('v2 strict schema rejects unknown nested field on model call', () => {
  const parsed = AgentSnapshotSchema.safeParse({
    ...validV2Snapshot,
    runs: [
      {
        runId: 'run-1',
        modelCalls: [
          {
            modelId: 'copilot/gpt-4o',
            requestCount: 1,
            sourceOfTruth: 'observed',
            prompt: 'leak',
          },
        ],
      },
    ],
  });
  assert.equal(parsed.success, false);
});

test('v2 strict schema rejects unknown nested field on a daily bucket', () => {
  const parsed = AgentSnapshotSchema.safeParse({
    schemaVersion: 2,
    source: validV2Snapshot.source,
    observedAt: validV2Snapshot.observedAt,
    dailyBuckets: [
      {
        date: '2026-04-21',
        requests: 12,
        inputTokens: 100,
        outputTokens: 40,
        prompts: ['leak'],
      },
    ],
  });
  assert.equal(parsed.success, false);
});

test('findForbiddenFields returns empty for clean v2 payload with contractual allowlist', () => {
  assert.deepEqual(
    findForbiddenFields(validV2Snapshot, {
      allowList: new Set(['source']),
    }),
    []
  );
});

test('findForbiddenFields detects top-level forbidden field', () => {
  const result = findForbiddenFields({ prompt: 'hello world' });
  assert.deepEqual(result, ['prompt']);
});

test('findForbiddenFields is case-insensitive', () => {
  const result = findForbiddenFields({ Prompt: 'x', SECRET: 'y' });
  assert.equal(result.length, 2);
  assert.ok(result.includes('Prompt'));
  assert.ok(result.includes('SECRET'));
});

test('findForbiddenFields detects forbidden field nested in arrays', () => {
  const result = findForbiddenFields({
    repos: [
      { ok: 1 },
      { ok: 2, terminalOutput: 'cat /etc/passwd' },
    ],
  });
  assert.deepEqual(result, ['repos[1].terminalOutput']);
});

test('findForbiddenFields detects forbidden field deeply nested', () => {
  const result = findForbiddenFields({
    a: { b: { c: { diff: 'patch' } } },
  });
  assert.deepEqual(result, ['a.b.c.diff']);
});

test('findForbiddenFields does not flag legitimate look-alike fields', () => {
  // promptTokens / messageId / requestCount must NOT be flagged because we
  // require an exact (case-insensitive) field-name match, not substring.
  const result = findForbiddenFields({
    promptTokens: 100,
    messageId: 'abc',
    requestCount: 5,
    tokenizer: 'gpt',
  });
  assert.deepEqual(result, []);
});

test('findForbiddenFields is cycle-safe', () => {
  const a: Record<string, unknown> = { x: 1 };
  a.self = a;
  // Should not throw or hang.
  assert.deepEqual(findForbiddenFields(a), []);
});

test('FORBIDDEN_CONTENT_FIELDS includes the core content names from the spec', () => {
  for (const name of [
    'prompt',
    'completion',
    'code',
    'terminal',
    'chat',
    'message',
    'secret',
    'env',
    'diff',
    'patch',
    'transcript',
  ]) {
    assert.ok(FORBIDDEN_CONTENT_FIELDS.has(name), `missing ${name}`);
  }
});
