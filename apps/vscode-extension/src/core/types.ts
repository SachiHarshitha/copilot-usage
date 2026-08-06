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
