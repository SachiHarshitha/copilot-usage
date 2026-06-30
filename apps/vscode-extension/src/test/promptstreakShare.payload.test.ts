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
        totalPremiumRequests: 24,
      },
      models: [
        { modelId: 'copilot/gpt-5.3-codex', requestCount: 12, inputTokens: 700, outputTokens: 500, premiumRequests: 12 },
        { modelId: 'copilot/claude-sonnet-4.6', requestCount: 8, inputTokens: 500, outputTokens: 300, premiumRequests: 12 },
      ],
      actions: [
        { type: 'file_edit', count: 4, filesTouched: 2 },
        { type: 'tool_call', count: 6, filesTouched: 0 },
      ],
      dailyBuckets: [
        { date: '2026-05-07', requests: 10, inputTokens: 600, outputTokens: 400, premiumRequests: 12 },
        { date: '2026-05-08', requests: 10, inputTokens: 600, outputTokens: 400, premiumRequests: 12 },
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
    assert.strictEqual(payload.runs[0]?.modelCalls?.[0]?.premiumRequests, 12);
    assert.strictEqual(payload.dailyBuckets?.[0]?.premiumRequests, 12);
  });

  test('includes github repoRef when repo attribution is enabled', () => {
    const input: SharePayloadInput = {
      adapterVersion: '0.0.9-dev',
      observedAtIso: '2026-05-08T10:00:00.000Z',
      idempotencySeed: 'machine-1',
      fields: {
        includeDailyBuckets: false,
        includeModelBreakdown: false,
        includeActionCounts: false,
        includeRepoAttribution: true,
      },
      totals: {
        totalRequests: 1,
        totalPromptTokens: 10,
        totalOutputTokens: 5,
      },
      models: [],
      actions: [],
      dailyBuckets: [],
      repoRef: {
        mode: 'github',
        githubRepo: 'octocat/hello-world',
      },
    };

    const payload = buildShareSnapshot(input);
    assert.deepStrictEqual(payload.runs?.[0]?.repoRef, {
      mode: 'github',
      githubRepo: 'octocat/hello-world',
    });
  });

  test('includes Non-Public alias repoRef when redaction is applied', () => {
    const input: SharePayloadInput = {
      adapterVersion: '0.0.9-dev',
      observedAtIso: '2026-05-08T10:00:00.000Z',
      idempotencySeed: 'machine-1',
      fields: {
        includeDailyBuckets: false,
        includeModelBreakdown: false,
        includeActionCounts: false,
        includeRepoAttribution: true,
      },
      totals: {
        totalRequests: 1,
        totalPromptTokens: 10,
        totalOutputTokens: 5,
      },
      models: [],
      actions: [],
      dailyBuckets: [],
      repoRef: {
        mode: 'alias',
        aliasLabel: 'Non-Public',
      },
    };

    const payload = buildShareSnapshot(input);
    assert.deepStrictEqual(payload.runs?.[0]?.repoRef, {
      mode: 'alias',
      aliasLabel: 'Non-Public',
    });
  });

  test('omits repoRef when repo attribution is disabled', () => {
    const input: SharePayloadInput = {
      adapterVersion: '0.0.9-dev',
      observedAtIso: '2026-05-08T10:00:00.000Z',
      idempotencySeed: 'machine-1',
      fields: {
        includeDailyBuckets: false,
        includeModelBreakdown: false,
        includeActionCounts: false,
        includeRepoAttribution: false,
      },
      totals: {
        totalRequests: 1,
        totalPromptTokens: 10,
        totalOutputTokens: 5,
      },
      models: [],
      actions: [],
      dailyBuckets: [],
      repoRef: {
        mode: 'github',
        githubRepo: 'octocat/hello-world',
      },
    };

    const payload = buildShareSnapshot(input);
    assert.strictEqual(payload.runs?.[0]?.repoRef, undefined);
  });

  test('emits one run per repo when repo runs are provided', () => {
    const input: SharePayloadInput = {
      adapterVersion: '0.1.0',
      observedAtIso: '2026-05-09T10:00:00.000Z',
      idempotencySeed: 'seed-a',
      fields: {
        includeDailyBuckets: false,
        includeModelBreakdown: false,
        includeActionCounts: true,
        includeRepoAttribution: true,
      },
      totals: {
        totalRequests: 8,
        totalPromptTokens: 260,
        totalOutputTokens: 52,
        totalPremiumRequests: 8,
      },
      models: [],
      actions: [
        { type: 'tool_call', count: 3, filesTouched: 0 },
      ],
      dailyBuckets: [],
      repoRuns: [
        {
          repoRef: { mode: 'github', githubRepo: 'octocat/repo-a' },
          totalRequests: 5,
          totalPromptTokens: 180,
          totalOutputTokens: 40,
          totalPremiumRequests: 5,
          topModel: 'copilot/gpt-5.3-codex',
        },
        {
          repoRef: { mode: 'alias', aliasLabel: 'Non-Public' },
          totalRequests: 3,
          totalPromptTokens: 80,
          totalOutputTokens: 12,
          totalPremiumRequests: 3,
        },
      ],
    };

    const payload = buildShareSnapshot(input);
    assert.strictEqual(payload.runs?.length, 2);
    assert.deepStrictEqual(payload.runs?.[0]?.repoRef, {
      mode: 'github',
      githubRepo: 'octocat/repo-a',
    });
    assert.deepStrictEqual(payload.runs?.[1]?.repoRef, {
      mode: 'alias',
      aliasLabel: 'Non-Public',
    });
    assert.strictEqual(payload.runs?.[0]?.modelCalls?.[0]?.modelId, 'all-models');
    assert.strictEqual(payload.runs?.[0]?.modelCalls?.[0]?.premiumRequests, 5);
  });

  test('uses explicit day-scoped runs when provided', () => {
    const input: SharePayloadInput = {
      adapterVersion: '0.1.0',
      observedAtIso: '2026-05-09T10:00:00.000Z',
      idempotencySeed: 'seed-a',
      fields: {
        includeDailyBuckets: true,
        includeModelBreakdown: true,
        includeActionCounts: true,
        includeRepoAttribution: true,
      },
      totals: {
        totalRequests: 9,
        totalPromptTokens: 300,
        totalOutputTokens: 90,
      },
      models: [],
      actions: [],
      dailyBuckets: [
        { date: '2026-05-08', requests: 4, inputTokens: 140, outputTokens: 45 },
        { date: '2026-05-09', requests: 5, inputTokens: 160, outputTokens: 45 },
      ],
      runs: [
        {
          date: '2026-05-08',
          repoRef: { mode: 'github', githubRepo: 'octocat/repo-a' },
          modelCalls: [
            { modelId: 'copilot/gpt-5.3-codex', requestCount: 3, inputTokens: 100, outputTokens: 30, premiumRequests: 3 },
            { modelId: 'copilot/gpt-4.1', requestCount: 1, inputTokens: 40, outputTokens: 15, premiumRequests: 1 },
          ],
          actions: [
            { type: 'tool_call', count: 2, filesTouched: 0 },
          ],
        },
        {
          date: '2026-05-09',
          repoRef: { mode: 'alias', aliasLabel: 'Non-Public' },
          modelCalls: [
            { modelId: 'copilot/o3', requestCount: 5, inputTokens: 160, outputTokens: 45, premiumRequests: 15 },
          ],
        },
      ],
    };

    const payload = buildShareSnapshot(input);

    assert.strictEqual(payload.runs?.length, 2);
    assert.strictEqual(payload.runs?.[0]?.startedAt, '2026-05-08T00:00:00.000Z');
    assert.strictEqual(payload.runs?.[1]?.startedAt, '2026-05-09T00:00:00.000Z');
    assert.deepStrictEqual(payload.runs?.[0]?.repoRef, {
      mode: 'github',
      githubRepo: 'octocat/repo-a',
    });
    assert.strictEqual(payload.runs?.[0]?.modelCalls?.length, 2);
    assert.strictEqual(payload.runs?.[0]?.modelCalls?.[0]?.modelId, 'gpt-4.1');
    assert.strictEqual(payload.runs?.[0]?.modelCalls?.[1]?.modelId, 'gpt-5.3-codex');
    assert.strictEqual(payload.runs?.[0]?.actions?.[0]?.count, 2);
  });

  test('keeps idempotency stable when explicit runs are reordered', () => {
    const base: SharePayloadInput = {
      adapterVersion: '0.1.0',
      observedAtIso: '2026-05-09T10:00:00.000Z',
      idempotencySeed: 'seed-a',
      fields: {
        includeDailyBuckets: true,
        includeModelBreakdown: true,
        includeActionCounts: true,
        includeRepoAttribution: true,
      },
      totals: {
        totalRequests: 9,
        totalPromptTokens: 300,
        totalOutputTokens: 90,
      },
      models: [],
      actions: [],
      dailyBuckets: [
        { date: '2026-05-08', requests: 4, inputTokens: 140, outputTokens: 45 },
        { date: '2026-05-09', requests: 5, inputTokens: 160, outputTokens: 45 },
      ],
      runs: [
        {
          date: '2026-05-09',
          repoRef: { mode: 'alias', aliasLabel: 'Non-Public' },
          modelCalls: [
            { modelId: 'copilot/o3', requestCount: 5, inputTokens: 160, outputTokens: 45, premiumRequests: 15 },
          ],
        },
        {
          date: '2026-05-08',
          repoRef: { mode: 'github', githubRepo: 'octocat/repo-a' },
          modelCalls: [
            { modelId: 'copilot/gpt-5.3-codex', requestCount: 3, inputTokens: 100, outputTokens: 30, premiumRequests: 3 },
            { modelId: 'copilot/gpt-4.1', requestCount: 1, inputTokens: 40, outputTokens: 15, premiumRequests: 1 },
          ],
          actions: [
            { type: 'tool_call', count: 2, filesTouched: 0 },
          ],
        },
      ],
    };

    const reordered: SharePayloadInput = {
      ...base,
      observedAtIso: '2026-05-09T11:00:00.000Z',
      idempotencySeed: 'seed-b',
      runs: [...(base.runs || [])].reverse(),
    };

    const payloadBase = buildShareSnapshot(base);
    const payloadReordered = buildShareSnapshot(reordered);

    assert.strictEqual(payloadBase.idempotencyKey, payloadReordered.idempotencyKey);
  });

  test('generates stable idempotency key for identical usage snapshots', () => {
    const inputA: SharePayloadInput = {
      adapterVersion: '0.1.0',
      observedAtIso: '2026-05-09T10:00:00.000Z',
      idempotencySeed: 'seed-a',
      fields: {
        includeDailyBuckets: true,
        includeModelBreakdown: true,
        includeActionCounts: true,
        includeRepoAttribution: true,
      },
      totals: {
        totalRequests: 50,
        totalPromptTokens: 1500,
        totalOutputTokens: 800,
      },
      models: [
        { modelId: 'copilot/gpt-5.3-codex', requestCount: 30, inputTokens: 900, outputTokens: 500 },
        { modelId: 'copilot/gpt-4.1', requestCount: 20, inputTokens: 600, outputTokens: 300 },
      ],
      actions: [
        { type: 'tool_call', count: 10, filesTouched: 0 },
      ],
      dailyBuckets: [
        { date: '2026-05-09', requests: 50, inputTokens: 1500, outputTokens: 800 },
      ],
      repoRef: {
        mode: 'github',
        githubRepo: 'octocat/hello-world',
      },
    };

    const inputB: SharePayloadInput = {
      ...inputA,
      observedAtIso: '2026-05-09T10:05:00.000Z',
      idempotencySeed: 'seed-b',
    };

    const payloadA = buildShareSnapshot(inputA);
    const payloadB = buildShareSnapshot(inputB);

    assert.strictEqual(payloadA.idempotencyKey, payloadB.idempotencyKey);
  });

  test('changes idempotency key when usage metrics change', () => {
    const base: SharePayloadInput = {
      adapterVersion: '0.1.0',
      observedAtIso: '2026-05-09T10:00:00.000Z',
      idempotencySeed: 'seed-a',
      fields: {
        includeDailyBuckets: true,
        includeModelBreakdown: false,
        includeActionCounts: false,
        includeRepoAttribution: false,
      },
      totals: {
        totalRequests: 10,
        totalPromptTokens: 500,
        totalOutputTokens: 250,
      },
      models: [],
      actions: [],
      dailyBuckets: [
        { date: '2026-05-09', requests: 10, inputTokens: 500, outputTokens: 250 },
      ],
    };

    const changed: SharePayloadInput = {
      ...base,
      totals: {
        totalRequests: 11,
        totalPromptTokens: 550,
        totalOutputTokens: 270,
      },
      dailyBuckets: [
        { date: '2026-05-09', requests: 11, inputTokens: 550, outputTokens: 270 },
      ],
    };

    const payloadBase = buildShareSnapshot(base);
    const payloadChanged = buildShareSnapshot(changed);

    assert.notStrictEqual(payloadBase.idempotencyKey, payloadChanged.idempotencyKey);
  });

  test('keeps idempotency stable when repo runs are reordered', () => {
    const base: SharePayloadInput = {
      adapterVersion: '0.1.0',
      observedAtIso: '2026-05-09T10:00:00.000Z',
      idempotencySeed: 'seed-a',
      fields: {
        includeDailyBuckets: false,
        includeModelBreakdown: false,
        includeActionCounts: false,
        includeRepoAttribution: true,
      },
      totals: {
        totalRequests: 8,
        totalPromptTokens: 260,
        totalOutputTokens: 52,
      },
      models: [],
      actions: [],
      dailyBuckets: [],
      repoRuns: [
        {
          repoRef: { mode: 'github', githubRepo: 'octocat/repo-a' },
          totalRequests: 5,
          totalPromptTokens: 180,
          totalOutputTokens: 40,
        },
        {
          repoRef: { mode: 'alias', aliasLabel: 'Non-Public' },
          totalRequests: 3,
          totalPromptTokens: 80,
          totalOutputTokens: 12,
        },
      ],
    };

    const reordered: SharePayloadInput = {
      ...base,
      repoRuns: [...(base.repoRuns || [])].reverse(),
      observedAtIso: '2026-05-09T10:05:00.000Z',
      idempotencySeed: 'seed-b',
    };

    const payloadBase = buildShareSnapshot(base);
    const payloadReordered = buildShareSnapshot(reordered);

    assert.strictEqual(payloadBase.idempotencyKey, payloadReordered.idempotencyKey);
  });
});
