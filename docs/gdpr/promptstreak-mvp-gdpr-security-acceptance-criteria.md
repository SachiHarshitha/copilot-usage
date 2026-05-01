# Promptstreak MVP Privacy, Security & GDPR Acceptance Criteria

## Goal

Before MVP release, Promptstreak must be safe to operate as a privacy-first public leaderboard and badge platform that stores only GitHub identity metadata and normalized token-usage statistics.

The implementation is acceptable only if all criteria below are satisfied.

---

## 1. Data Minimization Acceptance Criteria

- [ ] The app does not ingest, store, log, or export raw prompts.
- [ ] The app does not ingest, store, log, or export raw AI completions.
- [ ] The app does not ingest, store, log, or export source code.
- [ ] The app does not ingest, store, log, or export terminal output.
- [ ] The app does not ingest, store, log, or export environment variables.
- [ ] The app does not ingest, store, log, or export secrets, diffs, patches, file contents, or chat transcripts.
- [ ] The ingestion API accepts only normalized usage metrics such as tool name, model name, token counts, request counts, timestamps, repo/workspace identifiers, and client version.
- [ ] Any forbidden payload field is rejected before persistence.
- [ ] Rejected payloads return structured error reasons without logging sensitive request bodies.
- [ ] Payload size limits are enforced on all ingestion endpoints.
- [ ] Rate limits are enforced on ingestion endpoints.

---

## 2. GitHub Authentication Acceptance Criteria

- [ ] GitHub OAuth uses the minimum required scope.
- [ ] `user:email` is not requested unless the product explicitly needs email.
- [ ] Email is nullable in the database.
- [ ] If email is stored, it is encrypted at rest.
- [ ] GitHub user ID is encrypted at rest.
- [ ] GitHub user lookup uses deterministic HMAC/hash lookup, not plaintext GitHub ID lookup.
- [ ] The HMAC pepper is not stored in the database.
- [ ] Encryption keys and HMAC peppers are read from secure environment/config sources.
- [ ] OAuth tokens are not stored unless strictly required.
- [ ] If OAuth/upload tokens exist, they are encrypted, revocable, and excluded from exports.

---

## 3. Privacy-by-Default Acceptance Criteria

- [ ] New users are private by default.
- [ ] `profile_public` defaults to `false`.
- [ ] `leaderboard_opt_in` defaults to `false`.
- [ ] `badges_enabled` defaults to `false`.
- [ ] Repo/workspace public visibility defaults to `false`.
- [ ] No user appears on a public leaderboard until they explicitly opt in.
- [ ] No public profile is visible until the user explicitly enables it.
- [ ] No public badge renders user stats until the user explicitly enables badges.
- [ ] No repo/workspace stats are public until the user explicitly enables repo visibility.
- [ ] Public sharing settings are independent and reversible.

---

## 4. Consent and Audit Acceptance Criteria

- [ ] Every public-sharing grant creates a `consent_events` record.
- [ ] Every withdrawal creates a `consent_events` record.
- [ ] Consent events include user ID, action, setting name, old value, new value, timestamp, and request context.
- [ ] Consent withdrawal is as easy as consent grant.
- [ ] Turning off a public setting immediately removes the related public surface.
- [ ] Consent events do not expose plaintext identity secrets in admin UI or logs.

---

## 5. Public Profile Acceptance Criteria

- [ ] Public profile endpoint returns public data only when the user is active, not deleted, not suspended, and `profile_public = true`.
- [ ] Private users return `404` or an equivalent non-enumerating response.
- [ ] Deleted users return `404` or an equivalent non-enumerating response.
- [ ] Suspended users return `404` or an equivalent non-enumerating response.
- [ ] Public profile responses never include email, encrypted fields, HMAC hashes, OAuth tokens, upload tokens, internal IDs, security logs, or admin metadata.
- [ ] Public profile output includes only user-approved display data and allowed usage aggregates.

---

## 6. Leaderboard Acceptance Criteria

- [ ] User leaderboard includes only active, non-deleted, non-suspended users.
- [ ] User leaderboard includes only users with `profile_public = true`.
- [ ] User leaderboard includes only users with `leaderboard_opt_in = true`.
- [ ] Repo leaderboard includes only users/repos that satisfy profile, leaderboard, and repo visibility rules.
- [ ] Hidden repos/workspaces are excluded from all public leaderboard queries.
- [ ] Leaderboard queries enforce privacy predicates at the database/query layer, not only in UI filtering.
- [ ] Leaderboard cache is invalidated when profile, leaderboard, repo visibility, suspension, or deletion state changes.

---

## 7. Badge Acceptance Criteria

- [ ] User badge endpoint renders public stats only when the user is active, not deleted, not suspended, `profile_public = true`, and `badges_enabled = true`.
- [ ] Repo badge endpoint renders public repo stats only when profile, badge, and repo visibility predicates all pass.
- [ ] Hidden repos/workspaces never render public badges.
- [ ] Disabled/private/deleted badge states do not leak private statistics.
- [ ] Badge cache is invalidated immediately when badge visibility, profile visibility, repo visibility, suspension, or deletion state changes.
- [ ] Badge responses never expose email, GitHub ID, encrypted fields, HMAC hashes, tokens, or internal security metadata.

---

## 8. Repo/Workspace Visibility Acceptance Criteria

- [ ] Repo/workspace visibility is controlled per user.
- [ ] Repo/workspace stats are private by default.
- [ ] Users can hide or unhide individual repos/workspaces.
- [ ] Hidden repos are excluded from public profiles.
- [ ] Hidden repos are excluded from repo leaderboards.
- [ ] Hidden repos are excluded from badges.
- [ ] Hidden repo changes trigger cache invalidation.
- [ ] Repo/workspace names are treated as potentially personal or confidential metadata.

---

## 9. Data Export / DSAR Acceptance Criteria

- [ ] User can request/download a machine-readable JSON export.
- [ ] Export includes account metadata.
- [ ] Export includes GitHub identity metadata that belongs to the user.
- [ ] Export includes privacy settings.
- [ ] Export includes consent events.
- [ ] Export includes usage snapshots and aggregates.
- [ ] Export includes public profile state.
- [ ] Export includes leaderboard opt-in state.
- [ ] Export includes badge state.
- [ ] Export includes repo/workspace visibility settings.
- [ ] Export includes public URLs currently associated with the user, if any.
- [ ] Export excludes OAuth tokens.
- [ ] Export excludes upload tokens.
- [ ] Export excludes HMAC hashes.
- [ ] Export excludes encryption metadata.
- [ ] Export excludes internal security signals.
- [ ] Export excludes admin notes.
- [ ] Export excludes rate-limit data.
- [ ] Export endpoint is authenticated.
- [ ] Export endpoint is rate-limited.
- [ ] Export generation does not log sensitive export content.

---

## 10. Account Deletion Acceptance Criteria

- [ ] Account deletion requires explicit confirmation.
- [ ] Account deletion immediately removes public profile visibility.
- [ ] Account deletion immediately removes user from all leaderboards.
- [ ] Account deletion immediately disables all public badges.
- [ ] Account deletion immediately hides all repo/workspace public stats.
- [ ] Account deletion revokes upload tokens.
- [ ] Account deletion deletes or anonymizes GitHub user ID.
- [ ] Account deletion deletes or anonymizes email.
- [ ] Account deletion deletes or anonymizes usage stats unless retention is explicitly justified.
- [ ] Account deletion keeps only minimal non-identifying audit/security records if necessary.
- [ ] Deletion state is respected by every public API route.
- [ ] Deletion state is respected by every badge route.
- [ ] Deletion state is respected by every leaderboard query.
- [ ] Deletion triggers cache invalidation.
- [ ] Deletion job is idempotent and safe to retry.

---

## 11. GitHub Disconnect Acceptance Criteria

- [ ] User can disconnect GitHub from account settings.
- [ ] Disconnect revokes or deletes stored OAuth tokens, if any.
- [ ] Disconnect revokes upload tokens if the product policy requires GitHub identity for future uploads.
- [ ] Disconnect does not accidentally leave public profile, leaderboard, or badges in an inconsistent state.
- [ ] Disconnect behavior is documented in UI copy.
- [ ] Disconnect action is audited without exposing plaintext secrets.

---

## 12. Legal and Footer Acceptance Criteria

- [ ] Global footer includes Impressum.
- [ ] Global footer includes Privacy Policy / Datenschutzerklärung.
- [ ] Global footer includes Terms / Nutzungsbedingungen.
- [ ] Global footer includes Contact.
- [ ] Global footer includes Report Abuse.
- [ ] Cookie preferences are present if optional cookies, analytics, or tracking are used.
- [ ] If only strictly necessary cookies are used, the privacy policy clearly states that.
- [ ] Impressum uses current German wording: `Angaben gemäß § 5 DDG`.
- [ ] Privacy policy explains GitHub authentication.
- [ ] Privacy policy explains usage-stat ingestion.
- [ ] Privacy policy explains public profile, leaderboard, and badges.
- [ ] Privacy policy explains data export.
- [ ] Privacy policy explains account deletion.
- [ ] Privacy policy explains retention windows.
- [ ] Privacy policy explains processors/vendors such as hosting, Cloudflare, database, email, analytics, or error monitoring.
- [ ] Privacy policy explicitly says Promptstreak does not collect raw prompts, completions, source code, terminal output, or chat transcripts.

---

## 13. Abuse Reporting Acceptance Criteria

- [ ] Public profiles have a reachable report-abuse path.
- [ ] Report-abuse form supports categories such as impersonation, spam, offensive content, trademark/copyright issue, security concern, and other.
- [ ] Abuse report endpoint is rate-limited.
- [ ] Abuse report endpoint avoids logging unnecessary personal data.
- [ ] Admin triage can review abuse reports.
- [ ] Admin actions are audited.

---

## 14. Admin/Privacy Operations Acceptance Criteria

- [ ] Admin UI does not display plaintext encrypted identity fields by default.
- [ ] Admin UI masks email where possible.
- [ ] Admin UI avoids exposing HMAC hashes.
- [ ] Admin UI avoids exposing OAuth/upload tokens.
- [ ] Admin access to privacy-sensitive operations is audited.
- [ ] Admin can see privacy state: private/public, leaderboard opt-in, badges enabled, deletion status, suspension status.
- [ ] Admin can trigger or inspect deletion/export jobs without viewing unnecessary personal data.

---

## 15. Logging and Monitoring Acceptance Criteria

- [ ] Logs do not contain plaintext GitHub user IDs.
- [ ] Logs do not contain plaintext email addresses.
- [ ] Logs do not contain OAuth tokens.
- [ ] Logs do not contain upload tokens.
- [ ] Logs do not contain raw ingestion request bodies.
- [ ] Logs do not contain raw prompts, completions, code, terminal output, env vars, secrets, diffs, or patches.
- [ ] Security events are logged with minimal identifiers.
- [ ] Error monitoring scrubs request bodies and sensitive headers.
- [ ] Access logs have a defined retention period.

---

## 16. Cache Invalidation Acceptance Criteria

- [ ] Profile cache invalidates on profile visibility change.
- [ ] Leaderboard cache invalidates on leaderboard opt-in change.
- [ ] Badge cache invalidates on badge setting change.
- [ ] Repo leaderboard/cache invalidates on repo visibility change.
- [ ] All public caches invalidate on account deletion.
- [ ] All public caches invalidate on account suspension.
- [ ] Cache invalidation is tested.
- [ ] No stale public stats remain visible after privacy withdrawal or deletion.

---

## 17. Migration Acceptance Criteria

- [ ] Migration works on clean database.
- [ ] Migration works on existing database.
- [ ] Existing users are backfilled into `user_identities`.
- [ ] Existing users receive privacy-first defaults.
- [ ] Existing users do not become public accidentally after migration.
- [ ] Dual-read auth works during transition.
- [ ] Legacy plaintext `User.githubId` is removed only after successful backfill and production bake period.
- [ ] Migration rollback plan exists.
- [ ] Migration does not expose plaintext IDs in logs.

---

## 18. Test Coverage Acceptance Criteria

- [ ] Unit tests cover identity encryption/decryption.
- [ ] Unit tests cover HMAC normalization and lookup.
- [ ] Unit tests cover forbidden ingestion-field detection.
- [ ] Unit tests cover consent event writing.
- [ ] API tests cover privacy settings updates.
- [ ] API tests cover public profile gating.
- [ ] API tests cover leaderboard gating.
- [ ] API tests cover badge gating.
- [ ] API tests cover repo visibility gating.
- [ ] API tests cover export generation.
- [ ] API tests cover deletion request/confirmation.
- [ ] API tests cover GitHub disconnect.
- [ ] API tests cover abuse report submission.
- [ ] Regression tests cover private user.
- [ ] Regression tests cover public-profile-only user.
- [ ] Regression tests cover leaderboard-opted user.
- [ ] Regression tests cover badge-enabled user.
- [ ] Regression tests cover hidden-repo user.
- [ ] Regression tests cover deleted user.
- [ ] Regression tests cover suspended user.
- [ ] Regression tests cover privacy withdrawal after previously public state.

---

## 19. Required Release-Gate Commands

The MVP must not ship unless all relevant commands pass.

```bash
pnpm --filter @promptstreak/web db:generate
pnpm --filter @promptstreak/web db:migrate
pnpm --filter @promptstreak/web lint
pnpm --filter @promptstreak/web build
pnpm --filter @promptstreak/web test
pnpm --filter @promptstreak/web test:integration
```

If the repo uses different command names, update these commands, but keep the same quality gates:

- Migration
- Lint
- Build
- Unit tests
- Integration tests
- Privacy regression tests

---

## 20. MVP Release Blockers

The MVP must not be released if any of the following are true:

- [ ] A private user appears in any public endpoint.
- [ ] A deleted user appears in any public endpoint.
- [ ] A suspended user appears in any public endpoint.
- [ ] A hidden repo appears in profile, leaderboard, or badge output.
- [ ] A user appears on a leaderboard without explicit opt-in.
- [ ] A badge exposes stats without explicit badge enablement.
- [ ] Raw prompt/code/completion/terminal/env/diff/patch content can be persisted.
- [ ] Email, GitHub ID, OAuth token, upload token, HMAC hash, or encryption metadata appears in public API output.
- [ ] Export includes secrets, tokens, hashes, or internal security signals.
- [ ] Delete account does not immediately remove public surfaces.
- [ ] Privacy setting withdrawal does not immediately remove public surfaces.
- [ ] Public caches can continue showing stale private/deleted data.
- [ ] Legal footer links are missing.
- [ ] Privacy Policy does not describe the actual data flow.
- [ ] Required tests are missing or failing.

---

## Copilot Optimization Instruction

Optimize the existing rollout plan until these acceptance criteria are satisfied.

Prefer smaller, reviewable pull requests. Do not merge large privacy-sensitive changes without tests. Prioritize ingestion hardening, privacy-by-default settings, public endpoint gating, export/deletion flows, and cache invalidation before UI polish or admin dashboards.

The MVP is acceptable only when public exposure is impossible without explicit opt-in, raw sensitive content cannot be persisted, and users can access/export/delete their data.
