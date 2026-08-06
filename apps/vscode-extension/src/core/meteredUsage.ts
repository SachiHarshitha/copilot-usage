import * as fs from 'fs/promises';
import * as path from 'path';
import {
  KpiTotals,
  MeteredConfidence,
  MeteredDailyStat,
  MeteredModelStat,
  MeteredParsedFile,
  MeteredRound,
  MeteredTotals,
  ReconciliationStats,
  WorkspaceInfo,
} from './types';

const NANO_AIU_PER_CREDIT = 1_000_000_000;
const PARTIAL_COVERAGE_FLOOR = 0.1;

interface MeteredFileCacheEntry {
  mtimeMs: number;
  size: number;
  parsed: MeteredParsedFile;
}

const meteredFileCache = new Map<string, MeteredFileCacheEntry>();

function safeObj(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function firstNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function safeDiv(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return 0;
  }
  return numerator / denominator;
}

function normalizeMeteredModel(raw: string | undefined): string | undefined {
  if (!raw) {
    return undefined;
  }

  // Convert version markers like "4-8" to "4.8" even when a suffix follows,
  // e.g. "claude-opus-4-8-fast" -> "claude-opus-4.8-fast".
  const normalized = raw.replace(/(?<=-\d+)-(\d+)(?=-|$)/, '.$1');

  if (normalized.startsWith('copilot/')) {
    return normalized;
  }

  // External/custom endpoints can include explicit namespaces and should not be rewritten.
  if (normalized.includes('/')) {
    return normalized;
  }

  return `copilot/${normalized}`;
}

function parseMeteredObject(
  obj: Record<string, unknown>,
  workspaceId: string,
  chatSessionId: string,
): MeteredRound | 'user_message' | undefined {
  const type = str(obj.type);
  if (type === 'user_message') {
    return 'user_message';
  }
  if (type !== 'llm_request') {
    return undefined;
  }

  const attrs = safeObj(obj.attrs);
  if (!attrs) {
    return undefined;
  }

  const modelRaw = str(attrs.model) || str(attrs.modelId) || str(attrs.resolvedModel);
  const inputTokens = firstNumber(attrs.inputTokens, attrs.promptTokens, attrs.input_tokens, attrs.prompt_tokens) || 0;
  const outputTokens = firstNumber(attrs.outputTokens, attrs.completionTokens, attrs.output_tokens, attrs.completion_tokens) || 0;
  const cachedTokens = firstNumber(attrs.cachedTokens, attrs.cached_tokens) || 0;
  const nanoAiu = firstNumber(attrs.copilotUsageNanoAiu);
  const hasCredits = typeof nanoAiu === 'number';

  const timestampRaw = firstNumber(obj.ts);
  const timestampMs = typeof timestampRaw === 'number' ? timestampRaw : undefined;

  return {
    chatSessionId,
    workspaceId,
    modelId: normalizeMeteredModel(modelRaw),
    timestampMs,
    inputTokens,
    outputTokens,
    cachedTokens,
    hasCredits,
    credits: hasCredits ? nanoAiu / NANO_AIU_PER_CREDIT : 0,
  };
}

export function parseMeteredLine(
  line: string,
  workspaceId: string,
  chatSessionId: string,
): MeteredRound | 'user_message' | undefined {
  if (!line || line.length < 8) {
    return undefined;
  }

  let obj: unknown;
  try {
    obj = JSON.parse(line);
  } catch {
    return undefined;
  }

  const record = safeObj(obj);
  if (!record) {
    return undefined;
  }
  return parseMeteredObject(record, workspaceId, chatSessionId);
}

export async function parseMeteredFile(filePath: string, workspaceId: string): Promise<MeteredParsedFile> {
  let stat: { mtimeMs: number; size: number } | undefined;
  try {
    const fileStat = await fs.stat(filePath);
    stat = { mtimeMs: Number(fileStat.mtimeMs) || 0, size: fileStat.size };
  } catch {
    // Let readFile surface the eventual IO error below with a consistent message.
  }

  const cached = stat ? meteredFileCache.get(filePath) : undefined;
  if (cached && cached.mtimeMs === stat!.mtimeMs && cached.size === stat!.size) {
    return {
      ...cached.parsed,
      rounds: [...cached.parsed.rounds],
    };
  }

  const chatSessionId = path.basename(path.dirname(filePath));
  const text = await fs.readFile(filePath, 'utf8');
  const lines = text.split(/\r?\n/);
  const rounds: MeteredRound[] = [];

  let userMessages = 0;
  let copilotVersion: string | undefined;

  for (const line of lines) {
    if (!line || line.length < 8) {
      continue;
    }

    let obj: unknown;
    try {
      obj = JSON.parse(line);
    } catch {
      // Active debug logs can end with a partial/truncated line while being appended.
      continue;
    }

    const record = safeObj(obj);
    if (!record) {
      continue;
    }

    if (!copilotVersion && str(record.type) === 'session_start') {
      const attrs = safeObj(record.attrs);
      copilotVersion = str(attrs?.copilotVersion) || copilotVersion;
    }

    const parsed = parseMeteredObject(record, workspaceId, chatSessionId);
    if (parsed === 'user_message') {
      userMessages += 1;
    } else if (parsed) {
      rounds.push(parsed);
    }
  }

  const parsed: MeteredParsedFile = {
    sourcePath: filePath,
    workspaceId,
    chatSessionId,
    copilotVersion,
    rounds,
    userMessages,
  };

  if (stat) {
    meteredFileCache.set(filePath, {
      mtimeMs: stat.mtimeMs,
      size: stat.size,
      parsed,
    });
  }

  return parsed;
}

export async function parseAllMeteredFiles(workspaces: WorkspaceInfo[]): Promise<MeteredParsedFile[]> {
  const files: MeteredParsedFile[] = [];

  for (const ws of workspaces) {
    const debugFiles = ws.debugLogFiles || [];
    for (const filePath of debugFiles) {
      files.push(await parseMeteredFile(filePath, ws.workspaceId));
    }
  }

  return files;
}

export function flattenMeteredFiles(
  files: MeteredParsedFile[],
): { rounds: MeteredRound[]; userMessages: number; copilotVersions: string[] } {
  const rounds: MeteredRound[] = [];
  let userMessages = 0;
  const versions = new Set<string>();

  for (const file of files) {
    rounds.push(...file.rounds);
    userMessages += file.userMessages;
    if (file.copilotVersion) {
      versions.add(file.copilotVersion);
    }
  }

  return {
    rounds,
    userMessages,
    copilotVersions: [...versions].sort((a, b) => a.localeCompare(b)),
  };
}

export function filterMeteredByStartMs(rounds: MeteredRound[], startMs?: number): MeteredRound[] {
  if (startMs === undefined) {
    return rounds;
  }
  return rounds.filter(r => typeof r.timestampMs === 'number' && r.timestampMs >= startMs);
}

export function aggregateMetered(
  rounds: MeteredRound[],
  userMessages: number,
  copilotVersions: string[],
): MeteredTotals {
  let inputTokens = 0;
  let outputTokens = 0;
  let cachedTokens = 0;
  let credits = 0;
  let roundsWithCredits = 0;

  for (const round of rounds) {
    inputTokens += round.inputTokens;
    outputTokens += round.outputTokens;
    cachedTokens += round.cachedTokens;
    credits += round.credits;
    if (round.hasCredits) {
      roundsWithCredits += 1;
    }
  }

  return {
    rounds: rounds.length,
    userMessages,
    inputTokens,
    outputTokens,
    cachedTokens,
    credits: round2(credits),
    roundsWithCredits,
    coverage: round4(safeDiv(roundsWithCredits, rounds.length)),
    copilotVersions: [...copilotVersions],
  };
}

export function computeMeteredModelStats(rounds: MeteredRound[]): MeteredModelStat[] {
  const byModel = new Map<string, MeteredModelStat>();

  for (const round of rounds) {
    const modelId = round.modelId || 'unknown';
    const current = byModel.get(modelId) || {
      modelId,
      rounds: 0,
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 0,
      credits: 0,
      roundsWithCredits: 0,
      coverage: 0,
    };

    current.rounds += 1;
    current.inputTokens += round.inputTokens;
    current.outputTokens += round.outputTokens;
    current.cachedTokens += round.cachedTokens;
    current.credits += round.credits;
    if (round.hasCredits) {
      current.roundsWithCredits += 1;
    }

    byModel.set(modelId, current);
  }

  const rows = [...byModel.values()].map(stat => ({
    ...stat,
    credits: round2(stat.credits),
    coverage: round4(safeDiv(stat.roundsWithCredits, stat.rounds)),
  }));

  return rows.sort((a, b) => b.rounds - a.rounds || b.credits - a.credits);
}

export function computeMeteredDaily(rounds: MeteredRound[]): MeteredDailyStat[] {
  const byDay = new Map<string, MeteredDailyStat>();

  for (const round of rounds) {
    if (typeof round.timestampMs !== 'number') {
      continue;
    }
    const d = new Date(round.timestampMs);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const current = byDay.get(key) || {
      date: key,
      rounds: 0,
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 0,
      credits: 0,
      roundsWithCredits: 0,
      coverage: 0,
    };

    current.rounds += 1;
    current.inputTokens += round.inputTokens;
    current.outputTokens += round.outputTokens;
    current.cachedTokens += round.cachedTokens;
    current.credits += round.credits;
    if (round.hasCredits) {
      current.roundsWithCredits += 1;
    }

    byDay.set(key, current);
  }

  const rows = [...byDay.values()].map(stat => ({
    ...stat,
    credits: round2(stat.credits),
    coverage: round4(safeDiv(stat.roundsWithCredits, stat.rounds)),
  }));

  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

export function resolveMeteredConfidence(
  coverage: number,
  minCoverage: number,
): MeteredConfidence {
  if (coverage >= minCoverage) {
    return 'exact';
  }
  if (coverage >= PARTIAL_COVERAGE_FLOOR) {
    return 'partial';
  }
  return 'unavailable';
}

export function reconcileUsage(
  kpis: KpiTotals,
  metered: MeteredTotals,
  minCoverage = 0.95,
): ReconciliationStats {
  const visibleRequests = Math.max(0, kpis.totalRequests);
  const visibleTokens = Math.max(0, kpis.totalPromptTokens + kpis.totalOutputTokens);
  const meteredTokens = Math.max(0, metered.inputTokens + metered.outputTokens);
  const estimatedCredits = round2(kpis.totalCredits);
  const meteredCredits = round2(metered.credits);

  return {
    visibleRequests,
    meteredRounds: metered.rounds,
    roundsPerRequest: safeDiv(metered.rounds, visibleRequests),
    visibleTokens,
    meteredTokens,
    tokenAmplification: safeDiv(meteredTokens, visibleTokens),
    estimatedCredits,
    meteredCredits,
    creditDelta: round2(meteredCredits - estimatedCredits),
    coverage: metered.coverage,
    confidence: resolveMeteredConfidence(metered.coverage, minCoverage),
  };
}
