# Promptstreak Complete GDPR MVP Implementation Prompt

Use this prompt with Copilot / coding agent to implement the complete GDPR-safe MVP rollout for Promptstreak while minimizing expensive premium-model requests.

---

```md
You are implementing the Promptstreak GDPR/security MVP rollout in this repository.

## Mission

Make Promptstreak safe for MVP release as a privacy-first public leaderboard and badge platform.

Promptstreak stores only:
- GitHub authentication identity metadata
- optional email, if explicitly needed
- normalized token/request usage statistics
- privacy/public-sharing settings
- consent events
- export/deletion/reporting records

Promptstreak must not store:
- raw prompts
- raw AI completions
- source code
- file contents
- terminal output
- environment variables
- secrets
- diffs or patches
- chat transcripts
- raw IDE logs

The MVP is acceptable only when public exposure is impossible without explicit opt-in, raw sensitive content cannot be persisted, and users can access/export/delete their data.

---

## Cost/request constraint

Premium model requests are expensive, especially for high-multiplier models.

Optimize your workflow to reduce unnecessary requests:

1. Do not attempt broad speculative refactors.
2. Work phase-by-phase.
3. Before editing each phase, do one consolidated inspection pass over relevant files.
4. After inspection, create a short internal implementation checklist.
5. Then proceed without asking for confirmation unless there is a true blocker.
6. Prefer existing utilities, schemas, tests, and project conventions.
7. Reuse existing code instead of inventing parallel systems.
8. Keep each phase reviewable.
9. Use targeted tests while developing.
10. Run full lint/build/test gates only after each phase is complete.
11. If tests fail, fix the direct cause instead of redesigning the implementation.
12. Do not repeatedly rediscover package scripts; inspect them once and reuse the closest matching commands.

---

## Existing repository anchors to reuse

Reuse these existing patterns where applicable:

- AES-GCM key-ring pattern:
  - `apps/web/src/lib/crypto/tokenEncryption.ts`

- Existing admin/user deletion pipeline:
  - `softDeleteUserCore`
  - `apps/web/src/lib/admin/userManagement.ts`

- Existing audit pattern:
  - `withAuditedAction`
  - `apps/web/src/lib/admin/actionLog.ts`

- Existing lifecycle checks:
  - `apps/web/src/app/api/upload/route.ts`
  - Look for current logic equivalent to: active user and `deletedAt IS NULL`

- Existing profile policy logic:
  - `profile-policy.ts`
  - existing profile-policy tests

- Existing rate limiting:
  - `apps/web/src/lib/ratelimit.ts`

- Existing upload/audit/verification tables:
  - `UploadAudit`
  - `VerificationAnomaly`
  - `UserVerification`

Do not add parallel systems if these can be extended safely.

---

## Global hard constraints

These apply to every phase:

- Do not expose email, GitHub ID, OAuth tokens, upload tokens, HMAC hashes, encryption metadata, or internal security metadata in public APIs.
- Do not persist raw prompts, completions, code, terminal output, environment variables, secrets, diffs, patches, file contents, or chat transcripts.
- Do not log sensitive request bodies.
- Do not log forbidden-field values.
- Do not weaken existing auth, rate limits, validation, or security checks.
- Do not add new dependencies unless strictly necessary.
- Do not remove tests unless replacing them with stronger coverage.
- Do not leave TODOs for required MVP behavior.
- Do not make unrelated formatting-only changes.
- Do not rename public APIs unless the phase explicitly requires it.
- All public visibility must be opt-in.
- Private, deleted, and suspended users must never appear in public profiles, leaderboards, badges, or repo stats.

---

# Phase Q — Quick-Win Hot-Fix

Implement this first. This phase closes the critical MVP release blockers before the heavier encryption/identity migration.

## Q.1 Centralize lifecycle predicate

Create or update:

- `apps/web/src/lib/policy/userLifecycle.ts`

Centralize lifecycle logic:

- user is active
- user is not deleted
- suspended users are not public
- deleted users are not public

Apply this predicate to public readers:

- `apps/web/src/app/api/profile/[username]/route.ts`
- `apps/web/src/app/api/repo/[username]/[...repo]/route.ts`, if present
- `apps/web/src/app/api/leaderboard/route.ts`
- `apps/web/src/app/api/leaderboard/repos/route.ts`
- `apps/web/src/lib/repo-leaderboard-data.ts`
- `apps/web/src/lib/ide-leaderboard-data.ts`
- `apps/web/src/lib/badges/data.ts`
- `apps/web/src/app/api/badges/[user]/[type]/route.ts`
- `apps/web/src/app/api/badges/repo/[owner]/[repo]/[type]/route.ts`

Acceptance criteria:

- Private users do not appear in public endpoints.
- Deleted users do not appear in public endpoints.
- Suspended users do not appear in public endpoints.
- Lifecycle predicates are enforced at query/API layer, not only in UI filtering.
- Public responses never expose sensitive identity or internal security metadata.

---

## Q.2 Replace hard-delete account behavior with immediate soft-delete/public takedown

Update:

- `apps/web/src/app/api/account/route.ts`

Use or wrap:

- `softDeleteUserCore`

Behavior:

- Set user status to deleted or equivalent.
- Set `deletedAt = now()`.
- Revoke devices/tokens where existing code supports it.
- Clear public surfaces.
- Invalidate affected public caches.
- Keep this as immediate one-step MVP behavior.
- Do not implement the full two-step deletion flow yet unless it already fits cleanly.

Acceptance criteria:

- Account deletion immediately removes profile visibility.
- Account deletion immediately removes leaderboard entries.
- Account deletion immediately disables public badges.
- Account deletion immediately hides repo/workspace public stats.
- Deletion state is respected by every public API route.
- Deletion state is respected by every badge route.
- Deletion state is respected by every leaderboard query.
- Deletion is idempotent and safe to retry.

---

## Q.3 Tighten ingestion contract

Update:

- `packages/shared-schema/src/snapshot.ts`
- `packages/shared-schema/src/agent-snapshot.ts`
- `apps/web/src/app/api/upload/route.ts`, if needed

Requirements:

- Use strict schema validation where appropriate.
- Reject unknown or forbidden fields before persistence.
- Reject forbidden fields at any depth.

Forbidden field names include:

```text
prompt
completion
code
file
fileContent
terminal
terminalOutput
chat
message
secret
secrets
env
environment
diff
patch
raw
body
transcript
```

Rules:

- Rejection responses may include field names.
- Rejection logs may include field names.
- Rejection logs must never include forbidden values.
- Do not log full request bodies.
- Keep payload size limits.
- Keep or add rate limits on ingestion.

Acceptance criteria:

- The app cannot ingest or persist raw prompts.
- The app cannot ingest or persist raw completions.
- The app cannot ingest or persist source code.
- The app cannot ingest or persist terminal output.
- The app cannot ingest or persist env vars/secrets/diffs/patches/chat transcripts.
- Rejected payloads do not leak values to logs.

---

## Q.4 Add tag-aware cache invalidation scaffold

Create:

- `apps/web/src/lib/cache/tags.ts`

Export helpers such as:

```ts
userTag(userId: string): string
userBadgesTag(userId: string): string
repoTag(userId: string, repo: string): string
leaderboardTag(): string
```

Apply where Phase Q touches public profile, badges, leaderboard, repo stats, settings, and account deletion.

Acceptance criteria:

- Profile cache invalidates on deletion/privacy-relevant changes.
- Badge cache invalidates on deletion/badge-relevant changes.
- Leaderboard cache invalidates on deletion/leaderboard-relevant changes.
- Repo cache invalidates on deletion/repo-relevant changes.
- No stale public stats remain visible after account deletion.

---

## Q.5 Add static legal/footer routes

Add legal pages:

- Impressum
- Privacy Policy / Datenschutzerklärung
- Terms / Nutzungsbedingungen
- Contact
- Report Abuse

Recommended routes:

- `app/(legal)/impressum/page.tsx`
- `app/(legal)/privacy/page.tsx`
- `app/(legal)/terms/page.tsx`
- `app/(legal)/contact/page.tsx`
- `app/(legal)/report-abuse/page.tsx`

Update:

- `apps/web/src/app/layout.tsx`

Requirements:

- Global footer links to all legal pages.
- Impressum uses current German wording:
  - `Angaben gemäß § 5 DDG`
- Privacy page explains:
  - GitHub authentication
  - usage-stat ingestion
  - public profile
  - leaderboard
  - badges
  - data export
  - account deletion
  - retention windows
  - processors/vendors
  - that Promptstreak does not collect raw prompts, completions, source code, terminal output, or chat transcripts
- If no optional analytics/tracking exists, privacy page may say:
  - essential cookies only
  - no marketing cookies
  - no ad tracking

Acceptance criteria:

- Footer has Impressum.
- Footer has Privacy Policy.
- Footer has Terms.
- Footer has Contact.
- Footer has Report Abuse.
- Legal routes build successfully.
- Privacy policy describes actual data flow.

---

## Q.6 Phase Q tests

Add or update tests for:

- active user visible only when allowed
- private user hidden
- deleted user hidden
- suspended user hidden
- forbidden ingestion fields rejected
- forbidden field values not logged
- account deletion removes public surfaces
- cache invalidation after deletion/privacy change
- footer/legal links present

Run targeted tests first, then the quality gate.

---

# Phase 0 — Baseline characterization tests

Before schema-heavy changes, capture current behavior snapshots for:

- auth
- settings
- leaderboard
- badges
- profile API
- repo leaderboard
- account deletion
- ingestion API

Acceptance criteria:

- Current behavior is covered by tests before migration-sensitive changes.
- Regression tests make privacy leaks visible.
- Tests are updated as behavior intentionally becomes more private.

---

# Phase 1 — Identity and privacy schema foundation

## Phase 1a — Schema-only migration

Update:

- `apps/web/prisma/schema.prisma`

Add tables:

- `user_identities`
- `privacy_settings`
- `consent_events`
- `account_deletion_jobs`
- `data_export_requests`
- `abuse_reports`
- `repo_visibility_settings`

Defaults:

- `profile_public = false`
- `leaderboard_opt_in = false`
- `badges_enabled = false`
- repo/workspace public visibility defaults false

Keep:

- existing `User.githubId` as temporary bridge column during migration.

Acceptance criteria:

- Migration works on clean DB.
- Migration works on existing DB.
- Existing users receive privacy-first defaults.
- Existing users do not become public accidentally.

---

## Phase 1b — Identity encryption and HMAC helpers

Create:

- `apps/web/src/lib/crypto/identityCrypto.ts`

Use:

- AES-GCM/key-ring pattern from existing token encryption code.
- Dedicated HMAC pepper from env, for deterministic lookup.

Requirements:

- Encrypt GitHub user ID.
- Encrypt email if stored.
- Create deterministic normalized HMAC for GitHub ID lookup.
- Create deterministic normalized HMAC for email lookup if email is stored.
- HMAC pepper is not stored in DB.
- Encryption keys and HMAC pepper are read from secure env/config.
- Unit tests cover encryption/decryption and HMAC normalization/lookup.

Acceptance criteria:

- GitHub user ID is encrypted at rest.
- Email is nullable and encrypted if stored.
- Lookup does not require plaintext GitHub ID in DB.
- HMAC hashes and encryption metadata are never exposed publicly or exported.

---

## Phase 1c — Backfill and dual-read auth

Create:

- `scripts/backfill-user-identities.ts`, or equivalent project script

Update:

- `apps/web/src/lib/auth.ts`

Requirements:

- Backfill existing users into `user_identities`.
- Create default `privacy_settings` for existing users.
- Add dual-read auth lookup:
  - first use hash-based identity lookup
  - fallback to legacy `User.githubId`
- Guard dual-read behind a feature flag if project uses flags.
- Keep legacy bridge until production bake period.

Acceptance criteria:

- Existing users can still sign in.
- New users use encrypted identity path.
- Backfilled users get privacy-first defaults.
- Auth does not expose plaintext identifiers in logs.

---

## Phase 1d — OAuth scope minimization

Update GitHub provider config.

Requirements:

- Use minimal GitHub OAuth scope.
- Do not request `user:email` unless product explicitly needs email.
- Keep email nullable.
- Document email-fetch trigger if needed later.
- Do not request repo permissions for normal leaderboard/badge flow.

Acceptance criteria:

- Standard login uses minimum required GitHub scope.
- No broad GitHub repo access requested.
- Email collection is justified, nullable, and documented.

---

# Phase 2 — Privacy settings API and symmetric consent

Create or update:

- `PATCH /api/settings/privacy`
- existing settings/profile route if needed
- settings UI data contract

Requirements:

- Replace single `profilePublic` control with independent settings:
  - `profile_public`
  - `leaderboard_opt_in`
  - `badges_enabled`
  - repo/workspace visibility defaults
- Every grant writes a `consent_events` record.
- Every withdrawal writes a `consent_events` record.
- Withdrawal must be as easy as grant.
- Turning off a setting immediately removes the related public surface.
- UI copy must clearly explain public exposure.

Acceptance criteria:

- New users are private by default.
- Public profile is opt-in.
- Leaderboard is opt-in.
- Badges are opt-in.
- Repo/workspace visibility is opt-in.
- Consent events record user, action, setting, old value, new value, timestamp, and request context.
- Consent logs do not expose plaintext secrets.

---

# Phase 2.1 — Public-surface opt-in gating

Extend lifecycle policy to include feature-specific privacy settings.

Public profile:

- require active user
- require not deleted
- require not suspended
- require `profile_public = true`

Leaderboards:

- require active user
- require not deleted
- require not suspended
- require `profile_public = true`
- require `leaderboard_opt_in = true`

Badges:

- require active user
- require not deleted
- require not suspended
- require `profile_public = true`
- require `badges_enabled = true`

Repo public stats:

- require user public gates
- require repo/workspace visibility enabled

Acceptance criteria:

- Private users are excluded from public profile, leaderboards, badges, and repo stats.
- Deleted users are excluded from all public surfaces.
- Suspended users are excluded from all public surfaces.
- Hidden repos/workspaces are excluded from profile, leaderboards, and badges.
- Public gating is enforced at database/query/API layer.

---

# Phase 2.2 — Full cache invalidation coverage

Hook cache invalidation from:

- privacy settings writer
- repo visibility writer
- account deletion writer/job
- suspension admin action
- badge settings writer
- leaderboard opt-in writer

Acceptance criteria:

- Profile cache invalidates on profile visibility change.
- Leaderboard cache invalidates on leaderboard opt-in change.
- Badge cache invalidates on badge setting change.
- Repo cache invalidates on repo visibility change.
- All public caches invalidate on deletion.
- All public caches invalidate on suspension.
- Cache invalidation is tested.

---

# Phase 3 — Ingestion audit and compatibility

Requirements:

- Wire active upload route to `UploadAudit` if appropriate.
- Surface anomalies into existing `VerificationAnomaly` where appropriate.
- Use existing `lib/ratelimit.ts`.
- Keep `/api/upload` compatibility.
- Add `/api/ingest/usage-snapshot` only if needed and low-churn.
- Shared validation/auth/rate-limit logic must be centralized.

Acceptance criteria:

- Ingestion is rate-limited.
- Ingestion has payload-size limits.
- Ingestion rejects forbidden content fields.
- Ingestion does not log sensitive body content.
- Ingestion audit records do not contain raw sensitive payload data.

---

# Phase 4 — DSAR data export

Create endpoints such as:

- `POST /api/me/export`
- `GET /api/me/export/:id`
- optional download endpoint

Requirements:

- Authenticated only.
- Rate-limited.
- JSON export.
- Async request records in `data_export_requests`.
- Small synchronous export is allowed only if simple and safe.
- Export generation must not log sensitive export content.

Export includes:

- account metadata
- GitHub identity metadata that belongs to the user
- privacy settings
- consent events
- usage snapshots and aggregates
- public profile state
- leaderboard opt-in state
- badge state
- repo/workspace visibility settings
- public URLs currently associated with the user, if any

Export excludes:

- OAuth tokens
- upload tokens
- HMAC hashes
- encryption metadata
- internal security signals
- admin notes
- rate-limit data
- raw prompts/completions/code/file contents/terminal output/env vars/secrets/diffs/patches/chat transcripts

Acceptance criteria:

- User can request/download machine-readable JSON export.
- Export is authenticated and rate-limited.
- Export contains user data and privacy/public settings.
- Export excludes secrets, tokens, hashes, and internal security signals.

---

# Phase 5 — Two-step account deletion

Create or update:

- `POST /api/me/deletion-request`
- `POST /api/me/deletion-confirm`
- deletion job worker or existing job mechanism

Requirements:

- Deletion requires explicit confirmation.
- Immediate public takedown happens before async cleanup.
- Revoke upload tokens.
- Delete or anonymize GitHub user ID.
- Delete or anonymize email.
- Delete or anonymize usage stats unless retention is explicitly justified.
- Keep only minimal non-identifying audit/security records if necessary.
- Job is idempotent and safe to retry.
- Retention windows must match privacy policy copy.

Acceptance criteria:

- Deletion immediately removes public profile.
- Deletion immediately removes user from leaderboards.
- Deletion immediately disables public badges.
- Deletion immediately hides repo/workspace public stats.
- Deletion revokes upload tokens.
- Deletion state is respected everywhere.
- Deletion triggers cache invalidation.
- Deletion can be retried safely.

---

# Phase 5.1 — GitHub disconnect and token lifecycle

Create or update:

- `/api/me/github/disconnect`

Requirements:

- User can disconnect GitHub from settings.
- Disconnect revokes/deletes stored OAuth tokens, if any.
- Disconnect revokes upload tokens if GitHub identity is required for future uploads.
- Disconnect does not accidentally leave profile/leaderboard/badges inconsistent.
- Disconnect behavior is documented in UI copy.
- Disconnect is audited without exposing plaintext secrets.

Acceptance criteria:

- User can disconnect GitHub.
- Tokens are revoked/deleted as appropriate.
- Public surfaces remain consistent.
- Action is audited safely.

---

# Phase 6 — Legal/compliance pages and footer finalization

If Phase Q added placeholder legal pages, finalize content.

Pages:

- Impressum
- Privacy Policy / Datenschutzerklärung
- Terms / Nutzungsbedingungen
- Contact
- Report Abuse
- Cookie Preferences, only if optional analytics/tracking exists

Acceptance criteria:

- Impressum uses `Angaben gemäß § 5 DDG`.
- Privacy policy describes actual data flow.
- Privacy policy says Promptstreak does not collect raw prompts/completions/code/terminal/chat transcripts.
- Privacy policy explains GitHub auth, usage stats, profile, leaderboard, badges, export, deletion, processors, retention.
- Footer links exist globally.

---

# Phase 6.1 — Abuse report flow

Create:

- public report endpoint
- report form
- admin triage basics

Categories:

- impersonation
- spam
- offensive content
- trademark/copyright issue
- security concern
- other

Requirements:

- Rate-limited.
- Does not log unnecessary personal data.
- Admin review possible.
- Admin actions audited.

Acceptance criteria:

- Public profiles have reachable report-abuse path.
- Abuse report endpoint is rate-limited.
- Admin can review reports.
- Admin actions are audited.

---

# Phase 7 — Settings UX and user journeys

Update:

- `apps/web/src/app/settings/page.tsx`

Include:

- Public profile toggle
- Leaderboard opt-in toggle
- Badge enable/disable toggle
- Repo/workspace visibility controls
- Download/export data
- Delete account
- Disconnect GitHub
- Consent transparency text
- Privacy explanations

Acceptance criteria:

- User can control all public surfaces from settings.
- User can export data.
- User can delete account.
- User can disconnect GitHub.
- UI copy clearly explains public sharing.

---

# Phase 8 — Admin DSAR/moderation operations

Requirements:

- Admin UI avoids plaintext identity exposure by default.
- Email is masked where possible.
- HMAC hashes are not shown.
- OAuth/upload tokens are not shown.
- Admin can see privacy state.
- Admin can trigger/inspect deletion/export jobs without viewing unnecessary personal data.
- Admin privacy-sensitive actions are audited.

Acceptance criteria:

- Admin can manage DSAR/deletion/reporting workflows.
- Admin UI does not leak secrets.
- Admin actions are audited.

---

# Phase 9 — Verification hardening

Expand test coverage across the full privacy matrix.

Required test coverage:

- identity encryption/decryption
- HMAC normalization and lookup
- forbidden ingestion field detection
- consent event writing
- privacy settings updates
- public profile gating
- leaderboard gating
- badge gating
- repo visibility gating
- export generation
- deletion request/confirmation
- GitHub disconnect
- abuse report submission
- private user
- public-profile-only user
- leaderboard-opted user
- badge-enabled user
- hidden-repo user
- deleted user
- suspended user
- privacy withdrawal after previously public state

Acceptance criteria:

- Privacy regression matrix is covered.
- No public endpoint leaks private/deleted/suspended/hidden data.
- Required quality gates pass.

---

# Phase 10 — Post-MVP legacy cleanup

Do not block MVP on this unless the migration is already safely complete.

Requirements:

- Remove legacy plaintext `User.githubId` bridge only after:
  - all users are backfilled
  - auth traffic confirms hash-based lookup only
  - production bake period passes
  - rollback plan exists

Acceptance criteria:

- Legacy plaintext bridge removed safely.
- No auth regression.
- No plaintext GitHub ID dependency remains.

---

# Required release-gate commands

Run targeted tests during each phase.

Before considering the MVP done, run:

```bash
pnpm --filter @promptstreak/web db:generate
pnpm --filter @promptstreak/web db:migrate
pnpm --filter @promptstreak/web lint
pnpm --filter @promptstreak/web build
pnpm --filter @promptstreak/web test
pnpm --filter @promptstreak/web test:integration
```

If command names differ, inspect package scripts once and use the closest equivalent.

Do not repeatedly rediscover scripts.

---

# MVP release blockers

The MVP must not be released if any of the following are true:

- A private user appears in any public endpoint.
- A deleted user appears in any public endpoint.
- A suspended user appears in any public endpoint.
- A hidden repo appears in profile, leaderboard, or badge output.
- A user appears on a leaderboard without explicit opt-in.
- A badge exposes stats without explicit badge enablement.
- Raw prompt/code/completion/terminal/env/diff/patch content can be persisted.
- Email, GitHub ID, OAuth token, upload token, HMAC hash, or encryption metadata appears in public API output.
- Export includes secrets, tokens, hashes, or internal security signals.
- Delete account does not immediately remove public surfaces.
- Privacy setting withdrawal does not immediately remove public surfaces.
- Public caches can continue showing stale private/deleted data.
- Legal footer links are missing.
- Privacy Policy does not describe the actual data flow.
- Required tests are missing or failing.

---

# Suggested implementation rhythm

Use small reviewable pull requests.

Recommended order:

1. Phase Q.1 lifecycle policy helper and tests
2. Phase Q.1 public reader wiring
3. Phase Q.2 soft-delete/public takedown
4. Phase Q.3 ingestion strict validation
5. Phase Q.4 cache tags
6. Phase Q.5 legal pages/footer
7. Phase 1 schema migration
8. Phase 1 identity crypto/backfill/auth
9. Phase 2 privacy settings/consent
10. Phase 2.1 public opt-in gating
11. Phase 2.2 cache invalidation coverage
12. Phase 4 export
13. Phase 5 deletion
14. Phase 5.1 GitHub disconnect
15. Phase 6.1 abuse reporting
16. Phase 7 settings UX
17. Phase 8 admin ops
18. Phase 9 verification hardening

Do not merge a phase without tests for the privacy behavior it changes.

---

# Final response format after each phase

When a phase is complete, respond with:

1. Phase completed
2. Summary of changes
3. Files changed
4. Tests run and results
5. Acceptance criteria satisfied
6. Security/privacy notes
7. Remaining phases

If any acceptance criterion cannot be satisfied, explain exactly why and propose the smallest safe follow-up change.
```
