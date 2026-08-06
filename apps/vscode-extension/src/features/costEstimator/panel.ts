/** Cost Estimator webview panel — singleton, mirrors DashboardPanel pattern. */

import * as vscode from 'vscode';
import { discoverWorkspaces } from '../../core/discovery';
import { parseAllFiles, flattenEvents } from '../../core/aggregator';
import {
  aggregateMetered,
  flattenMeteredFiles,
  parseAllMeteredFiles,
  resolveMeteredConfidence,
} from '../../core/meteredUsage';
import { MeteredRound, RequestEvent } from '../../core/types';
import { DashboardPanel } from '../../views/panels';
import { CostEstimatorSettings, CostRangeKey, MeteredModeStatus } from './types';
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from './settings';
import { buildMeteredUsageEstimate, buildUsageEstimate, rangeBoundsForMetered } from './calc/usage';
import { estimateModelCost } from './calc/cost';
import { computePlanImpact } from './calc/plan';
import { computeTrendInsight } from './calc/trend';
import { buildProviderEstimates } from './calc/providers';
import { buildProviderModelCostContext } from './calc/modelMix';
import { buildProviderDecisionSurface } from './calc/providerPortfolio';
import { filterEventsByCostRange, pickMostUsedModelId } from './calc/modelSelection';
import { MODEL_PRICING, MODEL_PRICING_LIST } from './pricing/models';
import { getCostEstimatorHtml, loadingPage, CostEstimatorViewState } from './html';

const DEFAULT_METERED_MIN_COVERAGE = 0.95;

export class CostEstimatorPanel {
  public static currentPanel: CostEstimatorPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];
  private disposed = false;
  private settings: CostEstimatorSettings;

  private constructor(
    panel: vscode.WebviewPanel,
    private extensionUri: vscode.Uri,
    private context: vscode.ExtensionContext,
  ) {
    this.panel = panel;
    this.settings = loadSettings(context);
    this.panel.webview.options = { enableScripts: true };
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      async (msg) => {
        if (msg.command === 'refresh') { this.showLoading(); await this.loadData(); }
        if (msg.command === 'setSetting') { await this.handleSetSetting(msg.key, msg.value); }
        if (msg.command === 'setRange') { await this.handleSetRange(msg.range); }
        if (msg.command === 'openDashboard') {
          await DashboardPanel.createOrShow(this.extensionUri);
        }
        if (msg.command === 'openGitHub') {
          vscode.env.openExternal(vscode.Uri.parse('https://github.com/SachiHarshitha/copilot-usage'));
        }
        if (msg.command === 'openSettings') {
          await vscode.commands.executeCommand('workbench.action.openSettings', 'copilot-usage');
        }
      },
      null,
      this.disposables,
    );
  }

  public static async refresh(): Promise<void> {
    if (CostEstimatorPanel.currentPanel) {
      await CostEstimatorPanel.currentPanel.loadData();
    }
  }

  public static async createOrShow(
    extensionUri: vscode.Uri,
    context: vscode.ExtensionContext,
  ): Promise<void> {
    const column = vscode.ViewColumn.Active;
    if (CostEstimatorPanel.currentPanel) {
      CostEstimatorPanel.currentPanel.panel.reveal(column);
      CostEstimatorPanel.currentPanel.showLoading();
      await CostEstimatorPanel.currentPanel.loadData();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'copilotUsage.costEstimator',
      'Copilot Cost Estimator (Preview)',
      column,
      { enableScripts: true, retainContextWhenHidden: true },
    );

    CostEstimatorPanel.currentPanel = new CostEstimatorPanel(panel, extensionUri, context);
    CostEstimatorPanel.currentPanel.showLoading();
    await CostEstimatorPanel.currentPanel.loadData();
  }

  private async handleSetSetting(key: string, value: unknown): Promise<void> {
    if (key === 'extraBudgetUsd') {
      const n = Number(value);
      this.settings.extraBudgetUsd = Number.isFinite(n) && n >= 0 ? n : 0;
    } else if (key === 'usageSource') {
      this.settings.usageSource = value === 'metered' ? 'metered' : 'local';
    } else if (key === 'includeFlexAllowance') {
      this.settings.includeFlexAllowance = value === true || value === 'true';
    } else if (key === 'selectedPlan' || key === 'billingModel' || key === 'selectedModelId') {
      (this.settings as unknown as Record<string, unknown>)[key] = String(value);
    } else {
      return;
    }
    await saveSettings(this.context, this.settings);
    this.showLoading();
    await this.loadData();
  }

  private async handleSetRange(range: unknown): Promise<void> {
    const allowed: CostRangeKey[] = ['last_7_days', 'last_30_days', 'last_3_months', 'all_time'];
    const r = allowed.find(x => x === range);
    if (!r) { return; }
    this.settings.defaultRange = r;
    await saveSettings(this.context, this.settings);
    this.showLoading();
    await this.loadData();
  }

  private setHtml(html: string): void {
    if (!this.disposed) { this.panel.webview.html = html; }
  }

  private showLoading(): void {
    this.setHtml(loadingPage());
  }

  private async loadData(): Promise<void> {
    const workspaces = await discoverWorkspaces();
    const parsed = workspaces.length === 0 ? [] : await parseAllFiles(workspaces);
    const localEvents = flattenEvents(parsed);

    const cfg = vscode.workspace.getConfiguration('copilot-usage');
    const meteredEnabled = cfg.get<boolean>('metered.enabled', true);
    const meteredMinCoverage = clampCoverage(cfg.get<number>('metered.minCoverage', DEFAULT_METERED_MIN_COVERAGE));

    let sourceEvents = localEvents;
    let usage = buildUsageEstimate(localEvents, this.settings.defaultRange);
    let hasAnyData = localEvents.length > 0;
    let meteredStatus: MeteredModeStatus | undefined;

    if (this.settings.usageSource === 'metered') {
      if (!meteredEnabled) {
        sourceEvents = [];
        usage = buildMeteredUsageEstimate([], this.settings.defaultRange);
        hasAnyData = false;
        meteredStatus = {
          available: false,
          rounds: 0,
          userMessages: 0,
          coverage: 0,
          confidence: 'unavailable',
          note: 'Metered mode is disabled in settings (copilot-usage.metered.enabled = false).',
        };
      } else {
        const meteredFiles = await parseAllMeteredFiles(workspaces);
        const flattenedMetered = flattenMeteredFiles(meteredFiles);

        sourceEvents = meteredRoundsToRequestEvents(flattenedMetered.rounds);
        usage = buildMeteredUsageEstimate(flattenedMetered.rounds, this.settings.defaultRange);
        hasAnyData = flattenedMetered.rounds.length > 0;
        meteredStatus = summarizeMeteredMode(
          flattenedMetered.rounds,
          flattenedMetered.userMessages,
          this.settings.defaultRange,
          meteredMinCoverage,
        );
      }
    }

    const rangedEvents = filterEventsByCostRange(sourceEvents, this.settings.defaultRange);
    const modelEvents = rangedEvents.length > 0 ? rangedEvents : sourceEvents;
    const autoModelId = pickMostUsedModelId(modelEvents, Object.keys(MODEL_PRICING));
    const shouldAutoSelectMostUsed =
      this.settings.selectedModelId === DEFAULT_SETTINGS.selectedModelId
      || !MODEL_PRICING[this.settings.selectedModelId];

    if (shouldAutoSelectMostUsed && autoModelId && autoModelId !== this.settings.selectedModelId) {
      this.settings.selectedModelId = autoModelId;
      await saveSettings(this.context, this.settings);
    }

    const selectedPricing = MODEL_PRICING[this.settings.selectedModelId] ?? MODEL_PRICING_LIST[0];
    const selectedCost = estimateModelCost(usage, selectedPricing);
    const comparisonCosts = MODEL_PRICING_LIST.map(m => estimateModelCost(usage, m));
    const planImpact = computePlanImpact(selectedCost, this.settings);
    const trend = computeTrendInsight(sourceEvents);
    const providerModelContext = buildProviderModelCostContext(sourceEvents, this.settings.defaultRange);
    const providerBaselineUsd = providerModelContext?.monthlyUsd && providerModelContext.monthlyUsd > 0
      ? providerModelContext.monthlyUsd
      : selectedCost.estimatedMonthlyUsd;
    const providerEstimates = buildProviderEstimates(usage, this.settings, selectedCost, providerModelContext);
    const providerDecisionSurface = buildProviderDecisionSurface(
      providerEstimates,
      providerModelContext?.modelMonthlyUsage ?? [],
      providerBaselineUsd,
    );

    const state: CostEstimatorViewState = {
      settings: this.settings,
      usage,
      usageSource: this.settings.usageSource,
      meteredStatus,
      selectedCost,
      comparisonCosts,
      planImpact,
      trend,
      providerDecisionSurface,
      hasAnyData,
    };

    this.setHtml(getCostEstimatorHtml(state));
  }

  private dispose(): void {
    this.disposed = true;
    CostEstimatorPanel.currentPanel = undefined;
    this.panel.dispose();
    for (const d of this.disposables) { d.dispose(); }
    this.disposables = [];
  }
}

function meteredRoundsToRequestEvents(rounds: MeteredRound[]): RequestEvent[] {
  const requestIndexBySession = new Map<string, number>();
  const events: RequestEvent[] = [];

  for (const round of rounds) {
    const currentIndex = requestIndexBySession.get(round.chatSessionId) ?? 0;
    requestIndexBySession.set(round.chatSessionId, currentIndex + 1);

    const nonCachedInput = Math.max(0, (round.inputTokens || 0) - (round.cachedTokens || 0));

    events.push({
      chatSessionId: round.chatSessionId,
      requestIndex: currentIndex,
      modelId: round.modelId,
      timestampMs: round.timestampMs,
      promptTokens: nonCachedInput,
      outputTokens: round.outputTokens || 0,
      toolCallRounds: 0,
      tokensEstimated: false,
      workspaceId: round.workspaceId,
    });
  }

  return events;
}

function summarizeMeteredMode(
  rounds: MeteredRound[],
  userMessages: number,
  range: CostRangeKey,
  minCoverage: number,
): MeteredModeStatus {
  if (rounds.length === 0) {
    return {
      available: false,
      rounds: 0,
      userMessages,
      coverage: 0,
      confidence: 'unavailable',
      note: 'No metered llm_request rows were found in debug logs yet.',
    };
  }

  const bounds = rangeBoundsForMetered(range, rounds);
  const roundsInRange = rounds.filter(
    (round) => typeof round.timestampMs === 'number'
      && round.timestampMs >= bounds.startMs
      && round.timestampMs <= bounds.endMs,
  );

  if (roundsInRange.length === 0) {
    return {
      available: false,
      rounds: 0,
      userMessages,
      coverage: 0,
      confidence: 'unavailable',
      note: 'No metered rows were found in the selected estimate window.',
    };
  }

  const totals = aggregateMetered(roundsInRange, userMessages, []);
  const confidence = resolveMeteredConfidence(totals.coverage, minCoverage);
  const coveragePct = Math.round(totals.coverage * 1000) / 10;
  const minCoveragePct = Math.round(minCoverage * 1000) / 10;

  let note = `Coverage ${coveragePct.toFixed(1)}% (${totals.roundsWithCredits}/${totals.rounds} rounds with credits).`;
  if (confidence === 'partial') {
    note = `${note} Credits are partially available and should be treated as directional.`;
  } else if (confidence === 'unavailable') {
    note = `${note} Credits are not reliable for this window; switch to local mode if needed.`;
  }

  return {
    available: true,
    rounds: totals.rounds,
    userMessages,
    coverage: totals.coverage,
    confidence,
    note: `${note} Exact confidence requires at least ${minCoveragePct.toFixed(1)}% coverage.`,
  };
}

function clampCoverage(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_METERED_MIN_COVERAGE;
  }
  return Math.max(0, Math.min(1, value));
}
