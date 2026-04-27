/** Cost Estimator HTML view. Renders the full webview document.
 *  Self-contained — uses only shared CSS helpers from views/panels.ts. */

import { commonStyles, esc, fmt, headerIcon, loadingPage } from './sharedHtml';
import {
  CostEstimate,
  CostEstimatorSettings,
  CostRangeKey,
  PlanImpactEstimate,
  TrendInsight,
  UsageEstimate,
} from './types';
import { MODEL_PRICING_LIST } from './pricing/models';
import { PLAN_ALLOWANCES } from './pricing/plans';
import { PRICING_METADATA } from './pricing/metadata';

export interface CostEstimatorViewState {
  settings: CostEstimatorSettings;
  usage: UsageEstimate;
  selectedCost: CostEstimate;
  comparisonCosts: CostEstimate[];
  planImpact: PlanImpactEstimate;
  trend: TrendInsight | null;
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
  { v: 'business', l: 'Copilot Business' },
  { v: 'enterprise', l: 'Copilot Enterprise' },
];

const BILLINGS: { v: string; l: string }[] = [
  { v: 'individual_monthly', l: 'Individual — Monthly' },
  { v: 'individual_annual', l: 'Individual — Annual' },
  { v: 'mobile_ios_android', l: 'Mobile (iOS/Android)' },
  { v: 'organization_managed', l: 'Organization-managed' },
];

export function getCostEstimatorHtml(state: CostEstimatorViewState): string {
  const s = state.settings;
  const u = state.usage;
  const c = state.selectedCost;
  const p = state.planImpact;
  const observedWindowSub = observedWindowSubtitle(u);

  const noData = !state.hasAnyData;

  const rangeOptions = RANGES.map(r =>
    `<option value="${r.v}"${r.v === s.defaultRange ? ' selected' : ''}>${esc(r.l)}</option>`).join('');

  const planOptions = PLANS.map(o =>
    `<option value="${o.v}"${o.v === s.selectedPlan ? ' selected' : ''}>${esc(o.l)}</option>`).join('');

  const billingOptions = BILLINGS.map(o =>
    `<option value="${o.v}"${o.v === s.billingModel ? ' selected' : ''}>${esc(o.l)}</option>`).join('');

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

  const trendHtml = state.trend
    ? `<div class="trend">📈 ${esc(state.trend.label)}</div>`
    : `<div class="trend muted">📈 Trend insight needs at least 30 days of session data.</div>`;

  const noDataBanner = noData
    ? `<div class="warn-banner">No Copilot session data found yet. Use the model comparison table below to explore typical pricing for sample workloads, then come back after you\u2019ve used Copilot for a few days for personalized estimates.</div>`
    : '';

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
  </div>
</div>

<div class="disclaimer">
  <strong>Estimate only.</strong> This page shows what your token usage <em>would cost</em> at the new GitHub Copilot AI Credits pricing (effective ${esc(PRICING_METADATA.effectiveDate)}).
  It is <strong>not</strong> a bill, an invoice, or a guaranteed forecast. Actual GitHub Copilot charges depend on your plan, your billing entity, your organization\u2019s pooled credits, and any future changes from GitHub.
</div>

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
    <label>Extra budget per month (USD)
      <input id="budgetInput" type="number" min="0" step="1" value="${s.extraBudgetUsd}" onchange="setSetting('extraBudgetUsd', this.value)">
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
  ${kpi('Observed input tokens', fmt(u.observedInputTokens), observedWindowSub)}
  ${kpi('Observed output tokens', fmt(u.observedOutputTokens), observedWindowSub)}
  ${kpi('Projected monthly tokens', fmt(u.monthlyInputTokens + u.monthlyOutputTokens), 'normalized to 30 days')}
</div>

<div class="disclaimer">
  <strong>Cache token data not yet tracked.</strong> Cached input and cache write tokens are billed separately by GitHub but are not currently captured by this extension. The numbers above use only prompt + output tokens, which means actual costs may be slightly higher (or lower, if caching reduces input billing).
</div>

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
</script>
</body></html>`;
}

function kpi(label: string, value: string, sub?: string): string {
  const subHtml = sub ? `<div class="sub">${esc(sub)}</div>` : '';
  return `<div class="kpi"><div class="value">${esc(value)}</div><div class="label">${esc(label)}</div>${subHtml}</div>`;
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
  return `<tr class="${isSelected ? 'selected' : ''}">
    <td>${esc(c.modelDisplayName)}${isSelected ? ' <strong>(selected)</strong>' : ''}</td>
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
