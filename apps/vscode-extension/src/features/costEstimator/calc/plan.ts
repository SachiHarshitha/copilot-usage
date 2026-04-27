/** Compute personalized plan impact: allowance fit, overage, extra-budget coverage, warnings. */

import {
  CopilotBillingModel,
  CopilotPlan,
  CostEstimate,
  CostEstimatorSettings,
  PlanImpactEstimate,
  PlanImpactStatus,
} from '../types';
import { PLAN_ALLOWANCES } from '../pricing/plans';
import { PRICING_METADATA } from '../pricing/metadata';

export function computePlanImpact(
  cost: CostEstimate,
  settings: CostEstimatorSettings,
): PlanImpactEstimate {
  const allowance = PLAN_ALLOWANCES[settings.selectedPlan];
  const extraBudgetCredits = Math.max(0, Math.round(settings.extraBudgetUsd / PRICING_METADATA.aiCreditUsdValue));

  const warnings: string[] = [];
  let includedCredits: number | undefined;
  let overageCredits: number | undefined;
  let estimatedExtraUsd: number | undefined;
  let isWithinIncludedAllowance: boolean | undefined;
  let isCoveredByExtraBudget: boolean | undefined;
  let status: PlanImpactStatus = 'estimate_only';

  if (allowance.allowanceType === 'individual' && allowance.includedCreditsPerMonth !== undefined) {
    includedCredits = allowance.includedCreditsPerMonth;
    overageCredits = Math.max(0, cost.estimatedMonthlyCredits - includedCredits);
    estimatedExtraUsd = overageCredits * PRICING_METADATA.aiCreditUsdValue;
    isWithinIncludedAllowance = cost.estimatedMonthlyCredits <= includedCredits;
    isCoveredByExtraBudget = overageCredits <= extraBudgetCredits;

    if (isWithinIncludedAllowance) {
      status = 'within_allowance';
    } else if (isCoveredByExtraBudget) {
      status = 'over_allowance_within_budget';
    } else {
      status = 'over_allowance_exceeds_budget';
    }
  } else if (allowance.allowanceType === 'pooled_org') {
    includedCredits = allowance.includedCreditsPerUserPerMonth;
    status = 'pooled_org';
    warnings.push(orgPooledWarning(settings.selectedPlan));
  } else if (settings.selectedPlan === 'free') {
    warnings.push(
      'Copilot Free has limited usage. This page can estimate token-based value, but may not reflect Free-plan limits exactly.',
    );
  } else {
    warnings.push('Select your Copilot plan to see personalized plan impact.');
  }

  // Billing-model warnings (independent of allowance type)
  pushBillingWarnings(warnings, settings.billingModel);

  return {
    planId: settings.selectedPlan,
    billingModel: settings.billingModel,
    selectedModelId: settings.selectedModelId,
    estimatedCredits: cost.estimatedMonthlyCredits,
    includedCredits,
    extraBudgetCredits,
    overageCredits,
    estimatedExtraUsd,
    isWithinIncludedAllowance,
    isCoveredByExtraBudget,
    status,
    warnings,
  };
}

function orgPooledWarning(plan: CopilotPlan): string {
  if (plan === 'business') {
    return 'Copilot Business: 1,900 credits per assigned user per month, pooled at the billing entity level. This page shows your personal usage equivalent, not your organization\u2019s final bill.';
  }
  if (plan === 'enterprise') {
    return 'Copilot Enterprise: 3,900 credits per assigned user per month, pooled at the billing entity level. This page shows your personal usage equivalent, not your organization\u2019s final bill.';
  }
  return 'Your usage may draw from a shared organization or enterprise AI Credits pool.';
}

function pushBillingWarnings(warnings: string[], billing: CopilotBillingModel): void {
  if (billing === 'individual_annual') {
    warnings.push(
      'Annual Copilot Pro and Pro+ plans have additional model-multiplier behaviour during the transition. This estimate shows the token-based AI Credit equivalent only.',
    );
  }
  if (billing === 'mobile_ios_android') {
    warnings.push(
      'Additional AI Credits are not available for users who subscribe through GitHub Mobile on iOS or Android.',
    );
  }
  if (billing === 'organization_managed') {
    warnings.push(
      'Your subscription is managed by an organization. Final billing depends on your organization\u2019s pooled AI Credits.',
    );
  }
}
