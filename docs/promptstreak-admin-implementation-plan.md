# Implementation Plan: Promptstreak Admin Console

> **Companion to:** [promptstreak-verification-concrete-spec.md](promptstreak-verification-concrete-spec.md), [promptstreak-verification-implementation-plan.md](promptstreak-verification-implementation-plan.md)
> **Status:** Plan v1 — ready for review
> **Updated:** 2026-04-27

---

## Overview

Build a separate admin console for Promptstreak: distinct auth domain (separate from end-user auth), mandatory 2FA, and an operations-grade UI covering user management, anomaly review, verification ops, device revocation, audit search, manual badge override, system metrics, and a complete admin-action audit log.

This plan is sized for one engineer working alongside the verification rollout. It produces value as early as Phase A (admin can sign in and manage users) so anomaly review (Phase C) can land in lockstep with the verification beta.

## Architecture Decisions

- **Network isolation is the first line of defense.** The admin console is **never reachable from the public internet**. Two access paths only: (a) requests originating from inside the VPS Docker network (loopback / private network), or (b) an SSH tunnel from an authorized operator workstation that forwards a local port to the admin service. Even with valid credentials, requests from any other origin are rejected at the reverse-proxy layer before reaching Next.js.
- **No Cloudflare Zero Trust / Tailscale in v1.** SSH tunnels already deliver zero public exposure with strong auth. Putting a third party in front would either terminate TLS for admin traffic (CF Zero Trust) or add an external dependency for admin access (Tailscale). Revisit only if the admin team grows past ~10 operators.
- **Secrets live in Docker Compose `secrets:` blocks**, mounted as files at `/run/secrets/<name>` and read at process start. `.env` files hold non-sensitive config only. Applies to: `CRON_SECRET`, `ADMIN_INTERNAL_PROXY_SECRET`, `GITHUB_TOKEN_ENCRYPTION_KEYS`, GitHub App private key, `SMTP_PASSWORD`, admin bootstrap token (if used).
- **Logs go to self-hosted Loki + Grafana** running as additional services in the same Docker Compose stack. PII fields (emails, usernames, IPs) are sha256-hashed before logging; `AdminActionLog` rows reference the same hashes so HTTP logs and admin actions correlate without leaking PII to the log store.
- **Separate auth domain.** Admins are not regular users; they live in a separate `AdminUser` table with their own credentials, sessions, and 2FA secrets. No shared rows with `User`. Compromising an end-user account never grants admin access.
- **Routes namespaced under `/admin`** with a dedicated middleware guard. All `/admin/*` and `/api/admin/*` requests are blocked unless (1) the request reached the admin-only network surface AND (2) an admin session cookie is present AND (3) the session is 2FA-completed.
- **2FA = TOTP (RFC 6238)** via authenticator app (Google Authenticator, 1Password, etc.). No SMS. Recovery codes provided at enrollment. Required for every admin from day one — no grace period.
- **Session cookie is separate** (`__Host-promptstreak_admin_sid`, `Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/`). 30-minute idle timeout, 8-hour absolute timeout.
- **Every admin action writes to `AdminActionLog`** before the action takes effect. The log is append-only at the application layer; no admin UI to delete log rows.
- **No bootstrap-from-env admin.** First admin is created via a one-shot CLI script (`pnpm --filter web admin:create`) that requires DB access. This avoids accidentally leaving an env-set super-admin in production.
- **Read-only by default.** Mutating endpoints require an extra `confirm: true` field in the request body and are rate-limited per admin to 30 mutations / hour by default.
- **Stack reuse.** Uses existing Next.js App Router, Prisma, and Tailwind — no new framework. Charts via a single lightweight dep added in Phase F (e.g., `recharts` or hand-rolled SVG).

## Phase Map (Dependency Order)

```
Phase A: Network isolation + admin auth + 2FA + bootstrap   (foundation, ships first)
   │   └── (admin Phase A enables verification Phase 1 to start in parallel)
   └── Phase B: User management + device revocation
        └── Phase C: Anomaly review + verification ops + manual badge override
             └── Phase D: Upload audit search
                  └── Phase E: Admin-action audit log surfaces
                       └── Phase F: System metrics dashboard

Cross-cutting infra (can run partially in parallel with A–C):
   Phase G: Mail (Resend + MailService) — needed by C and by verification 3.9/3.10/3.11
   Phase H: Backups + restore drill        — should land before any user data lives in prod
   Phase I: Observability (Loki/Grafana)   — lands alongside Phase A so admin actions are searchable from day one
```

This admin plan is **the first thing implemented**, so anomaly review and user moderation are available throughout the verification beta.

---

## Phase A — Network Isolation + Admin Auth + 2FA + Bootstrap

Goal: A bootstrapped admin can sign in with password + TOTP **only via SSH tunnel or from inside the VPS** and reach a stub `/admin` page. Nothing else works yet.

### Task A.0: Network isolation (reverse proxy + Docker topology)

**Description:** Make `/admin` and `/api/admin/*` unreachable from the public internet. Two layers of defense:

1. **Reverse proxy (Caddy / nginx / Traefik) splits the surface area.**
   - The public vhost (`promptstreak.dev`) **denies** any path matching `^/admin(/|$)` or `^/api/admin/` with a 404 (not 403 — avoid confirming the surface exists).
   - A separate internal vhost or listener bound to `127.0.0.1:<admin_port>` (loopback only) proxies the same Next.js upstream and **does** serve `/admin` and `/api/admin/*`.
   - Operators reach the internal vhost via SSH local port-forward: `ssh -L 8443:127.0.0.1:<admin_port> vps`, then visit `https://localhost:8443/admin`.

2. **Application-layer trusted-origin check** as defense in depth (Task A.6 middleware).
   - Middleware reads the verified peer address (set by the reverse proxy via a sealed header like `X-Internal-Source: admin-loopback`, signed with `ADMIN_INTERNAL_PROXY_SECRET`, OR via Unix socket).
   - Any `/admin` or `/api/admin/*` request that lacks the verified marker is rejected with 404, regardless of session validity.

**Reverse-proxy recipe (Caddy example, committed to repo):**
```caddyfile
# Public vhost — explicitly hides admin surface
promptstreak.dev {
    @admin path /admin* /api/admin/*
    handle @admin {
        respond 404
    }
    reverse_proxy web:3000
}

# Internal vhost — loopback only, reachable via SSH tunnel
http://127.0.0.1:8081 {
    bind 127.0.0.1
    @admin path /admin* /api/admin/*
    handle @admin {
        header_up X-Internal-Source admin-loopback
        header_up X-Internal-Proxy-Secret {env.ADMIN_INTERNAL_PROXY_SECRET}
        reverse_proxy web:3000
    }
    handle {
        respond 404
    }
}
```

**Docker Compose topology:**
- `web` service exposes port 3000 only on the internal Docker network (no `ports:` mapping to host).
- `caddy` service binds `:443` and `:80` on the host's public IP, plus `127.0.0.1:8081` for the internal vhost.
- `web` uses `restart: unless-stopped`; `caddy` depends on `web`.

**SSH tunnel operator runbook (committed to repo as `docs/ops/admin-access.md`):**
- Operators must connect with `ssh -L 8443:127.0.0.1:8081 promptstreak-vps`.
- VPS SSH config restricts admin operators to key-only auth + 2FA (e.g., `pam_google_authenticator`).
- VPS firewall (`ufw`/`nftables`) blocks all inbound except 22 (rate-limited), 80, 443.

**Acceptance criteria:**
- [ ] `curl -i https://promptstreak.dev/admin` returns 404.
- [ ] `curl -i https://promptstreak.dev/api/admin/auth/login` returns 404.
- [ ] From inside the VPS: `curl -i http://127.0.0.1:8081/admin/login` returns 200 (HTML).
- [ ] From an operator workstation with SSH tunnel up: `https://localhost:8443/admin/login` loads.
- [ ] Without the SSH tunnel, the operator workstation cannot reach the internal vhost (connection refused).
- [ ] `X-Internal-Proxy-Secret` is generated at deploy time, stored in the same secret store as `CRON_SECRET`, never logged.
- [ ] Caddyfile + Docker Compose changes committed under `apps/web/docker/`.
- [ ] Operator runbook committed.

**Verification:**
- [ ] Smoke test from outside the VPS confirms 404 on every admin path.
- [ ] Smoke test via SSH tunnel confirms admin reachable.
- [ ] Removing the `X-Internal-Proxy-Secret` header (simulated public bypass attempt) → 404 from middleware (Task A.6).

**Dependencies:** None. Lands first in Phase A.
**Files:** `apps/web/docker/Caddyfile`, `apps/web/docker/docker-compose.yml`, `docs/ops/admin-access.md`
**Scope:** M

### Task A.1: Prisma models for admins

**Description:** Add `AdminUser`, `AdminSession`, `AdminTotpSecret`, `AdminRecoveryCode`, `AdminActionLog` plus `AdminRole` enum (`SUPER_ADMIN`, `ADMIN`, `READ_ONLY`).

**Schema highlights:**
- `AdminUser`: `id`, `email` (unique, citext), `passwordHash` (bcrypt cost ≥12), `role`, `status` (`ACTIVE`/`SUSPENDED`), `failedLoginCount`, `lockedUntil`, `lastLoginAt`, timestamps.
- `AdminTotpSecret`: `adminUserId` (unique), `encryptedSecret` (uses the same versioned-key helper from verification Task 3.2), `confirmedAt`, `createdAt`. Secret is only `confirmedAt`-set after the admin proves they can produce a valid code.
- `AdminRecoveryCode`: `adminUserId`, `codeHash` (bcrypt), `usedAt`. 10 codes per admin, single-use.
- `AdminSession`: `id` (cuid), `adminUserId`, `tokenHash` (sha256 of session token; raw token only in cookie), `twoFactorCompletedAt`, `idleExpiresAt`, `absoluteExpiresAt`, `ipHash`, `userAgentHash`, `createdAt`, `revokedAt`.
- `AdminActionLog`: `id`, `adminUserId`, `action` (enum), `targetType`, `targetId`, `summary`, `detailsJson`, `ipHash`, `createdAt`. Indexes on `(adminUserId, createdAt)` and `(targetType, targetId, createdAt)`.

**Acceptance criteria:**
- [ ] Migration applies cleanly.
- [ ] `AdminUser.email` uses `citext` (case-insensitive unique).
- [ ] `AdminTotpSecret.encryptedSecret` reuses the verification token-encryption helper (no second crypto stack).

**Verification:**
- [ ] `pnpm --filter web prisma migrate dev --name admin_phase_a`

**Dependencies:** Verification Task 3.2 (encryption helper). If admin work starts before verification Phase 3, lift Task 3.2 forward — it has no other deps.
**Files:** [apps/web/prisma/schema.prisma](apps/web/prisma/schema.prisma)
**Scope:** M

### Task A.2: Bootstrap CLI script

**Description:** `pnpm --filter web admin:create` — interactive script that prompts for email, password (twice, validates strength), and creates an `AdminUser` with `role = SUPER_ADMIN` and `status = ACTIVE`. Exits non-zero if any admin already exists unless `--force` is passed.

**Acceptance criteria:**
- [ ] Refuses to run in production unless `ADMIN_BOOTSTRAP_ALLOWED=true`.
- [ ] Password meets minimum policy (≥12 chars, mixed character classes — checked via `zxcvbn` or similar; add as devDependency only).
- [ ] Output never echoes the password; cleared from terminal history (`stty -echo` on POSIX).

**Verification:**
- [ ] Run the script in dev, then sign in successfully after Task A.5.

**Dependencies:** A.1
**Files:** `apps/web/scripts/admin-create.ts`, `package.json`
**Scope:** S

### Task A.3: Password + TOTP libraries

**Description:** Wrap `bcryptjs` for password hashing/verification (cost 12) and add `otplib` (or equivalent) for TOTP. Implement `generateTotpSecret()`, `verifyTotpCode(secret, code)`, `generateRecoveryCodes()` (10 × 10-char base32 strings, hashed with bcrypt before storage).

**Acceptance criteria:**
- [ ] TOTP verification accepts ±1 step (30s before/after) for clock drift.
- [ ] Recovery codes are returned plaintext exactly once at generation; only hashes persisted.
- [ ] All library calls are wrapped — no direct `otplib` use in routes.

**Verification:**
- [ ] Unit tests for password hash/verify, TOTP verify with known RFC 6238 vectors, recovery code generation/verify.

**Dependencies:** None
**Files:** `apps/web/src/lib/admin/password.ts`, `totp.ts`, `recoveryCodes.ts`, tests
**Scope:** S

### Task A.4: Admin session helpers

**Description:** `createAdminSession`, `loadAdminSession`, `markTwoFactorComplete`, `revokeAdminSession`, `touchSessionIdle`. Cookie name `__Host-promptstreak_admin_sid`; only the raw 32-byte session token in the cookie, sha256 hash in DB.

**Acceptance criteria:**
- [ ] Cookie attributes: `Secure; HttpOnly; SameSite=Strict; Path=/`.
- [ ] Idle timeout updated on every authenticated request (30 min).
- [ ] Absolute timeout enforced (8 h) regardless of activity.
- [ ] Constant-time comparison on session lookup.
- [ ] Session lookup returns `null` (never throws) for unknown / expired / revoked sessions.

**Verification:**
- [ ] Unit tests + one integration test against test DB.

**Dependencies:** A.1, A.3
**Files:** `apps/web/src/lib/admin/session.ts`, tests
**Scope:** M

### Task A.5: Admin auth routes

**Description:**
- `POST /api/admin/auth/login` — email + password → creates session with `twoFactorCompletedAt = null`. Returns `{ requires2fa: "setup" | "verify" }`.
- `POST /api/admin/auth/2fa/setup` — generates TOTP secret + QR-code provisioning URI; secret stored unconfirmed.
- `POST /api/admin/auth/2fa/confirm` — first-time enrollment: verify code, mark `confirmedAt`, return recovery codes.
- `POST /api/admin/auth/2fa/verify` — subsequent logins: verify code (or recovery code), set `twoFactorCompletedAt = now()`.
- `POST /api/admin/auth/logout` — revokes session.
- `POST /api/admin/auth/recovery-code` — accepts a recovery code in lieu of TOTP, marks the code used.

**Acceptance criteria:**
- [ ] Failed login increments `failedLoginCount`; after 5 failures within 15 min, sets `lockedUntil = now() + 30 min`.
- [ ] Login response identical timing/shape for unknown email vs wrong password (avoid enumeration).
- [ ] 2FA setup endpoint refuses if a confirmed secret already exists.
- [ ] All routes rate-limited per IP (10/min) and per email (5/min).
- [ ] Every login attempt — success or failure — written to `AdminActionLog`.

**Verification:**
- [ ] Integration tests for: happy login → 2FA setup → next login → 2FA verify → access /admin.
- [ ] Tests for lockout, recovery code, expired session, replayed cookie after logout.

**Dependencies:** A.1, A.3, A.4
**Files:** `apps/web/src/app/api/admin/auth/**`, tests
**Scope:** M

### Task A.6: Admin middleware + stub `/admin` page

**Description:** `middleware.ts` matcher for `/admin/:path*` and `/api/admin/:path*`. **Order of checks:**
1. **Trusted-origin gate (defense in depth for Task A.0).** Verify `X-Internal-Source: admin-loopback` is present **and** `X-Internal-Proxy-Secret` matches `ADMIN_INTERNAL_PROXY_SECRET` via constant-time compare. If not, respond **404** (never 401/403 — do not confirm the admin surface to an attacker that bypassed the proxy).
2. Session load + 2FA check (skipped for `/api/admin/auth/*` and `/admin/login`).
3. Attach `adminUser` to a request-scoped context.

Stub `/admin` page just shows "Hello, {email}" and a logout button.

**Acceptance criteria:**
- [ ] Request without trusted-origin headers → 404 (regardless of session).
- [ ] Request with valid origin but no session → redirect to `/admin/login` (HTML) or 401 (JSON).
- [ ] Request with valid origin + session but 2FA incomplete → redirect to `/admin/login/verify`.
- [ ] Headers added: `Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow`, `Referrer-Policy: no-referrer`.
- [ ] Constant-time compare on `X-Internal-Proxy-Secret`.
- [ ] Missing `ADMIN_INTERNAL_PROXY_SECRET` env at startup → process exits non-zero (fail-closed).

**Verification:**
- [ ] Manual: bootstrap, log in, see stub page; clear cookie, see redirect.

**Dependencies:** A.5
**Files:** `apps/web/src/middleware.ts`, `apps/web/src/app/admin/layout.tsx`, `page.tsx`, `login/page.tsx`, `login/verify/page.tsx`
**Scope:** M

### Task A.7: `requireAdmin` helper + `logAdminAction` helper

**Description:** Server-side helpers used by every admin API route. `requireAdmin(req, { role? })` returns `adminUser` or throws a typed 401/403. `logAdminAction({ adminUserId, action, targetType, targetId, summary, details })` writes to `AdminActionLog` and **must be called before the mutation runs**. Provide a `withAuditedAction` wrapper that takes a handler and ensures the log row exists even if the mutation fails (status field on the log: `ATTEMPTED`, `SUCCEEDED`, `FAILED`).

**Acceptance criteria:**
- [ ] Helper enforces optional minimum role.
- [ ] Wrapper writes `ATTEMPTED` first, updates to `SUCCEEDED`/`FAILED` after.
- [ ] Failure to write the log aborts the action.

**Verification:**
- [ ] Unit tests + one wired example.

**Dependencies:** A.5
**Files:** `apps/web/src/lib/admin/requireAdmin.ts`, `auditLog.ts`, tests
**Scope:** S

### Checkpoint: Phase A
- [ ] Public internet cannot see `/admin/*` or `/api/admin/*` (404 from edge).
- [ ] Admin is reachable via SSH tunnel only.
- [ ] Bootstrap script creates a super-admin (run via SSH on the VPS).
- [ ] Admin can log in with password + TOTP.
- [ ] Recovery code path works.
- [ ] All login attempts present in `AdminActionLog` with `ipHash`.
- [ ] Security review of Phase A (network isolation, authn flow, session handling, 2FA enrollment) before Phase B starts.

---

## Phase B — User Management + Device Revocation

Goal: Admins can list/search end users, view a user detail page, suspend/restore/delete users, and revoke individual device tokens.

### Task B.1: User list + search API

**Description:** `GET /api/admin/users?query=&status=&cursor=&limit=` — paginated cursor-based list with search by username/email, filter by status. Returns minimal projection (no GitHub tokens, no secrets).

**Acceptance criteria:** cursor stable across inserts; `limit` capped at 100; search uses indexed columns.
**Dependencies:** A.7
**Files:** `apps/web/src/app/api/admin/users/route.ts`, tests
**Scope:** S

### Task B.2: User detail API

**Description:** `GET /api/admin/users/[id]` — returns user profile, device count, verification status, recent upload count, recent anomaly count. No secrets, no GitHub tokens.
**Dependencies:** B.1
**Files:** `apps/web/src/app/api/admin/users/[id]/route.ts`, tests
**Scope:** S

### Task B.3: User mutation APIs

**Description:**
- `POST /api/admin/users/[id]/suspend` — sets `User.status = SUSPENDED`; suspended users cannot upload or appear on leaderboards. Sends `account-suspended` email.
- `POST /api/admin/users/[id]/restore` — clears suspension.
- `DELETE /api/admin/users/[id]` — soft-delete (sets `deletedAt`, anonymizes username/email, revokes all devices, deletes GitHub credential, preserves `AdminActionLog`/`UploadAudit` rows for forensics).

**Acceptance criteria:**
- [ ] Each mutation requires `{ confirm: true }` in body.
- [ ] Each mutation writes `AdminActionLog` via `withAuditedAction`.
- [ ] Suspending a user immediately invalidates their device tokens (next upload returns 401).
- [ ] Suspend sends exactly one `account-suspended` email; restore does not send mail.
- [ ] Soft delete is idempotent and does NOT send mail (the address may already be invalid/anonymized).

**Verification:**
- [ ] Integration tests for each mutation including unauthorized / wrong-role cases.

**Dependencies:** B.2, Phase G, requires `User.status` + `User.deletedAt` columns (add via migration in this task).
**Files:** route files, schema migration, tests
**Scope:** M

### Task B.4: Device revocation API

**Description:** `GET /api/admin/users/[id]/devices`, `POST /api/admin/devices/[deviceId]/revoke`. Sets `Device.revokedAt`. Already-issued bearer tokens stop working immediately because `/api/upload` already checks `revokedAt`. Sends `device-revoked` email to the user via `MailService` (Phase G).

**Acceptance criteria:** revoking is idempotent; audit log includes device's `secretLastFour` for traceability (never the full secret); user notification fires exactly once.
**Dependencies:** B.2, Phase G
**Files:** route files, tests
**Scope:** S

### Task B.5: User management UI

**Description:** `/admin/users` (list with search), `/admin/users/[id]` (detail with action buttons + device list). Confirmation modals for every mutation; show recent admin actions on this user.

**Acceptance criteria:** all mutating buttons disabled for `READ_ONLY` admins; success/failure toasts; no client-side caching of user PII beyond the current page.
**Dependencies:** B.1, B.2, B.3, B.4
**Files:** `apps/web/src/app/admin/users/**`, components
**Scope:** M

### Checkpoint: Phase B
- [ ] Admin can find, view, suspend, delete users and revoke devices.
- [ ] All actions appear in `AdminActionLog`.
- [ ] Suspended user gets 401 on upload within seconds.

---

## Phase C — Anomaly Review + Verification Ops + Manual Badge Override

Goal: Admins can triage `VerificationAnomaly` rows, see the verification status of any user, force a verification refresh, and override badge eligibility.

### Task C.1: Anomaly list + detail API

**Description:**
- `GET /api/admin/anomalies?severity=&code=&unresolved=true&cursor=&limit=`
- `GET /api/admin/anomalies/[id]`

**Acceptance criteria:** filters compose; default sort is `detectedAt DESC`; detail includes the anonymized `detailsJson`.
**Dependencies:** Verification Task 1.1 (`VerificationAnomaly` model)
**Files:** route files, tests
**Scope:** S

### Task C.2: Anomaly resolve API

**Description:** `POST /api/admin/anomalies/[id]/resolve` with `{ resolution: string, confirm: true }`. Sets `resolvedAt` and `resolution`.
**Dependencies:** C.1
**Files:** route file, tests
**Scope:** XS

### Task C.3: Verification ops APIs

**Description:**
- `GET /api/admin/verification?status=&cursor=` — list users by `UserVerification.githubBillingStatus`.
- `GET /api/admin/verification/[userId]` — detail including current period comparison.
- `POST /api/admin/verification/[userId]/refresh` — force a refresh (reuses Task 3.6 logic).
- `POST /api/admin/verification/[userId]/disconnect` — admin-side disconnect (reuses Task 3.6 disconnect path).

**Acceptance criteria:** refresh/disconnect both audited; rate-limited per admin (10/min) to prevent GitHub API abuse.
**Dependencies:** Verification Task 3.6
**Files:** route files, tests
**Scope:** M

### Task C.4: Manual badge override API

**Description:** `POST /api/admin/users/[id]/badge-override` with `{ eligible: boolean, reason: string, expiresAt?: ISO, confirm: true }`. Adds an `AdminBadgeOverride` row that takes precedence over computed `publicBadgeEligible` until `expiresAt`. New Prisma model required.

**Acceptance criteria:**
- [ ] Override forces `publicBadgeEligible` to the chosen value regardless of computed eligibility.
- [ ] Override expiry is honored without admin action (checked in `recomputeBadgeEligibility`).
- [ ] Reason is required and stored.

**Dependencies:** Verification Task 4.1 (badge eligibility logic) — extend it to consult overrides.
**Files:** schema migration, route file, modify `recomputeBadgeEligibility`, tests
**Scope:** M

### Task C.5: Anomaly + verification UIs

**Description:** `/admin/anomalies` (filterable list with bulk-resolve), `/admin/anomalies/[id]` (detail + resolve form). `/admin/verification` (status overview with counts per status). `/admin/users/[id]` extended with verification panel + override controls.
**Dependencies:** C.1, C.2, C.3, C.4
**Files:** `apps/web/src/app/admin/anomalies/**`, `apps/web/src/app/admin/verification/**`, components
**Scope:** L → split: C.5a (anomalies UI), C.5b (verification UI + override controls). Each M.

### Checkpoint: Phase C
- [ ] Anomaly triage workflow usable end-to-end.
- [ ] Admin can refresh / disconnect a user's verification.
- [ ] Manual badge override applies on the public profile within one cron tick.

---

## Phase D — Upload Audit Search

### Task D.1: Audit search API

**Description:** `GET /api/admin/upload-audits?userId=&tokenId=&signatureStatus=&accepted=&from=&to=&cursor=&limit=`. Composable filters; default page size 50.
**Acceptance criteria:** queries hit existing `(userId, receivedAt)` and `(tokenId, receivedAt)` indexes; no full table scans for typical queries.
**Dependencies:** Verification Task 1.1
**Files:** route file, tests
**Scope:** S

### Task D.2: Audit search UI

**Description:** `/admin/uploads` with filters and a paginated table. Row click → drawer with full audit detail (no payload bodies — only metadata).
**Dependencies:** D.1
**Files:** `apps/web/src/app/admin/uploads/**`
**Scope:** M

### Checkpoint: Phase D
- [ ] Admin can locate any upload by user, device, or signature status within seconds.

---

## Phase E — Admin-Action Audit Log Surfaces

### Task E.1: Action log API

**Description:** `GET /api/admin/action-log?adminUserId=&targetType=&targetId=&action=&from=&to=&cursor=`. No mutations on this resource at all.
**Dependencies:** A.1
**Files:** route file, tests
**Scope:** XS

### Task E.2: Action log UI

**Description:** `/admin/action-log` with filters. Surface the log on every user/anomaly/device detail page as a side panel via `targetType`+`targetId` filter.
**Dependencies:** E.1
**Files:** `apps/web/src/app/admin/action-log/**`, panel component
**Scope:** S

### Task E.3: Lock down log immutability

**Description:** Add a Postgres trigger that prevents `UPDATE` and `DELETE` on `AdminActionLog`. Documented as defense-in-depth — application code already never mutates rows.
**Acceptance criteria:** integration test confirms `UPDATE`/`DELETE` raises an error.
**Dependencies:** A.1
**Files:** migration with raw SQL, test
**Scope:** XS

### Checkpoint: Phase E
- [ ] Every admin action visible per-actor and per-target.
- [ ] Log rows cannot be tampered with at the DB layer.

---

## Phase F — System Metrics Dashboard

### Task F.1: Metrics aggregation queries

**Description:** Server functions that compute, over a time window:
- Uploads/min (last 24h, hourly buckets)
- Signature status share (% VALID / MISSING / INVALID / others) — last 24h and 7d
- GitHub fetch error rate — last 24h
- Active devices, active users, verified-eligible users (snapshot)
- Anomalies created per severity, last 7d

All queries use existing indexes; cache results in-memory with a 60s TTL.

**Acceptance criteria:** each query returns in <500ms on a representative dataset; no query missing an index.
**Dependencies:** Phases A, verification Phase 1, verification Phase 3
**Files:** `apps/web/src/lib/admin/metrics.ts`, tests
**Scope:** M

### Task F.2: Metrics API

**Description:** `GET /api/admin/metrics/overview` returning all dashboard data in one response.
**Dependencies:** F.1
**Files:** route file, tests
**Scope:** XS

### Task F.3: Dashboard UI

**Description:** `/admin` becomes the dashboard (the stub from A.6 is replaced). Charts via a small dep — `recharts` recommended; alternatively render time-series as inline SVG. Each card links to the relevant detail view (uploads → audit search, anomalies → anomaly list, etc.).
**Acceptance criteria:** dashboard refreshes at most every 60s on its own; manual refresh button respects the same TTL.
**Dependencies:** F.2
**Files:** `apps/web/src/app/admin/page.tsx`, chart components, `package.json`
**Scope:** M

### Checkpoint: Phase F
- [ ] Dashboard surfaces upload health, signature health, GitHub fetch health, and anomaly volume.
- [ ] All dashboard cards drill down to the relevant search view.

---

## Phase G — Mail Client (SMTP)

Goal: A single typed `MailService` interface used by admin and verification code, backed by `nodemailer` over SMTP. The web app is an SMTP **client only** — server, domain, DKIM/SPF/DMARC, and credential provisioning are handled outside this repo. The app receives ready-to-use credentials via env and a Docker secret.

### Task G.1: MailService interface + SMTP transport

**Description:** `MailService.send({ to, template, data })` where `template` is a typed enum. Implementation uses `nodemailer` configured entirely from env:

| Variable | Source | Purpose |
|---|---|---|
| `SMTP_HOST` | env | Mail server hostname |
| `SMTP_PORT` | env | Submission port (e.g., 465 or 587) |
| `SMTP_SECURE` | env | `true` for implicit TLS, `false` for STARTTLS |
| `SMTP_USER` | env | Submission username (e.g., `noreply@promptstreak.dev`) |
| `SMTP_PASSWORD` | Docker secret at `/run/secrets/smtp_password` | Submission password |
| `MAIL_FROM` | env | From header (e.g., `Promptstreak <noreply@promptstreak.dev>`) |

Connection reused via a singleton transporter. Writes a `MailLog` row per send (recipient sha256, template, providerMessageId from SMTP response, status, error). Templates live in `apps/web/src/lib/mail/templates/<name>/{html.tsx,text.ts,subject.ts}`.

**Acceptance criteria:**
- [ ] Throws clearly at startup if any required env var or the password secret is missing.
- [ ] All templates render to both HTML and text variants.
- [ ] `MailLog.recipient` is sha256-hashed (no raw email stored).
- [ ] SMTP failures retry once with exponential backoff before marking `FAILED`.
- [ ] Transporter validates the upstream certificate (no `rejectUnauthorized: false`).
- [ ] Unit tests use a mock transport (`nodemailer-mock` or equivalent).
- [ ] One integration test against a real SMTP account, gated by an env flag so CI can skip it.

**Dependencies:** None (lands in parallel with admin Phase A).
**Files:** `apps/web/src/lib/mail/service.ts`, `smtpTransport.ts`, `mailLog.ts`, schema migration adding `MailLog`, `.env.example` updated with all `SMTP_*` and `MAIL_FROM` keys
**Scope:** M

### Task G.2: Admin templates

**Description:** Templates `admin-lockout`, `admin-login-from-new-ip`. The login route compares the current `ipHash` against the most recent `AdminActionLog` LOGIN entries (last 30 days); unfamiliar hash triggers the new-IP email. Lockout email sent when `lockedUntil` is set.

**Acceptance criteria:**
- [ ] At most one new-IP email per (admin, ipHash) per 30 days.
- [ ] Lockout email sent exactly once per lockout event.

**Dependencies:** G.1, A.5
**Scope:** S

### Task G.3: User templates

**Description:** Templates `verification-connected`, `verification-expired`, `verification-mismatch`, `device-revoked`, `account-suspended`. Wired by verification Tasks 3.9/3.10/3.11 and admin Tasks B.3/B.4.

**Acceptance criteria:** copy is neutral and informative; never accusatory; every template includes a settings deep link and a one-line explanation of why the email was sent.

**Dependencies:** G.1
**Scope:** S

### Checkpoint: Phase G
- [ ] App boots cleanly with all `SMTP_*` env + secret provided; fails fast if anything is missing.
- [ ] Test send via mock transport passes in unit tests.
- [ ] Test send against the real SMTP account (manual / opt-in integration test) lands in inbox.
- [ ] All v1 templates render correctly.

---

## Phase H — Backups + Restore Drill

Goal: Postgres data is backed up automatically, encryption keys are recoverable, and a restore drill is performed before any real user data lives in production.

### Task H.1: Automated Postgres backups

**Description:** Add a `postgres-backup` Docker service (e.g., `prodrigestivill/postgres-backup-local`) that runs `pg_dump` on a schedule, writes encrypted dumps to a host-mounted volume, and rotates daily/weekly/monthly snapshots. Backups are encrypted at rest with `age` or `gpg` using a recovery public key whose private key is stored offline (operator's password manager).

**Acceptance criteria:**
- [ ] Daily backup runs without intervention.
- [ ] 7 daily, 4 weekly, 6 monthly retention policy enforced.
- [ ] Backup file is unreadable without the recovery key (verified by attempting to read with no key).
- [ ] Backup volume monitored for free space; alert when <20% free.

**Dependencies:** None (can land alongside Phase A).
**Files:** `apps/web/docker/docker-compose.yml`, `docs/ops/backups.md`
**Scope:** S

### Task H.2: Off-VPS backup copy

**Description:** A second cron job (in the same `cron` sidecar) ships the latest encrypted dump to a separate object store (e.g., Backblaze B2 or Cloudflare R2 — free tier is plenty). API key stored as a Docker secret. Off-site copy retained 30 days.

**Acceptance criteria:**
- [ ] Latest backup appears in remote bucket within 24h of creation.
- [ ] Bucket is private; bucket-level credential is read-only for restores, write-only for the cron job.

**Dependencies:** H.1
**Files:** `apps/web/docker/cron/crontab`, secrets config
**Scope:** S

### Task H.3: Encryption-key escrow

**Description:** Document and execute the procedure for escrowing `GITHUB_TOKEN_ENCRYPTION_KEYS` and the backup-decryption key. Both stored in two independent operator password managers + one printed copy in a sealed envelope. Without the encryption key, encrypted GitHub tokens in restored backups are useless — by design.

**Acceptance criteria:**
- [ ] Procedure documented in `docs/ops/key-escrow.md`.
- [ ] Two operators can each independently recover both keys (tested in dry run).

**Dependencies:** None
**Scope:** XS

### Task H.4: Restore drill

**Description:** Spin up a clean staging VPS from scratch using only: latest off-site backup + escrowed keys + this repo. Restore Postgres, decrypt one GitHub credential, confirm verification routes function.

**Acceptance criteria:**
- [ ] Drill completed end-to-end with timing recorded.
- [ ] Drill report committed to `docs/ops/restore-drill-<date>.md`.
- [ ] Repeat at least quarterly.

**Dependencies:** H.1, H.2, H.3
**Scope:** M

### Checkpoint: Phase H
- [ ] Backups running daily, off-site copy verified.
- [ ] Successful restore drill before production launch.

---

## Phase I — Observability (Loki + Grafana)

Goal: Every admin action and every server-side error is searchable in Grafana within seconds. PII never reaches the log store.

### Task I.1: Structured logger + PII hashing

**Description:** Wrap a small JSON logger (`pino` or hand-rolled) used by all server code. Helper `hashPii(value)` returns a stable sha256 hex. Replace any direct `console.log` in `apps/web/src/**` with the logger. Lint rule blocks new `console.*` calls in `app/**` and `lib/**`.

**Acceptance criteria:**
- [ ] Every log line is single-line JSON.
- [ ] No log line contains raw email, raw username, raw IP, raw token, or raw GitHub response body.
- [ ] Lint rule in CI catches violations.

**Dependencies:** None
**Files:** `apps/web/src/lib/log/logger.ts`, ESLint config, refactor pass
**Scope:** M

### Task I.2: Loki + Grafana stack in Docker Compose

**Description:** Add `loki`, `promtail`, and `grafana` services. Promtail tails Docker JSON logs and ships to Loki. Grafana bound to loopback only (same SSH-tunnel access pattern as `/admin`). Default dashboards committed: `web-errors`, `admin-actions`, `cron-runs`, `mail-delivery`.

**Acceptance criteria:**
- [ ] Grafana reachable only via SSH tunnel.
- [ ] Dashboards load with no manual setup after `docker-compose up`.
- [ ] Loki retention 30 days for app logs, 1 year for `admin-actions` (separate stream).

**Dependencies:** I.1
**Files:** `apps/web/docker/docker-compose.yml`, `apps/web/docker/grafana/`, `apps/web/docker/loki/`, `apps/web/docker/promtail/`
**Scope:** M

### Checkpoint: Phase I
- [ ] Admin actions correlate with HTTP logs by request ID.
- [ ] Operators can answer "who suspended user X" in Grafana within 30 seconds.

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Admin surface accidentally exposed publicly (e.g., wrong proxy config, 0.0.0.0 bind) | Critical | Two independent layers: (1) reverse proxy denies `/admin*` on the public vhost, (2) middleware requires signed `X-Internal-Proxy-Secret`. Add a CI/deploy smoke test that `curl https://promptstreak.dev/admin` returns 404; fail deploy if not. |
| SSH credential compromise on operator workstation | Critical | SSH key-only + per-operator passphrase + `pam_google_authenticator` 2FA on the VPS sshd; operator key revocable from `~/.ssh/authorized_keys`; SSH login alerts. Even with SSH access, the attacker still needs admin password + TOTP. |
| `ADMIN_INTERNAL_PROXY_SECRET` leaks (e.g., via env dump) | High | Treated as a Sev-2 secret — rotated on a schedule and on operator changes. Rotation requires only proxy + web restart, no code change. App-layer 2FA still blocks unauthorized actions. |
| Admin password DB leak | Critical | bcrypt cost ≥12; 2FA mandatory means password alone is insufficient; lockout on brute force. |
| 2FA secret leak from DB | High | Stored encrypted via versioned-key AES-GCM (reuses verification Task 3.2); DB compromise alone insufficient without encryption key. |
| Admin session hijack via stolen cookie | High | `__Host-` prefix, `Secure`, `HttpOnly`, `SameSite=Strict`, short idle/absolute timeouts, IP-hash logged for forensics. |
| Insider deletes audit log rows | High | Postgres trigger blocks UPDATE/DELETE on `AdminActionLog` (Task E.3); no admin route exposes mutation. |
| Bootstrap script abused in prod | Medium | Refuses to run unless `ADMIN_BOOTSTRAP_ALLOWED=true` AND no admin exists; documented to unset the env var post-bootstrap. |
| Admin nukes a real user by mistake | Medium | Soft delete only; explicit `confirm: true`; audit log preserves identifying detail; restore path possible by reversing the soft delete in DB. |
| TOTP code replay across the same 30s window | Low | Track last-used TOTP code per admin; reject re-use within window. |
| Recovery codes lost / hoarded by ex-employees | Medium | Super-admin can rotate any admin's recovery codes via `/admin/users/[id]` admin-management UI (Phase B extension if needed); document rotation procedure. |
| GitHub API quota burned by admin-triggered refreshes | Medium | Per-admin rate limit on Task C.3 refresh route. |

## Cross-Cutting Requirements

- **Network isolation is non-negotiable.** No admin surface ever reachable from the public internet. Reverse-proxy denial + middleware trusted-origin gate must both pass. Any deploy that exposes `/admin` to `0.0.0.0` is a Sev-1 incident.
- **CSP:** `/admin/*` ships a strict CSP — no inline scripts, no third-party origins, only same-origin assets.
- **No analytics, no Sentry on `/admin/*`** unless the admin opts in. Avoid leaking user PII to third parties via admin pages.
- **All admin routes set `Cache-Control: no-store`** and `X-Robots-Tag: noindex, nofollow`.
- **Database column-level care:** never SELECT password hashes, TOTP secrets, or recovery code hashes into API responses — use Prisma `select` on every admin query.
- **Bootstrap CLI runs on the VPS only**, invoked over SSH — never exposed via HTTP.

## Dependencies on Verification Plan

| Admin task | Depends on verification task |
|---|---|
| A.1 (encryption reuse) | Verification Task 3.2 — lift forward if admin work begins first. |
| C.1, C.2 | Verification Task 1.1 (`VerificationAnomaly` table). |
| C.3 | Verification Task 3.6 (refresh + disconnect logic). |
| C.4 | Verification Task 4.1 (`recomputeBadgeEligibility`). |
| D.1 | Verification Task 1.1 (`UploadAudit` table). |
| F.1 | Verification Phases 1 + 3 data. |

If admin work runs in parallel with verification, Phase A depends only on Task 3.2 from the verification plan; everything else can proceed independently until Phase C.

## Verification Before Implementation

- [ ] Spec authority: `/admin` UX needs a brief design pass — copy and confirmations should be reviewed by a second engineer.
- [ ] Security review of Phase A complete before Phase B starts.
- [ ] No task touches more than ~5 files (except B.5 / C.5 which are split).
- [ ] Bootstrap procedure documented in repo `README` before first prod deploy.

## Open Questions

- [ ] WebAuthn (security keys) as a stronger 2FA option? Defer to v2; TOTP covers the threat model for now.
- [ ] "View as user" feature for support? Recommended **no** in v1 — too easy to leak data; add a read-only profile preview instead if needed.
