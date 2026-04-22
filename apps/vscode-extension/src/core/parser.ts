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

    let promptTokens = num(md?.promptTokens) || num(usage?.promptTokens) || 0;
    let outputTokens = num(md?.outputTokens) || num(usage?.completionTokens) || 0;

    let estimated = false;
    if (!promptTokens || !outputTokens) {
      const [promptText, respText] = extractLegacyText(req);
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

  if (kind === 1 && Array.isArray(k) && k.length === 3 && k[0] === 'requests' && k[2] === 'result') {
    const requestIndex = k[1];
    if (typeof requestIndex === 'number' && typeof v === 'object' && v !== null) {
      handleResult(state, v as Record<string, unknown>, requestIndex);
    }
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
    if (modelId) { state.requestModels.set(idx, modelId); }
    if (requestId) { state.requestIds.set(idx, requestId); }
    if (timestamp) { state.requestTimestamps.set(idx, timestamp); }
  }
}

function handleResult(state: ParseState, v: Record<string, unknown>, requestIndex: number): void {
  const md = safeObj(v.metadata) ?? {};
  const usage = safeObj(v.usage) ?? {};

  const promptTokens = num(md.promptTokens) || num(usage.promptTokens) || 0;
  const outputTokens = num(md.outputTokens) || num(usage.completionTokens) || 0;

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

  const chatSessionId = state.anchor?.chatSessionId || '';

  // resolvedModel uses dashes and no prefix (e.g. "claude-opus-4-7") — normalise to "copilot/claude-opus-4.7"
  const rawResolved = str(md.resolvedModel);
  const resolvedModel = rawResolved
    ? 'copilot/' + rawResolved.replace(/(?<=-\d+)-(\d+)$/, '.$1')  // only last -minor patch: dash → dot
    : undefined;

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
    if (!req.modelId) { req.modelId = state.requestModels.get(req.requestIndex); }
    if (!req.modelId && state.anchor) { req.modelId = state.anchor.modelId; }
    if (!req.requestId) { req.requestId = state.requestIds.get(req.requestIndex); }
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
