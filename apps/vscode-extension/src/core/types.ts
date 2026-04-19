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
  sessionFiles: string[];  // absolute paths
}

export interface KpiTotals {
  totalRequests: number;
  totalPromptTokens: number;
  totalOutputTokens: number;
  totalToolCallRounds: number;
  totalPremium: number;
  workspaceCount: number;
  sessionCount: number;
}

export interface ModelStats {
  modelId: string;
  requests: number;
  totalTokens: number;
  premium: number;
}

export interface WorkspaceStats {
  workspaceId: string;
  workspacePath: string;
  requests: number;
  promptTokens: number;
  outputTokens: number;
  premium: number;
  topModel: string;
}

export interface DailyStats {
  date: string;           // YYYY-MM-DD
  promptTokens: number;
  outputTokens: number;
  requests: number;
}
