/** Aggregate parsed events into KPI totals, model stats, workspace stats, daily stats. */

import * as path from 'path';
import { ParsedFile, RequestEvent, KpiTotals, ModelStats, WorkspaceStats, DailyStats } from './types';
import { getMultiplier } from './config';
import { parseJsonl, parseLegacyJson } from './parser';
import { WorkspaceInfo } from './types';

/** Parse all files in a set of workspaces. */
export async function parseAllFiles(workspaces: WorkspaceInfo[]): Promise<ParsedFile[]> {
  const results: ParsedFile[] = [];
  for (const ws of workspaces) {
    for (const filePath of ws.sessionFiles) {
      const ext = path.extname(filePath).toLowerCase();
      const pf = ext === '.json'
        ? await parseLegacyJson(filePath, ws.workspaceId, ws.workspacePath)
        : await parseJsonl(filePath, ws.workspaceId, ws.workspacePath);
      results.push(pf);
    }
  }
  return results;
}

/** Flatten all events from parsed files, deduplicating by event key. */
export function flattenEvents(files: ParsedFile[]): RequestEvent[] {
  const seen = new Map<string, RequestEvent>();
  for (const pf of files) {
    for (const req of pf.requests) {
      const key = `${req.chatSessionId}:${req.requestIndex}`;
      seen.set(key, req);  // last wins
    }
  }
  return [...seen.values()];
}

/** Compute KPI totals. */
export function computeKpis(files: ParsedFile[], events: RequestEvent[]): KpiTotals {
  const workspaceIds = new Set<string>();
  const sessionIds = new Set<string>();
  for (const pf of files) {
    workspaceIds.add(pf.workspaceId);
    if (pf.anchor) { sessionIds.add(pf.anchor.chatSessionId); }
  }

  let totalPromptTokens = 0;
  let totalOutputTokens = 0;
  let totalPremium = 0;
  for (const e of events) {
    totalPromptTokens += e.promptTokens;
    totalOutputTokens += e.outputTokens;
    const m = getMultiplier(e.modelId || '');
    if (e.promptTokens || e.outputTokens) {
      totalPremium += m;
    }
  }

  return {
    totalRequests: events.length,
    totalPromptTokens,
    totalOutputTokens,
    totalPremium: Math.round(totalPremium * 100) / 100,
    workspaceCount: workspaceIds.size,
    sessionCount: sessionIds.size,
  };
}

/** Compute per-model stats. */
export function computeModelStats(events: RequestEvent[]): ModelStats[] {
  const map = new Map<string, ModelStats>();
  for (const e of events) {
    const modelId = e.modelId || 'unknown';
    let s = map.get(modelId);
    if (!s) {
      s = { modelId, requests: 0, totalTokens: 0, premium: 0 };
      map.set(modelId, s);
    }
    s.requests++;
    s.totalTokens += e.promptTokens + e.outputTokens;
    if (e.promptTokens || e.outputTokens) {
      s.premium += getMultiplier(modelId);
    }
  }
  return [...map.values()].sort((a, b) => b.requests - a.requests);
}

/** Compute per-workspace stats. */
export function computeWorkspaceStats(files: ParsedFile[], events: RequestEvent[]): WorkspaceStats[] {
  // Group events by workspace
  const wsMap = new Map<string, { path: string; events: RequestEvent[] }>();
  const fileWsMap = new Map<string, string>(); // chatSessionId → workspaceId
  const fileWsPath = new Map<string, string>(); // workspaceId → workspacePath

  for (const pf of files) {
    fileWsPath.set(pf.workspaceId, pf.workspacePath);
    if (pf.anchor) {
      fileWsMap.set(pf.anchor.chatSessionId, pf.workspaceId);
    }
  }

  for (const e of events) {
    const wsId = fileWsMap.get(e.chatSessionId) || 'unknown';
    let entry = wsMap.get(wsId);
    if (!entry) {
      entry = { path: fileWsPath.get(wsId) || wsId, events: [] };
      wsMap.set(wsId, entry);
    }
    entry.events.push(e);
  }

  const results: WorkspaceStats[] = [];
  for (const [wsId, { path: wsPath, events: wsEvents }] of wsMap) {
    let promptTokens = 0, outputTokens = 0, premium = 0;
    const modelCounts = new Map<string, number>();

    for (const e of wsEvents) {
      promptTokens += e.promptTokens;
      outputTokens += e.outputTokens;
      if (e.promptTokens || e.outputTokens) {
        premium += getMultiplier(e.modelId || '');
      }
      const mid = e.modelId || 'unknown';
      modelCounts.set(mid, (modelCounts.get(mid) || 0) + 1);
    }

    let topModel = '–';
    let topCount = 0;
    for (const [mid, cnt] of modelCounts) {
      if (cnt > topCount) { topCount = cnt; topModel = mid; }
    }

    results.push({
      workspaceId: wsId,
      workspacePath: wsPath,
      requests: wsEvents.length,
      promptTokens,
      outputTokens,
      premium: Math.round(premium * 100) / 100,
      topModel,
    });
  }

  return results.sort((a, b) => b.requests - a.requests);
}

/** Compute daily aggregation. */
export function computeDailyStats(events: RequestEvent[]): DailyStats[] {
  const map = new Map<string, DailyStats>();
  for (const e of events) {
    if (!e.timestampMs) { continue; }
    const d = new Date(e.timestampMs);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    let s = map.get(key);
    if (!s) {
      s = { date: key, promptTokens: 0, outputTokens: 0, requests: 0 };
      map.set(key, s);
    }
    s.promptTokens += e.promptTokens;
    s.outputTokens += e.outputTokens;
    s.requests++;
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}
