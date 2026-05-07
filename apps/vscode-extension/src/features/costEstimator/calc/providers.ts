import {
  CostEstimate,
  CostEstimatorSettings,
  EstimateConfidence,
  EstimateKind,
  IncludedUsage,
  ModelProvider,
  ProviderEstimate,
  ProviderQuota,
  ProviderRateCard,
  TokenRates,
  UsageEstimate,
} from '../types';
import { PROVIDER_RATE_CARDS } from '../pricing/providers';
import { ProviderModelCostContext } from './modelMix';
import { repriceMixAtFlatRate, repriceMixAtTierEquivalent } from './providerRepricing';

const DAY_MS = 86400000;

export type ProviderRelativeCostFlag = 'cheaper' | 'near_current' | 'higher' | 'unavailable';

export interface ProviderRelativeCost {
  flag: ProviderRelativeCostFlag;
  marginUsd: number;
  comparableUsd?: number;
  deltaUsd?: number;
}

export type SavingsVsBaselineFlag = 'significant_savings' | 'near_current' | 'higher' | 'unavailable';

export interface SavingsVsBaseline {
  flag: SavingsVsBaselineFlag;
  marginUsd: number;
  savingsUsd?: number;
}

const ESTIMATE_KIND_BY_BILLING: Record<ProviderRateCard['billingKind'], EstimateKind> = {
  token_metered: 'exact_formula',
  credit_metered: 'plan_fit',
  subscription_allowance: 'plan_fit',
  subscription_quota: 'quota_pressure',
  hybrid_subscription_usage: 'plan_fit',
  request_credit: 'quota_pressure',
  seat_license: 'plan_fit',
  enterprise_contract: 'unsupported',
  byok_wrapper: 'exact_formula',
  router_payg: 'range',
  local_model: 'plan_fit',
  unknown: 'unsupported',
};

export function buildProviderEstimates(
  usage: UsageEstimate,
  settings: CostEstimatorSettings,
  selectedCost: CostEstimate,
  contextOrNow?: ProviderModelCostContext | number,
  nowMs?: number,
): ProviderEstimate[] {
  const context = typeof contextOrNow === 'number' || contextOrNow === undefined
    ? undefined
    : contextOrNow;
  const effectiveNowMs = typeof contextOrNow === 'number'
    ? contextOrNow
    : (nowMs ?? Date.now());

  return PROVIDER_RATE_CARDS.map(card => buildProviderEstimate(card, usage, settings, selectedCost, context, effectiveNowMs));
}

export function providerNearMarginUsd(baselineMonthlyUsd: number): number {
  if (!Number.isFinite(baselineMonthlyUsd) || baselineMonthlyUsd <= 0) {
    return 2;
  }
  return roundUsd(Math.max(2, baselineMonthlyUsd * 0.1));
}

export function providerComparableMonthlyUsd(row: ProviderEstimate): number | undefined {
  const cost = row.monthlyCost;
  if (!cost) {
    return undefined;
  }

  if (cost.expected !== undefined) {
    return cost.expected;
  }
  if (cost.low !== undefined && cost.high !== undefined) {
    return roundUsd((cost.low + cost.high) / 2);
  }
  if (cost.low !== undefined) {
    return cost.low;
  }
  if (cost.high !== undefined) {
    return cost.high;
  }
  return undefined;
}

export function classifyProviderRelativeCost(
  row: ProviderEstimate,
  baselineMonthlyUsd: number,
): ProviderRelativeCost {
  const marginUsd = providerNearMarginUsd(baselineMonthlyUsd);

  if (!Number.isFinite(baselineMonthlyUsd) || baselineMonthlyUsd <= 0) {
    return { flag: 'unavailable', marginUsd };
  }

  const comparableUsd = providerComparableMonthlyUsd(row);
  if (comparableUsd === undefined || !Number.isFinite(comparableUsd)) {
    return { flag: 'unavailable', marginUsd };
  }

  const deltaUsd = roundUsd(comparableUsd - baselineMonthlyUsd);
  if (Math.abs(deltaUsd) <= marginUsd) {
    return { flag: 'near_current', marginUsd, comparableUsd, deltaUsd };
  }
  if (deltaUsd < 0) {
    return { flag: 'cheaper', marginUsd, comparableUsd, deltaUsd };
  }
  return { flag: 'higher', marginUsd, comparableUsd, deltaUsd };
}

export function classifySavingsVsBaseline(
  savingsUsd: number | undefined,
  baselineMonthlyUsd: number,
): SavingsVsBaseline {
  const marginUsd = providerNearMarginUsd(baselineMonthlyUsd);

  if (savingsUsd === undefined || !Number.isFinite(savingsUsd)) {
    return { flag: 'unavailable', marginUsd };
  }

  const roundedSavingsUsd = roundUsd(savingsUsd);
  if (Math.abs(roundedSavingsUsd) <= marginUsd) {
    return { flag: 'near_current', marginUsd, savingsUsd: roundedSavingsUsd };
  }
  if (roundedSavingsUsd > 0) {
    return { flag: 'significant_savings', marginUsd, savingsUsd: roundedSavingsUsd };
  }
  return { flag: 'higher', marginUsd, savingsUsd: roundedSavingsUsd };
}

function buildProviderEstimate(
  card: ProviderRateCard,
  usage: UsageEstimate,
  settings: CostEstimatorSettings,
  selectedCost: CostEstimate,
  modelContext: ProviderModelCostContext | undefined,
  nowMs: number,
): ProviderEstimate {
  let estimateKind = normalizedEstimateKind(card);
  const isStale = cardIsStale(card, nowMs);
  const baselineMonthlyUsd = modelContext?.monthlyUsd ?? selectedCost.estimatedMonthlyUsd;
  const baselineMonthlyCredits = modelContext?.monthlyCredits ?? selectedCost.estimatedMonthlyCredits;
  const scopedUsage = scopedUsageForCard(card, usage, modelContext);

  const assumptions: string[] = [];
  const caveats: string[] = [...(card.notes ?? [])];

  if (card.billingKind === 'byok_wrapper') {
    assumptions.push(`Delegates billing to underlying provider/model selected in ${settings.selectedModelId}.`);
  }

  // Try the new whole-mix repricing path for token_metered cards.
  const mixReprice = computeTokenMeteredMixCost(card, modelContext);
  let monthlyCost: ProviderEstimate['monthlyCost'] | undefined;

  if (mixReprice) {
    monthlyCost = mixReprice.cost;
    estimateKind = 'range';
    assumptions.push(...mixReprice.assumptions);
    caveats.push(...mixReprice.caveats);
  } else {
    if (scopedUsage.isScoped && scopedUsage.provider && scopedUsage.hasComparableData) {
      assumptions.push(`Comparable estimate uses observed ${scopedUsage.provider} model usage in the selected window.`);
    }
    if (scopedUsage.isScoped && scopedUsage.provider && !scopedUsage.hasComparableData) {
      caveats.push(`No observed ${scopedUsage.provider} model usage in the selected window; this row is not directly comparable.`);
    }
    monthlyCost = computeMonthlyCost(
      estimateKind,
      card,
      scopedUsage.usage,
      baselineMonthlyUsd,
      baselineMonthlyCredits,
      scopedUsage.hasComparableData,
    );
  }

  if (modelContext && modelContext.knownModelCoveragePct < 100) {
    caveats.push(`Known-model coverage for this window is ${modelContext.knownModelCoveragePct.toFixed(1)}%; unknown model ids reduce estimate confidence.`);
  }

  if (isStale) {
    caveats.push('Rate card snapshot is stale. Review official source before relying on this estimate.');
  }

  if (card.requiresManualReview) {
    caveats.push('Marked for manual review due to dynamic or frequently changing pricing.');
  }

  const quota = computeQuota(card.includedUsage, scopedUsage.usage, baselineMonthlyUsd, baselineMonthlyCredits);

  if (estimateKind === 'plan_fit' || estimateKind === 'quota_pressure') {
    caveats.push('Subscription/quota products are shown as plan fit or pressure estimates, not exact bills.');
  }

  const confidence = resolvedConfidence(card.confidence, estimateKind, monthlyCost, quota);

  return {
    productId: card.productId,
    provider: card.provider,
    product: card.product,
    plan: card.plan,
    mode: card.credentialMode,
    billingKind: card.billingKind,
    estimateKind,
    monthlyCost,
    quota,
    confidence,
    assumptions,
    caveats,
    sourceUrls: [card.source.sourceUrl],
    lastCheckedAt: card.lastCheckedAt,
    staleAfterDays: card.staleAfterDays,
    isStale,
    requiresManualReview: card.requiresManualReview === true,
  };
}

function normalizedEstimateKind(card: ProviderRateCard): EstimateKind {
  if (card.estimateKind === 'exact_formula') {
    if (card.billingKind === 'subscription_allowance' || card.billingKind === 'subscription_quota' || card.billingKind === 'hybrid_subscription_usage' || card.billingKind === 'seat_license') {
      return card.billingKind === 'subscription_quota' ? 'quota_pressure' : 'plan_fit';
    }
  }
  return card.estimateKind ?? ESTIMATE_KIND_BY_BILLING[card.billingKind];
}

function cardIsStale(card: ProviderRateCard, nowMs: number): boolean {
  if (!card.lastCheckedAt || !card.staleAfterDays || card.staleAfterDays <= 0) {
    return false;
  }
  const last = Date.parse(card.lastCheckedAt);
  if (!Number.isFinite(last)) {
    return false;
  }
  return (nowMs - last) > card.staleAfterDays * DAY_MS;
}

function computeMonthlyCost(
  estimateKind: EstimateKind,
  card: ProviderRateCard,
  usage: UsageEstimate,
  baselineMonthlyUsd: number,
  baselineMonthlyCredits: number,
  hasComparableData: boolean,
): ProviderEstimate['monthlyCost'] | undefined {
  if (card.billingKind === 'local_model') {
    return { expected: 0, currency: card.currency };
  }

  if (
    card.billingKind === 'credit_metered'
    && card.subscription
    && card.includedUsage?.unit === 'credits'
    && typeof card.includedUsage.amount === 'number'
    && card.includedUsage.amount > 0
  ) {
    const includedCredits = card.includedUsage.amount;
    const overageCredits = Math.max(0, baselineMonthlyCredits - includedCredits);
    const overageUsd = overageCredits * 0.01;
    return {
      expected: roundUsd(card.subscription.amount + overageUsd),
      currency: card.currency,
    };
  }

  if (estimateKind === 'exact_formula') {
    if (card.tokenRates) {
      if (card.billingKind === 'token_metered' && !hasComparableData) {
        return undefined;
      }
      const expected = estimateTokenMeteredCost(usage, card.tokenRates);
      return { expected, currency: card.currency };
    }
    if (card.billingKind === 'byok_wrapper') {
      return { expected: baselineMonthlyUsd, currency: card.currency };
    }
    return undefined;
  }

  if (estimateKind === 'range') {
    const baseline = card.tokenRates
      ? estimateTokenMeteredCost(usage, card.tokenRates)
      : baselineMonthlyUsd;
    if (!Number.isFinite(baseline) || baseline <= 0) {
      return undefined;
    }
    return {
      low: roundUsd(baseline * 0.85),
      expected: roundUsd(baseline),
      high: roundUsd(baseline * 1.2),
      currency: card.currency,
    };
  }

  if (card.subscription) {
    return { expected: card.subscription.amount, currency: card.currency };
  }

  return undefined;
}

function computeQuota(
  includedUsage: IncludedUsage | undefined,
  usage: UsageEstimate,
  baselineMonthlyUsd: number,
  baselineMonthlyCredits: number,
): ProviderQuota | undefined {
  if (!includedUsage) {
    return undefined;
  }

  if (includedUsage.unit === 'unknown' || includedUsage.amount === undefined || includedUsage.amount <= 0) {
    return {
      pressure: 'unknown',
      notes: includedUsage.notes,
    };
  }

  let ratio: number | undefined;
  if (includedUsage.unit === 'tokens') {
    const monthlyTokens = usage.monthlyInputTokens
      + usage.monthlyOutputTokens
      + (usage.monthlyCachedInputTokens ?? 0)
      + (usage.monthlyCacheWriteTokens ?? 0);
    ratio = monthlyTokens / includedUsage.amount;
  } else if (includedUsage.unit === 'credits') {
    ratio = baselineMonthlyCredits / includedUsage.amount;
  } else if (includedUsage.unit === 'dollars') {
    ratio = baselineMonthlyUsd / includedUsage.amount;
  }

  if (ratio === undefined || !Number.isFinite(ratio)) {
    return {
      pressure: 'unknown',
      notes: includedUsage.notes,
    };
  }

  return {
    likelyFits: ratio <= 1,
    pressure: pressureForRatio(ratio),
    notes: includedUsage.notes,
  };
}

function pressureForRatio(ratio: number): ProviderQuota['pressure'] {
  if (ratio <= 0.7) {
    return 'low';
  }
  if (ratio <= 1) {
    return 'medium';
  }
  return 'high';
}

function estimateTokenMeteredCost(usage: UsageEstimate, rates: TokenRates): number {
  const inputCost = (usage.monthlyInputTokens / 1_000_000) * (rates.inputPerMTok ?? 0);
  const outputCost = (usage.monthlyOutputTokens / 1_000_000) * (rates.outputPerMTok ?? 0);
  const cachedCost = ((usage.monthlyCachedInputTokens ?? 0) / 1_000_000) * (rates.cachedInputPerMTok ?? rates.inputPerMTok ?? 0);
  const cacheWriteCost = ((usage.monthlyCacheWriteTokens ?? 0) / 1_000_000) * (rates.cacheWritePerMTok ?? 0);
  return roundUsd(inputCost + outputCost + cachedCost + cacheWriteCost);
}

function resolvedConfidence(
  base: EstimateConfidence,
  estimateKind: EstimateKind,
  monthlyCost: ProviderEstimate['monthlyCost'] | undefined,
  quota: ProviderQuota | undefined,
): EstimateConfidence {
  if (estimateKind === 'unsupported') {
    return 'low';
  }
  if ((estimateKind === 'exact_formula' || estimateKind === 'range') && !monthlyCost) {
    return 'low';
  }
  if ((estimateKind === 'plan_fit' || estimateKind === 'quota_pressure') && quota?.pressure === 'unknown' && base === 'high') {
    return 'medium';
  }
  return base;
}

function roundUsd(value: number): number {
  return Math.round(value * 100) / 100;
}

interface ScopedUsage {
  usage: UsageEstimate;
  provider?: ModelProvider;
  isScoped: boolean;
  hasComparableData: boolean;
}

function scopedUsageForCard(
  card: ProviderRateCard,
  usage: UsageEstimate,
  context: ProviderModelCostContext | undefined,
): ScopedUsage {
  if (!context) {
    return { usage, isScoped: false, hasComparableData: true };
  }

  if (card.billingKind !== 'token_metered') {
    return { usage, isScoped: false, hasComparableData: true };
  }

  const provider = providerFamilyForCard(card);
  if (!provider) {
    return { usage, isScoped: false, hasComparableData: true };
  }

  const providerUsage = context.providerMonthlyUsage[provider];
  if (!providerUsage || providerUsage.totalTokens <= 0) {
    return {
      usage,
      provider,
      isScoped: true,
      hasComparableData: false,
    };
  }

  return {
    usage: {
      ...usage,
      monthlyInputTokens: providerUsage.inputTokens,
      monthlyOutputTokens: providerUsage.outputTokens,
      monthlyCachedInputTokens: undefined,
      monthlyCacheWriteTokens: undefined,
    },
    provider,
    isScoped: true,
    hasComparableData: true,
  };
}

function providerFamilyForCard(card: ProviderRateCard): ModelProvider | undefined {
  const provider = card.provider.trim().toLowerCase();
  if (provider === 'openai') {
    return 'OpenAI';
  }
  if (provider === 'anthropic') {
    return 'Anthropic';
  }
  if (provider === 'google') {
    return 'Google';
  }
  if (provider === 'github') {
    return 'GitHub';
  }
  if (provider === 'xai') {
    return 'xAI';
  }
  return undefined;
}

interface MixRepriceResult {
  cost: ProviderEstimate['monthlyCost'];
  assumptions: string[];
  caveats: string[];
}

/** For token_metered cards with a known provider family, reprice the user's full
 *  observed model mix two ways: tier-equivalent (expected) and flat reference
 *  (high bound). Returns undefined when the card or context can't support it. */
function computeTokenMeteredMixCost(
  card: ProviderRateCard,
  context: ProviderModelCostContext | undefined,
): MixRepriceResult | undefined {
  if (card.billingKind !== 'token_metered') {
    return undefined;
  }
  if (!context || context.modelMonthlyUsage.length === 0) {
    return undefined;
  }
  const provider = providerFamilyForCard(card);
  if (!provider) {
    return undefined;
  }

  const tierReprice = repriceMixAtTierEquivalent(provider, context.modelMonthlyUsage);
  if (!tierReprice) {
    return undefined;
  }

  const expected = tierReprice.monthlyUsd;
  let high: number | undefined;
  if (card.tokenRates) {
    high = repriceMixAtFlatRate(
      card.tokenRates,
      context.totalMonthlyInputTokens,
      context.totalMonthlyOutputTokens,
    );
  }

  // Defensive: if flat-reference came out lower than tier-equivalent (e.g. a
  // very cheap reference model vs an expensive median), keep the larger value
  // as the high bound so the bracket stays well-formed.
  if (high !== undefined && high < expected) {
    high = expected;
  }

  const low = roundUsd(expected * 0.85);

  const assumptions: string[] = [
    `Reprices your full observed model mix at ${provider}'s tier-equivalent catalog (Lightweight / Versatile / Powerful medians).`,
  ];
  if (high !== undefined && card.plan) {
    assumptions.push(`Upper bound assumes every request is routed through the card's reference model (${card.plan}).`);
  }

  const caveats: string[] = [];
  if (tierReprice.unmatchedTokenShare > 0) {
    caveats.push(`${(tierReprice.unmatchedTokenShare * 100).toFixed(1)}% of mix tokens had no tier-equivalent in ${provider}'s catalog and were excluded from the expected estimate.`);
  }

  return {
    cost: {
      low,
      expected,
      high,
      currency: card.currency,
    },
    assumptions,
    caveats,
  };
}