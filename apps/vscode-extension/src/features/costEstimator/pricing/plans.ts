/** Copilot plan allowances — mirrors spec §12. */

import { CopilotPlan, PlanAllowance } from '../types';

export const PLAN_ALLOWANCES: Record<CopilotPlan, PlanAllowance> = {
  pro: {
    displayName: 'Copilot Pro',
    includedCreditsPerMonth: 1000,
    includedUsdValue: 10,
    allowanceType: 'individual',
  },
  pro_plus: {
    displayName: 'Copilot Pro+',
    includedCreditsPerMonth: 3900,
    includedUsdValue: 39,
    allowanceType: 'individual',
  },
  business: {
    displayName: 'Copilot Business',
    includedCreditsPerUserPerMonth: 1900,
    allowanceType: 'pooled_org',
  },
  enterprise: {
    displayName: 'Copilot Enterprise',
    includedCreditsPerUserPerMonth: 3900,
    allowanceType: 'pooled_org',
  },
  free: {
    displayName: 'Copilot Free',
    allowanceType: 'limited_or_unknown',
  },
  unknown: {
    displayName: 'Not selected',
    allowanceType: 'limited_or_unknown',
  },
};
