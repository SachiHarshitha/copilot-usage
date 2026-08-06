/** Shared types for the Copilot Usage extension. */

export interface SessionAnchor {
  chatSessionId: string;
  creationDate?: number;   // epoch ms
  modelId?: string;
  modelName?: string;
  multiplierRaw?: string;  // e.g. "3x"
}

export interface RequestEvent {
  chatSessionId: string;
  requestIndex: number;
  requestId?: string;
  modelId?: string;
  timestampMs?: number;
  promptTokens: number;
  outputTokens: number;
  toolCallRounds: number;
  tokensEstimated: boolean;
  workspaceId?: string;
  workspacePath?: string;
  evidencePaths?: string[];
}

export interface ParsedFile {
  sourcePath: string;
  workspaceId: string;
  workspacePath: string;
  dataSource: 'jsonl' | 'legacy_json';
  anchor?: SessionAnchor;
  requests: RequestEvent[];
}

export interface WorkspaceInfo {
  workspaceId: string;
  workspacePath: string;
  referencedFolders?: string[];  // folder paths listed in a multi-root workspace.json
  sessionFiles: string[];  // absolute paths
  debugLogFiles?: string[];  // absolute paths to GitHub.copilot-chat/debug-logs/*/main.jsonl
}

export interface KpiTotals {
  totalRequests: number;
  totalPromptTokens: number;
  totalOutputTokens: number;
  totalToolCallRounds: number;
  totalPremium: number;
  totalCredits: number;
  workspaceCount: number;
  sessionCount: number;
}

export interface ModelStats {
  modelId: string;
  requests: number;
  promptTokens: number;
  outputTokens: number;
  totalTokens: number;
  premium: number;
  credits: number;
}

export interface WorkspaceStats {
  workspaceId: string;
  workspacePath: string;
  requests: number;
  promptTokens: number;
  outputTokens: number;
  premium: number;
  credits: number;
  topModel: string;
}

export interface DailyStats {
  date: string;           // YYYY-MM-DD
  promptTokens: number;
  outputTokens: number;
  requests: number;
  toolCallRounds: number;
  premium: number;
  credits: number;
  sessions: number;       // distinct chat sessions active on this date
}

export interface MeteredRound {
  chatSessionId: string;
  workspaceId: string;
  modelId?: string;
  timestampMs?: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  credits: number;
  hasCredits: boolean;
}

export interface MeteredParsedFile {
  sourcePath: string;
  workspaceId: string;
  chatSessionId: string;
  copilotVersion?: string;
  rounds: MeteredRound[];
  userMessages: number;
}

export interface MeteredTotals {
  rounds: number;
  userMessages: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  credits: number;
  roundsWithCredits: number;
  coverage: number;
  copilotVersions: string[];
}

export interface MeteredModelStat {
  modelId: string;
  rounds: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  credits: number;
  roundsWithCredits: number;
  coverage: number;
}

export interface MeteredDailyStat {
  date: string;
  rounds: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  credits: number;
  roundsWithCredits: number;
  coverage: number;
}

export type MeteredConfidence = 'exact' | 'partial' | 'unavailable';

export interface ReconciliationStats {
  visibleRequests: number;
  meteredRounds: number;
  roundsPerRequest: number;
  visibleTokens: number;
  meteredTokens: number;
  tokenAmplification: number;
  estimatedCredits: number;
  meteredCredits: number;
  creditDelta: number;
  coverage: number;
  confidence: MeteredConfidence;
}
