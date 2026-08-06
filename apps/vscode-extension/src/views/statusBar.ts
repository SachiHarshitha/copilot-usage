/** Status bar item showing workspace token count, split by input/output. */

import * as vscode from 'vscode';
import { findCurrentWorkspace, getWorkspaceStorageRoots } from '../core/discovery';
import { parseAllFiles, flattenEvents } from '../core/aggregator';
import { flattenMeteredFiles, parseAllMeteredFiles, resolveMeteredConfidence } from '../core/meteredUsage';
import { MeteredConfidence, MeteredRound, RequestEvent } from '../core/types';
import { didAffectCopilotDebugLogSetting, isCopilotDebugLogEnabled } from '../core/copilotDebugLog';

type StatusBarDuration = 'daily' | 'monthly' | 'all-time';
const DEFAULT_METERED_MIN_COVERAGE = 0.95;

interface LocalStatusUsage {
  inputTokens: number;
  outputTokens: number;
  requests: number;
}

interface MeteredStatusUsage {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  rounds: number;
  coverage: number;
  confidence: MeteredConfidence;
}

export class StatusBarManager implements vscode.Disposable {
  private item: vscode.StatusBarItem;
  private debugLogItem: vscode.StatusBarItem;
  private disposables: vscode.Disposable[] = [];
  private storageRoots?: string[];

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 50);
    this.item.command = 'copilot-usage.workspaceAnalysis';
    this.item.text = '$(copilot) …';
    this.item.show();

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

  async refresh(storageRoots?: string[]): Promise<void> {
    this.storageRoots ??= storageRoots ?? getWorkspaceStorageRoots(vscode.env.appName);
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
      const ws = await findCurrentWorkspace(wsFileUri, folderPaths, this.storageRoots);
      if (!ws) {
        this.item.text = '$(copilot) No data';
        this.item.tooltip = 'Copilot Usage — No session data found for this workspace';
        return;
      }

      const duration = vscode.workspace.getConfiguration('copilot-usage')
        .get<StatusBarDuration>('statusBar.duration', 'all-time');
      const meteredEnabled = vscode.workspace.getConfiguration('copilot-usage')
        .get<boolean>('metered.enabled', true);
      const meteredMinCoverage = clamp01(vscode.workspace.getConfiguration('copilot-usage')
        .get<number>('metered.minCoverage', DEFAULT_METERED_MIN_COVERAGE));

      const parsed = await parseAllFiles([ws]);
      const allEvents = flattenEvents(parsed);
      const events = filterByDuration(allEvents, duration);

      const inputTokens = events.reduce((sum, e) => sum + e.promptTokens, 0);
      const outputTokens = events.reduce((sum, e) => sum + e.outputTokens, 0);
      const localUsage: LocalStatusUsage = {
        inputTokens,
        outputTokens,
        requests: events.length,
      };

      let meteredUsage: MeteredStatusUsage | undefined;
      let meteredHint: string | undefined;

      if (!meteredEnabled) {
        meteredHint = 'Metered parsing is disabled in Copilot Usage settings.';
      } else if (!ws.debugLogFiles || ws.debugLogFiles.length === 0) {
        meteredHint = 'No Copilot debug-log files found for this workspace.';
      } else {
        try {
          const parsedMetered = await parseAllMeteredFiles([ws]);
          const flatMetered = flattenMeteredFiles(parsedMetered);
          const meteredRounds = filterMeteredByDuration(flatMetered.rounds, duration);
          if (meteredRounds.length === 0) {
            meteredHint = 'No metered rounds found for the selected duration.';
          } else {
            meteredUsage = summarizeMeteredForStatus(meteredRounds, meteredMinCoverage);
            if (!isCopilotDebugLogEnabled()) {
              meteredHint = 'Copilot debug-log file logging is currently disabled; metered values may stop updating.';
            }
          }
        } catch {
          meteredHint = 'Could not read Copilot debug-log files for metered values.';
        }
      }

      const durationLabel = duration === 'daily' ? 'today' : duration === 'monthly' ? 'this month' : 'all time';
      this.item.text = `$(copilot) $(arrow-up)${formatCompact(inputTokens)} $(arrow-down)${formatCompact(outputTokens)}`;
      this.item.tooltip = new vscode.MarkdownString(buildStatusTooltipMarkdown(durationLabel, localUsage, meteredUsage, meteredHint), true);
    } catch {
      this.item.text = '$(copilot) Error';
      this.item.tooltip = 'Copilot Usage — Error reading session data';
    }
  }

  dispose(): void {
    this.item.dispose();
    this.debugLogItem.dispose();
    for (const d of this.disposables) { d.dispose(); }
  }
}

function filterByDuration(events: RequestEvent[], duration: StatusBarDuration): RequestEvent[] {
  const startMs = durationStartMs(duration);
  if (startMs === undefined) { return events; }
  return events.filter(e => typeof e.timestampMs === 'number' && e.timestampMs >= startMs);
}

function filterMeteredByDuration(rounds: MeteredRound[], duration: StatusBarDuration): MeteredRound[] {
  const startMs = durationStartMs(duration);
  if (startMs === undefined) { return rounds; }
  return rounds.filter(r => typeof r.timestampMs === 'number' && r.timestampMs >= startMs);
}

function durationStartMs(duration: StatusBarDuration, now = new Date()): number | undefined {
  if (duration === 'all-time') {
    return undefined;
  }
  if (duration === 'daily') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  }
  return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
}

function summarizeMeteredForStatus(rounds: MeteredRound[], minCoverage: number): MeteredStatusUsage {
  let inputTokens = 0;
  let outputTokens = 0;
  let cachedTokens = 0;
  let roundsWithCredits = 0;

  for (const r of rounds) {
    inputTokens += r.inputTokens;
    outputTokens += r.outputTokens;
    cachedTokens += r.cachedTokens;
    if (r.hasCredits) {
      roundsWithCredits += 1;
    }
  }

  const coverage = rounds.length > 0 ? roundsWithCredits / rounds.length : 0;
  return {
    inputTokens,
    outputTokens,
    cachedTokens,
    rounds: rounds.length,
    coverage,
    confidence: resolveMeteredConfidence(coverage, minCoverage),
  };
}

function confidenceLabel(confidence: MeteredConfidence): string {
  if (confidence === 'exact') { return 'Exact'; }
  if (confidence === 'partial') { return 'Partial'; }
  return 'Unavailable';
}

function formatMaybe(n: number | undefined): string {
  return typeof n === 'number' ? n.toLocaleString('en-US') : 'Unavailable';
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) { return DEFAULT_METERED_MIN_COVERAGE; }
  return Math.min(1, Math.max(0, value));
}

export function buildStatusTooltipMarkdown(
  durationLabel: string,
  local: LocalStatusUsage,
  metered?: MeteredStatusUsage,
  meteredHint?: string,
): string {
  const meteredInput = formatMaybe(metered?.inputTokens);
  const meteredOutput = formatMaybe(metered?.outputTokens);
  const meteredCache = formatMaybe(metered?.cachedTokens);
  const meteredRounds = metered ? `${formatMaybe(metered.rounds)} rounds` : 'Unavailable';

  const lines: string[] = [
    `**Copilot Usage** (${durationLabel})`,
    '',
    '| Item | Estimated (local) | Metered (GitHub) |',
    '|---|---:|---:|',
    `| Input Tokens | ${local.inputTokens.toLocaleString('en-US')} | ${meteredInput} |`,
    `| Output Tokens | ${local.outputTokens.toLocaleString('en-US')} | ${meteredOutput} |`,
    `| Cached Tokens | — | ${meteredCache} |`,
    `| Requests / Rounds | ${local.requests.toLocaleString('en-US')} requests | ${meteredRounds} |`,
    '',
  ];

  if (metered) {
    lines.push(
      `Metered confidence: **${confidenceLabel(metered.confidence)}** (${(metered.coverage * 100).toFixed(1)}% of rounds include copilotUsageNanoAiu).`,
    );
  } else {
    lines.push('Metered confidence: **Unavailable**.');
  }

  if (meteredHint) {
    lines.push('', `Metered availability note: _${meteredHint}_`);
  }

  lines.push('', '_Click to open workspace analysis. Change duration in Settings → Copilot Usage._');
  return lines.join('\n');
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) { return (n / 1_000_000).toFixed(1) + 'M'; }
  if (n >= 1_000) { return (n / 1_000).toFixed(1) + 'k'; }
  return String(n);
}

