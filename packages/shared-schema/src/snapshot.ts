import { z } from 'zod';

/** Repo display entry inside a snapshot upload. */
export const RepoEntrySchema = z.object({
  workspaceKey: z.string().regex(/^[0-9a-f]{32}$/, 'Must be a 32-char hex workspace hash'),
  displayMode: z.enum(['github', 'alias']),
  githubRepo: z
    .string()
    .regex(/^[^/]+\/[^/]+$/, 'Must be owner/repo format')
    .nullable(),
  aliasLabel: z.string().max(100).nullable(),
  requests: z.number().int().nonnegative(),
  promptTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  premiumRequests: z.number().nonnegative(),
  topModel: z.string(),
});

/** Single daily bucket inside the upload payload. */
export const DailyBucketSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  requests: z.number().int().nonnegative(),
  promptTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  premiumRequests: z.number().nonnegative(),
});

/** Model breakdown entry. */
export const ModelBreakdownSchema = z.object({
  modelId: z.string(),
  requests: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
});

/** The full snapshot payload POSTed to /api/upload. */
export const SnapshotPayloadSchema = z.object({
  clientUploadedAt: z.string().datetime(),
  workspaceCount: z.number().int().nonnegative(),
  sessionCount: z.number().int().nonnegative(),
  dailyBuckets: z.array(DailyBucketSchema).min(1).max(3650),
  repos: z.array(RepoEntrySchema).max(500),
  modelBreakdown: z.array(ModelBreakdownSchema).max(200),
});

export type SnapshotPayload = z.infer<typeof SnapshotPayloadSchema>;
export type RepoEntry = z.infer<typeof RepoEntrySchema>;
export type DailyBucket = z.infer<typeof DailyBucketSchema>;
export type ModelBreakdown = z.infer<typeof ModelBreakdownSchema>;
