/**
 * Builds the workbook-shaped view of the dashboard data.
 *
 * Pure: no `vscode` imports, no I/O. The numbers here are exactly the numbers the dashboard
 * webview is showing — the panel hands over what it already computed rather than recomputing,
 * so the spreadsheet can never disagree with the screen.
 */

import {
  DailyStats,
  KpiTotals,
  MeteredDailyStat,
  MeteredModelStat,
  MeteredTotals,
  ModelStats,
  ReconciliationStats,
  WorkspaceStats,
} from '../core/types';
import { RepoAttributionStats } from '../core/repoAttribution';

export interface ReportMetaInput {
  extensionVersion: string;
  generatedAt: Date;
  /** The dashboard's date-range setting, e.g. `all`, `30d`. */
  dateRangeLabel: string;
  shortenWorkspacePaths: boolean;
}

export interface ReportMeta extends ReportMetaInput {
  schemaVersion: string;
  timezone: string;
  rangeStart?: Date;
  rangeEnd?: Date;
  sessions: number;
}

export interface ReportModelRow {
  model: string;
  requests: number;
  promptTokens: number;
  outputTokens: number;
  premiumUnits: number;
  credits: number;
  meteredRounds?: number;
  meteredInputTokens?: number;
  meteredOutputTokens?: number;
  meteredCachedTokens?: number;
  meteredCredits?: number;
  meteredCoveragePct?: number;
}

export interface ReportRepoRow {
  repository: string;
  requests: number;
  promptTokens: number;
  outputTokens: number;
  premiumUnits: number;
  credits: number;
  topModel: string;
}

export interface ReportWorkspaceRow {
  workspace: string;
  requests: number;
  promptTokens: number;
  outputTokens: number;
  premiumUnits: number;
  credits: number;
  topModel: string;
}

export interface ReportDailyRow {
  date: Date;
  requests: number;
  promptTokens: number;
  outputTokens: number;
  toolRounds: number;
  premiumUnits: number;
  credits: number;
  sessions: number;
  meteredRounds?: number;
  meteredInputTokens?: number;
  meteredOutputTokens?: number;
  meteredCachedTokens?: number;
  meteredCredits?: number;
  meteredCoveragePct?: number;
}

export interface ReportModel {
  meta: ReportMeta;
  models: ReportModelRow[];
  repos: ReportRepoRow[];
  workspaces: ReportWorkspaceRow[];
  daily: ReportDailyRow[];
}

export const REPORT_SCHEMA_VERSION = '1.0.0';

export interface DashboardSnapshot {
  kpis: KpiTotals;
  models: ModelStats[];
  workspaces: WorkspaceStats[];
  repos: RepoAttributionStats;
  daily: DailyStats[];
  metered?: MeteredTotals;
  meteredModels?: MeteredModelStat[];
  meteredDaily?: MeteredDailyStat[];
  reconciliation?: ReconciliationStats;
}

/** `…/parent/leaf` — the privacy default, matching how the dashboard displays paths. */
export function shortenWorkspacePath(workspacePath: string): string {
  const parts = workspacePath.replace(/\\/g, '/').split('/').filter(Boolean);
  return parts.length > 2 ? `…/${parts.slice(-2).join('/')}` : workspacePath;
}

/** `Europe/Berlin (+02:00)` — the zone plus the offset actually in force at `at`. */
export function describeTimezone(at: Date): string {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown';
  const offsetMinutes = -at.getTimezoneOffset();
  const sign = offsetMinutes < 0 ? '-' : '+';
  const abs = Math.abs(offsetMinutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `${zone} (${sign}${hh}:${mm})`;
}

/** `YYYY-MM-DD` from `computeDailyStats` back to a local-calendar Date. */
function parseDayKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function normalizeModelKey(value: string): string {
  return value.replace(/^copilot\//, '').trim().toLowerCase();
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function buildReportModel(snapshot: DashboardSnapshot, meta: ReportMetaInput): ReportModel {
  const localModels = snapshot.models.map(m => ({
    model: m.modelId.replace(/^copilot\//, ''),
    requests: m.requests,
    promptTokens: m.promptTokens,
    outputTokens: m.outputTokens,
    premiumUnits: m.premium,
    credits: m.credits,
  }));

  const localModelsByKey = new Map(localModels.map(m => [normalizeModelKey(m.model), m]));
  const meteredModelsByKey = new Map(
    (snapshot.meteredModels || []).map(m => [normalizeModelKey(m.modelId), m]),
  );

  const modelKeys = new Set<string>([
    ...localModelsByKey.keys(),
    ...meteredModelsByKey.keys(),
  ]);

  const models: ReportModelRow[] = [...modelKeys].map((key) => {
    const local = localModelsByKey.get(key);
    const metered = meteredModelsByKey.get(key);

    return {
      model: local?.model || key,
      requests: local?.requests ?? 0,
      promptTokens: local?.promptTokens ?? 0,
      outputTokens: local?.outputTokens ?? 0,
      premiumUnits: local?.premiumUnits ?? 0,
      credits: local?.credits ?? 0,
      meteredRounds: metered?.rounds,
      meteredInputTokens: metered?.inputTokens,
      meteredOutputTokens: metered?.outputTokens,
      meteredCachedTokens: metered?.cachedTokens,
      meteredCredits: metered?.credits,
      meteredCoveragePct: metered ? round1(metered.coverage * 100) : undefined,
    };
  }).sort((a, b) => {
    const aLocalTokens = a.promptTokens + a.outputTokens;
    const bLocalTokens = b.promptTokens + b.outputTokens;
    if (bLocalTokens !== aLocalTokens) {
      return bLocalTokens - aLocalTokens;
    }

    const aMeteredTokens = (a.meteredInputTokens ?? 0) + (a.meteredOutputTokens ?? 0);
    const bMeteredTokens = (b.meteredInputTokens ?? 0) + (b.meteredOutputTokens ?? 0);
    if (bMeteredTokens !== aMeteredTokens) {
      return bMeteredTokens - aMeteredTokens;
    }

    return a.model.localeCompare(b.model);
  });

  const localDailyByDate = new Map(snapshot.daily.map(d => [d.date, d]));
  const meteredDailyByDate = new Map((snapshot.meteredDaily || []).map(d => [d.date, d]));
  const dailyKeys = new Set<string>([
    ...localDailyByDate.keys(),
    ...meteredDailyByDate.keys(),
  ]);

  const daily: ReportDailyRow[] = [...dailyKeys]
    .sort((a, b) => a.localeCompare(b))
    .map((dateKey) => {
      const local = localDailyByDate.get(dateKey);
      const metered = meteredDailyByDate.get(dateKey);

      return {
        date: parseDayKey(dateKey),
        requests: local?.requests ?? 0,
        promptTokens: local?.promptTokens ?? 0,
        outputTokens: local?.outputTokens ?? 0,
        toolRounds: local?.toolCallRounds ?? 0,
        premiumUnits: local?.premium ?? 0,
        credits: local?.credits ?? 0,
        sessions: local?.sessions ?? 0,
        meteredRounds: metered?.rounds,
        meteredInputTokens: metered?.inputTokens,
        meteredOutputTokens: metered?.outputTokens,
        meteredCachedTokens: metered?.cachedTokens,
        meteredCredits: metered?.credits,
        meteredCoveragePct: metered ? round1(metered.coverage * 100) : undefined,
      };
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const repos: ReportRepoRow[] = snapshot.repos.rows
    .map(r => ({
      repository: r.displayName,
      requests: r.requests,
      promptTokens: r.promptTokens,
      outputTokens: r.outputTokens,
      premiumUnits: r.premiumRequests,
      credits: r.credits,
      topModel: r.topModel,
    }))
    .sort((a, b) => (b.promptTokens + b.outputTokens) - (a.promptTokens + a.outputTokens));

  const workspaces: ReportWorkspaceRow[] = snapshot.workspaces
    .map(w => {
      const full = w.workspacePath || w.workspaceId;
      return {
        workspace: meta.shortenWorkspacePaths ? shortenWorkspacePath(full) : full,
        requests: w.requests,
        promptTokens: w.promptTokens,
        outputTokens: w.outputTokens,
        premiumUnits: w.premium,
        credits: w.credits,
        topModel: w.topModel,
      };
    })
    .sort((a, b) => (b.promptTokens + b.outputTokens) - (a.promptTokens + a.outputTokens));

  return {
    meta: {
      ...meta,
      schemaVersion: REPORT_SCHEMA_VERSION,
      timezone: describeTimezone(meta.generatedAt),
      rangeStart: daily.length > 0 ? daily[0].date : undefined,
      rangeEnd: daily.length > 0 ? daily[daily.length - 1].date : undefined,
      sessions: snapshot.kpis.sessionCount,
    },
    models,
    repos,
    workspaces,
    daily,
  };
}
