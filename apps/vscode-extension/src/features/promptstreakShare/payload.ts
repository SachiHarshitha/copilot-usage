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

function nonNegativePremium(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.round(value * 1000) / 1000;
}

function stableModelId(modelId: string): string {
  if (!modelId) {
    return 'all-models';
  }
  return modelId.replace(/^copilot\//, '');
}

function stableRepoRefKey(repoRef: SharePayloadInput['repoRef']): string {
  if (!repoRef) {
    return '';
  }

  if (repoRef.mode === 'github') {
    return `github:${repoRef.githubRepo}`;
  }
  if (repoRef.mode === 'alias') {
    return `alias:${repoRef.aliasLabel}`;
  }
  return 'redacted';
}

function buildDeterministicUsageFingerprint(input: SharePayloadInput): string {
  const canonical = {
    fields: {
      includeDailyBuckets: Boolean(input.fields.includeDailyBuckets),
      includeModelBreakdown: Boolean(input.fields.includeModelBreakdown),
      includeActionCounts: Boolean(input.fields.includeActionCounts),
      includeRepoAttribution: Boolean(input.fields.includeRepoAttribution),
    },
    totals: {
      totalRequests: nonNegativeInt(input.totals.totalRequests),
      totalPromptTokens: nonNegativeInt(input.totals.totalPromptTokens),
      totalOutputTokens: nonNegativeInt(input.totals.totalOutputTokens),
      totalPremiumRequests: nonNegativePremium(input.totals.totalPremiumRequests),
    },
    models: input.models
      .map(model => ({
        modelId: stableModelId(model.modelId),
        requestCount: nonNegativeInt(model.requestCount),
        inputTokens: nonNegativeInt(model.inputTokens),
        outputTokens: nonNegativeInt(model.outputTokens),
        premiumRequests: nonNegativePremium(model.premiumRequests),
      }))
      .sort((a, b) => a.modelId.localeCompare(b.modelId)),
    actions: input.actions
      .map(action => ({
        type: action.type,
        count: nonNegativeInt(action.count),
        filesTouched: nonNegativeInt(action.filesTouched || 0),
      }))
      .sort((a, b) => a.type.localeCompare(b.type)),
    dailyBuckets: input.dailyBuckets
      .map(bucket => ({
        date: bucket.date,
        requests: nonNegativeInt(bucket.requests),
        inputTokens: nonNegativeInt(bucket.inputTokens),
        outputTokens: nonNegativeInt(bucket.outputTokens),
        premiumRequests: nonNegativePremium(bucket.premiumRequests),
      }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    repoRef: input.repoRef || null,
    repoRuns: (input.repoRuns || [])
      .map(run => ({
        repoRefKey: stableRepoRefKey(run.repoRef),
        totalRequests: nonNegativeInt(run.totalRequests),
        totalPromptTokens: nonNegativeInt(run.totalPromptTokens),
        totalOutputTokens: nonNegativeInt(run.totalOutputTokens),
        totalPremiumRequests: nonNegativePremium(run.totalPremiumRequests),
        topModel: run.topModel ? stableModelId(run.topModel) : '',
      }))
      .sort((a, b) => a.repoRefKey.localeCompare(b.repoRefKey)),
  };

  return JSON.stringify(canonical);
}

function buildRunHash(input: SharePayloadInput): string {
  const digest = createHash('sha256');
  digest.update(buildDeterministicUsageFingerprint(input));
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
      premiumRequests: nonNegativePremium(m.premiumRequests),
      sourceOfTruth: 'observed',
    }));
  }

  return [{
    modelId: 'all-models',
    requestCount: nonNegativeInt(input.totals.totalRequests),
    inputTokens: nonNegativeInt(input.totals.totalPromptTokens),
    outputTokens: nonNegativeInt(input.totals.totalOutputTokens),
    premiumRequests: nonNegativePremium(input.totals.totalPremiumRequests),
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
    premiumRequests: nonNegativePremium(bucket.premiumRequests),
  }));
}

function buildAggregateRun(input: SharePayloadInput, runHash: string): AgentRun {
  const run: AgentRun = {
    runId: `run_${runHash.slice(0, 24)}`,
    startedAt: input.observedAtIso,
    endedAt: input.observedAtIso,
    modelCalls: buildModelCalls(input),
    actions: buildActions(input),
  };

  if (input.fields.includeRepoAttribution && input.repoRef) {
    run.repoRef = { ...input.repoRef };
  }

  return run;
}

function buildRepoRuns(input: SharePayloadInput, runHash: string): AgentRun[] {
  if (!input.fields.includeRepoAttribution || !input.repoRuns || input.repoRuns.length === 0) {
    return [];
  }

  const sharedActions = buildActions(input);

  return input.repoRuns.map((repoRun, index) => {
    const promptTokens = nonNegativeInt(repoRun.totalPromptTokens);
    const outputTokens = nonNegativeInt(repoRun.totalOutputTokens);
    const premiumRequests = nonNegativePremium(repoRun.totalPremiumRequests);
    let requestCount = nonNegativeInt(repoRun.totalRequests);
    if (requestCount === 0 && (promptTokens > 0 || outputTokens > 0)) {
      requestCount = 1;
    }

    const modelId = input.fields.includeModelBreakdown && repoRun.topModel
      ? stableModelId(repoRun.topModel)
      : 'all-models';

    const run: AgentRun = {
      runId: `run_${runHash.slice(0, 16)}_${String(index + 1).padStart(2, '0')}`,
      startedAt: input.observedAtIso,
      endedAt: input.observedAtIso,
      repoRef: { ...repoRun.repoRef },
      modelCalls: [{
        modelId,
        requestCount,
        inputTokens: promptTokens,
        outputTokens,
        premiumRequests,
        sourceOfTruth: 'observed',
      }],
    };

    if (index === 0 && sharedActions && sharedActions.length > 0) {
      run.actions = sharedActions;
    }

    return run;
  });
}

export function buildShareSnapshot(input: SharePayloadInput): AgentSnapshot {
  const hash = buildRunHash(input);
  const runs = buildRepoRuns(input, hash);
  if (runs.length === 0) {
    runs.push(buildAggregateRun(input, hash));
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
    runs,
  };

  const buckets = buildDailyBuckets(input);
  if (buckets && buckets.length > 0) {
    snapshot.dailyBuckets = buckets;
  }

  return snapshot;
}
