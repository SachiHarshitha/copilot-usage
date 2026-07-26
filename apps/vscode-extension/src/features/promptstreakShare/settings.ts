/** Persistent settings for PromptStreak sharing (per-user via globalState). */

import type { ExtensionContext } from 'vscode';
import { PromptstreakShareSettings, ShareFieldConfig, ShareRecipe } from './types';

const KEY = 'promptstreakShare.settings.v1';
const LOCAL_PROMPTSTREAK_BASE_URL = 'staging.promptstreak.dev';
const FALLBACK_PROMPTSTREAK_BASE_URL = 'https://staging.promptstreak.dev';

function canonicalPromptstreakBaseUrl(raw: string): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) {
    return FALLBACK_PROMPTSTREAK_BASE_URL;
  }

  const withScheme = /^[a-z][a-z\d+\-.]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const parsed = new URL(withScheme);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return FALLBACK_PROMPTSTREAK_BASE_URL;
    }
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return FALLBACK_PROMPTSTREAK_BASE_URL;
  }
}

const PROMPTSTREAK_BASE_URL = canonicalPromptstreakBaseUrl(LOCAL_PROMPTSTREAK_BASE_URL);

const RECIPE_FIELDS: Record<ShareRecipe, ShareFieldConfig> = {
  privacy_first: {
    includeDailyBuckets: true,
    includeModelBreakdown: false,
    includeActionCounts: false,
    includeRepoAttribution: true,
  },
  standard: {
    includeDailyBuckets: true,
    includeModelBreakdown: true,
    includeActionCounts: true,
    includeRepoAttribution: true,
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
  promptstreakBaseUrl: PROMPTSTREAK_BASE_URL,
  deviceAlias: '',
};

function resolveRecipe(raw?: ShareRecipe): ShareRecipe {
  return raw === 'privacy_first' || raw === 'standard' || raw === 'full'
    ? raw
    : DEFAULT_SHARE_SETTINGS.recipe;
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
  const recipe = resolveRecipe(raw.recipe);
  return {
    ...DEFAULT_SHARE_SETTINGS,
    ...raw,
    recipe,
    // Fields are a projection of the recipe (the panel only edits them through
    // recipe buttons), so always derive them. This also migrates already-linked
    // users onto recipe changes such as public-repo attribution without
    // requiring them to re-apply their recipe by hand.
    fields: { ...RECIPE_FIELDS[recipe] },
    // Keep base URL pinned for the current staging rollout.
    promptstreakBaseUrl: PROMPTSTREAK_BASE_URL,
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
    promptstreakBaseUrl: PROMPTSTREAK_BASE_URL,
  });
}
