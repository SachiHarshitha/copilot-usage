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
