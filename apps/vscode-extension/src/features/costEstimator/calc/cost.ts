/** Estimate USD cost + AI Credits for a given usage estimate × model pricing. */

import { CostEstimate, ModelPricing, UsageEstimate } from '../types';
import { PRICING_METADATA } from '../pricing/metadata';

export function estimateModelCost(usage: UsageEstimate, pricing: ModelPricing): CostEstimate {
  const M = PRICING_METADATA.perTokenUnit;

  const inputCostUsd =
    (usage.monthlyInputTokens / M) * pricing.inputPerMillion;

  const outputCostUsd =
    (usage.monthlyOutputTokens / M) * pricing.outputPerMillion;

  const cachedInputCostUsd =
    ((usage.monthlyCachedInputTokens ?? 0) / M) * (pricing.cachedInputPerMillion ?? 0);

  const cacheWriteCostUsd =
    ((usage.monthlyCacheWriteTokens ?? 0) / M) * (pricing.cacheWritePerMillion ?? 0);

  const estimatedMonthlyUsd =
    inputCostUsd + outputCostUsd + cachedInputCostUsd + cacheWriteCostUsd;

  return {
    modelId: pricing.id,
    modelDisplayName: pricing.displayName,
    estimatedMonthlyUsd,
    estimatedMonthlyCredits: Math.ceil(estimatedMonthlyUsd / PRICING_METADATA.aiCreditUsdValue),
    inputCostUsd,
    outputCostUsd,
    cachedInputCostUsd,
    cacheWriteCostUsd,
    hasCacheInputEstimate: usage.monthlyCachedInputTokens !== undefined,
    hasCacheWriteEstimate: usage.monthlyCacheWriteTokens !== undefined,
  };
}
