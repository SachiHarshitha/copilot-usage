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
  computeRepoAttributionStats,
  discoverRepoDescriptors,
} from '../../core/repoAttribution';
import {
  computeDailyStats,
  computeKpis,
  parseAllFiles,
  flattenEvents,
} from '../../core/aggregator';
import { getMultiplier } from '../../core/config';
import { RequestEvent } from '../../core/types';
import {
  appendShareHistory,
} from './history';
import {
  buildShareSnapshot,
} from './payload';
import {
  resolveShareRepoRuns,
  resolveShareRepoRef,
} from './repoRef';
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

function toNonNegativePremium(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.round(value * 1000) / 1000;
}

function normalizeBaseUrl(raw: string): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) {
    return '';
  }

  const withScheme = /^[a-z][a-z\d+\-.]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  return withScheme.replace(/\/+$/, '');
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

function isAuthFailure(status: number): boolean {
  return status === 401 || status === 403;
}

export function shouldInvalidateLinkForAuthFailure(
  currentToken: string | undefined,
  failingToken: string,
  status: number,
): boolean {
  const active = (currentToken || '').trim();
  const failing = (failingToken || '').trim();
  return status === 401 && active.length > 0 && active === failing;
}

function modelInputsFromEvents(events: RequestEvent[]): ShareModelInput[] {
  const map = new Map<string, ShareModelInput>();
  for (const event of events) {
    const id = event.modelId || 'unknown';
    const hasTokenUsage = event.promptTokens > 0 || event.outputTokens > 0;
    const premium = hasTokenUsage ? getMultiplier(id) : 0;
    const existing = map.get(id);
    if (existing) {
      existing.requestCount += 1;
      existing.inputTokens += toNonNegativeInt(event.promptTokens);
      existing.outputTokens += toNonNegativeInt(event.outputTokens);
      existing.premiumRequests = toNonNegativePremium((existing.premiumRequests || 0) + premium);
      continue;
    }

    map.set(id, {
      modelId: id,
      requestCount: 1,
      inputTokens: toNonNegativeInt(event.promptTokens),
      outputTokens: toNonNegativeInt(event.outputTokens),
      premiumRequests: toNonNegativePremium(premium),
    });
  }
  return [...map.values()].sort((a, b) => b.requestCount - a.requestCount);
}

function dailyPremiumByDate(events: RequestEvent[]): Map<string, number> {
  const map = new Map<string, number>();

  for (const event of events) {
    if (!event.timestampMs) {
      continue;
    }
    const hasTokenUsage = event.promptTokens > 0 || event.outputTokens > 0;
    if (!hasTokenUsage) {
      continue;
    }

    const date = new Date(event.timestampMs);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const premium = getMultiplier(event.modelId || 'unknown');
    map.set(key, toNonNegativePremium((map.get(key) || 0) + premium));
  }

  return map;
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

export interface UpdateDeviceAliasResult {
  updated: boolean;
  alias?: string | null;
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

  async updateLinkedDeviceAlias(
    baseUrl: string,
    alias: string | null,
  ): Promise<UpdateDeviceAliasResult> {
    const token = await getDeviceToken(this.context);
    if (!token) {
      return {
        updated: false,
        detail: 'Device is not linked yet.',
      };
    }

    try {
      const response = await fetch(`${normalizeBaseUrl(baseUrl)}/api/connect/device`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: alias ?? '' }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        const trimmed = errorText.length > 120 ? `${errorText.slice(0, 120)}...` : errorText;

        if (isAuthFailure(response.status)) {
          const invalidated = await this.invalidateLinkIfTokenUnchanged(token, response.status);
          if (invalidated) {
            return {
              updated: false,
              detail: 'PromptStreak link expired or was revoked. Please link this device again.',
            };
          }

          if (response.status === 401) {
            return {
              updated: false,
              detail: `PromptStreak rejected an older link token (HTTP ${response.status}), but a newer link is active. Try saving alias again.`,
            };
          }

          return {
            updated: false,
            detail: `Alias update was rejected (HTTP ${response.status}). Link token was kept.${trimmed ? ` Server detail: ${trimmed}` : ''}`,
          };
        }

        return {
          updated: false,
          detail: `Alias update failed (HTTP ${response.status})${trimmed ? `: ${trimmed}` : ''}`,
        };
      }

      const payload = (await response.json().catch(() => ({}))) as { name?: unknown };
      const aliasValue = typeof payload.name === 'string' ? payload.name : null;
      return {
        updated: true,
        alias: aliasValue,
      };
    } catch (error) {
      return {
        updated: false,
        detail: `Alias update failed: ${String(error)}`,
      };
    }
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
    settings.lastSyncStatus = 'linked';
    await saveShareSettings(this.context, settings);
    await setDeviceToken(this.context, token);
    this.notify();
  }

  private async invalidateLinkIfTokenUnchanged(failingToken: string, status = 401): Promise<boolean> {
    const currentToken = await getDeviceToken(this.context);
    if (!shouldInvalidateLinkForAuthFailure(currentToken, failingToken, status)) {
      return false;
    }

    const settings = loadShareSettings(this.context);
    settings.linkedAtIso = undefined;
    settings.lastSyncStatus = 'auth_required';
    await saveShareSettings(this.context, settings);
    await clearDeviceToken(this.context);
    this.notify();
    return true;
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
        settings.linkedAtIso = undefined;
        settings.lastSyncStatus = 'auth_required';
        await saveShareSettings(this.context, settings);
        return this.appendHistory('failed', 'Device is not linked yet. Sign in and link before sharing.', false);
      }

      const workspaces = await discoverWorkspaces();
      const parsed = workspaces.length > 0 ? await parseAllFiles(workspaces) : [];
      const events = flattenEvents(parsed);
      const kpis = computeKpis(parsed, events);
      const daily = computeDailyStats(events);
      const dailyPremium = dailyPremiumByDate(events);
      const modelInputs = modelInputsFromEvents(events);
      const actionInputs = actionInputsFromEvents(events);
      const dailyBuckets: ShareDailyBucketInput[] = daily.map(d => ({
        date: d.date,
        requests: toNonNegativeInt(d.requests),
        inputTokens: toNonNegativeInt(d.promptTokens),
        outputTokens: toNonNegativeInt(d.outputTokens),
        premiumRequests: toNonNegativePremium(dailyPremium.get(d.date) || 0),
      }));
      const repoRows = settings.fields.includeRepoAttribution
        ? computeRepoAttributionStats(
          events,
          await discoverRepoDescriptors(workspaces),
        ).rows
        : [];
      const repoRuns = settings.fields.includeRepoAttribution
        ? await resolveShareRepoRuns(repoRows)
        : [];
      const repoRef = settings.fields.includeRepoAttribution
        ? (repoRuns.length > 0 ? repoRuns[0].repoRef : await resolveShareRepoRef(repoRows))
        : undefined;

      const snapshot = buildShareSnapshot({
        adapterVersion: this.adapterVersion,
        observedAtIso: new Date().toISOString(),
        idempotencySeed: await getOrCreateIdempotencySeed(this.context),
        fields: settings.fields,
        totals: {
          totalRequests: toNonNegativeInt(kpis.totalRequests),
          totalPromptTokens: toNonNegativeInt(kpis.totalPromptTokens),
          totalOutputTokens: toNonNegativeInt(kpis.totalOutputTokens),
          totalPremiumRequests: toNonNegativePremium(kpis.totalPremium),
        },
        models: modelInputs,
        actions: actionInputs,
        dailyBuckets,
        repoRef,
        repoRuns,
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
        const invalidated = await this.invalidateLinkIfTokenUnchanged(token);
        if (invalidated) {
          return this.appendHistory('failed', 'Linked device token is malformed.', false);
        }

        return this.appendHistory(
          'failed',
          'Skipped malformed stale token because a newer link is already active.',
          false,
        );
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
        const successPayload = (await response.json().catch(() => ({}))) as { deduplicated?: unknown };
        const deduplicated = successPayload?.deduplicated === true;
        settings.lastSuccessfulSyncIso = new Date().toISOString();
        settings.lastSyncStatus = 'success';
        await saveShareSettings(this.context, settings);
        const detail = deduplicated
          ? `Shared successfully (${reason}) — deduplicated (no new metrics).`
          : `Shared successfully (${reason}).`;
        return this.appendHistory('success', detail, false, undefined, payloadBytes);
      }

      const retryAfter = parseRetryAfterSeconds(response.headers.get('Retry-After'));
      const responseBody = await response.text();
      const trimmed = responseBody.length > 120 ? `${responseBody.slice(0, 120)}...` : responseBody;

      if (isAuthFailure(response.status)) {
        const invalidated = await this.invalidateLinkIfTokenUnchanged(token, response.status);
        if (invalidated) {
          return this.appendHistory(
            'failed',
            `PromptStreak link expired or was revoked (HTTP ${response.status}). Sign in and link this device again.`,
            false,
            response.status,
            payloadBytes,
            retryAfter,
          );
        }

        if (response.status === 401) {
          return this.appendHistory(
            'failed',
            `PromptStreak rejected an older link token (HTTP ${response.status}), but a newer link is active.`,
            false,
            response.status,
            payloadBytes,
            retryAfter,
          );
        }

        return this.appendHistory(
          'failed',
          `Upload rejected (HTTP ${response.status}). Link token was kept.${trimmed ? ` Server detail: ${trimmed}` : ''} This usually indicates a server-side policy/proxy issue, not an expired device token.`,
          false,
          response.status,
          payloadBytes,
          retryAfter,
        );
      }

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
