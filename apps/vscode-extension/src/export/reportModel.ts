/**
 * Builds the workbook-shaped view of the dashboard data.
 *
 * Pure: no `vscode` imports, no I/O. The numbers here are exactly the numbers the dashboard
 * webview is showing — the panel hands over what it already computed rather than recomputing,
 * so the spreadsheet can never disagree with the screen.
 */

import { KpiTotals, ModelStats, WorkspaceStats, DailyStats } from '../core/types';
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

export function buildReportModel(snapshot: DashboardSnapshot, meta: ReportMetaInput): ReportModel {
  const daily: ReportDailyRow[] = snapshot.daily
    .map(d => ({
      date: parseDayKey(d.date),
      requests: d.requests,
      promptTokens: d.promptTokens,
      outputTokens: d.outputTokens,
      toolRounds: d.toolCallRounds,
      premiumUnits: d.premium,
      credits: d.credits,
      sessions: d.sessions,
    }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const models: ReportModelRow[] = snapshot.models
    .map(m => ({
      model: m.modelId.replace(/^copilot\//, ''),
      requests: m.requests,
      promptTokens: m.promptTokens,
      outputTokens: m.outputTokens,
      premiumUnits: m.premium,
      credits: m.credits,
    }))
    .sort((a, b) => (b.promptTokens + b.outputTokens) - (a.promptTokens + a.outputTokens));

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
