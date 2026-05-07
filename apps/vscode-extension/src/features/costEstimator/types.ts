/** Types for the Cost Estimator feature. Pure data — no VS Code or DOM imports. */

export type ModelProvider = 'OpenAI' | 'Anthropic' | 'Google' | 'xAI' | 'GitHub';

export type ModelCategory = 'Lightweight' | 'Versatile' | 'Powerful' | 'Preview' | 'Unknown';

export type ReleaseStatus = 'GA' | 'Public preview' | 'Unknown';

export interface ModelPricing {
  id: string;
  displayName: string;
  provider: ModelProvider;
  category: ModelCategory;
  releaseStatus?: ReleaseStatus;
  /** USD per 1,000,000 input tokens. */
  inputPerMillion: number;
  cachedInputPerMillion?: number;
  cacheWritePerMillion?: number;
  /** USD per 1,000,000 output tokens. */
  outputPerMillion: number;
  notes?: string[];
}

export type CopilotPlan =
  | 'free'
  | 'pro'
  | 'pro_plus'
  | 'business'
  | 'enterprise'
  | 'unknown';

export type CopilotBillingModel =
  | 'individual_monthly'
  | 'individual_annual'
  | 'mobile_ios_android'
  | 'organization_managed'
  | 'unknown';

export type AllowanceType = 'individual' | 'pooled_org' | 'limited_or_unknown';

export interface PlanAllowance {
  displayName: string;
  /** Personal monthly credit allowance (individual plans). */
  includedCreditsPerMonth?: number;
  /** Per-user monthly credits, pooled at the billing entity (org plans). */
  includedCreditsPerUserPerMonth?: number;
  includedUsdValue?: number;
  allowanceType: AllowanceType;
}

export type DataCompleteness = 'complete' | 'partial' | 'missing_cache_data';

export interface UsageEstimate {
  rangeLabel: string;
  rangeStart: string;       // ISO date
  rangeEnd: string;         // ISO date
  daysInRange: number;

  observedInputTokens: number;
  observedOutputTokens: number;
  observedCachedInputTokens?: number;
  observedCacheWriteTokens?: number;

  monthlyInputTokens: number;
  monthlyOutputTokens: number;
  monthlyCachedInputTokens?: number;
  monthlyCacheWriteTokens?: number;

  dataCompleteness: DataCompleteness;
}

export interface CostEstimate {
  modelId: string;
  modelDisplayName: string;

  estimatedMonthlyUsd: number;
  estimatedMonthlyCredits: number;

  inputCostUsd: number;
  outputCostUsd: number;
  cachedInputCostUsd: number;
  cacheWriteCostUsd: number;

  hasCacheInputEstimate: boolean;
  hasCacheWriteEstimate: boolean;
}

export type PlanImpactStatus =
  | 'within_allowance'
  | 'over_allowance_within_budget'
  | 'over_allowance_exceeds_budget'
  | 'pooled_org'
  | 'estimate_only';

export interface PlanImpactEstimate {
  planId: CopilotPlan;
  billingModel: CopilotBillingModel;
  selectedModelId: string;

  estimatedCredits: number;
  includedCredits?: number;
  extraBudgetCredits: number;

  overageCredits?: number;
  estimatedExtraUsd?: number;
  isWithinIncludedAllowance?: boolean;
  isCoveredByExtraBudget?: boolean;

  status: PlanImpactStatus;
  warnings: string[];
}

export type CostRangeKey = 'last_7_days' | 'last_30_days' | 'last_3_months' | 'all_time';

export interface CostEstimatorSettings {
  selectedPlan: CopilotPlan;
  billingModel: CopilotBillingModel;
  extraBudgetUsd: number;
  selectedModelId: string;
  defaultRange: CostRangeKey;
}

export interface TrendInsight {
  label: string;
  /** Positive = recent usage is higher than longer-term average. */
  deltaPct: number;
}

export type BillingKind =
  | 'token_metered'
  | 'credit_metered'
  | 'subscription_allowance'
  | 'subscription_quota'
  | 'hybrid_subscription_usage'
  | 'request_credit'
  | 'seat_license'
  | 'enterprise_contract'
  | 'byok_wrapper'
  | 'router_payg'
  | 'local_model'
  | 'unknown';

export type CredentialMode =
  | 'account_login'
  | 'api_key'
  | 'byok'
  | 'cloud_provider'
  | 'router'
  | 'local'
  | 'unknown';

export type EstimateKind = 'exact_formula' | 'range' | 'plan_fit' | 'quota_pressure' | 'unsupported';

export type EstimateConfidence = 'high' | 'medium' | 'low';

export interface RateCardSource {
  id: string;
  provider: string;
  product: string;
  sourceUrl: string;
  sourceType: 'official_html' | 'official_docs' | 'official_json' | 'manual_import';
  billingKind: BillingKind;
  refreshStrategy: 'manual_review' | 'html_extract' | 'json_api' | 'user_import_only';
  confidence: EstimateConfidence;
  notes?: string[];
}

export interface IncludedUsage {
  unit: 'tokens' | 'credits' | 'requests' | 'quota' | 'dollars' | 'unknown';
  amount?: number;
  reset: 'daily' | 'weekly' | 'monthly' | 'rolling' | 'unknown';
  notes?: string[];
}

export interface TokenRates {
  inputPerMTok?: number;
  outputPerMTok?: number;
  cachedInputPerMTok?: number;
  cacheWritePerMTok?: number;
}

export interface CreditRates {
  creditUnitName: string;
  creditToUsd?: number;
  requestToCredit?: number;
  tokenToCreditFormula?: string;
}

export interface ProviderRateCard {
  schemaVersion: 1;
  productId: string;
  provider: string;
  product: string;
  plan?: string;
  billingKind: BillingKind;
  credentialMode: CredentialMode;
  currency: 'USD' | 'EUR' | 'GBP' | 'unknown';
  subscription?: {
    amount: number;
    interval: 'monthly' | 'annual' | 'custom';
    perSeat?: boolean;
  };
  includedUsage?: IncludedUsage;
  tokenRates?: TokenRates;
  creditRates?: CreditRates;
  overage?: {
    enabled: boolean;
    unit?: 'token' | 'credit' | 'request' | 'api_price' | 'unknown';
    notes?: string[];
  };
  source: RateCardSource;
  confidence: EstimateConfidence;
  estimateKind?: EstimateKind;
  lastCheckedAt?: string;
  staleAfterDays?: number;
  requiresManualReview?: boolean;
  notes?: string[];
}

export interface ProviderMonthlyCost {
  low?: number;
  expected?: number;
  high?: number;
  currency: string;
}

export interface ProviderQuota {
  likelyFits?: boolean;
  pressure: 'low' | 'medium' | 'high' | 'unknown';
  notes?: string[];
}

export interface ProviderEstimate {
  productId: string;
  provider: string;
  product: string;
  plan?: string;
  mode?: string;
  billingKind: BillingKind;
  estimateKind: EstimateKind;
  monthlyCost?: ProviderMonthlyCost;
  quota?: ProviderQuota;
  confidence: EstimateConfidence;
  assumptions: string[];
  caveats: string[];
  sourceUrls: string[];
  lastCheckedAt?: string;
  staleAfterDays?: number;
  isStale: boolean;
  requiresManualReview: boolean;
}

export type Tier =
  | 'powerful'
  | 'versatile'
  | 'fast'
  | 'economy'
  | 'local'
  | 'unknown';

export type ModelFamily =
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'meta'
  | 'mistral'
  | 'deepseek'
  | 'qwen'
  | 'local'
  | 'unknown';

export type CapabilityStrength =
  | 'coding'
  | 'agentic'
  | 'reasoning'
  | 'long-context'
  | 'tool-use'
  | 'low-latency'
  | 'cheap';

export interface ModelCapabilityProfile {
  modelId: string;
  provider: string;
  family: ModelFamily;
  tier: Tier;
  strengths: CapabilityStrength[];
  contextWindow?: number;
  inputRatePerMtok?: number;
  outputRatePerMtok?: number;
  cachedInputRatePerMtok?: number;
  sourceUrl?: string;
  pricingConfidence: EstimateConfidence;
}

export type EquivalenceKind =
  | 'same-model'
  | 'same-family'
  | 'same-tier'
  | 'near-tier'
  | 'downgrade'
  | 'unknown';

export interface ModelEquivalence {
  sourceModelId: string;
  candidateModelId?: string;
  equivalence: EquivalenceKind;
  confidence: EstimateConfidence;
  reason: string;
}

export type PortfolioKind =
  | 'same-model'
  | 'same-tier'
  | 'provider-default'
  | 'cheapest-comparable'
  | 'cheapest-possible'
  | 'plan-fit'
  | 'byok-wrapper';

export type CandidateEstimateKind =
  | 'exact'
  | 'range'
  | 'plan-fit'
  | 'not-comparable'
  | 'requires-model-selection';

export type PortfolioResolution =
  | 'single-provider'
  | 'hosted-multi-model-known'
  | 'router-selected-models'
  | 'router-unselected'
  | 'byok-unselected'
  | 'plan-fit-model-availability-only';

export interface PortfolioCoverage {
  exactModelCoverageByCostShare: number;
  familyCoverageByCostShare: number;
  tierCoverageByCostShare: number;
  portfolioCoverageByCostShare: number;
}

export type RecommendationLabel =
  | 'Comparable'
  | 'Comparable and cheaper'
  | 'Current-like'
  | 'Cost-only cheaper'
  | 'Cheaper with downgrade risk'
  | 'Near current'
  | 'Not cheaper'
  | 'Plan fit only'
  | 'Select provider first'
  | 'Select model portfolio first'
  | 'Not comparable';

export interface CandidatePortfolioMapping {
  baselineModelId: string;
  candidateModelId?: string;
  baselineCostShare: number;
  equivalence: EquivalenceKind;
  equivalenceConfidence: EstimateConfidence;
  reason: string;
}

export interface CandidatePortfolio {
  productId: string;
  provider: string;
  product: string;
  plan?: string;
  comparisonGroup:
    | 'Comparable portfolios'
    | 'Cheaper but not equivalent'
    | 'Plan / subscription products'
    | 'BYOK / wrapper tools'
    | 'Router / model selection required';
  portfolioKind: PortfolioKind;
  resolution: PortfolioResolution;
  mappings: CandidatePortfolioMapping[];
  exactModelCoverageByCostShare: number;
  familyCoverageByCostShare: number;
  tierCoverageByCostShare: number;
  substitutionCoverageByCostShare: number;
  portfolioCoverageByCostShare: number;
  fitScorePct: number;
  capabilityRisk: 'low' | 'medium' | 'high' | 'unknown';
  pricingConfidence: EstimateConfidence;
  equivalenceConfidence: EstimateConfidence;
  recommendationConfidence: EstimateConfidence;
  estimateKind: CandidateEstimateKind;
  modelAvailability?: 'high' | 'medium' | 'low' | 'unknown';
  planAdequacy?: 'not-evaluated';
  monthlyUsd?: {
    min: number;
    max: number;
  };
  savingsUsd?: number;
  label: RecommendationLabel;
  hideSavings: boolean;
  showSavingsAsSecondary: boolean;
  notes: string[];
}

export interface WorkloadFingerprint {
  baselineMonthlyUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  inputOutputRatio: number;
  dominantProviderFamily: ModelFamily;
  dominantModelId: string;
  dominantTier: Tier;
  powerfulCostSharePct: number;
  interpretation: string;
}

export interface TierWeightedBaselineRow {
  tier: Tier;
  inputTokens: number;
  outputTokens: number;
  monthlyUsd: number;
  costSharePct: number;
  tokenSharePct: number;
}

export interface BaselineModelCostChartDatum {
  modelId: string;
  provider: string;
  family: ModelFamily;
  tier: Tier;
  monthlyUsd: number;
  costSharePct: number;
  inputTokens: number;
  outputTokens: number;
}

export interface BaselineTierShareChartDatum {
  tier: Tier;
  monthlyUsd: number;
  costSharePct: number;
}

export interface ProviderFitMatrixDatum {
  productId: string;
  provider: string;
  product: string;
  label: RecommendationLabel;
  capabilityRisk: CandidatePortfolio['capabilityRisk'];
  savingsUsd: number;
  fitScorePct: number;
  substitutionCoverageByCostShare: number;
  familyCoverageByCostShare: number;
  tierCoverageByCostShare: number;
}

export interface ReplacementCoverageChartDatum {
  productId: string;
  provider: string;
  product: string;
  exactModelCoverageByCostShare: number;
  familyCoverageByCostShare: number;
  tierCoverageByCostShare: number;
  substitutionCoverageByCostShare: number;
}

export interface ProviderComparisonCharts {
  baselineModelCost: BaselineModelCostChartDatum[];
  baselineTierShare: BaselineTierShareChartDatum[];
  fitMatrix: ProviderFitMatrixDatum[];
  replacementCoverage: ReplacementCoverageChartDatum[];
  hiddenOrNotComparable: CandidatePortfolio[];
}

export interface ProviderComparisonGroups {
  comparable: CandidatePortfolio[];
  cheaperRisky: CandidatePortfolio[];
  planFit: CandidatePortfolio[];
  byok: CandidatePortfolio[];
  routerRequired: CandidatePortfolio[];
}

export interface ProviderDecisionSurface {
  fingerprint: WorkloadFingerprint;
  tierBaseline: TierWeightedBaselineRow[];
  portfolios: CandidatePortfolio[];
  groups: ProviderComparisonGroups;
  charts: ProviderComparisonCharts;
  summaryText: string;
}
