/** Aggregate parsed events into KPI totals, model stats, workspace stats, daily stats. */

import * as path from 'path';
import { ParsedFile, RequestEvent, KpiTotals, ModelStats, WorkspaceStats, DailyStats } from './types';
import { getMultiplier } from './config';
import { creditsForRequest, CreditRateMap } from './credits';
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
export function computeKpis(files: ParsedFile[], events: RequestEvent[], rates?: CreditRateMap): KpiTotals {
  const workspaceIds = new Set<string>();
  const sessionIds = new Set<string>();
  for (const pf of files) {
    workspaceIds.add(pf.workspaceId);
    if (pf.anchor) { sessionIds.add(pf.anchor.chatSessionId); }
  }

  let totalPromptTokens = 0;
  let totalOutputTokens = 0;
  let totalToolCallRounds = 0;
  let totalPremium = 0;
  let totalCredits = 0;
  for (const e of events) {
    totalPromptTokens += e.promptTokens;
    totalOutputTokens += e.outputTokens;
    totalToolCallRounds += e.toolCallRounds;
    const m = getMultiplier(e.modelId || '', e.timestampMs);
    if (e.promptTokens || e.outputTokens) {
      totalPremium += m;
    }
    totalCredits += creditsForRequest(e.modelId, e.promptTokens, e.outputTokens, rates);
  }

  return {
    totalRequests: events.length,
    totalPromptTokens,
    totalOutputTokens,
    totalToolCallRounds,
    totalPremium: Math.round(totalPremium * 100) / 100,
    totalCredits: Math.round(totalCredits * 100) / 100,
    workspaceCount: workspaceIds.size,
    sessionCount: sessionIds.size,
  };
}

/** Compute per-model stats. */
export function computeModelStats(events: RequestEvent[], rates?: CreditRateMap): ModelStats[] {
  const map = new Map<string, ModelStats>();
  for (const e of events) {
    const modelId = e.modelId || 'unknown';
    let s = map.get(modelId);
    if (!s) {
      s = { modelId, requests: 0, promptTokens: 0, outputTokens: 0, totalTokens: 0, premium: 0, credits: 0 };
      map.set(modelId, s);
    }
    s.requests++;
    s.promptTokens += e.promptTokens;
    s.outputTokens += e.outputTokens;
    s.totalTokens += e.promptTokens + e.outputTokens;
    if (e.promptTokens || e.outputTokens) {
      s.premium += getMultiplier(modelId, e.timestampMs);
    }
    s.credits += creditsForRequest(e.modelId, e.promptTokens, e.outputTokens, rates);
  }
  return [...map.values()].sort((a, b) => b.requests - a.requests);
}

/** Compute per-workspace stats. */
export function computeWorkspaceStats(files: ParsedFile[], events: RequestEvent[], rates?: CreditRateMap): WorkspaceStats[] {
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
    let promptTokens = 0, outputTokens = 0, premium = 0, credits = 0;
    const modelCounts = new Map<string, number>();

    for (const e of wsEvents) {
      promptTokens += e.promptTokens;
      outputTokens += e.outputTokens;
      if (e.promptTokens || e.outputTokens) {
        premium += getMultiplier(e.modelId || '', e.timestampMs);
      }
      credits += creditsForRequest(e.modelId, e.promptTokens, e.outputTokens, rates);
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
      credits: Math.round(credits * 100) / 100,
      topModel,
    });
  }

  return results.sort((a, b) => b.requests - a.requests);
}

/** Compute daily aggregation. */
export function computeDailyStats(events: RequestEvent[], rates?: CreditRateMap): DailyStats[] {
  const map = new Map<string, DailyStats>();
  const sessionsByDate = new Map<string, Set<string>>();
  for (const e of events) {
    if (!e.timestampMs) { continue; }
    const d = new Date(e.timestampMs);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    let s = map.get(key);
    if (!s) {
      s = {
        date: key,
        promptTokens: 0,
        outputTokens: 0,
        requests: 0,
        toolCallRounds: 0,
        premium: 0,
        credits: 0,
        sessions: 0,
      };
      map.set(key, s);
      sessionsByDate.set(key, new Set<string>());
    }
    s.promptTokens += e.promptTokens;
    s.outputTokens += e.outputTokens;
    s.requests++;
    s.toolCallRounds += e.toolCallRounds;
    if (e.promptTokens || e.outputTokens) {
      s.premium += getMultiplier(e.modelId || '', e.timestampMs);
    }
    s.credits += creditsForRequest(e.modelId, e.promptTokens, e.outputTokens, rates);
    if (e.chatSessionId) {
      sessionsByDate.get(key)?.add(e.chatSessionId);
    }
  }
  for (const [key, s] of map) {
    s.premium = Math.round(s.premium * 100) / 100;
    s.credits = Math.round(s.credits * 100) / 100;
    s.sessions = sessionsByDate.get(key)?.size ?? 0;
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}
