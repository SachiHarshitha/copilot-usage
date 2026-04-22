import { z } from 'zod';

import {
  ActionTypeSchema,
  RepoRefModeSchema,
  SurfaceSchema,
  TrustLevelSchema,
} from './enums';

/**
 * Agent-agnostic snapshot envelope (v2 upload contract).
 *
 * This is the normalized format produced by every adapter. Adapters must
 * emit at least the `source` block and one of `runs` or `dailyBuckets` so
 * the upload route can persist meaningful canonical facts.
 *
 * The legacy `SnapshotPayloadSchema` (v1) remains supported for backward
 * compatibility during the migration window.
 */

/** Permissive identifier: lowercase letters, digits, hyphen, dot, underscore. */
const idString = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9._-]+$/, 'Must be a lowercase id (a-z, 0-9, ., -, _)');

const repoRefSchema = z
  .object({
    mode: RepoRefModeSchema,
    githubRepo: z
      .string()
      .regex(/^[^/]+\/[^/]+$/, 'Must be owner/repo format')
      .nullable()
      .optional(),
    aliasLabel: z.string().max(100).nullable().optional(),
  })
  .strict();

const modelCallSchema = z
  .object({
    modelId: z.string().min(1).max(128),
    providerModelId: z.string().max(128).optional(),
    inputTokens: z.number().int().nonnegative().optional(),
    outputTokens: z.number().int().nonnegative().optional(),
    cacheReadTokens: z.number().int().nonnegative().optional(),
    cacheWriteTokens: z.number().int().nonnegative().optional(),
    requestCount: z.number().int().nonnegative().optional(),
    costMicros: z.number().int().nonnegative().optional(),
    currency: z.string().length(3).optional(),
    latencyMs: z.number().int().nonnegative().optional(),
    sourceOfTruth: TrustLevelSchema,
  })
  .strict();

const actionSchema = z
  .object({
    type: ActionTypeSchema,
    count: z.number().int().nonnegative().optional(),
    filesTouched: z.number().int().nonnegative().optional(),
  })
  .strict();

const runSchema = z
  .object({
    runId: z.string().min(1).max(128),
    startedAt: z.string().datetime().optional(),
    endedAt: z.string().datetime().optional(),
    workspaceKey: z.string().regex(/^[0-9a-f]{32}$/).optional(),
    repoRef: repoRefSchema.optional(),
    modelCalls: z.array(modelCallSchema).max(500).optional(),
    actions: z.array(actionSchema).max(500).optional(),
  })
  .strict();

/**
 * Daily roll-up buckets. Mirrors v1 daily buckets so adapters that only
 * have aggregate data (e.g. provider billing exports) can still upload
 * without fabricating run-level detail.
 */
const dailyAgentBucketSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    requests: z.number().int().nonnegative().optional(),
    inputTokens: z.number().int().nonnegative().optional(),
    outputTokens: z.number().int().nonnegative().optional(),
    cacheReadTokens: z.number().int().nonnegative().optional(),
    cacheWriteTokens: z.number().int().nonnegative().optional(),
    costMicros: z.number().int().nonnegative().optional(),
    premiumRequests: z.number().nonnegative().optional(),
  })
  .strict();

/** Adapter capability flags. Used by web app to decide which UI surfaces apply. */
export const AdapterCapabilitiesSchema = z
  .object({
    supportsTokens: z.boolean(),
    supportsCosts: z.boolean(),
    supportsRunIds: z.boolean(),
    supportsRepoAttribution: z.boolean(),
    supportsToolActions: z.boolean(),
    supportsVerifiedProviderData: z.boolean(),
  })
  .strict();
export type AdapterCapabilities = z.infer<typeof AdapterCapabilitiesSchema>;

/** Source block — identifies the adapter/provider/product/surface. */
export const AgentSourceSchema = z
  .object({
    adapter: idString,
    adapterVersion: z.string().min(1).max(64),
    provider: idString,
    product: idString,
    surface: SurfaceSchema,
    capabilities: AdapterCapabilitiesSchema.optional(),
  })
  .strict();
export type AgentSource = z.infer<typeof AgentSourceSchema>;

export const AgentSnapshotSchema = z
  .object({
    schemaVersion: z.literal(2),
    source: AgentSourceSchema,
    observedAt: z.string().datetime(),
    deviceId: z.string().min(1).max(128).optional(),
    runs: z.array(runSchema).max(2000).optional(),
    dailyBuckets: z.array(dailyAgentBucketSchema).max(3650).optional(),
  })
  .strict()
  .refine(
    (s) => (s.runs && s.runs.length > 0) || (s.dailyBuckets && s.dailyBuckets.length > 0),
    {
      message: 'AgentSnapshot must include at least one run or one daily bucket',
    }
  );

export type AgentSnapshot = z.infer<typeof AgentSnapshotSchema>;
export type AgentRun = z.infer<typeof runSchema>;
export type AgentModelCall = z.infer<typeof modelCallSchema>;
export type AgentAction = z.infer<typeof actionSchema>;
export type AgentDailyBucket = z.infer<typeof dailyAgentBucketSchema>;
export type AgentRepoRef = z.infer<typeof repoRefSchema>;
