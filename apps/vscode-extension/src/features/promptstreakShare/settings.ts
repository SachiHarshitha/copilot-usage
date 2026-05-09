/** Persistent settings for PromptStreak sharing (per-user via globalState). */

import type { ExtensionContext } from 'vscode';
import { PromptstreakShareSettings, ShareFieldConfig, ShareRecipe } from './types';

const KEY = 'promptstreakShare.settings.v1';
const LOCAL_PROMPTSTREAK_BASE_URL = 'http://localhost:3000';

const RECIPE_FIELDS: Record<ShareRecipe, ShareFieldConfig> = {
  privacy_first: {
    includeDailyBuckets: true,
    includeModelBreakdown: false,
    includeActionCounts: false,
    includeRepoAttribution: false,
  },
  standard: {
    includeDailyBuckets: true,
    includeModelBreakdown: true,
    includeActionCounts: true,
    includeRepoAttribution: false,
  },
  full: {
    includeDailyBuckets: true,
    includeModelBreakdown: true,
    includeActionCounts: true,
    includeRepoAttribution: true,
  },
};

export const DEFAULT_SHARE_SETTINGS: PromptstreakShareSettings = {
  enabled: false,
  recipe: 'privacy_first',
  fields: { ...RECIPE_FIELDS.privacy_first },
  autoSyncMinutes: 60,
  historyLimit: 100,
  promptstreakBaseUrl: LOCAL_PROMPTSTREAK_BASE_URL,
  deviceAlias: '',
};

function mergeFields(raw?: Partial<ShareFieldConfig>): ShareFieldConfig {
  return {
    ...DEFAULT_SHARE_SETTINGS.fields,
    ...(raw || {}),
  };
}

export function applyRecipe(
  settings: PromptstreakShareSettings,
  recipe: ShareRecipe,
): PromptstreakShareSettings {
  return {
    ...settings,
    recipe,
    fields: { ...RECIPE_FIELDS[recipe] },
  };
}

export function loadShareSettings(ctx: ExtensionContext): PromptstreakShareSettings {
  const raw = ctx.globalState.get<Partial<PromptstreakShareSettings>>(KEY) || {};
  return {
    ...DEFAULT_SHARE_SETTINGS,
    ...raw,
    fields: mergeFields(raw.fields),
    // Keep base URL hardcoded to local for current testing.
    promptstreakBaseUrl: LOCAL_PROMPTSTREAK_BASE_URL,
  };
}

export async function saveShareSettings(
  ctx: ExtensionContext,
  settings: PromptstreakShareSettings,
): Promise<void> {
  const normalizedAlias = (settings.deviceAlias || '').trim();
  await ctx.globalState.update(KEY, {
    ...settings,
    deviceAlias: normalizedAlias,
    promptstreakBaseUrl: LOCAL_PROMPTSTREAK_BASE_URL,
  });
}
