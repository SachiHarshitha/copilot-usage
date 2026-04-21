# promptstreak.dev — Agent-Agnostic Architecture Addendum

This document updates the current implementation plan so the system is not tightly coupled to GitHub Copilot. The goal is to make promptstreak.dev usable for **any coding agent**, with GitHub Copilot treated as only one supported adapter.

---

## 1. Goal Shift

### Old framing
Track and publish **GitHub Copilot** usage.

### New framing
Track and publish **coding-agent usage** across multiple providers, products, and surfaces.

GitHub Copilot becomes one adapter among many, alongside tools such as Claude Code, Codex CLI, Cursor, Aider, Cline, and future agent products.

This changes the product from a Copilot-specific stats site into an **agent observability and transparency layer**.

---

## 2. Core Principle

Do **not** model the system around one vendor's telemetry format.

Instead, model around these universal concepts:

1. **Provider** — GitHub, Anthropic, OpenAI, Google, Cursor, etc.
2. **Product** — Copilot, Claude Code, Codex CLI, Cursor, Aider, Cline
3. **Surface** — VS Code, terminal, browser, GitHub, cloud agent
4. **Run / Session** — one human-agent work session
5. **Model calls** — token usage, request counts, latency, cost
6. **Actions** — tool calls, terminal commands, file edits, patch applies, review comments
7. **Attribution** — repo, workspace, alias, or redacted project

This gives the platform a stable internal model even when external tools change.

---

## 3. Product-Level Changes

### What promptstreak.dev becomes
A public profile and leaderboard for **coding-agent usage**, not just Copilot usage.

### What users can compare
- Total agent usage across tools
- Usage by provider
- Usage by product
- Usage by model
- Usage by repo/project
- Usage by surface (IDE vs terminal vs browser)
- Action mix (edits, terminal commands, reviews, tool calls)

### What users can publish
- All-agent totals
- Per-product breakdown
- Per-provider breakdown
- Repo-level attribution
- Embeddable badges that can show:
  - total tokens
  - total requests
  - active tools used
  - favorite model
  - top repo

---

## 4. Replace Copilot-First Payload With a Vendor-Neutral Envelope

Your current payload is too specific to daily Copilot-style aggregation.

Introduce a normalized snapshot schema like this:

```ts
export type AgentSnapshot = {
  source: {
    adapter: string;          // "github-copilot-vscode" | "claude-code" | "cursor" | "codex-cli"
    adapterVersion: string;
    provider: string;         // "github" | "anthropic" | "openai" | "cursor"
    product: string;          // "copilot" | "claude-code" | "codex-cli" | "cursor"
    surface: string;          // "vscode" | "terminal" | "browser" | "github" | "cloud"
  };

  observedAt: string;
  deviceId: string;

  runs: Array<{
    runId: string;
    startedAt?: string;
    endedAt?: string;
    workspaceKey?: string;
    repoRef?: {
      mode: "github" | "alias" | "redacted";
      githubRepo?: string;
      aliasLabel?: string;
    };
    modelCalls: Array<{
      modelId: string;
      providerModelId?: string;
      inputTokens?: number;
      outputTokens?: number;
      cacheReadTokens?: number;
      cacheWriteTokens?: number;
      requestCount?: number;
      costMicros?: number;
      currency?: string;
      latencyMs?: number;
      sourceOfTruth: "provider" | "client" | "inferred";
    }>;
    actions: Array<{
      type: "tool_call" | "terminal_command" | "file_edit" | "diff_apply" | "review_comment";
      count?: number;
      filesTouched?: number;
    }>;
  }>;
};
```

This schema is flexible enough to support:
- raw token-based tools
- activity-only tools
- terminal-first agents
- IDE-first assistants
- API-backed agent adapters
- future providers without database redesign

---

## 5. Add an Adapter Layer

The ingestion system should use **adapters**.

Each adapter knows how to transform a tool's raw telemetry into the normalized `AgentSnapshot` format.

### Example adapters
- `github-copilot-vscode`
- `github-copilot-cli`
- `claude-code-local`
- `cursor-local`
- `codex-cli-local`
- `aider-local`
- `cline-local`

### Adapter responsibilities
- parse raw local data or provider output
- normalize model identifiers
- map raw activity into standard action types
- attach repo/workspace attribution
- label provenance and trust level
- emit a stable snapshot contract

This keeps the web app clean. The web app should not care how each tool stores its logs.

---

## 6. Add an Adapter Capability Registry

Not every tool exposes the same data.

Some can provide exact tokens.
Some only expose request counts.
Some can identify repos cleanly.
Some only know the current working directory.
Some provide provider-confirmed usage.
Others are inferred locally.

Add a capability registry per adapter:

```ts
export type AdapterCapabilities = {
  supportsTokens: boolean;
  supportsCosts: boolean;
  supportsRunIds: boolean;
  supportsRepoAttribution: boolean;
  supportsToolActions: boolean;
  supportsVerifiedProviderData: boolean;
};
```

### Why this matters
Without this, the product will accidentally assume that every tool can produce the same leaderboard fields.
That would create broken comparisons and misleading numbers.

---

## 7. Introduce Trust Levels

Agent telemetry should not be treated as equally reliable.

Store every metric with one of these trust levels:

### Level 1 — Verified provider
Numbers came from the provider's own billing, metrics, or official telemetry surface.

### Level 2 — Client observed
Numbers came from a local client, extension, or CLI that directly observed requests.

### Level 3 — Inferred
Numbers were estimated from partial local data, heuristics, or transformations.

### Why this matters
A vendor-neutral system must support both:
- highly trustworthy provider-reported usage
- unofficial but useful local estimates

This lets the UI be honest.

Examples:
- “Verified by provider”
- “Observed locally”
- “Estimated from local session data”

---

## 8. Separate Canonical Metrics From Optional Metrics

Some metrics are universal.
Others are tool-specific.

### Canonical metrics
Every adapter should try to populate these:
- `requestCount`
- `inputTokens`
- `outputTokens`
- `totalTokens`
- `cost`
- `repoIdentity`
- `provider`
- `product`
- `surface`
- `modelId`
- `lastSyncedAt`

### Optional metrics
Only some adapters can populate these:
- latency
- cache read/write tokens
- files touched
- patch count
- terminal commands run
- review comments generated
- acceptance rate
- lines changed

The UI and leaderboard should rely on canonical metrics first.
Optional metrics should enrich profiles, not define the whole system.

---

## 9. Update the Database Model

The current schema is strongly optimized around Copilot-style daily totals.
Keep the rollup strategy, but make the tables generic.

### Recommended model shape

#### `User`
Same purpose as now.

#### `Device`
Same purpose as now.

#### `AgentAdapter`
Stores known adapters and their capabilities.

#### `AgentRun`
One row per normalized run/session.

Suggested fields:
- `id`
- `userId`
- `deviceId`
- `provider`
- `product`
- `surface`
- `adapter`
- `runExternalId`
- `startedAt`
- `endedAt`
- `repoIdentity`
- `trustLevel`

#### `ModelUsageDaily`
Daily aggregated usage by dimensions.

Suggested dimensions:
- `userId`
- `deviceId`
- `date`
- `provider`
- `product`
- `surface`
- `modelId`
- `repoIdentity`

Suggested metrics:
- `requestCount`
- `inputTokens`
- `outputTokens`
- `totalTokens`
- `costMicros`
- `cacheReadTokens`
- `cacheWriteTokens`

#### `ActionUsageDaily`
Daily aggregated action counts.

Suggested dimensions:
- `userId`
- `deviceId`
- `date`
- `provider`
- `product`
- `surface`
- `repoIdentity`
- `actionType`

Suggested metrics:
- `count`
- `filesTouched`

#### `UserStat`
Rollup for fast profile and leaderboard reads.

#### `RepoStat`
Rollup per public repo identity.

#### `ProductStat`
Rollup per user + product.
Useful for profile breakdowns.

#### `ProviderStat`
Rollup per user + provider.
Useful for profile breakdowns.

#### `ModelStat`
Rollup per user + model.
Useful for favorite model sections.

#### `UploadLog`
Keep as best-effort audit.

---

## 10. New Rollup Strategy

Instead of computing only one user total and one repo total, compute these rollups on upload:

1. **UserStat** — overall usage across all agents
2. **RepoStat** — per public repo/project
3. **ProductStat** — per product per user
4. **ProviderStat** — per provider per user
5. **ModelStat** — per model per user
6. **SurfaceStat** — optional, per surface per user

This enables profile pages like:
- 62% Copilot, 24% Claude Code, 14% Codex CLI
- Top provider: Anthropic
- Most-used model: Claude Sonnet 4
- Most active surface: terminal

That is much more future-proof than a single Copilot total.

---

## 11. Badge Strategy Changes

Once the product becomes agent-agnostic, badge endpoints should support richer dimensions.

### Existing style
`/badge/[username].svg?stat=tokens`

### Expanded style
- `/badge/[username].svg?stat=tokens`
- `/badge/[username].svg?stat=requests`
- `/badge/[username].svg?stat=cost`
- `/badge/[username].svg?stat=top-model`
- `/badge/[username].svg?stat=top-product`
- `/badge/[username].svg?stat=top-provider`
- `/badge/[username].svg?stat=top-repo`

### Product-specific views
- `/badge/[username].svg?product=copilot&stat=tokens`
- `/badge/[username].svg?product=claude-code&stat=requests`
- `/badge/[username].svg?provider=openai&stat=tokens`

This lets users show off their actual stack instead of only one tool.

---

## 12. Leaderboard Strategy Changes

Do not keep only one leaderboard.

Support multiple leaderboard dimensions:

### Core leaderboards
- Total tokens
- Total requests
- Estimated cost
- Premium / advanced usage

### Sliceable leaderboards
- By product
- By provider
- By model
- By repo
- By time window

### Recommended default UI
- Global leaderboard
- Product tabs: All / Copilot / Claude Code / Cursor / Codex CLI
- Time filter: all-time / 30d / 7d
- Sort: tokens / requests / cost

This makes the site useful even if different users use different agents.

---

## 13. Attribution Logic Must Stay Generic

Your existing repo identity model is already good.
Keep it.

For any coding agent, the attribution logic should stay:
- detect Git remote when available
- allow alias label
- allow redaction
- never require raw filesystem path publication

### Recommended invariant
Every adapter must output one of:
- `github:owner/repo`
- `alias:Some Project`
- redacted / omitted

That is stable and product-neutral.

---

## 14. Keep Provider-Specific Parsing Out of the Web App

Do not let the Next.js app parse raw logs for every tool.

The web app should only accept normalized snapshots.

### Why
- easier to maintain
- safer privacy boundary
- faster ingestion logic
- easier community contribution
- makes adapter development independent from the web deployment

This also opens the door for a plugin ecosystem later.

---

## 15. Recommended Monorepo Structure

```text
apps/
  web/
  vscode-extension/
  cli/

packages/
  shared-schema/
  adapter-core/
  adapter-github-copilot/
  adapter-claude-code/
  adapter-cursor/
  adapter-codex-cli/
  adapter-aider/
  adapter-cline/
```

### Package roles
- `shared-schema` — normalized snapshot contracts and shared enums
- `adapter-core` — common utilities, trust levels, repo identity helpers, model normalization helpers
- adapter packages — one parser/collector per agent product

This keeps the system modular and scalable.

---

## 16. Suggested Shared Enums

```ts
export type TrustLevel = "verified" | "observed" | "inferred";

export type Surface = "vscode" | "terminal" | "browser" | "github" | "cloud";

export type ActionType =
  | "tool_call"
  | "terminal_command"
  | "file_edit"
  | "diff_apply"
  | "review_comment";
```

Also add stable enums or normalized strings for:
- provider IDs
- product IDs
- model families
- repo identity modes

---

## 17. How to Migrate From the Current Copilot-Only Design

You do **not** need to rewrite the project from scratch.

### Step 1
Rename current concepts:
- “Copilot usage” → “agent usage”
- “model breakdown” stays
- “workspace / repo attribution” stays

### Step 2
Wrap the current GitHub Copilot uploader in the first adapter:
- adapter name: `github-copilot-vscode`
- trust level: `observed` or `inferred`, depending on the source

### Step 3
Evolve the shared schema from `SnapshotPayload` to `AgentSnapshot`

### Step 4
Expand the DB schema with product/provider/surface dimensions

### Step 5
Update the UI copy:
- leaderboard becomes “Coding Agent Leaderboard”
- profile becomes “Agent Usage Profile”
- badges become “Agent Stats Badges”

### Step 6
Add one more adapter after Copilot, ideally terminal-first
A second adapter validates the architecture much better than theoretical future support.

---

## 18. Recommended v1.5 Scope

After the current Copilot integration works, the best next milestone is:

### v1.5
Support **multiple coding agents** with the same public profile.

Recommended order:
1. GitHub Copilot VS Code adapter
2. Claude Code adapter
3. Codex CLI adapter
4. Cursor adapter

This gives strong market coverage without trying to support everything at once.

---

## 19. Updated Positioning

### Old positioning
A public layer for GitHub Copilot usage.

### New positioning
A **developer-facing observability layer for AI coding agents**.

Possible copy:

> Track how you use coding agents across IDEs, terminals, and tools. Publish your usage, attribute it to repos, and show your workflow with live badges and public profiles.

Alternative:

> promptstreak.dev is the public scoreboard for coding-agent usage — across Copilot, Claude Code, Codex CLI, Cursor, and future tools.

---

## 20. Top Recommendations

### 1. Generalize the schema now
Do not wait until after several integrations. This is the cheapest moment to abstract the model.

### 2. Build around adapters
Every agent should map into one normalized envelope.
Never let product-specific log formats leak into the web layer.

### 3. Track provenance and trust
Store whether a number is verified, observed, or inferred.
That honesty will matter more as the platform grows.

### 4. Keep leaderboard math based on canonical metrics
Use tokens, requests, cost, provider, product, model, and repo as the backbone.
Treat everything else as enrichment.

### 5. Keep repo attribution consent-based
Your current repo identity strategy is already compatible with a multi-agent future.
Preserve it.

---

## 21. Final Conclusion

The right optimization is not a small tweak to the current Copilot logic.

It is a **schema and architecture pivot**:
- from **Copilot-specific ingestion**
- to **adapter-based agent observability**

If you make that shift now, promptstreak.dev can support any current or future coding agent without redesigning the product each time a new tool gains traction.

Copilot then becomes simply:
- one adapter
- one product tab
- one slice of the leaderboard
- one source of usage inside a much larger system

That is the durable version of the idea.
