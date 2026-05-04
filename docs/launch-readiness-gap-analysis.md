# PromptStreak Launch Readiness Gap Analysis

## Status (verified May 2026)
This document was re-audited against the actual code in this session. Most P0/P1 gaps below were already closed in code or have been closed during this audit pass. See [Verified Status Update](#verified-status-update-may-2026) immediately below for the authoritative current state. The original gap inventory is preserved further down for historical context.

## Verified Status Update (May 2026)

| # | Original Gap | Verified Status | Evidence |
|---|---|---|---|
| P0-1 | Upload verification telemetry not runtime-wired | ✅ Closed in code | `apps/web/src/app/api/upload/route.ts` writes `UploadAudit` on accept/reject and transaction-failure paths in the v2 runtime. Signed-upload anomaly detection is intentionally deferred (no signed-upload protocol shipped). |
| P0-2 | Verification lifecycle endpoints missing | ⏸ Intentionally deferred | Disconnect lib + admin + user-self routes exist (`apps/web/src/lib/admin/verification.ts`, `apps/web/src/app/api/admin/verification/[userId]/disconnect/route.ts`, `apps/web/src/app/api/verification/github/route.ts`). Refresh endpoint depends on Task 3.6 GitHub-billing fetch worker; excluded from public launch claims. |
| P0-3 | Mixed visibility enforcement paths | ✅ Closed in code | `apps/web/src/lib/profile-policy.ts` rewritten to delegate to `isUserVisibleForFeature(user, 'profile')` with owner-override and soft-delete suppression. All 4 callers (`u/[username]/page.tsx`, `u/[username]/achievements/page.tsx`, `r/[username]/[...repo]/page.tsx`, `card/[username]/route.ts`) migrated to include `privacySettings` and use the new API. Test matrix covers public/owner-private/others-private/no-privacy-row/suspended/soft-deleted. |
| P0-4 | Public API + docs drift | 🟡 In progress | This update is part of that effort. A canonical API contract doc is still pending and tracked separately. |
| P1-A | Abuse report persistence | ✅ Closed in code | `apps/web/src/app/api/contact/route.ts` classifies via `classifyAbuseSubject` and persists to `AbuseReport` before sending mail; persistence failure returns 500. |
| P1-B | SMTP backend runtime path | ✅ Closed in code | `apps/web/src/lib/mail/mailService.ts` exposes lazy proxy that loads `SmtpMailService` (nodemailer) when `MAIL_BACKEND=smtp`, falls back to in-memory otherwise. |
| P1-C | Recovery code payload mismatch | ✅ Closed in code | `apps/web/src/lib/admin/auth/routeHandlers.ts` `recoveryCodeHandler` accepts both `code` and `recoveryCode` for backward compatibility. |
| P1-D | Audit immutability automation | ✅ Closed in code | `apps/web/package.json` adds `db:apply-triggers` (runs `scripts/applyAuditLogImmutability.ts`) and composite `db:deploy` (`db:push` + `db:apply-triggers`). `docs/admin-ops-runbook.md` bootstrap section refreshed to use `db:deploy` as the canonical post-deploy command. |
| P2 | Spec-only verification entities | ⏸ Deferred | `VerificationAnomaly` model is a stable placeholder; auto-detection passes require the signed-upload protocol which is not yet shipped. Comment in `apps/web/src/lib/admin/userManagement.ts` corrected to reflect this. |

### Test Validation
- `pnpm --filter @promptstreak/web test`: **251 / 251 passing**.
- No new TypeScript errors in any modified file.

### Remaining Launch-Time Work
1. **Doc canonicalization (P0-4)**: publish a single API contract doc and align verification/web docs. Not a code blocker.
2. **Documented deferrals to call out in launch claims**:
   - Verification *refresh* endpoint awaits GitHub-billing fetch worker (Task 3.6).
   - Anomaly auto-detection awaits signed-upload protocol.
3. **Operational**: ensure `pnpm --filter @promptstreak/web db:deploy` is part of the deploy pipeline so the audit-log immutability triggers are applied in every environment.

### Updated Go/No-Go Posture
- All originally-listed P0 *code* gaps are either closed or have a clear documented deferral with launch-claim boundaries.
- Launch claims should match the [Suggested Launch Claims Boundaries](#suggested-launch-claims-boundaries) section, with the explicit caveat that "verified usage" refers to UploadAudit coverage, not signed-upload anomaly detection.

---

## Original Gap Inventory (historical, pre-audit)

The remainder of this document is the original gap analysis as written before the May 2026 verification pass. It is retained for historical context. Where the table above contradicts text below, the table above is authoritative.

## Purpose
This document translates the current research in [docs/reality.md](docs/reality.md) into an implementation-focused launch plan for the coming week.

Primary objective:
- Ship a trustworthy, supportable public web + API baseline next week.
- Freeze public API behavior after launch hardening.
- Start VS Code extension work only after the API contract is stable.

## Source Inputs
- [docs/reality.md](docs/reality.md)
- [docs/promptstreak-verification-concrete-spec.md](docs/promptstreak-verification-concrete-spec.md)
- [docs/promptstreak-verification-implementation-plan.md](docs/promptstreak-verification-implementation-plan.md)

## Executive Read
Current state is strong for core product usage (auth, linking, upload, profiles, leaderboards, badges), but there are trust, consistency, and operational gaps that are high-risk for a public launch.

Most critical launch gap:
- Verification runtime is incomplete relative to data model and docs (UploadAudit/VerificationAnomaly write path, refresh/disconnect API coverage, signed-upload parity).

Most critical extension dependency gap:
- Public API behavior is not yet frozen and docs are not fully aligned to runtime behavior.

## Gap Inventory and Launch Impact

| Gap | Current state | Launch risk | Priority |
|---|---|---|---|
| Upload verification telemetry not fully runtime-wired | Upload path does not consistently write UploadAudit/VerificationAnomaly in runtime | Trust claims and moderation confidence are weaker than expected | P0 |
| Verification mutation endpoints missing | Read routes exist; refresh/disconnect routes are deferred | Incomplete user/admin verification lifecycle | P0 |
| Mixed visibility enforcement paths | Some routes use new lifecycle policy, others legacy checks | Inconsistent public/private behavior and user confusion | P0 |
| Public API and docs drift | Multiple docs claim behavior not yet implemented | Integration failures, support load, extension rework | P0 |
| Abuse report persistence missing | Abuse reports sent by mail path but not persisted in runtime | Compliance/auditability and moderation workflow gaps | P1 |
| SMTP backend not clearly active in production path | In-memory singleton still appears as active default in code path | Delivery reliability and incident response risk | P1 |
| Repo visibility model migration incomplete | Legacy profilePublic path still active in places | Future policy complexity and inconsistent semantics | P1 |
| Recovery code payload mismatch in admin flow | Verify payload mismatch noted in reality report | Operator lockout/support burden edge case | P1 |
| Trigger-based audit immutability not environment-verified | SQL + runbook exist, deployment state uncertain | Audit integrity uncertainty in incidents | P1 |
| Spec-only verification schema entities not implemented | Concrete spec includes entities not in runtime schema | Planning confusion, not an immediate blocker if scope narrowed | P2 |

## Required Features Before Public Launch (P0)

### 1) Verification Runtime Baseline
Implement the minimum viable verification path that matches launch claims.

Required outcomes:
- Upload path writes UploadAudit for every upload.
- Upload path writes VerificationAnomaly for invalid/replayed/stale signature outcomes.
- Signature status is recorded consistently and queryable for admin/ops views.

Exit criteria:
- End-to-end integration test proves UploadAudit creation on unsigned and signed uploads.
- End-to-end integration test proves anomaly creation on replay and invalid signature cases.
- Admin verification/anomaly views display newly created records from live upload flow.

### 2) Verification Lifecycle Endpoints (User + Admin)
Close the most visible API lifecycle holes.

Required outcomes:
- User endpoint(s) for refresh/disconnect are present and functioning.
- Admin mutation route(s) for verification refresh/disconnect are present or explicitly removed from claim surface.

Exit criteria:
- Contract tests for each route and status code family.
- Settings/admin UI flows can exercise these endpoints without manual DB steps.

### 3) Visibility Policy Consistency
Eliminate mixed legacy/new visibility logic before broader traffic.

Required outcomes:
- Public surface routes and APIs consistently apply the same lifecycle policy logic.
- No route should still rely on legacy-only profile checks if policy helper is intended source of truth.

Exit criteria:
- Route inventory checklist with each public route mapped to policy gate type.
- Automated tests covering profile visibility, leaderboard eligibility, and badge visibility combinations.

### 4) Public API Stabilization + Documentation Sync
Freeze behavior before extension integration starts.

Required outcomes:
- Publish a canonical API contract (inputs, auth, status codes, error schema).
- Remove or clearly mark non-implemented endpoints from docs.
- Align web docs, verification docs, and implementation plan language to actual runtime.

Exit criteria:
- API contract doc approved as source of truth.
- Breaking-change policy for post-launch updates documented.
- No known doc/code contradictions in launch-critical routes.

## Should Implement in Launch Week if Capacity Allows (P1)

### 5) Abuse Report Persistence
- Persist abuse submissions to AbuseReport (or equivalent) in addition to mail.
- Ensure moderation can search and triage without mailbox dependency.

### 6) Production Mail Path Hardening
- Confirm SMTP service is active in runtime path (not only test path).
- Add health signal and failure logging thresholds.

### 7) Recovery Code Flow Fix
- Align admin verify payload contract and handler expectations.
- Add regression test for recovery-code login path.

### 8) Audit Immutability Verification
- Validate trigger deployment in each environment.
- Add explicit operational check in runbook with evidence artifact.

## Defer Until After Launch (P2)

- Full spec-level expansion of verification schema entities not needed for immediate launch narrative.
- Full migration off legacy visibility fields can proceed after launch if policy behavior is already consistent at the route level.
- Hard enforcement cutoff for signed uploads can be staged after observing adoption metrics.

## One-Week Implementation Sequence

### Day 1
- Lock launch scope and claims (P0 only).
- Create route-level policy consistency checklist.
- Freeze candidate API contract draft.

### Day 2
- Implement verification runtime baseline (UploadAudit + anomaly writes).
- Add integration tests for signed/unsigned/replay/invalid cases.

### Day 3
- Implement missing verification lifecycle endpoints (refresh/disconnect).
- Add user/admin contract tests.

### Day 4
- Complete visibility policy unification across public routes/APIs.
- Add matrix tests for visibility outcomes.

### Day 5
- Resolve doc/code drift, publish canonical API contract, finalize launch claims.
- Run launch readiness verification suite and generate evidence snapshot.

### Day 6 (buffer)
- P1 items by risk order: recovery payload fix, abuse persistence, SMTP runtime hardening.

### Day 7 (go/no-go)
- Execute go/no-go checklist.
- Freeze API contract tag for extension team handoff.

## API Freeze Criteria (Extension Unblock Gate)
The VS Code extension work should start only after all criteria below are true:

1. Upload API contract is stable and versioned.
2. Auth and signature requirements are finalized with backward-compat notes.
3. Error payload schema is standardized for 4xx/5xx responses.
4. Verification lifecycle endpoints are present (or intentionally excluded and documented).
5. Public visibility rules are deterministic and tested.
6. Launch docs match runtime behavior for all launch-exposed endpoints.

## Suggested Launch Claims Boundaries
Use only claims backed by runtime behavior at launch.

Safe claims once P0 done:
- GitHub sign-in, device linking, usage upload, public profile/repo/leaderboard/badges.
- Privacy and visibility controls with consistent policy behavior.
- Verification and anti-cheat signals with clear scope language.

Avoid until P1/P2 complete:
- Fully end-to-end verified usage across all dimensions.
- Guaranteed abuse persistence unless DB persistence is live.
- Strong mail-delivery guarantees unless runtime SMTP path is confirmed.

## Go/No-Go Checklist

Go only if all items are true:
- P0 exit criteria complete.
- No known launch-critical doc/runtime contradictions.
- Launch verification test suite green.
- Incident runbook includes verification and mail-path checks.
- API contract tagged and shared for extension handoff.

No-Go if any of these remain:
- Verification writes still test-only.
- Route-level policy behavior still inconsistent.
- Public docs still advertise non-existent endpoints.

## Immediate Next Artifacts to Produce
- API source-of-truth document for launch routes.
- Route-level visibility gate matrix (public pages + public APIs).
- Launch evidence report (test results + endpoint checks + operational checks).

