/** PromptStreak share sync service with retry + jitter. */

import * as vscode from 'vscode';
import {
  AgentSnapshotSchema,
  findForbiddenFields,
} from '@copilot-usage/shared-schema';
import {
  discoverWorkspaces,
} from '../../core/discovery';
import {
  computeDailyStats,
  computeKpis,
  parseAllFiles,
  flattenEvents,
} from '../../core/aggregator';
import { RequestEvent } from '../../core/types';
import {
  appendShareHistory,
} from './history';
import {
  buildShareSnapshot,
} from './payload';
import {
  buildSignedUploadHeaders,
} from './uploadSigning';
import {
  loadShareSettings,
  saveShareSettings,
} from './settings';
import {
  clearDeviceToken,
  getDeviceToken,
  getOrCreateIdempotencySeed,
  loadShareHistory,
  saveShareHistory,
  setDeviceToken,
} from './storage';
import {
  ShareActionInput,
  ShareDailyBucketInput,
  ShareHistoryEntry,
  ShareHistoryStatus,
  ShareModelInput,
} from './types';

const BASE_RETRY_MS = 60 * 1000;
const MAX_RETRY_MS = 30 * 60 * 1000;

function toNonNegativeInt(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.floor(value);
}

function normalizeBaseUrl(raw: string): string {
  return raw.replace(/\/+$/, '');
}

function parseRetryAfterSeconds(raw: string | null): number | undefined {
  if (!raw) {
    return undefined;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return Math.floor(parsed);
}

function classifyTransient(status: number): boolean {
  return status === 429 || status >= 500;
}

function modelInputsFromEvents(events: RequestEvent[]): ShareModelInput[] {
  const map = new Map<string, ShareModelInput>();
  for (const event of events) {
    const id = event.modelId || 'unknown';
    const existing = map.get(id);
    if (existing) {
      existing.requestCount += 1;
      existing.inputTokens += toNonNegativeInt(event.promptTokens);
      existing.outputTokens += toNonNegativeInt(event.outputTokens);
      continue;
    }

    map.set(id, {
      modelId: id,
      requestCount: 1,
      inputTokens: toNonNegativeInt(event.promptTokens),
      outputTokens: toNonNegativeInt(event.outputTokens),
    });
  }
  return [...map.values()].sort((a, b) => b.requestCount - a.requestCount);
}

function actionInputsFromEvents(events: RequestEvent[]): ShareActionInput[] {
  const totalToolRounds = events.reduce((sum, event) => sum + toNonNegativeInt(event.toolCallRounds), 0);
  if (totalToolRounds === 0) {
    return [];
  }

  return [{
    type: 'tool_call',
    count: totalToolRounds,
    filesTouched: 0,
  }];
}

interface SendOutcome {
  entry: ShareHistoryEntry;
  transientFailure: boolean;
  retryAfterSeconds?: number;
}

export interface UnlinkDeviceResult {
  remoteRevoked: boolean;
  detail?: string;
}

export class PromptstreakShareSyncService implements vscode.Disposable {
  private timer: NodeJS.Timeout | undefined;
  private inFlight = false;
  private retryAttempt = 0;
  private disposed = false;
  private listeners = new Set<() => void>();

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly adapterVersion: string,
  ) {}

  start(): void {
    this.scheduleNext(2000);
  }

  async sendNow(reason = 'manual'): Promise<ShareHistoryEntry> {
    const outcome = await this.performSend(reason);
    this.notify();
    return outcome.entry;
  }

  onDidUpdate(listener: () => void): vscode.Disposable {
    this.listeners.add(listener);
    return new vscode.Disposable(() => {
      this.listeners.delete(listener);
    });
  }

  async unlinkDeviceToken(baseUrl: string): Promise<UnlinkDeviceResult> {
    const token = await getDeviceToken(this.context);

    if (!token) {
      await clearDeviceToken(this.context);
      this.notify();
      return { remoteRevoked: true };
    }

    let remoteRevoked = false;
    let detail: string | undefined;

    try {
      const response = await fetch(`${normalizeBaseUrl(baseUrl)}/api/connect/revoke`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      // 401 means the token is already unusable server-side.
      if (response.ok || response.status === 401) {
        remoteRevoked = true;
      } else {
        const errorText = await response.text().catch(() => '');
        const trimmed = errorText.length > 120 ? `${errorText.slice(0, 120)}...` : errorText;
        detail = `Remote revoke returned HTTP ${response.status}${trimmed ? `: ${trimmed}` : ''}`;
      }
    } catch (error) {
      detail = `Remote revoke failed: ${String(error)}`;
    }

    await clearDeviceToken(this.context);
    this.notify();
    return { remoteRevoked, detail };
  }

  async linkDeviceTokenFromClipboard(): Promise<boolean> {
    const token = (await vscode.env.clipboard.readText()).trim();
    const valid = /^[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{24,}$/.test(token);
    if (!valid) {
      return false;
    }

    await this.setLinkedToken(token);
    return true;
  }

  async setLinkedToken(token: string): Promise<void> {
    const settings = loadShareSettings(this.context);
    settings.linkedAtIso = new Date().toISOString();
    await saveShareSettings(this.context, settings);
    await setDeviceToken(this.context, token);
    this.notify();
  }

  refreshSchedule(): void {
    this.retryAttempt = 0;
    this.scheduleNext(1000);
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    this.listeners.clear();
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        // Listener errors should not break scheduling.
      }
    }
  }

  private scheduleNext(delayMs: number): void {
    if (this.disposed) {
      return;
    }
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      void this.tick();
    }, Math.max(250, delayMs));
  }

  private async tick(): Promise<void> {
    if (this.disposed) {
      return;
    }

    const settings = loadShareSettings(this.context);
    const steadyMs = settings.autoSyncMinutes * 60 * 1000;

    if (!settings.enabled) {
      this.retryAttempt = 0;
      this.scheduleNext(steadyMs);
      return;
    }

    const outcome = await this.performSend('scheduled');
    this.notify();

    if (!outcome.transientFailure) {
      this.retryAttempt = 0;
      this.scheduleNext(steadyMs);
      return;
    }

    this.retryAttempt += 1;
    const exponential = Math.min(MAX_RETRY_MS, BASE_RETRY_MS * (2 ** (this.retryAttempt - 1)));
    const serverDelay = outcome.retryAfterSeconds ? outcome.retryAfterSeconds * 1000 : 0;
    const baseDelay = Math.max(exponential, serverDelay);
    const jitter = Math.floor(Math.random() * Math.max(1000, Math.floor(baseDelay * 0.2)));
    this.scheduleNext(baseDelay + jitter);
  }

  private async performSend(reason: string): Promise<SendOutcome> {
    if (this.inFlight) {
      return this.appendHistory('skipped', `Skipped ${reason} sync because another share is in progress.`, false);
    }

    this.inFlight = true;
    try {
      const settings = loadShareSettings(this.context);
      const token = await getDeviceToken(this.context);
      if (!token) {
        return this.appendHistory('failed', 'Device is not linked yet. Sign in and link before sharing.', false);
      }

      const workspaces = await discoverWorkspaces();
      const parsed = workspaces.length > 0 ? await parseAllFiles(workspaces) : [];
      const events = flattenEvents(parsed);
      const kpis = computeKpis(parsed, events);
      const daily = computeDailyStats(events);
      const modelInputs = modelInputsFromEvents(events);
      const actionInputs = actionInputsFromEvents(events);
      const dailyBuckets: ShareDailyBucketInput[] = daily.map(d => ({
        date: d.date,
        requests: toNonNegativeInt(d.requests),
        inputTokens: toNonNegativeInt(d.promptTokens),
        outputTokens: toNonNegativeInt(d.outputTokens),
      }));

      const snapshot = buildShareSnapshot({
        adapterVersion: this.adapterVersion,
        observedAtIso: new Date().toISOString(),
        idempotencySeed: await getOrCreateIdempotencySeed(this.context),
        fields: settings.fields,
        totals: {
          totalRequests: toNonNegativeInt(kpis.totalRequests),
          totalPromptTokens: toNonNegativeInt(kpis.totalPromptTokens),
          totalOutputTokens: toNonNegativeInt(kpis.totalOutputTokens),
        },
        models: modelInputs,
        actions: actionInputs,
        dailyBuckets,
      });

      const forbidden = findForbiddenFields(snapshot, { allowList: new Set(['source']) });
      if (forbidden.length > 0) {
        return this.appendHistory('failed', `Blocked by forbidden field scan: ${forbidden.join(', ')}`, false);
      }

      const parsedSnapshot = AgentSnapshotSchema.safeParse(snapshot);
      if (!parsedSnapshot.success) {
        const firstIssue = parsedSnapshot.error.issues[0]?.message || 'unknown schema issue';
        return this.appendHistory('failed', `Local schema validation failed: ${firstIssue}`, false);
      }

      const raw = JSON.stringify(snapshot);
      const payloadBytes = Buffer.byteLength(raw, 'utf8');
      const signatureHeaders = buildSignedUploadHeaders({
        deviceToken: token,
        rawBody: raw,
      });

      if (!signatureHeaders) {
        return this.appendHistory('failed', 'Linked device token is malformed.', false);
      }

      const response = await fetch(`${normalizeBaseUrl(settings.promptstreakBaseUrl)}/api/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...signatureHeaders,
        },
        body: raw,
      });

      if (response.ok) {
        settings.lastSuccessfulSyncIso = new Date().toISOString();
        settings.lastSyncStatus = 'success';
        await saveShareSettings(this.context, settings);
        return this.appendHistory('success', `Shared successfully (${reason}).`, false, undefined, payloadBytes);
      }

      const retryAfter = parseRetryAfterSeconds(response.headers.get('Retry-After'));
      const responseBody = await response.text();
      const trimmed = responseBody.length > 120 ? `${responseBody.slice(0, 120)}...` : responseBody;
      settings.lastSyncStatus = `failed:${response.status}`;
      await saveShareSettings(this.context, settings);
      return this.appendHistory(
        'failed',
        `Upload failed (${response.status}): ${trimmed || 'no response body'}`,
        classifyTransient(response.status),
        response.status,
        payloadBytes,
        retryAfter,
      );
    } catch (error) {
      return this.appendHistory('failed', `Network/share error: ${String(error)}`, true);
    } finally {
      this.inFlight = false;
    }
  }

  private async appendHistory(
    status: ShareHistoryStatus,
    detail: string,
    transientFailure: boolean,
    httpStatus?: number,
    payloadBytes?: number,
    retryAfterSeconds?: number,
  ): Promise<SendOutcome> {
    const settings = loadShareSettings(this.context);
    const history = loadShareHistory(this.context);
    const entry: ShareHistoryEntry = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
      timestampIso: new Date().toISOString(),
      status,
      recipe: settings.recipe,
      detail,
      httpStatus,
      payloadBytes,
      retryAfterSeconds,
    };

    const next = appendShareHistory(history, entry, settings.historyLimit);
    await saveShareHistory(this.context, next);

    return {
      entry,
      transientFailure,
      retryAfterSeconds,
    };
  }
}
