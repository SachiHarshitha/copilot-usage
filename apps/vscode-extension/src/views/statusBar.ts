/** Status bar item showing workspace token count, split by input/output. */

import * as vscode from 'vscode';
import { findCurrentWorkspace } from '../core/discovery';
import { parseAllFiles, flattenEvents } from '../core/aggregator';
import { RequestEvent } from '../core/types';
import { didAffectCopilotDebugLogSetting, isCopilotDebugLogEnabled } from '../core/copilotDebugLog';

type StatusBarDuration = 'daily' | 'monthly' | 'all-time';

export class StatusBarManager implements vscode.Disposable {
  private item: vscode.StatusBarItem;
  private shareItem: vscode.StatusBarItem;
  private debugLogItem: vscode.StatusBarItem;
  private disposables: vscode.Disposable[] = [];

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 50);
    this.item.command = 'copilot-usage.workspaceAnalysis';
    this.item.text = '$(copilot) …';
    this.item.show();

    this.shareItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 49);
    this.shareItem.command = 'copilot-usage.promptstreakShare';
    this.shareItem.text = '$(share)';
    this.shareItem.tooltip = 'Share my stats to Promptstreak.dev';
    this.shareItem.show();
    this.debugLogItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 48);
    this.debugLogItem.command = 'copilot-usage.openDebugLogSettings';
    this.debugLogItem.text = '$(warning) Enable Copilot debug logs';
    this.debugLogItem.tooltip =
      'Copilot Usage: Enable GitHub Copilot Chat agent debug file logging for full token visibility across VS Code versions. Click to open the setting.';
    this.disposables.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.refresh()),
      vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('copilot-usage') || didAffectCopilotDebugLogSetting(e)) { this.refresh(); }
      }),
    );

    this.refresh();
  }

  async refresh(): Promise<void> {
    if (isCopilotDebugLogEnabled()) {
      this.debugLogItem.hide();
    } else {
      this.debugLogItem.show();
    }

    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      this.item.text = '$(copilot) No workspace';
      this.item.tooltip = 'Copilot Usage — No workspace open';
      return;
    }

    try {
      const wsFileUri = vscode.workspace.workspaceFile?.toString();
      const folderPaths = folders.map(f => f.uri.fsPath);
      const ws = await findCurrentWorkspace(wsFileUri, folderPaths);
      if (!ws) {
        this.item.text = '$(copilot) No data';
        this.item.tooltip = 'Copilot Usage — No session data found for this workspace';
        return;
      }

      const duration = vscode.workspace.getConfiguration('copilot-usage')
        .get<StatusBarDuration>('statusBar.duration', 'all-time');

      const parsed = await parseAllFiles([ws]);
      const allEvents = flattenEvents(parsed);
      const events = filterByDuration(allEvents, duration);

      const inputTokens = events.reduce((sum, e) => sum + e.promptTokens, 0);
      const outputTokens = events.reduce((sum, e) => sum + e.outputTokens, 0);

      const durationLabel = duration === 'daily' ? 'today' : duration === 'monthly' ? 'this month' : 'all time';
      this.item.text = `$(copilot) $(arrow-up)${formatCompact(inputTokens)} $(arrow-down)${formatCompact(outputTokens)}`;
      this.item.tooltip = new vscode.MarkdownString(
        `**Copilot Usage** (${durationLabel})\n\n` +
        `$(arrow-up) Input tokens: ${inputTokens.toLocaleString('en-US')}\n\n` +
        `$(arrow-down) Output tokens: ${outputTokens.toLocaleString('en-US')}\n\n` +
        `_Click to open workspace analysis. Change duration in Settings → Copilot Usage._`,
        true,
      );
    } catch {
      this.item.text = '$(copilot) Error';
      this.item.tooltip = 'Copilot Usage — Error reading session data';
    }
  }

  dispose(): void {
    this.item.dispose();
    this.shareItem.dispose();
    this.debugLogItem.dispose();
    for (const d of this.disposables) { d.dispose(); }
  }
}

function filterByDuration(events: RequestEvent[], duration: StatusBarDuration): RequestEvent[] {
  if (duration === 'all-time') { return events; }
  const now = new Date();
  const todayStr = toLocalDateStr(now);
  const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return events.filter(e => {
    if (typeof e.timestampMs !== 'number') { return false; }
    const d = new Date(e.timestampMs);
    if (duration === 'daily') { return toLocalDateStr(d) === todayStr; }
    // monthly: current calendar month (MTD, resets on the 1st)
    const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return m === monthStr;
  });
}

function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) { return (n / 1_000_000).toFixed(1) + 'M'; }
  if (n >= 1_000) { return (n / 1_000).toFixed(1) + 'k'; }
  return String(n);
}

