# Agent Vibe XY Style Map - Calculation Method

## 1. Purpose

This document defines a clear, reproducible method for computing an XY "agent vibe" style map from local AI coding usage telemetry.

The output is intended for interpretation, research, reflection, and optional playful profile display.

It is **not** intended for:

- billing
- productivity ranking
- employee evaluation
- psychological profiling
- code quality scoring
- user identity inference

The map describes **usage style**, not developer skill.

## 2. Core Concept

The map places a user's AI coding behavior on two 0-100 axes:

- **X axis: Agenticity**
  - Manual / inline assistance -> agent-driven workflow

- **Y axis: Deliberation**
  - Fast / direct interactions -> reflective / iterative workflow

The result is a style coordinate:

```text
(xScore, yScore)
```

Example:

```text
(63, 58) = Agentic Architect
```

## 3. Input Data

Primary input is the local usage fingerprint shape already defined in the PromptStreak feature document.

### 3.1 Required Fields

```text
activity.totalRequests
activity.chatRequests
activity.editRequests
activity.agentRequests

tokens.input
tokens.output

workloadShape.agentHeavyRatio
workloadShape.averageSessionDurationMs or workloadShape.medianSessionDurationMs
```

### 3.2 Recommended Fields

```text
activity.activeDays
workloadShape.repoCount
```

### 3.3 Optional Event-Level Enrichment

If available from event-level parsing:

```text
toolCallRoundsPerRequest
turnsPerSession
followupRate
editAfterGenerationRate
distinctModelCount
modelSwitchRate
cacheReadRatio
localHourDistribution
weekendUsageShare
```

## 4. Output Summary

The method produces:

```text
xScore: 0-100
yScore: 0-100
quadrant label
axis confidence labels
component breakdown
secondary traits
privacy-safe public display fields
```

Example:

```json
{
  "xScore": 63,
  "yScore": 58,
  "quadrant": "Agentic Architect",
  "xConfidence": "high",
  "yConfidence": "medium"
}
```

## 5. Normalization Helpers

Use bounded linear normalization:

```text
norm01(v, lo, hi) = clamp((v - lo) / (hi - lo), 0, 1)
```

Rules:

- Clamp all normalized values to `[0, 1]`.
- If `hi == lo`, treat the component as missing.
- If a value is missing, treat the component as missing.
- Re-normalize weights across available components.
- Never infer missing values from prompts, repo names, file paths, or source code.

## 6. Weighted Mean Helper

Use a weighted mean over available components only.

```text
weighted_mean_available(components):
  numerator = sum(value_i * weight_i for available components)
  denominator = sum(weight_i for available components)

  if denominator == 0:
    return missing

  return numerator / denominator
```

Example:

```text
weighted_mean_available({
  agentRequestShare: { value: 0.62, weight: 0.50 },
  agentHeavy:        { value: 0.71, weight: 0.30 },
  toolIntensity:     { value: missing, weight: 0.20 }
})
```

The missing `toolIntensity` component is ignored and the remaining weights are re-normalized.

## 7. Minimum Data Requirements

To avoid unstable first-run classifications:

```text
minimumTotalRequests = 10
recommendedTotalRequests = 50
minimumActiveDays = 2
recommendedActiveDays = 10
```

If below minimum:

```json
{
  "status": "insufficient_data",
  "reason": "Not enough local usage data to compute a stable style map."
}
```

Recommended rule:

```text
if totalRequests < 10:
  return insufficient_data
```

For public cards, prefer showing:

```text
"Still warming up"
```

instead of a quadrant label.

## 8. X Axis: Agenticity

### 8.1 Meaning

The X axis estimates how much the user relies on agentic workflows rather than manual chat, inline edits, or direct assistance.

Low X means:

```text
mostly manual / inline / direct assistant use
```

High X means:

```text
frequent agentic workflows, tool use, or autonomous task delegation
```

### 8.2 Components

```text
agentRequestShare = agentRequests / max(totalRequests, 1)

agentHeavy = workloadShape.agentHeavyRatio

toolIntensity = norm01(toolCallRoundsPerRequest, 0.0, 4.0) # optional
```

### 8.3 Default Weights

```text
agentRequestShare: 0.50
agentHeavy:        0.30
toolIntensity:     0.20
```

### 8.4 Score

```text
xRaw = weighted_mean_available({
  agentRequestShare,
  agentHeavy,
  toolIntensity
})

xScore = round(100 * xRaw)
```

### 8.5 Interpretation

```text
0-24:  Mostly manual / inline assistance
25-49: Mixed manual + occasional agent flow
50-74: Frequent agentic operation
75-100: Strongly agent-driven workflow
```

### 8.6 Notes

`repoCount` is intentionally **not** included in Agenticity.

A high repo count may indicate broad work, consulting, open-source maintenance, monorepo usage, or experimentation. It should be treated as a secondary trait instead.

## 9. Y Axis: Deliberation

### 9.1 Meaning

The Y axis estimates whether the user tends toward fast/direct interactions or longer, more iterative, reflective workflows.

Low Y means:

```text
short, direct, transactional interactions
```

High Y means:

```text
longer sessions, more revision, deeper interaction loops
```

### 9.2 Components

```text
sessionMs = medianSessionDurationMs if available else averageSessionDurationMs

sessionDepth = norm01(sessionMs, 2*60*1000, 45*60*1000)

editShare = editRequests / max(totalRequests, 1)

editDepth = norm01(editShare, 0.0, 0.60)

generationExpansion = norm01(outputTokens / max(inputTokens, 1), 0.10, 1.20)

toolDepth = norm01(toolCallRoundsPerRequest, 0.0, 4.0) # optional

modelSwitch = norm01(modelSwitchRate, 0.0, 0.30) # optional, low weight
```

### 9.3 Default Weights

```text
sessionDepth:        0.35
editDepth:           0.25
generationExpansion: 0.20
toolDepth:           0.15
modelSwitch:         0.05
```

### 9.4 Score

```text
yRaw = weighted_mean_available({
  sessionDepth,
  editDepth,
  generationExpansion,
  toolDepth,
  modelSwitch
})

yScore = round(100 * yRaw)
```

### 9.5 Interpretation

```text
0-24:  Short / direct interactions
25-49: Moderately iterative
50-74: Deliberate and context-heavy
75-100: Highly reflective / iterative style
```

### 9.6 Better Event-Level Formula

If event-level data is available, prefer this stronger Y formula:

```text
sessionDepth = norm01(sessionMs, 2*60*1000, 45*60*1000)

turnDepth = norm01(turnsPerSession, 1.0, 8.0)

followupDepth = norm01(followupRate, 0.0, 0.75)

editDepth = norm01(editAfterGenerationRate, 0.0, 0.60)

toolDepth = norm01(toolCallRoundsPerRequest, 0.0, 4.0)
```

Recommended event-level weights:

```text
sessionDepth:  0.25
turnDepth:     0.25
followupDepth: 0.20
editDepth:     0.20
toolDepth:     0.10
```

This is preferred because follow-up behavior and revision loops are more direct signals of deliberation than token ratios alone.

## 10. Secondary Traits

The XY map should produce one main quadrant, but secondary traits make the result more expressive.

Secondary traits should be shown as optional labels, not as quality judgments.

### 10.1 Repo Explorer

```text
repoBreadth = norm01(repoCount, 1, 20)
```

Suggested label:

```text
Repo Explorer
```

### 10.2 Model Explorer

```text
modelBreadth = norm01(distinctModelCount, 1, 6)

modelSwitch = norm01(modelSwitchRate, 0.0, 0.30)

modelExplorerScore = weighted_mean_available({
  modelBreadth: 0.60,
  modelSwitch: 0.40
})
```

Suggested label:

```text
Model Explorer
```

### 10.3 Context Minimalist / Context Hoarder

```text
avgInputTokensPerRequest = inputTokens / max(totalRequests, 1)

contextLoad = norm01(avgInputTokensPerRequest, 500, 12000)
```

Suggested labels:

```text
0-24:  Context Minimalist
25-74: Context Balancer
75-100: Context Hoarder
```

### 10.4 Cache Wizard

If cache metrics are available:

```text
cacheWizardScore = norm01(cacheReadRatio, 0.10, 0.85)
```

Suggested label:

```text
Cache Wizard
```

### 10.5 Agent Wrangler

```text
agentWranglerScore = weighted_mean_available({
  agentRequestShare: 0.50,
  toolIntensity:     0.50
})
```

Suggested label:

```text
Agent Wrangler
```

### 10.6 Night Builder

If local timestamp data is available:

```text
nightUsageShare = requests between 22:00 and 04:00 local time / totalRequests

nightBuilderScore = norm01(nightUsageShare, 0.10, 0.60)
```

Suggested label:

```text
Night Builder
```

### 10.7 Weekend Builder

```text
weekendBuilderScore = norm01(weekendUsageShare, 0.20, 0.70)
```

Suggested label:

```text
Weekend Builder
```

## 11. Confidence Scoring

Confidence should account for both:

1. field reliability
2. sample size

A value can be exact but still unstable if based on too little data.

## 11.1 Field Confidence

Each metric should carry a field confidence source:

```text
exact
parsed_log
estimated
user_entered
unknown
```

Map to reliability factors:

```text
exact:        1.00
parsed_log:   0.85
estimated:    0.60
user_entered: 0.50
unknown:      0.30
```

Component reliability:

```text
componentReliability = reliabilityFactor(metricSource)
```

Axis field reliability:

```text
axisFieldReliability =
  sum(componentWeight * componentReliability) / sum(componentWeight)
```

Only include components used in the axis calculation.

## 11.2 Sample Confidence

Use request count and active-day coverage.

```text
requestCoverage = min(1, sqrt(totalRequests / 50))

activeDayCoverage = min(1, activeDays / 10)

sampleConfidence = requestCoverage * activeDayCoverage
```

If `activeDays` is missing:

```text
activeDayCoverage = 0.70
```

This avoids overconfidence while still allowing a score.

## 11.3 Final Axis Confidence

```text
axisConfidenceScore = axisFieldReliability * sampleConfidence
```

Recommended labels:

```text
>= 0.80: high
>= 0.60: medium
>= 0.40: low
<  0.40: very_low
```

For public display:

```text
high:     "High confidence"
medium:   "Medium confidence"
low:      "Low confidence"
very_low: "Still learning your style"
```

## 12. Time Smoothing

To reduce jitter from short windows, compute both:

```text
current window score
smoothed score
```

Recommended default window:

```text
last 30 days
```

Recommended EWMA formula:

```text
ewma_t = alpha * current_t + (1 - alpha) * ewma_(t-1)
```

Recommended alpha:

```text
alpha = 0.35
```

Use cases:

```text
raw score:      current behavior
smoothed score: profile display
delta:          month-over-month movement
```

Example:

```json
{
  "xScore": 63,
  "xScoreSmoothed": 59,
  "xDelta": 7,
  "yScore": 58,
  "yScoreSmoothed": 61,
  "yDelta": -4
}
```

## 13. Quadrant Labels

Use a split point of 50 on both axes.

```text
X < 50, Y < 50:   Direct Executor
X >= 50, Y < 50:  Agent Sprinter
X < 50, Y >= 50:  Reflective Crafter
X >= 50, Y >= 50: Agentic Architect
```

## 14. Quadrant Descriptions

### 14.1 Direct Executor

```text
Manual + Direct
```

Uses AI in focused, transactional ways. Typically asks direct questions, requests quick edits, and keeps interactions short.

### 14.2 Agent Sprinter

```text
Agentic + Direct
```

Delegates to agents frequently but keeps the workflow fast. Often uses agentic tools to move quickly through concrete tasks.

### 14.3 Reflective Crafter

```text
Manual + Reflective
```

Uses AI as a thinking and refinement partner. Often spends more time shaping, revising, and iterating without necessarily relying on full agentic workflows.

### 14.4 Agentic Architect

```text
Agentic + Reflective
```

Combines agentic delegation with deeper planning or iteration. Often uses longer sessions, tool-assisted flows, and multi-step refinement.

## 15. Public Display Bands

For shareable cards, avoid exact raw telemetry.

Recommended display format:

```text
Agenticity: 63 / 100
Deliberation: 58 / 100
Style: Agentic Architect
Confidence: Medium
```

Optional privacy-preserving bands:

```text
0-24:  Low
25-49: Moderate
50-74: High
75-100: Very High
```

Example public display:

```text
Agenticity: High
Deliberation: High
Style: Agentic Architect
Confidence: Medium
```

## 16. Anti-Gaming Rules

The map should be designed to avoid "tokenmaxxing" incentives.

Rules:

```text
- Higher X is not better.
- Higher Y is not better.
- Token volume alone must not determine archetype.
- Spend must not determine archetype.
- Public cards should avoid exact cost unless the user explicitly opts in.
- Do not rank users by total tokens alone.
- Do not rank users by total spend alone.
- Do not describe one quadrant as superior to another.
- Do not imply that more agentic usage means better engineering.
- Do not imply that longer sessions mean better thinking.
```

Recommended UI language:

```text
"This map describes how you use AI coding tools, not how good you are as a developer."
```

## 17. Privacy and GDPR Guidance

The map should be local-first and privacy-preserving.

### 17.1 Do Not Include

Never include these fields in the map output:

```text
prompt text
completion text
source code
file paths
repo names
branch names
commit messages
user identity
organization identity
secrets
API keys
raw logs
```

### 17.2 Safe to Include

Safe aggregate fields:

```text
request counts
token counts
normalized ratios
axis scores
confidence labels
rounded percentile bands
secondary trait scores
time window
algorithm version
```

### 17.3 Public Card Requirements

For a public/shareable card:

```text
- use rounded scores or bands
- hide raw prompts
- hide repo names
- hide file paths
- hide exact timestamps
- hide exact spend by default
- allow anonymous sharing
- allow named sharing only by explicit opt-in
```

### 17.4 Consent Modes

Recommended visibility modes:

```text
private
anonymous_public
named_public
team_visible
```

Default:

```text
private
```

## 18. Output Schema

```json
{
  "algorithm": {
    "name": "agent_vibe_xy",
    "version": "1.0.0",
    "normalizationProfile": "fixed_v1"
  },
  "period": {
    "from": "2026-05-08",
    "to": "2026-06-07",
    "days": 30
  },
  "status": "ok",
  "sample": {
    "totalRequests": 184,
    "activeDays": 18,
    "sufficientData": true,
    "requestCoverage": 1.0,
    "activeDayCoverage": 1.0
  },
  "scores": {
    "xScore": 63,
    "yScore": 58,
    "xScoreSmoothed": 59,
    "yScoreSmoothed": 61,
    "xDelta": 7,
    "yDelta": -4
  },
  "style": {
    "quadrant": "Agentic Architect",
    "xLabel": "High agenticity",
    "yLabel": "High deliberation",
    "description": "Combines agentic delegation with deeper planning or iteration."
  },
  "confidence": {
    "x": {
      "score": 0.86,
      "label": "high"
    },
    "y": {
      "score": 0.71,
      "label": "medium"
    }
  },
  "components": {
    "x": {
      "agentRequestShare": 0.62,
      "agentHeavy": 0.71,
      "toolIntensity": 0.40
    },
    "y": {
      "sessionDepth": 0.61,
      "editDepth": 0.47,
      "generationExpansion": 0.53,
      "toolDepth": 0.40,
      "modelSwitch": 0.36
    }
  },
  "secondaryTraits": [
    {
      "name": "Repo Explorer",
      "score": 64,
      "label": "Moderate"
    },
    {
      "name": "Model Explorer",
      "score": 38,
      "label": "Moderate"
    },
    {
      "name": "Agent Wrangler",
      "score": 67,
      "label": "High"
    }
  ],
  "privacy": {
    "containsPrompts": false,
    "containsCompletions": false,
    "containsSourceCode": false,
    "containsRepoNames": false,
    "containsFilePaths": false,
    "containsUserIdentity": false,
    "publicSafe": true,
    "visibility": "private"
  }
}
```

## 19. Insufficient Data Output Schema

```json
{
  "algorithm": {
    "name": "agent_vibe_xy",
    "version": "1.0.0",
    "normalizationProfile": "fixed_v1"
  },
  "period": {
    "from": "2026-05-08",
    "to": "2026-06-07",
    "days": 30
  },
  "status": "insufficient_data",
  "reason": "Not enough local usage data to compute a stable style map.",
  "sample": {
    "totalRequests": 6,
    "activeDays": 1,
    "sufficientData": false
  },
  "privacy": {
    "publicSafe": true,
    "visibility": "private"
  }
}
```

## 20. Implementation Notes

- Clamp every normalized value to `[0, 1]`.
- Re-normalize weights if optional components are missing.
- Use median session duration when available.
- Prefer event-level deliberation metrics when available.
- Do not use repo count as an Agenticity signal.
- Do not use model switching as a strong Deliberation signal.
- Keep algorithm versioned.
- Keep the default output local-only.
- Make all assumptions visible in the UI or report.
- Do not expose prompts, completions, file paths, repo names, or raw logs.

## 21. Calibration Guidance

For v1, use fixed normalization bounds.

For later versions, compare against aggregate cohort percentiles.

Recommended calibration outputs:

```text
p25 / p50 / p75 for X
p25 / p50 / p75 for Y
monthly drift
confidence distribution
component missingness rate
quadrant distribution
```

Do not silently change normalization bounds.

If bounds change, increment the algorithm version.

Example:

```text
1.0.0 = fixed_v1
1.1.0 = fixed_v1 with new secondary traits
2.0.0 = cohort_percentile_v1
```

## 22. Research Guidance

For cohort research:

```text
- keep fixed normalization bounds across experiments
- report confidence with every score
- report sample size with every score
- report missing component rates
- compare raw and smoothed scores
- avoid ranking users by raw token volume
- avoid interpreting any quadrant as better or worse
```

Recommended cohort report fields:

```json
{
  "cohort": "anonymous_beta_users",
  "period": "2026-06",
  "algorithmVersion": "1.0.0",
  "x": {
    "p25": 31,
    "p50": 52,
    "p75": 68
  },
  "y": {
    "p25": 28,
    "p50": 49,
    "p75": 66
  },
  "confidence": {
    "high": 0.42,
    "medium": 0.37,
    "low": 0.16,
    "very_low": 0.05
  },
  "quadrants": {
    "Direct Executor": 0.29,
    "Agent Sprinter": 0.24,
    "Reflective Crafter": 0.21,
    "Agentic Architect": 0.26
  }
}
```

## 23. Suggested UI Copy

### 23.1 Header

```text
Your Agent Vibe Map
```

### 23.2 Explanation

```text
This map shows your AI coding usage style based on local aggregate telemetry. It does not measure skill, productivity, or code quality.
```

### 23.3 Axis Labels

```text
Manual Assistant Use <-> Agentic Workflow

Fast / Direct <-> Reflective / Iterative
```

### 23.4 Confidence Copy

```text
Confidence reflects how complete and stable the local data is for this period.
```

### 23.5 Privacy Copy

```text
This card is generated from aggregate usage patterns only. It does not include prompts, completions, source code, file paths, or repo names.
```

## 24. References and Design Rationale

This feature intentionally follows developer-analytics and milestone-display patterns rather than pure rankings.

- WakaTime demonstrates that developer activity and AI coding can be represented as metrics, dashboards, model efficiency, output, quality, and cost views.
- GitHub Achievements demonstrates the softer pattern of recognizing developer milestones and journey stages rather than only ranking users.
- Goodhart's Law is relevant because raw metrics can become distorted when treated as goals. For this reason, the map should avoid ranking users by total tokens or total spend alone.

Reference links:

- WakaTime AI coding analytics: https://wakatime.com/
- WakaTime Claude Code metrics: https://wakatime.com/claude-code-metrics
- GitHub Achievements announcement: https://github.blog/news-insights/product-news/introducing-achievements-recognizing-the-many-stages-of-a-developers-coding-journey/
- Goodhart's Law overview: https://en.wikipedia.org/wiki/Goodhart%27s_law

## 25. Version History

### 1.0.0

Initial version.

Key decisions:

```text
- X axis measures Agenticity.
- Y axis measures Deliberation.
- repoCount moved out of X axis into secondary traits.
- output/input ratio renamed to generationExpansion and reduced in weight.
- confidence includes both field reliability and sample size.
- anti-gaming rules added.
- privacy-safe public card guidance added.
```
