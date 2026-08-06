# Metered Usage (Copilot-billed) — Implementation Plan

Status: proposed
Owner: extension / `apps/vscode-extension`
Related: `docs/plans/cost-estimator-plan.md`, `/memories/repo/usage-reconciliation.md`

---

## 1. Problem

The dashboard reports **request-level** usage parsed from `chatSessions/*.jsonl`. GitHub Copilot
bills **model-round-level** usage. For agentic runs these diverge badly.

Measured example (Aug 2026, session `e45a8d32-…`):

| Source | Requests | Prompt tokens | Credits |
| --- | --- | --- | --- |
| `chatSessions` (what we show) | 7 | 624,856 | ~376 |
| `debug-logs` (what Copilot bills) | 138 `llm_request` | 15,476,435 | 1,414 |

Observed Copilot UI value: **1,452** credits → our debug-log total is within **2.7%**.

This is **not a discovery bug**. It is a data-layer mismatch. The fix is to read the second
source and present both.

## 2. Data source facts (verified)

Path: `<storageRoot>/<workspaceId>/GitHub.copilot-chat/debug-logs/<sessionId>/main.jsonl`

JSONL rows of interest:

| `type` | Fields used |
| --- | --- |
| `session_start` | `attrs.copilotVersion`, `attrs.vscodeVersion` |
| `user_message` | count only (→ user-visible request count) |
| `llm_request` | `attrs.model`, `attrs.inputTokens`, `attrs.outputTokens`, `attrs.cachedTokens`, `attrs.copilotUsageNanoAiu`, `ts` |

Key semantics:

- `credits = copilotUsageNanoAiu / 1e9`. It is a **billing amount only** — it does not encode
  token counts. Token volume must come from `inputTokens` / `outputTokens` / `cachedTokens`.
- `inputTokens` includes cached tokens; `cachedTokens` is the discounted subset. Do **not**
  add them together.

**Availability (scanned 144 sessions, Feb 2026 → Aug 2026):**

| Month | `llm_request` rows | With `copilotUsageNanoAiu` | Coverage |
| --- | --- | --- | --- |
| 2026-02 … 04 | 0 | 0 | no local data |
| 2026-05 | 3,133 | 32 | **1.02%** |
| 2026-06 | 993 | 988 | 99.5% |
| 2026-07 | 496 | 491 | 98.99% |
| 2026-08 | 192 | 190 | 98.96% |

By Copilot version: `0.47.0` 0% · `0.48.0` 0% · `0.48.1` 14.7% · `0.51.0`+ ≥97.8%.

**Consequence:** the field rolled out ~late May 2026. Historical months cannot be reconciled.
Every metered number must carry a coverage/confidence signal, and the UI must degrade to the
estimate when coverage is low. This constraint drives most of the UI design below.

## 3. Design decisions

| Decision | Rationale |
| --- | --- |
| Metered data is a **separate, parallel dataset** — not a patch onto `RequestEvent` | Different grain (model round vs user request). Merging would corrupt existing stats and the Excel export. |
| Add a **lens toggle** (`Developer` / `Billing`) rather than duplicating cards | The KPI grid is already at 8 cards; doubling breaks `minmax(130px, 1fr)`. |
| Consolidate 8 cards → 6 to free two slots | Prompt+Output → `Tokens`; Workspaces+Sessions → `Scope`. |
| Metered credits come **only** from `copilotUsageNanoAiu`, never recomputed from rates | Recomputing reintroduces the estimation error we are trying to expose. |
| No repo attribution for metered data | Debug logs carry no reliable repo signal. Repositories table stays request-based. |
| Reuse the debug-log directory walk from `credits.ts` | `findNewestCatalog()` already traverses the identical path shape. |

## 4. Type additions

In `src/core/types.ts` — additive only, no edits to existing interfaces:

```
MeteredRound      { sessionId, workspaceId, modelId, timestampMs,
                    inputTokens, outputTokens, cachedTokens,
                    credits, hasCredits: boolean }

MeteredTotals     { rounds, userMessages, inputTokens, outputTokens,
                    cachedTokens, credits,
                    roundsWithCredits, coverage /* 0..1 */,
                    copilotVersions: string[] }

MeteredModelStat  { modelId, rounds, inputTokens, outputTokens, credits, coverage }

Reconciliation    { visibleRequests, meteredRounds, roundsPerRequest,
                    visibleTokens, meteredTokens, tokenAmplification,
                    estimatedCredits, meteredCredits, creditDelta,
                    confidence: 'exact' | 'partial' | 'unavailable' }
```

`KpiTotals` is **not** modified. Metered values travel alongside it.

Confidence thresholds: `coverage >= 0.95` → `exact`; `>= 0.10` → `partial`; else `unavailable`.

---

## 5. Increments

Follow `.github/copilot-instructions.md`: failing test first, `npm test` after each step, one
increment per commit, no formatting changes mixed in.

### Increment 1 — Metered log parser (pure, no `vscode`)

**New file:** `src/core/meteredUsage.ts`
**New test:** `src/test/meteredUsage.parser.test.ts`

Functions to implement:

1. `parseMeteredLine(line: string): MeteredRound | 'user_message' | undefined`
   - `JSON.parse` in a `try/catch`; malformed lines return `undefined` (logs are appended live
     and the last line is frequently truncated — this is expected, not an error).
   - Only `type === 'llm_request'` and `type === 'user_message'` produce output.
   - `hasCredits = typeof attrs.copilotUsageNanoAiu === 'number'`; `credits = value / 1e9`.
   - Normalize `attrs.model` through the existing `normalizeResolvedModel` in `parser.ts`
     (export it if it is currently module-private) so model ids join with `ModelStats`.

2. `parseMeteredFile(filePath, workspaceId): Promise<{ rounds, userMessages, versions }>`
   - Stream or read-and-split on `/\r?\n/`. Capture `copilotVersion` from `session_start`.
   - Session id = the parent directory name, not a field.

**Tests (write first, all must fail before implementation):**
- row with `copilotUsageNanoAiu: 8420000000` → `credits === 8.42`, `hasCredits === true`
- row without the field → `credits === 0`, `hasCredits === false`
- truncated final line → skipped, earlier rows still returned
- `user_message` rows counted, not treated as rounds
- non-`llm_request` types ignored

**Acceptance:** `npm test` green; zero `vscode` imports in the module.

### Increment 2 — Discovery of debug-log files

**Edit:** `src/core/discovery.ts`

1. Add `debugLogFiles?: string[]` to `WorkspaceInfo` (optional → no existing call site breaks).
2. New exported `discoverDebugLogFiles(wsDir: string): Promise<string[]>` returning every
   `GitHub.copilot-chat/debug-logs/*/main.jsonl`.
3. In `discoverWorkspaces()`, populate `debugLogFiles`.
   - **Critical:** the current early-`continue` requires a `chatSessions` directory. A workspace
     with debug logs but no `chatSessions` would be dropped. Restructure so a workspace is kept
     when **either** source has files.
   - Extend the existing merge loop to union `debugLogFiles` across stable/Insiders roots.

**Test:** extend `src/test/discovery.test.ts` with a temp-dir fixture containing
`GitHub.copilot-chat/debug-logs/<sid>/main.jsonl` and no `chatSessions`; assert the workspace
is still returned and the file is listed.

**Acceptance:** existing discovery tests still pass unchanged.

### Increment 3 — Metered aggregation + reconciliation

**Edit:** `src/core/meteredUsage.ts` (add), **new test:** `src/test/meteredUsage.aggregate.test.ts`

1. `aggregateMetered(rounds, userMessages, versions): MeteredTotals`
   - `coverage = roundsWithCredits / rounds` (guard divide-by-zero → `0`).
2. `computeMeteredModelStats(rounds): MeteredModelStat[]` — sorted by credits desc.
3. `computeMeteredDaily(rounds): { date, credits, inputTokens, outputTokens, rounds }[]`
   - Reuse the **local-time** date key format from `computeDailyStats` so the two chart series
     align on the same buckets.
4. `reconcile(kpis: KpiTotals, metered: MeteredTotals): Reconciliation`
   - `roundsPerRequest = rounds / visibleRequests`
   - `tokenAmplification = meteredTokens / visibleTokens`
   - all ratios guard against zero denominators → `0`.
5. Date filtering: add `filterMeteredByRange(rounds, startMs)` mirroring
   `filterEventsByDateRange` so the lens obeys the existing date-range setting.

**Tests:** known fixture reproducing the measured case — 7 user messages / 138 rounds →
`roundsPerRequest ≈ 19.7`, `credits ≈ 1414.24`, `confidence === 'exact'`. Plus a zero-round
input asserting no `NaN`/`Infinity` anywhere in the returned object.

### Increment 4 — Panel wiring

**Edit:** `src/views/panels.ts` — `WorkspacePanel.loadData()` and `DashboardPanel.loadData()`

After the existing `computeDailyStats(...)` call:
- Load metered files from the discovered workspace(s), parse, filter by the same date range,
  aggregate, and reconcile against `kpis`.
- Wrap in `try/catch` → on failure pass `undefined` metered data. **The dashboard must never
  fail to render because debug logs are absent or malformed.**
- Skip entirely when `isCopilotDebugLogEnabled()` is false, and keep showing the existing
  `debugLogBanner` — that banner is now the primary call-to-action for enabling the feature.

Pass metered + reconciliation into `getWorkspaceHtml` / `getDashboardHtml`.

**Performance:** parsing all `main.jsonl` on every refresh is the main risk (auto-refresh can be
30s). Add an in-memory cache keyed by `filePath` → `{ mtimeMs, size, result }`; re-parse only
when `mtimeMs` or `size` changed. Defer incremental byte-offset reads unless profiling shows a
need.

### Increment 5 — UI redesign

**Edit:** `src/views/panels.ts` (HTML + `commonStyles()`)

**5a. Card consolidation (8 → 6)** — `kpiCard()` already accepts a sub-line:

| Card | Value | Sub |
| --- | --- | --- |
| Requests | `215` | `≈ 60/mo` |
| Tokens | `19.3M` | `19.1M in / 193K out` |
| Tool Rounds | `2,868` | — |
| Premium | `2330.0×` | `≈ 647.9/mo` |
| Credits | *see 5b* | *see 5b* |
| Scope | `20` | `20 sessions · 3 repos` |

**5b. Dual-value Credits card** — new `kpiCardDual(label, primary, secondary, badge)`:
primary = metered credits, secondary = `≈ 376 visible`, badge = confidence pill.
When metered is unavailable, fall back to the current single-value card unchanged.

**5c. Reconciliation strip** — one flex row between `.kpi-row` and `.charts-row`:

> Copilot metered **1,452** · your estimate **376** · amplification **3.9×** ·
> rounds **138** vs prompts **7** · coverage **99%**

Single line, `flex-wrap: wrap`, muted foreground. Hidden entirely when metered data is absent.

**5d. Lens toggle** — segmented control in `.header-actions`, posting
`{ command: 'setLens', lens: 'developer' | 'billing' }`. Persist via
`context.workspaceState` (or a `copilot-usage.dashboard.lens` setting) and re-render.
`billing` is disabled with a tooltip when confidence is `unavailable`.

**5e. Confidence pill** — `.pill-exact` / `.pill-partial` / `.pill-unavailable`, using
`var(--vscode-charts-green|yellow|red)` so it respects the user's theme.

**5f. Charts** — add a `Tokens | Credits` toggle to the daily chart rather than a new chart.
Model Distribution donut is unchanged.

**5g. Models table** — one added `Metered` column beside the existing estimated `Credits`.
Render `—` per row when that model has no metered rows.

**Escaping:** every interpolated value must go through the existing `esc()` helper. Model ids
and versions originate from files on disk and are untrusted input to the webview.

### Increment 6 — Excel export parity

**Edit:** `src/export/reportModel.ts`, `src/export/exportCommand.ts`, tests in
`src/test/export.reportModel.test.ts`

- Add optional `metered` + `reconciliation` to `DashboardSnapshot`.
- Add a `Metered Usage` sheet (per-model rounds / tokens / credits / coverage) and a
  `Reconciliation` block on the summary sheet.
- Bump `schemaVersion` in `ReportMeta`.
- The export contract is "the numbers on screen" — if the panel renders the billing lens, the
  workbook must contain both datasets regardless of active lens.

---

## 6. Settings to add (`package.json` → `contributes.configuration`)

| Key | Type | Default | Purpose |
| --- | --- | --- | --- |
| `copilot-usage.metered.enabled` | boolean | `true` | Master switch for debug-log parsing |
| `copilot-usage.dashboard.lens` | enum `developer` \| `billing` | `developer` | Default lens |
| `copilot-usage.metered.minCoverage` | number | `0.95` | Threshold for the `exact` pill |

## 7. Risks & edge cases

| Risk | Mitigation |
| --- | --- |
| Debug logging disabled → no metered data | Existing banner; lens disabled, not broken |
| Pre-June-2026 ranges show `unavailable` | Expected; strip explains it instead of showing a wrong number |
| Large `main.jsonl` on 30s auto-refresh | mtime/size cache (Increment 4) |
| Truncated last line while Copilot writes | Parser skips silently by design |
| Log retention shorter than the date range | Metered totals under-report on long ranges — surface the metered window start in the strip |
| Double counting across stable + Insiders | Dedupe by absolute file path, same as `sessionFiles` |

## 8. Out of scope

- Repo-level attribution of metered usage
- Backfilling months before the `copilotUsageNanoAiu` rollout
- Any network call — the extension stays local-first
