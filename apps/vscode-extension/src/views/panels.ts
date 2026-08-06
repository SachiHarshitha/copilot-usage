/** Workspace-scoped analysis webview panel. */

import * as vscode from 'vscode';
import { findCurrentWorkspace, discoverWorkspaces, getWorkspaceStorageRoots } from '../core/discovery';
import { parseAllFiles, flattenEvents, computeKpis, computeModelStats, computeDailyStats, computeWorkspaceStats } from '../core/aggregator';
import { loadCreditRates } from '../core/credits';
import {
  aggregateMetered,
  computeMeteredDaily,
  computeMeteredModelStats,
  filterMeteredByStartMs,
  flattenMeteredFiles,
  parseAllMeteredFiles,
  reconcileUsage,
} from '../core/meteredUsage';
import { computeRepoAttributionStats, discoverRepoDescriptors, RepoAttributionStats } from '../core/repoAttribution';
import { DashboardSnapshot } from '../export/reportModel';
import { runDashboardReportExport } from '../export/exportCommand';
import { enableCostEstimator } from '../features/costEstimator/flags';
import {
  didAffectCopilotDebugLogSetting,
  isCopilotDebugLogEnabled,
  openCopilotDebugLogSettings,
} from '../core/copilotDebugLog';
import {
  DailyStats,
  KpiTotals,
  MeteredConfidence,
  MeteredDailyStat,
  MeteredModelStat,
  MeteredTotals,
  ModelStats,
  ReconciliationStats,
  RequestEvent,
  WorkspaceInfo,
  WorkspaceStats,
} from '../core/types';

export class WorkspacePanel {
  public static currentPanel: WorkspacePanel | undefined;
  private static storageRoots?: string[];
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];
  private disposed = false;

  private constructor(panel: vscode.WebviewPanel, private extensionUri: vscode.Uri) {
    this.panel = panel;
    this.panel.webview.options = { enableScripts: true };
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      async (msg) => {
        if (msg.command === 'refresh') { this.showLoading(); await this.loadData(); }
        if (msg.command === 'openDashboard') { await DashboardPanel.createOrShow(this.extensionUri); }
        if (msg.command === 'openCostEstimator' && enableCostEstimator) {
          await vscode.commands.executeCommand('copilot-usage.costEstimator');
        }
        if (msg.command === 'openGitHub') { vscode.env.openExternal(vscode.Uri.parse('https://github.com/SachiHarshitha/copilot-usage')); }
        if (msg.command === 'openSettings') {
          await vscode.commands.executeCommand('workbench.action.openSettings', 'copilot-usage');
        }
        if (msg.command === 'openDebugLogSettings') {
          await openCopilotDebugLogSettings();
        }
        if (msg.command === 'setLens') {
          await updateLensSetting(normalizeUsageLens(msg.lens));
          this.showLoading();
          await this.loadData();
        }
        if (msg.command === 'setDateRange') {
          await updateDateRangeSetting('workspaceAnalysis.dateRange', normalizeDateRange(msg.range));
          this.showLoading();
          await this.loadData();
        }
      },
      null,
      this.disposables,
    );
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('copilot-usage') || didAffectCopilotDebugLogSetting(e)) { this.loadData(); }
      }),
    );
  }

  public static async refresh(storageRoots?: string[]): Promise<void> {
    WorkspacePanel.storageRoots ??= storageRoots ?? getWorkspaceStorageRoots(vscode.env.appName);
    if (WorkspacePanel.currentPanel) {
      await WorkspacePanel.currentPanel.loadData();
    }
  }

  public static async createOrShow(extensionUri: vscode.Uri): Promise<void> {
    const column = vscode.ViewColumn.Active;
    if (WorkspacePanel.currentPanel) {
      WorkspacePanel.currentPanel.panel.reveal(column);
      WorkspacePanel.currentPanel.showLoading();
      await WorkspacePanel.currentPanel.loadData();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'copilotUsage.workspace',
      'Copilot Usage — Workspace',
      column,
      { enableScripts: true, retainContextWhenHidden: true },
    );

    WorkspacePanel.currentPanel = new WorkspacePanel(panel, extensionUri);
    WorkspacePanel.currentPanel.showLoading();
    await WorkspacePanel.currentPanel.loadData();
  }

  private setHtml(html: string): void {
    if (!this.disposed) { this.panel.webview.html = html; }
  }

  private showLoading(): void {
    this.setHtml(loadingPage());
  }

  private async loadData(): Promise<void> {
    const cfg = vscode.workspace.getConfiguration('copilot-usage');
    const dateRange = normalizeDateRange(cfg.get<string>('workspaceAnalysis.dateRange', 'all'));
    const autoRefreshSeconds = cfg.get<number>('workspaceAnalysis.autoRefreshSeconds', 0);
    const configuredLens = normalizeUsageLens(cfg.get<string>('dashboard.lens', 'billing'));
    const meteredEnabled = cfg.get<boolean>('metered.enabled', true);
    const minCoverage = clampCoverage(cfg.get<number>('metered.minCoverage', 0.95));
    const showDebugLogBanner = !isCopilotDebugLogEnabled();

    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      this.setHtml(getWorkspaceHtml(undefined, undefined, undefined, undefined, 'No workspace folder open.', true, autoRefreshSeconds, 0, showDebugLogBanner));
      return;
    }

    const wsFileUri = vscode.workspace.workspaceFile?.toString();
    const folderPaths = folders.map(f => f.uri.fsPath);
    const ws = await findCurrentWorkspace(wsFileUri, folderPaths, WorkspacePanel.storageRoots ?? getWorkspaceStorageRoots(vscode.env.appName));
    if (!ws) {
      const searched = wsFileUri
        ? `workspace file: ${vscode.workspace.workspaceFile!.fsPath}`
        : folderPaths.join(', ');
      this.setHtml(getWorkspaceHtml(undefined, undefined, undefined, undefined,
        `No Copilot session data found for this workspace.\n\nLooked for: ${searched}`, true, autoRefreshSeconds, 0, showDebugLogBanner));
      return;
    }

    const parsed = await parseAllFiles([ws]);
    const allEvents = flattenEvents(parsed);
    const events = filterEventsByDateRange(allEvents, dateRange);
    const rates = await loadCreditRates();
    const kpis = computeKpis(parsed, events, rates);
    const models = computeModelStats(events, rates);
    const daily = computeDailyStats(events, rates);
    const repos = await discoverRepoDescriptors([ws], folderPaths);
    const repoStats = computeRepoAttributionStats(events, repos, { includeEmptyRepos: true, rates });

    let metered: MeteredViewData | undefined;
    if (meteredEnabled) {
      try {
        metered = await computeMeteredViewData([ws], dateRange, kpis, minCoverage);
      } catch {
        // Missing/malformed debug logs should not block rendering request-level analytics.
        metered = undefined;
      }
    }

    const effectiveLens = configuredLens === 'billing' && isBillingLensAvailable(metered)
      ? 'billing'
      : 'developer';

    this.setHtml(getWorkspaceHtml(
      kpis,
      models,
      daily,
      ws.workspacePath,
      undefined,
      false,
      autoRefreshSeconds,
      monthsCovered(dateRange, events),
      showDebugLogBanner,
      repoStats,
      effectiveLens,
      metered,
      dateRange,
    ));
  }

  private dispose(): void {
    this.disposed = true;
    WorkspacePanel.currentPanel = undefined;
    this.panel.dispose();
    for (const d of this.disposables) { d.dispose(); }
    this.disposables = [];
  }
}

/** Global dashboard webview panel. */
export class DashboardPanel {
  public static currentPanel: DashboardPanel | undefined;
  private static storageRoots?: string[];
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];
  private disposed = false;
  /** The data currently rendered, kept so an export can never disagree with the screen. */
  private snapshot?: DashboardSnapshot;
  private dateRangeLabel = 'all';

  private constructor(panel: vscode.WebviewPanel, private extensionUri: vscode.Uri) {
    this.panel = panel;
    this.panel.webview.options = { enableScripts: true };
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      async (msg) => {
        if (msg.command === 'refresh') { this.showLoading(); await this.loadData(); }
        if (msg.command === 'openWorkspace') { await WorkspacePanel.createOrShow(this.extensionUri); }
        if (msg.command === 'exportReport') { await this.exportReport(); }
        if (msg.command === 'openCostEstimator' && enableCostEstimator) {
          await vscode.commands.executeCommand('copilot-usage.costEstimator');
        }
        if (msg.command === 'openGitHub') { vscode.env.openExternal(vscode.Uri.parse('https://github.com/SachiHarshitha/copilot-usage')); }
        if (msg.command === 'openSettings') {
          await vscode.commands.executeCommand('workbench.action.openSettings', 'copilot-usage');
        }
        if (msg.command === 'openDebugLogSettings') {
          await openCopilotDebugLogSettings();
        }
        if (msg.command === 'setLens') {
          await updateLensSetting(normalizeUsageLens(msg.lens));
          this.showLoading();
          await this.loadData();
        }
        if (msg.command === 'setDateRange') {
          await updateDateRangeSetting('dashboard.dateRange', normalizeDateRange(msg.range));
          this.showLoading();
          await this.loadData();
        }
      },
      null,
      this.disposables,
    );
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('copilot-usage') || didAffectCopilotDebugLogSetting(e)) { this.loadData(); }
      }),
    );
  }

  public static async refresh(storageRoots?: string[]): Promise<void> {
    DashboardPanel.storageRoots ??= storageRoots ?? getWorkspaceStorageRoots(vscode.env.appName);
    if (DashboardPanel.currentPanel) {
      await DashboardPanel.currentPanel.loadData();
    }
  }

  public static async createOrShow(extensionUri: vscode.Uri): Promise<void> {
    const column = vscode.ViewColumn.Active;
    if (DashboardPanel.currentPanel) {
      DashboardPanel.currentPanel.panel.reveal(column);
      DashboardPanel.currentPanel.showLoading();
      await DashboardPanel.currentPanel.loadData();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'copilotUsage.dashboard',
      'Copilot Usage — Dashboard',
      column,
      { enableScripts: true, retainContextWhenHidden: true },
    );

    DashboardPanel.currentPanel = new DashboardPanel(panel, extensionUri);
    DashboardPanel.currentPanel.showLoading();
    await DashboardPanel.currentPanel.loadData();
  }

  /** Open (or reuse) the dashboard, then export what it is showing. */
  public static async exportReport(extensionUri: vscode.Uri): Promise<void> {
    await DashboardPanel.createOrShow(extensionUri);
    await DashboardPanel.currentPanel?.exportReport();
  }

  private async exportReport(): Promise<void> {
    if (!this.snapshot) {
      await vscode.window.showInformationMessage('No Copilot usage data to export yet.');
      return;
    }
    await runDashboardReportExport(this.extensionUri, this.snapshot, this.dateRangeLabel);
  }

  private setHtml(html: string): void {
    if (!this.disposed) { this.panel.webview.html = html; }
  }

  private showLoading(): void {
    this.setHtml(loadingPage());
  }

  private async loadData(): Promise<void> {
    const cfg = vscode.workspace.getConfiguration('copilot-usage');
    const dateRange = normalizeDateRange(cfg.get<string>('dashboard.dateRange', 'all'));
    const autoRefreshSeconds = cfg.get<number>('dashboard.autoRefreshSeconds', 0);
    const configuredLens = normalizeUsageLens(cfg.get<string>('dashboard.lens', 'billing'));
    const meteredEnabled = cfg.get<boolean>('metered.enabled', true);
    const minCoverage = clampCoverage(cfg.get<number>('metered.minCoverage', 0.95));
    const showDebugLogBanner = !isCopilotDebugLogEnabled();

    const workspaces = await discoverWorkspaces(DashboardPanel.storageRoots ?? getWorkspaceStorageRoots(vscode.env.appName));
    if (workspaces.length === 0) {
      this.snapshot = undefined;
      this.setHtml(getDashboardHtml(undefined, undefined, undefined, undefined, 'No Copilot session data found.', autoRefreshSeconds, 0, showDebugLogBanner));
      return;
    }

    const parsed = await parseAllFiles(workspaces);
    const allEvents = flattenEvents(parsed);
    const events = filterEventsByDateRange(allEvents, dateRange);
    const rates = await loadCreditRates();
    const kpis = computeKpis(parsed, events, rates);
    const models = computeModelStats(events, rates);
    const daily = computeDailyStats(events, rates);

    const wsStats = computeWorkspaceStats(parsed, events, rates);
    const repos = await discoverRepoDescriptors(workspaces);
    const repoStats = computeRepoAttributionStats(events, repos, { rates });

    let metered: MeteredViewData | undefined;
    if (meteredEnabled) {
      try {
        metered = await computeMeteredViewData(workspaces, dateRange, kpis, minCoverage);
      } catch {
        // Missing/malformed debug logs should not block rendering request-level analytics.
        metered = undefined;
      }
    }

    const effectiveLens = configuredLens === 'billing' && isBillingLensAvailable(metered)
      ? 'billing'
      : 'developer';

    this.dateRangeLabel = dateRange;
    this.snapshot = {
      kpis,
      models,
      workspaces: wsStats,
      repos: repoStats,
      daily,
      metered: metered?.totals,
      meteredModels: metered?.models,
      meteredDaily: metered?.daily,
      reconciliation: metered?.reconciliation,
    };

    this.setHtml(getDashboardHtml(
      kpis,
      models,
      daily,
      wsStats,
      undefined,
      autoRefreshSeconds,
      monthsCovered(dateRange, events),
      showDebugLogBanner,
      repoStats,
      effectiveLens,
      metered,
      dateRange,
    ));
  }

  private dispose(): void {
    this.disposed = true;
    DashboardPanel.currentPanel = undefined;
    this.panel.dispose();
    for (const d of this.disposables) { d.dispose(); }
    this.disposables = [];
  }
}

// ── Dashboard HTML (global) ─────────────────────────────────────────────

type UsageLens = 'developer' | 'billing';

interface MeteredViewData {
  totals: MeteredTotals;
  models: MeteredModelStat[];
  daily: MeteredDailyStat[];
  reconciliation: ReconciliationStats;
}

function normalizeUsageLens(v: unknown): UsageLens {
  return v === 'billing' ? 'billing' : 'developer';
}

function clampCoverage(value: number): number {
  if (!Number.isFinite(value)) { return 0.95; }
  return Math.min(1, Math.max(0, value));
}

async function updateLensSetting(lens: UsageLens): Promise<void> {
  await vscode.workspace.getConfiguration('copilot-usage').update(
    'dashboard.lens',
    lens,
    vscode.ConfigurationTarget.Global,
  );
}

async function updateDateRangeSetting(
  key: 'dashboard.dateRange' | 'workspaceAnalysis.dateRange',
  range: DateRange,
): Promise<void> {
  await vscode.workspace.getConfiguration('copilot-usage').update(
    key,
    range,
    vscode.ConfigurationTarget.Global,
  );
}

function isBillingLensAvailable(metered?: MeteredViewData): boolean {
  return !!metered && metered.totals.rounds > 0 && metered.reconciliation.confidence !== 'unavailable';
}

function normalizeModelId(raw: string | undefined): string {
  return raw || 'unknown';
}

function meteredDataForLens(
  lens: UsageLens,
  metered: MeteredViewData | undefined,
): MeteredViewData | undefined {
  if (lens !== 'billing') {
    return undefined;
  }
  return isBillingLensAvailable(metered) ? metered : undefined;
}

async function computeMeteredViewData(
  workspaces: WorkspaceInfo[],
  dateRange: DateRange,
  kpis: KpiTotals,
  minCoverage: number,
): Promise<MeteredViewData | undefined> {
  const parsed = await parseAllMeteredFiles(workspaces);
  const flat = flattenMeteredFiles(parsed);
  const filteredRounds = filterMeteredByStartMs(flat.rounds, dateRangeStartMs(dateRange));
  const totals = aggregateMetered(filteredRounds, flat.userMessages, flat.copilotVersions);
  const models = computeMeteredModelStats(filteredRounds);
  const daily = computeMeteredDaily(filteredRounds);
  const reconciliation = reconcileUsage(kpis, totals, minCoverage);

  return {
    totals,
    models,
    daily,
    reconciliation,
  };
}

// ── Date-range filter ───────────────────────────────────────────────────

type DateRange = 'today' | '7d' | '30d' | '3m' | 'mtd' | 'ytd' | 'all';

const DATE_RANGES: { v: DateRange; l: string }[] = [
  { v: 'today', l: '📅 Today' },
  { v: '7d', l: '📅 Last 7 days' },
  { v: '30d', l: '📅 Last 30 days' },
  { v: '3m', l: '📅 Last 3 months' },
  { v: 'mtd', l: '📅 This month' },
  { v: 'ytd', l: '📅 This year' },
  { v: 'all', l: '📅 All time' },
];

function normalizeDateRange(v: unknown): DateRange {
  return DATE_RANGES.some(r => r.v === v) ? v as DateRange : 'all';
}

function dateRangeStartMs(range: DateRange, now = new Date()): number | undefined {
  if (range === 'all') { return undefined; }
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (range) {
    case 'today': return d.getTime();
    case '7d':   return d.getTime() - 7 * 86400000;
    case '30d':  return d.getTime() - 30 * 86400000;
    case '3m':   return new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()).getTime();
    case 'mtd':  return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    case 'ytd':  return new Date(now.getFullYear(), 0, 1).getTime();
  }
}

/** Approx months covered by the active range, based on actual event span (or range bounds for 'all'). */
function monthsCovered(range: DateRange, events: RequestEvent[]): number {
  const now = Date.now();
  let startMs = dateRangeStartMs(range);
  if (startMs === undefined) {
    // 'all' — derive from earliest event
    let earliest = now;
    for (const e of events) {
      if (typeof e.timestampMs === 'number' && e.timestampMs < earliest) { earliest = e.timestampMs; }
    }
    startMs = earliest;
  }
  const days = Math.max(1, (now - startMs) / 86400000);
  return days / 30.4375;  // average days per month
}

function filterEventsByDateRange(events: RequestEvent[], range: DateRange): RequestEvent[] {
  const startMs = dateRangeStartMs(range);
  if (startMs === undefined) { return events; }
  return events.filter(e => typeof e.timestampMs === 'number' && e.timestampMs >= startMs);
}

function confidenceLabel(confidence: MeteredConfidence): string {
  if (confidence === 'exact') { return 'Exact'; }
  if (confidence === 'partial') { return 'Partial'; }
  return 'Unavailable';
}

function confidenceClass(confidence: MeteredConfidence): string {
  if (confidence === 'exact') { return 'pill pill-exact'; }
  if (confidence === 'partial') { return 'pill pill-partial'; }
  return 'pill pill-unavailable';
}

function dateRangeLabel(range: DateRange): string {
  return (DATE_RANGES.find(r => r.v === range)?.l || 'All time').replace(/^📅\s*/, '');
}

function dateRangeToolbarHtml(dateRange: DateRange, actionsHtml: string): string {
  const options = DATE_RANGES
    .map(r => `<option value="${r.v}" ${r.v === dateRange ? 'selected' : ''}>${esc(dateRangeLabel(r.v))}</option>`)
    .join('');
  return `<div class="control-bar" role="region" aria-label="Range and quick actions">`
    + `<div class="range-group" title="Selected range: ${esc(dateRangeLabel(dateRange))}. Changing this updates all cards, charts, and tables on this view.">`
    + `<span class="range-icon" aria-hidden="true">📅</span>`
    + `<select class="range-select" aria-label="Select date range" onchange="setDateRange(this.value)">${options}</select>`
    + `</div>`
    + `<div class="control-actions">${actionsHtml}</div>`
    + `</div>`;
}

function lensToggleHtml(lens: UsageLens, billingAvailable: boolean): string {
  const devTip = 'Developer mode: request-level usage from chatSessions logs (requests, prompt/output tokens, tool rounds, premium multipliers).';
  const billingBase = 'Billing mode: metered usage from Copilot debug logs (model rounds, internal input/output/cached tokens, and metered credits).';
  const billingTip = billingAvailable
    ? billingBase
    : `${billingBase} Unavailable for this range because metered coverage is missing or insufficient.`;

  return `<div class="lens-toggle" role="group" aria-label="Usage lens">`
    + `<button class="lens-btn ${lens === 'developer' ? 'active' : ''}" onclick="setLens('developer')" title="${esc(devTip)}" aria-label="Developer mode">Developer</button>`
    + `<button class="lens-btn ${lens === 'billing' && billingAvailable ? 'active' : ''} ${billingAvailable ? '' : 'disabled'}"`
    + ` onclick="setLens('billing')" title="${esc(billingTip)}" aria-label="Billing mode" ${billingAvailable ? '' : 'disabled'}>`
    + `Billing</button>`
    + `</div>`;
}

function reconciliationStrip(metered?: MeteredViewData): string {
  if (!metered) { return ''; }
  const r = metered.reconciliation;
  const coveragePct = `${(r.coverage * 100).toFixed(1)}%`;
  return `<div class="recon-strip">`
    + `<span><strong>Copilot metered</strong> ${fmt(Math.round(r.meteredCredits))} credits</span>`
    + `<span>visible estimate ${fmt(Math.round(r.estimatedCredits))} credits</span>`
    + `<span>amplification ${r.tokenAmplification.toFixed(1)}×</span>`
    + `<span>rounds ${fmt(r.meteredRounds)} vs prompts ${fmt(r.visibleRequests)}</span>`
    + `<span>coverage ${coveragePct}</span>`
    + `<span class="${confidenceClass(r.confidence)}">${esc(confidenceLabel(r.confidence))}</span>`
    + `</div>`;
}

function buildModelRows(
  models: ModelStats[],
  meteredModels: MeteredModelStat[],
  lens: UsageLens,
): {
  requestHeader: string;
  tokenHeader: string;
  premiumHeader: string;
  rowsHtml: string;
} {
  const devByModel = new Map(models.map(m => [normalizeModelId(m.modelId), m]));
  const meteredByModel = new Map(meteredModels.map(m => [normalizeModelId(m.modelId), m]));
  const allModelIds = new Set<string>([
    ...[...devByModel.keys()],
    ...[...meteredByModel.keys()],
  ]);

  const rows = [...allModelIds].map(modelId => {
    const dev = devByModel.get(modelId);
    const metered = meteredByModel.get(modelId);

    const requestValue = lens === 'billing'
      ? fmt(metered?.rounds ?? 0)
      : fmt(dev?.requests ?? 0);
    const tokenValue = lens === 'billing'
      ? fmt((metered?.inputTokens ?? 0) + (metered?.outputTokens ?? 0))
      : fmt(dev?.totalTokens ?? 0);
    const premiumValue = lens === 'billing'
      ? `${((metered?.coverage ?? 0) * 100).toFixed(1)}%`
      : `${(dev?.premium ?? 0).toFixed(1)}×`;
    const creditsValue = fmt(Math.round(dev?.credits ?? 0));
    const meteredCreditsValue = metered ? fmt(Math.round(metered.credits)) : '—';

    return {
      modelId,
      sortA: lens === 'billing' ? (metered?.rounds ?? 0) : (dev?.requests ?? 0),
      sortB: lens === 'billing'
        ? ((metered?.inputTokens ?? 0) + (metered?.outputTokens ?? 0))
        : (dev?.totalTokens ?? 0),
      html: `<tr><td>${esc(shortModel(modelId))}</td><td>${requestValue}</td><td>${tokenValue}</td><td>${premiumValue}</td><td>${creditsValue}</td><td>${meteredCreditsValue}</td></tr>`,
    };
  });

  rows.sort((a, b) => b.sortA - a.sortA || b.sortB - a.sortB || a.modelId.localeCompare(b.modelId));

  return {
    requestHeader: lens === 'billing' ? 'Rounds' : 'Requests',
    tokenHeader: lens === 'billing' ? 'Internal Tokens' : 'Tokens',
    premiumHeader: lens === 'billing' ? 'Coverage' : 'Premium',
    rowsHtml: rows.map(r => r.html).join(''),
  };
}

function getDashboardHtml(
  kpis?: KpiTotals,
  models?: ModelStats[],
  daily?: DailyStats[],
  wsStats?: WorkspaceStats[],
  error?: string,
  autoRefreshSeconds = 0,
  months = 0,
  showDebugLogBanner = false,
  repoStats?: RepoAttributionStats,
  lens: UsageLens = 'developer',
  metered?: MeteredViewData,
  dateRange: DateRange = 'all',
): string {
  if (error || !kpis) {
    return errorPage(error || 'No data', false, showDebugLogBanner);
  }

  const baseModels = models || [];
  const lensMetered = meteredDataForLens(lens, metered);
  const billingAvailable = isBillingLensAvailable(metered);
  const activeLens: UsageLens = lensMetered ? 'billing' : 'developer';

  const modelTable = buildModelRows(baseModels, metered?.models || [], activeLens);

  const wsRows = (wsStats || []).map(w => {
    const display = shortPath(w.workspacePath || w.workspaceId);
    return `<tr><td title="${esc(w.workspacePath)}">${esc(display)}</td><td>${fmt(w.requests)}</td><td>${fmt(w.promptTokens)}</td><td>${fmt(w.outputTokens)}</td><td>${w.premium.toFixed(1)}×</td><td>${fmt(Math.round(w.credits))}</td><td>${esc(shortModel(w.topModel))}</td></tr>`;
  }).join('');

  const totalTokens = Math.max(0, kpis.totalPromptTokens + kpis.totalOutputTokens);
  const repoRows = (repoStats?.rows || []).map(row => {
    const rowTotal = row.promptTokens + row.outputTokens;
    const share = totalTokens > 0 ? `${((rowTotal / totalTokens) * 100).toFixed(1)}%` : '0.0%';
    return `<tr><td>${esc(row.displayName)}</td><td>${fmtDecimal(row.requests, 1)}</td><td>${fmtDecimal(row.promptTokens, 1)}</td><td>${fmtDecimal(row.outputTokens, 1)}</td><td>${share}</td><td>${esc(shortModel(row.topModel))}</td></tr>`;
  }).join('');
  const repoRowsHtml = repoRows || '<tr><td colspan="6">No repository attribution signals detected.</td></tr>';

  const dailySeries = lensMetered
    ? lensMetered.daily.map(d => ({ date: d.date, prompt: d.inputTokens, output: d.outputTokens }))
    : (daily || []).map(d => ({ date: d.date, prompt: d.promptTokens, output: d.outputTokens }));
  const modelSeries = activeLens === 'billing'
    ? (metered?.models || []).map(m => ({ label: shortModel(m.modelId), value: m.rounds }))
    : baseModels.map(m => ({ label: shortModel(m.modelId), value: m.requests }));

  const dailyLabels = JSON.stringify(dailySeries.map(d => d.date));
  const dailyPrompt = JSON.stringify(dailySeries.map(d => d.prompt));
  const dailyOutput = JSON.stringify(dailySeries.map(d => d.output));
  const modelLabels = JSON.stringify(modelSeries.map(m => m.label));
  const modelData = JSON.stringify(modelSeries.map(m => m.value));

  const inputTokens = lensMetered ? lensMetered.totals.inputTokens : kpis.totalPromptTokens;
  const outputTokens = lensMetered ? lensMetered.totals.outputTokens : kpis.totalOutputTokens;

  const creditsCard = metered
    ? kpiCardDual(
      'Credits',
      fmt(Math.round(metered.totals.credits)),
      `≈ ${fmt(Math.round(kpis.totalCredits))} visible`,
      confidenceLabel(metered.reconciliation.confidence),
      confidenceClass(metered.reconciliation.confidence),
    )
    : kpiCard('Credits', fmt(Math.round(kpis.totalCredits)), perMonth(Math.round(kpis.totalCredits), months) ?? '≈ token-metered');

  const requestLabel = lensMetered ? 'Model Rounds' : 'Requests';
  const requestValue = lensMetered ? fmt(lensMetered.totals.rounds) : fmt(kpis.totalRequests);
  const requestSub = lensMetered
    ? `${fmt(lensMetered.totals.userMessages)} user msgs`
    : perMonth(kpis.totalRequests, months);

  const auxiliaryCard = lensMetered
    ? kpiCard('Cached Tokens', fmt(lensMetered.totals.cachedTokens))
    : kpiCard('Tool Rounds', fmt(kpis.totalToolCallRounds));

  const premiumCard = lensMetered
    ? kpiCard('Coverage', `${(lensMetered.totals.coverage * 100).toFixed(1)}%`, `${fmt(lensMetered.totals.roundsWithCredits)} metered rounds`)
    : kpiCard('Premium', kpis.totalPremium.toFixed(1) + '×', perMonthDecimal(kpis.totalPremium, months));

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Copilot Usage Dashboard</title>
${commonStyles()}
</head>
<body>
<div class="header">
  <h1>${headerIcon()} Copilot Usage — All Workspaces</h1>
  <div class="header-actions">
    ${lensToggleHtml(activeLens, billingAvailable)}
  </div>
</div>

${debugLogBanner(showDebugLogBanner)}

${dateRangeToolbarHtml(dateRange, `
  <button class="btn btn-secondary" onclick="openWorkspace()" title="Open Workspace View" aria-label="Open Workspace View">📂</button>
  ${enableCostEstimator ? `<button class="btn btn-secondary" onclick="openCostEstimator()" title="Open Cost Estimator (Preview)" aria-label="Open Cost Estimator">💵</button>` : ''}
  <button class="btn btn-secondary" onclick="exportReport()" title="Download Excel Report" aria-label="Download Excel Report">${excelIcon()}</button>
  <button class="btn" onclick="refresh()" title="Refresh data" aria-label="Refresh data">↻</button>
  <button class="btn btn-secondary" onclick="openSettings()" title="Settings" aria-label="Settings">⚙</button>
  <button class="btn btn-star" onclick="starGitHub()" title="Star on GitHub" aria-label="Star on GitHub">⭐</button>
`)}

<div class="kpi-row">
  ${kpiCard(requestLabel, requestValue, requestSub)}
  ${kpiCard('Input Tokens', fmt(inputTokens))}
  ${kpiCard('Output Tokens', fmt(outputTokens))}
  ${auxiliaryCard}
  ${premiumCard}
  ${creditsCard}
  ${kpiCard('Scope', fmt(kpis.workspaceCount), `${fmt(kpis.sessionCount)} sessions`)}
</div>

${reconciliationStrip(metered)}

<div class="charts-row">
  <div class="chart-box"><canvas id="dailyChart"></canvas></div>
  <div class="chart-box chart-small"><div class="model-chart-wrap"><canvas id="modelChart"></canvas></div><div id="modelLegend" class="chart-legend-grid"></div></div>
</div>

<div class="tables-row">
  <div class="table-box">
    <h3>Models</h3>
    <table><thead><tr><th>Model</th><th>${modelTable.requestHeader}</th><th>${modelTable.tokenHeader}</th><th>${modelTable.premiumHeader}</th><th>Credits</th><th>Metered</th></tr></thead>
    <tbody>${modelTable.rowsHtml}</tbody></table>
  </div>
  <div class="table-box">
    <h3>Workspaces</h3>
    <table><thead><tr><th>Workspace</th><th>Requests</th><th>Prompt</th><th>Output</th><th>Premium</th><th>Credits</th><th>Top Model</th></tr></thead>
    <tbody>${wsRows}</tbody></table>
  </div>
  <div class="table-box">
    <h3>Repositories</h3>
    <table><thead><tr><th>Repository</th><th>Requests</th><th>Prompt</th><th>Output</th><th>Share</th><th>Top Model</th></tr></thead>
    <tbody>${repoRowsHtml}</tbody></table>
  </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"></script>
<script>
const vscode = acquireVsCodeApi();
function refresh() { vscode.postMessage({ command: 'refresh' }); }
function openWorkspace() { vscode.postMessage({ command: 'openWorkspace' }); }
function openCostEstimator() { vscode.postMessage({ command: 'openCostEstimator' }); }
function exportReport() { vscode.postMessage({ command: 'exportReport' }); }
function starGitHub() { vscode.postMessage({ command: 'openGitHub' }); }
function openSettings() { vscode.postMessage({ command: 'openSettings' }); }
function openDebugLogSettings() { vscode.postMessage({ command: 'openDebugLogSettings' }); }
function setLens(lens) { vscode.postMessage({ command: 'setLens', lens }); }
function setDateRange(range) { vscode.postMessage({ command: 'setDateRange', range }); }
${autoRefreshScript(autoRefreshSeconds)}
${chartsScript(
  dailyLabels,
  dailyPrompt,
  dailyOutput,
  modelLabels,
  modelData,
  lensMetered ? 'Daily Internal Token Usage' : 'Daily Token Usage',
  activeLens === 'billing' ? 'Input Tokens' : 'Prompt Tokens',
  activeLens === 'billing' ? 'Output Tokens' : 'Output Tokens',
  activeLens === 'billing' ? 'Model Round Distribution' : 'Model Distribution',
)}
</script>
</body></html>`;
}

// ── Shared HTML helpers ─────────────────────────────────────────────────

function commonStyles(): string {
  return `<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html { height: 100%; }
  body { min-height: 100%; overflow-y: auto; font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif); background: var(--vscode-editor-background, #0f172a); color: var(--vscode-editor-foreground, #e2e8f0); padding: 16px; display: flex; flex-direction: column; }
  .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
  .header h1 { font-size: 1.3em; display: flex; align-items: center; gap: 8px; }
  .header h1 svg { width: 1.4em; height: 1.4em; flex-shrink: 0; }
  .header-actions { display: flex; gap: 8px; align-items: center; }
  .control-bar { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 14px; padding: 8px 10px; border: 1px solid var(--vscode-editorWidget-border, #334155); border-radius: 8px; background: color-mix(in srgb, var(--vscode-editorWidget-background, #1e293b) 90%, transparent); }
  .range-group { display: inline-flex; align-items: center; gap: 8px; min-width: 220px; }
  .range-icon { font-size: 0.9em; opacity: 0.9; }
  .range-select { background: var(--vscode-dropdown-background, #1e293b); color: var(--vscode-dropdown-foreground, #e2e8f0); border: 1px solid var(--vscode-dropdown-border, #334155); height: 28px; padding: 0 8px; border-radius: 4px; font-size: 0.78em; min-width: 160px; }
  .control-actions { display: flex; gap: 8px; align-items: center; }
  .lens-toggle { display: inline-flex; border: 1px solid var(--vscode-editorWidget-border, #334155); border-radius: 6px; overflow: hidden; }
  .lens-btn { border: none; padding: 6px 10px; background: var(--vscode-button-secondaryBackground, #334155); color: var(--vscode-button-secondaryForeground, #e2e8f0); font-size: 0.76em; cursor: pointer; }
  .lens-btn + .lens-btn { border-left: 1px solid var(--vscode-editorWidget-border, #334155); }
  .lens-btn.active { background: var(--vscode-button-background, #2563eb); color: var(--vscode-button-foreground, #fff); }
  .lens-btn.disabled { opacity: 0.5; cursor: not-allowed; }
  .btn { background: var(--vscode-button-background, #2563eb); color: var(--vscode-button-foreground, #fff); border: none; padding: 0; width: 30px; height: 30px; border-radius: 4px; cursor: pointer; font-size: 1.05em; display: inline-flex; align-items: center; justify-content: center; line-height: 1; }
  .btn:hover { opacity: 0.85; }
  .btn svg { width: 16px; height: 16px; display: block; }
  .btn-secondary { background: var(--vscode-button-secondaryBackground, #334155); color: var(--vscode-button-secondaryForeground, #e2e8f0); }
  .btn-star { background: transparent; border: 1px solid #e3b341; color: #e3b341; }
  .btn-star:hover { background: rgba(227,179,65,0.15); opacity: 1; }
  .auto-refresh-select { background: var(--vscode-dropdown-background, #1e293b); color: var(--vscode-dropdown-foreground, #e2e8f0); border: 1px solid var(--vscode-dropdown-border, #334155); height: 30px; padding: 0 8px; border-radius: 4px; font-size: 0.8em; cursor: pointer; }
  .kpi-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; margin-bottom: 16px; }
  .kpi { background: var(--vscode-editorWidget-background, #1e293b); border: 1px solid var(--vscode-editorWidget-border, #334155); border-radius: 8px; padding: 12px; text-align: center; }
  .kpi .value { font-size: 1.5em; font-weight: 700; color: var(--vscode-textLink-foreground, #38bdf8); }
  .kpi .value.secondary { font-size: 0.95em; font-weight: 600; color: var(--vscode-editor-foreground, #e2e8f0); margin-top: 4px; }
  .kpi .label { font-size: 0.75em; color: var(--vscode-descriptionForeground, #94a3b8); margin-top: 2px; }
  .kpi .sub { font-size: 0.7em; color: var(--vscode-descriptionForeground, #94a3b8); margin-top: 4px; opacity: 0.85; }
  .kpi .kpi-meta { margin-top: 6px; display: flex; justify-content: center; }
  .recon-strip { display: flex; flex-wrap: wrap; gap: 8px 12px; margin-bottom: 16px; padding: 10px 12px; border: 1px solid var(--vscode-editorWidget-border, #334155); border-radius: 8px; background: color-mix(in srgb, var(--vscode-editorWidget-background, #1e293b) 85%, transparent); font-size: 0.8em; color: var(--vscode-descriptionForeground, #94a3b8); }
  .recon-strip strong { color: var(--vscode-editor-foreground, #e2e8f0); }
  .pill { display: inline-flex; align-items: center; border-radius: 999px; padding: 1px 8px; font-size: 0.72em; font-weight: 600; }
  .pill-exact { background: color-mix(in srgb, var(--vscode-charts-green, #16a34a) 24%, transparent); color: var(--vscode-charts-green, #16a34a); border: 1px solid color-mix(in srgb, var(--vscode-charts-green, #16a34a) 55%, transparent); }
  .pill-partial { background: color-mix(in srgb, var(--vscode-charts-yellow, #f59e0b) 24%, transparent); color: var(--vscode-charts-yellow, #f59e0b); border: 1px solid color-mix(in srgb, var(--vscode-charts-yellow, #f59e0b) 55%, transparent); }
  .pill-unavailable { background: color-mix(in srgb, var(--vscode-charts-red, #ef4444) 24%, transparent); color: var(--vscode-charts-red, #ef4444); border: 1px solid color-mix(in srgb, var(--vscode-charts-red, #ef4444) 55%, transparent); }
  .charts-row { display: flex; gap: 12px; margin-bottom: 16px; flex: 1 1 auto; min-height: 340px; align-items: stretch; flex-wrap: wrap; }
  .chart-box { flex: 2 1 320px; min-height: 340px; background: var(--vscode-editorWidget-background, #1e293b); border-radius: 8px; padding: 12px; border: 1px solid var(--vscode-editorWidget-border, #334155); position: relative; overflow: hidden; }
  .chart-box canvas { position: absolute; top: 12px; left: 12px; right: 12px; bottom: 12px; }
  .chart-small { flex: 1 1 300px; display: flex; flex-direction: column; align-items: center; gap: 10px; overflow: hidden; }
  .model-chart-wrap { flex: 1 1 auto; min-height: 140px; aspect-ratio: 1 / 1; width: auto; max-width: 100%; position: relative; margin: 0 auto; }
  .model-chart-wrap canvas { position: absolute !important; inset: 0; width: 100% !important; height: 100% !important; }
  .chart-legend-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-content: center; justify-content: center; gap: 8px 16px; max-height: 40%; overflow: auto; width: fit-content; max-width: 100%; margin: 0 auto; padding-right: 2px; flex: 0 1 auto; }
  .chart-legend-item { display: flex; align-items: center; gap: 6px; min-width: 0; }
  .chart-legend-swatch { width: 10px; height: 10px; border-radius: 2px; flex: 0 0 auto; }
  .chart-legend-text { font-size: 10px; color: var(--vscode-foreground, #e2e8f0); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tables-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 12px; align-items: start; }
  .table-box { min-width: 0; background: var(--vscode-editorWidget-background, #1e293b); border-radius: 8px; padding: 12px; border: 1px solid var(--vscode-editorWidget-border, #334155); overflow-x: auto; }
  .table-box table { min-width: 500px; }
  .notice-banner { display: flex; align-items: center; justify-content: space-between; gap: 12px; background: color-mix(in srgb, var(--vscode-inputValidation-warningBackground, #7c2d12) 75%, transparent); border: 1px solid var(--vscode-inputValidation-warningBorder, #f59e0b); color: var(--vscode-inputValidation-warningForeground, #fde68a); border-radius: 8px; padding: 10px 12px; margin-bottom: 14px; font-size: 0.85em; }
  .notice-banner strong { color: inherit; }
  .notice-banner .banner-btn { background: transparent; border: 1px solid currentColor; color: inherit; border-radius: 4px; padding: 4px 10px; font-size: 0.85em; cursor: pointer; white-space: nowrap; }
  .notice-banner .banner-btn:hover { opacity: 0.85; }
  .loading { display: flex; flex-direction: column; align-items: center; justify-content: center; flex: 1 1 auto; min-height: 60vh; gap: 16px; }
  .spinner { width: 40px; height: 40px; border: 4px solid var(--vscode-editorWidget-border, #334155); border-top-color: var(--vscode-textLink-foreground, #38bdf8); border-radius: 50%; animation: spin 0.8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .loading p { color: var(--vscode-descriptionForeground, #94a3b8); font-size: 0.9em; }
  .table-box h3 { font-size: 0.95em; margin-bottom: 8px; color: var(--vscode-textLink-foreground, #38bdf8); }
  table { width: 100%; border-collapse: collapse; font-size: 0.8em; }
  th { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--vscode-editorWidget-border, #334155); color: var(--vscode-descriptionForeground, #94a3b8); font-weight: 600; }
  td { padding: 5px 8px; border-bottom: 1px solid var(--vscode-editorWidget-border, #1e293b); }
  tr:hover td { background: var(--vscode-list-hoverBackground, rgba(0,0,0,0.05)); }
  .error { text-align: center; padding: 60px 20px; color: var(--vscode-descriptionForeground, #94a3b8); }
  .error h2 { margin-bottom: 8px; }
  </style>`;
}

function kpiCard(label: string, value: string, sub?: string): string {
  const subHtml = sub ? `<div class="sub">${esc(sub)}</div>` : '';
  return `<div class="kpi"><div class="value">${esc(value)}</div><div class="label">${esc(label)}</div>${subHtml}</div>`;
}

function kpiCardDual(label: string, primary: string, secondary: string, badgeText?: string, badgeClass?: string): string {
  const badge = badgeText
    ? `<div class="kpi-meta"><span class="${badgeClass || 'pill'}">${esc(badgeText)}</span></div>`
    : '';
  return `<div class="kpi"><div class="value">${esc(primary)}</div><div class="value secondary">${esc(secondary)}</div><div class="label">${esc(label)}</div>${badge}</div>`;
}

/** Format "≈ N/mo" only when the range covers ≥0.9 months. */
function perMonth(total: number, months: number): string | undefined {
  if (months < 0.9) { return undefined; }
  const v = total / months;
  return `≈ ${fmt(Math.round(v))}/mo`;
}

function perMonthDecimal(total: number, months: number): string | undefined {
  if (months < 0.9) { return undefined; }
  return `≈ ${(total / months).toFixed(1)}×/mo`;
}

function chartsScript(
  dailyLabels: string,
  dailyPrompt: string,
  dailyOutput: string,
  modelLabels: string,
  modelData: string,
  dailyTitle: string,
  promptLabel: string,
  outputLabel: string,
  modelTitle: string,
): string {
  return `
var _cs = getComputedStyle(document.body);
var _fg = _cs.getPropertyValue('--vscode-foreground').trim() || _cs.getPropertyValue('--vscode-editor-foreground').trim() || '#1e293b';
var _muted = _fg;
var _grid = _cs.getPropertyValue('--vscode-editorWidget-border').trim() || _cs.getPropertyValue('--vscode-panel-border').trim() || '#cbd5e1';

new Chart(document.getElementById('dailyChart'), {
  type: 'bar',
  data: {
    labels: ${dailyLabels},
    datasets: [
      { label: ${JSON.stringify(promptLabel)}, data: ${dailyPrompt}, backgroundColor: 'rgba(56,189,248,0.7)' },
      { label: ${JSON.stringify(outputLabel)}, data: ${dailyOutput}, backgroundColor: 'rgba(168,85,247,0.7)' },
    ],
  },
  options: { responsive: true, maintainAspectRatio: false, plugins: { title: { display: true, text: ${JSON.stringify(dailyTitle)}, color: _fg }, legend: { labels: { color: _fg } } }, scales: { x: { stacked: true, ticks: { color: _muted }, grid: { color: _grid } }, y: { stacked: true, ticks: { color: _muted }, grid: { color: _grid } } } },
});

function renderModelLegend(chart, containerId) {
  var container = document.getElementById(containerId);
  if (!container) { return; }
  container.innerHTML = '';

  var labels = chart.data.labels || [];
  var dataset = chart.data.datasets && chart.data.datasets[0] ? chart.data.datasets[0] : undefined;
  var colors = dataset && dataset.backgroundColor ? dataset.backgroundColor : [];
  var colorList = Array.isArray(colors) ? colors : [colors];

  labels.forEach(function(label, i) {
    var item = document.createElement('div');
    item.className = 'chart-legend-item';

    var swatch = document.createElement('span');
    swatch.className = 'chart-legend-swatch';
    swatch.style.backgroundColor = String(colorList[i % colorList.length] || '#94a3b8');

    var text = document.createElement('span');
    text.className = 'chart-legend-text';
    text.textContent = String(label);
    text.title = String(label);

    item.appendChild(swatch);
    item.appendChild(text);
    container.appendChild(item);
  });
}

var modelChart = new Chart(document.getElementById('modelChart'), {
  type: 'doughnut',
  data: {
    labels: ${modelLabels},
    datasets: [{ data: ${modelData}, backgroundColor: ['#38bdf8','#a855f7','#22c55e','#f59e0b','#ef4444','#ec4899','#14b8a6','#f97316'] }],
  },
  options: { responsive: true, maintainAspectRatio: false, plugins: { title: { display: true, text: ${JSON.stringify(modelTitle)}, color: _fg }, legend: { display: false } } },
});

renderModelLegend(modelChart, 'modelLegend');
`;
}

function autoRefreshScript(seconds: number): string {
  return `
(function() {
  var s = ${seconds};
  if (s > 0) { setInterval(function() { refresh(); }, s * 1000); }
})();
`;
}

function debugLogBanner(show: boolean): string {
  if (!show) { return ''; }
  return `<div class="notice-banner">
    <div><strong>Limited token visibility detected.</strong> Enable Copilot Chat agent debug file logging for best cross-version parsing (legacy JSON, JSONL, and recent schema changes).</div>
    <button class="banner-btn" onclick="openDebugLogSettings()">Open Setting</button>
  </div>`;
}

function errorPage(msg: string, showDashboardButton = false, showDebugLogBanner = false): string {
  const dashBtn = showDashboardButton
    ? `<br><br><button class="btn" onclick="openDashboard()" style="font-size:1em;padding:10px 24px;">🌐 Open Global Dashboard</button>`
    : '';
  const script = (showDashboardButton || showDebugLogBanner)
    ? `<script>
         const vscode = acquireVsCodeApi();
         function openDashboard() { vscode.postMessage({ command: 'openDashboard' }); }
         function openDebugLogSettings() { vscode.postMessage({ command: 'openDebugLogSettings' }); }
       </script>`
    : '';
  return `<!DOCTYPE html><html><head>${commonStyles()}</head><body>${debugLogBanner(showDebugLogBanner)}<div class="error"><h2>No Data</h2><p>${esc(msg)}</p>${dashBtn}</div>${script}</body></html>`;
}

function loadingPage(): string {
  return `<!DOCTYPE html><html><head>${commonStyles()}</head><body><div class="loading"><div class="spinner"></div><p>Loading Copilot usage data\u2026</p></div></body></html>`;
}

function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

function fmtDecimal(n: number, digits: number): string {
  if (Number.isInteger(n)) {
    return fmt(n);
  }
  return n.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function shortModel(modelId: string): string {
  return modelId.replace(/^copilot\//, '');
}

function shortPath(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/');
  return parts.length > 2 ? '…/' + parts.slice(-2).join('/') : p;
}

function headerIcon(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><linearGradient id="lens" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#58a6ff" stop-opacity="0.08"/><stop offset="100%" stop-color="#58a6ff" stop-opacity="0.02"/></linearGradient></defs><circle cx="224" cy="224" r="176" fill="url(#lens)" stroke="#58a6ff" stroke-width="16" stroke-linecap="round"/><line x1="347" y1="347" x2="492" y2="492" stroke="#58a6ff" stroke-width="28" stroke-linecap="round"/><ellipse cx="224" cy="200" rx="120" ry="100" fill="#e6edf3" opacity="0.92"/><rect x="104" y="200" width="240" height="60" rx="10" fill="#e6edf3" opacity="0.92"/><ellipse cx="224" cy="260" rx="120" ry="32" fill="#e6edf3" opacity="0.92"/><rect x="124" y="195" width="200" height="52" rx="20" fill="#0d1117" opacity="0.9"/><circle cx="179" cy="221" r="18" fill="#58a6ff"/><circle cx="269" cy="221" r="18" fill="#58a6ff"/></svg>`;
}

/** Spreadsheet mark for the report export button. */
function excelIcon(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" aria-hidden="true" focusable="false">`
    + `<rect x="1" y="2" width="14" height="12" rx="2" fill="#1d6f42"/>`
    + `<path d="M5 5.6 11 10.4M11 5.6 5 10.4" stroke="#ffffff" stroke-width="1.7" stroke-linecap="round" fill="none"/>`
    + `</svg>`;
}

// ── Workspace HTML helper ───────────────────────────────────────────────

export { getWorkspaceHtml };

function getWorkspaceHtml(
  kpis?: KpiTotals,
  models?: ModelStats[],
  daily?: DailyStats[],
  wsPath?: string,
  error?: string,
  showDashboardButton = false,
  autoRefreshSeconds = 0,
  months = 0,
  showDebugLogBanner = false,
  repoStats?: RepoAttributionStats,
  lens: UsageLens = 'developer',
  metered?: MeteredViewData,
  dateRange: DateRange = 'all',
): string {
  if (error || !kpis) {
    return errorPage(error || 'No data', showDashboardButton, showDebugLogBanner);
  }

  const baseModels = models || [];
  const lensMetered = meteredDataForLens(lens, metered);
  const billingAvailable = isBillingLensAvailable(metered);
  const activeLens: UsageLens = lensMetered ? 'billing' : 'developer';

  const modelTable = buildModelRows(baseModels, metered?.models || [], activeLens);

  const dailySeries = lensMetered
    ? lensMetered.daily.map(d => ({ date: d.date, prompt: d.inputTokens, output: d.outputTokens }))
    : (daily || []).map(d => ({ date: d.date, prompt: d.promptTokens, output: d.outputTokens }));
  const modelSeries = activeLens === 'billing'
    ? (metered?.models || []).map(m => ({ label: shortModel(m.modelId), value: m.rounds }))
    : baseModels.map(m => ({ label: shortModel(m.modelId), value: m.requests }));

  const dailyLabels = JSON.stringify(dailySeries.map(d => d.date));
  const dailyPrompt = JSON.stringify(dailySeries.map(d => d.prompt));
  const dailyOutput = JSON.stringify(dailySeries.map(d => d.output));
  const modelLabels = JSON.stringify(modelSeries.map(m => m.label));
  const modelData = JSON.stringify(modelSeries.map(m => m.value));

  const totalTokens = Math.max(0, kpis.totalPromptTokens + kpis.totalOutputTokens);
  const repoRows = (repoStats?.rows || []).map(row => {
    const rowTotal = row.promptTokens + row.outputTokens;
    const share = totalTokens > 0 ? `${((rowTotal / totalTokens) * 100).toFixed(1)}%` : '0.0%';
    return `<tr><td>${esc(row.displayName)}</td><td>${fmtDecimal(row.requests, 1)}</td><td>${fmtDecimal(row.promptTokens, 1)}</td><td>${fmtDecimal(row.outputTokens, 1)}</td><td>${share}</td><td>${esc(shortModel(row.topModel))}</td></tr>`;
  }).join('');
  const repoRowsHtml = repoRows || '<tr><td colspan="6">No repository attribution signals detected.</td></tr>';

  const title = wsPath ? shortPath(wsPath) : 'Current Workspace';

  const inputTokens = lensMetered ? lensMetered.totals.inputTokens : kpis.totalPromptTokens;
  const outputTokens = lensMetered ? lensMetered.totals.outputTokens : kpis.totalOutputTokens;

  const creditsCard = metered
    ? kpiCardDual(
      'Credits',
      fmt(Math.round(metered.totals.credits)),
      `≈ ${fmt(Math.round(kpis.totalCredits))} visible`,
      confidenceLabel(metered.reconciliation.confidence),
      confidenceClass(metered.reconciliation.confidence),
    )
    : kpiCard('Credits', fmt(Math.round(kpis.totalCredits)), perMonth(Math.round(kpis.totalCredits), months) ?? '≈ token-metered');

  const requestLabel = lensMetered ? 'Model Rounds' : 'Requests';
  const requestValue = lensMetered ? fmt(lensMetered.totals.rounds) : fmt(kpis.totalRequests);
  const requestSub = lensMetered
    ? `${fmt(lensMetered.totals.userMessages)} user msgs`
    : perMonth(kpis.totalRequests, months);

  const auxiliaryCard = lensMetered
    ? kpiCard('Cached Tokens', fmt(lensMetered.totals.cachedTokens))
    : kpiCard('Tool Rounds', fmt(kpis.totalToolCallRounds));

  const premiumCard = lensMetered
    ? kpiCard('Coverage', `${(lensMetered.totals.coverage * 100).toFixed(1)}%`, `${fmt(lensMetered.totals.roundsWithCredits)} metered rounds`)
    : kpiCard('Premium', kpis.totalPremium.toFixed(1) + '×', perMonthDecimal(kpis.totalPremium, months));

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Copilot Usage — ${esc(title)}</title>
${commonStyles()}
</head>
<body>
<div class="header">
  <h1>${headerIcon()} Copilot Usage — ${esc(title)}</h1>
  <div class="header-actions">
    ${lensToggleHtml(activeLens, billingAvailable)}
  </div>
</div>

${debugLogBanner(showDebugLogBanner)}

${dateRangeToolbarHtml(dateRange, `
  <button class="btn btn-secondary" onclick="openDashboard()" title="Open Global Dashboard" aria-label="Open Global Dashboard">🌐</button>
  ${enableCostEstimator ? `<button class="btn btn-secondary" onclick="openCostEstimator()" title="Open Cost Estimator (Preview)" aria-label="Open Cost Estimator">💵</button>` : ''}
  <button class="btn" onclick="refresh()" title="Refresh data" aria-label="Refresh data">↻</button>
  <button class="btn btn-secondary" onclick="openSettings()" title="Settings" aria-label="Settings">⚙</button>
  <button class="btn btn-star" onclick="starGitHub()" title="Star on GitHub" aria-label="Star on GitHub">⭐</button>
`)}

<div class="kpi-row">
  ${kpiCard(requestLabel, requestValue, requestSub)}
  ${kpiCard('Input Tokens', fmt(inputTokens))}
  ${kpiCard('Output Tokens', fmt(outputTokens))}
  ${auxiliaryCard}
  ${premiumCard}
  ${creditsCard}
  ${kpiCard('Scope', fmt(kpis.sessionCount), `${fmt(repoStats?.rows.length ?? 0)} repos`)}
</div>

${reconciliationStrip(metered)}

<div class="charts-row">
  <div class="chart-box"><canvas id="dailyChart"></canvas></div>
  <div class="chart-box chart-small"><div class="model-chart-wrap"><canvas id="modelChart"></canvas></div><div id="modelLegend" class="chart-legend-grid"></div></div>
</div>

<div class="tables-row">
  <div class="table-box">
    <h3>Models</h3>
    <table><thead><tr><th>Model</th><th>${modelTable.requestHeader}</th><th>${modelTable.tokenHeader}</th><th>${modelTable.premiumHeader}</th><th>Credits</th><th>Metered</th></tr></thead>
    <tbody>${modelTable.rowsHtml}</tbody></table>
  </div>
  <div class="table-box">
    <h3>Repositories</h3>
    <table><thead><tr><th>Repository</th><th>Requests</th><th>Prompt</th><th>Output</th><th>Share</th><th>Top Model</th></tr></thead>
    <tbody>${repoRowsHtml}</tbody></table>
  </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"></script>
<script>
const vscode = acquireVsCodeApi();
function refresh() { vscode.postMessage({ command: 'refresh' }); }
function openDashboard() { vscode.postMessage({ command: 'openDashboard' }); }
function openCostEstimator() { vscode.postMessage({ command: 'openCostEstimator' }); }
function starGitHub() { vscode.postMessage({ command: 'openGitHub' }); }
function openSettings() { vscode.postMessage({ command: 'openSettings' }); }
function openDebugLogSettings() { vscode.postMessage({ command: 'openDebugLogSettings' }); }
function setLens(lens) { vscode.postMessage({ command: 'setLens', lens }); }
function setDateRange(range) { vscode.postMessage({ command: 'setDateRange', range }); }
${autoRefreshScript(autoRefreshSeconds)}
${chartsScript(
  dailyLabels,
  dailyPrompt,
  dailyOutput,
  modelLabels,
  modelData,
  lensMetered ? 'Daily Internal Token Usage' : 'Daily Token Usage',
  activeLens === 'billing' ? 'Input Tokens' : 'Prompt Tokens',
  activeLens === 'billing' ? 'Output Tokens' : 'Output Tokens',
  activeLens === 'billing' ? 'Model Round Distribution' : 'Model Distribution',
)}
</script>
</body></html>`;
}

// === Shared exports for feature folders (e.g. costEstimator) ===
export const commonStylesShared = commonStyles;
export const loadingPageShared = loadingPage;
export const escShared = esc;
export const fmtShared = fmt;
export const headerIconShared = headerIcon;

