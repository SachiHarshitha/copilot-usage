/** JSONL and legacy JSON parser — ported from Python parser.py */

import * as fs from 'fs/promises';
import * as path from 'path';
import { ParsedFile, RequestEvent, SessionAnchor } from './types';
import { estimateTokens } from './config';

// ── Internal state while parsing a single file ──────────────────────────

interface ParseState {
  anchor?: SessionAnchor;
  requests: RequestEvent[];
  requestModels: Map<number, string>;
  requestIds: Map<number, string>;
  requestTimestamps: Map<number, number>;
  requestPromptTexts: Map<number, string>;
  requestEvidencePaths: Map<number, string[]>;
  requestPromptTokens: Map<number, number>;
  requestCompletionTokens: Map<number, number>;
  nextRequestIndex: number;
}

// ── Public API ──────────────────────────────────────────────────────────

export async function parseJsonl(
  filePath: string,
  workspaceId: string,
  workspacePath: string,
): Promise<ParsedFile> {
  const state: ParseState = {
    requests: [],
    requestModels: new Map(),
    requestIds: new Map(),
    requestTimestamps: new Map(),
    requestPromptTexts: new Map(),
    requestEvidencePaths: new Map(),
    requestPromptTokens: new Map(),
    requestCompletionTokens: new Map(),
    nextRequestIndex: 0,
  };

  let content: string;
  try {
    content = await fs.readFile(filePath, 'utf-8');
  } catch {
    return makeParsedFile(filePath, workspaceId, workspacePath, 'jsonl', state);
  }

  for (const raw of content.split('\n')) {
    if (!raw.trim()) { continue; }
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(raw);
    } catch {
      continue;
    }
    processLine(state, obj);
  }

  return finalize(filePath, workspaceId, workspacePath, 'jsonl', state);
}

export async function parseLegacyJson(
  filePath: string,
  workspaceId: string,
  workspacePath: string,
): Promise<ParsedFile> {
  const state: ParseState = {
    requests: [],
    requestModels: new Map(),
    requestIds: new Map(),
    requestTimestamps: new Map(),
    requestPromptTexts: new Map(),
    requestEvidencePaths: new Map(),
    requestPromptTokens: new Map(),
    requestCompletionTokens: new Map(),
    nextRequestIndex: 0,
  };

  let data: Record<string, unknown>;
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    data = JSON.parse(content);
  } catch {
    return makeParsedFile(filePath, workspaceId, workspacePath, 'legacy_json', state);
  }

  if (typeof data !== 'object' || data === null) {
    return makeParsedFile(filePath, workspaceId, workspacePath, 'legacy_json', state);
  }

  const sessionId = (data.sessionId as string) || path.basename(filePath, path.extname(filePath));
  const creationDate = data.creationDate as number | undefined;

  let modelId: string | undefined;
  const selected = data.selectedModel;
  if (typeof selected === 'object' && selected !== null) {
    const sel = selected as Record<string, unknown>;
    modelId = (sel.id as string) || (sel.identifier as string);
  }

  state.anchor = { chatSessionId: sessionId, creationDate, modelId };

  const requests = data.requests;
  if (!Array.isArray(requests)) {
    return finalize(filePath, workspaceId, workspacePath, 'legacy_json', state);
  }

  for (let idx = 0; idx < requests.length; idx++) {
    const req = requests[idx];
    if (typeof req !== 'object' || req === null) { continue; }

    const resp = safeObj(req.response);
    const result = safeObj(resp?.result);
    const md = safeObj(result?.metadata);
    const usage = safeObj(result?.usage);

    let promptTokens = readPromptTokenAliases(md, usage);
    let outputTokens = readOutputTokenAliases(md, usage);

    const summaryTokens = extractSummaryUsageTokens(md);
    if (!promptTokens) { promptTokens = summaryTokens.promptTokens; }
    if (!outputTokens) { outputTokens = summaryTokens.outputTokens; }

    const [promptText, respText] = extractLegacyText(req);
    const evidencePaths = uniquePaths([
      ...extractEvidencePathsFromText(promptText),
      ...extractEvidencePathsFromText(respText),
    ]);

    let estimated = false;
    if (!promptTokens || !outputTokens) {
      if (!promptTokens && promptText) {
        promptTokens = estimateTokens(promptText);
        estimated = true;
      }
      if (!outputTokens && respText) {
        outputTokens = estimateTokens(respText);
        estimated = true;
      }
    }

    const tcr = Array.isArray(md?.toolCallRounds) ? md!.toolCallRounds : [];
    const toolRounds = tcr.length;

    let timestampMs: number | undefined;
    const timings = safeObj(result?.timings);
    if (timings) {
      timestampMs = num(timings.requestSent) || num(timings.firstTokenReceived) || undefined;
    }
    if (timestampMs === undefined) { timestampMs = creationDate; }

    const reqModel = str(md?.modelId);

    state.requests.push({
      chatSessionId: sessionId,
      requestIndex: idx,
      modelId: reqModel || modelId,
      timestampMs,
      promptTokens,
      outputTokens,
      toolCallRounds: toolRounds,
      tokensEstimated: estimated,
      workspaceId,
      workspacePath,
      evidencePaths: evidencePaths.length > 0 ? evidencePaths : undefined,
    });
  }

  return finalize(filePath, workspaceId, workspacePath, 'legacy_json', state);
}

// ── JSONL line processing ───────────────────────────────────────────────

function processLine(state: ParseState, obj: Record<string, unknown>): void {
  const kind = obj.kind as number | undefined;
  const k = obj.k as unknown;
  const v = obj.v as unknown;

  if (kind === 0) {
    handleSessionAnchor(state, (v ?? obj) as Record<string, unknown>);
    return;
  }

  if (kind === 2 && Array.isArray(k) && k.length === 1 && k[0] === 'requests' && Array.isArray(v)) {
    handleNewRequests(state, v);
    return;
  }

  if (kind === 1 && Array.isArray(k) && k.length === 3 && k[0] === 'requests') {
    const requestIndex = k[1];
    const field = k[2];
    if (typeof requestIndex !== 'number') { return; }

    if (field === 'result' && typeof v === 'object' && v !== null) {
      handleResult(state, v as Record<string, unknown>, requestIndex);
      return;
    }

    if (
      field === 'promptTokens'
      || field === 'completionTokens'
      || field === 'inputTokens'
      || field === 'outputTokens'
    ) {
      handleRequestTokenUpdate(state, requestIndex, field, v);
    }
  }
}

function handleRequestTokenUpdate(
  state: ParseState,
  requestIndex: number,
  field: 'promptTokens' | 'completionTokens' | 'inputTokens' | 'outputTokens',
  value: unknown,
): void {
  const tokenCount = num(value);
  if (tokenCount === undefined) { return; }

  if (field === 'promptTokens' || field === 'inputTokens') {
    state.requestPromptTokens.set(requestIndex, tokenCount);
  } else {
    state.requestCompletionTokens.set(requestIndex, tokenCount);
  }
}

function handleSessionAnchor(state: ParseState, v: Record<string, unknown>): void {
  const sid = str(v.sessionId) || '';
  const anchor: SessionAnchor = {
    chatSessionId: sid,
    creationDate: num(v.creationDate),
  };

  const inputState = safeObj(v.inputState);
  if (inputState) {
    const selected = safeObj(inputState.selectedModel);
    if (selected) {
      anchor.modelId = str(selected.identifier);
      const md = safeObj(selected.metadata);
      if (md) {
        anchor.modelName = str(md.name);
        anchor.multiplierRaw = str(md.multiplier);
      }
    }
  }
  state.anchor = anchor;
}

function handleNewRequests(state: ParseState, v: unknown[]): void {
  for (const item of v) {
    if (typeof item !== 'object' || item === null) { continue; }
    const obj = item as Record<string, unknown>;
    const idx = state.nextRequestIndex++;

    const modelId = str(obj.modelId);
    const requestId = str(obj.requestId);
    const timestamp = num(obj.timestamp);
    const promptText = extractJsonlPromptText(obj);
    const evidencePaths = uniquePaths([
      ...extractEvidencePathsFromObject(obj),
      ...extractEvidencePathsFromText(promptText || ''),
    ]);
    if (modelId) { state.requestModels.set(idx, modelId); }
    if (requestId) { state.requestIds.set(idx, requestId); }
    if (timestamp) { state.requestTimestamps.set(idx, timestamp); }
    if (promptText) { state.requestPromptTexts.set(idx, promptText); }
    if (evidencePaths.length > 0) { state.requestEvidencePaths.set(idx, evidencePaths); }
  }
}

function handleResult(state: ParseState, v: Record<string, unknown>, requestIndex: number): void {
  const md = safeObj(v.metadata) ?? {};
  const usage = safeObj(v.usage) ?? {};

  let promptTokens = readPromptTokenAliases(md, usage);
  let outputTokens = readOutputTokenAliases(md, usage);

  const summaryTokens = extractSummaryUsageTokens(md);
  if (!promptTokens) { promptTokens = summaryTokens.promptTokens; }
  if (!outputTokens) { outputTokens = summaryTokens.outputTokens; }

  if (!promptTokens) {
    promptTokens = state.requestPromptTokens.get(requestIndex) || 0;
  }
  if (!outputTokens) {
    outputTokens = state.requestCompletionTokens.get(requestIndex) || 0;
  }

  const tcr = Array.isArray(md.toolCallRounds) ? md.toolCallRounds : [];
  const toolRounds = tcr.length;

  let timestampMs: number | undefined;
  const timings = safeObj(v.timings);
  if (timings) {
    timestampMs = num(timings.requestSent) || num(timings.firstTokenReceived) || undefined;
  }
  if (!timestampMs && tcr.length > 0) {
    const first = typeof tcr[0] === 'object' && tcr[0] !== null ? tcr[0] : {};
    timestampMs = num(first.timestamp) || undefined;
  }
  if (!timestampMs) {
    timestampMs = state.requestTimestamps.get(requestIndex);
  }
  if (!timestampMs) {
    // Fall back to session creation date so date-range filters can still bucket this event
    timestampMs = state.anchor?.creationDate;
  }

  const chatSessionId = state.anchor?.chatSessionId || '';

  // resolvedModel uses dashes and no prefix (e.g. "claude-opus-4-7") — normalise to "copilot/claude-opus-4.7"
  const rawResolved = str(md.resolvedModel);
  const resolvedModel = rawResolved
    ? 'copilot/' + rawResolved.replace(/(?<=-\d+)-(\d+)$/, '.$1')  // only last -minor patch: dash → dot
    : undefined;

  const evidencePaths = uniquePaths([
    ...(state.requestEvidencePaths.get(requestIndex) || []),
    ...extractEvidencePathsFromObject(v),
  ]);
  if (evidencePaths.length > 0) {
    state.requestEvidencePaths.set(requestIndex, evidencePaths);
  }

  state.requests.push({
    chatSessionId,
    requestIndex,
    requestId: state.requestIds.get(requestIndex),
    modelId: str(md.modelId) || resolvedModel,
    timestampMs,
    promptTokens,
    outputTokens,
    toolCallRounds: toolRounds,
    tokensEstimated: false,
    evidencePaths: evidencePaths.length > 0 ? evidencePaths : undefined,
  });
}

// ── Finalization ────────────────────────────────────────────────────────

function finalize(
  filePath: string,
  workspaceId: string,
  workspacePath: string,
  dataSource: 'jsonl' | 'legacy_json',
  state: ParseState,
): ParsedFile {
  const stem = path.basename(filePath, path.extname(filePath));

  if (!state.anchor) {
    state.anchor = { chatSessionId: stem };
  } else if (!state.anchor.chatSessionId) {
    state.anchor.chatSessionId = stem;
  }

  // Back-fill model_id from request-append lines
  for (const req of state.requests) {
    if (!req.chatSessionId) { req.chatSessionId = state.anchor.chatSessionId; }
    req.workspaceId = workspaceId;
    req.workspacePath = workspacePath;
    if (!req.modelId) { req.modelId = state.requestModels.get(req.requestIndex); }
    if (!req.modelId && state.anchor) { req.modelId = state.anchor.modelId; }
    if (!req.requestId) { req.requestId = state.requestIds.get(req.requestIndex); }
    if (!req.promptTokens) {
      req.promptTokens = state.requestPromptTokens.get(req.requestIndex) || 0;
    }
    if (!req.outputTokens) {
      req.outputTokens = state.requestCompletionTokens.get(req.requestIndex) || 0;
    }
    if (!req.promptTokens) {
      const promptText = state.requestPromptTexts.get(req.requestIndex);
      if (promptText) {
        req.promptTokens = estimateTokens(promptText);
        if (req.promptTokens > 0) {
          req.tokensEstimated = true;
        }
      }
    }

    const evidencePaths = uniquePaths([
      ...(req.evidencePaths || []),
      ...(state.requestEvidencePaths.get(req.requestIndex) || []),
    ]);
    if (evidencePaths.length > 0) {
      req.evidencePaths = evidencePaths;
    }
  }

  return makeParsedFile(filePath, workspaceId, workspacePath, dataSource, state);
}

function makeParsedFile(
  filePath: string,
  workspaceId: string,
  workspacePath: string,
  dataSource: 'jsonl' | 'legacy_json',
  state: ParseState,
): ParsedFile {
  return {
    sourcePath: filePath,
    workspaceId,
    workspacePath,
    dataSource,
    anchor: state.anchor,
    requests: state.requests,
  };
}

// ── Legacy text extraction ──────────────────────────────────────────────

function extractJsonlPromptText(req: Record<string, unknown>): string | undefined {
  const promptParts: string[] = [];

  const msg = safeObj(req.message);
  if (msg) {
    const text = str(msg.text);
    if (text) { promptParts.push(text); }

    if (Array.isArray(msg.parts)) {
      for (const part of msg.parts) {
        if (typeof part !== 'object' || part === null) { continue; }
        const partText = str((part as Record<string, unknown>).text);
        if (partText) { promptParts.push(partText); }
      }
    }
  }

  const vd = safeObj(req.variableData);
  if (vd && Array.isArray(vd.variables)) {
    for (const variable of vd.variables) {
      if (typeof variable !== 'object' || variable === null) { continue; }
      const value = (variable as Record<string, unknown>).value;
      if (typeof value === 'string' && value) { promptParts.push(value); }
    }
  }

  const promptText = promptParts.join('\n').trim();
  return promptText || undefined;
}

const FILE_URI_RE = /file:\/\/\/[^\s"'`<>\])]+/gi;
const WINDOWS_PATH_RE = /[A-Za-z]:[\\/][^\s"'`<>\])]+/g;

function extractEvidencePathsFromText(text: string): string[] {
  if (!text) {
    return [];
  }

  const rawMatches: string[] = [];
  for (const match of text.match(FILE_URI_RE) || []) {
    rawMatches.push(match);
  }
  for (const match of text.match(WINDOWS_PATH_RE) || []) {
    rawMatches.push(match);
  }

  return uniquePaths(rawMatches.map(value => normalizeEvidencePath(value)).filter((v): v is string => Boolean(v)));
}

function extractEvidencePathsFromObject(value: unknown, maxDepth = 4, maxNodes = 200): string[] {
  const out: string[] = [];
  let visited = 0;

  const walk = (node: unknown, depth: number): void => {
    if (visited >= maxNodes || depth > maxDepth) {
      return;
    }
    visited++;

    if (typeof node === 'string') {
      out.push(...extractEvidencePathsFromText(node));
      return;
    }

    if (!node || typeof node !== 'object') {
      return;
    }

    if (Array.isArray(node)) {
      for (const item of node) {
        walk(item, depth + 1);
      }
      return;
    }

    const obj = node as Record<string, unknown>;
    for (const val of Object.values(obj)) {
      walk(val, depth + 1);
    }
  };

  walk(value, 0);
  return uniquePaths(out);
}

function normalizeEvidencePath(raw: string): string | undefined {
  const trimmed = raw.trim().replace(/[),.;\]]+$/g, '');
  if (!trimmed) {
    return undefined;
  }

  if (/^file:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      if (url.protocol !== 'file:') {
        return undefined;
      }
      let p = decodeURIComponent(url.pathname);
      if (/^\/[A-Za-z]:/.test(p)) {
        p = p.slice(1);
      }
      return normalizePath(p);
    } catch {
      return undefined;
    }
  }

  if (/^[A-Za-z]:[\\/]/.test(trimmed) || trimmed.startsWith('/')) {
    return normalizePath(trimmed);
  }

  return undefined;
}

function normalizePath(p: string): string {
  let out = p.replace(/\\/g, '/').replace(/\/+$/, '');
  if (/^[A-Za-z]:/.test(out)) {
    out = out[0].toLowerCase() + out.slice(1);
  }
  return out;
}

function uniquePaths(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    out.push(value);
  }
  return out;
}

function readPromptTokenAliases(
  md?: Record<string, unknown>,
  usage?: Record<string, unknown>,
): number {
  return firstNumber(
    md?.promptTokens,
    md?.inputTokens,
    md?.promptTokenCount,
    md?.inputTokenCount,
    md?.prompt_tokens,
    md?.input_tokens,
    md?.prompt_token_count,
    md?.input_token_count,
    usage?.promptTokens,
    usage?.inputTokens,
    usage?.promptTokenCount,
    usage?.inputTokenCount,
    usage?.prompt_tokens,
    usage?.input_tokens,
    usage?.prompt_token_count,
    usage?.input_token_count,
  ) || 0;
}

function readOutputTokenAliases(
  md?: Record<string, unknown>,
  usage?: Record<string, unknown>,
): number {
  return firstNumber(
    md?.outputTokens,
    md?.completionTokens,
    md?.completionTokenCount,
    md?.outputTokenCount,
    md?.output_tokens,
    md?.completion_tokens,
    md?.completion_token_count,
    md?.output_token_count,
    usage?.outputTokens,
    usage?.completionTokens,
    usage?.completionTokenCount,
    usage?.outputTokenCount,
    usage?.output_tokens,
    usage?.completion_tokens,
    usage?.completion_token_count,
    usage?.output_token_count,
  ) || 0;
}

function extractSummaryUsageTokens(md?: Record<string, unknown>): { promptTokens: number; outputTokens: number } {
  if (!md || !Array.isArray(md.summaries)) {
    return { promptTokens: 0, outputTokens: 0 };
  }

  let promptTokens = 0;
  let outputTokens = 0;

  for (const summary of md.summaries) {
    if (typeof summary !== 'object' || summary === null) { continue; }
    const usage = safeObj((summary as Record<string, unknown>).usage);
    if (!usage) { continue; }

    promptTokens += readPromptTokenAliases(undefined, usage);
    outputTokens += readOutputTokenAliases(undefined, usage);
  }

  return { promptTokens, outputTokens };
}

function extractLegacyText(req: Record<string, unknown>): [string, string] {
  const promptParts: string[] = [];
  const msg = safeObj(req.message);
  if (msg) {
    const text = str(msg.text);
    if (text) { promptParts.push(text); }
  }
  const vd = safeObj(req.variableData);
  if (vd && Array.isArray(vd.variables)) {
    for (const v of vd.variables) {
      if (typeof v === 'object' && v !== null) {
        const val = str((v as Record<string, unknown>).value);
        if (val) { promptParts.push(val); }
      }
    }
  }

  const respParts: string[] = [];
  const resp = req.response;
  if (Array.isArray(resp)) {
    for (const item of resp) {
      if (typeof item !== 'object' || item === null) { continue; }
      const obj = item as Record<string, unknown>;
      const val = obj.value;
      if (typeof val === 'string' && val) { respParts.push(val); }
      else if (typeof val === 'object' && val !== null) {
        const content = str((val as Record<string, unknown>).content);
        if (content) { respParts.push(content); }
      }
      const content = str(obj.content);
      if (content) { respParts.push(content); }
    }
  } else if (typeof resp === 'object' && resp !== null) {
    const result = safeObj((resp as Record<string, unknown>).result);
    if (result) {
      const val = str(result.value);
      if (val) { respParts.push(val); }
    }
  }

  return [promptParts.join('\n'), respParts.join('\n')];
}

// ── Helpers ─────────────────────────────────────────────────────────────

function safeObj(v: unknown): Record<string, unknown> | undefined {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
    ? v as Record<string, unknown>
    : undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v ? v : undefined;
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' ? v : undefined;
}

function firstNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === 'number') {
      return value;
    }
  }
  return undefined;
}
