import { MODEL_PRICING } from '../pricing/models';
import {
  BaselineModelCostChartDatum,
  BaselineTierShareChartDatum,
  CandidateEstimateKind,
  CandidatePortfolio,
  CandidatePortfolioMapping,
  EquivalenceKind,
  EstimateConfidence,
  ModelCapabilityProfile,
  ModelFamily,
  PortfolioKind,
  PortfolioResolution,
  ProviderDecisionSurface,
  ProviderEstimate,
  ProviderFitMatrixDatum,
  ReplacementCoverageChartDatum,
  Tier,
  TierWeightedBaselineRow,
  WorkloadFingerprint,
} from '../types';
import { ModelMonthlyUsageEntry } from './modelMix';

interface BaselineModelRow extends BaselineModelCostChartDatum {
  costShare: number;
}

const TIER_ORDER: Tier[] = ['powerful', 'versatile', 'fast', 'economy', 'local', 'unknown'];

const CONFIDENCE_SCORE: Record<EstimateConfidence, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

const EXACT_MODEL_WEIGHT: Record<EquivalenceKind, number> = {
  'same-model': 1,
  'same-family': 0,
  'same-tier': 0,
  'near-tier': 0,
  downgrade: 0,
  unknown: 0,
};

const FAMILY_WEIGHT: Record<EquivalenceKind, number> = {
  'same-model': 1,
  'same-family': 1,
  'same-tier': 0,
  'near-tier': 0,
  downgrade: 0,
  unknown: 0,
};

const TIER_WEIGHT: Record<EquivalenceKind, number> = {
  'same-model': 1,
  'same-family': 1,
  'same-tier': 1,
  'near-tier': 0.5,
  downgrade: 0,
  unknown: 0,
};

const SUBSTITUTION_WEIGHT: Record<EquivalenceKind, number> = {
  'same-model': 1,
  'same-family': 1,
  'same-tier': 0.75,
  'near-tier': 0.4,
  downgrade: 0,
  unknown: 0,
};

const LOWER_TIER_FALLBACK: Record<Tier, Tier[]> = {
  powerful: ['versatile', 'fast', 'economy', 'unknown'],
  versatile: ['fast', 'economy', 'unknown'],
  fast: ['economy', 'unknown'],
  economy: ['unknown'],
  local: ['unknown'],
  unknown: [],
};

const MULTI_MODEL_PROVIDERS = new Set<string>([
  'github',
  'cursor',
  'windsurf',
  'tabnine',
  'amazon q developer',
  'openrouter',
  'continue',
  'opencode',
  'jetbrains',
  'jetbrains ai',
]);

const HOSTED_MULTI_MODEL_FAMILIES: Record<string, ModelFamily[]> = {
  github: ['anthropic', 'openai', 'google'],
  cursor: ['anthropic', 'openai', 'google'],
  windsurf: ['anthropic', 'openai', 'google'],
  tabnine: ['anthropic', 'openai', 'google'],
  'amazon q developer': ['anthropic', 'openai'],
  jetbrains: ['anthropic', 'openai', 'google'],
  'jetbrains ai': ['anthropic', 'openai', 'google'],
};

const ROUTER_UNSELECTED_PRODUCT_IDS = new Set<string>([
  'openrouter-payg',
  'opencode-zen',
  'continue-starter-payg',
]);

const RISK_RANK: Record<CandidatePortfolio['capabilityRisk'], number> = {
  low: 0,
  medium: 1,
  high: 2,
  unknown: 3,
};

const MODEL_AVAILABILITY_RANK: Record<NonNullable<CandidatePortfolio['modelAvailability']>, number> = {
  high: 3,
  medium: 2,
  low: 1,
  unknown: 0,
};

export function computeFitScorePct(
  familyCoverageByCostShare: number,
  tierCoverageByCostShare: number,
  exactModelCoverageByCostShare: number,
): number {
  return roundPct(
    (
      0.45 * familyCoverageByCostShare
      + 0.35 * tierCoverageByCostShare
      + 0.2 * exactModelCoverageByCostShare
    ) * 100,
  );
}

export function buildProviderDecisionSurface(
  providerEstimates: ProviderEstimate[],
  modelMonthlyUsage: ModelMonthlyUsageEntry[],
  baselineUsd: number,
): ProviderDecisionSurface {
  const baselineRows = buildBaselineModelRows(modelMonthlyUsage, baselineUsd);
  const baselineTotalUsd = baselineRows.reduce((sum, row) => sum + row.monthlyUsd, 0);
  const effectiveBaselineUsd = baselineUsd > 0 ? baselineUsd : baselineTotalUsd;
  const tierBaseline = buildTierBaselineRows(baselineRows, effectiveBaselineUsd);
  const fingerprint = buildFingerprint(baselineRows, tierBaseline, effectiveBaselineUsd);

  const portfolios = providerEstimates.map((estimate) =>
    buildCandidatePortfolio(estimate, baselineRows, effectiveBaselineUsd, fingerprint),
  );

  const groups = {
    comparable: portfolios
      .filter((item) => item.comparisonGroup === 'Comparable portfolios')
      .sort(sortComparableGroup),
    cheaperRisky: portfolios
      .filter((item) => item.comparisonGroup === 'Cheaper but not equivalent')
      .sort(sortCheaperRiskyGroup),
    planFit: portfolios
      .filter((item) => item.comparisonGroup === 'Plan / subscription products')
      .sort(sortPlanFitGroup),
    byok: portfolios
      .filter((item) => item.comparisonGroup === 'BYOK / wrapper tools')
      .sort(sortByokGroup),
    routerRequired: portfolios
      .filter((item) => item.comparisonGroup === 'Router / model selection required')
      .sort(sortByokGroup),
  };

  const fitMatrix = portfolios
    .filter((item) => !item.hideSavings && item.savingsUsd !== undefined)
    .map<ProviderFitMatrixDatum>((item) => ({
      productId: item.productId,
      provider: item.provider,
      product: item.product,
      label: item.label,
      capabilityRisk: item.capabilityRisk,
      savingsUsd: item.savingsUsd ?? 0,
      fitScorePct: item.fitScorePct,
      substitutionCoverageByCostShare: item.substitutionCoverageByCostShare,
      familyCoverageByCostShare: item.familyCoverageByCostShare,
      tierCoverageByCostShare: item.tierCoverageByCostShare,
    }));

  const replacementCoverage = portfolios.map<ReplacementCoverageChartDatum>((item) => ({
    productId: item.productId,
    provider: item.provider,
    product: item.product,
    exactModelCoverageByCostShare: item.exactModelCoverageByCostShare,
    familyCoverageByCostShare: item.familyCoverageByCostShare,
    tierCoverageByCostShare: item.tierCoverageByCostShare,
    substitutionCoverageByCostShare: item.substitutionCoverageByCostShare,
  }));

  const charts = {
    baselineModelCost: baselineRows.map<BaselineModelCostChartDatum>((item) => ({
      modelId: item.modelId,
      provider: item.provider,
      family: item.family,
      tier: item.tier,
      monthlyUsd: item.monthlyUsd,
      costSharePct: item.costSharePct,
      inputTokens: item.inputTokens,
      outputTokens: item.outputTokens,
    })),
    baselineTierShare: tierBaseline.map<BaselineTierShareChartDatum>((item) => ({
      tier: item.tier,
      monthlyUsd: item.monthlyUsd,
      costSharePct: item.costSharePct,
    })),
    fitMatrix,
    replacementCoverage,
    hiddenOrNotComparable: portfolios.filter((item) => item.hideSavings || item.estimateKind === 'not-comparable' || item.estimateKind === 'requires-model-selection'),
  };

  return {
    fingerprint,
    tierBaseline,
    portfolios,
    groups,
    charts,
    summaryText: buildSummaryText(fingerprint, groups.comparable, groups.cheaperRisky),
  };
}

function buildBaselineModelRows(
  modelMonthlyUsage: ModelMonthlyUsageEntry[],
  baselineUsd: number,
): BaselineModelRow[] {
  const computed = modelMonthlyUsage.map((entry) => {
    const profile = buildModelCapabilityProfile(entry.modelId);
    const monthlyUsd = roundUsd(
      ((entry.inputTokens / 1_000_000) * (profile.inputRatePerMtok ?? 0))
      + ((entry.outputTokens / 1_000_000) * (profile.outputRatePerMtok ?? 0)),
    );
    return {
      modelId: entry.modelId,
      provider: entry.provider,
      family: profile.family,
      tier: profile.tier,
      monthlyUsd,
      costSharePct: 0,
      inputTokens: entry.inputTokens,
      outputTokens: entry.outputTokens,
      costShare: 0,
    };
  });

  const fallbackTotal = computed.reduce((sum, item) => sum + item.monthlyUsd, 0);
  const totalForDisplay = baselineUsd > 0 ? baselineUsd : fallbackTotal;
  const totalForCoverage = fallbackTotal > 0 ? fallbackTotal : totalForDisplay;
  return computed
    .map((item) => {
      const costShare = totalForCoverage > 0 ? item.monthlyUsd / totalForCoverage : 0;
      return {
        ...item,
        costShare,
        costSharePct: totalForDisplay > 0 ? roundPct((item.monthlyUsd / totalForDisplay) * 100) : roundPct(costShare * 100),
      };
    })
    .sort((a, b) => b.monthlyUsd - a.monthlyUsd);
}

function buildTierBaselineRows(
  baselineRows: BaselineModelRow[],
  baselineUsd: number,
): TierWeightedBaselineRow[] {
  const totalTokens = baselineRows.reduce((sum, item) => sum + item.inputTokens + item.outputTokens, 0);
  return TIER_ORDER
    .map<TierWeightedBaselineRow>((tier) => {
      const rows = baselineRows.filter((item) => item.tier === tier);
      const inputTokens = rows.reduce((sum, item) => sum + item.inputTokens, 0);
      const outputTokens = rows.reduce((sum, item) => sum + item.outputTokens, 0);
      const monthlyUsd = roundUsd(rows.reduce((sum, item) => sum + item.monthlyUsd, 0));
      const tierTokens = inputTokens + outputTokens;
      const costSharePct = baselineUsd > 0 ? roundPct((monthlyUsd / baselineUsd) * 100) : 0;
      const tokenSharePct = totalTokens > 0 ? roundPct((tierTokens / totalTokens) * 100) : 0;
      return {
        tier,
        inputTokens,
        outputTokens,
        monthlyUsd,
        costSharePct,
        tokenSharePct,
      };
    })
    .filter((item) => item.inputTokens > 0 || item.outputTokens > 0 || item.monthlyUsd > 0);
}

function buildFingerprint(
  baselineRows: BaselineModelRow[],
  tierBaseline: TierWeightedBaselineRow[],
  baselineUsd: number,
): WorkloadFingerprint {
  const totalInputTokens = baselineRows.reduce((sum, item) => sum + item.inputTokens, 0);
  const totalOutputTokens = baselineRows.reduce((sum, item) => sum + item.outputTokens, 0);
  const providerCost = new Map<ModelFamily, number>();
  const tierCost = new Map<Tier, number>();
  for (const item of baselineRows) {
    providerCost.set(item.family, (providerCost.get(item.family) ?? 0) + item.monthlyUsd);
    tierCost.set(item.tier, (tierCost.get(item.tier) ?? 0) + item.monthlyUsd);
  }

  const dominantProviderFamily = maxKey(providerCost, 'unknown');
  const dominantTier = maxKey(tierCost, 'unknown');
  const dominantModelId = baselineRows.length > 0 ? baselineRows[0].modelId : 'unknown';
  const powerfulUsd = tierBaseline
    .filter((item) => item.tier === 'powerful')
    .reduce((sum, item) => sum + item.monthlyUsd, 0);
  const powerfulCostSharePct = baselineUsd > 0 ? roundPct((powerfulUsd / baselineUsd) * 100) : 0;

  return {
    baselineMonthlyUsd: roundUsd(baselineUsd),
    totalInputTokens,
    totalOutputTokens,
    inputOutputRatio: totalOutputTokens > 0 ? roundPct(totalInputTokens / totalOutputTokens) : 0,
    dominantProviderFamily,
    dominantModelId,
    dominantTier,
    powerfulCostSharePct,
    interpretation: buildInterpretation(dominantModelId, dominantProviderFamily, dominantTier, powerfulCostSharePct),
  };
}

function buildCandidatePortfolio(
  estimate: ProviderEstimate,
  baselineRows: BaselineModelRow[],
  baselineUsd: number,
  fingerprint: WorkloadFingerprint,
): CandidatePortfolio {
  let estimateKind = normalizeEstimateKind(estimate);
  const isByokWrapper = estimate.billingKind === 'byok_wrapper';
  const isPlanFit = estimateKind === 'plan-fit';
  const multiModel = isMultiModelProvider(estimate.provider, estimate.product, estimate.billingKind);
  const candidateFamily = multiModel ? 'unknown' : providerToFamily(estimate.provider);
  const candidateModelId = extractCandidateModelId(estimate);
  const resolution = resolvePortfolioResolution(
    estimate,
    isByokWrapper,
    isPlanFit,
    multiModel,
    candidateModelId,
  );
  const supportedTiers = candidateSupportedTiers(estimate, resolution, candidateFamily, candidateModelId);
  const knownFamilies = candidateKnownFamilies(estimate, resolution, candidateFamily);
  const knownModels = candidateKnownModels(candidateModelId);

  const mappings = baselineRows.map((baseline) =>
    buildModelMapping(baseline, {
      resolution,
      candidateFamily,
      candidateModelId,
      knownFamilies,
      knownModels,
      supportedTiers,
      estimate,
    }),
  );

  const exactModelCoverageByCostShare = roundPct(
    mappings.reduce((sum, mapping) => sum + mapping.baselineCostShare * EXACT_MODEL_WEIGHT[mapping.equivalence], 0),
  );
  const familyCoverageByCostShare = roundPct(
    mappings.reduce((sum, mapping) => sum + mapping.baselineCostShare * FAMILY_WEIGHT[mapping.equivalence], 0),
  );
  const tierCoverageByCostShare = roundPct(
    mappings.reduce((sum, mapping) => sum + mapping.baselineCostShare * TIER_WEIGHT[mapping.equivalence], 0),
  );
  const substitutionCoverageByCostShare = roundPct(
    mappings.reduce((sum, mapping) => sum + mapping.baselineCostShare * SUBSTITUTION_WEIGHT[mapping.equivalence], 0),
  );
  const portfolioCoverageByCostShare = substitutionCoverageByCostShare;

  const modelAvailability = resolveModelAvailability(
    resolution,
    tierCoverageByCostShare,
    familyCoverageByCostShare,
    substitutionCoverageByCostShare,
  );

  let fitScorePct = computeFitScorePct(
    familyCoverageByCostShare,
    tierCoverageByCostShare,
    exactModelCoverageByCostShare,
  );
  if (resolution === 'router-unselected' || resolution === 'byok-unselected') {
    fitScorePct = 0;
  } else if (resolution === 'plan-fit-model-availability-only') {
    fitScorePct = modelAvailabilityToFitScore(modelAvailability);
  }

  const capabilityRisk = resolveCapabilityRisk(
    resolution,
    substitutionCoverageByCostShare,
    familyCoverageByCostShare,
    tierCoverageByCostShare,
    exactModelCoverageByCostShare,
    baselineRows.length > 0,
  );
  const pricingConfidence = estimate.confidence;
  const equivalenceConfidence = resolveEquivalenceConfidence(
    resolution,
    substitutionCoverageByCostShare,
    tierCoverageByCostShare,
    familyCoverageByCostShare,
    exactModelCoverageByCostShare,
    baselineRows.length > 0,
  );

  const monthlyUsd = normalizeMonthlyUsd(estimate);
  const midpoint = monthlyUsd !== undefined ? roundUsd((monthlyUsd.min + monthlyUsd.max) / 2) : undefined;
  const savingsUsd = midpoint !== undefined ? roundUsd(baselineUsd - midpoint) : undefined;

  const portfolioKind = resolvePortfolioKind(
    estimate,
    resolution,
    isPlanFit,
    mappings,
    substitutionCoverageByCostShare,
    exactModelCoverageByCostShare,
  );

  let comparisonGroup = resolveComparisonGroup(resolution, isPlanFit, capabilityRisk, familyCoverageByCostShare);

  const notes = normalizeNotes(estimate, resolution);

  let label: CandidatePortfolio['label'] = 'Not comparable';
  let hideSavings = true;
  let showSavingsAsSecondary = false;

  if (resolution === 'byok-unselected') {
    label = 'Select provider first';
    estimateKind = 'requires-model-selection';
    hideSavings = true;
    comparisonGroup = 'BYOK / wrapper tools';
  } else if (resolution === 'router-unselected') {
    label = 'Select model portfolio first';
    estimateKind = 'requires-model-selection';
    hideSavings = true;
    comparisonGroup = 'Router / model selection required';
  } else if (isPlanFit) {
    label = 'Plan fit only';
    estimateKind = 'plan-fit';
    hideSavings = true;
    showSavingsAsSecondary = false;
    comparisonGroup = 'Plan / subscription products';
  } else {
    hideSavings = false;
    const comparable = familyCoverageByCostShare >= 0.85
      && tierCoverageByCostShare >= 0.85
      && capabilityRisk !== 'high'
      && equivalenceConfidence !== 'low';

    if (comparable && estimateKind !== 'plan-fit') {
      label = 'Comparable';
      showSavingsAsSecondary = false;
      if (savingsUsd !== undefined && savingsUsd > 0) {
        label = 'Comparable and cheaper';
      }
      comparisonGroup = 'Comparable portfolios';
    } else {
      comparisonGroup = 'Cheaper but not equivalent';
      if (savingsUsd !== undefined && savingsUsd <= 0) {
        label = capabilityRisk === 'low' || capabilityRisk === 'medium' ? 'Near current' : 'Not cheaper';
        showSavingsAsSecondary = false;
      } else if (capabilityRisk === 'high') {
        label = 'Cheaper with downgrade risk';
        showSavingsAsSecondary = savingsUsd !== undefined && savingsUsd > 0;
      } else if (savingsUsd !== undefined && savingsUsd > 0) {
        label = 'Cost-only cheaper';
        showSavingsAsSecondary = true;
      } else {
        label = 'Not cheaper';
        showSavingsAsSecondary = false;
      }
    }

    if (isCurrentLike(
      estimate,
      candidateFamily,
      fingerprint,
      exactModelCoverageByCostShare,
      familyCoverageByCostShare,
      tierCoverageByCostShare,
      equivalenceConfidence,
      mappings,
    )) {
      label = 'Current-like';
      showSavingsAsSecondary = false;
      comparisonGroup = 'Comparable portfolios';
    }

    if (savingsUsd !== undefined && savingsUsd <= 0 && label === 'Cost-only cheaper') {
      label = capabilityRisk === 'low' || capabilityRisk === 'medium' ? 'Near current' : 'Not cheaper';
      showSavingsAsSecondary = false;
    }
  }

  const recommendationConfidence = resolveRecommendationConfidence(pricingConfidence, equivalenceConfidence, capabilityRisk, hideSavings);

  let plan = estimate.plan;
  if (
    estimate.provider.trim().toLowerCase() === 'anthropic'
    && estimate.billingKind === 'token_metered'
    && estimate.estimateKind === 'range'
  ) {
    plan = 'same-tier portfolio';
  }

  return {
    productId: estimate.productId,
    provider: estimate.provider,
    product: estimate.product,
    plan,
    comparisonGroup,
    portfolioKind,
    resolution,
    mappings,
    exactModelCoverageByCostShare,
    familyCoverageByCostShare,
    tierCoverageByCostShare,
    substitutionCoverageByCostShare,
    portfolioCoverageByCostShare,
    fitScorePct,
    capabilityRisk,
    pricingConfidence,
    equivalenceConfidence,
    recommendationConfidence,
    estimateKind,
    modelAvailability,
    planAdequacy: isPlanFit ? 'not-evaluated' : undefined,
    monthlyUsd,
    savingsUsd,
    label,
    hideSavings,
    showSavingsAsSecondary,
    notes,
  };
}

function buildModelMapping(
  baseline: BaselineModelRow,
  context: {
    resolution: PortfolioResolution;
    candidateFamily: ModelFamily;
    candidateModelId?: string;
    knownFamilies: Set<ModelFamily>;
    knownModels: Set<string>;
    supportedTiers: Set<Tier>;
    estimate: ProviderEstimate;
  },
): CandidatePortfolioMapping {
  if (context.resolution === 'byok-unselected') {
    return {
      baselineModelId: baseline.modelId,
      baselineCostShare: baseline.costShare,
      equivalence: 'unknown',
      equivalenceConfidence: 'low',
      reason: 'Delegates billing to the underlying provider/model. Select a provider/model portfolio before estimating cost or equivalence.',
    };
  }

  if (context.resolution === 'router-unselected') {
    return {
      baselineModelId: baseline.modelId,
      baselineCostShare: baseline.costShare,
      equivalence: 'unknown',
      equivalenceConfidence: 'low',
      reason: 'Select a concrete model portfolio before equivalence can be scored.',
    };
  }

  if (context.candidateModelId !== undefined && context.knownModels.has(baseline.modelId)) {
    return {
      baselineModelId: baseline.modelId,
      candidateModelId: baseline.modelId,
      baselineCostShare: baseline.costShare,
      equivalence: 'same-model',
      equivalenceConfidence: 'high',
      reason: 'Exact baseline model appears in the candidate portfolio.',
    };
  }

  const sameFamily = baseline.family !== 'unknown' && context.knownFamilies.has(baseline.family);
  const sameTier = context.supportedTiers.has(baseline.tier);
  const nearTier = !sameTier && LOWER_TIER_FALLBACK[baseline.tier].some((tier) => context.supportedTiers.has(tier));

  if (sameFamily && sameTier) {
    return {
      baselineModelId: baseline.modelId,
      candidateModelId: context.candidateModelId,
      baselineCostShare: baseline.costShare,
      equivalence: 'same-family',
      equivalenceConfidence: context.resolution === 'single-provider' ? 'high' : 'medium',
      reason: context.resolution === 'single-provider'
        ? 'Candidate portfolio matches baseline model family and tier.'
        : 'Known hosted/routed model families can preserve baseline family and tier.',
    };
  }

  if (sameTier) {
    return {
      baselineModelId: baseline.modelId,
      candidateModelId: context.candidateModelId,
      baselineCostShare: baseline.costShare,
      equivalence: 'same-tier',
      equivalenceConfidence: 'medium',
      reason: 'Tier can be preserved, but family differs.',
    };
  }

  if (nearTier) {
    return {
      baselineModelId: baseline.modelId,
      candidateModelId: context.candidateModelId,
      baselineCostShare: baseline.costShare,
      equivalence: 'near-tier',
      equivalenceConfidence: 'low',
      reason: 'Closest available tier is lower than baseline.',
    };
  }

  return {
    baselineModelId: baseline.modelId,
    candidateModelId: context.candidateModelId,
    baselineCostShare: baseline.costShare,
    equivalence: 'downgrade',
    equivalenceConfidence: 'low',
    reason: 'No clear family/tier equivalent in this portfolio.',
  };
}

function buildModelCapabilityProfile(modelId: string): ModelCapabilityProfile {
  const pricing = MODEL_PRICING[modelId];
  if (pricing === undefined) {
    return {
      modelId,
      provider: 'unknown',
      family: 'unknown',
      tier: 'unknown',
      strengths: ['coding'],
      pricingConfidence: 'low',
    };
  }

  const tier = categoryToTier(pricing.category, pricing.inputPerMillion, pricing.outputPerMillion);
  return {
    modelId,
    provider: pricing.provider,
    family: providerToFamily(pricing.provider),
    tier,
    strengths: defaultStrengthsForTier(tier),
    inputRatePerMtok: pricing.inputPerMillion,
    outputRatePerMtok: pricing.outputPerMillion,
    cachedInputRatePerMtok: pricing.cachedInputPerMillion,
    pricingConfidence: 'high',
  };
}

function categoryToTier(
  category: string,
  inputPerMtok?: number,
  outputPerMtok?: number,
): Tier {
  if (category === 'Powerful') {
    return 'powerful';
  }
  if (category === 'Versatile') {
    return 'versatile';
  }
  if (category === 'Lightweight') {
    const input = inputPerMtok ?? Number.POSITIVE_INFINITY;
    const output = outputPerMtok ?? Number.POSITIVE_INFINITY;
    if (input <= 0.5 && output <= 3) {
      return 'economy';
    }
    return 'fast';
  }
  return 'unknown';
}

function defaultStrengthsForTier(tier: Tier): ModelCapabilityProfile['strengths'] {
  if (tier === 'powerful') {
    return ['coding', 'agentic', 'reasoning', 'long-context', 'tool-use'];
  }
  if (tier === 'versatile') {
    return ['coding', 'reasoning', 'tool-use'];
  }
  if (tier === 'fast') {
    return ['coding', 'low-latency'];
  }
  if (tier === 'economy') {
    return ['cheap', 'low-latency'];
  }
  if (tier === 'local') {
    return ['cheap', 'coding'];
  }
  return ['coding'];
}

function providerToFamily(provider: string): ModelFamily {
  const key = provider.trim().toLowerCase();
  if (key.includes('anthropic') || key.includes('claude')) {
    return 'anthropic';
  }
  if (key.includes('openai') || key.includes('codex')) {
    return 'openai';
  }
  if (key.includes('google') || key.includes('gemini')) {
    return 'google';
  }
  if (key.includes('local')) {
    return 'local';
  }
  return 'unknown';
}

function isMultiModelProvider(
  provider: string,
  product: string,
  billingKind: ProviderEstimate['billingKind'],
): boolean {
  if (billingKind === 'byok_wrapper' || billingKind === 'router_payg') {
    return true;
  }
  const providerKey = provider.trim().toLowerCase();
  const productKey = product.trim().toLowerCase();
  if (MULTI_MODEL_PROVIDERS.has(providerKey)) {
    return true;
  }
  if (productKey.includes('copilot') || productKey.includes('cursor') || productKey.includes('windsurf')) {
    return true;
  }
  return false;
}

function resolvePortfolioResolution(
  estimate: ProviderEstimate,
  isByokWrapper: boolean,
  isPlanFit: boolean,
  multiModel: boolean,
  candidateModelId?: string,
): PortfolioResolution {
  if (isByokWrapper) {
    return 'byok-unselected';
  }
  if (isPlanFit) {
    return 'plan-fit-model-availability-only';
  }
  if (estimate.billingKind === 'router_payg') {
    return candidateModelId ? 'router-selected-models' : 'router-unselected';
  }
  if (ROUTER_UNSELECTED_PRODUCT_IDS.has(estimate.productId)) {
    return candidateModelId ? 'router-selected-models' : 'router-unselected';
  }
  if (multiModel) {
    return 'hosted-multi-model-known';
  }
  return 'single-provider';
}

function candidateKnownFamilies(
  estimate: ProviderEstimate,
  resolution: PortfolioResolution,
  candidateFamily: ModelFamily,
): Set<ModelFamily> {
  if (resolution === 'byok-unselected' || resolution === 'router-unselected') {
    return new Set<ModelFamily>();
  }

  if (resolution === 'single-provider') {
    return candidateFamily !== 'unknown' ? new Set<ModelFamily>([candidateFamily]) : new Set<ModelFamily>();
  }

  const providerKey = estimate.provider.trim().toLowerCase();
  const hostedFamilies = HOSTED_MULTI_MODEL_FAMILIES[providerKey] ?? [];
  const known = new Set<ModelFamily>(hostedFamilies);
  if (candidateFamily !== 'unknown') {
    known.add(candidateFamily);
  }
  return known;
}

function candidateKnownModels(candidateModelId?: string): Set<string> {
  const known = new Set<string>();
  if (candidateModelId) {
    known.add(candidateModelId);
  }
  return known;
}

function candidateSupportedTiers(
  estimate: ProviderEstimate,
  resolution: PortfolioResolution,
  candidateFamily: ModelFamily,
  candidateModelId?: string,
): Set<Tier> {
  if (resolution === 'byok-unselected' || resolution === 'router-unselected') {
    return new Set<Tier>();
  }

  if (estimate.provider.trim().toLowerCase() === 'local') {
    return new Set<Tier>(['local']);
  }

  if (estimate.billingKind === 'token_metered') {
    if (candidateFamily === 'anthropic') {
      return new Set<Tier>(['powerful', 'versatile']);
    }
    if (candidateFamily === 'openai') {
      return new Set<Tier>(['powerful', 'versatile', 'fast', 'economy']);
    }
    if (candidateFamily === 'google') {
      return new Set<Tier>(['powerful', 'fast', 'economy']);
    }
  }

  if (resolution === 'hosted-multi-model-known' || resolution === 'plan-fit-model-availability-only') {
    return new Set<Tier>(['powerful', 'versatile', 'fast', 'economy']);
  }

  if (candidateModelId !== undefined) {
    const profile = buildModelCapabilityProfile(candidateModelId);
    return new Set<Tier>([profile.tier]);
  }

  if (candidateFamily === 'anthropic') {
    return new Set<Tier>(['powerful', 'versatile']);
  }
  if (candidateFamily === 'openai') {
    return new Set<Tier>(['powerful', 'versatile', 'fast', 'economy']);
  }
  if (candidateFamily === 'google') {
    return new Set<Tier>(['powerful', 'fast', 'economy']);
  }

  return new Set<Tier>(['versatile']);
}

function resolveCapabilityRisk(
  resolution: PortfolioResolution,
  substitutionCoverageByCostShare: number,
  familyCoverageByCostShare: number,
  tierCoverageByCostShare: number,
  exactModelCoverageByCostShare: number,
  hasBaseline: boolean,
): CandidatePortfolio['capabilityRisk'] {
  if (!hasBaseline) {
    return 'unknown';
  }
  if (resolution === 'byok-unselected' || resolution === 'router-unselected' || resolution === 'plan-fit-model-availability-only') {
    return 'unknown';
  }
  if (substitutionCoverageByCostShare < 0.7) {
    return 'high';
  }
  if (familyCoverageByCostShare < 0.5 && tierCoverageByCostShare >= 0.85) {
    return 'high';
  }
  const fit = computeFitScorePct(
    familyCoverageByCostShare,
    tierCoverageByCostShare,
    exactModelCoverageByCostShare,
  );
  if (fit >= 90 && familyCoverageByCostShare >= 0.8) {
    return 'low';
  }
  if (fit >= 72) {
    return 'medium';
  }
  return 'high';
}

function resolveEquivalenceConfidence(
  resolution: PortfolioResolution,
  substitutionCoverageByCostShare: number,
  tierCoverageByCostShare: number,
  familyCoverageByCostShare: number,
  exactModelCoverageByCostShare: number,
  hasBaseline: boolean,
): EstimateConfidence {
  if (!hasBaseline) {
    return 'low';
  }
  if (resolution === 'byok-unselected' || resolution === 'router-unselected') {
    return 'low';
  }
  if (resolution === 'plan-fit-model-availability-only') {
    if (tierCoverageByCostShare >= 0.85) {
      return 'medium';
    }
    return 'low';
  }
  if (
    substitutionCoverageByCostShare >= 0.9
    && tierCoverageByCostShare >= 0.9
    && familyCoverageByCostShare >= 0.8
    && exactModelCoverageByCostShare >= 0.15
  ) {
    return 'high';
  }
  if (substitutionCoverageByCostShare >= 0.75 && tierCoverageByCostShare >= 0.7 && familyCoverageByCostShare >= 0.35) {
    return 'medium';
  }
  return 'low';
}

function resolveModelAvailability(
  resolution: PortfolioResolution,
  tierCoverageByCostShare: number,
  familyCoverageByCostShare: number,
  substitutionCoverageByCostShare: number,
): CandidatePortfolio['modelAvailability'] {
  if (resolution === 'byok-unselected' || resolution === 'router-unselected') {
    return 'unknown';
  }
  if (tierCoverageByCostShare >= 0.9 && (familyCoverageByCostShare >= 0.5 || substitutionCoverageByCostShare >= 0.85)) {
    return 'high';
  }
  if (tierCoverageByCostShare >= 0.65) {
    return 'medium';
  }
  if (tierCoverageByCostShare > 0) {
    return 'low';
  }
  return 'unknown';
}

function modelAvailabilityToFitScore(value: CandidatePortfolio['modelAvailability']): number {
  if (value === 'high') {
    return 90;
  }
  if (value === 'medium') {
    return 65;
  }
  if (value === 'low') {
    return 35;
  }
  return 0;
}

function resolveRecommendationConfidence(
  pricingConfidence: EstimateConfidence,
  equivalenceConfidence: EstimateConfidence,
  capabilityRisk: CandidatePortfolio['capabilityRisk'],
  hideSavings: boolean,
): EstimateConfidence {
  let score = Math.min(CONFIDENCE_SCORE[pricingConfidence], CONFIDENCE_SCORE[equivalenceConfidence]);
  if (capabilityRisk === 'high') {
    score = Math.max(1, score - 1);
  }
  if (hideSavings) {
    score = Math.min(score, 2);
  }
  if (score >= 3) {
    return 'high';
  }
  if (score === 2) {
    return 'medium';
  }
  return 'low';
}

function resolvePortfolioKind(
  estimate: ProviderEstimate,
  resolution: PortfolioResolution,
  isPlanFit: boolean,
  mappings: CandidatePortfolioMapping[],
  substitutionCoverageByCostShare: number,
  exactModelCoverageByCostShare: number,
): PortfolioKind {
  if (resolution === 'byok-unselected') {
    return 'byok-wrapper';
  }
  if (isPlanFit) {
    return 'plan-fit';
  }

  const allSameModel = mappings.length > 0 && mappings.every((mapping) => mapping.equivalence === 'same-model');
  if (allSameModel) {
    return 'same-model';
  }
  if (exactModelCoverageByCostShare >= 0.85 || substitutionCoverageByCostShare >= 0.85) {
    return 'same-tier';
  }
  if (substitutionCoverageByCostShare >= 0.7) {
    return 'cheapest-comparable';
  }
  if (estimate.billingKind === 'router_payg' || resolution === 'router-unselected') {
    return 'provider-default';
  }
  return 'cheapest-possible';
}

function resolveComparisonGroup(
  resolution: PortfolioResolution,
  isPlanFit: boolean,
  capabilityRisk: CandidatePortfolio['capabilityRisk'],
  familyCoverageByCostShare: number,
): CandidatePortfolio['comparisonGroup'] {
  if (resolution === 'byok-unselected') {
    return 'BYOK / wrapper tools';
  }
  if (resolution === 'router-unselected') {
    return 'Router / model selection required';
  }
  if (isPlanFit) {
    return 'Plan / subscription products';
  }
  if (capabilityRisk === 'high' || familyCoverageByCostShare < 0.7) {
    return 'Cheaper but not equivalent';
  }
  return 'Comparable portfolios';
}

function normalizeNotes(
  estimate: ProviderEstimate,
  resolution: PortfolioResolution,
): string[] {
  const notes = [
    ...estimate.assumptions,
    ...estimate.caveats,
  ].filter((note) => !/selected in/i.test(note));

  if (resolution === 'byok-unselected') {
    notes.unshift('Delegates billing to the underlying provider/model. Select a provider/model portfolio before estimating cost or equivalence.');
  }

  if (resolution === 'plan-fit-model-availability-only') {
    notes.push('Usage allowance and quota pressure are not evaluated in this version.');
  }

  return notes.slice(0, 4);
}

function normalizeEstimateKind(estimate: ProviderEstimate): CandidateEstimateKind {
  if (estimate.billingKind === 'byok_wrapper') {
    return 'requires-model-selection';
  }
  if (estimate.estimateKind === 'exact_formula') {
    return 'exact';
  }
  if (estimate.estimateKind === 'range') {
    return 'range';
  }
  if (estimate.estimateKind === 'plan_fit' || estimate.estimateKind === 'quota_pressure') {
    return 'plan-fit';
  }
  return 'not-comparable';
}

function normalizeMonthlyUsd(estimate: ProviderEstimate): { min: number; max: number } | undefined {
  if (estimate.monthlyCost === undefined) {
    return undefined;
  }
  const min = estimate.monthlyCost.low ?? estimate.monthlyCost.expected ?? estimate.monthlyCost.high;
  const max = estimate.monthlyCost.high ?? estimate.monthlyCost.expected ?? estimate.monthlyCost.low;
  if (min === undefined || max === undefined) {
    return undefined;
  }
  return {
    min: roundUsd(Math.min(min, max)),
    max: roundUsd(Math.max(min, max)),
  };
}

function extractCandidateModelId(estimate: ProviderEstimate): string | undefined {
  const productId = estimate.productId.toLowerCase();
  for (const modelId of Object.keys(MODEL_PRICING)) {
    if (productId.includes(modelId)) {
      return modelId;
    }
  }
  return undefined;
}

function buildInterpretation(
  dominantModelId: string,
  dominantProviderFamily: ModelFamily,
  dominantTier: Tier,
  powerfulCostSharePct: number,
): string {
  if (powerfulCostSharePct >= 60) {
    return `Your workload is Powerful-tier heavy. Most estimated cost comes from ${dominantModelId}, so cheaper lower-tier replacements may not be directly comparable.`;
  }
  if (dominantTier === 'versatile') {
    return `Your workload is Versatile-tier led with ${dominantModelId} as the dominant model, so same-tier alternatives are usually safer than single-model cheapest options.`;
  }
  if (dominantTier === 'fast' || dominantTier === 'economy') {
    return 'Your workload is cost-sensitive and lightweight, so lower-cost alternatives are more likely to remain capability-comparable.';
  }
  return `Your workload is ${dominantProviderFamily}-leaning with a mixed tier profile. Prefer portfolios with strong model and tier coverage over raw price ranking.`;
}

function buildSummaryText(
  fingerprint: WorkloadFingerprint,
  comparable: CandidatePortfolio[],
  cheaperRisky: CandidatePortfolio[],
): string {
  const comparableNames = comparable
    .slice(0, 3)
    .map((item) => `${item.provider} ${item.plan ?? item.product}`)
    .join(', ');
  const riskyNames = cheaperRisky
    .slice(0, 2)
    .map((item) => `${item.provider} ${item.plan ?? item.product}`)
    .join(', ');

  if (fingerprint.powerfulCostSharePct >= 60 && fingerprint.dominantProviderFamily === 'anthropic') {
    const safeText = comparableNames.length > 0
      ? `The safest comparable options are ${comparableNames}.`
      : 'The safest comparable options are high-coverage Anthropic-family and multi-model portfolios.';
    const riskyText = riskyNames.length > 0
      ? `Cheaper references like ${riskyNames} should be treated as cost-only alternatives until validated against your repositories.`
      : 'Cheaper single-model references should be treated as cost-only alternatives until validated against your repositories.';
    return `Your workload is dominated by Anthropic Opus-class usage. ${safeText} ${riskyText}`;
  }

  if (fingerprint.powerfulCostSharePct >= 60) {
    return 'Your workload is frontier-heavy. Prefer portfolios with high family+tier coverage, and treat lower-cost single-model references as potentially downgraded alternatives.';
  }

  return 'Choose candidates by fit score, family coverage, exact-model coverage, and tier coverage first. Lower monthly price is meaningful only when capability coverage is also high.';
}

function isCurrentLike(
  estimate: ProviderEstimate,
  candidateFamily: ModelFamily,
  fingerprint: WorkloadFingerprint,
  exactModelCoverageByCostShare: number,
  familyCoverageByCostShare: number,
  tierCoverageByCostShare: number,
  equivalenceConfidence: EstimateConfidence,
  mappings: CandidatePortfolioMapping[],
): boolean {
  const providerKey = estimate.provider.trim().toLowerCase();
  const productKey = estimate.product.trim().toLowerCase();
  if (providerKey === 'github' && productKey.includes('copilot')) {
    return true;
  }
  const hasForcedDowngrade = mappings.some((mapping) => mapping.equivalence === 'downgrade' || mapping.equivalence === 'near-tier');
  if (
    candidateFamily !== 'unknown'
    && candidateFamily === fingerprint.dominantProviderFamily
    && estimate.billingKind === 'token_metered'
    && familyCoverageByCostShare >= 0.9
    && tierCoverageByCostShare >= 0.9
    && exactModelCoverageByCostShare >= 0.5
    && equivalenceConfidence === 'high'
    && !hasForcedDowngrade
  ) {
    return true;
  }
  return false;
}

function maxKey<T extends string>(
  values: Map<T, number>,
  fallback: T,
): T {
  let topKey: T = fallback;
  let topValue = Number.NEGATIVE_INFINITY;
  for (const [key, value] of values.entries()) {
    if (value > topValue) {
      topValue = value;
      topKey = key;
    }
  }
  return topKey;
}

function sortComparableGroup(a: CandidatePortfolio, b: CandidatePortfolio): number {
  const byConfidence = CONFIDENCE_SCORE[b.recommendationConfidence] - CONFIDENCE_SCORE[a.recommendationConfidence];
  if (byConfidence !== 0) {
    return byConfidence;
  }
  const byFamily = b.familyCoverageByCostShare - a.familyCoverageByCostShare;
  if (byFamily !== 0) {
    return byFamily;
  }
  const byTier = b.tierCoverageByCostShare - a.tierCoverageByCostShare;
  if (byTier !== 0) {
    return byTier;
  }
  const aMonthly = a.monthlyUsd ? (a.monthlyUsd.min + a.monthlyUsd.max) / 2 : Number.POSITIVE_INFINITY;
  const bMonthly = b.monthlyUsd ? (b.monthlyUsd.min + b.monthlyUsd.max) / 2 : Number.POSITIVE_INFINITY;
  return aMonthly - bMonthly;
}

function sortCheaperRiskyGroup(a: CandidatePortfolio, b: CandidatePortfolio): number {
  const bySavings = (b.savingsUsd ?? Number.NEGATIVE_INFINITY) - (a.savingsUsd ?? Number.NEGATIVE_INFINITY);
  if (bySavings !== 0) {
    return bySavings;
  }
  const byRisk = RISK_RANK[a.capabilityRisk] - RISK_RANK[b.capabilityRisk];
  if (byRisk !== 0) {
    return byRisk;
  }
  return b.familyCoverageByCostShare - a.familyCoverageByCostShare;
}

function sortPlanFitGroup(a: CandidatePortfolio, b: CandidatePortfolio): number {
  const byAvailability = MODEL_AVAILABILITY_RANK[b.modelAvailability ?? 'unknown'] - MODEL_AVAILABILITY_RANK[a.modelAvailability ?? 'unknown'];
  if (byAvailability !== 0) {
    return byAvailability;
  }
  const aMonthly = a.monthlyUsd ? (a.monthlyUsd.min + a.monthlyUsd.max) / 2 : Number.POSITIVE_INFINITY;
  const bMonthly = b.monthlyUsd ? (b.monthlyUsd.min + b.monthlyUsd.max) / 2 : Number.POSITIVE_INFINITY;
  return aMonthly - bMonthly;
}

function sortByokGroup(a: CandidatePortfolio, b: CandidatePortfolio): number {
  const selectedA = a.resolution === 'router-selected-models' ? 1 : 0;
  const selectedB = b.resolution === 'router-selected-models' ? 1 : 0;
  if (selectedA !== selectedB) {
    return selectedB - selectedA;
  }
  return `${a.provider} ${a.product}`.localeCompare(`${b.provider} ${b.product}`);
}

function roundUsd(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundPct(value: number): number {
  return Math.round(value * 1000) / 1000;
}
