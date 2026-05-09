/** AgentSnapshot payload builder for PromptStreak uploads. */

import { createHash } from 'crypto';
import type { AgentAction, AgentDailyBucket, AgentModelCall, AgentSnapshot, AgentRun } from '@copilot-usage/shared-schema';
import { SharePayloadInput } from './types';

function nonNegativeInt(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.floor(value);
}

function stableModelId(modelId: string): string {
  if (!modelId) {
    return 'all-models';
  }
  return modelId.replace(/^copilot\//, '');
}

function buildRunHash(input: SharePayloadInput): string {
  const digest = createHash('sha256');
  digest.update(input.idempotencySeed);
  digest.update('|');
  digest.update(input.observedAtIso);
  digest.update('|');
  digest.update(String(nonNegativeInt(input.totals.totalRequests)));
  digest.update('|');
  digest.update(String(nonNegativeInt(input.totals.totalPromptTokens)));
  digest.update('|');
  digest.update(String(nonNegativeInt(input.totals.totalOutputTokens)));
  return digest.digest('hex');
}

function buildIdempotencyKey(input: SharePayloadInput): string {
  const hash = buildRunHash(input);
  return `vsc_${hash.slice(0, 40)}`;
}

function buildModelCalls(input: SharePayloadInput): AgentModelCall[] {
  if (input.fields.includeModelBreakdown && input.models.length > 0) {
    return input.models.map(m => ({
      modelId: stableModelId(m.modelId),
      requestCount: nonNegativeInt(m.requestCount),
      inputTokens: nonNegativeInt(m.inputTokens),
      outputTokens: nonNegativeInt(m.outputTokens),
      sourceOfTruth: 'observed',
    }));
  }

  return [{
    modelId: 'all-models',
    requestCount: nonNegativeInt(input.totals.totalRequests),
    inputTokens: nonNegativeInt(input.totals.totalPromptTokens),
    outputTokens: nonNegativeInt(input.totals.totalOutputTokens),
    sourceOfTruth: 'observed',
  }];
}

function buildActions(input: SharePayloadInput): AgentAction[] | undefined {
  if (!input.fields.includeActionCounts || input.actions.length === 0) {
    return undefined;
  }

  return input.actions.map(action => ({
    type: action.type,
    count: nonNegativeInt(action.count),
    filesTouched: nonNegativeInt(action.filesTouched || 0),
  }));
}

function buildDailyBuckets(input: SharePayloadInput): AgentDailyBucket[] | undefined {
  if (!input.fields.includeDailyBuckets || input.dailyBuckets.length === 0) {
    return undefined;
  }

  return input.dailyBuckets.map(bucket => ({
    date: bucket.date,
    requests: nonNegativeInt(bucket.requests),
    inputTokens: nonNegativeInt(bucket.inputTokens),
    outputTokens: nonNegativeInt(bucket.outputTokens),
  }));
}

export function buildShareSnapshot(input: SharePayloadInput): AgentSnapshot {
  const hash = buildRunHash(input);
  const run: AgentRun = {
    runId: `run_${hash.slice(0, 24)}`,
    startedAt: input.observedAtIso,
    endedAt: input.observedAtIso,
    modelCalls: buildModelCalls(input),
    actions: buildActions(input),
  };

  if (input.fields.includeRepoAttribution && input.githubRepo) {
    run.repoRef = {
      mode: 'github',
      githubRepo: input.githubRepo,
    };
  }

  const snapshot: AgentSnapshot = {
    schemaVersion: 2,
    source: {
      adapter: 'copilot-usage-vscode',
      adapterVersion: input.adapterVersion,
      provider: 'github',
      product: 'copilot',
      surface: 'vscode',
      capabilities: {
        supportsTokens: true,
        supportsCosts: false,
        supportsRunIds: true,
        supportsRepoAttribution: input.fields.includeRepoAttribution,
        supportsToolActions: input.fields.includeActionCounts,
        supportsVerifiedProviderData: false,
      },
    },
    observedAt: input.observedAtIso,
    idempotencyKey: buildIdempotencyKey(input),
    runs: [run],
  };

  const buckets = buildDailyBuckets(input);
  if (buckets && buckets.length > 0) {
    snapshot.dailyBuckets = buckets;
  }

  return snapshot;
}
