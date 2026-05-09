import * as assert from 'assert';
import { buildShareSnapshot } from '../features/promptstreakShare/payload';
import { SharePayloadInput } from '../features/promptstreakShare/types';

const FORBIDDEN_NAMES = new Set([
  'prompt',
  'prompts',
  'completion',
  'completions',
  'code',
  'sourcecode',
  'terminaloutput',
  'secret',
  'password',
  'env',
  'transcript',
]);

function findForbiddenKeys(value: unknown, path = ''): string[] {
  if (value === null || typeof value !== 'object') {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findForbiddenKeys(item, `${path}[${index}]`));
  }

  const findings: string[] = [];
  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    const lower = key.toLowerCase();
    if (FORBIDDEN_NAMES.has(lower)) {
      findings.push(path ? `${path}.${key}` : key);
    }
    findings.push(...findForbiddenKeys(obj[key], path ? `${path}.${key}` : key));
  }
  return findings;
}

suite('PromptStreak Share: payload', () => {
  test('buildShareSnapshot returns valid v2 payload with idempotencyKey', () => {
    const input: SharePayloadInput = {
      adapterVersion: '0.0.9-dev',
      observedAtIso: '2026-05-08T10:00:00.000Z',
      idempotencySeed: 'machine-1',
      fields: {
        includeDailyBuckets: true,
        includeModelBreakdown: true,
        includeActionCounts: true,
        includeRepoAttribution: false,
      },
      totals: {
        totalRequests: 20,
        totalPromptTokens: 1200,
        totalOutputTokens: 800,
      },
      models: [
        { modelId: 'copilot/gpt-5.3-codex', requestCount: 12, inputTokens: 700, outputTokens: 500 },
        { modelId: 'copilot/claude-sonnet-4.6', requestCount: 8, inputTokens: 500, outputTokens: 300 },
      ],
      actions: [
        { type: 'file_edit', count: 4, filesTouched: 2 },
        { type: 'tool_call', count: 6, filesTouched: 0 },
      ],
      dailyBuckets: [
        { date: '2026-05-07', requests: 10, inputTokens: 600, outputTokens: 400 },
        { date: '2026-05-08', requests: 10, inputTokens: 600, outputTokens: 400 },
      ],
    };

    const payload = buildShareSnapshot(input);
    const forbidden = findForbiddenKeys(payload);
    assert.deepStrictEqual(forbidden, []);

    assert.strictEqual(payload.schemaVersion, 2);
    assert.strictEqual(typeof payload.idempotencyKey, 'string');
    assert.ok(payload.idempotencyKey.length >= 8);
    assert.ok(Array.isArray(payload.runs));
    assert.ok(payload.runs.length > 0);
  });
});
