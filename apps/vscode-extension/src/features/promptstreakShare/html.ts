/** PromptStreak share webview HTML. */

import { PromptstreakShareSettings, ShareFieldConfig, ShareHistoryEntry } from './types';
import { commonStyles, esc, loadingPage } from './sharedHtml';

export { loadingPage };

export interface PromptstreakShareViewState {
  settings: PromptstreakShareSettings;
  history: ShareHistoryEntry[];
  historyPagination: {
    currentPage: number;
    totalPages: number;
    totalEntries: number;
    startEntry: number;
    endEntry: number;
  };
  linked: boolean;
  maskedToken: string;
  linkStatusLabel: string;
  linkStatusTone: 'ok' | 'warning' | 'neutral';
  disableRelinkActions: boolean;
  canUnlink: boolean;
}

function checked(value: boolean): string {
  return value ? ' checked' : '';
}

function promptstreakLogo(): string {
  return `<svg class="promptstreak-logo" viewBox="0 0 64 64" aria-hidden="true">
    <defs>
      <linearGradient id="psg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#38bdf8"/>
        <stop offset="100%" stop-color="#2563eb"/>
      </linearGradient>
    </defs>
    <rect x="6" y="6" width="52" height="52" rx="14" fill="url(#psg)"/>
    <path d="M22 20h13c7 0 12 4 12 10s-5 10-12 10h-7v8h-6V20zm6 6v8h7c4 0 6-2 6-4s-2-4-6-4h-7z" fill="#eef6ff"/>
  </svg>`;
}

function statusToneClass(tone: PromptstreakShareViewState['linkStatusTone']): string {
  if (tone === 'ok') {
    return 'chip-status-ok';
  }
  if (tone === 'warning') {
    return 'chip-status-warning';
  }
  return 'chip-status-neutral';
}

function recipeButton(recipe: 'privacy_first' | 'standard' | 'full', active: boolean, label: string): string {
  return `<button class="recipe-btn${active ? ' recipe-btn-active' : ''}" onclick="applyRecipe('${recipe}')">${esc(label)}</button>`;
}

function fieldToggleRow(key: keyof ShareFieldConfig, label: string, hint: string, value: boolean): string {
  return `<label class="toggle-row">
    <span>
      <strong>${esc(label)}</strong>
      <small>${esc(hint)}</small>
    </span>
    <input type="checkbox"${checked(value)} onchange="toggleField('${key}', this.checked)">
  </label>`;
}

function historyRows(history: ShareHistoryEntry[]): string {
  if (history.length === 0) {
    return '<tr><td colspan="4" class="muted">No send history yet.</td></tr>';
  }

  return history.map(entry => {
    const ts = new Date(entry.timestampIso).toLocaleString();
    const code = typeof entry.httpStatus === 'number' ? `HTTP ${entry.httpStatus}` : '-';
    return `<tr>
      <td>${esc(ts)}</td>
      <td>${esc(entry.status)}</td>
      <td>${esc(code)}</td>
      <td title="${esc(entry.detail)}">${esc(entry.detail)}</td>
    </tr>`;
  }).join('');
}

export function getPromptstreakShareHtml(state: PromptstreakShareViewState): string {
  const settings = state.settings;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>PromptStreak Share</title>
${commonStyles()}
<style>
  .page { display: flex; flex-direction: column; gap: 12px; }
  .card { background: var(--vscode-editorWidget-background, #1e293b); border: 1px solid var(--vscode-editorWidget-border, #334155); border-radius: 8px; padding: 12px; }
  .card h3 { margin-bottom: 10px; color: var(--vscode-textLink-foreground, #38bdf8); font-size: 0.98em; }
  .muted { color: var(--vscode-descriptionForeground, #94a3b8); }
  .header-title { display: flex; align-items: center; gap: 8px; }
  .promptstreak-logo { width: 1.25em; height: 1.25em; flex-shrink: 0; }
  .hint { font-size: 0.85em; color: var(--vscode-descriptionForeground, #94a3b8); line-height: 1.5; }
  .hint-label { font-size: 0.78em; color: var(--vscode-descriptionForeground, #94a3b8); text-transform: uppercase; letter-spacing: 0.03em; }
  .toggle-row { display: flex; justify-content: space-between; gap: 16px; align-items: center; border-bottom: 1px solid var(--vscode-editorWidget-border, #334155); padding: 8px 0; }
  .toggle-row:last-child { border-bottom: none; }
  .toggle-row strong { display: block; margin-bottom: 2px; }
  .toggle-row small { display: block; color: var(--vscode-descriptionForeground, #94a3b8); }
  .toggle-row input { width: 18px; height: 18px; }
  .recipe-row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
  .recipe-btn { border: 1px solid var(--vscode-button-secondaryBackground, #334155); background: transparent; color: var(--vscode-foreground); border-radius: 6px; padding: 6px 10px; cursor: pointer; }
  .recipe-btn-active { border-color: var(--vscode-button-background, #2563eb); background: rgba(37,99,235,0.15); }
  .top-toggle { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
  .top-toggle input { width: 20px; height: 20px; }
  .actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
  .link-card-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; margin-bottom: 6px; }
  .link-card-left, .link-card-right { display: flex; flex-direction: column; gap: 4px; }
  .link-card-right { align-items: flex-end; text-align: right; }
  .alias-chip-row, .status-chip-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .alias-editor { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; align-items: center; }
  .hidden { display: none !important; }
  .alias-input { flex: 1; min-width: 220px; background: var(--vscode-input-background, #0f172a); color: var(--vscode-input-foreground, #e2e8f0); border: 1px solid var(--vscode-input-border, #334155); border-radius: 6px; padding: 6px 8px; }
  .chip { display: inline-block; background: var(--vscode-badge-background, #334155); color: var(--vscode-badge-foreground, #e2e8f0); border-radius: 999px; padding: 2px 8px; font-size: 0.78em; }
  .chip-status-ok { background: rgba(34, 197, 94, 0.22); color: #bbf7d0; }
  .chip-status-warning { background: rgba(245, 158, 11, 0.22); color: #fde68a; }
  .chip-status-neutral { background: var(--vscode-badge-background, #334155); color: var(--vscode-badge-foreground, #e2e8f0); }
  .icon-btn { width: 24px; height: 24px; border-radius: 999px; font-size: 0.92em; }
  .btn[disabled] { opacity: 0.55; cursor: default; }
  table { width: 100%; border-collapse: collapse; font-size: 0.85em; }
  th, td { border-bottom: 1px solid var(--vscode-editorWidget-border, #334155); padding: 6px 8px; text-align: left; }
  .history-pagination { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
  .history-pagination .btn[disabled] { opacity: 0.55; cursor: default; }
  .footer-note { font-size: 0.8em; color: var(--vscode-descriptionForeground, #94a3b8); }
</style>
</head>
<body>
<div class="header">
  <h1 class="header-title">${promptstreakLogo()} PromptStreak Share</h1>
  <div class="header-actions">
    <button class="btn" onclick="refresh()" title="Refresh">↻</button>
    <button class="btn btn-secondary" onclick="openSettings()" title="Settings">⚙</button>
  </div>
</div>

<div class="page">
  <section class="card">
    <h3>1. Consent and GDPR-safe sharing</h3>
    <div class="top-toggle">
      <div>
        <strong>Enable sharing to PromptStreak (${esc(settings.promptstreakBaseUrl)})</strong><br>
        <span class="hint">Only normalized metrics are sent: token counts, request counts, model IDs, and timestamps.</span>
      </div>
      <input type="checkbox"${checked(settings.enabled)} onchange="toggleEnabled(this.checked)">
    </div>
    <p class="hint">
      Never shared: prompts, completions, source code, terminal output, secrets, environment variables, diffs, or chat transcripts.
      <a href="#" onclick="openPrivacyPolicy(); return false;">Read privacy policy</a>.
    </p>
  </section>

  <section class="card">
    <h3>2. Login and device link</h3>
    <div class="link-card-head">
      <div class="link-card-left">
        <span class="hint-label">Device alias</span>
        <div class="alias-chip-row">
          <span class="chip">${esc((settings.deviceAlias || '').trim() || 'Not set')}</span>
          <button class="btn btn-secondary icon-btn" onclick="toggleAliasEditor()" title="Edit alias">✎</button>
        </div>
      </div>
      <div class="link-card-right">
        <span class="hint-label">Status</span>
        <div class="status-chip-row">
          <span class="chip ${statusToneClass(state.linkStatusTone)}">${esc(state.linkStatusLabel)}</span>
          ${state.maskedToken ? `<span class="chip">${esc(state.maskedToken)}</span>` : ''}
        </div>
      </div>
    </div>
    <p class="hint">Alias is required to link this device.</p>
    <div id="aliasEditor" class="alias-editor hidden">
      <input
        id="deviceAliasInput"
        class="alias-input"
        type="text"
        maxlength="64"
        placeholder="Set device alias"
        value="${esc(settings.deviceAlias || '')}"
      >
      <button class="btn btn-secondary icon-btn" onclick="saveDeviceAlias()" title="Save alias">💾</button>
    </div>
    <div class="actions">
      <button class="btn btn-secondary" style="width:auto;padding:0 10px;" onclick="linkAccount()"${state.disableRelinkActions ? ' disabled' : ''}>Sign in and link device</button>
      <button class="btn btn-secondary" style="width:auto;padding:0 10px;" onclick="useClipboardToken()"${state.disableRelinkActions ? ' disabled' : ''}>Use copied token</button>
      <button class="btn btn-secondary" style="width:auto;padding:0 10px;" onclick="unlinkAccount()"${state.canUnlink ? '' : ' disabled'}>Unlink device</button>
    </div>
  </section>

  <section class="card">
    <h3>3. Configurator</h3>
    <div class="recipe-row">
      ${recipeButton('privacy_first', settings.recipe === 'privacy_first', 'Privacy-first')}
      ${recipeButton('standard', settings.recipe === 'standard', 'Standard')}
      ${recipeButton('full', settings.recipe === 'full', 'Full (future-proof)')}
    </div>
    ${fieldToggleRow('includeDailyBuckets', 'Daily buckets', 'Aggregated per-day request and token totals.', settings.fields.includeDailyBuckets)}
    ${fieldToggleRow('includeModelBreakdown', 'Model breakdown', 'Per-model token and request breakdown.', settings.fields.includeModelBreakdown)}
    ${fieldToggleRow('includeActionCounts', 'Action counts', 'Aggregated tool/action usage counts.', settings.fields.includeActionCounts)}
    ${fieldToggleRow('includeRepoAttribution', 'Repo attribution', 'Attach repository identity when available.', settings.fields.includeRepoAttribution)}
    <p class="hint">Current recipe: <span class="chip">${esc(settings.recipe)}</span> • Auto-sync every ${settings.autoSyncMinutes} minutes.</p>
  </section>

  <section class="card">
    <h3>4. Send and local history</h3>
    <div class="actions">
      <button class="btn" style="width:auto;padding:0 10px;" onclick="sendNow()">Send now</button>
      <button class="btn btn-secondary" style="width:auto;padding:0 10px;" onclick="clearHistory()">Clear history</button>
    </div>
    <table>
      <thead>
        <tr>
          <th>Time</th>
          <th>Status</th>
          <th>Code</th>
          <th>Detail</th>
        </tr>
      </thead>
      <tbody>
        ${historyRows(state.history)}
      </tbody>
    </table>
    <div class="history-pagination">
      <button
        class="btn btn-secondary"
        style="width:auto;padding:0 10px;"
        onclick="historyPrevPage()"
        ${state.historyPagination.currentPage <= 1 ? 'disabled' : ''}
      >
        Previous
      </button>
      <span class="hint">
        Page ${state.historyPagination.currentPage} of ${state.historyPagination.totalPages}
        • Showing ${state.historyPagination.startEntry}-${state.historyPagination.endEntry} of ${state.historyPagination.totalEntries}
      </span>
      <button
        class="btn btn-secondary"
        style="width:auto;padding:0 10px;"
        onclick="historyNextPage()"
        ${state.historyPagination.currentPage >= state.historyPagination.totalPages ? 'disabled' : ''}
      >
        Next
      </button>
    </div>
    <p class="footer-note">History is local only and retained up to ${settings.historyLimit} entries.</p>
  </section>
</div>

<script>
const vscode = acquireVsCodeApi();
function refresh() { vscode.postMessage({ command: 'refresh' }); }
function toggleEnabled(enabled) { vscode.postMessage({ command: 'toggleEnabled', enabled: !!enabled }); }
function applyRecipe(recipe) { vscode.postMessage({ command: 'applyRecipe', recipe }); }
function toggleField(field, enabled) { vscode.postMessage({ command: 'toggleField', field, enabled: !!enabled }); }
function sendNow() { vscode.postMessage({ command: 'sendNow' }); }
function clearHistory() { vscode.postMessage({ command: 'clearHistory' }); }
function historyPrevPage() { vscode.postMessage({ command: 'historyPrevPage' }); }
function historyNextPage() { vscode.postMessage({ command: 'historyNextPage' }); }
function linkAccount() { vscode.postMessage({ command: 'linkAccount' }); }
function toggleAliasEditor() {
  const section = document.getElementById('aliasEditor');
  if (!section || !section.classList) {
    return;
  }
  section.classList.toggle('hidden');
  if (!section.classList.contains('hidden')) {
    const input = document.getElementById('deviceAliasInput');
    if (input && typeof input.focus === 'function') {
      input.focus();
    }
  }
}
function saveDeviceAlias() {
  const input = document.getElementById('deviceAliasInput');
  const alias = input && 'value' in input ? String(input.value || '') : '';
  vscode.postMessage({ command: 'saveDeviceAlias', alias });
}
function useClipboardToken() { vscode.postMessage({ command: 'useClipboardToken' }); }
function unlinkAccount() { vscode.postMessage({ command: 'unlinkAccount' }); }
function openSettings() { vscode.postMessage({ command: 'openSettings' }); }
function openPrivacyPolicy() { vscode.postMessage({ command: 'openPrivacyPolicy' }); }
</script>
</body>
</html>`;
}
