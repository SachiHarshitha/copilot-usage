.\dis # PromptStreak Feature Doc — Local Agent Compare / Switch Calculator

**Status:** Draft v1  
**Target products:** PromptStreak VS Code extension + PromptStreak CLI  
**Cloud dependency:** None for user usage data  
**Prepared:** 2026-05-06  
**Primary goal:** Help developers compare coding-agent provider fit and estimated cost using their own local AI coding usage, without uploading prompts, code, repository paths, API keys, or raw usage history.

---

## 1. Feature summary

PromptStreak should add a local-only feature called **Agent Compare** or **Agent Switch Calculator**.

The feature analyzes the user's existing local PromptStreak usage history and compares that workload against the billing models of major coding-agent providers, including:

- GitHub Copilot
- Cursor
- Claude Code / Anthropic API
- OpenAI Codex / OpenAI API
- Gemini Code Assist / Gemini API / Gemini CLI
- Google Antigravity
- Windsurf
- JetBrains AI / Junie
- OpenCode
- Cline
- Roo Code
- Continue
- Kilo Code
- OpenRouter and other BYOK routers

The feature must **not** claim exact cross-provider bills unless the selected target is a direct token-metered API-key/BYOK provider with known official pricing.

Correct product promise:

> Based on your local PromptStreak usage history and public provider billing rules, PromptStreak estimates how your coding-agent workload may fit across other tools. No prompts, source code, repository paths, API keys, or usage history leave your machine.

Incorrect product promise:

> PromptStreak knows exactly what every coding-agent provider would charge you.

---

## 2. Why this feature matters

Users are asking whether they should stay with GitHub Copilot or switch to another coding-agent provider. The decision is difficult because providers use different billing models:

- monthly subscriptions
- monthly/daily quotas
- included model usage pools
- request credits
- AI credits
- input/output/cached-token billing
- bring-your-own-key billing
- account-login billing
- enterprise contracts
- local/offline model usage

PromptStreak can become the neutral local transparency layer that translates a user's actual usage pattern into an understandable provider comparison.

This fits PromptStreak's long-term positioning:

> AI usage transparency for developers, teams, and repositories.

---

## 3. Non-goals

This feature must not:

1. Ask users to paste API keys.
2. Store API keys.
3. Upload local usage history to PromptStreak cloud.
4. Upload prompts, completions, repository paths, file names, source code, or terminal content.
5. Guarantee exact provider bills for subscription/quota tools.
6. Rank provider quality as objective truth.
7. Recommend switching purely based on cost.
8. Scrape private provider account dashboards without explicit user action.
9. Depend on cloud availability to generate a comparison report.

---

## 4. User stories

### 4.1 Individual Copilot user

As a developer using GitHub Copilot, I want to know whether my last 30 days of usage would likely fit better under Cursor, Claude Code, Gemini Code Assist, Codex, Windsurf, JetBrains AI, or OpenCode, so I can decide whether to stay or trial another tool.

### 4.2 BYOK user

As a developer using a BYOK agent such as Cline, Roo Code, Continue, Kilo Code, or OpenCode, I want PromptStreak to estimate my cost using the underlying provider's official API rates.

### 4.3 Privacy-sensitive user

As a developer working on private or client projects, I want all comparison logic to run locally and never upload usage or repository details.

### 4.4 Power user

As a heavy coding-agent user, I want the comparison to show conservative, realistic, and heavy-agent scenarios instead of one fake exact number.

### 4.5 Enterprise user

As a developer on a company plan, I want to import a custom rate card JSON file provided by my organization and compare my local workload against that internal plan.

---

## 5. UX overview

### 5.1 VS Code extension entry point

Add a new section in the PromptStreak extension:

```text
PromptStreak
  Usage
  Repositories
  Badges
  Agent Compare
```

### 5.2 CLI entry point

Add commands:

```bash
promptstreak compare-agents --last 30d
promptstreak compare-agents --last 90d --targets copilot,cursor,claude-code,opencode
promptstreak compare-agents --provider opencode --mode byok --model anthropic/claude-sonnet-4-5
promptstreak compare-agents --export markdown
promptstreak compare-agents --offline
promptstreak ratecards status
promptstreak ratecards update
promptstreak ratecards import ./company-rate-card.json
promptstreak ratecards validate ./company-rate-card.json
```

### 5.3 Report output example

```text
PromptStreak Agent Compare
Period: Last 30 days
Mode: Local only

Your local usage fingerprint:
- 512 chat/agent requests
- 41.2M input tokens
- 5.6M output tokens
- 3.1M cached/context tokens
- 21 active coding days
- Workload shape: heavy agent/edit usage
- Confidence: partial/exact mixed

Estimated provider fit:

1. GitHub Copilot
   Fit: likely good
   Billing type: AI credit / subscription hybrid
   Confidence: medium-high
   Note: Direct comparison improves after local AI-credit fields are available.

2. Cursor
   Fit: possible, but may spill into on-demand usage
   Billing type: subscription + included model usage + on-demand
   Confidence: medium

3. Claude Code Pro/Max
   Fit: good for deep repo sessions
   Billing type: subscription quota / plan fit
   Confidence: medium-low

4. Anthropic API / BYOK
   Fit: calculable
   Billing type: token-metered API
   Confidence: high if model is known

5. OpenCode BYOK
   Fit: depends on selected provider/model
   Billing type: local agent wrapper + provider billing
   Confidence: high if provider/model is known

Recommendation:
Stay on your current provider unless your agent/edit workload continues growing.
Run a 7-day local trial with one target provider and compare real local data again.
```

---

## 6. Billing model taxonomy

Provider comparison must be based on billing model types, not only provider names.

```ts
type BillingKind =
  | "token_metered"
  | "credit_metered"
  | "subscription_allowance"
  | "subscription_quota"
  | "hybrid_subscription_usage"
  | "request_credit"
  | "seat_license"
  | "enterprise_contract"
  | "byok_wrapper"
  | "router_payg"
  | "local_model"
  | "unknown";
```

### 6.1 Token-metered

Examples:

- OpenAI API
- Anthropic API
- Gemini API paid tier
- OpenRouter model pricing
- some OpenCode Zen models
- some Continue / Cline / Roo / Kilo BYOK modes

Usually high-confidence if PromptStreak knows:

- model name
- input tokens
- output tokens
- cached input tokens
- cache write tokens, if applicable

### 6.2 Credit-metered

Examples:

- GitHub Copilot AI Credits
- JetBrains AI Credits
- Windsurf Enterprise prompt credits
- provider-specific request/credit systems

Confidence depends on whether the provider exposes a stable conversion between local usage and credits.

### 6.3 Subscription allowance / included usage

Examples:

- Cursor plans
- Windsurf Free/Pro/Max/Teams
- Gemini Code Assist Standard/Enterprise
- Claude Code Pro/Max
- JetBrains AI Pro/Ultimate

These should be shown as **plan fit** or **quota pressure**, not exact invoices.

### 6.4 BYOK wrapper

Examples:

- OpenCode BYOK
- Cline BYOK
- Roo Code with API key
- Continue configured with provider API keys
- Kilo Code / Kilo Pass / BYOK modes

The wrapper itself is not the billing source. The selected provider/model is the billing source.

### 6.5 Local model

Examples:

- Ollama
- LM Studio
- llama.cpp
- local OpenCode / Continue setups

Cost should be shown as:

- direct provider cost: $0
- external hardware/electricity cost: not estimated by default
- performance/quality: not compared in V1

---

## 7. Local usage fingerprint

PromptStreak should transform raw local usage events into a normalized usage fingerprint.

```ts
type LocalUsageFingerprint = {
  period: {
    from: string;
    to: string;
    days: number;
  };

  source: {
    currentProvider?: string;
    currentTool?: string;
    collectorVersion: string;
    dataConfidence: "exact" | "estimated" | "partial";
  };

  activity: {
    activeCodingDays: number;
    totalRequests: number;
    completionRequests?: number;
    chatRequests?: number;
    editRequests?: number;
    agentRequests?: number;
    cliRequests?: number;
  };

  tokens: {
    input: number;
    output: number;
    cachedInput?: number;
    cacheWrite?: number;
    total?: number;
  };

  workloadShape: {
    repoCount: number;
    largeRepoSessions: number;
    filesTouched?: number;
    agentHeavyRatio: number;
    averageSessionDurationMs?: number;
    medianSessionDurationMs?: number;
  };

  privacy: {
    repoPathsIncluded: false;
    promptsIncluded: false;
    completionsIncluded: false;
    sourceCodeIncluded: false;
    apiKeysIncluded: false;
  };
};
```

### 7.1 Source confidence

Each usage field should carry confidence:

```ts
type FieldConfidence = "exact" | "parsed_log" | "estimated" | "user_entered" | "unknown";
```

Example:

```json
{
  "inputTokens": { "value": 41200000, "confidence": "parsed_log" },
  "outputTokens": { "value": 5600000, "confidence": "parsed_log" },
  "cachedInputTokens": { "value": 3100000, "confidence": "estimated" },
  "agentRequests": { "value": 312, "confidence": "exact" }
}
```

---

## 8. Rate-card cache design

### 8.1 Local rate-card cache path

Recommended default paths:

```text
VS Code extension:
<extension-global-storage>/ratecards/provider-ratecards.json

CLI macOS/Linux:
~/.config/promptstreak/ratecards/provider-ratecards.json

CLI Windows:
%APPDATA%\promptstreak\ratecards\provider-ratecards.json
```

### 8.2 Rate-card source registry

Store source metadata separately from normalized pricing data.

```ts
type RateCardSource = {
  id: string;
  provider: string;
  product: string;
  sourceUrl: string;
  sourceType: "official_html" | "official_docs" | "official_json" | "manual_import";
  billingKind: BillingKind;
  refreshStrategy: "manual_review" | "html_extract" | "json_api" | "user_import_only";
  lastCheckedAt?: string;
  effectiveFrom?: string;
  confidence: "high" | "medium" | "low";
  notes?: string[];
};
```

### 8.3 Normalized provider rate card

```ts
type ProviderRateCard = {
  schemaVersion: 1;
  provider: string;
  product: string;
  plan?: string;
  billingKind: BillingKind;
  credentialMode:
    | "account_login"
    | "api_key"
    | "byok"
    | "cloud_provider"
    | "router"
    | "local"
    | "unknown";

  currency: "USD" | "EUR" | "GBP" | "unknown";

  subscription?: {
    amount: number;
    interval: "monthly" | "annual" | "custom";
    perSeat?: boolean;
  };

  includedUsage?: {
    unit: "tokens" | "credits" | "requests" | "quota" | "dollars" | "unknown";
    amount?: number;
    reset: "daily" | "weekly" | "monthly" | "rolling" | "unknown";
    notes?: string[];
  };

  tokenRates?: {
    inputPerMTok?: number;
    outputPerMTok?: number;
    cachedInputPerMTok?: number;
    cacheWritePerMTok?: number;
  };

  creditRates?: {
    creditUnitName: string;
    creditToUsd?: number;
    requestToCredit?: number;
    tokenToCreditFormula?: string;
  };

  overage?: {
    enabled: boolean;
    unit?: "token" | "credit" | "request" | "api_price" | "unknown";
    notes?: string[];
  };

  source: RateCardSource;
  confidence: "high" | "medium" | "low";
};
```

### 8.4 Rate-card freshness

Rate cards should include:

```json
{
  "lastCheckedAt": "2026-05-06T12:00:00Z",
  "staleAfterDays": 14,
  "requiresManualReview": true
}
```

In UI:

```text
Rate card last checked: 2026-05-06
This provider changes pricing often. Please review before relying on the estimate.
```

---

## 9. Official source registry

Only official provider pages should be used for built-in rate-card updates.

### 9.1 GitHub Copilot

| Purpose | Official URL | Cache notes |
|---|---|---|
| Copilot models and pricing | https://docs.github.com/copilot/reference/copilot-billing/models-and-pricing | AI credits, model pricing, input/output/cached token pricing, plan behavior. |
| Copilot usage-based billing transition | https://docs.github.com/en/copilot/how-tos/manage-and-track-spending/prepare-for-your-move-to-usage-based-billing | Effective dates, migration notes, spending controls. |
| Copilot BYOK enterprise | https://docs.github.com/en/copilot/how-tos/administer-copilot/manage-for-enterprise/use-your-own-api-keys | Enterprise BYOK support; not a default individual-user comparison mode. |
| Copilot CLI auth / BYOK | https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/authenticate-copilot-cli | CLI auth and BYOK behavior. |

### 9.2 Cursor

| Purpose | Official URL | Cache notes |
|---|---|---|
| Cursor pricing | https://cursor.com/pricing | Subscription price, included model usage, on-demand usage. Dynamic page; manual review recommended. |
| Cursor docs | https://docs.cursor.com | Use for model/usage policy if pricing page references docs. |

### 9.3 Claude Code and Anthropic API

| Purpose | Official URL | Cache notes |
|---|---|---|
| Claude Code costs | https://code.claude.com/docs/en/costs | Subscription vs API cost behavior, local `/usage` caveats. |
| Claude Code authentication | https://code.claude.com/docs/en/authentication | Pro/Max, Console, Bedrock, Vertex, Foundry authentication modes. |
| Claude API pricing | https://platform.claude.com/docs/en/about-claude/pricing | API token pricing and cache pricing. |

### 9.4 OpenAI Codex and OpenAI API

| Purpose | Official URL | Cache notes |
|---|---|---|
| Codex pricing | https://developers.openai.com/codex/pricing | Codex-specific plan/credit pricing. |
| Codex authentication | https://developers.openai.com/codex/auth | ChatGPT account vs API-key behavior. |
| OpenAI API pricing | https://openai.com/api/pricing/ | Model token pricing, cached input, batch/priority rates. |

### 9.5 Gemini Code Assist, Gemini CLI, Gemini API, Antigravity

| Purpose | Official URL | Cache notes |
|---|---|---|
| Gemini Code Assist overview | https://developers.google.com/gemini-code-assist/docs/overview | Product editions and IDE support. |
| Gemini Code Assist quotas | https://developers.google.com/gemini-code-assist/resources/quotas | Free/paid limits and quotas. |
| Gemini CLI with Code Assist | https://docs.cloud.google.com/gemini/docs/codeassist/gemini-cli | CLI auth and shared quota behavior. |
| Gemini API pricing | https://ai.google.dev/gemini-api/docs/pricing | API token pricing. |
| Gemini Code Assist business | https://codeassist.google/products/business | Standard/Enterprise business pricing. |
| Google Antigravity pricing | https://antigravity.google/pricing | Separate product from Gemini Code Assist. Track independently. |

Important product note:

> Gemini Code Assist is not the same product as Google Antigravity. They may share Google AI infrastructure/models, but they should be represented as separate products in PromptStreak.

### 9.6 Windsurf

| Purpose | Official URL | Cache notes |
|---|---|---|
| Windsurf pricing | https://windsurf.com/pricing | Free/Pro/Max/Teams/Enterprise pricing, usage allowance, extra usage. |
| Windsurf plans and usage | https://docs.windsurf.com/windsurf/accounts/usage | Usage tracking, enterprise credits, add-on credits, quota behavior. |
| Windsurf models | https://docs.windsurf.com/windsurf/models | Model costs / model availability when needed. |

### 9.7 JetBrains AI / Junie

| Purpose | Official URL | Cache notes |
|---|---|---|
| JetBrains AI pricing | https://www.jetbrains.com/ai-ides/buy/ | Public pricing landing page. Dynamic; manual review recommended. |
| JetBrains AI plans and usage | https://www.jetbrains.com/help/ai-assistant/licensing-and-subscriptions.html | AI Free/Pro/Ultimate/Enterprise quota and credit behavior. |
| Junie | https://www.jetbrains.com/junie/ | JetBrains coding agent product page. |

Product note:

> Do not add a separate product named “JetBrains Air” unless JetBrains publishes an official product/pricing page under that name. Use JetBrains AI and Junie as the official entries.

### 9.8 OpenCode

| Purpose | Official URL | Cache notes |
|---|---|---|
| OpenCode docs | https://opencode.ai/docs/ | Core product docs. |
| OpenCode providers | https://opencode.ai/docs/providers/ | BYOK/provider support. Billing depends on selected provider/model. |
| OpenCode Zen | https://opencode.ai/zen | Curated pay-per-use model router; parse model-specific pricing where possible. |
| OpenCode Go | https://opencode.ai/go | Low-cost subscription mode. Mark as beta/plan-fit if pricing is not stable. |
| OpenCode Black | https://opencode.ai/black | Track availability status. |

### 9.9 BYOK and local-agent wrappers

| Product | Official URL | Cache notes |
|---|---|---|
| Cline pricing | https://cline.bot/pricing | Free open-source extension, pay for inference, BYOK or Cline provider. |
| Cline docs | https://docs.cline.bot | Provider/auth details. |
| Roo Code provider setup | https://docs.roocode.com/getting-started/connecting-api-provider | Router or user-provided API key in VS Code. |
| Continue pricing | https://www.continue.dev/pricing | Continue pricing and BYOK/enterprise notes. |
| Continue model providers | https://docs.continue.dev/customize/model-providers/overview | Supported providers and API-key requirements. |
| Kilo pricing | https://kilo.ai/pricing | Kilo Code / Kilo Pass / Teams pricing. |
| Kilo docs | https://docs.kilo.ai | Provider and BYOK setup if needed. |
| OpenRouter pricing | https://openrouter.ai/pricing | Router pricing. |
| OpenRouter models API | https://openrouter.ai/docs/api-reference/list-available-models | Machine-readable model list/pricing if available. |

### 9.10 Optional later providers

| Product | Official URL | Why include later |
|---|---|---|
| Amazon Q Developer | https://aws.amazon.com/q/developer/pricing/ | Coding assistant comparison. |
| Amazon Bedrock | https://aws.amazon.com/bedrock/pricing/ | Enterprise cloud-provider/BYOK route. |
| Azure OpenAI | https://azure.microsoft.com/en-us/pricing/details/azure-openai/ | Enterprise OpenAI-hosted-through-Azure route. |
| Azure AI Foundry Models | https://azure.microsoft.com/en-us/pricing/details/ai-foundry-models/ | Enterprise hosted models. |
| xAI API | https://x.ai/api | BYOK model support where available. |
| Mistral API | https://mistral.ai/pricing | BYOK / Codestral / Mistral comparison. |
| DeepSeek API | https://api-docs.deepseek.com/quick_start/pricing | Low-cost BYOK comparison. |
| Tabnine | https://www.tabnine.com/pricing/ | Enterprise assistant comparison. |
| Augment Code | https://www.augmentcode.com/pricing | Agentic coding comparison. |
| Qodo | https://www.qodo.ai/pricing/ | Code review/testing assistant comparison. |

---

## 10. Provider adapter design

Each provider should have an adapter.

```ts
interface BillingAdapter {
  id: string;
  provider: string;
  supportedBillingKinds: BillingKind[];

  normalizeRateCard(raw: unknown): ProviderRateCard[];

  estimate(input: {
    usage: LocalUsageFingerprint;
    rateCard: ProviderRateCard;
    scenario: CompareScenario;
    options?: ProviderSpecificOptions;
  }): ProviderEstimate;
}
```

### 10.1 Estimate output

```ts
type ProviderEstimate = {
  provider: string;
  product: string;
  plan?: string;
  mode?: string;

  estimateKind: "exact_formula" | "range" | "plan_fit" | "quota_pressure" | "unsupported";

  monthlyCost?: {
    low?: number;
    expected?: number;
    high?: number;
    currency: string;
  };

  quota?: {
    likelyFits?: boolean;
    pressure: "low" | "medium" | "high" | "unknown";
    notes?: string[];
  };

  confidence: "high" | "medium" | "low";

  assumptions: string[];
  caveats: string[];
  sourceUrls: string[];
};
```

---

## 11. Scenario engine

Provider comparison must support scenarios because switching agents changes usage behavior.

```ts
type CompareScenario =
  | "same_usage"
  | "conservative"
  | "agent_heavy"
  | "premium_model_heavy"
  | "cheap_model_preferred"
  | "user_custom";
```

### 11.1 Scenario multipliers

Default V1 multipliers:

```ts
type ScenarioMultiplier = {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  requests: number;
};

const DEFAULT_SCENARIOS = {
  same_usage: {
    inputTokens: 1.0,
    outputTokens: 1.0,
    cachedInputTokens: 1.0,
    requests: 1.0
  },
  conservative: {
    inputTokens: 0.75,
    outputTokens: 0.8,
    cachedInputTokens: 0.75,
    requests: 0.9
  },
  agent_heavy: {
    inputTokens: 1.5,
    outputTokens: 1.3,
    cachedInputTokens: 1.5,
    requests: 1.2
  },
  premium_model_heavy: {
    inputTokens: 1.2,
    outputTokens: 1.2,
    cachedInputTokens: 1.2,
    requests: 1.0
  },
  cheap_model_preferred: {
    inputTokens: 1.0,
    outputTokens: 1.0,
    cachedInputTokens: 1.0,
    requests: 1.0
  }
};
```

UI must clearly show these as assumptions.

---

## 12. Estimation logic

### 12.1 Token-metered formula

```ts
function estimateTokenMeteredCost(usage, tokenRates) {
  const inputCost = (usage.tokens.input / 1_000_000) * tokenRates.inputPerMTok;
  const outputCost = (usage.tokens.output / 1_000_000) * tokenRates.outputPerMTok;
  const cachedCost = ((usage.tokens.cachedInput ?? 0) / 1_000_000) * (tokenRates.cachedInputPerMTok ?? tokenRates.inputPerMTok ?? 0);
  const cacheWriteCost = ((usage.tokens.cacheWrite ?? 0) / 1_000_000) * (tokenRates.cacheWritePerMTok ?? 0);

  return inputCost + outputCost + cachedCost + cacheWriteCost;
}
```

### 12.2 Subscription/quota fit formula

For subscription/quota tools, estimate plan fit:

```ts
type QuotaPressure = "low" | "medium" | "high" | "unknown";
```

Recommended V1 heuristic:

```ts
function estimateQuotaPressure(usage, plan) {
  if (!plan.includedUsage || plan.includedUsage.unit === "unknown") {
    return "unknown";
  }

  // If provider exposes monthly token/credit/request allowance, map directly.
  // If not, use usage-shape heuristics only.
}
```

Output example:

```text
Claude Code Max
Estimate type: plan fit
Quota pressure: medium-high
Confidence: medium-low
Reason: subscription limits do not map cleanly to Copilot local token usage.
```

### 12.3 Credit-metered formula

For providers with stable credit conversion:

```ts
function estimateCreditCost(usage, creditRateCard) {
  // Use provider-specific conversion formula when documented.
  // If conversion is not stable/public, return quota pressure instead of dollar cost.
}
```

---

## 13. Provider-specific handling

### 13.1 GitHub Copilot

Billing kind:

```text
credit_metered / hybrid_subscription_usage
```

Required local fields:

- input tokens
- output tokens
- cached tokens
- model
- request type
- feature type: completion, chat, edit, agent, CLI, cloud agent if known

V1 behavior:

- Show current usage profile.
- Map to GitHub AI Credit model where enough source data exists.
- Mark as medium-high confidence if local token/model fields are available.
- Mark completions separately if provider docs treat completions differently from chat/agent usage.

### 13.2 Cursor

Billing kind:

```text
hybrid_subscription_usage
```

V1 behavior:

- Show subscription/plan fit.
- Show possible on-demand spillover.
- Do not claim exact bill unless Cursor exposes stable model-level export or the user imports their Cursor usage data.

### 13.3 Claude Code

Billing kinds:

```text
subscription_quota
 token_metered
 cloud_provider
```

Modes:

- Claude Pro/Max account login
- Anthropic Console/API key
- Amazon Bedrock
- Google Vertex AI
- Microsoft Foundry

V1 behavior:

- Subscription mode: show plan fit and confidence medium-low.
- API mode: show token-metered estimate with high confidence if model known.
- Cloud provider mode: use Bedrock/Vertex/Foundry imported rate card if available.

### 13.4 OpenAI Codex

Billing kinds:

```text
subscription_allowance
 token_metered
```

Modes:

- ChatGPT account/credits
- OpenAI API key

V1 behavior:

- ChatGPT account mode: show plan/credit fit.
- API key mode: direct token estimate using OpenAI API pricing.

### 13.5 Gemini Code Assist

Billing kinds:

```text
quota_limited
 seat_license
 token_metered
```

Modes:

- Gemini Code Assist individual
- Gemini Code Assist Standard
- Gemini Code Assist Enterprise
- Gemini CLI with Code Assist quota
- Gemini API key / paid API

V1 behavior:

- Code Assist individual: quota fit, not exact dollar cost.
- Standard/Enterprise: seat-license comparison.
- Gemini API key: token-metered estimate.

Important:

- Gemini Code Assist and Google Antigravity must be separate products.

### 13.6 Google Antigravity

Billing kind:

```text
unknown / subscription_allowance / quota_limited
```

V1 behavior:

- Include only if official pricing page provides enough information.
- Store as separate provider/product from Gemini Code Assist.
- Use manual-review refresh strategy.

### 13.7 Windsurf

Billing kinds:

```text
subscription_allowance
 hybrid_subscription_usage
 request_credit
 enterprise_contract
```

V1 behavior:

- Show Free/Pro/Max/Teams plan fit.
- Show extra usage at API price where documented.
- Show enterprise credit mode separately.
- Use medium confidence unless exact model-level pricing is available.

### 13.8 JetBrains AI / Junie

Billing kinds:

```text
subscription_quota
 credit_metered
 seat_license
```

V1 behavior:

- Show AI Free/Pro/Ultimate/Enterprise plan fit.
- Use JetBrains AI credits as quota-pressure metric.
- Track Junie as a JetBrains coding-agent product.
- Do not include “JetBrains Air” unless an official source exists.

### 13.9 OpenCode

Billing kinds:

```text
byok_wrapper
 router_payg
 subscription_allowance
 local_model
```

Modes:

- OpenCode BYOK
- OpenCode Zen
- OpenCode Go
- local model
- OpenCode Black availability status

V1 behavior:

- BYOK: estimate using selected provider/model rate card.
- Zen: use OpenCode Zen pricing if machine-readable/extractable; otherwise manual review.
- Go: show subscription/plan fit, not exact token bill.
- Local model: direct provider cost $0, hardware cost not estimated.

Optional detection:

```text
~/.local/share/opencode/auth.json
```

Rules:

- Do not read API key values.
- Only detect provider names after explicit user opt-in.
- Display “config present” rather than secret values.

### 13.10 Cline

Billing kind:

```text
byok_wrapper / router_payg
```

V1 behavior:

- Treat Cline as a wrapper unless using Cline's own provider credits.
- BYOK estimate depends on selected provider/model.
- Do not read Cline secrets automatically.

### 13.11 Roo Code

Billing kind:

```text
byok_wrapper / router_payg
```

V1 behavior:

- Router mode: use Roo Code Router pricing if official pricing is available.
- API-key mode: estimate using selected provider/model rate card.

### 13.12 Continue

Billing kind:

```text
router_payg / byok_wrapper / seat_license
```

V1 behavior:

- Continue cloud/credit mode: use Continue pricing.
- BYOK mode: use selected provider/model pricing.
- Enterprise BYOK: allow custom company rate-card import.

### 13.13 Kilo Code

Billing kind:

```text
byok_wrapper / router_payg / subscription_allowance
```

V1 behavior:

- Kilo Code open-source/local mode: wrapper.
- Kilo Pass: use official Kilo pricing.
- BYOK: use underlying provider/model.

### 13.14 OpenRouter

Billing kind:

```text
router_payg
```

V1 behavior:

- Use as a broad model-pricing fallback where appropriate.
- Prefer official provider pricing when user selects direct OpenAI/Anthropic/Gemini API.
- Use OpenRouter's official model/pricing API if available.

---

## 14. Privacy and security requirements

### 14.1 Never collect

The comparison feature must never collect or upload:

- prompts
- completions
- source code
- filenames
- raw repository paths
- terminal commands
- terminal output
- API key values
- private provider account details
- provider invoices

### 14.2 Local-only by default

The feature should work without network access using the bundled rate-card snapshot.

```bash
promptstreak compare-agents --offline
```

### 14.3 Optional network behavior

Allowed network request:

- fetch public official rate-card metadata

Disallowed network request:

- upload user usage history
- upload project names/repo paths
- validate API keys against providers
- fetch private billing dashboard data

### 14.4 Secret detection rule

If reading config files to detect provider mode:

- do not parse or display secret values
- redact anything matching key-like patterns
- require explicit opt-in for provider config scanning

Example UI:

```text
PromptStreak can check local agent configuration files to detect provider names.
It will not read or store API key values.
[Scan provider names] [Skip]
```

---

## 15. CLI design

### 15.1 Basic comparison

```bash
promptstreak compare-agents --last 30d
```

### 15.2 Targeted comparison

```bash
promptstreak compare-agents --last 30d --targets copilot,cursor,claude-code,opencode,windsurf
```

### 15.3 BYOK comparison

```bash
promptstreak compare-agents \
  --last 30d \
  --target opencode \
  --mode byok \
  --model anthropic/claude-sonnet-4-5
```

### 15.4 Export

```bash
promptstreak compare-agents --last 90d --export markdown --out agent-compare.md
promptstreak compare-agents --last 90d --export json --out agent-compare.json
```

### 15.5 Rate-card management

```bash
promptstreak ratecards status
promptstreak ratecards update
promptstreak ratecards list-sources
promptstreak ratecards import ./company-rate-card.json
promptstreak ratecards validate ./company-rate-card.json
```

---

## 16. VS Code UI design

### 16.1 Agent Compare view

Sections:

1. Period selector
2. Current usage fingerprint
3. Target providers
4. Scenario selector
5. Provider comparison cards
6. Caveats and assumptions
7. Export buttons

### 16.2 Period selector

```text
Compare period:
[7 days] [30 days] [90 days] [Custom]
```

### 16.3 Scenario selector

```text
Scenario:
[Same usage] [Conservative] [Agent-heavy] [Premium-model heavy] [Cheap-model preferred]
```

### 16.4 Provider cards

Example:

```text
OpenCode BYOK
Billing type: BYOK wrapper
Estimated cost: $38–$72/month
Confidence: high if model/provider are correct
Assumptions:
- Model: Claude Sonnet 4.5
- Same usage pattern as last 30 days
- Token pricing from Anthropic API rate card
Caveats:
- OpenCode itself is not the billing source in BYOK mode.
```

### 16.5 Confidence display

Use visible labels:

```text
High confidence: direct token-metered API estimate
Medium confidence: provider plan/usage pool estimate
Low confidence: quota or subscription model does not map cleanly
```

---

## 17. Markdown report export

Generated report should include:

```markdown
# PromptStreak Agent Compare Report

Period: 2026-04-06 to 2026-05-06  
Generated locally: yes  
Usage uploaded: no  
Rate-card snapshot: 2026-05-06  

## Local usage fingerprint
...

## Provider comparison
...

## Assumptions
...

## Caveats
...

## Official source URLs
...
```

Do not include:

- raw prompts
- raw completions
- file names
- repo paths
- API keys

---

## 18. JSON report export

```ts
type AgentCompareReport = {
  schemaVersion: 1;
  generatedAt: string;
  generatedLocally: true;
  usageUploaded: false;
  period: {
    from: string;
    to: string;
  };
  usageFingerprint: LocalUsageFingerprint;
  scenario: CompareScenario;
  estimates: ProviderEstimate[];
  rateCardSnapshot: {
    version: string;
    lastCheckedAt: string;
    sources: RateCardSource[];
  };
};
```

---

## 19. Acceptance criteria

### 19.1 Functional

- User can run comparison from CLI.
- User can run comparison from VS Code UI.
- Comparison works offline using bundled rate-card snapshot.
- User can update rate cards manually.
- User can import custom company rate card.
- Token-metered providers show cost ranges or exact formula estimates.
- Subscription/quota providers show plan fit or quota pressure.
- Each provider card shows confidence and caveats.
- Report can be exported as Markdown and JSON.

### 19.2 Privacy

- No prompts are included in comparison input or exported reports.
- No completions are included.
- No source code is included.
- No raw repo paths are included.
- No API keys are read or stored.
- No user usage data is uploaded during comparison.
- Optional rate-card update only fetches public official metadata.

### 19.3 Reliability

- Missing token fields do not crash the comparison.
- Unknown provider pricing returns “unsupported” or “manual review required.”
- Stale rate-card cache triggers a warning.
- Dynamic provider pricing pages are marked as manual-review sources.
- All estimates include source URLs.

---

## 20. Test cases

### 20.1 Token-metered API provider

Input:

- 10M input tokens
- 2M output tokens
- provider: Anthropic API
- model: known

Expected:

- direct formula estimate
- high confidence
- source URL shown

### 20.2 Subscription provider with unclear quota

Input:

- 10M input tokens
- 2M output tokens
- provider: Claude Code Pro/Max

Expected:

- plan fit / quota pressure
- no exact bill claim
- medium-low confidence

### 20.3 BYOK wrapper

Input:

- provider: OpenCode BYOK
- model provider: OpenAI
- model: known

Expected:

- OpenCode treated as wrapper
- OpenAI API pricing used
- high confidence if model pricing exists

### 20.4 Unknown provider

Input:

- provider: unknown-agent

Expected:

- unsupported output
- no crash
- user can import custom rate card

### 20.5 Offline mode

Input:

```bash
promptstreak compare-agents --offline
```

Expected:

- uses bundled cache
- no network calls
- output marks rate-card snapshot date

### 20.6 Stale cache

Input:

- rate card older than staleAfterDays

Expected:

- warning shown
- comparison still generated
- user prompted to update/review rate card

### 20.7 Secret-safe config scan

Input:

- local OpenCode/Cline/Roo/Continue config contains API key values

Expected:

- values are not printed
- values are not stored
- only provider names are detected if user opted in

---

## 21. Implementation phases

### Phase 1 — Core local comparison engine

Deliver:

- LocalUsageFingerprint builder
- RateCardSource registry
- ProviderRateCard schema
- BillingAdapter interface
- Token-metered estimator
- Plan-fit estimator
- CLI command: `promptstreak compare-agents`
- Markdown export
- JSON export

Providers:

- GitHub Copilot
- OpenAI API
- Anthropic API
- Gemini API
- OpenCode BYOK
- Cline BYOK
- Roo BYOK
- Continue BYOK

### Phase 2 — VS Code UI

Deliver:

- Agent Compare view
- Period selector
- Scenario selector
- Provider cards
- Confidence and caveat UI
- Export buttons

Providers:

- Cursor
- Claude Code subscription
- Gemini Code Assist
- Windsurf
- JetBrains AI / Junie

### Phase 3 — Rate-card management

Deliver:

- `promptstreak ratecards status`
- `promptstreak ratecards update`
- `promptstreak ratecards import`
- `promptstreak ratecards validate`
- stale-cache warnings
- manual-review flags

### Phase 4 — Advanced local detection

Deliver:

- opt-in local config scan
- provider name detection for BYOK tools
- no secret extraction
- support OpenCode/Cline/Roo/Continue/Kilo config locations where safe

### Phase 5 — Team/enterprise import support

Deliver:

- custom company rate-card schema
- signed local rate-card bundles, optional
- admin-authored assumptions
- internal plan mapping

---

## 22. Recommended copy

### 22.1 Feature headline

> Compare coding agents using your own local usage.

### 22.2 Feature description

> PromptStreak Agent Compare analyzes your local AI coding activity and estimates how your workload may fit across Copilot, Cursor, Claude Code, Codex, Gemini Code Assist, Windsurf, JetBrains AI, OpenCode, Cline, Roo Code, Continue, Kilo, and BYOK providers. It runs locally and never uploads prompts, source code, repository paths, or API keys.

### 22.3 Caveat copy

> Provider billing models are not identical. Token-metered API-key estimates are usually more precise. Subscription, quota, and included-usage plans are shown as plan-fit or quota-pressure estimates.

### 22.4 Privacy copy

> This report was generated locally. PromptStreak did not upload your usage data, prompts, completions, source code, repository paths, or API keys.

---

## 23. Open decisions

1. Should the first public name be **Agent Compare**, **Agent Switch Calculator**, or **Provider Compare**?
2. Should PromptStreak bundle rate cards in the extension package, CLI package, or both?
3. Should the extension allow automatic public rate-card updates, or require manual user action?
4. Should provider config scanning be included in V1 or delayed to Phase 4?
5. Should the report include repo-level grouping, or only aggregate usage for privacy simplicity?
6. Should user-imported company rate cards support encryption/signatures in V1?

---

## 24. Recommended V1 decision

Recommended product name:

> **PromptStreak Agent Compare**

Recommended first scope:

- CLI-first implementation
- local usage fingerprint
- static bundled source registry
- token-metered API estimator
- BYOK wrapper support
- basic plan-fit estimates
- Markdown export
- no config scanning in V1
- no API-key handling ever

Reason:

This gives users immediate value while keeping the feature honest, privacy-preserving, and feasible.

