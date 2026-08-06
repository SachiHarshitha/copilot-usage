/** Cost Estimator HTML view. Renders the full webview document.
 *  Self-contained — uses only shared CSS helpers from views/panels.ts. */

import { commonStyles, esc, fmt, headerIcon, loadingPage } from './sharedHtml';
import {
  classifySavingsVsBaseline,
  providerNearMarginUsd,
} from './calc/providers';
import {
  CandidatePortfolio,
  CostEstimate,
  CostEstimatorSettings,
  CostUsageSource,
  CostRangeKey,
  MeteredModeStatus,
  PlanImpactEstimate,
  ProviderDecisionSurface,
  TrendInsight,
  UsageEstimate,
} from './types';
import { MODEL_PRICING, MODEL_PRICING_LIST } from './pricing/models';
import { PLAN_ALLOWANCES } from './pricing/plans';
import { PRICING_METADATA } from './pricing/metadata';

export interface CostEstimatorViewState {
  settings: CostEstimatorSettings;
  usage: UsageEstimate;
  usageSource: CostUsageSource;
  meteredStatus?: MeteredModeStatus;
  selectedCost: CostEstimate;
  comparisonCosts: CostEstimate[];
  planImpact: PlanImpactEstimate;
  trend: TrendInsight | null;
  providerDecisionSurface?: ProviderDecisionSurface;
  hasAnyData: boolean;
}

export { loadingPage };

const RANGES: { v: CostRangeKey; l: string }[] = [
  { v: 'last_7_days', l: '📅 Last 7 days' },
  { v: 'last_30_days', l: '📅 Last 30 days' },
  { v: 'last_3_months', l: '📅 Last 3 months' },
  { v: 'all_time', l: '📅 All time' },
];

const PLANS: { v: string; l: string }[] = [
  { v: 'free', l: 'Copilot Free' },
  { v: 'pro', l: 'Copilot Pro' },
  { v: 'pro_plus', l: 'Copilot Pro+' },
  { v: 'max', l: 'Copilot Max' },
  { v: 'business', l: 'Copilot Business' },
  { v: 'enterprise', l: 'Copilot Enterprise' },
];

const BILLINGS: { v: string; l: string }[] = [
  { v: 'individual_monthly', l: 'Individual — Monthly' },
  { v: 'individual_annual', l: 'Individual — Annual' },
  { v: 'mobile_ios_android', l: 'Mobile (iOS/Android)' },
  { v: 'organization_managed', l: 'Organization-managed' },
];

const USAGE_SOURCES: { v: CostUsageSource; l: string }[] = [
  { v: 'local', l: 'Local counts (chatSessions)' },
  { v: 'metered', l: 'Metered mode (debug logs)' },
];

export function getCostEstimatorHtml(state: CostEstimatorViewState): string {
  const s = state.settings;
  const u = state.usage;
  const c = state.selectedCost;
  const p = state.planImpact;
  const observedWindowSub = observedWindowSubtitle(u);
  const isMeteredMode = state.usageSource === 'metered';

  const noData = !state.hasAnyData;

  const rangeOptions = RANGES.map(r =>
    `<option value="${r.v}"${r.v === s.defaultRange ? ' selected' : ''}>${esc(r.l)}</option>`).join('');

  const planOptions = PLANS.map(o =>
    `<option value="${o.v}"${o.v === s.selectedPlan ? ' selected' : ''}>${esc(o.l)}</option>`).join('');

  const billingOptions = BILLINGS.map(o =>
    `<option value="${o.v}"${o.v === s.billingModel ? ' selected' : ''}>${esc(o.l)}</option>`).join('');

  const usageSourceOptions = USAGE_SOURCES.map(o =>
    `<option value="${o.v}"${o.v === state.usageSource ? ' selected' : ''}>${esc(o.l)}</option>`).join('');

  const modelOptions = MODEL_PRICING_LIST.map(m =>
    `<option value="${m.id}"${m.id === s.selectedModelId ? ' selected' : ''}>${esc(m.displayName)}</option>`).join('');

  const allowance = PLAN_ALLOWANCES[s.selectedPlan];

  const planImpactHtml = renderPlanImpact(p, allowance.displayName);
  const warningsHtml = p.warnings.length === 0
    ? ''
    : `<div class="warnings">${p.warnings.map(w => `<div class="warn">⚠ ${esc(w)}</div>`).join('')}</div>`;

  const comparisonRows = state.comparisonCosts
    .slice()
    .sort((a, b) => a.estimatedMonthlyUsd - b.estimatedMonthlyUsd)
    .map(cc => renderComparisonRow(cc, cc.modelId === s.selectedModelId))
    .join('');

  const providerComparisonCount = state.providerDecisionSurface?.portfolios.length ?? 0;
  const capabilityComparisonHtml = state.providerDecisionSurface
    ? renderCapabilityComparison(state.providerDecisionSurface)
    : `<div class="muted-cell">Capability-aware comparison is unavailable until model-mix baseline data is present.</div>`;

  const trendHtml = state.trend
    ? `<div class="trend">📈 ${esc(state.trend.label)}</div>`
    : `<div class="trend muted">📈 Trend insight needs at least 30 days of session data.</div>`;

  const noDataBanner = noData
    ? `<div class="warn-banner">${esc(noDataMessageForSource(state.usageSource))}</div>`
    : '';

  const sourceModeHtml = renderUsageSourceMessage(state.usageSource, state.meteredStatus);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Copilot Cost Estimator (Preview)</title>
${commonStyles()}
<style>
  .cost-estimator-page { font-size: 15px; }
  .cost-estimator-page .header h1 { font-size: 1.45em; }
  .cost-estimator-page .kpi .label { font-size: 0.82em; }
  .cost-estimator-page .kpi .sub { font-size: 0.8em; }
  .cost-estimator-page table { font-size: 0.9em; }
  .cost-estimator-page .table-box h3 { font-size: 1.05em; }
  .preview-pill { background: var(--vscode-badge-background, #334155); color: var(--vscode-badge-foreground, #e2e8f0); font-size: 0.72em; padding: 4px 9px; border-radius: 10px; margin-left: 8px; vertical-align: middle; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; }
  .disclaimer { background: var(--vscode-editorWidget-background, #1e293b); border: 1px solid var(--vscode-editorWidget-border, #334155); border-left: 3px solid #f59e0b; border-radius: 6px; padding: 10px 14px; margin-bottom: 14px; font-size: 0.9em; color: var(--vscode-descriptionForeground, #94a3b8); line-height: 1.55; }
  .disclaimer strong { color: var(--vscode-foreground); }
  .setup-card { background: var(--vscode-editorWidget-background, #1e293b); border: 1px solid var(--vscode-editorWidget-border, #334155); border-radius: 8px; padding: 14px; margin-bottom: 16px; }
  .setup-card h3 { font-size: 1.04em; color: var(--vscode-textLink-foreground, #38bdf8); margin-bottom: 10px; }
  .setup-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; }
  .setup-grid label { display: flex; flex-direction: column; gap: 4px; font-size: 0.9em; color: var(--vscode-descriptionForeground); }
  .setup-grid select, .setup-grid input { background: var(--vscode-input-background, #1e293b); color: var(--vscode-input-foreground, #e2e8f0); border: 1px solid var(--vscode-input-border, #334155); padding: 6px 8px; border-radius: 4px; font-size: 0.96em; }
  .impact-card { background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-editorWidget-border); border-radius: 8px; padding: 14px; margin-bottom: 14px; }
  .impact-card h3 { font-size: 1.04em; color: var(--vscode-textLink-foreground, #38bdf8); margin-bottom: 10px; }
  .impact-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
  .impact-plan-name { font-size: 0.98em; font-weight: 600; }
  .impact-head .status-pill { margin-left: auto; text-align: right; }
  .impact-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; }
  .impact-cell { background: var(--vscode-editor-background); border: 1px solid var(--vscode-editorWidget-border); border-radius: 6px; padding: 10px; text-align: center; }
  .impact-cell .v { font-size: 1.4em; font-weight: 700; color: var(--vscode-textLink-foreground, #38bdf8); }
  .impact-cell .l { font-size: 0.82em; color: var(--vscode-descriptionForeground); margin-top: 3px; }
  .status-pill { display: inline-block; padding: 5px 10px; border-radius: 10px; font-size: 0.84em; font-weight: 600; }
  .status-within { background: rgba(34,197,94,0.15); color: #22c55e; border: 1px solid #22c55e; }
  .status-over-budget { background: rgba(245,158,11,0.15); color: #f59e0b; border: 1px solid #f59e0b; }
  .status-over-exceed { background: rgba(239,68,68,0.15); color: #ef4444; border: 1px solid #ef4444; }
  .status-pooled { background: rgba(56,189,248,0.15); color: #38bdf8; border: 1px solid #38bdf8; }
  .status-estimate { background: rgba(148,163,184,0.15); color: #94a3b8; border: 1px solid #94a3b8; }
  .warnings { margin-bottom: 14px; }
  .warn { background: rgba(245,158,11,0.08); border-left: 3px solid #f59e0b; padding: 8px 12px; margin-bottom: 6px; border-radius: 4px; font-size: 0.9em; line-height: 1.55; }
  .warn-banner { background: rgba(56,189,248,0.08); border-left: 3px solid #38bdf8; padding: 10px 14px; margin-bottom: 14px; border-radius: 4px; font-size: 0.92em; line-height: 1.55; }
  .source-note { margin-top: 10px; }
  .source-badge { display: inline-block; font-size: 0.72em; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; border-radius: 999px; padding: 2px 8px; margin-left: 8px; vertical-align: middle; }
  .source-badge.local { border: 1px solid #38bdf8; color: #38bdf8; background: rgba(56,189,248,0.12); }
  .source-badge.exact { border: 1px solid #22c55e; color: #22c55e; background: rgba(34,197,94,0.12); }
  .source-badge.partial { border: 1px solid #f59e0b; color: #f59e0b; background: rgba(245,158,11,0.12); }
  .source-badge.unavailable { border: 1px solid #ef4444; color: #ef4444; background: rgba(239,68,68,0.12); }
  .trend { background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-editorWidget-border); border-radius: 8px; padding: 10px 14px; margin-bottom: 14px; font-size: 0.96em; }
  .trend.muted { color: var(--vscode-descriptionForeground); }
  .model-compare-box { flex: 0 0 auto; min-height: 320px; }
  .model-compare-scroll { max-height: min(62vh, 700px); overflow: auto; border: 1px solid var(--vscode-editorWidget-border); border-radius: 6px; }
  .model-compare-scroll table { width: 100%; min-width: 820px; }
  .model-compare-scroll thead th { position: sticky; top: 0; z-index: 1; background: var(--vscode-editorWidget-background, #1e293b); }
  .compare-table { table-layout: fixed; }
  .compare-table th:first-child, .compare-table td:first-child { width: 24%; }
  .compare-table th:nth-child(2), .compare-table td:nth-child(2) { width: 12%; }
  .compare-table th:nth-child(3), .compare-table td:nth-child(3) { width: 16%; }
  .compare-table th:nth-child(4), .compare-table td:nth-child(4) { width: 16%; }
  .compare-table th:nth-child(5), .compare-table td:nth-child(5) { width: 16%; }
  .compare-table th:nth-child(6), .compare-table td:nth-child(6) { width: 16%; }
  .compare-table td:first-child { word-break: break-word; }
  .compare-table tr.selected { background: rgba(56,189,248,0.08); }
  .compare-table td.fits-yes { color: #22c55e; font-weight: 600; }
  .compare-table td.fits-no { color: #ef4444; font-weight: 600; }
  .compare-table tr.retired-row { opacity: 0.6; }
  .retired-badge { display: inline-block; font-size: 0.72em; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: #f59e0b; border: 1px solid #f59e0b; border-radius: 4px; padding: 0 5px; margin-left: 6px; vertical-align: middle; }
  .checkbox-label { flex-direction: row !important; align-items: center; gap: 8px !important; }
  .checkbox-label input { width: auto; }
  .provider-compare-box { flex: 0 0 auto; min-height: 260px; margin-top: 14px; }
  .capability-compare { display: flex; flex-direction: column; gap: 12px; }
  .capability-summary {
    background: rgba(56, 189, 248, 0.08);
    border-left: 3px solid #38bdf8;
    border-radius: 4px;
    padding: 10px 12px;
    line-height: 1.6;
    font-size: 0.92em;
  }
  .capability-confidence {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    font-size: 0.85em;
    color: var(--vscode-descriptionForeground);
  }
  .confidence-pill {
    border: 1px solid var(--vscode-editorWidget-border);
    border-radius: 999px;
    padding: 2px 8px;
    background: var(--vscode-editorWidget-background);
  }
  .confidence-pill.high { border-color: #22c55e; color: #22c55e; }
  .confidence-pill.medium { border-color: #f59e0b; color: #f59e0b; }
  .confidence-pill.low { border-color: #ef4444; color: #ef4444; }
  .capability-section {
    background: var(--vscode-editorWidget-background);
    border: 1px solid var(--vscode-editorWidget-border);
    border-radius: 8px;
    padding: 12px;
  }
  .capability-section h4 { margin: 0 0 8px; font-size: 0.98em; }
  .fingerprint-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 8px;
  }
  .fingerprint-cell {
    background: var(--vscode-editor-background);
    border: 1px solid var(--vscode-editorWidget-border);
    border-radius: 6px;
    padding: 8px;
  }
  .fingerprint-cell .k { font-size: 0.78em; color: var(--vscode-descriptionForeground); }
  .fingerprint-cell .v { font-size: 1.08em; font-weight: 600; margin-top: 2px; }
  .capability-table-scroll {
    max-height: min(54vh, 560px);
    overflow: auto;
    border: 1px solid var(--vscode-editorWidget-border);
    border-radius: 6px;
  }
  .capability-table { width: 100%; min-width: 980px; border-collapse: collapse; table-layout: fixed; }
  .capability-table th, .capability-table td { padding: 7px 8px; border-bottom: 1px solid var(--vscode-editorWidget-border); text-align: left; }
  .capability-table thead th { position: sticky; top: 0; z-index: 1; background: var(--vscode-editorWidget-background, #1e293b); font-size: 0.83em; }
  .capability-table td { font-size: 0.84em; line-height: 1.45; }
  .decision-table {
    table-layout: auto;
    min-width: 1720px;
  }
  .decision-table th:nth-child(1), .decision-table td:nth-child(1) { min-width: 250px; }
  .decision-table th:nth-child(2), .decision-table td:nth-child(2) { min-width: 170px; }
  .decision-table th:nth-child(3), .decision-table td:nth-child(3) { min-width: 120px; }
  .decision-table th:nth-child(4), .decision-table td:nth-child(4) { min-width: 130px; }
  .decision-table th:nth-child(5), .decision-table td:nth-child(5) { min-width: 110px; }
  .decision-table th:nth-child(6), .decision-table td:nth-child(6) { min-width: 110px; }
  .decision-table th:nth-child(7), .decision-table td:nth-child(7) { min-width: 110px; }
  .decision-table th:nth-child(8), .decision-table td:nth-child(8) { min-width: 120px; }
  .decision-table th:nth-child(9), .decision-table td:nth-child(9) { min-width: 140px; }
  .decision-table th:nth-child(10), .decision-table td:nth-child(10) { min-width: 140px; }
  .decision-table th:nth-child(11), .decision-table td:nth-child(11) { min-width: 180px; }
  .decision-table th:nth-child(12), .decision-table td:nth-child(12) {
    width: 50%;
    min-width: 400px;
  }
  .decision-table td:nth-child(12) {
    white-space: nowrap;
    word-break: normal;
    overflow-wrap: normal;
  }
  .mini-bar-track {
    width: 100%;
    height: 8px;
    border-radius: 999px;
    background: rgba(148, 163, 184, 0.2);
    overflow: hidden;
  }
  .mini-bar-fill {
    height: 100%;
    background: linear-gradient(90deg, #38bdf8, #22c55e);
  }
  .group-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 10px;
  }
  .group-card {
    background: var(--vscode-editor-background);
    border: 1px solid var(--vscode-editorWidget-border);
    border-radius: 6px;
    padding: 10px;
  }
  .group-card h5 { margin: 0 0 8px; font-size: 0.9em; }
  .group-card ul { margin: 0; padding-left: 18px; }
  .group-card li { margin-bottom: 4px; font-size: 0.83em; }
  .confidence-high { color: #22c55e; font-weight: 600; }
  .confidence-medium { color: #f59e0b; font-weight: 600; }
  .confidence-low { color: #ef4444; font-weight: 600; }
  .confidence-unknown { color: #94a3b8; font-weight: 600; }
  .risk-low { color: #22c55e; font-weight: 600; }
  .risk-medium { color: #f59e0b; font-weight: 600; }
  .risk-high { color: #ef4444; font-weight: 600; }
  .risk-unknown { color: #94a3b8; font-weight: 600; }
  .savings-significant { color: #22c55e; font-weight: 600; }
  .savings-buffered { color: #f59e0b; font-weight: 600; }
  .savings-negative { color: #ef4444; font-weight: 600; }
  .muted-cell { color: var(--vscode-descriptionForeground); }
  .footer { margin-top: 18px; font-size: 0.84em; color: var(--vscode-descriptionForeground); border-top: 1px solid var(--vscode-editorWidget-border); padding-top: 10px; line-height: 1.65; }
</style>
</head>
<body class="cost-estimator-page">

<div class="header">
  <h1>${headerIcon()} Copilot Cost Estimator <span class="preview-pill">Preview</span></h1>
  <div class="header-actions">
    <button class="btn btn-star" onclick="starGitHub()" title="Star on GitHub">⭐</button>
    <button class="btn btn-secondary" onclick="openDashboard()" title="Open Dashboard">📊</button>
    <button class="btn" onclick="refresh()" title="Refresh">↻</button>
    <button class="btn btn-secondary" onclick="openSettings()" title="Settings">⚙</button>
  </div>
</div>

<div class="disclaimer">
  <strong>Estimate only.</strong> This page shows what your token usage <em>would cost</em> at the new GitHub Copilot AI Credits pricing (effective ${esc(PRICING_METADATA.effectiveDate)}).
  It is <strong>not</strong> a bill, an invoice, or a guaranteed forecast. Actual GitHub Copilot charges depend on your plan, your billing entity, your organization\u2019s pooled credits, and any future changes from GitHub.
</div>

<div class="disclaimer">
  <strong>Independent method disclaimer.</strong> This estimator uses the project's own calculation method based on the selected usage source and publicly available pricing references.
  Copilot Usage is an independent community project and is not affiliated with, endorsed by, sponsored by, or approved by Microsoft or GitHub.
  This is not an official Microsoft or GitHub billing calculator and should not be treated as billing, accounting, tax, legal, or financial advice.
</div>

${sourceModeHtml}

${noDataBanner}

<div class="setup-card">
  <h3>Your setup</h3>
  <div class="setup-grid">
    <label>Plan
      <select id="planSelect" onchange="setSetting('selectedPlan', this.value)">${planOptions}</select>
    </label>
    <label>Billing
      <select id="billingSelect" onchange="setSetting('billingModel', this.value)">${billingOptions}</select>
    </label>
    <label>Model used most
      <select id="modelSelect" onchange="setSetting('selectedModelId', this.value)">${modelOptions}</select>
    </label>
    <label>Usage source
      <select id="usageSourceSelect" onchange="setSetting('usageSource', this.value)">${usageSourceOptions}</select>
    </label>
    <label>Extra budget per month (USD)
      <input id="budgetInput" type="number" min="0" step="1" value="${s.extraBudgetUsd}" onchange="setSetting('extraBudgetUsd', this.value)">
    </label>
    <label class="checkbox-label">
      <input id="flexToggle" type="checkbox"${s.includeFlexAllowance ? ' checked' : ''} onchange="setSetting('includeFlexAllowance', this.checked)">
      Include flex allowance
    </label>
    <label>Estimate window
      <select id="rangeSelect" onchange="setRange(this.value)">${rangeOptions}</select>
    </label>
  </div>
</div>

<div class="impact-card">
  <h3>Estimated monthly impact — ${esc(PLAN_ALLOWANCES[s.selectedPlan].displayName)}</h3>
  ${planImpactHtml}
</div>

${warningsHtml}

${trendHtml}

<div class="kpi-row">
  ${kpi('Estimated monthly cost', '$' + c.estimatedMonthlyUsd.toFixed(2), `${fmt(c.estimatedMonthlyCredits)} AI Credits @ ${esc(c.modelDisplayName)}`)}
  ${kpi(isMeteredMode ? 'Observed non-cached input tokens' : 'Observed input tokens', fmt(u.observedInputTokens), observedWindowSub)}
  ${kpi('Observed output tokens', fmt(u.observedOutputTokens), observedWindowSub)}
  ${kpi('Projected monthly tokens', fmt(u.monthlyInputTokens + u.monthlyOutputTokens), 'normalized to 30 days')}
</div>

${isMeteredMode
    ? `<div class="disclaimer">
  <strong>Metered cache handling.</strong> Debug logs provide cached token counts. Because metered input already includes cached tokens, this estimator separates cached tokens from input before pricing to avoid double-counting.
  Cache write tokens are still unavailable in debug logs, so costs can still vary from final billing.
</div>`
    : `<div class="disclaimer">
  <strong>Cache token data not yet tracked.</strong> Cached input and cache write tokens are billed separately by GitHub but are not currently captured by this extension. The numbers above use only prompt + output tokens, which means actual costs may be slightly higher (or lower, if caching reduces input billing).
</div>`}

<div class="table-box model-compare-box">
  <h3>Model comparison — projected monthly cost (${state.comparisonCosts.length} models)</h3>
  <div class="model-compare-scroll">
    <table class="compare-table">
      <thead>
        <tr>
          <th>Model</th>
          <th>Provider</th>
          <th>Est. USD/mo</th>
          <th>AI Credits</th>
          <th>Fits Pro (1,000)</th>
          <th>Fits Pro+ (3,900)</th>
        </tr>
      </thead>
      <tbody>${comparisonRows}</tbody>
    </table>
  </div>
</div>

<div class="table-box provider-compare-box">
  <h3>Provider comparison — capability-aware (${providerComparisonCount} rows)</h3>
  ${capabilityComparisonHtml}
</div>

<div class="footer">
  Pricing source: <em>${esc(PRICING_METADATA.sourceName)}</em> &middot;
  Effective: ${esc(PRICING_METADATA.effectiveDate)} &middot;
  Last verified: ${esc(PRICING_METADATA.lastVerified)} &middot;
  1 AI Credit = $${PRICING_METADATA.aiCreditUsdValue.toFixed(2)} USD.
  This feature is in <strong>preview</strong> and may change as GitHub publishes more authoritative pricing.
</div>

<script>
const vscode = acquireVsCodeApi();
function refresh() { vscode.postMessage({ command: 'refresh' }); }
function openDashboard() { vscode.postMessage({ command: 'openDashboard' }); }
function starGitHub() { vscode.postMessage({ command: 'openGitHub' }); }
function setSetting(key, value) { vscode.postMessage({ command: 'setSetting', key: key, value: value }); }
function setRange(v) { vscode.postMessage({ command: 'setRange', range: v }); }
function openSettings() { vscode.postMessage({ command: 'openSettings' }); }
</script>
</body></html>`;
}

function kpi(label: string, value: string, sub?: string): string {
  const subHtml = sub ? `<div class="sub">${esc(sub)}</div>` : '';
  return `<div class="kpi"><div class="value">${esc(value)}</div><div class="label">${esc(label)}</div>${subHtml}</div>`;
}

function renderUsageSourceMessage(source: CostUsageSource, metered?: MeteredModeStatus): string {
  if (source === 'local') {
    return `<div class="disclaimer source-note"><strong>Source mode:</strong> Local counts from chatSessions request logs.
      <span class="source-badge local">Local</span>
      This reflects request-level usage visible to you and may differ from Copilot-billed internal rounds.</div>`;
  }

  const status = metered ?? {
    available: false,
    rounds: 0,
    userMessages: 0,
    coverage: 0,
    confidence: 'unavailable' as const,
    note: 'Metered usage status is unavailable.',
  };

  const badgeClass = status.confidence;
  const badgeText = status.confidence === 'exact'
    ? 'Metered exact'
    : status.confidence === 'partial'
      ? 'Metered partial'
      : 'Metered unavailable';

  const coveragePct = (status.coverage * 100).toFixed(1);
  const availabilityText = status.available
    ? `${fmt(status.rounds)} llm_request rounds parsed in this window`
    : 'No metered rounds available in this window';

  const note = status.note ? ` ${esc(status.note)}` : '';

  return `<div class="disclaimer source-note"><strong>Source mode:</strong> Metered debug-log view from llm_request rows.
    <span class="source-badge ${esc(badgeClass)}">${esc(badgeText)}</span>
    ${esc(availabilityText)} with ${coveragePct}% credit coverage.${note}</div>`;
}

function noDataMessageForSource(source: CostUsageSource): string {
  if (source === 'metered') {
    return 'No metered debug-log rows were found for this window. Switch to Local counts mode or use Copilot chat first to generate debug-log activity.';
  }
  return 'No Copilot session data found yet. Use the model comparison table below to explore typical pricing for sample workloads, then come back after you\'ve used Copilot for a few days for personalized estimates.';
}

function observedWindowSubtitle(usage: UsageEstimate): string {
  const dayWindow = `${fmt(usage.daysInRange)}-day window`;
  if (usage.rangeStart && usage.rangeEnd) {
    return `${dayWindow} (${usage.rangeStart} -> ${usage.rangeEnd})`;
  }
  return dayWindow;
}

function renderPlanImpact(p: PlanImpactEstimate, planName: string): string {
  const includedCellLabel = p.planId === 'business' || p.planId === 'enterprise'
    ? 'Per-user pooled credits'
    : 'Included credits';

  const cells: string[] = [];
  cells.push(impactCell(fmt(p.estimatedCredits), 'Estimated credits/mo'));
  if (p.includedCredits !== undefined) {
    cells.push(impactCell(fmt(p.includedCredits), includedCellLabel));
  }
  if (p.includedBaseCredits !== undefined && p.includedFlexCredits !== undefined && p.includedFlexCredits > 0) {
    const flexLabel = p.flexApplied
      ? `Base ${fmt(p.includedBaseCredits)} + flex ${fmt(p.includedFlexCredits)}`
      : `Base ${fmt(p.includedBaseCredits)} (flex ${fmt(p.includedFlexCredits)} excluded)`;
    cells.push(impactCell(p.flexApplied ? 'On' : 'Off', flexLabel));
  }
  if (p.overageCredits !== undefined) {
    cells.push(impactCell(fmt(p.overageCredits), 'Overage credits'));
  }
  if (p.estimatedExtraUsd !== undefined) {
    cells.push(impactCell('$' + p.estimatedExtraUsd.toFixed(2), 'Estimated extra USD/mo'));
  }
  cells.push(impactCell('$' + (p.extraBudgetCredits * 0.01).toFixed(2), 'Your extra budget'));

  const statusPill = renderStatusPill(p);

  return `<div class="impact-head"><span class="impact-plan-name">${esc(planName)}</span>${statusPill}</div>
    <div class="impact-grid">${cells.join('')}</div>`;
}

function impactCell(value: string, label: string): string {
  return `<div class="impact-cell"><div class="v">${esc(value)}</div><div class="l">${esc(label)}</div></div>`;
}

function renderStatusPill(p: PlanImpactEstimate): string {
  switch (p.status) {
    case 'within_allowance':
      return `<span class="status-pill status-within">✓ Within included allowance</span>`;
    case 'over_allowance_within_budget':
      return `<span class="status-pill status-over-budget">⚠ Over allowance, covered by your extra budget</span>`;
    case 'over_allowance_exceeds_budget':
      return `<span class="status-pill status-over-exceed">✗ Over allowance, exceeds your extra budget</span>`;
    case 'pooled_org':
      return `<span class="status-pill status-pooled">ℹ Pooled organization credits</span>`;
    case 'estimate_only':
    default:
      return `<span class="status-pill status-estimate">Estimate only</span>`;
  }
}

function renderComparisonRow(c: CostEstimate, isSelected: boolean): string {
  const fitsPro = c.estimatedMonthlyCredits <= 1000;
  const fitsProPlus = c.estimatedMonthlyCredits <= 3900;
  const pricing = MODEL_PRICING_LIST.find(x => x.id === c.modelId);
  const retiredBadge = pricing?.releaseStatus === 'Retired'
    ? ' <span class="retired-badge">Retired</span>'
    : '';
  return `<tr class="${isSelected ? 'selected' : ''}${pricing?.releaseStatus === 'Retired' ? ' retired-row' : ''}">
    <td>${esc(c.modelDisplayName)}${retiredBadge}${isSelected ? ' <strong>(selected)</strong>' : ''}</td>
    <td>${esc(providerOf(c.modelId))}</td>
    <td>$${c.estimatedMonthlyUsd.toFixed(2)}</td>
    <td>${fmt(c.estimatedMonthlyCredits)}</td>
    <td class="${fitsPro ? 'fits-yes' : 'fits-no'}">${fitsPro ? '✓ Yes' : '✗ No'}</td>
    <td class="${fitsProPlus ? 'fits-yes' : 'fits-no'}">${fitsProPlus ? '✓ Yes' : '✗ No'}</td>
  </tr>`;
}

function providerOf(modelId: string): string {
  const m = MODEL_PRICING_LIST.find(x => x.id === modelId);
  return m ? m.provider : '';
}

function renderCapabilityComparison(surface: ProviderDecisionSurface): string {
  const confidenceCounts = {
    high: surface.portfolios.filter((item) => item.recommendationConfidence === 'high').length,
    medium: surface.portfolios.filter((item) => item.recommendationConfidence === 'medium').length,
    low: surface.portfolios.filter((item) => item.recommendationConfidence === 'low').length,
  };

  return `<div class="capability-compare">
    <div class="capability-summary">${esc(surface.summaryText)}</div>
    <div class="capability-confidence">
      <span class="confidence-pill high">High confidence: ${confidenceCounts.high}</span>
      <span class="confidence-pill medium">Medium confidence: ${confidenceCounts.medium}</span>
      <span class="confidence-pill low">Low confidence: ${confidenceCounts.low}</span>
      <span class="confidence-pill">Hidden/not comparable: ${surface.charts.hiddenOrNotComparable.length}</span>
    </div>
    ${renderWorkloadFingerprint(surface)}
    ${renderBaselineModelCostChart(surface)}
    ${renderBaselineTierShareChart(surface)}
    ${renderProviderFitMatrix(surface)}
    ${renderRecommendationGroups(surface)}
    ${renderDecisionTable(surface)}
  </div>`;
}

function renderWorkloadFingerprint(surface: ProviderDecisionSurface): string {
  const fp = surface.fingerprint;
  return `<section class="capability-section">
    <h4>1) Workload fingerprint</h4>
    <div class="fingerprint-grid">
      <div class="fingerprint-cell"><div class="k">Baseline monthly USD</div><div class="v">$${fp.baselineMonthlyUsd.toFixed(2)}</div></div>
      <div class="fingerprint-cell"><div class="k">Dominant model</div><div class="v">${esc(displayModelName(fp.dominantModelId))}</div></div>
      <div class="fingerprint-cell"><div class="k">Dominant family</div><div class="v">${esc(fp.dominantProviderFamily)}</div></div>
      <div class="fingerprint-cell"><div class="k">Dominant tier</div><div class="v">${esc(fp.dominantTier)}</div></div>
      <div class="fingerprint-cell"><div class="k">Powerful-tier share</div><div class="v">${fp.powerfulCostSharePct.toFixed(1)}%</div></div>
      <div class="fingerprint-cell"><div class="k">Input/output token ratio</div><div class="v">${fp.inputOutputRatio.toFixed(2)}</div></div>
      <div class="fingerprint-cell"><div class="k">Monthly input tokens</div><div class="v">${fmt(fp.totalInputTokens)}</div></div>
      <div class="fingerprint-cell"><div class="k">Monthly output tokens</div><div class="v">${fmt(fp.totalOutputTokens)}</div></div>
    </div>
    <p class="muted-cell" style="margin:8px 0 0;">${esc(fp.interpretation)}</p>
  </section>`;
}

function renderBaselineModelCostChart(surface: ProviderDecisionSurface): string {
  const rows = surface.charts.baselineModelCost
    .slice()
    .sort((a, b) => b.monthlyUsd - a.monthlyUsd)
    .map((item) => {
      const width = clampPct(item.costSharePct);
      return `<tr>
        <td>${esc(displayModelName(item.modelId))}</td>
        <td>${esc(item.family)} / ${esc(item.tier)}</td>
        <td>
          <div class="mini-bar-track"><div class="mini-bar-fill" style="width:${width.toFixed(1)}%"></div></div>
        </td>
        <td>$${item.monthlyUsd.toFixed(2)}</td>
        <td>${item.costSharePct.toFixed(1)}%</td>
      </tr>`;
    })
    .join('');

  return `<section class="capability-section">
    <h4>2) Baseline model cost chart</h4>
    <div class="capability-table-scroll">
      <table class="capability-table">
        <thead>
          <tr>
            <th>Model</th>
            <th>Family / Tier</th>
            <th>Cost share</th>
            <th>Monthly (USD)</th>
            <th>Share %</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </section>`;
}

function renderBaselineTierShareChart(surface: ProviderDecisionSurface): string {
  const rows = surface.tierBaseline
    .slice()
    .sort((a, b) => b.monthlyUsd - a.monthlyUsd)
    .map((item) => {
      const width = clampPct(item.costSharePct);
      return `<tr>
        <td>${esc(item.tier)}</td>
        <td>
          <div class="mini-bar-track"><div class="mini-bar-fill" style="width:${width.toFixed(1)}%"></div></div>
        </td>
        <td>$${item.monthlyUsd.toFixed(2)}</td>
        <td>${item.costSharePct.toFixed(1)}%</td>
        <td>${item.tokenSharePct.toFixed(1)}%</td>
      </tr>`;
    })
    .join('');

  return `<section class="capability-section">
    <h4>3) Baseline tier share chart</h4>
    <div class="capability-table-scroll">
      <table class="capability-table">
        <thead>
          <tr>
            <th>Tier</th>
            <th>Cost share</th>
            <th>Monthly (USD)</th>
            <th>Cost share %</th>
            <th>Token share %</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </section>`;
}

function renderProviderFitMatrix(surface: ProviderDecisionSurface): string {
  if (surface.charts.fitMatrix.length === 0) {
    return `<section class="capability-section">
      <h4>4) Provider fit matrix</h4>
      <div class="muted-cell">No directly comparable savings rows are currently available.</div>
    </section>`;
  }

  const rows = surface.charts.fitMatrix
    .slice()
    .sort((a, b) => b.fitScorePct - a.fitScorePct)
    .map((item) => {
      const width = clampPct(item.fitScorePct);
      return `<tr>
        <td>${esc(item.provider)} - ${esc(item.product)}</td>
        <td>
          <div class="mini-bar-track"><div class="mini-bar-fill" style="width:${width.toFixed(1)}%"></div></div>
        </td>
        <td>${item.fitScorePct.toFixed(1)}%</td>
        <td>${(item.substitutionCoverageByCostShare * 100).toFixed(1)}%</td>
        <td>${(item.familyCoverageByCostShare * 100).toFixed(1)}%</td>
        <td>${(item.tierCoverageByCostShare * 100).toFixed(1)}%</td>
        <td>${renderSavingsVsBaselineValue(item.savingsUsd, surface.fingerprint.baselineMonthlyUsd)}</td>
        <td class="risk-${esc(item.capabilityRisk)}">${esc(item.capabilityRisk)}</td>
        <td>${esc(item.label)}</td>
      </tr>`;
    })
    .join('');

  const savingsBufferUsd = providerNearMarginUsd(surface.fingerprint.baselineMonthlyUsd);

  return `<section class="capability-section">
    <h4>4) Provider fit matrix</h4>
    <p class="muted-cell" style="margin:0 0 8px;">Savings color uses a near-current buffer of +/-$${savingsBufferUsd.toFixed(2)} (10% of baseline, minimum $2.00).</p>
    <div class="capability-table-scroll">
      <table class="capability-table">
        <thead>
          <tr>
            <th>Product</th>
            <th>Fit score</th>
            <th>Fit %</th>
            <th>Substitution coverage</th>
            <th>Family coverage</th>
            <th>Tier coverage</th>
            <th>Savings vs baseline</th>
            <th>Capability risk</th>
            <th>Label</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </section>`;
}

function renderRecommendationGroups(surface: ProviderDecisionSurface): string {
  return `<section class="capability-section">
    <h4>5) Grouped recommendation cards</h4>
    <div class="group-cards">
      ${renderRecommendationGroupCard('Comparable portfolios', surface.groups.comparable)}
      ${renderRecommendationGroupCard('Cheaper but not equivalent', surface.groups.cheaperRisky)}
      ${renderRecommendationGroupCard('Plan / subscription products', surface.groups.planFit)}
      ${renderRecommendationGroupCard('BYOK / wrapper tools', surface.groups.byok)}
      ${renderRecommendationGroupCard('Router / model selection required', surface.groups.routerRequired)}
    </div>
  </section>`;
}

function renderRecommendationGroupCard(title: string, portfolios: CandidatePortfolio[]): string {
  if (portfolios.length === 0) {
    return `<article class="group-card"><h5>${esc(title)} (0)</h5><div class="muted-cell">No entries</div></article>`;
  }

  const items = portfolios
    .slice(0, 4)
    .map((item) => `<li>${esc(item.provider)} ${esc(item.plan ?? item.product)} - ${esc(item.label)}</li>`)
    .join('');

  return `<article class="group-card"><h5>${esc(title)} (${portfolios.length})</h5><ul>${items}</ul></article>`;
}

function renderDecisionTable(surface: ProviderDecisionSurface): string {
  const ordered = [
    ...surface.groups.comparable,
    ...surface.groups.cheaperRisky,
    ...surface.groups.planFit,
    ...surface.groups.byok,
    ...surface.groups.routerRequired,
  ];

  const rows = ordered
    .map((item) => `<tr>
      <td>${esc(item.provider)} - ${esc(item.product)}${item.plan ? ` (${esc(item.plan)})` : ''}</td>
      <td>${esc(item.comparisonGroup)}</td>
      <td>${esc(item.estimateKind)}</td>
      <td>${esc(formatCandidateMonthly(item))}</td>
      <td>${esc(formatExactCoverage(item))}</td>
      <td>${esc(formatFamilyCoverage(item))}</td>
      <td>${esc(formatTierCoverage(item))}</td>
      <td class="risk-${esc(item.capabilityRisk)}">${esc(item.capabilityRisk)}</td>
      <td class="${confidenceClass(item.pricingConfidence)}">${esc(item.pricingConfidence)}</td>
      <td class="${confidenceClass(item.equivalenceConfidence)}">${esc(item.equivalenceConfidence)}</td>
      <td>${esc(item.label)}</td>
      <td>${esc(formatPortfolioNotes(item))}</td>
    </tr>`)
    .join('');

  return `<section class="capability-section">
    <h4>6) Decision-oriented table</h4>
    <div class="capability-table-scroll">
      <table class="capability-table decision-table">
        <thead>
          <tr>
            <th>Product / portfolio</th>
            <th>Comparison group</th>
            <th>Estimate kind</th>
            <th>Monthly estimate</th>
            <th>Exact model coverage</th>
            <th>Family coverage</th>
            <th>Tier coverage</th>
            <th>Capability risk</th>
            <th>Pricing confidence</th>
            <th>Equivalence confidence</th>
            <th>Recommendation label</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </section>`;
}

function formatCandidateMonthly(item: CandidatePortfolio): string {
  if (!item.monthlyUsd) {
    return 'n/a';
  }
  if (item.monthlyUsd.min === item.monthlyUsd.max) {
    return `$${item.monthlyUsd.min.toFixed(2)}`;
  }
  return `$${item.monthlyUsd.min.toFixed(2)}-$${item.monthlyUsd.max.toFixed(2)}`;
}

function formatPortfolioNotes(item: CandidatePortfolio): string {
  const notes = item.notes.slice(0, 2).join('; ');
  const coverageDetails = `exact ${pct(item.exactModelCoverageByCostShare)}, family ${pct(item.familyCoverageByCostShare)}, tier ${pct(item.tierCoverageByCostShare)}, substitution ${pct(item.substitutionCoverageByCostShare)}`;
  const mappingDetails = item.mappings
    .slice(0, 3)
    .map((mapping) => `${displayModelName(mapping.baselineModelId)}: ${mapping.equivalence}`)
    .join(', ');
  const details = [`coverage ${coverageDetails}`, mappingDetails.length > 0 ? `mappings ${mappingDetails}` : '']
    .filter((text) => text.length > 0)
    .join('; ');

  if (item.hideSavings) {
    const base = notes.length > 0 ? `${notes}; savings hidden` : 'savings hidden';
    return details.length > 0 ? `${base}; ${details}` : base;
  }
  if (item.showSavingsAsSecondary) {
    const base = notes.length > 0 ? `${notes}; validate capability before switching` : 'validate capability before switching';
    return details.length > 0 ? `${base}; ${details}` : base;
  }
  if (notes.length > 0) {
    return details.length > 0 ? `${notes}; ${details}` : notes;
  }
  return details.length > 0 ? details : '-';
}

function formatExactCoverage(item: CandidatePortfolio): string {
  if (item.estimateKind === 'plan-fit') {
    return 'n/a';
  }
  return pct(item.exactModelCoverageByCostShare);
}

function formatFamilyCoverage(item: CandidatePortfolio): string {
  if (item.estimateKind === 'plan-fit') {
    return `availability: ${item.modelAvailability ?? 'unknown'}`;
  }
  return pct(item.familyCoverageByCostShare);
}

function formatTierCoverage(item: CandidatePortfolio): string {
  if (item.estimateKind === 'plan-fit') {
    return `plan adequacy: ${item.planAdequacy ?? 'not-evaluated'}`;
  }
  return pct(item.tierCoverageByCostShare);
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function clampPct(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, value));
}

function displayModelName(modelId: string): string {
  return MODEL_PRICING[modelId]?.displayName ?? modelId;
}

function confidenceClass(value: string | undefined): string {
  const normalized = (value ?? '').toLowerCase();
  if (normalized === 'high') {
    return 'confidence-high';
  }
  if (normalized === 'medium') {
    return 'confidence-medium';
  }
  if (normalized === 'low') {
    return 'confidence-low';
  }
  return 'confidence-unknown';
}

function renderSavingsVsBaselineValue(savingsUsd: number, baselineMonthlyUsd: number): string {
  const classified = classifySavingsVsBaseline(savingsUsd, baselineMonthlyUsd);
  const sign = savingsUsd > 0 ? '+' : savingsUsd < 0 ? '-' : '';
  const valueText = `${sign}$${Math.abs(savingsUsd).toFixed(2)}`;

  if (classified.flag === 'significant_savings') {
    const title = `Savings exceed the near-current buffer (+/-$${classified.marginUsd.toFixed(2)}).`;
    return `<span class="savings-significant" title="${esc(title)}">${esc(valueText)}</span>`;
  }
  if (classified.flag === 'near_current') {
    const title = `Within the near-current buffer (+/-$${classified.marginUsd.toFixed(2)}).`;
    return `<span class="savings-buffered" title="${esc(title)}">${esc(valueText)}</span>`;
  }
  if (classified.flag === 'higher') {
    const title = `Higher than baseline by more than the near-current buffer (+/-$${classified.marginUsd.toFixed(2)}).`;
    return `<span class="savings-negative" title="${esc(title)}">${esc(valueText)}</span>`;
  }
  return `<span class="muted-cell">${esc(valueText)}</span>`;
}
