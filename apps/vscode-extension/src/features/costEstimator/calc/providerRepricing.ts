import { MODEL_PRICING } from '../pricing/models';
import { PRICING_METADATA } from '../pricing/metadata';
import { ModelCategory, ModelProvider, TokenRates } from '../types';
import { ModelMonthlyUsageEntry } from './modelMix';

export type RepriceableTier = Exclude<ModelCategory, 'Preview' | 'Unknown'>;

export interface ProviderTierRates {
  Lightweight?: TokenRates;
  Versatile?: TokenRates;
  Powerful?: TokenRates;
}

export interface TierEquivalentReprice {
  monthlyUsd: number;
  unmatchedTokenShare: number; // 0..1 fraction of mix tokens we couldn't tier-match
}

const TIER_FALLBACK: Record<RepriceableTier, RepriceableTier[]> = {
  Lightweight: ['Lightweight', 'Versatile', 'Powerful'],
  Versatile: ['Versatile', 'Powerful', 'Lightweight'],
  Powerful: ['Powerful', 'Versatile', 'Lightweight'],
};

/** Build per-tier reference rates for a provider by taking the median input/output
 *  rate of the provider's catalog entries in MODEL_PRICING for that tier. */
export function buildProviderTierRates(provider: ModelProvider): ProviderTierRates {
  const groups: Record<RepriceableTier, { input: number[]; output: number[]; cached: number[]; cacheWrite: number[] }> = {
    Lightweight: { input: [], output: [], cached: [], cacheWrite: [] },
    Versatile: { input: [], output: [], cached: [], cacheWrite: [] },
    Powerful: { input: [], output: [], cached: [], cacheWrite: [] },
  };

  for (const pricing of Object.values(MODEL_PRICING)) {
    if (pricing.provider !== provider) {
      continue;
    }
    if (pricing.category !== 'Lightweight' && pricing.category !== 'Versatile' && pricing.category !== 'Powerful') {
      continue;
    }
    const bucket = groups[pricing.category];
    bucket.input.push(pricing.inputPerMillion);
    bucket.output.push(pricing.outputPerMillion);
    if (typeof pricing.cachedInputPerMillion === 'number') {
      bucket.cached.push(pricing.cachedInputPerMillion);
    }
    if (typeof pricing.cacheWritePerMillion === 'number') {
      bucket.cacheWrite.push(pricing.cacheWritePerMillion);
    }
  }

  const result: ProviderTierRates = {};
  for (const tier of ['Lightweight', 'Versatile', 'Powerful'] as RepriceableTier[]) {
    const bucket = groups[tier];
    if (bucket.input.length === 0 && bucket.output.length === 0) {
      continue;
    }
    result[tier] = {
      inputPerMTok: median(bucket.input),
      outputPerMTok: median(bucket.output),
      cachedInputPerMTok: bucket.cached.length > 0 ? median(bucket.cached) : undefined,
      cacheWritePerMTok: bucket.cacheWrite.length > 0 ? median(bucket.cacheWrite) : undefined,
    };
  }
  return result;
}

/** Reprice the user's per-model monthly mix at the target provider's tier-equivalent rates. */
export function repriceMixAtTierEquivalent(
  targetProvider: ModelProvider,
  mix: ModelMonthlyUsageEntry[],
): TierEquivalentReprice | undefined {
  const tierRates = buildProviderTierRates(targetProvider);
  if (!tierRates.Lightweight && !tierRates.Versatile && !tierRates.Powerful) {
    return undefined;
  }

  let monthlyUsd = 0;
  let totalTokens = 0;
  let unmatchedTokens = 0;

  for (const entry of mix) {
    const entryTokens = entry.inputTokens + entry.outputTokens;
    totalTokens += entryTokens;

    const targetTier = pickAvailableTier(entry.category, tierRates);
    if (!targetTier) {
      unmatchedTokens += entryTokens;
      continue;
    }
    const rates = tierRates[targetTier]!;
    monthlyUsd += (entry.inputTokens / PRICING_METADATA.perTokenUnit) * (rates.inputPerMTok ?? 0);
    monthlyUsd += (entry.outputTokens / PRICING_METADATA.perTokenUnit) * (rates.outputPerMTok ?? 0);
  }

  return {
    monthlyUsd: roundUsd(monthlyUsd),
    unmatchedTokenShare: totalTokens > 0 ? unmatchedTokens / totalTokens : 0,
  };
}

/** Reprice ALL of the user's monthly tokens at a single flat reference rate (the
 *  card's published tokenRates). Represents the upper bound: "if you ran every
 *  request through this one reference model." */
export function repriceMixAtFlatRate(
  rates: TokenRates,
  totalMonthlyInputTokens: number,
  totalMonthlyOutputTokens: number,
): number {
  const inputCost = (totalMonthlyInputTokens / PRICING_METADATA.perTokenUnit) * (rates.inputPerMTok ?? 0);
  const outputCost = (totalMonthlyOutputTokens / PRICING_METADATA.perTokenUnit) * (rates.outputPerMTok ?? 0);
  return roundUsd(inputCost + outputCost);
}

function pickAvailableTier(category: ModelCategory, tierRates: ProviderTierRates): RepriceableTier | undefined {
  const start: RepriceableTier = (category === 'Lightweight' || category === 'Versatile' || category === 'Powerful')
    ? category
    : 'Versatile';
  for (const candidate of TIER_FALLBACK[start]) {
    if (tierRates[candidate]) {
      return candidate;
    }
  }
  return undefined;
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function roundUsd(value: number): number {
  return Math.round(value * 100) / 100;
}
