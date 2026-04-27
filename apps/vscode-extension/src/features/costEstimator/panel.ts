/** Cost Estimator webview panel — singleton, mirrors DashboardPanel pattern. */

import * as vscode from 'vscode';
import { discoverWorkspaces } from '../../core/discovery';
import { parseAllFiles, flattenEvents } from '../../core/aggregator';
import { DashboardPanel } from '../../views/panels';
import { CostEstimatorSettings, CostRangeKey } from './types';
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from './settings';
import { buildUsageEstimate } from './calc/usage';
import { estimateModelCost } from './calc/cost';
import { computePlanImpact } from './calc/plan';
import { computeTrendInsight } from './calc/trend';
import { filterEventsByCostRange, pickMostUsedModelId } from './calc/modelSelection';
import { MODEL_PRICING, MODEL_PRICING_LIST } from './pricing/models';
import { getCostEstimatorHtml, loadingPage, CostEstimatorViewState } from './html';

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
    const events = flattenEvents(parsed);

    const rangedEvents = filterEventsByCostRange(events, this.settings.defaultRange);
    const modelEvents = rangedEvents.length > 0 ? rangedEvents : events;
    const autoModelId = pickMostUsedModelId(modelEvents, Object.keys(MODEL_PRICING));
    const shouldAutoSelectMostUsed =
      this.settings.selectedModelId === DEFAULT_SETTINGS.selectedModelId
      || !MODEL_PRICING[this.settings.selectedModelId];

    if (shouldAutoSelectMostUsed && autoModelId && autoModelId !== this.settings.selectedModelId) {
      this.settings.selectedModelId = autoModelId;
      await saveSettings(this.context, this.settings);
    }

    const usage = buildUsageEstimate(events, this.settings.defaultRange);

    const selectedPricing = MODEL_PRICING[this.settings.selectedModelId] ?? MODEL_PRICING_LIST[0];
    const selectedCost = estimateModelCost(usage, selectedPricing);
    const comparisonCosts = MODEL_PRICING_LIST.map(m => estimateModelCost(usage, m));
    const planImpact = computePlanImpact(selectedCost, this.settings);
    const trend = computeTrendInsight(events);

    const state: CostEstimatorViewState = {
      settings: this.settings,
      usage,
      selectedCost,
      comparisonCosts,
      planImpact,
      trend,
      hasAnyData: events.length > 0,
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
