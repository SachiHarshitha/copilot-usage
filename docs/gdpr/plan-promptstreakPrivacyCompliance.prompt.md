## Plan: Promptstreak Privacy Compliance Rollout

Close GDPR-level privacy/compliance gaps in the web app by introducing encrypted identity storage with HMAC lookup hashes, strict opt-in public sharing controls, DSAR export/deletion workflows, legal/reporting surfaces, and end-to-end privacy regression coverage. Reuse existing security primitives (token encryption, rate limiting, admin audit/anomaly infrastructure) and ship in phased, migration-safe increments.

**Steps**
1. Phase 0 - Baseline + safety rails: capture current behavior snapshots for auth, settings, leaderboard, badges, profile API, and account deletion; add characterization tests first so migration regressions are visible before schema/API changes. This phase blocks all others.
2. Phase 1 - Identity and privacy schema foundation (depends on 1): add `user_identities`, `privacy_settings`, `public_profiles`, `consent_events`, `data_export_requests`, `account_deletion_jobs`, `abuse_reports`, and `repo_visibility_settings` tables. Keep `User.githubId` as temporary bridge column during migration.
3. Phase 1.1 - Encrypted identity primitives (depends on 2): implement identity-specific encryption/HMAC helpers using current AES-GCM key-ring pattern plus a dedicated HMAC pepper; add deterministic hash normalization for GitHub user id/email lookup.
4. Phase 1.2 - Backfill and dual-read migration (depends on 3): backfill existing users into `user_identities`, create default rows in `privacy_settings` with all privacy-first defaults false, and introduce dual-read auth lookup (new hash-based path with fallback to legacy `githubId`) for safe rollout.
5. Phase 1.3 - Auth scope minimization (parallel with 4 once helper code exists): set GitHub provider auth params to request minimal scope (`read:user`) by default; keep encrypted email nullable and only fetch/store email through explicit future flows.
6. Phase 2 - Privacy settings API + consent auditing (depends on 4): replace single `profilePublic` control with strict independent opt-ins (`profile_public`, `leaderboard_opt_in`, `badges_enabled`, repo defaults). Add consent event writes for every grant/withdraw action and make withdrawal path symmetric.
7. Phase 2.1 - Public-surface policy enforcement (depends on 6): update all public profile, leaderboard, repo, and badge read paths to enforce combined predicates: active user, not deleted, profile_public true, plus feature-specific opt-ins (leaderboard_opt_in or badges_enabled). Include hidden-repo gating and never expose identity secrets.
8. Phase 2.2 - Cache invalidation on privacy changes (depends on 7): migrate badge/profile caching to tag-aware strategy and invalidate affected tags immediately on privacy, repo-visibility, suspension, or deletion state changes.
9. Phase 3 - Ingestion privacy hardening (depends on 2, parallel with 6): add explicit raw-content denylist validation (prompt/completion/code/file content/terminal/chat/secrets/env/diff/patch) before persistence, keep payload size/rate limits, and add structured rejection reasons without logging sensitive body content.
10. Phase 3.1 - Ingestion endpoint compatibility (depends on 9): introduce `/api/ingest/usage-snapshot` as canonical endpoint while keeping `/api/upload` as compatibility alias; enforce shared validation/auth/rate-limit logic in one module.
11. Phase 4 - DSAR data export (depends on 2 and 6): implement POST/GET/download export endpoints with small-account synchronous path and async request records for larger accounts; export machine-readable JSON including account/privacy/settings/usage/consent data while excluding OAuth/upload tokens and internal security signals.
12. Phase 5 - Hybrid account deletion workflow (depends on 2, 6, 7): replace one-shot hard delete with two-step request/confirm flow, immediate public takedown + token revocation, queued anonymize/delete job, and documented limited security-log retention. Keep minimal non-identifying audit record.
13. Phase 5.1 - GitHub disconnect + token lifecycle (depends on 12): add `/api/me/github/disconnect` behavior aligned with current auth model; revoke upload tokens and clear provider identity links per selected product policy.
14. Phase 6 - Legal/compliance pages and footer plumbing (parallel with 4/5 after routing contract is stable): add Impressum, Privacy, Terms, Contact, Cookie preferences placeholder, and Report abuse entry points; wire footer links globally.
15. Phase 6.1 - Abuse report flow (depends on 14 and 2): implement public report endpoint with spam/rate limiting and admin triage endpoints using existing admin auth patterns; store reports in `abuse_reports` with category taxonomy from feature doc.
16. Phase 7 - Settings UX and user journeys (depends on 6, 11, 12, 14): redesign Privacy & Data settings to include explicit confirmation copy for public profile, leaderboard, and badges; add download/export, deletion request/confirm, disconnect GitHub, repo visibility controls, and consent transparency text.
17. Phase 8 - Admin DSAR/moderation operations (depends on 11, 12, 15): add admin actions for export trigger, deletion-job trigger/status, abuse report review, and user privacy-state visibility while avoiding plaintext identity exposure in admin UI.
18. Phase 9 - Test and verification hardening (depends on all prior phases): expand unit/integration/privacy-regression coverage for private/public/deleted users, hidden repos, export secrecy, deletion semantics, and endpoint access controls; run project test suite per increment and block merge on failures.
19. Phase 10 - Legacy cleanup and migration completion (depends on production bake period after 4-9): remove `User.githubId` plaintext bridge and related code paths once all users are backfilled and auth traffic confirms hash-based lookup only.

**Relevant files**
- c:/101_CodeProjects/copilot-token-estimator/apps/web/prisma/schema.prisma — add privacy/identity/export/deletion/reporting tables and defaults; stage legacy column deprecation.
- c:/101_CodeProjects/copilot-token-estimator/apps/web/src/lib/auth.ts — migrate sign-in/session lookup from plaintext GitHub ID to hash-based identity lookup; reduce OAuth scopes.
- c:/101_CodeProjects/copilot-token-estimator/apps/web/src/lib/crypto/tokenEncryption.ts — reuse key-ring model for identity encryption utility split.
- c:/101_CodeProjects/copilot-token-estimator/apps/web/src/app/api/upload/route.ts — centralize ingestion validation, add forbidden-field rejection, and compatibility routing to canonical ingest endpoint.
- c:/101_CodeProjects/copilot-token-estimator/packages/shared-schema/src/snapshot.ts — tighten/augment payload guards for privacy-denied fields.
- c:/101_CodeProjects/copilot-token-estimator/packages/shared-schema/src/agent-snapshot.ts — validate canonical contract and deny unsafe content fields.
- c:/101_CodeProjects/copilot-token-estimator/apps/web/src/app/api/settings/profile/route.ts — migrate to new privacy settings contract and consent event recording.
- c:/101_CodeProjects/copilot-token-estimator/apps/web/src/app/api/settings/repos/route.ts — align repo visibility controls with `repo_visibility_settings` and cache invalidation.
- c:/101_CodeProjects/copilot-token-estimator/apps/web/src/app/settings/page.tsx — implement full Privacy & Data UX (toggles, confirmations, export/delete/disconnect/report links).
- c:/101_CodeProjects/copilot-token-estimator/apps/web/src/app/api/profile/[username]/route.ts — enforce lifecycle + opt-in policy checks.
- c:/101_CodeProjects/copilot-token-estimator/apps/web/src/app/api/leaderboard/route.ts — enforce `leaderboard_opt_in` and lifecycle filters.
- c:/101_CodeProjects/copilot-token-estimator/apps/web/src/app/api/leaderboard/repos/route.ts — enforce opt-in + lifecycle on repo leaderboard.
- c:/101_CodeProjects/copilot-token-estimator/apps/web/src/lib/repo-leaderboard-data.ts — update SQL predicates for strict public gating.
- c:/101_CodeProjects/copilot-token-estimator/apps/web/src/lib/ide-leaderboard-data.ts — update SQL predicates for strict public gating.
- c:/101_CodeProjects/copilot-token-estimator/apps/web/src/app/api/badges/[user]/[type]/route.ts — enforce `badges_enabled` and lifecycle checks.
- c:/101_CodeProjects/copilot-token-estimator/apps/web/src/app/api/badges/repo/[owner]/[repo]/[type]/route.ts — enforce repo/public/badge policy checks.
- c:/101_CodeProjects/copilot-token-estimator/apps/web/src/lib/badges/data.ts — switch to tag-aware cache strategy and privacy-aware filtering.
- c:/101_CodeProjects/copilot-token-estimator/apps/web/src/app/api/account/route.ts — replace hard-delete endpoint behavior with request/confirm workflow or compatibility redirect.
- c:/101_CodeProjects/copilot-token-estimator/apps/web/src/app/api/connect/route.ts — align upload token metadata/expiry handling with privacy model.
- c:/101_CodeProjects/copilot-token-estimator/apps/web/src/app/layout.tsx — add legal/footer links and compliance navigation.
- c:/101_CodeProjects/copilot-token-estimator/apps/web/src/app/api/admin/* — extend admin operations for export/deletion/report triage using existing auth/audit patterns.
- c:/101_CodeProjects/copilot-token-estimator/apps/web/src/lib/admin/actionLog.ts — reuse for immutable DSAR/compliance operation auditability.
- c:/101_CodeProjects/copilot-token-estimator/apps/web/src/lib/ratelimit.ts — extend to export/report/delete request throttling.

**Verification**
1. Migration checks: `pnpm --filter @promptstreak/web db:generate` and `pnpm --filter @promptstreak/web db:migrate` succeed on clean and existing DB states.
2. Unit tests (privacy primitives): identity encrypt/decrypt, HMAC normalization/lookup, forbidden-field detection, consent event writer.
3. API integration tests: privacy settings PATCH semantics, public endpoint gating, badge gating, export generation, delete request/confirm, disconnect flow, abuse report submission.
4. Privacy regression matrix: private user, public-profile-only user, leaderboard-opted user, badge-enabled user, deleted user, hidden-repo user.
5. Security checks: no plaintext identifiers/tokens in logs, rate limits active on ingest/export/report/delete/auth-sensitive routes, payload-size limits enforced.
6. UI verification: settings flows show required consent copy, footer/legal links present, report abuse path reachable anonymously where required.
7. Required test commands per increment: from app folder run `npm test`; for monorepo consistency run `pnpm --filter @promptstreak/web test` and integration suite `pnpm --filter @promptstreak/web test:integration`.
8. Pre-merge quality gate: lint + build + tests all pass (`pnpm --filter @promptstreak/web lint`, `pnpm --filter @promptstreak/web build`, tests above).

**Decisions**
- Identity schema: use doc-aligned split table (`user_identities`) rather than in-place encrypted columns on `users`.
- Deletion model: use hybrid async deletion (immediate public takedown + queued anonymize/delete + limited retention where documented).
- Public gating: strict independent opt-ins for profile visibility, leaderboard participation, and badges.
- Email scope: no-by-default; do not request `user:email` in standard login path unless explicitly needed later.
- Scope included: auth/privacy/data-rights/public-sharing/legal/reporting/test coverage in web app.
- Scope excluded for this rollout: jurisdiction-specific legal customizations beyond GDPR baseline text, payment/accounting retention logic, and external legal counsel drafting.

**Further Considerations**
1. Rollout strategy recommendation: ship behind feature flags for schema-backed read/write transitions (privacy settings, export, deletion, legal/reporting) and remove flags only after privacy regression suite is green in staging.
2. Data migration strategy recommendation: keep dual-read auth for one release window, run backfill with audit metrics, then remove plaintext `githubId` after successful cutover metrics.
3. Operational recommendation: publish deletion/export SLA and retention windows in Privacy Policy to align runtime behavior with user-facing commitments.

---

## Plan v2 — Optimized after acceptance-criteria review

**Why a v2:** v1 gates several `§20 release-blockers` (private/deleted/suspended user visible, hard-delete leaves public surfaces, ingestion accepts forbidden fields, missing legal footer) behind the identity-encryption migration. Each can be closed today with existing columns (`status`, `deletedAt`), Zod tightening, soft-delete reuse, and static pages. v2 front-loads those fixes, splits the heavy migration, and adds an explicit acceptance-criteria → phase map.

### Reuse anchors (call out per phase, do not reinvent)
- AES-256-GCM versioned key ring: `apps/web/src/lib/crypto/tokenEncryption.ts` — split into `identityCrypto.ts` sharing the same key-ring pattern + dedicated HMAC pepper.
- Admin soft-delete pipeline: `softDeleteUserCore` in `apps/web/src/lib/admin/userManagement.ts` — wrap for user-initiated deletion job; already revokes devices and anonymizes.
- Audit pattern: `withAuditedAction` (admin/actionLog.ts) — reuse for consent events, deletion jobs, exports, abuse triage.
- Lifecycle gate exemplar: `apps/web/src/app/api/upload/route.ts` (≈L89) already enforces `status=ACTIVE && !deletedAt`. Lift this into `lib/policy/userLifecycle.ts` and apply to every public reader.
- Existing audit tables `UploadAudit`, `VerificationAnomaly`, `UserVerification` (schema.prisma L473/L517/L556) are unused by the active upload route — wire them in during Phase 3, do **not** add parallel tables.
- Existing `profile-policy.ts` and its tests — extend instead of replacing.

### Revised phase order

**Phase Q — Quick-Win Hot-Fix (no schema change, ships first, closes §20 blockers)**
- Q.1 Centralize lifecycle predicate in `lib/policy/userLifecycle.ts` (`status='ACTIVE' && deletedAt IS NULL`) and apply to: `api/profile/[username]`, `api/repo/[username]/[...repo]`, `api/leaderboard`, `api/leaderboard/repos`, `lib/repo-leaderboard-data.ts`, `lib/ide-leaderboard-data.ts`, `lib/badges/data.ts`, `api/badges/[user]/[type]`, `api/badges/repo/[owner]/[repo]/[type]`. Closes §5.2-4, §6.1, §7 (lifecycle parts), §20 rows 1-3.
- Q.2 Replace hard-delete in `api/account/route.ts` with a wrapper around `softDeleteUserCore`: set `status=DELETED`, `deletedAt=now()`, revoke devices, clear public surfaces, invalidate caches. Two-step flow comes in Phase 5; this single change closes the immediate-takedown half of §10 and §20 row 10.
- Q.3 Tighten ingestion contract: convert `packages/shared-schema/src/snapshot.ts` and `agent-snapshot.ts` to `z.object(...).strict()`, add explicit denylist test cases for `prompt|completion|code|file|terminal|chat|secret|env|diff|patch` keys at any depth, and ensure rejection logs only field names (never values). Closes §1 except formal endpoint rename.
- Q.4 Add tag-aware cache: introduce `lib/cache/tags.ts` exporting `userTag(id)`, `userBadgesTag(id)`, `repoTag(userId,repo)`, `leaderboardTag()`. Migrate `lib/badges/data.ts` from raw `unstable_cache(...,{revalidate})` to `unstable_cache(..., { tags: [...] })` and call `revalidateTag` from `api/settings/profile/route.ts` and the new soft-delete writer. Closes §16 partially (full coverage in Phase 2.2).
- Q.5 Static legal pages + footer: add `app/(legal)/impressum`, `privacy`, `terms`, `contact` route groups; add `Report abuse` link (target endpoint stub returning 503 until Phase 6.1); update `app/layout.tsx` footer. Privacy text states "essential cookies only — no banner". Closes §12 minus content review.
- Q.6 Tests for Q.1–Q.5: lifecycle regression matrix (private/public/deleted/suspended), forbidden-field rejection, soft-delete cache invalidation, footer link presence. Run full gate.

**Phase 0 — Baseline characterization tests** (kept; runs in parallel with Q work where independent).

**Phase 1 — Identity & privacy schema (split)**
- 1a Schema-only migration: `user_identities`, `privacy_settings` (with `profile_public=false`, `leaderboard_opt_in=false`, `badges_enabled=false` defaults), `consent_events`, `account_deletion_jobs`, `data_export_requests`, `abuse_reports`, `repo_visibility_settings`. No code changes. Verify clean+existing DB migrate. Closes §17 schema rows.
- 1b Identity crypto primitives + unit tests: `lib/crypto/identityCrypto.ts` (encrypt/decrypt + HMAC with `IDENTITY_HMAC_PEPPER` env). Closes §2.5-9, §18 row 1-2.
- 1c Backfill script (`scripts/backfill-user-identities.ts`) + dual-read in `lib/auth.ts` behind `flags.identityDualRead`. Closes §17 backfill rows.
- 1d OAuth scope minimization to `read:user`; document email-fetch trigger. Closes §2.1-2.

**Phase 2 — Privacy settings API + symmetric consent (depends 1a)**
- Replace `profilePublic` writer with `PATCH /api/settings/privacy` updating `privacy_settings`; every change writes a `consent_events` row via `withAuditedAction`; UI surfaces three independent toggles. Closes §3, §4.

**Phase 2.1 — Tighten public-surface gating to opt-in predicates (depends 2)**
- Extend `userLifecycle.ts` policy from Q.1 to also require `leaderboard_opt_in` for leaderboards and `badges_enabled` for badge stats. Closes §5, §6, §7.

**Phase 2.2 — Full cache-invalidation coverage (depends 2.1)**
- Hook `revalidateTag` from privacy settings writer, repo-visibility writer, deletion job, suspension admin action. Closes §16 fully.

**Phase 3 — Ingestion audit wiring (depends 1a, parallel with 2)**
- Wire active upload route to write `UploadAudit` and surface anomalies into `VerificationAnomaly` (already in schema). Add per-IP/per-token rate limit using `lib/ratelimit.ts`. Add canonical `/api/ingest/usage-snapshot` only if telemetry shows external need; otherwise keep `/api/upload` to avoid churn.

**Phase 4 — DSAR export (depends 1a, 2)**
- Async-only: `POST /api/me/export` enqueues row in `data_export_requests`; `GET /api/me/export/:id` returns status/signed URL. JSON includes account/privacy/settings/usage/consent/repo-visibility; excludes tokens, hashes, encryption metadata. Rate-limited. Closes §9.

**Phase 5 — Two-step deletion (depends Q.2, 2)**
- `POST /api/me/deletion-request` → email-less confirmation token → `POST /api/me/deletion-confirm` enqueues `account_deletion_jobs`. Worker calls `softDeleteUserCore` immediately, then anonymizes identity rows after retention window. Idempotent. Closes §10 fully.

**Phase 5.1 — GitHub disconnect (depends 5)** — unchanged from v1.

**Phase 6.1 — Abuse report endpoint (depends 1a, Q.5)** — unchanged.

**Phase 7 — Settings UX redesign (depends 2, 4, 5, 6.1)** — unchanged.

**Phase 8 — Admin DSAR/moderation surfaces (depends 4, 5, 6.1)**
- Admin UI must mask GitHub IDs (current `apps/web/src/lib/admin/userManagement.ts` API exposes `githubId` at L20/L94 — gate behind explicit "reveal" action with audit row). Closes §14.

**Phase 9 — Verification hardening** — unchanged.

**Phase 10 — Drop `User.githubId` plaintext bridge** — unchanged; gated on metric showing 100% hash-lookup hits across one bake window.

### Acceptance-criteria → phase map

| Criteria § | Closed by |
|---|---|
| §1 Data minimization | Q.3, Phase 3 |
| §2 GitHub auth (encryption, scope) | 1b, 1c, 1d |
| §3 Privacy-by-default | 1a (defaults) + Phase 2 (UI) |
| §4 Consent audit | Phase 2 |
| §5 Public profile gating | Q.1 (lifecycle) + Phase 2.1 (opt-in) |
| §6 Leaderboard gating | Q.1 + Phase 2.1 |
| §7 Badge gating | Q.1 + Phase 2.1 |
| §8 Repo visibility | Q.1 + Phase 2 (`repo_visibility_settings`) |
| §9 DSAR export | Phase 4 |
| §10 Deletion | Q.2 (immediate takedown) + Phase 5 (two-step + anonymize) |
| §11 GitHub disconnect | Phase 5.1 |
| §12 Legal/footer | Q.5 |
| §13 Abuse reporting | Q.5 (link) + Phase 6.1 (endpoint) |
| §14 Admin ops | Phase 8 |
| §15 Logging | Q.3 (no body logging) + cross-cutting review in Phase 9 |
| §16 Cache invalidation | Q.4 + Phase 2.2 |
| §17 Migration | Phase 1a–1c |
| §18 Test coverage | Phase 0, Q.6, per-phase tests, Phase 9 |
| §19 Release-gate commands | enforced every phase |
| §20 Release blockers | Q.1–Q.5 close all critical-path blockers before any encryption work |

### Feature-flag taxonomy
Add `apps/web/src/lib/flags.ts` reading from env: `identityDualRead`, `requirePrivacySettings` (default false → true after Phase 2 bake), `legacyHardDeleteShim` (kept off after Q.2). All flags default to safest (privacy-on, public-off).

### Suggested PR slicing (Q phase only — each <400 LOC)
1. Q.1a `userLifecycle.ts` + tests, no callers wired.
2. Q.1b Wire profile/repo/leaderboard readers.
3. Q.1c Wire badge readers + cache tag scaffold (Q.4 prep).
4. Q.2 Soft-delete account endpoint + tests.
5. Q.3 Snapshot strict + denylist tests.
6. Q.4 `revalidateTag` migration in badges/profile.
7. Q.5 Legal pages + footer + abuse stub.
8. Q.6 Regression matrix.

### Open items requiring product/legal input (non-blocking for Q phase)
- Retention windows for `consent_events`, `account_deletion_jobs`, `UploadAudit`.
- Final Privacy Policy / Impressum copy (English + German).
- Whether disconnect deletes the account or only severs OAuth (Phase 5.1 default: severs only; user must run delete to remove data).

---

## Implementation Status (as of 2026-05-02, branch `feature/leaderboard`)

| Phase | Status | Commit | Notes |
|---|---|---|---|
| Phase Q (Q.1–Q.6) | ✅ done | (rolled into 1a–1d, 2.x) | Lifecycle predicate, soft-delete account route, denylist, cache-tag scaffold, legal pages all landed via the renumbered phases below. |
| Phase 0 — baseline characterization | ✅ done | — | Characterization tests landed alongside Q work; gates green throughout. |
| Phase 1a — schema-only migration | ✅ done | `6f33a98` | All 7 GDPR tables added; privacy-first defaults verified; clean+existing DB push OK. |
| Phase 1b — identity crypto + HMAC | ✅ done | `d0d56d4` | `lib/crypto/identityCrypto.ts` + 20 unit tests; AES-GCM key-ring reuse + dedicated HMAC pepper. |
| Phase 1c — backfill + dual-read auth | ✅ done | — | `identitySync` + dual-read in `lib/auth.ts` + backfill script + 9 itests. |
| Phase 1d — OAuth scope minimization | ✅ done | `2c93be1` | GitHub scope locked to `read:user`; regression test added. |
| Phase 2 — privacy settings API + symmetric consent | ✅ done | — | `PATCH /api/settings/privacy` + writer + 11 itests; settings UI gains 3 independent toggles; legacy `User.profilePublic` bridge mirror retained. |
| Phase 2.1 — public-surface opt-in gating | ✅ done | `acc3f80` | `userVisibleForFeatureWhere/Sql('profile'\|'leaderboard'\|'badges')` predicates wired into every public reader (profile, repo, leaderboard, IDE leaderboard, repo leaderboard, badges). |
| Phase 2.2 — full cache-invalidation coverage | ✅ done | `95325e2` | Admin `suspend`/`restore`/`deleteUserHandler` now invalidate `tagsForUserChange` via injectable `revalidate` dep (mirrors `selfDelete` pattern). Soft-delete uses pre-tombstone username so `userBadgesByUsername(<original>)` is wiped. 5 new itests. |
| Phase 3 — ingestion privacy hardening | ✅ done | (pre-existing) | `findForbiddenFields` (`packages/shared-schema/src/contentDenylist.ts`) wired into `apps/web/src/app/api/upload/route.ts` line 144 — runs *before* schema validation, covers v1 + v2 paths; all schemas already `.strict()`; 7 unit tests. |
| Phase 3.1 — `/api/ingest/usage-snapshot` canonical alias | ⏳ deferred | — | Per v2 plan, defer until telemetry shows external need; `/api/upload` remains the single ingest path. |
| Phase 4 — DSAR data export | ⏳ next | — | `POST /api/me/export` async + `GET /api/me/export/:id`; depends on 1a (schema) + 2 (privacy settings) — both done. |
| Phase 5 — two-step deletion | ⏳ pending | — | `POST /api/me/deletion-request` → confirm → enqueue `account_deletion_jobs` worker. Q.2 already provides immediate-takedown half. |
| Phase 5.1 — GitHub disconnect | ⏳ pending | — | Default policy: sever OAuth only. |
| Phase 6 — legal/footer pages | ⏳ pending | — | Impressum, Privacy, Terms, Contact, Report-abuse stub. |
| Phase 6.1 — abuse report endpoint | ⏳ pending | — | Public report POST + admin triage; rate-limited; uses `abuse_reports` table. |
| Phase 7 — settings UX redesign | ⏳ pending | — | Depends on 4, 5, 6.1. |
| Phase 8 — admin DSAR/moderation surfaces | ⏳ pending | — | Mask GitHub IDs in admin UI; reveal-with-audit pattern. |
| Phase 9 — verification hardening | ⏳ pending | — | Cross-cutting privacy regression matrix. |
| Phase 10 — drop `User.githubId` plaintext bridge | ⏳ pending | — | Gated on production bake metric showing 100% hash-lookup hits. |

**Last green gates:** 246/246 unit · 197/197 itest · lint clean · build OK.

**§20 release-blocker status:** all Q-phase blockers (private/deleted/suspended visibility, immediate-takedown on delete, ingestion accepts forbidden fields, missing legal footer except actual legal copy) are closed at the code/policy layer. Remaining MVP blockers are scoped to Phases 4 (export), 5 (two-step deletion), 6 (legal copy), 6.1 (abuse).

