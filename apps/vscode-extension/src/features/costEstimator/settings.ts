/** Persistent settings for the Cost Estimator (per-user, via globalState). */

import * as vscode from 'vscode';
import { CostEstimatorSettings } from './types';

const KEY = 'costEstimator.settings.v1';

export const DEFAULT_SETTINGS: CostEstimatorSettings = {
  selectedPlan: 'pro_plus',
  billingModel: 'individual_monthly',
  extraBudgetUsd: 0,
  selectedModelId: 'claude-sonnet-4.6',
  defaultRange: 'last_30_days',
};

export function loadSettings(ctx: vscode.ExtensionContext): CostEstimatorSettings {
  const raw = ctx.globalState.get<Partial<CostEstimatorSettings>>(KEY);
  return { ...DEFAULT_SETTINGS, ...(raw || {}) };
}

export async function saveSettings(
  ctx: vscode.ExtensionContext,
  settings: CostEstimatorSettings,
): Promise<void> {
  await ctx.globalState.update(KEY, settings);
}
