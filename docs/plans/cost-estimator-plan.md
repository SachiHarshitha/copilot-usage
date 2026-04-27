# Implementation Plan: Copilot Cost Estimation (Isolated Module)

> **Source spec:** [`docs/copilot_cost_estimation_feature_doc.md`](../copilot_cost_estimation_feature_doc.md)
> **Status:** Draft — pre-implementation
> **Goal:** Ship a useful, honest cost-impact preview that can be **deleted in one PR** if it stops being valuable.

---

## 1. Overview

Add a **Cost Estimator** page to the VS Code extension that translates locally-observed Copilot usage into estimated AI Credits under GitHub's June 2026 usage-based billing model.

The implementation must be **fully isolated** under a single feature folder so we can:
- delete it by removing one folder + one button + one command,
- toggle it off via a single feature flag,
- evolve pricing data without touching analytics code.

---

## 2. Architecture Decisions

### D1. Single feature folder (hard isolation)
All cost-estimator code lives under `src/features/costEstimator/`. The rest of the extension imports **only** from `costEstimator/index.ts` (the public surface).

Rationale: a deleteable feature is a folder, a flag, and a button. Anything else leaks.

### D2. Read-only consumer of existing core
The estimator **never modifies** `core/parser.ts`, `core/aggregator.ts`, or `core/types.ts`. It consumes `RequestEvent[]` via the same path the dashboard uses.

Rationale: avoids regressing existing analytics; lets us delete the estimator without rollback risk.

### D3. Pure calculation, separated from UI
Pricing tables, allowance tables, and math live in plain `.ts` modules with no VS Code or DOM imports. Only the panel layer touches `vscode.*` and HTML.

Rationale: testable without the extension host; replaceable rendering layer.

### D4. Feature flag at the edge
A single `enableCostEstimator` flag in `costEstimator/flags.ts` gates:
- the dashboard button rendering,
- the command registration,
- the panel class export.

Rationale: one switch turns the feature off without code removal.

### D5. Estimate, not authority
All UI copy and types use the word "estimated". No code path may compute a number labelled as "actual cost" or "your bill".

Rationale: protects users and us from misleading claims.

### D6. No new runtime dependencies
The estimator reuses Chart.js (already loaded via CDN in the dashboard) and the existing webview infrastructure. No new npm packages.

Rationale: keeps VSIX small; no supply-chain expansion.

---

## 3. Isolation Boundary

```
src/
├── core/              ← UNCHANGED. No imports FROM costEstimator.
├── views/
│   ├── panels.ts      ← Adds 1 button + 1 message handler. ~15 lines.
│   └── ...
├── extension.ts       ← Registers 1 command behind flag. ~5 lines.
└── features/
    └── costEstimator/   ← EVERYTHING ELSE LIVES HERE
        ├── index.ts             ← Public surface (CostEstimatorPanel + flag)
        ├── flags.ts             ← enableCostEstimator
        ├── panel.ts             ← VS Code WebviewPanel class
        ├── html.ts              ← Page HTML generator
        ├── settings.ts          ← Read/write globalState
        ├── pricing/
        │   ├── models.ts        ← MODEL_PRICING table
        │   ├── plans.ts         ← PLAN_ALLOWANCES table
        │   └── metadata.ts      ← Effective dates, currency, source
        ├── calc/
        │   ├── usage.ts         ← Aggregate events → UsageEstimate
        │   ├── cost.ts          ← UsageEstimate × ModelPricing → CostEstimate
        │   ├── plan.ts          ← Plan fit + overage logic
        │   └── trend.ts         ← Last-30 vs 3-mo-avg comparison
        ├── types.ts             ← All feature types
        └── __tests__/
            ├── cost.test.ts
            ├── plan.test.ts
            ├── usage.test.ts
            └── trend.test.ts
```

**Deletion procedure (verified during planning):**
1. `rm -rf src/features/costEstimator/`
2. Remove the cost-estimator button from `views/panels.ts` (one block).
3. Remove the command registration from `extension.ts` (one block).
4. Remove the `openCostEstimator` message handler from `views/panels.ts` (one if-statement).
5. Run `npm run compile` — should pass with zero edits elsewhere.

---

## 4. Out of Scope (Phase 1)

Explicitly deferred to keep Phase 1 small:

- Custom date range picker (use existing 7d/30d/3m/all options)
- Export to Markdown / CSV
- Actual model-mix estimation (use single selected model)
- Trend chart visualisation (text-only trend insight is enough)
- Remote pricing config sync
- GitHub Billing API integration
- Workspace-level vs global split for the estimator
- Multi-model "what if I switch?" savings cards

These are listed in spec §31 as future enhancements and stay there.

---

## 5. Task List

### Phase 1: Foundation (data + math, no UI yet)

#### Task 1: Scaffold the isolated feature folder + flag
**Description:** Create `src/features/costEstimator/` with `index.ts`, `flags.ts`, and an empty `types.ts`. Verify nothing else in the codebase imports from this folder yet.

**Acceptance criteria:**
- [ ] Folder exists with three files
- [ ] `flags.ts` exports `enableCostEstimator: boolean = true`
- [ ] `index.ts` re-exports nothing yet (placeholder)
- [ ] `npm run compile` passes

**Files touched:** `src/features/costEstimator/{index,flags,types}.ts`
**Scope:** XS · **Dependencies:** none

---

#### Task 2: Define types
**Description:** Implement all interfaces from spec §13.1, §14.1, §14.2, §15, §19 in `types.ts`. No logic — just types.

**Acceptance criteria:**
- [ ] `ModelPricing`, `UsageEstimate`, `CostEstimate`, `PlanAllowance`, `PlanImpactEstimate`, `CostEstimatorSettings`, `CopilotPlan`, `CopilotBillingModel` all exported
- [ ] `npm run compile` passes

**Files touched:** `src/features/costEstimator/types.ts`
**Scope:** XS · **Dependencies:** Task 1

---

#### Task 3: Pricing tables
**Description:** Create `pricing/models.ts`, `pricing/plans.ts`, `pricing/metadata.ts` populated from spec §12 and §13. Keep all numbers in one place; UI never inlines a price.

**Acceptance criteria:**
- [ ] `MODEL_PRICING` includes all 8 models from spec §13.2
- [ ] `PLAN_ALLOWANCES` includes free, pro, pro_plus, business, enterprise from spec §12
- [ ] `PRICING_METADATA` includes `effectiveDate`, `lastVerified`, `aiCreditUsdValue`
- [ ] Each table has a single-line comment citing the spec section it mirrors
- [ ] `npm run compile` passes

**Files touched:** `src/features/costEstimator/pricing/*.ts`
**Scope:** S · **Dependencies:** Task 2

---

#### Task 4: Cost calculation with tests (TDD)
**Description:** Implement `calc/cost.ts` with `estimateModelCost(usage, pricing) → CostEstimate` using the formula from spec §14.3. **Write tests first** for spec §28.1 and §28.4.

**Acceptance criteria:**
- [ ] Test: 10M input + 300K output @ Claude Opus 4.7 → $57.50, 5750 credits (spec §28.1)
- [ ] Test: undefined cache fields treated as 0, no NaN (spec §28.4)
- [ ] Test: cached input + cache write costs sum correctly when present
- [ ] AI Credits = `Math.ceil(usd * 100)`
- [ ] Pure function: no side effects, no I/O

**Files touched:** `calc/cost.ts`, `__tests__/cost.test.ts`
**Scope:** S · **Dependencies:** Task 3

---

#### Task 5: Usage normalization with tests (TDD)
**Description:** Implement `calc/usage.ts` with `buildUsageEstimate(events, range) → UsageEstimate` that normalizes observed tokens to a 30-day month using the existing `RequestEvent[]` shape.

**Acceptance criteria:**
- [ ] Test: 7-day range with 1.8M input tokens → `monthlyInputTokens ≈ 7.71M`
- [ ] Test: empty events → all zeros, `dataCompleteness: 'missing_cache_data'`
- [ ] Test: events without timestamps are skipped
- [ ] `ESTIMATION_MONTH_DAYS = 30` exported as a constant
- [ ] No imports from `vscode` or DOM

**Files touched:** `calc/usage.ts`, `__tests__/usage.test.ts`
**Scope:** S · **Dependencies:** Task 4

---

#### Task 6: Plan-impact logic with tests (TDD)
**Description:** Implement `calc/plan.ts` with `computePlanImpact(estimate, settings) → PlanImpactEstimate` covering spec §15.

**Acceptance criteria:**
- [ ] Test: 5750 credits on Pro+ → overage 1850, extra $18.50 (spec §28.2)
- [ ] Test: extra budget $25 covers 1850-credit overage (spec §28.3)
- [ ] Test: Business plan emits pooled-allowance warning (spec §28.5)
- [ ] Test: mobile billing emits "no extra credits" warning
- [ ] Test: annual billing emits transition warning
- [ ] Warnings are pushed as plain strings to `result.warnings[]`

**Files touched:** `calc/plan.ts`, `__tests__/plan.test.ts`
**Scope:** S · **Dependencies:** Task 5

---

#### Task 7: Trend insight with tests (TDD)
**Description:** Implement `calc/trend.ts` returning `{ label: string } | null` comparing last-30-day monthly estimate vs 3-month average. Returns `null` when < 30 days of data exist.

**Acceptance criteria:**
- [ ] Test: 30d avg > 3mo avg by 42% → "Your last 30 days are 42% higher…"
- [ ] Test: 30d avg < 3mo avg by 18% → "Your last 30 days are 18% lower…"
- [ ] Test: < 30 days of events → returns `null`

**Files touched:** `calc/trend.ts`, `__tests__/trend.test.ts`
**Scope:** S · **Dependencies:** Task 5

---

### ✅ Checkpoint A: Math layer complete
- [ ] All `__tests__/*.ts` pass
- [ ] `npm run compile` passes
- [ ] Zero imports from `vscode` or DOM in `calc/` or `pricing/`
- [ ] `core/` directory unchanged (verify with `git diff src/core/`)

---

### Phase 2: UI layer (panel + page)

#### Task 8: Settings persistence
**Description:** Implement `settings.ts` with `loadSettings(context)` and `saveSettings(context, settings)` backed by `globalState`. Default values per spec §19.

**Acceptance criteria:**
- [ ] Defaults: plan='pro_plus', billing='individual_monthly', extraBudgetUsd=0, selectedModelId='claude-sonnet-4.6', defaultRange='last_30_days'
- [ ] Round-trip: save then load returns identical object
- [ ] One key in globalState: `costEstimator.settings.v1` (versioned for future migration)

**Files touched:** `settings.ts`
**Scope:** XS · **Dependencies:** Checkpoint A

---

#### Task 9: HTML generator
**Description:** Implement `html.ts` with `getCostEstimatorHtml(state) → string` rendering setup card, range selector, plan-impact card, monthly usage cards, model comparison table, trend insight, and warnings. Use the existing `commonStyles()` pattern from `views/panels.ts`.

**Acceptance criteria:**
- [ ] Reuses VS Code theme variables (no hardcoded colours)
- [ ] Renders top + bottom disclaimers verbatim from spec §8.4 and §8.5
- [ ] Setup-card selects post `setSetting` messages back to host
- [ ] Range selector reuses `📅` emoji set for visual parity with dashboard
- [ ] Model comparison table includes all 8 models with Fits Pro / Fits Pro+ columns
- [ ] No `<script src=…>` for new dependencies (Chart.js only if a chart is added)

**Files touched:** `html.ts`
**Scope:** M · **Dependencies:** Task 8

---

#### Task 10: WebviewPanel class
**Description:** Implement `panel.ts` with `CostEstimatorPanel` following the existing `DashboardPanel` pattern (singleton, `createOrShow`, message handler, dispose). It pulls events the same way `DashboardPanel.loadData()` does.

**Acceptance criteria:**
- [ ] Singleton pattern matches existing panels
- [ ] `loadData()` calls `discoverWorkspaces → parseAllFiles → flattenEvents` then feeds the result to `buildUsageEstimate / estimateModelCost / computePlanImpact`
- [ ] Message handlers: `setSetting`, `setRange`, `refresh`, `openDashboard`, `openGitHub`
- [ ] Setting changes persist via `settings.ts` and re-render
- [ ] Loading state shown via existing `loadingPage()` helper (need to export it from `views/panels.ts`)
- [ ] `public static refresh()` static method for external triggering (parity with other panels)

**Files touched:** `panel.ts`, plus exporting `loadingPage` from `views/panels.ts`
**Scope:** M · **Dependencies:** Task 9

---

#### Task 11: Public surface
**Description:** Wire `index.ts` to export only what the rest of the extension needs.

**Acceptance criteria:**
- [ ] Exports: `CostEstimatorPanel`, `enableCostEstimator`
- [ ] No internal types/functions leak

**Files touched:** `index.ts`
**Scope:** XS · **Dependencies:** Task 10

---

### ✅ Checkpoint B: Feature is reachable
- [ ] Manually open the panel via `vscode.commands.executeCommand('copilot-usage.costEstimator')` in dev host
- [ ] Selectors persist across panel reopen
- [ ] All warnings render correctly when their conditions are met

---

### Phase 3: Integration (the 3 touch points)

#### Task 12: Register the command
**Description:** In `extension.ts`, register `copilot-usage.costEstimator` **only if** `enableCostEstimator` is true. Add it to `package.json` `contributes.commands`.

**Acceptance criteria:**
- [ ] Command registration is wrapped in `if (enableCostEstimator) { … }`
- [ ] `package.json` lists the command with title "Copilot Usage: Cost Estimator (Preview)" and `$(calculator)` icon
- [ ] Command appears in command palette
- [ ] `refreshAll()` includes `CostEstimatorPanel.refresh()`

**Files touched:** `extension.ts`, `package.json`
**Scope:** XS · **Dependencies:** Task 11

---

#### Task 13: Add dashboard button
**Description:** Add a `🧮 Cost Estimator` button to the `DashboardPanel` header (only). Posts an `openCostEstimator` message; host opens the panel. Gated on the flag.

**Acceptance criteria:**
- [ ] Button only renders when `enableCostEstimator === true`
- [ ] `WorkspacePanel` does **not** get the button (keep workspace view focused)
- [ ] Tooltip: "Open Cost Estimator (Preview)"
- [ ] Clicking opens the panel beside the dashboard

**Files touched:** `views/panels.ts` (one button + one message handler)
**Scope:** XS · **Dependencies:** Task 12

---

### ✅ Checkpoint C: End-to-end
- [ ] User opens dashboard → clicks 🧮 → sees cost estimator
- [ ] Changing plan / range updates all numbers
- [ ] Disclaimers visible at top and bottom
- [ ] Light theme + dark theme both readable
- [ ] All math tests still pass
- [ ] `git diff src/core/` shows zero changes

---

### Phase 4: Polish + ship

#### Task 14: README + screenshot
**Description:** Add a "Cost Estimator (Preview)" section to `apps/vscode-extension/README.md` with one screenshot. Mark as preview; link to the spec doc.

**Acceptance criteria:**
- [ ] Section under existing feature list
- [ ] One PNG saved to `docs/images/vscode_cost_estimator.png`
- [ ] Disclaimer reproduced in the README

**Files touched:** `apps/vscode-extension/README.md`, `docs/images/vscode_cost_estimator.png`
**Scope:** XS · **Dependencies:** Checkpoint C

---

#### Task 15: Build + manual smoke test
**Description:** Run the existing `scripts/build-vsix.ps1`, install locally, walk through all six setup-card combinations + four range options + at least three models.

**Acceptance criteria:**
- [ ] VSIX builds clean
- [ ] No console errors in the webview
- [ ] All warnings appear under the right conditions
- [ ] Numbers match a hand-calculated example for one configuration

**Files touched:** none
**Scope:** S · **Dependencies:** Task 14

---

## 6. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Pricing changes before launch (June 1, 2026) | High | All pricing in one file (`pricing/models.ts`) with `lastVerified` date; release-notes prompt before each release. |
| Users misread "estimate" as "bill" | High | Two disclaimers (top + bottom), "Preview" badge, "Estimate only" labels on every result. |
| Cache token data unavailable from session files | Medium | Already handled in spec §14.3; tests cover undefined → 0 path. UI shows "cache data unavailable" note. |
| Code completions tracked as billable events | High | `buildUsageEstimate` filters out events flagged as completions if such a flag is added later; spec §18.1 documents the carve-out. **Phase 1 assumes session-file events are already chat-only — verify in Task 5 test.** |
| Feature scope creep (charts, exports, scenarios) | Medium | Out-of-scope list (§4) is the contract. New ideas go to spec §31. |
| Adding npm deps breaks the no-deps invariant | Low | Code review check: any `package.json` diff in this PR fails review unless explicitly justified. |

---

## 7. Open Questions

1. **Default selected model** — pick `claude-sonnet-4.6` (Pro+ default mid-tier) or detect from observed events?
   *Proposal: Phase 1 hardcodes `claude-sonnet-4.6`; Phase 2 adds detection from event mix.*

2. **What counts as a "billable event" in our session-file data?**
   We currently parse `chatSessions/*.jsonl`. Are these all chat (billable) or do they include code-completion telemetry?
   *Action: confirm via spot-check in Task 5 before publishing pricing numbers.*

3. **Do we expose a setting (`copilot-usage.costEstimator.enabled`) or only the source flag?**
   *Proposal: Phase 1 ships source flag only; add user setting in Phase 2 if anyone asks.*

4. **Should the dashboard auto-refresh propagate to the cost estimator?**
   *Proposal: yes — `refreshAll()` already calls `*.refresh()` for open panels; consistent UX.*

---

## 8. Verification That Isolation Holds

Before merging Phase 1, run:

```powershell
# 1. core/ unchanged
git diff --stat apps/vscode-extension/src/core/
# expected: empty

# 2. only 3 files outside features/costEstimator/ are touched
git diff --stat apps/vscode-extension/src/ apps/vscode-extension/package.json `
  | Where-Object { $_ -notmatch 'features/costEstimator' }
# expected: extension.ts, views/panels.ts, package.json — and nothing else

# 3. deletion dry-run compiles
# (manually) comment out the costEstimator imports in extension.ts and views/panels.ts,
# delete the folder, run `npm run compile` — must pass.
```

If any of these fail, isolation is broken and the PR should not merge.
