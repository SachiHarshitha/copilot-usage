/** Status bar item showing workspace token count. */

import * as vscode from 'vscode';
import { findWorkspaceByPath } from '../core/discovery';
import { parseAllFiles, flattenEvents } from '../core/aggregator';

export class StatusBarManager implements vscode.Disposable {
  private item: vscode.StatusBarItem;
  private disposables: vscode.Disposable[] = [];

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 50);
    this.item.command = 'copilot-usage.workspaceAnalysis';
    this.item.tooltip = 'Copilot Usage — Click to view workspace analysis';
    this.item.text = '$(copilot) …';
    this.item.show();

    // Refresh when workspace changes
    this.disposables.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.refresh()),
    );

    // Refresh on JSONL changes
    const watcher = vscode.workspace.createFileSystemWatcher('**/chatSessions/*.jsonl');
    this.disposables.push(
      watcher,
      watcher.onDidCreate(() => this.refresh()),
      watcher.onDidChange(() => this.refresh()),
    );

    this.refresh();
  }

  async refresh(): Promise<void> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      this.item.text = '$(copilot) No workspace';
      return;
    }

    try {
      const ws = await findWorkspaceByPath(folders[0].uri.fsPath);
      if (!ws) {
        this.item.text = '$(copilot) No data';
        return;
      }

      const parsed = await parseAllFiles([ws]);
      const events = flattenEvents(parsed);
      const totalTokens = events.reduce((sum, e) => sum + e.promptTokens + e.outputTokens, 0);
      this.item.text = `$(copilot) ${formatCompact(totalTokens)} tokens`;
    } catch {
      this.item.text = '$(copilot) Error';
    }
  }

  dispose(): void {
    this.item.dispose();
    for (const d of this.disposables) { d.dispose(); }
  }
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) { return (n / 1_000_000).toFixed(1) + 'M'; }
  if (n >= 1_000) { return (n / 1_000).toFixed(1) + 'k'; }
  return String(n);
}
