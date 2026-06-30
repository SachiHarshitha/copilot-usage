/** Copilot plan allowances — mirrors spec §12. */

import { CopilotPlan, PlanAllowance } from '../types';

export const PLAN_ALLOWANCES: Record<CopilotPlan, PlanAllowance> = {
  pro: {
    displayName: 'Copilot Pro',
    baseCreditsPerMonth: 1000,
    flexCreditsPerMonth: 500,
    includedCreditsPerMonth: 1500,
    includedUsdValue: 10,
    allowanceType: 'individual',
  },
  pro_plus: {
    displayName: 'Copilot Pro+',
    baseCreditsPerMonth: 3900,
    flexCreditsPerMonth: 3100,
    includedCreditsPerMonth: 7000,
    includedUsdValue: 39,
    allowanceType: 'individual',
  },
  max: {
    displayName: 'Copilot Max',
    baseCreditsPerMonth: 10000,
    flexCreditsPerMonth: 10000,
    includedCreditsPerMonth: 20000,
    includedUsdValue: 100,
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
