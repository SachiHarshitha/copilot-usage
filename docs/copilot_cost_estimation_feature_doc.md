# Feature Specification: Copilot Cost Estimation Dashboard Page

## 1. Feature Name

**Copilot Cost Estimation**  
Alternative UI title: **AI Credits Preview**  
Internal feature key: `copilotCostEstimator`

## 2. Feature Summary

Add a dedicated **Copilot Cost Estimation** page to the existing dashboard area of the VS Code extension.

The user will access the page by clicking a new button from the dashboard. The page estimates how the user’s observed GitHub Copilot usage could map to GitHub’s new AI Credits usage-based billing model.

The feature should help users answer:

- What is my estimated monthly Copilot usage?
- How many AI Credits could that usage represent?
- Does my usage fit within my selected Copilot plan?
- How much extra could I pay if my usage exceeds the included allowance?
- How does the estimate change if I use a different model?
- How does my recent usage compare with my longer-term average?

The feature must be clearly labeled as an **estimate only** and must not present itself as an exact GitHub billing calculation.

---

## 3. Background

GitHub Copilot is moving from request-based billing to usage-based billing from **June 1, 2026**.

Under the new model, many Copilot features consume **GitHub AI Credits**. Usage depends on:

- model used
- input tokens
- output tokens
- cached input tokens
- cache write tokens, where applicable

GitHub defines:

```text
1 GitHub AI Credit = $0.01 USD
```

Code completions and next edit suggestions are not billed in AI Credits and remain unlimited for paid Copilot plans. The metered usage mainly affects model-powered interactions such as Copilot Chat, Copilot CLI, Copilot cloud agent, Copilot Spaces, Spark, and third-party coding agents.

This extension already tracks Copilot usage and can calculate average usage across time ranges. The new feature should use that existing usage data to provide a simple, understandable cost-impact view.

---

## 4. Product Goal

The goal is not to build a replacement for GitHub Billing.

The goal is to give VS Code users a practical visibility tool:

> “Based on my local Copilot usage pattern, what could the new AI Credits model mean for me?”

The feature should make GitHub Copilot usage understandable before users are surprised by overages or budget limits.

---

## 5. Target Users

### Primary users

- VS Code users with GitHub Copilot Pro or Pro+
- Heavy Copilot Chat users
- Developers using premium models such as Claude Sonnet, Claude Opus, GPT-Codex, Gemini, etc.
- Developers experimenting with agentic workflows
- Users who want to understand their usage trend before usage-based billing starts

### Secondary users

- Developers using Copilot Business or Enterprise but wanting a personal usage equivalent
- Engineering managers checking whether certain usage patterns could be expensive
- Extension users preparing LinkedIn/blog content or internal visibility reports

---

## 6. Non-Goals

This feature should **not**:

- claim to calculate the exact GitHub bill
- replace GitHub Billing or GitHub usage reports
- automatically purchase or configure budgets
- read private GitHub billing data unless explicitly implemented later
- make financial guarantees
- imply that local estimates and GitHub official billing will always match
- include unrelated AI providers outside Copilot pricing unless added later as a separate comparison mode

---

## 7. Dashboard Integration

### 7.1 New Dashboard Button

Add a new button/card to the existing dashboard.

Suggested label:

```text
Copilot Cost Estimation
```

Alternative label:

```text
AI Credits Preview
```

Suggested subtitle:

```text
Estimate your monthly AI Credits usage based on your Copilot activity.
```

Suggested icon ideas:

- calculator icon
- credit/coin icon
- trend/graph icon
- usage meter icon

### 7.2 Button Behavior

When the user clicks the button, open the new page inside the dashboard/webview area.

Expected command:

```text
Open Copilot Cost Estimation
```

Suggested VS Code command ID:

```ts
copilotUsage.openCostEstimation
```

If the extension already uses routing:

```ts
/dashboard/cost-estimation
```

or:

```ts
/views/copilot-cost-estimation
```

---

## 8. Page Title and Copy

### 8.1 Page Title

```text
Copilot Cost Estimation
```

### 8.2 Page Subtitle

```text
Preview how your Copilot usage could map to GitHub AI Credits.
```

### 8.3 Preview Badge

Add a small badge near the title:

```text
Preview
```

or:

```text
Estimate only
```

### 8.4 Top Disclaimer

Show a compact disclaimer at the top of the page:

```text
This is an estimate based on locally observed usage and GitHub’s published pricing model. Final billing depends on GitHub’s official usage records, model routing, caching behavior, included allowances, budgets, and current pricing.
```

### 8.5 Bottom Disclaimer

Show a stronger disclaimer at the bottom:

```text
Estimate only. This extension does not replace GitHub Billing. Actual charges may differ because GitHub may count tokens, cache behavior, model routing, code review usage, agentic infrastructure, and plan-specific allowances differently.
```

---

## 9. User Flow

### 9.1 Main Flow

1. User opens the extension dashboard.
2. User clicks **Copilot Cost Estimation**.
3. The new page opens.
4. User selects:
   - usage range
   - current Copilot plan
   - payment/billing model
   - optional extra budget
   - optional model assumption
5. Page calculates:
   - monthly token estimate
   - estimated cost per selected model
   - estimated AI Credits
   - plan fit
   - estimated overage
   - estimated extra cost
6. User can compare models and understand cost sensitivity.

### 9.2 First-Time User Flow

If the user has not selected plan settings before:

1. Show setup card at top:
   - “Select your Copilot setup”
2. Default to:
   - Plan: `Copilot Pro+` only if the extension can detect it; otherwise `Not selected`
   - Billing model: `Monthly individual subscription`
   - Extra budget: `$0`
3. Save the selected setup in extension state/global state.

### 9.3 Returning User Flow

If the user has already selected a plan:

1. Load previous plan settings.
2. Auto-calculate with default usage range, preferably `Last 30 days`.
3. Allow user to change settings anytime.

---

## 10. Usage Range Selection

The page should include a usage range selector.

Required options:

- Last 7 days
- Last 30 days
- Last 3 months
- All time

Optional if supported by existing code:

- Custom date range

### 10.1 Default Range

Recommended default:

```text
Last 30 days
```

Reason: This is easiest for users to understand as an approximate monthly view.

### 10.2 Monthly Normalization

For non-monthly ranges, normalize usage into an estimated monthly value.

Example:

```ts
monthlyInputTokens = inputTokensInRange / daysInRange * 30
monthlyOutputTokens = outputTokensInRange / daysInRange * 30
```

Use `30` as the standard estimation month.

Keep this configurable:

```ts
ESTIMATION_MONTH_DAYS = 30
```

### 10.3 Show Raw and Normalized Values

For clarity, show both:

- tokens observed in selected range
- normalized monthly estimate

Example:

```text
Selected range: Last 7 days
Observed input tokens: 1.8M
Estimated monthly input tokens: 7.7M
```

---

## 11. Copilot Setup Selection

Add a top section called:

```text
Your Copilot Setup
```

### 11.1 Plan Selector

Supported values:

```ts
type CopilotPlan =
  | 'free'
  | 'pro'
  | 'pro_plus'
  | 'business'
  | 'enterprise'
  | 'unknown';
```

UI labels:

- Copilot Free
- Copilot Pro
- Copilot Pro+
- Copilot Business
- Copilot Enterprise
- Not sure

### 11.2 Billing Model Selector

Supported values:

```ts
type CopilotBillingModel =
  | 'individual_monthly'
  | 'individual_annual'
  | 'mobile_ios_android'
  | 'organization_managed'
  | 'unknown';
```

UI labels:

- Monthly individual subscription
- Annual individual subscription
- Paid through GitHub Mobile on iOS/Android
- Organization/company managed
- Not sure

### 11.3 Extra Budget Selector

Supported values:

- $0
- $10
- $25
- $50
- Custom

Store internally as USD:

```ts
extraBudgetUsd: number
```

Convert to AI Credits:

```ts
extraBudgetCredits = extraBudgetUsd * 100
```

---

## 12. Plan Allowances

Create a configurable plan allowance table.

```ts
export const COPILOT_PLAN_ALLOWANCES = {
  pro: {
    displayName: 'Copilot Pro',
    includedCreditsPerMonth: 1000,
    includedUsdValue: 10,
    allowanceType: 'individual'
  },
  pro_plus: {
    displayName: 'Copilot Pro+',
    includedCreditsPerMonth: 3900,
    includedUsdValue: 39,
    allowanceType: 'individual'
  },
  business: {
    displayName: 'Copilot Business',
    includedCreditsPerUserPerMonth: 1900,
    allowanceType: 'pooled_org'
  },
  enterprise: {
    displayName: 'Copilot Enterprise',
    includedCreditsPerUserPerMonth: 3900,
    allowanceType: 'pooled_org'
  },
  free: {
    displayName: 'Copilot Free',
    includedCreditsPerMonth: null,
    allowanceType: 'limited_or_unknown'
  }
} as const;
```

### 12.1 Business and Enterprise Handling

For Business and Enterprise, do not present the estimate as a final personal bill.

Show:

```text
Your usage may draw from a shared organization or enterprise AI Credits pool. This page shows your personal usage equivalent, not your organization’s final bill.
```

### 12.2 Free Plan Handling

For Free plan, show usage estimates but avoid definitive overage calculations unless GitHub documents a clear AI Credits allowance.

Show:

```text
Copilot Free has limited usage. This page can estimate token-based value, but may not reflect Free-plan limits exactly.
```

---

## 13. Pricing Configuration

Pricing must be stored in a configurable object, not hardcoded directly in UI components.

Suggested file:

```text
src/pricing/copilotPricing.ts
```

### 13.1 Pricing Types

```ts
export type ModelProvider = 'OpenAI' | 'Anthropic' | 'Google' | 'xAI' | 'GitHub';

export type ModelCategory = 'Lightweight' | 'Versatile' | 'Powerful' | 'Preview' | 'Unknown';

export interface ModelPricing {
  id: string;
  displayName: string;
  provider: ModelProvider;
  category: ModelCategory;
  releaseStatus?: 'GA' | 'Public preview' | 'Unknown';
  inputPerMillion: number;
  cachedInputPerMillion?: number;
  cacheWritePerMillion?: number;
  outputPerMillion: number;
  notes?: string[];
}
```

### 13.2 Initial Pricing Table

Include these models in the first implementation:

```ts
export const COPILOT_MODEL_PRICING: Record<string, ModelPricing> = {
  'gpt-5.3-codex': {
    id: 'gpt-5.3-codex',
    displayName: 'GPT-5.3-Codex',
    provider: 'OpenAI',
    category: 'Powerful',
    releaseStatus: 'GA',
    inputPerMillion: 1.75,
    cachedInputPerMillion: 0.175,
    outputPerMillion: 14,
    notes: ['Good comparison baseline for coding-agent usage.']
  },

  'gpt-5.4': {
    id: 'gpt-5.4',
    displayName: 'GPT-5.4',
    provider: 'OpenAI',
    category: 'Versatile',
    releaseStatus: 'GA',
    inputPerMillion: 2.50,
    cachedInputPerMillion: 0.25,
    outputPerMillion: 15,
    notes: ['Pricing applies to prompts within GitHub’s documented context threshold.']
  },

  'gpt-5.4-mini': {
    id: 'gpt-5.4-mini',
    displayName: 'GPT-5.4 mini',
    provider: 'OpenAI',
    category: 'Lightweight',
    releaseStatus: 'GA',
    inputPerMillion: 0.75,
    cachedInputPerMillion: 0.075,
    outputPerMillion: 4.50,
    notes: ['Lower-cost model for frequent usage.']
  },

  'claude-sonnet-4.6': {
    id: 'claude-sonnet-4.6',
    displayName: 'Claude Sonnet 4.6',
    provider: 'Anthropic',
    category: 'Versatile',
    releaseStatus: 'GA',
    inputPerMillion: 3,
    cachedInputPerMillion: 0.30,
    cacheWritePerMillion: 3.75,
    outputPerMillion: 15,
    notes: ['Versatile model; Anthropic models include cache write cost.']
  },

  'claude-opus-4.7': {
    id: 'claude-opus-4.7',
    displayName: 'Claude Opus 4.7',
    provider: 'Anthropic',
    category: 'Powerful',
    releaseStatus: 'GA',
    inputPerMillion: 5,
    cachedInputPerMillion: 0.50,
    cacheWritePerMillion: 6.25,
    outputPerMillion: 25,
    notes: ['Higher-cost model for deeper reasoning.']
  },

  'claude-opus-4.6-fast': {
    id: 'claude-opus-4.6-fast',
    displayName: 'Claude Opus 4.6 Fast Mode',
    provider: 'Anthropic',
    category: 'Powerful',
    releaseStatus: 'Public preview',
    inputPerMillion: 30,
    cachedInputPerMillion: 3,
    cacheWritePerMillion: 37.50,
    outputPerMillion: 150,
    notes: ['Fast mode is significantly more expensive than standard Opus.']
  },

  'gemini-3.1-pro': {
    id: 'gemini-3.1-pro',
    displayName: 'Gemini 3.1 Pro',
    provider: 'Google',
    category: 'Powerful',
    releaseStatus: 'Public preview',
    inputPerMillion: 2,
    cachedInputPerMillion: 0.20,
    outputPerMillion: 12,
    notes: ['Pricing may depend on documented context threshold.']
  },

  'grok-code-fast-1': {
    id: 'grok-code-fast-1',
    displayName: 'Grok Code Fast 1',
    provider: 'xAI',
    category: 'Lightweight',
    releaseStatus: 'GA',
    inputPerMillion: 0.20,
    cachedInputPerMillion: 0.02,
    outputPerMillion: 1.50,
    notes: ['Low-cost coding model.']
  }
};
```

### 13.3 Pricing Metadata

Add pricing metadata:

```ts
export const COPILOT_PRICING_METADATA = {
  sourceName: 'GitHub Copilot Models and Pricing',
  effectiveDate: '2026-06-01',
  lastVerified: '2026-04-27',
  currency: 'USD',
  perTokenUnit: 1_000_000,
  aiCreditUsdValue: 0.01,
  status: 'preview'
} as const;
```

---

## 14. Cost Calculation Logic

Create a separate calculation module.

Suggested file:

```text
src/pricing/costEstimator.ts
```

### 14.1 Usage Estimate Type

```ts
export interface UsageEstimate {
  rangeLabel: string;
  rangeStart: string;
  rangeEnd: string;
  daysInRange: number;

  observedInputTokens: number;
  observedOutputTokens: number;
  observedCachedInputTokens?: number;
  observedCacheWriteTokens?: number;

  monthlyInputTokens: number;
  monthlyOutputTokens: number;
  monthlyCachedInputTokens?: number;
  monthlyCacheWriteTokens?: number;

  dataCompleteness: 'complete' | 'partial' | 'missing_cache_data';
}
```

### 14.2 Cost Estimate Type

```ts
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
```

### 14.3 Formula

```ts
export function estimateModelCost(
  usage: UsageEstimate,
  pricing: ModelPricing
): CostEstimate {
  const inputCostUsd =
    (usage.monthlyInputTokens / 1_000_000) * pricing.inputPerMillion;

  const outputCostUsd =
    (usage.monthlyOutputTokens / 1_000_000) * pricing.outputPerMillion;

  const cachedInputCostUsd =
    ((usage.monthlyCachedInputTokens ?? 0) / 1_000_000) *
    (pricing.cachedInputPerMillion ?? 0);

  const cacheWriteCostUsd =
    ((usage.monthlyCacheWriteTokens ?? 0) / 1_000_000) *
    (pricing.cacheWritePerMillion ?? 0);

  const estimatedMonthlyUsd =
    inputCostUsd + outputCostUsd + cachedInputCostUsd + cacheWriteCostUsd;

  return {
    modelId: pricing.id,
    modelDisplayName: pricing.displayName,
    estimatedMonthlyUsd,
    estimatedMonthlyCredits: Math.ceil(estimatedMonthlyUsd * 100),
    inputCostUsd,
    outputCostUsd,
    cachedInputCostUsd,
    cacheWriteCostUsd,
    hasCacheInputEstimate: usage.monthlyCachedInputTokens !== undefined,
    hasCacheWriteEstimate: usage.monthlyCacheWriteTokens !== undefined
  };
}
```

### 14.4 Rounding Rules

Recommended display rounding:

- Tokens below 1,000: exact integer
- Tokens >= 1,000: compact format, e.g. `12.4K`, `3.2M`
- USD: 2 decimals
- AI Credits: integer, rounded up
- Percentages: 0 or 1 decimal place

---

## 15. Personalized Plan Impact Logic

Create function:

```ts
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

  warnings: string[];
}
```

### 15.1 Individual Monthly Logic

For Pro / Pro+ monthly:

```ts
includedCredits = plan.includedCreditsPerMonth;
overageCredits = Math.max(0, estimatedCredits - includedCredits);
estimatedExtraUsd = overageCredits * 0.01;
isWithinIncludedAllowance = estimatedCredits <= includedCredits;
isCoveredByExtraBudget = overageCredits <= extraBudgetCredits;
```

### 15.2 Individual Annual Logic

For Pro / Pro+ annual:

Calculate the same token-based AI Credits equivalent, but show a transition warning:

```text
Annual Copilot Pro and Pro+ plans have additional model multiplier changes during the transition. This estimate shows token-based AI Credit equivalent only. Check GitHub Billing for exact annual-plan behavior.
```

Do not attempt to combine old premium request multipliers with token-based pricing unless the extension also has reliable request-level and model-level data.

### 15.3 Mobile Subscription Logic

If billing model is `mobile_ios_android`, show:

```text
GitHub says additional AI credits are not available for users who subscribe, or have subscribed, through GitHub Mobile on iOS or Android.
```

Still calculate estimated usage and plan fit, but warn that the user may not be able to simply buy extra credits.

### 15.4 Organization-Managed Logic

If plan is Business or Enterprise, or billing model is organization-managed:

Show:

```text
Your usage may draw from a shared organization or enterprise AI Credits pool. This estimate shows your personal usage equivalent, not your organization’s final bill.
```

If the plan is Business:

```text
Reference allowance: 1,900 credits per assigned user per month, pooled at billing entity level.
```

If the plan is Enterprise:

```text
Reference allowance: 3,900 credits per assigned user per month, pooled at billing entity level.
```

---

## 16. UI Layout

### 16.1 Recommended Page Structure

```text
[Header]
Copilot Cost Estimation     [Preview]
Preview how your Copilot usage could map to GitHub AI Credits.

[Disclaimer banner]
Estimate only. Final billing may differ.

[Your Copilot Setup]
Plan selector | Billing model selector | Extra budget selector

[Usage Range]
Last 7 days | Last 30 days | Last 3 months | All time | Custom

[Personalized Plan Impact]
Estimated credits | Included credits | Overage | Extra cost | Budget status

[Monthly Usage Estimate]
Input tokens | Output tokens | Cached input | Cache write | Data completeness

[Model Comparison]
Table comparing estimated monthly cost and credits per model

[Trend Insight]
Recent usage compared with longer-term average

[Notes and Warnings]
Annual plan note, mobile billing note, organization pool note, cache data note

[Bottom Disclaimer]
```

---

## 17. Key UI Components

### 17.1 Setup Card

Fields:

- Plan
- Billing model
- Extra budget
- Save automatically on change

Example:

```text
Your Copilot Setup
Plan: Copilot Pro+
Billing: Monthly individual subscription
Extra budget: $25
```

### 17.2 Personalized Plan Impact Card

This is the most important card.

Example:

```text
Personalized Plan Impact

Selected setup: Copilot Pro+ · Monthly
Selected model: Claude Opus 4.7
Estimated monthly usage: 5,750 AI Credits
Included in plan: 3,900 AI Credits
Estimated overage: 1,850 AI Credits
Estimated extra cost: $18.50
Extra budget: $25.00
Status: Covered by configured budget
```

Possible status labels:

- `Within included allowance`
- `Over allowance, covered by budget`
- `Over allowance, budget may not cover it`
- `Organization pooled allowance`
- `Estimate only`

### 17.3 Monthly Usage Estimate Cards

Cards:

- Input tokens
- Output tokens
- Cached input tokens
- Cache write tokens

If cache data is missing:

```text
Cache data not available
```

or:

```text
Not tracked by this extension yet
```

### 17.4 Model Comparison Table

Columns:

- Model
- Provider
- Category
- Estimated monthly cost
- Estimated AI Credits
- Fits Pro?
- Fits Pro+?
- Extra beyond selected plan
- Notes

Example rows:

```text
GPT-5.3-Codex | OpenAI | Powerful | $21.70 | 2,170 | No | Yes | $0.00 | Good coding baseline
Claude Sonnet 4.6 | Anthropic | Versatile | $34.50 | 3,450 | No | Yes | $0.00 | Balanced reasoning
Claude Opus 4.7 | Anthropic | Powerful | $57.50 | 5,750 | No | No | $18.50 | Higher cost, deeper reasoning
```

### 17.5 Trend Insight Card

If data exists:

```text
Your last 30 days are 42% higher than your 3-month average.
```

If lower:

```text
Your last 30 days are 18% lower than your 3-month average.
```

If not enough data:

```text
Not enough historical data to calculate trend.
```

### 17.6 Warnings Card

Warnings should be contextual.

Possible warnings:

- Annual plan transition warning
- Mobile subscription warning
- Organization pooled allowance warning
- Cache data missing warning
- Code review pricing warning
- Pricing table may change warning

---

## 18. Data Requirements

The feature needs access to aggregated usage data.

Minimum required:

```ts
inputTokens: number;
outputTokens: number;
timestamp: string;
```

Optional:

```ts
modelId?: string;
cachedInputTokens?: number;
cacheWriteTokens?: number;
featureType?: 'chat' | 'agent' | 'cli' | 'code_review' | 'completion' | 'unknown';
```

### 18.1 Important Exclusion

If the extension tracks code completions separately, do not include code completions in AI Credits calculations unless those completions actually represent billable model interactions.

Show:

```text
Code completions and next edit suggestions are excluded from this AI Credits estimate.
```

### 18.2 Unknown Model Handling

If actual model ID is unknown, use selected model assumption.

Label clearly:

```text
Estimated using selected model: Claude Opus 4.7
```

If actual model data exists, optionally support:

```text
Use actual model mix
```

as a future enhancement.

---

## 19. Settings Persistence

Persist user choices:

```ts
interface CostEstimatorSettings {
  selectedPlan: CopilotPlan;
  billingModel: CopilotBillingModel;
  extraBudgetUsd: number;
  selectedModelId: string;
  defaultRange: 'last_7_days' | 'last_30_days' | 'last_3_months' | 'all_time' | 'custom';
}
```

Storage options:

- VS Code global state for user-level preferences
- workspace state only if the extension already treats usage per workspace

Recommended:

- Plan and billing model: global state
- Date range: last used value
- Selected model: last used value

---

## 20. Feature Flags

Add feature flags:

```ts
export const FEATURE_FLAGS = {
  enableCopilotCostEstimator: true,
  costEstimatorStatus: 'preview',
  enableCostEstimatorCustomRange: false,
  enableActualModelMixEstimation: false,
  enableCacheTokenBreakdown: true
} as const;
```

This allows the page to be hidden, renamed, or simplified later.

---

## 21. Error and Empty States

### 21.1 No Usage Data

Show:

```text
No Copilot usage data found for this range.
Try selecting a longer range or continue using Copilot so the extension can collect data.
```

### 21.2 Partial Data

Show:

```text
This estimate is based on partial usage data. Some token categories, such as cached input or cache write tokens, may not be available.
```

### 21.3 Invalid Custom Range

Show:

```text
Please select a valid start and end date.
```

### 21.4 Pricing Missing

Show:

```text
Pricing is not available for the selected model.
```

### 21.5 Plan Unknown

Show:

```text
Select your Copilot plan to see personalized plan impact.
```

---

## 22. Accessibility Requirements

- Keyboard navigable controls
- Clear focus states
- No information conveyed by color alone
- Sufficient contrast in light and dark themes
- Tables should have clear headers
- Use ARIA labels where needed in webview UI

---

## 23. Styling Requirements

Use VS Code theme variables where possible:

```css
color: var(--vscode-foreground);
background: var(--vscode-editor-background);
border-color: var(--vscode-panel-border);
```

Recommended visual style:

- clean dashboard cards
- compact comparison table
- subtle warning banners
- no aggressive red unless actual overage is shown
- avoid making the page feel like a scary financial billing page

---

## 24. Privacy Requirements

The feature should work locally with already collected extension data.

Do not send usage data externally.

If export/share is added later, require explicit user action.

Suggested privacy note:

```text
This estimate is calculated locally from usage data already available to the extension.
```

---

## 25. Suggested File Structure

Adjust to the existing project structure, but use this as the target separation:

```text
src/
  pricing/
    copilotPricing.ts
    costEstimator.ts
    planImpactEstimator.ts

  types/
    pricing.ts
    costEstimator.ts

  views/
    dashboard/
      DashboardView.ts
      DashboardRouter.ts

    copilotCostEstimation/
      CopilotCostEstimationPage.ts
      CopilotCostEstimationPanel.ts
      CopilotCostEstimation.css
      components/
        SetupCard.ts
        UsageRangeSelector.ts
        PlanImpactCard.ts
        MonthlyUsageCards.ts
        ModelComparisonTable.ts
        TrendInsightCard.ts
        EstimatorWarnings.ts

  commands/
    openCopilotCostEstimation.ts
```

---

## 26. Implementation Steps

### Phase 1: Minimal Useful Version

1. Add dashboard button.
2. Add command to open the page.
3. Add route/page for Copilot Cost Estimation.
4. Add pricing config.
5. Add plan allowance config.
6. Add cost calculation logic.
7. Add usage range selector.
8. Add selected plan and billing model selector.
9. Add personalized plan impact card.
10. Add model comparison table.
11. Add disclaimer and warnings.
12. Add basic tests for cost calculation.

### Phase 2: Better Insight

1. Add trend comparison.
2. Add actual model mix if tracked.
3. Add export to Markdown/CSV.
4. Add “what if I switch model?” scenario cards.
5. Add monthly average chart.

### Phase 3: Advanced Features

1. Sync pricing config from remote source or updateable JSON.
2. Add GitHub billing report import.
3. Add organization pool simulation.
4. Add team-level aggregate view.
5. Add alert thresholds.

---

## 27. Acceptance Criteria

### Functional

- User can open the new page from a dashboard button.
- User can select usage range.
- User can select Copilot plan.
- User can select billing/payment model.
- User can enter or select extra budget.
- Page shows normalized monthly token estimate.
- Page shows estimated USD cost.
- Page shows estimated AI Credits.
- Page shows whether usage fits selected plan.
- Page shows estimated overage and extra cost.
- Page compares at least 5 models.
- Page handles missing cache data gracefully.
- Page excludes code completions from AI Credits estimate if completion data is separately tracked.
- Page displays clear estimate-only disclaimer.

### Technical

- Pricing is configurable.
- Plan allowances are configurable.
- Calculation logic is separate from UI.
- TypeScript interfaces are defined.
- Existing aggregation logic is reused.
- Feature can be disabled through a flag.
- Unit tests cover core formulas.

### UX

- Page works in light and dark VS Code themes.
- Main result is understandable within 10 seconds.
- Warnings are contextual and not noisy.
- User can understand that this is not exact billing.

---

## 28. Test Cases

### 28.1 Cost Calculation

Input:

```text
10M input tokens
300K output tokens
0 cached input tokens
0 cache write tokens
Model: Claude Opus 4.7
```

Expected:

```text
Input cost: $50.00
Output cost: $7.50
Total: $57.50
AI Credits: 5,750
```

### 28.2 Pro+ Plan Fit

Input:

```text
Estimated credits: 5,750
Plan: Copilot Pro+
Included credits: 3,900
```

Expected:

```text
Overage: 1,850 credits
Extra cost: $18.50
```

### 28.3 Extra Budget Fit

Input:

```text
Overage: 1,850 credits
Extra budget: $25
Extra budget credits: 2,500
```

Expected:

```text
Budget covers overage: true
```

### 28.4 Missing Cache Data

Input:

```text
cachedInputTokens undefined
cacheWriteTokens undefined
```

Expected:

```text
Calculation succeeds with cache costs as $0
UI shows cache data unavailable
```

### 28.5 Organization Plan

Input:

```text
Plan: Copilot Business
Estimated credits: 5,750
```

Expected:

```text
Show personal usage equivalent
Show pooled allowance warning
Do not show final personal bill
```

---

## 29. Suggested Copy

### Dashboard Button

```text
Copilot Cost Estimation
Estimate AI Credits impact from your usage.
```

### Main Page Header

```text
Copilot Cost Estimation
Preview how your Copilot usage could map to GitHub AI Credits.
```

### Plan Impact Card

```text
Based on your selected setup, your estimated monthly usage is above your included allowance.
```

or:

```text
Based on your selected setup, your estimated monthly usage fits within your included allowance.
```

### Cache Missing Note

```text
Cached token data is not available, so this estimate may differ from GitHub’s final calculation.
```

### Organization Note

```text
Business and Enterprise allowances are pooled at the billing entity level. This page shows your personal usage equivalent only.
```

---

## 30. Copilot Implementation Prompt

Use this prompt in Copilot Agent mode:

```text
I want to add a new “Copilot Cost Estimation” page to the existing dashboard of this VS Code extension.

Please inspect the project structure first and adapt to the existing architecture.

Goal:
Add a new dashboard button called “Copilot Cost Estimation”. When clicked, it should open a new page inside the dashboard/webview. The page estimates how the user’s tracked GitHub Copilot usage could map to GitHub AI Credits under GitHub’s usage-based billing model.

Important:
This is an estimate only. It must not claim to calculate exact GitHub billing.

Functional requirements:

1. Add dashboard button/card:
   Title: “Copilot Cost Estimation”
   Subtitle: “Estimate AI Credits impact from your usage.”

2. Add command:
   “Open Copilot Cost Estimation”
   Suggested command ID: copilotUsage.openCostEstimation

3. Add new page title:
   “Copilot Cost Estimation”
   Subtitle: “Preview how your Copilot usage could map to GitHub AI Credits.”
   Add a “Preview” or “Estimate only” badge.

4. Add top disclaimer:
   “This is an estimate based on locally observed usage and GitHub’s published pricing model. Final billing depends on GitHub’s official usage records, model routing, caching behavior, included allowances, budgets, and current pricing.”

5. Add “Your Copilot Setup” section with selectors:
   Plan:
   - Copilot Free
   - Copilot Pro
   - Copilot Pro+
   - Copilot Business
   - Copilot Enterprise
   - Not sure

   Billing model:
   - Monthly individual subscription
   - Annual individual subscription
   - Paid through GitHub Mobile on iOS/Android
   - Organization/company managed
   - Not sure

   Extra budget:
   - $0
   - $10
   - $25
   - $50
   - Custom

6. Add usage range selector:
   - Last 7 days
   - Last 30 days
   - Last 3 months
   - All time
   - Custom range only if the existing code already supports it

7. Use existing usage aggregation logic where possible.
   Show both observed usage in the selected range and normalized monthly estimate.
   Normalize monthly estimate using 30 days.

8. Exclude code completions and next edit suggestions from the AI Credits estimate if they are tracked separately, because these are not billed in AI Credits for paid plans.

9. Create configurable pricing file, for example:
   src/pricing/copilotPricing.ts

10. Create calculation modules:
   src/pricing/costEstimator.ts
   src/pricing/planImpactEstimator.ts

11. Add TypeScript interfaces for:
   - ModelPricing
   - UsageEstimate
   - CostEstimate
   - PlanAllowance
   - PlanImpactEstimate
   - CostEstimatorSettings

12. Add initial model pricing config:
   - GPT-5.3-Codex
   - GPT-5.4
   - GPT-5.4 mini
   - Claude Sonnet 4.6
   - Claude Opus 4.7
   - Claude Opus 4.6 Fast Mode
   - Gemini 3.1 Pro
   - Grok Code Fast 1

13. Pricing values should be configurable and not hardcoded in UI components.

14. Cost formula:
   estimatedCostUsd =
     inputTokens / 1_000_000 * inputPerMillion +
     outputTokens / 1_000_000 * outputPerMillion +
     cachedInputTokens / 1_000_000 * cachedInputPerMillion +
     cacheWriteTokens / 1_000_000 * cacheWritePerMillion

   Missing cachedInputTokens or cacheWriteTokens should be treated as 0, and the UI should show that cache data is unavailable.

15. AI Credits formula:
   estimatedCredits = Math.ceil(estimatedCostUsd * 100)

16. Plan allowances:
   Copilot Pro: 1,000 credits/month
   Copilot Pro+: 3,900 credits/month
   Copilot Business: 1,900 credits/user/month, pooled at billing entity level
   Copilot Enterprise: 3,900 credits/user/month, pooled at billing entity level

17. Add Personalized Plan Impact card showing:
   - selected plan
   - selected billing model
   - selected model assumption
   - estimated monthly AI Credits
   - included AI Credits, if applicable
   - estimated overage credits
   - estimated extra cost
   - whether selected extra budget covers the overage

18. Add model comparison table with columns:
   - Model
   - Provider
   - Category
   - Estimated monthly cost
   - Estimated AI Credits
   - Fits Pro?
   - Fits Pro+?
   - Extra beyond selected plan
   - Notes

19. Add contextual warnings:
   - Annual subscription warning
   - iOS/Android subscription warning
   - Organization pooled allowance warning
   - Missing cache data warning
   - Pricing may change warning

20. Add trend insight if existing historical data supports it:
   Compare last 30 days monthly estimate with last 3 months monthly average.
   If not enough data exists, hide this section or show a gentle empty state.

21. Persist user-selected settings using VS Code global state or the project’s existing settings mechanism:
   - selected plan
   - billing model
   - extra budget
   - selected model
   - default range

22. Add feature flag:
   enableCopilotCostEstimator: true
   costEstimatorStatus: 'preview'

23. UI requirements:
   - Use clean dashboard cards
   - Use VS Code theme variables
   - Support light and dark themes
   - Keep main result understandable within 10 seconds
   - Avoid making it feel like a scary billing page

24. Add unit tests for:
   - cost calculation
   - AI Credits conversion
   - Pro/Pro+ plan fit
   - extra budget coverage
   - missing cache token handling
   - organization-managed plan warning

Do not replace existing functionality. Keep the first implementation simple, modular, and reliable.
```

---

## 31. Future Enhancements

Potential future features:

- Export estimate as Markdown
- Export estimate as CSV
- Generate LinkedIn-ready usage snapshot
- Model mix analysis if actual model usage is tracked
- “What if I switch from Opus to Sonnet?” savings card
- Budget warning thresholds
- Monthly trend chart
- Workspace-level vs global usage split
- Organization/team mode
- GitHub billing report import
- Remote pricing config update

---

## 32. Final Product Positioning

This feature should be positioned as:

```text
A developer visibility tool for understanding Copilot usage under AI Credits.
```

Not:

```text
An exact billing calculator.
```

Best public wording:

```text
Understand your Copilot usage before usage-based billing surprises you.
```

Best in-app wording:

```text
Preview your estimated AI Credits impact based on your local usage pattern.
```

