/** Types for PromptStreak share integration. */

export type ShareRecipe = 'privacy_first' | 'standard' | 'full';

export interface ShareFieldConfig {
  includeDailyBuckets: boolean;
  includeModelBreakdown: boolean;
  includeActionCounts: boolean;
  includeRepoAttribution: boolean;
}

export interface PromptstreakShareSettings {
  enabled: boolean;
  recipe: ShareRecipe;
  fields: ShareFieldConfig;
  autoSyncMinutes: number;
  historyLimit: number;
  promptstreakBaseUrl: string;
  deviceAlias?: string;
  linkedAtIso?: string;
  lastSuccessfulSyncIso?: string;
  lastSyncStatus?: string;
}

export type ShareHistoryStatus = 'success' | 'failed' | 'skipped';

export interface ShareHistoryEntry {
  id: string;
  timestampIso: string;
  status: ShareHistoryStatus;
  recipe: ShareRecipe;
  detail: string;
  httpStatus?: number;
  retryAfterSeconds?: number;
  payloadBytes?: number;
}

export interface ShareTotalsInput {
  totalRequests: number;
  totalPromptTokens: number;
  totalOutputTokens: number;
  totalPremiumRequests?: number;
}

export interface ShareModelInput {
  modelId: string;
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  premiumRequests?: number;
}

export type ShareActionType =
  | 'tool_call'
  | 'terminal_command'
  | 'file_edit'
  | 'diff_apply'
  | 'review_comment';

export interface ShareActionInput {
  type: ShareActionType;
  count: number;
  filesTouched?: number;
}

export interface ShareDailyBucketInput {
  date: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  premiumRequests?: number;
}

export type ShareRepoRefInput =
  | {
    mode: 'github';
    githubRepo: string;
  }
  | {
    mode: 'alias';
    aliasLabel: string;
  }
  | {
    mode: 'redacted';
  };

export interface ShareRepoRunInput {
  repoRef: ShareRepoRefInput;
  totalRequests: number;
  totalPromptTokens: number;
  totalOutputTokens: number;
  totalPremiumRequests?: number;
  topModel?: string;
}

export interface SharePayloadInput {
  adapterVersion: string;
  observedAtIso: string;
  idempotencySeed: string;
  fields: ShareFieldConfig;
  totals: ShareTotalsInput;
  models: ShareModelInput[];
  actions: ShareActionInput[];
  dailyBuckets: ShareDailyBucketInput[];
  repoRef?: ShareRepoRefInput;
  repoRuns?: ShareRepoRunInput[];
}
