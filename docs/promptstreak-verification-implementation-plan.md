# Implementation Plan: Promptstreak Verification & Anti-Cheat v1.1

> **Companion to:** [promptstreak-verification-concrete-spec.md](promptstreak-verification-concrete-spec.md)
> **Status:** Plan v1 — ready for review
> **Updated:** 2026-04-27

---

## Overview

Add a layered trust system to Promptstreak: signed uploads, replay protection, anomaly logging, GitHub billing verification, and a narrow public trust badge. The plan is vertically sliced so each phase ships an end-to-end working capability without breaking existing v1/v2 upload clients.

## Architecture Decisions

- **Schema-first per phase.** Prisma migrations land before the code that reads them, but only for the models used in that phase. Avoid one giant migration.
- **Backwards-compatible upload auth.** Phase 1 keeps the existing `Bearer tokenId.secret` flow and treats HMAC headers as additive metadata (`signatureStatus = MISSING` for old clients). The bcrypt secret is reused as the HMAC key — no new secret material is provisioned to existing devices.
- **`Decimal` for monetary/usage quantities from GitHub.** GitHub docs do not pin numeric types for `grossQuantity`/`netQuantity`; store as `Decimal` and only narrow to `BigInt` for compare/display.
- **No new background runtime.** Phase 3+ refresh and nonce GC run via a sidecar cron container in the existing Docker Compose stack (e.g., `supercronic` or `ofelia`) hitting authenticated internal routes (`/api/cron/*`) protected by a `CRON_SECRET`. No new worker process or queue.
- **GitHub App, not OAuth App.** Spec requires `Plan: read` user permission, which is a GitHub App scope. The app is already registered; credentials live in env. Verification flow is separate from the existing GitHub OAuth login provider.
- **Encryption is server-managed AES-256-GCM with versioned keys from day one.** `GITHUB_TOKEN_ENCRYPTION_KEYS` is a JSON map of `{ "v1": "<base64-32B>", ... }` and `GITHUB_TOKEN_ENCRYPTION_ACTIVE_KEY` selects the encrypt-side version. Ciphertext format `<keyVersion>:<iv_b64>:<tag_b64>:<ct_b64>` enables zero-downtime key rotation. No external KMS in v1.
- **Integration tests use a dedicated `DATABASE_URL_TEST` Postgres**, migrated via `prisma migrate deploy` before the suite. File suffix `.itest.ts` separates DB-touching tests from pure unit tests so existing `pnpm test` stays fast.
- **Trust state lives on `ModelUsageDaily.trustLevel` (already present)** and on `UserVerification`. Do not alter legacy v1 stat tables for trust.

## Phase Map (Dependency Order)

```
Phase 1: Upload integrity plumbing (additive, non-breaking)
   └── Phase 2: Enforce signed uploads (client rollout + cutoff)
        └── Phase 3: GitHub billing verification (private beta, settings only)
             └── Phase 4: Public badge + profile trust metadata
                  └── Phase 5: Leaderboard policy + moderation hooks
```

Phases 1 and 3 can start in parallel **only after** Phase 1's Prisma changes land (they share `VerificationAnomaly`). Phase 2 client work (CLI + extension) can be drafted in parallel with Phase 1 server work once the canonical request format is frozen in Task 1.2.

---

## Phase 1 — Upload Integrity Plumbing

Goal: Server can validate signed uploads, log every upload to audit, and reject replays — while old unsigned clients continue to work.

### Task 1.1: Add Phase 1 Prisma models and enums

**Description:** Add `UploadNonce`, `UploadAudit`, `VerificationAnomaly` tables and supporting enums (`UploadSignatureStatus`, `VerificationAnomalyCode`, `VerificationSeverity`, `TrustState`). Do NOT add `UserVerification` / `GitHubBillingCredential` / `VerifiedMetricSnapshot` yet.

**Acceptance criteria:**
- [ ] Prisma schema compiles and migration applies cleanly to a fresh DB.
- [ ] `UploadNonce` has `@@unique([tokenId, nonce])` and `@@index([createdAt])`.
- [ ] `UploadAudit` has indexes on `(userId, receivedAt)` and `(tokenId, receivedAt)`.

**Verification:**
- [ ] `pnpm --filter web prisma migrate dev --name verification_phase1`
- [ ] `pnpm --filter web prisma generate` succeeds.
- [ ] `pnpm --filter web build` passes.

**Dependencies:** None
**Files:** [apps/web/prisma/schema.prisma](apps/web/prisma/schema.prisma), new migration
**Scope:** S

### Task 1.2: Crypto and canonical-request helpers

**Description:** Implement pure helpers — `buildCanonicalUploadRequest`, `hmacSha256Hex`, `sha256Hex`, `constantTimeEqualHex`. These are the contract that both server and clients (Phase 2) sign against.

**Acceptance criteria:**
- [ ] `buildCanonicalUploadRequest` joins exactly 5 lines with `\n` in the spec's order.
- [ ] `constantTimeEqualHex` handles unequal-length inputs without throwing.
- [ ] No external deps beyond Node's `crypto`.

**Verification:**
- [ ] Unit tests cover canonical stability (snapshot), HMAC vector against a known fixture, and constant-time mismatch path.
- [ ] `pnpm --filter web test -- crypto` passes.

**Dependencies:** None
**Files:** `apps/web/src/lib/crypto/canonicalRequest.ts`, `hmac.ts`, `sha256.ts`, `constantTimeEqual.ts`, matching `*.test.ts`
**Scope:** S

### Task 1.3: Nonce store + upload audit writer

**Description:** Wrap `UploadNonce` and `UploadAudit` in narrow modules: `consumeNonce(tokenId, nonce) → Result<ok | replayed>` (uses unique constraint as the race-safe gate) and `recordUploadAudit(input)`.

**Acceptance criteria:**
- [ ] Concurrent `consumeNonce` calls with the same `(tokenId, nonce)` produce exactly one success (verified via integration test using a real DB transaction).
- [ ] `recordUploadAudit` never throws — failures are logged but do not block ingestion.

**Verification:**
- [ ] Unit + integration tests against a test Postgres.
- [ ] `pnpm --filter web test -- upload` passes.

**Dependencies:** 1.1
**Files:** `apps/web/src/lib/upload/nonceStore.ts`, `uploadAudit.ts`, tests
**Scope:** S

### Task 1.4: `verifySignedUpload` middleware

**Description:** Composes 1.2 + 1.3 into a single function called from `/api/upload`. Reads headers, parses timestamp, looks up Device by `tokenId`, recomputes payload hash from raw body, recomputes HMAC using the device's bcrypt-stored secret as key material (the secret presented in the existing `Bearer` header is the HMAC key — bcrypt hash stays the verification mechanism for the secret itself). Returns a discriminated union: `{ status: VALID | MISSING | INVALID | STALE_TIMESTAMP | REPLAYED_NONCE | BODY_HASH_MISMATCH | DEVICE_REVOKED }`.

**Acceptance criteria:**
- [ ] When all five `X-Promptstreak-*` headers are absent, returns `MISSING` (does not throw).
- [ ] Stale-timestamp window is configurable via `PROMPTSTREAK_UPLOAD_SIGNATURE_WINDOW_SECONDS`.
- [ ] Uses the **raw** request body bytes for hashing (not parsed JSON).

**Verification:**
- [ ] Unit tests for each return status.
- [ ] `pnpm --filter web test -- verifySignedUpload` passes.

**Dependencies:** 1.2, 1.3, existing device-auth code in [apps/web/src/app/api/upload/route.ts](apps/web/src/app/api/upload/route.ts)
**Files:** `apps/web/src/lib/upload/verifySignedUpload.ts`, tests
**Scope:** M

### Task 1.5: Wire `verifySignedUpload` into `/api/upload`

**Description:** Call `verifySignedUpload` after existing bearer-token auth. Always write an `UploadAudit` row. On `INVALID` / `REPLAYED_NONCE` / `BODY_HASH_MISMATCH` / `STALE_TIMESTAMP` / `DEVICE_REVOKED` create a `VerificationAnomaly`. **Do not reject the upload yet** — Phase 1 logs only.

**Acceptance criteria:**
- [ ] Existing v1 and v2 unsigned uploads still succeed and produce `UploadAudit` rows with `signatureStatus = MISSING`.
- [ ] Signed uploads with a valid signature produce `signatureStatus = VALID`.
- [ ] Replay attempt produces `REPLAY_ATTEMPT` anomaly and `signatureStatus = REPLAYED_NONCE`, but the upload is still accepted in Phase 1 (gated by env flag `PROMPTSTREAK_ENFORCE_SIGNED_UPLOADS=false`).

**Verification:**
- [ ] Integration tests for: unsigned legacy upload, valid signed upload, replayed nonce, stale timestamp.
- [ ] `pnpm --filter web test -- api/upload` passes.

**Dependencies:** 1.4
**Files:** [apps/web/src/app/api/upload/route.ts](apps/web/src/app/api/upload/route.ts), tests
**Scope:** M

### Checkpoint: Phase 1
- [ ] All Phase 1 tests pass; existing upload tests still pass.
- [ ] Manual: send one signed and one unsigned upload to dev — both succeed, both appear in `UploadAudit` with the correct `signatureStatus`.
- [ ] No public-facing behavior changes.

---

## Phase 2 — Require Signed Uploads

Goal: Roll out HMAC signing to CLI + VS Code extension; eventually flip the server to reject unsigned uploads from clients above a minimum version.

### Task 2.1: Shared signing helper in `packages/shared-schema`

**Description:** Port the canonical-request + HMAC helpers from Task 1.2 into `packages/shared-schema` so CLI (Python) and extension (TypeScript) can both consume the same contract. For Python, ship a parallel implementation with a shared test vector JSON committed to the package.

**Acceptance criteria:**
- [ ] TS and Python implementations produce identical signatures for a committed fixture (`packages/shared-schema/test-vectors/upload-signing.json`).
- [ ] Fixture file is consumed by tests in all three apps.

**Verification:**
- [ ] `pnpm --filter shared-schema test` and `pytest apps/cli` both verify the same fixture.

**Dependencies:** 1.2
**Files:** `packages/shared-schema/src/upload-signing.ts`, `apps/cli/src/copilot_usage/upload_signing.py`, fixture, tests
**Scope:** M

### Task 2.2: VS Code extension — sign uploads

**Description:** Update the extension's upload code to compute and send all six `X-Promptstreak-*` headers. Bump extension version. Log signing failures to the extension output channel.

**Acceptance criteria:**
- [ ] Every upload from the extension carries valid signature headers.
- [ ] Extension settings expose a "diagnose upload" command that prints the canonical string.

**Verification:**
- [ ] Run extension against local dev server; confirm `signatureStatus = VALID` rows appear in `UploadAudit`.

**Dependencies:** 2.1
**Files:** `apps/vscode-extension/src/**/upload*.ts` (find via discovery), `package.json` version bump
**Scope:** M

### Task 2.3: CLI — sign uploads

**Description:** Same as 2.2 but for the Python CLI. Bump CLI version.

**Acceptance criteria:**
- [ ] CLI uploads carry valid headers.
- [ ] `--debug-signing` flag prints canonical string.

**Verification:**
- [ ] `pytest apps/cli` covers the signed-upload path with a mocked HTTP server.

**Dependencies:** 2.1
**Files:** `apps/cli/src/copilot_usage/ingest.py` (or wherever uploads happen), tests
**Scope:** M

### Task 2.4: Server — minimum-client-version enforcement

**Description:** Add `PROMPTSTREAK_MIN_SIGNED_CLIENT_VERSION` env. When `X-Promptstreak-Client-Version` is present and `>= min`, require `signatureStatus = VALID` or reject with 401 + anomaly.

**Acceptance criteria:**
- [ ] Old client (no version header) still accepted.
- [ ] New client without valid signature is rejected.
- [ ] Rejection produces `INVALID_SIGNATURE` anomaly.

**Verification:**
- [ ] Integration tests for both code paths.

**Dependencies:** 1.5, 2.2, 2.3
**Files:** [apps/web/src/app/api/upload/route.ts](apps/web/src/app/api/upload/route.ts), tests
**Scope:** S

### Task 2.5: Hard cutoff (separate release)

**Description:** Flip `PROMPTSTREAK_ENFORCE_SIGNED_UPLOADS=true` after telemetry shows >95% of uploads carry valid signatures for 7 consecutive days. Reject all `MISSING` signature uploads.

**Acceptance criteria:**
- [ ] Telemetry dashboard query exists for unsigned-upload share.
- [ ] Rollback plan documented (flip env back to `false`).

**Verification:**
- [ ] Stage in preview env first; confirm only intended clients are blocked.

**Dependencies:** 2.4 + adoption metrics
**Files:** env config only
**Scope:** XS

### Checkpoint: Phase 2
- [ ] All clients on signed uploads.
- [ ] `UploadAudit` shows ~100% `VALID`.
- [ ] No regression in upload success rate.

---

## Phase 3 — GitHub Billing Verification (Private Beta)

Goal: User can connect GitHub App, server fetches monthly premium-request total, settings page shows comparison. **No public badge yet.**

### Task 3.1: Phase 3 Prisma models

**Description:** Add `UserVerification`, `GitHubBillingCredential`, `VerifiedMetricSnapshot` plus enums `VerificationStatus`, `GitHubBillingCredentialStatus`, `VerifiedMetricSource`, `VerifiedMetricKey`.

**Acceptance criteria:**
- [ ] Migration applies cleanly.
- [ ] `VerifiedMetricSnapshot` unique key is `(userId, source, metricKey, periodKey, product, sku, model)`.
- [ ] `valueGross` / `valueNet` are `Decimal(20, 6)` (not `BigInt`) to match GitHub's untyped quantities.

**Verification:**
- [ ] `pnpm --filter web prisma migrate dev --name verification_phase3`

**Dependencies:** Phase 1 complete
**Files:** [apps/web/prisma/schema.prisma](apps/web/prisma/schema.prisma)
**Scope:** S

### Task 3.2: Token encryption helper (versioned-key AES-256-GCM)

**Description:** Implement `encryptToken(plaintext) → string` and `decryptToken(ciphertext) → string`. Reads `GITHUB_TOKEN_ENCRYPTION_KEYS` (JSON map of version → base64 32-byte key) and `GITHUB_TOKEN_ENCRYPTION_ACTIVE_KEY` (selects encrypt-side version). Each encryption uses a fresh random 12-byte IV. Output format: `<keyVersion>:<iv_b64>:<tag_b64>:<ct_b64>`. Decrypt routes to the correct key by version prefix, supporting decrypt of any historical version still in the map.

**Acceptance criteria:**
- [ ] Round-trip works for empty string, 32-byte token, and 4KB blob.
- [ ] Tampered ciphertext (any of iv/tag/ct flipped) throws.
- [ ] Missing active key, missing key map, or any key shorter than 32 bytes throws at module load.
- [ ] IV is never reused across two encrypt calls (statistical test over 10k samples).
- [ ] Decrypt succeeds against a fixture encrypted with `v1` even when active key is `v2`.
- [ ] Module exposes `currentKeyVersion()` for use by a future re-encrypt job.
- [ ] No raw key material is ever logged or returned from any exported function.

**Dependencies:** None
**Files:** `apps/web/src/lib/crypto/encryptToken.ts`, tests
**Scope:** S

### Task 3.3: GitHub billing client

**Description:** `fetchPremiumRequestUsage({ accessToken, username, year, month })` — calls the documented endpoint with `X-GitHub-Api-Version: 2026-03-10`, parses response, returns `{ usageItems, rawResponseHash }`. Maps 401/403/404/503 to typed errors. Includes `aggregatePremiumRequests(items)` per spec §15.1.

**Acceptance criteria:**
- [ ] Filters by `sku === "Copilot Premium Request"` AND `unitType === "requests"`.
- [ ] Sums `grossQuantity` as `Decimal`, not `Number` (avoid float drift).
- [ ] Records `rawResponseHash` (sha256 of raw body) for audit.

**Verification:**
- [ ] Unit tests using fixtures from the existing [apps/web/tests/test-github.py](apps/web/tests/test-github.py) flow plus synthetic 403/404/503 cases.

**Dependencies:** None
**Files:** `apps/web/src/lib/verification/githubBillingClient.ts`, `aggregatePremiumRequests.ts`, fixtures, tests
**Scope:** M

### Task 3.4: GitHub App auth flow — start + callback

**Description:** Implement `POST /api/verification/github/start` (creates state, redirects to GitHub App authorization URL) and `GET /api/verification/github/callback` (validates state, exchanges code, fetches GitHub identity, stores encrypted credential, fires initial usage fetch).

**Acceptance criteria:**
- [ ] CSRF state TTL ≤ 10 minutes, single-use.
- [ ] Refresh token + access token both encrypted at rest.
- [ ] Callback redirects to `/settings/verification?connected=1` on success or `?error=...` on failure.
- [ ] Never logs raw tokens.

**Verification:**
- [ ] Integration test with a mocked GitHub OAuth server.
- [ ] Manual: connect a real GitHub App in dev.

**Dependencies:** 3.1, 3.2, 3.3
**Files:** `apps/web/src/app/api/verification/github/start/route.ts`, `callback/route.ts`, `apps/web/src/lib/verification/githubTokenStore.ts`
**Scope:** M

### Task 3.5: Token refresh helper

**Description:** `refreshGithubUserToken(credentialId)` — checks expiry with 2-min buffer, calls GitHub refresh endpoint if needed, updates encrypted tokens, sets `status = EXPIRED` on refresh failure.

**Acceptance criteria:**
- [ ] Concurrent refresh calls for the same credential do not double-refresh (use row-level lock or idempotency token).
- [ ] On `EXPIRED`, downstream `UserVerification.githubBillingStatus` becomes `EXPIRED`.

**Verification:**
- [ ] Unit tests for valid / near-expiry / expired / refresh-fails paths.

**Dependencies:** 3.4
**Files:** `apps/web/src/lib/verification/refreshGithubUserToken.ts`, tests
**Scope:** S

### Task 3.6: Compare + status routes

**Description:** Implement `comparePremiumUsage` (spec §15.2), `GET /api/verification/status`, `POST /api/verification/github/refresh`, `DELETE /api/verification/github`.

**Acceptance criteria:**
- [ ] Status thresholds match spec §10.3 exactly.
- [ ] Refresh route accepts optional `periodKey`, defaults to current UTC month.
- [ ] Disconnect deletes the credential row, preserves snapshots, sets `publicBadgeEligible = false`.

**Verification:**
- [ ] Unit tests for `comparePremiumUsage` covering all five thresholds + zero-verified edge case.
- [ ] Integration tests for each route.

**Dependencies:** 3.5
**Files:** `apps/web/src/app/api/verification/**`, `apps/web/src/lib/verification/comparePremiumUsage.ts`, `verificationStatus.ts`
**Scope:** M

### Task 3.7: Settings UI

**Description:** Build `/settings/verification` page with the six sections from spec §13.2. Use existing settings page patterns.

**Acceptance criteria:**
- [ ] Empty / connected-healthy / mismatch / unsupported / expired states each render with spec copy.
- [ ] No GitHub token ever reaches the browser.

**Verification:**
- [ ] Component tests for each state.
- [ ] Manual smoke against dev.

**Dependencies:** 3.6
**Files:** `apps/web/src/app/settings/verification/page.tsx`, `apps/web/src/components/verification/*.tsx`
**Scope:** M

### Task 3.8: Cron routes + Docker sidecar scheduler

**Description:** Add `POST /api/cron/cleanup-upload-nonces` and `POST /api/cron/refresh-github-verification`. Both gated by `Authorization: Bearer ${CRON_SECRET}` with constant-time comparison. Add a `cron` service to the production `docker-compose.yml` running `supercronic` (or `ofelia`) with a committed crontab that `curl`s the routes on schedule. Cron container reads `CRON_SECRET` from the same secret store as the web service.

**Acceptance criteria:**
- [ ] Nonce GC deletes rows older than 10 minutes.
- [ ] Refresh job iterates `ACTIVE` credentials, refreshes each, writes a `VerifiedMetricSnapshot`, creates anomalies on mismatch.
- [ ] Both routes return 401 without the secret and on secret mismatch (constant-time compare).
- [ ] Cron container restarts cleanly and does not double-fire on container restart.
- [ ] Refresh job is idempotent for the same `(userId, periodKey)` within an hour.

**Verification:**
- [ ] Integration tests for both routes with and without the secret.
- [ ] `docker-compose up` in dev shows the cron container hitting both routes on schedule.
- [ ] Crontab + Dockerfile committed under `apps/web/docker/cron/`.

**Dependencies:** 3.6
**Files:** `apps/web/src/app/api/cron/**`, `vercel.json`
**Scope:** S

### Checkpoint: Phase 3
- [ ] Internal beta users can connect, see comparison card, disconnect.
- [ ] No public-facing changes outside `/settings/verification`.
- [ ] Cron is running in production for ≥7 days without errors.

### Task 3.9: User notification — verification connected (confirmation)

**Description:** After successful Task 3.4 callback, send a transactional email confirming the connection. Uses the `MailService` shipped by admin-plan Phase G. Template: `verification-connected.{html,txt}`.

**Acceptance criteria:** sent at most once per connect event; opt-out only by disconnecting (transactional, no unsubscribe needed).
**Dependencies:** Task 3.4, admin-plan Phase G.
**Files:** `apps/web/src/lib/verification/notifications.ts`, templates under `apps/web/src/lib/mail/templates/`
**Scope:** XS

### Task 3.10: User notification — verification token expired

**Description:** Refresh job (Task 3.8) sets credential to `EXPIRED`; before that final state transition, send `verification-expired.{html,txt}` with a deep link to `/settings/verification`.

**Acceptance criteria:** at most one email per credential per expired event (track `lastExpiredNotifiedAt` on the credential).
**Dependencies:** Task 3.5, 3.8.
**Scope:** XS

### Task 3.11: User notification — status changed to MISMATCH

**Description:** Refresh job detects transition `HEALTHY|MINOR_MISMATCH|WARNING → MISMATCH`; send `verification-mismatch.{html,txt}` with neutral language ("your local count differs from GitHub billing more than expected") — never accusatory. Include reasons (upload lag, billing delay, parser drift) and link to settings.

**Acceptance criteria:** at most one email per status transition into MISMATCH (suppress repeats while status remains MISMATCH).
**Dependencies:** Task 3.6, 3.8.
**Scope:** XS

---

## Phase 4 — Public Badge

### Task 4.1: Badge eligibility logic

**Description:** `recomputeBadgeEligibility(userId)` per spec §12.1. Called after every accepted upload and every verification refresh.

**Acceptance criteria:** matches all four conditions in §12.1.
**Verification:** unit tests for each ineligibility reason.
**Dependencies:** 3.6
**Files:** `apps/web/src/lib/verification/badgeEligibility.ts`, tests
**Scope:** S

### Task 4.2: Public profile trust metadata

**Description:** Extend `GET /api/profile/[username]` to include the `trust` block from spec §9.6. **Never** expose mismatch detail, raw GitHub data, or anomalies.

**Acceptance criteria:** response shape matches §9.6 exactly; ineligible users get `hasGithubBillingVerification: false`.
**Verification:** integration test + snapshot test.
**Dependencies:** 4.1
**Files:** [apps/web/src/app/api/profile/[username]/route.ts](apps/web/src/app/api/profile/[username]/route.ts), tests
**Scope:** S

### Task 4.3: Profile UI badge

**Description:** Render the badge on public profile and leaderboard cards with the spec's exact label and tooltip. Repo badges must NOT inherit the verified state.

**Acceptance criteria:** badge appears only when eligible; copy matches §12.2 / §12.3 verbatim.
**Verification:** component tests; visual review.
**Dependencies:** 4.2
**Files:** `apps/web/src/app/u/**`, `apps/web/src/app/leaderboard/**`, badge component
**Scope:** M

### Checkpoint: Phase 4
- [ ] Eligible test user shows badge.
- [ ] Ineligible test user does not.
- [ ] Tooltip copy reviewed by product.

---

## Phase 5 — Leaderboard Policy

### Task 5.1: Exclude high-mismatch profiles from premium-request leaderboard boost

**Description:** Filter `MISMATCH` users out of premium-based featured queries. Keep them visible on standard leaderboard.

**Acceptance criteria:** spec §12.5 behaviors match.
**Verification:** integration tests.
**Dependencies:** 4.1
**Files:** existing leaderboard query layer
**Scope:** S

### Task 5.2: Internal moderation view (optional, defer if scope-tight)

**Description:** `/admin/anomalies` listing recent `VerificationAnomaly` rows with severity filter. Auth-gated to admin role.
**Scope:** M (defer)

### Checkpoint: Complete
- [ ] All acceptance criteria from spec §20 verified.
- [ ] Security review complete (see Risks).
- [ ] Documentation updated.

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Existing devices have no usable HMAC key (bcrypt hash is one-way) | High | Reuse the secret presented in the existing `Bearer tokenId.secret` header as the HMAC key — server already validates it via bcrypt before signature check. No re-provisioning needed. |
| GitHub App registration / review delays | Medium | Register the app in week 1, in parallel with Phase 1 server work. |
| `grossQuantity` numeric precision drift | Medium | Store as `Decimal(20,6)`; never convert to `Number` until display. |
| User Copilot is org-billed → endpoint returns empty | Medium | Map to `UNSUPPORTED`, never `MISMATCH`. Spec §3.4 + §10.4 already covered. |
| Cron secret leakage | Medium | Use platform secret manager; rotate on deploy; routes return 401 not 403 to avoid info leak. |
| Encryption key loss → all credentials unusable | High | Document key backup procedure; store key in platform secret manager only; on recovery, force all users to re-connect. |
| Client adoption stalls in Phase 2 | Medium | Add upgrade prompt in extension; do not flip Task 2.5 until adoption ≥95%. |
| Replay store grows unbounded if cron fails | Low | Add monitoring alert on `UploadNonce` row count. |

## Resolved Decisions (was Open Questions)

- ✅ **Release cadence:** **Admin console (Phase A of admin plan) ships first**, so anomaly review and user moderation are available throughout the verification beta. Verification Phase 1 starts in parallel with admin Phase A only after admin Task A.0 (network isolation) lands. Verification Phase 3 strictly waits for admin Phase A complete.
- ✅ **Cron:** Docker sidecar container (`supercronic`/`ofelia`) on the VPS hitting `/api/cron/*` with `CRON_SECRET`.
- ✅ **GitHub App:** Already registered; credentials available in env.
- ✅ **Phase 1 enforcement flag:** Env-only (`PROMPTSTREAK_ENFORCE_SIGNED_UPLOADS`).
- ✅ **Encryption rotation:** Versioned-key AES-256-GCM from day one (Task 3.2).
- ✅ **Min client version:** Semver string compared via the `semver` npm package; `PROMPTSTREAK_MIN_SIGNED_CLIENT_VERSION` is a deploy-time env (e.g., `"1.4.0"`). CLI and extension both stamp `X-Promptstreak-Client-Version` with their package.json version.
- ✅ **Admin tooling:** Tracked in a separate plan — see [promptstreak-admin-implementation-plan.md](promptstreak-admin-implementation-plan.md). Phase 5.2 in this doc is replaced by that plan; `VerificationAnomaly` review lives there.
- ✅ **Integration test DB:** New `DATABASE_URL_TEST` + `.itest.ts` suffix + `pnpm --filter web test:integration` script (Task 1.0 below).
- ✅ **Mail transport:** Existing self-hosted Stalwart mail server (already used for `emagin8.de`, will be extended to host `promptstreak.dev`). The web app is an SMTP **client only** — no MTA logic in this repo. Exposed via `MailService` interface in `apps/web/src/lib/mail/`. Sending domain `promptstreak.dev`. User-facing notification tasks are 3.9, 3.10, 3.11 below.
- ✅ **Secrets storage:** Docker Compose `secrets:` blocks for `CRON_SECRET`, `GITHUB_TOKEN_ENCRYPTION_KEYS`, GitHub App private key, `SMTP_PASSWORD`. `.env` file is for non-sensitive config only (SMTP host, port, user, from address).
- ✅ **Logs:** stdout from each service shipped to self-hosted Loki + Grafana on the VPS. Verification routes log structured JSON; PII-bearing fields (emails, usernames) are sha256-hashed before logging.

### Task 1.0 (prepended): Integration test infrastructure

**Description:** Add `DATABASE_URL_TEST` to `.env.example`, `pnpm --filter web test:integration` script that runs `prisma migrate deploy` against the test DB then `tsx --test 'src/**/*.itest.ts'`. Add a small `withTestDb(fn)` helper that wraps each test in a transaction that rolls back. Document the local setup (a second Postgres database on the same instance is fine).

**Acceptance criteria:**
- [ ] Running `pnpm --filter web test:integration` against an empty test DB succeeds.
- [ ] Helper isolates state between tests (no cross-test pollution).
- [ ] CI config updated to provision `DATABASE_URL_TEST`.

**Verification:**
- [ ] One sample `.itest.ts` passes.

**Dependencies:** None — must land before Task 1.3.
**Files:** `apps/web/package.json`, `.env.example`, `apps/web/src/lib/test/withTestDb.ts`, CI config
**Scope:** S

## Verification Before Implementation

- [ ] Spec sections §3, §5, §7, §8, §10, §12 reviewed against this plan
- [ ] Every task has acceptance criteria and a verification step
- [ ] No task touches more than ~5 files (except 2.2 / 2.3 which span an app — acceptable)
- [ ] Checkpoints exist between every phase
- [ ] Human review of plan before Task 1.1 starts
