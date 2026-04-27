/** Workspace-scoped analysis webview panel. */

import * as vscode from 'vscode';
import { findCurrentWorkspace, discoverWorkspaces } from '../core/discovery';
import { parseAllFiles, flattenEvents, computeKpis, computeModelStats, computeDailyStats, computeWorkspaceStats } from '../core/aggregator';

export class WorkspacePanel {
  public static currentPanel: WorkspacePanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];
  private disposed = false;
  private autoRefreshSeconds = 0;
  private dateRange: DateRange = 'all';

  private constructor(panel: vscode.WebviewPanel, private extensionUri: vscode.Uri) {
    this.panel = panel;
    this.panel.webview.options = { enableScripts: true };
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      async (msg) => {
        if (msg.command === 'refresh') { this.showLoading(); await this.loadData(); }
        if (msg.command === 'setAutoRefresh') { this.autoRefreshSeconds = msg.seconds; }
        if (msg.command === 'setDateRange') {
          this.dateRange = normalizeDateRange(msg.range);
          this.showLoading();
          await this.loadData();
        }
        if (msg.command === 'openDashboard') { await DashboardPanel.createOrShow(this.extensionUri); }
        if (msg.command === 'openGitHub') { vscode.env.openExternal(vscode.Uri.parse('https://github.com/SachiHarshitha/copilot-usage')); }
      },
      null,
      this.disposables,
    );
  }

  public static async refresh(): Promise<void> {
    if (WorkspacePanel.currentPanel) {
      await WorkspacePanel.currentPanel.loadData();
    }
  }

  public static async createOrShow(extensionUri: vscode.Uri): Promise<void> {
    const column = vscode.ViewColumn.Beside;
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
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      this.setHtml(getWorkspaceHtml(undefined, undefined, undefined, undefined, 'No workspace folder open.', true, this.autoRefreshSeconds, this.dateRange));
      return;
    }

    const wsFileUri = vscode.workspace.workspaceFile?.toString();
    const folderPaths = folders.map(f => f.uri.fsPath);
    const ws = await findCurrentWorkspace(wsFileUri, folderPaths);
    if (!ws) {
      const searched = wsFileUri
        ? `workspace file: ${vscode.workspace.workspaceFile!.fsPath}`
        : folderPaths.join(', ');
      this.setHtml(getWorkspaceHtml(undefined, undefined, undefined, undefined,
        `No Copilot session data found for this workspace.\n\nLooked for: ${searched}`, true, this.autoRefreshSeconds, this.dateRange));
      return;
    }

    const parsed = await parseAllFiles([ws]);
    const allEvents = flattenEvents(parsed);
    const events = filterEventsByDateRange(allEvents, this.dateRange);
    const kpis = computeKpis(parsed, events);
    const models = computeModelStats(events);
    const daily = computeDailyStats(events);

    this.setHtml(getWorkspaceHtml(kpis, models, daily, ws.workspacePath, undefined, false, this.autoRefreshSeconds, this.dateRange, monthsCovered(this.dateRange, events)));
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
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];
  private disposed = false;
  private autoRefreshSeconds = 0;
  private dateRange: DateRange = 'all';

  private constructor(panel: vscode.WebviewPanel, private extensionUri: vscode.Uri) {
    this.panel = panel;
    this.panel.webview.options = { enableScripts: true };
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      async (msg) => {
        if (msg.command === 'refresh') { this.showLoading(); await this.loadData(); }
        if (msg.command === 'setAutoRefresh') { this.autoRefreshSeconds = msg.seconds; }
        if (msg.command === 'setDateRange') {
          this.dateRange = normalizeDateRange(msg.range);
          this.showLoading();
          await this.loadData();
        }
        if (msg.command === 'openWorkspace') { await WorkspacePanel.createOrShow(this.extensionUri); }
        if (msg.command === 'openGitHub') { vscode.env.openExternal(vscode.Uri.parse('https://github.com/SachiHarshitha/copilot-usage')); }
      },
      null,
      this.disposables,
    );
  }

  public static async refresh(): Promise<void> {
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

  private setHtml(html: string): void {
    if (!this.disposed) { this.panel.webview.html = html; }
  }

  private showLoading(): void {
    this.setHtml(loadingPage());
  }

  private async loadData(): Promise<void> {
    const workspaces = await discoverWorkspaces();
    if (workspaces.length === 0) {
      this.setHtml(getDashboardHtml(undefined, undefined, undefined, undefined, 'No Copilot session data found.', this.autoRefreshSeconds, this.dateRange));
      return;
    }

    const parsed = await parseAllFiles(workspaces);
    const allEvents = flattenEvents(parsed);
    const events = filterEventsByDateRange(allEvents, this.dateRange);
    const kpis = computeKpis(parsed, events);
    const models = computeModelStats(events);
    const daily = computeDailyStats(events);

    const wsStats = computeWorkspaceStats(parsed, events);

    this.setHtml(getDashboardHtml(kpis, models, daily, wsStats, undefined, this.autoRefreshSeconds, this.dateRange, monthsCovered(this.dateRange, events)));
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

import { KpiTotals, ModelStats, DailyStats, WorkspaceStats, RequestEvent } from '../core/types';

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

function dateRangeSelect(range: DateRange): string {
  const options = DATE_RANGES.map(r =>
    `<option value="${r.v}"${r.v === range ? ' selected' : ''}>${esc(r.l)}</option>`
  ).join('');
  return `<select class="auto-refresh-select" id="dateRangeSelect" onchange="setDateRange(this.value)" title="Date range">${options}</select>`;
}

function dateRangeScript(): string {
  return `
function setDateRange(v) { vscode.postMessage({ command: 'setDateRange', range: v }); }
`;
}

function getDashboardHtml(
  kpis?: KpiTotals,
  models?: ModelStats[],
  daily?: DailyStats[],
  wsStats?: WorkspaceStats[],
  error?: string,
  autoRefreshSeconds = 0,
  dateRange: DateRange = 'all',
  months = 0,
): string {
  if (error || !kpis) {
    return errorPage(error || 'No data');
  }

  const modelRows = (models || []).map(m =>
    `<tr><td>${esc(shortModel(m.modelId))}</td><td>${fmt(m.requests)}</td><td>${fmt(m.totalTokens)}</td><td>${m.premium.toFixed(1)}×</td></tr>`
  ).join('');

  const wsRows = (wsStats || []).map(w => {
    const display = shortPath(w.workspacePath || w.workspaceId);
    return `<tr><td title="${esc(w.workspacePath)}">${esc(display)}</td><td>${fmt(w.requests)}</td><td>${fmt(w.promptTokens)}</td><td>${fmt(w.outputTokens)}</td><td>${w.premium.toFixed(1)}×</td><td>${esc(shortModel(w.topModel))}</td></tr>`;
  }).join('');

  const dailyLabels = JSON.stringify((daily || []).map(d => d.date));
  const dailyPrompt = JSON.stringify((daily || []).map(d => d.promptTokens));
  const dailyOutput = JSON.stringify((daily || []).map(d => d.outputTokens));
  const modelLabels = JSON.stringify((models || []).map(m => shortModel(m.modelId)));
  const modelData = JSON.stringify((models || []).map(m => m.requests));

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
    <button class="btn btn-star" onclick="starGitHub()" title="Star on GitHub">⭐</button>
    <button class="btn btn-secondary" onclick="openWorkspace()" title="Open Workspace View">📂</button>
    <button class="btn" onclick="refresh()" title="Refresh data">↻</button>
    ${dateRangeSelect(dateRange)}
    ${autoRefreshSelect(autoRefreshSeconds)}
  </div>
</div>

<div class="kpi-row">
  ${kpiCard('Requests', fmt(kpis.totalRequests), perMonth(kpis.totalRequests, months))}
  ${kpiCard('Prompt Tokens', fmt(kpis.totalPromptTokens), perMonth(kpis.totalPromptTokens, months))}
  ${kpiCard('Output Tokens', fmt(kpis.totalOutputTokens), perMonth(kpis.totalOutputTokens, months))}
  ${kpiCard('Tool Rounds', fmt(kpis.totalToolCallRounds))}
  ${kpiCard('Premium', kpis.totalPremium.toFixed(1) + '×', perMonthDecimal(kpis.totalPremium, months))}
  ${kpiCard('Workspaces', String(kpis.workspaceCount))}
  ${kpiCard('Sessions', String(kpis.sessionCount))}
</div>

<div class="charts-row">
  <div class="chart-box"><canvas id="dailyChart"></canvas></div>
  <div class="chart-box chart-small"><canvas id="modelChart"></canvas></div>
</div>

<div class="tables-row">
  <div class="table-box">
    <h3>Models</h3>
    <table><thead><tr><th>Model</th><th>Requests</th><th>Tokens</th><th>Premium</th></tr></thead>
    <tbody>${modelRows}</tbody></table>
  </div>
  <div class="table-box" style="flex:2">
    <h3>Workspaces</h3>
    <table><thead><tr><th>Workspace</th><th>Requests</th><th>Prompt</th><th>Output</th><th>Premium</th><th>Top Model</th></tr></thead>
    <tbody>${wsRows}</tbody></table>
  </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"></script>
<script>
const vscode = acquireVsCodeApi();
function refresh() { vscode.postMessage({ command: 'refresh' }); }
function openWorkspace() { vscode.postMessage({ command: 'openWorkspace' }); }
function starGitHub() { vscode.postMessage({ command: 'openGitHub' }); }
${dateRangeScript()}
${autoRefreshScript()}
${chartsScript(dailyLabels, dailyPrompt, dailyOutput, modelLabels, modelData)}
</script>
</body></html>`;
}

// ── Shared HTML helpers ─────────────────────────────────────────────────

function commonStyles(): string {
  return `<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { height: 100%; }
  body { font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif); background: var(--vscode-editor-background, #0f172a); color: var(--vscode-editor-foreground, #e2e8f0); padding: 16px; display: flex; flex-direction: column; }
  .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
  .header h1 { font-size: 1.3em; display: flex; align-items: center; gap: 8px; }
  .header h1 svg { width: 1.4em; height: 1.4em; flex-shrink: 0; }
  .header-actions { display: flex; gap: 8px; align-items: center; }
  .btn { background: var(--vscode-button-background, #2563eb); color: var(--vscode-button-foreground, #fff); border: none; padding: 0; width: 30px; height: 30px; border-radius: 4px; cursor: pointer; font-size: 1.05em; display: inline-flex; align-items: center; justify-content: center; line-height: 1; }
  .btn:hover { opacity: 0.85; }
  .btn-secondary { background: var(--vscode-button-secondaryBackground, #334155); color: var(--vscode-button-secondaryForeground, #e2e8f0); }
  .btn-star { background: transparent; border: 1px solid #e3b341; color: #e3b341; }
  .btn-star:hover { background: rgba(227,179,65,0.15); opacity: 1; }
  .auto-refresh-select { background: var(--vscode-dropdown-background, #1e293b); color: var(--vscode-dropdown-foreground, #e2e8f0); border: 1px solid var(--vscode-dropdown-border, #334155); height: 30px; padding: 0 8px; border-radius: 4px; font-size: 0.8em; cursor: pointer; }
  .kpi-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; margin-bottom: 16px; }
  .kpi { background: var(--vscode-editorWidget-background, #1e293b); border: 1px solid var(--vscode-editorWidget-border, #334155); border-radius: 8px; padding: 12px; text-align: center; }
  .kpi .value { font-size: 1.5em; font-weight: 700; color: var(--vscode-textLink-foreground, #38bdf8); }
  .kpi .label { font-size: 0.75em; color: var(--vscode-descriptionForeground, #94a3b8); margin-top: 2px; }
  .kpi .sub { font-size: 0.7em; color: var(--vscode-descriptionForeground, #94a3b8); margin-top: 4px; opacity: 0.85; }
  .charts-row { display: flex; gap: 12px; margin-bottom: 16px; flex: 1; min-height: 280px; }
  .chart-box { flex: 2; background: var(--vscode-editorWidget-background, #1e293b); border-radius: 8px; padding: 12px; border: 1px solid var(--vscode-editorWidget-border, #334155); position: relative; }
  .chart-box canvas { position: absolute; top: 12px; left: 12px; right: 12px; bottom: 12px; }
  .chart-small { flex: 1; }
  .tables-row { display: flex; gap: 12px; flex-wrap: wrap; }
  .table-box { flex: 1; min-width: 280px; background: var(--vscode-editorWidget-background, #1e293b); border-radius: 8px; padding: 12px; border: 1px solid var(--vscode-editorWidget-border, #334155); overflow-x: auto; }
  .table-box table { min-width: 500px; }
  .loading { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 16px; }
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
      { label: 'Prompt Tokens', data: ${dailyPrompt}, backgroundColor: 'rgba(56,189,248,0.7)' },
      { label: 'Output Tokens', data: ${dailyOutput}, backgroundColor: 'rgba(168,85,247,0.7)' },
    ],
  },
  options: { responsive: true, maintainAspectRatio: false, plugins: { title: { display: true, text: 'Daily Token Usage', color: _fg }, legend: { labels: { color: _fg } } }, scales: { x: { stacked: true, ticks: { color: _muted }, grid: { color: _grid } }, y: { stacked: true, ticks: { color: _muted }, grid: { color: _grid } } } },
});

new Chart(document.getElementById('modelChart'), {
  type: 'doughnut',
  data: {
    labels: ${modelLabels},
    datasets: [{ data: ${modelData}, backgroundColor: ['#38bdf8','#a855f7','#22c55e','#f59e0b','#ef4444','#ec4899','#14b8a6','#f97316'] }],
  },
  options: { responsive: true, maintainAspectRatio: false, plugins: { title: { display: true, text: 'Model Distribution', color: _fg }, legend: { position: 'right', labels: { color: _fg, font: { size: 10 }, boxWidth: 12, padding: 6 } } } },
});
`;
}

function autoRefreshSelect(seconds: number): string {
  const opts = [
    { v: 0, l: 'Auto: Off' },
    { v: 30, l: '⏱ 30s' },
    { v: 60, l: '⏱ 1m' },
    { v: 120, l: '⏱ 2m' },
    { v: 300, l: '⏱ 5m' },
  ];
  const options = opts.map(o =>
    `<option value="${o.v}"${o.v === seconds ? ' selected' : ''}>${esc(o.l)}</option>`
  ).join('');
  return `<select class="auto-refresh-select" id="autoRefreshSelect" onchange="setAutoRefresh(this.value)" title="Auto-refresh interval">${options}</select>`;
}

function autoRefreshScript(): string {
  return `
let _art = null;
function setAutoRefresh(v) {
  if (_art) { clearInterval(_art); _art = null; }
  var s = parseInt(v, 10);
  if (s > 0) { _art = setInterval(function() { refresh(); }, s * 1000); }
  vscode.postMessage({ command: 'setAutoRefresh', seconds: s });
}
(function() { var el = document.getElementById('autoRefreshSelect'); if (el && parseInt(el.value, 10) > 0) { setAutoRefresh(el.value); } })();
`;
}

function errorPage(msg: string, showDashboardButton = false): string {
  const dashBtn = showDashboardButton
    ? `<br><br><button class="btn" onclick="openDashboard()" style="font-size:1em;padding:10px 24px;">🌐 Open Global Dashboard</button>
       <script>const vscode = acquireVsCodeApi(); function openDashboard() { vscode.postMessage({ command: 'openDashboard' }); }</script>`
    : '';
  return `<!DOCTYPE html><html><head>${commonStyles()}</head><body><div class="error"><h2>No Data</h2><p>${esc(msg)}</p>${dashBtn}</div></body></html>`;
}

function loadingPage(): string {
  return `<!DOCTYPE html><html><head>${commonStyles()}</head><body><div class="loading"><div class="spinner"></div><p>Loading Copilot usage data\u2026</p></div></body></html>`;
}

function fmt(n: number): string {
  return n.toLocaleString('en-US');
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
  dateRange: DateRange = 'all',
  months = 0,
): string {
  if (error || !kpis) {
    return errorPage(error || 'No data', showDashboardButton);
  }

  const modelRows = (models || []).map(m =>
    `<tr><td>${esc(shortModel(m.modelId))}</td><td>${fmt(m.requests)}</td><td>${fmt(m.totalTokens)}</td><td>${m.premium.toFixed(1)}×</td></tr>`
  ).join('');

  const dailyLabels = JSON.stringify((daily || []).map(d => d.date));
  const dailyPrompt = JSON.stringify((daily || []).map(d => d.promptTokens));
  const dailyOutput = JSON.stringify((daily || []).map(d => d.outputTokens));
  const modelLabels = JSON.stringify((models || []).map(m => shortModel(m.modelId)));
  const modelData = JSON.stringify((models || []).map(m => m.requests));

  const title = wsPath ? shortPath(wsPath) : 'Current Workspace';

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
    <button class="btn btn-star" onclick="starGitHub()" title="Star on GitHub">⭐</button>
    <button class="btn btn-secondary" onclick="openDashboard()" title="Open Global Dashboard">🌐</button>
    <button class="btn" onclick="refresh()" title="Refresh data">↻</button>
    ${dateRangeSelect(dateRange)}
    ${autoRefreshSelect(autoRefreshSeconds)}
  </div>
</div>

<div class="kpi-row">
  ${kpiCard('Requests', fmt(kpis.totalRequests), perMonth(kpis.totalRequests, months))}
  ${kpiCard('Prompt Tokens', fmt(kpis.totalPromptTokens), perMonth(kpis.totalPromptTokens, months))}
  ${kpiCard('Output Tokens', fmt(kpis.totalOutputTokens), perMonth(kpis.totalOutputTokens, months))}
  ${kpiCard('Tool Rounds', fmt(kpis.totalToolCallRounds))}
  ${kpiCard('Premium', kpis.totalPremium.toFixed(1) + '×', perMonthDecimal(kpis.totalPremium, months))}
  ${kpiCard('Sessions', String(kpis.sessionCount))}
</div>

<div class="charts-row">
  <div class="chart-box"><canvas id="dailyChart"></canvas></div>
  <div class="chart-box chart-small"><canvas id="modelChart"></canvas></div>
</div>

<div class="tables-row">
  <div class="table-box">
    <h3>Models</h3>
    <table><thead><tr><th>Model</th><th>Requests</th><th>Tokens</th><th>Premium</th></tr></thead>
    <tbody>${modelRows}</tbody></table>
  </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"></script>
<script>
const vscode = acquireVsCodeApi();
function refresh() { vscode.postMessage({ command: 'refresh' }); }
function openDashboard() { vscode.postMessage({ command: 'openDashboard' }); }
function starGitHub() { vscode.postMessage({ command: 'openGitHub' }); }
${dateRangeScript()}
${autoRefreshScript()}
${chartsScript(dailyLabels, dailyPrompt, dailyOutput, modelLabels, modelData)}
</script>
</body></html>`;
}
