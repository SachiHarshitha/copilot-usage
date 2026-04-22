# Implementation Plan: Agent-Agnostic PromptStreak Migration

## Overview
This plan migrates PromptStreak from a Copilot-centric collector and model configuration to an adapter-based, provider-agnostic architecture while preserving existing behavior for current users. The approach is backward-compatible first: accept current payloads and keep existing leaderboard/profile/badge behavior stable while introducing normalized agent dimensions (provider, product, surface, trust level, and actions).

## Scope
- In scope:
  - Multi-agent data contract and compatibility layer
  - Adapter architecture for collectors/parsers
  - Multi-dimensional storage and rollups
  - Optional provider/product filtering in web APIs and UI
  - Updated product language and docs
- Out of scope for this plan:
  - Removing GitHub auth identity model
  - Replacing existing local dashboards
  - Breaking changes to current upload clients in first release

## Architecture Decisions
- Keep GitHub auth for account identity for now; make telemetry model agent-agnostic.
- Support dual upload contracts temporarily: current snapshot payload + new agent snapshot payload.
- Keep existing read paths online (UserStat/RepoStat-backed pages) while introducing expanded rollups.
- Implement adapter interfaces with Copilot as reference adapter before enabling additional adapters.
- Persist trust provenance (verified, observed, inferred) in canonical records.

## Dependency Graph
1. Shared schema and compatibility
2. Database schema expansion
3. Upload translator/service layer
4. Collector adapter abstraction (CLI + extension)
5. Additional adapter implementation
6. API/UI filtering and product language updates

## Task List

### Phase 1: Foundation and Compatibility

## Task 1: Finalize migration contract and rollout mode
**Description:** Define canonical terms, compatibility window, and non-breaking rollout sequence.

**Acceptance criteria:**
- [ ] Contract defines required canonical fields (provider, product, surface, modelId, requestCount/tokens where available, trust level).
- [ ] Compatibility policy is documented (v1 snapshot supported during migration).
- [ ] Rollout strategy specifies deprecation conditions for legacy payload.

**Verification:**
- [ ] Document reviewed against docs/promptstreak-agent-agnostic-architecture.md
- [ ] No existing public endpoint behavior changes in this step.

**Dependencies:** None

**Files likely touched:**
- docs/promptstreak-agent-agnostic-architecture.md
- docs/agent-agnostic-migration-plan.md

**Estimated scope:** Small

## Task 2: Add AgentSnapshot schema with backward compatibility
**Description:** Extend shared schema package with new agent-agnostic contract while preserving existing exports.

**Acceptance criteria:**
- [ ] New schema added and exported.
- [ ] Existing SnapshotPayload schema still parses unchanged payloads.
- [ ] Shared package build succeeds.

**Verification:**
- [ ] pnpm --filter @copilot-usage/shared-schema build
- [ ] Existing web upload validation path still compiles.

**Dependencies:** Task 1

**Files likely touched:**
- packages/shared-schema/src/snapshot.ts
- packages/shared-schema/src/index.ts
- packages/shared-schema/src/types.ts

**Estimated scope:** Medium

## Task 3: Replace Copilot-only model multiplier source with provider-aware registry
**Description:** Introduce canonical model registry keyed by provider/product/model and add compatibility mapping for existing copilot/* ids.

**Acceptance criteria:**
- [ ] Canonical registry exists in shared schema.
- [ ] Legacy copilot/* model ids still resolve deterministically.
- [ ] Extension and CLI references can use compatibility mapping without behavior regressions.

**Verification:**
- [ ] pnpm --filter @copilot-usage/shared-schema build
- [ ] Existing multiplier-dependent tests or calculations remain stable.

**Dependencies:** Task 2

**Files likely touched:**
- packages/shared-schema/src/multipliers.ts
- apps/vscode-extension/src/core/config.ts
- apps/cli/src/copilot_usage/config.py

**Estimated scope:** Medium

### Checkpoint: Foundation
- [ ] Shared schema builds clean.
- [ ] Legacy payload compatibility preserved.
- [ ] No behavior regressions for current Copilot model multiplier calculations.

### Phase 2: Storage and Ingestion Core

## Task 4: Expand web data model for agent dimensions
**Description:** Add provider/product/surface/trust-capable normalized tables and indexes while keeping current tables for compatibility reads.

**Acceptance criteria:**
- [ ] Prisma schema supports canonical agent dimensions and run/action facts.
- [ ] Existing UserStat/RepoStat model remains functional.
- [ ] Migration can run without data loss.

**Verification:**
- [ ] pnpm --filter @promptstreak/web db:generate
- [ ] pnpm --filter @promptstreak/web db:migrate
- [ ] pnpm --filter @promptstreak/web build

**Dependencies:** Phase 1 complete

**Files likely touched:**
- apps/web/prisma/schema.prisma
- apps/web/prisma/migrations/**

**Estimated scope:** Large

## Task 5: Build upload translation layer (legacy + new payload)
**Description:** Keep current route handler but translate both contracts into canonical writes and rollups.

**Acceptance criteria:**
- [ ] Upload endpoint accepts both payload versions.
- [ ] Transaction remains atomic for core writes.
- [ ] Idempotency and time-window checks remain enforced.

**Verification:**
- [ ] pnpm --filter @promptstreak/web test
- [ ] pnpm --filter @promptstreak/web lint
- [ ] Manual API checks for both payload formats

**Dependencies:** Task 4

**Files likely touched:**
- apps/web/src/app/api/upload/route.ts
- apps/web/src/lib/** (new upload translator/service)

**Estimated scope:** Large

## Task 6: Add dimensioned rollups and keep current read compatibility
**Description:** Compute product/provider/model-oriented rollups while preserving current leaderboard/profile semantics.

**Acceptance criteria:**
- [ ] Dimensioned rollups available for future filters.
- [ ] Existing /api/leaderboard and /api/profile continue returning expected fields.
- [ ] No major query performance regression.

**Verification:**
- [ ] pnpm --filter @promptstreak/web test
- [ ] pnpm --filter @promptstreak/web build
- [ ] Manual query checks on leaderboard/profile endpoints

**Dependencies:** Task 5

**Files likely touched:**
- apps/web/src/app/api/leaderboard/route.ts
- apps/web/src/app/api/profile/[username]/route.ts
- apps/web/src/lib/** (rollup/query modules)

**Estimated scope:** Medium

### Checkpoint: Ingestion Core
- [ ] Legacy clients can still upload.
- [ ] Canonical dimensions persist successfully.
- [ ] Existing public pages remain stable.

### Phase 3: Collector Adapter Abstraction

## Task 7: Introduce adapter interfaces in CLI pipeline
**Description:** Refactor discovery/parser pipeline to adapter interfaces while keeping Copilot adapter as baseline implementation.

**Acceptance criteria:**
- [ ] CLI supports adapter discovery + parse contract.
- [ ] Copilot adapter produces same metrics as before.
- [ ] Existing local dashboard and scan flow still works.

**Verification:**
- [ ] Manual run: copilot-usage analyze
- [ ] Manual run: copilot-usage dashboard
- [ ] Compare pre/post aggregate totals for sample workspace

**Dependencies:** Phase 2 complete

**Files likely touched:**
- apps/cli/src/copilot_usage/discovery.py
- apps/cli/src/copilot_usage/parser.py
- apps/cli/src/copilot_usage/pipeline.py
- apps/cli/src/copilot_usage/ingest.py

**Estimated scope:** Large

## Task 8: Introduce adapter interfaces in VS Code extension core
**Description:** Mirror adapter abstraction in extension discovery/parser/aggregator.

**Acceptance criteria:**
- [ ] Extension core can invoke adapter pipeline.
- [ ] Copilot adapter parity retained.
- [ ] Existing commands and views still function.

**Verification:**
- [ ] npm --prefix apps/vscode-extension run check-types
- [ ] npm --prefix apps/vscode-extension run lint
- [ ] Manual extension smoke test in VS Code

**Dependencies:** Task 7

**Files likely touched:**
- apps/vscode-extension/src/core/discovery.ts
- apps/vscode-extension/src/core/parser.ts
- apps/vscode-extension/src/core/aggregator.ts
- apps/vscode-extension/src/core/types.ts

**Estimated scope:** Large

### Checkpoint: Adapter Core
- [ ] Copilot functionality unchanged in both CLI and extension.
- [ ] Adapter interfaces are stable and documented.

### Phase 4: Multi-Agent Capability

## Task 9: Implement one non-Copilot adapter end-to-end
**Description:** Add one additional adapter (recommended: terminal-first agent) with minimal canonical fields and trust provenance.

**Acceptance criteria:**
- [ ] New adapter ingests local artifacts.
- [ ] Canonical upload payload generated and accepted.
- [ ] Data appears correctly in profile/leaderboard aggregates.

**Verification:**
- [ ] Local adapter sample run produces valid payload
- [ ] Upload succeeds via /api/upload
- [ ] Web endpoints reflect new source data

**Dependencies:** Task 8

**Files likely touched:**
- apps/cli/src/copilot_usage/** (adapter package/module)
- apps/vscode-extension/src/core/** (if extension route needed)
- packages/shared-schema/src/** (if capability enums updated)

**Estimated scope:** Large

## Task 10: Add optional provider/product filters to APIs and UI
**Description:** Introduce filtered views while preserving all-agent default behavior.

**Acceptance criteria:**
- [ ] Leaderboard/profile/repo endpoints accept optional provider/product parameters.
- [ ] Default views remain current behavior.
- [ ] Badge/card endpoints support optional scoped stats.

**Verification:**
- [ ] pnpm --filter @promptstreak/web test
- [ ] pnpm --filter @promptstreak/web lint
- [ ] pnpm --filter @promptstreak/web build
- [ ] Manual endpoint checks with and without filters

**Dependencies:** Task 9

**Files likely touched:**
- apps/web/src/app/api/leaderboard/route.ts
- apps/web/src/app/api/profile/[username]/route.ts
- apps/web/src/lib/repo-leaderboard-data.ts
- apps/web/src/lib/badges/data.ts
- apps/web/src/app/leaderboard/**

**Estimated scope:** Medium

### Checkpoint: Multi-Agent Functional
- [ ] At least two adapters supported.
- [ ] All-agent and filtered views both validated.

### Phase 5: Product Surface and Release Readiness

## Task 11: Update product language and documentation
**Description:** Replace Copilot-only copy with coding-agent language while clarifying compatibility and trust levels.

**Acceptance criteria:**
- [ ] Homepage/layout/leaderboard copy updated.
- [ ] README and docs reflect adapter model.
- [ ] No stale Copilot-only messaging in primary UX paths.

**Verification:**
- [ ] Manual copy review on main pages
- [ ] grep audit for critical strings in web app and docs

**Dependencies:** Task 10

**Files likely touched:**
- apps/web/src/app/layout.tsx
- apps/web/src/app/page.tsx
- apps/web/src/app/leaderboard/repos/page.tsx
- README.md
- docs/web-app.md

**Estimated scope:** Small

## Task 12: Hardening, observability, and release gating
**Description:** Finalize migration with regression checks, data quality checks, and rollout gates.

**Acceptance criteria:**
- [ ] End-to-end regression checklist completed.
- [ ] Data consistency checks for legacy vs canonical paths documented.
- [ ] Release cut criteria defined and approved.

**Verification:**
- [ ] pnpm --filter @promptstreak/web test
- [ ] pnpm --filter @promptstreak/web lint
- [ ] pnpm --filter @promptstreak/web build
- [ ] Extension type/lint checks
- [ ] CLI scan/upload smoke checks

**Dependencies:** Task 11

**Files likely touched:**
- docs/agent-agnostic-migration-plan.md
- docs/promptstreak-agent-agnostic-architecture.md
- docs/web-app.md

**Estimated scope:** Medium

### Checkpoint: Release Candidate
- [ ] All acceptance criteria met.
- [ ] Existing users unaffected during compatibility window.
- [ ] Multi-agent capability proven with at least one non-Copilot adapter.

## Risks and Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| Legacy client breakage during contract shift | High | Maintain dual schema acceptance until adapter clients are upgraded |
| Data quality mismatch across providers | High | Persist trust level and source-of-truth metadata in canonical facts |
| Query regressions from new dimensions | Medium | Keep existing rollups online; add dimensioned indexes before switching reads |
| Collector refactor regresses Copilot parsing | High | Adapter parity tests and baseline metric snapshots before merge |
| UI complexity from too many filters | Medium | Keep all-agent defaults; introduce optional filters incrementally |

## Open Questions
- Which non-Copilot adapter should be first for fastest, reliable proof (Claude Code vs Codex CLI vs Cursor)?
- Should provider/product dimensions be optional in first public UI release, or API-only initially?
- What is the exact deprecation window for legacy snapshot payload uploads?
- How should trust-level badges/messages appear in profile and leaderboard UI?

## Definition of Done
- Canonical agent-agnostic contract and storage are live.
- Legacy uploads still work during migration window.
- At least one non-Copilot adapter is operational.
- Leaderboard/profile/badge surfaces support all-agent default and optional filtering.
- Documentation and product language reflect the agent-agnostic model.
