# PromptStreak System Reality Report

## 1. Executive Summary
PromptStreak today is a working web product with real user flows for GitHub sign-in, device linking, usage upload, settings, public leaderboards, public profile/repo pages, and shareable SVG badges/cards. The codebase is simultaneously running legacy usage tables and agent-agnostic canonical tables during migration. The biggest gap is the verification layer: schema and admin read surfaces exist, but the upload runtime does not currently write UploadAudit or VerificationAnomaly rows. Several docs are materially out of sync with code, especially around page/API completion status, deletion semantics, and verification mutation endpoints.

Primary evidence: route.ts, route.ts, page.tsx, page.tsx, route.ts, route.ts, schema.prisma.

## 2. Product Reality in One Paragraph
PromptStreak is a Next.js + Prisma app where authenticated users link devices, upload usage snapshots, and optionally expose usage on public surfaces (leaderboards, profile pages, repo pages, badges/cards). The ingest path accepts both legacy and v2 payloads, with v1 data still feeding legacy tables while canonical v2 tables are actively written. Privacy controls and lifecycle policies exist, but enforcement is mixed between newer centralized policy helpers and older profilePublic checks in some page routes. Admin features for auth, audit logs, anomalies, metrics, and verification viewing are present, while verification refresh/disconnect mutation flows and end-to-end signed-upload verification are not fully wired in runtime.

Evidence: package.json, auth.ts, route.ts, agent-ingest.ts, userLifecycle.ts, page.tsx.

## 3. Implemented Features

| Category | Feature name | Status | What it does in practice | Evidence |
|---|---|---|---|---|
| Authentication | GitHub OAuth + session wiring | Implemented | Auth.js is active; GitHub provider uses read:user scope; API auth route exports GET/POST handler; session helper resolves user identity. | auth.ts, auth.ts, auth.ts, route.ts |
| Device linking / token flow | Split token issuance and device creation | Implemented | POST /api/connect validates code and origin, rate-limits issuance, generates tokenId.secret, stores bcrypt(secret), returns deviceToken. | route.ts, route.ts, route.ts, route.ts |
| Device linking / token flow | Device revocation endpoint | Implemented | DELETE /api/devices/[id] revokes device by setting revokedAt. | route.ts, route.ts |
| Upload / ingest pipeline | Authenticated upload with v1/v2 dispatch | Implemented | POST /api/upload enforces proxy trust, split token auth, lifecycle checks, rate limit, payload size cap, denylist scan, then dispatches by payload version. | route.ts, route.ts, route.ts, route.ts, route.ts, route.ts, route.ts |
| Upload / ingest pipeline | Dual-write on v1, canonical write on v2 | Implemented | v1 branch writes UsageDaily/UserStat/RepoStat and canonical rollups. v2 branch writes canonical only and returns contract v2. | route.ts, route.ts, route.ts, route.ts, route.ts |
| Validation / schema support | Shared Zod contracts + denylist | Implemented | Shared schemas define SnapshotPayload and AgentSnapshot. Upload route validates with safeParse and blocks forbidden content fields. | snapshot.ts, agent-snapshot.ts, contentDenylist.ts, route.ts |
| Leaderboards | User, repo, IDE leaderboard APIs and pages | Implemented | /api/leaderboard, /api/leaderboard/repos, /api/leaderboard/ides are active and backed by policy-filtered queries; corresponding pages exist. | route.ts, route.ts, route.ts, getUserLeaderboardAllTime.ts, repo-leaderboard-data.ts, ide-leaderboard-data.ts |
| Public profiles | Public profile API + pages | Implemented | /api/profile/[username] loads profile via lifecycle-aware loader; /u/[username] and /u/[username]/achievements pages exist. | route.ts, loadProfileByUsername.ts, page.tsx, page.tsx |
| Repo/project pages | Public repo API + repo page | Implemented | /api/repo/[username]/[...repo] exists with lifecycle + repo public checks. /r/[username]/[...repo] page exists. | route.ts, route.ts, page.tsx |
| Settings / privacy controls | Settings APIs and settings page wiring | Implemented | Settings page calls profile/privacy/repos/device/account APIs. Language endpoint sets locale cookie and validates locale. | page.tsx, page.tsx, page.tsx, page.tsx, page.tsx, route.ts, types.ts |
| Settings / privacy controls | Privacy consent logging + bridge mirror | Implemented | updatePrivacySettings writes PrivacySettings changes and ConsentEvent rows; profilePublic is mirrored to legacy User.profilePublic. | privacySettings.ts, privacySettings.ts, privacySettings.ts |
| Badges / cards | User/repo badge and card SVG endpoints | Implemented | /badge/[username].svg, /card/[username].svg, and /api/badges user/repo endpoints are active. | route.ts, route.ts, route.ts, route.ts |
| Data model / rollups | Legacy and canonical schema + rollups | Implemented | Prisma includes legacy stats and canonical agent-agnostic models; writeCanonical upserts AgentRun/ModelUsageDaily/ActionUsageDaily and Product/Provider/Model stats. | schema.prisma, schema.prisma, schema.prisma, schema.prisma, schema.prisma, agent-ingest.ts, agent-ingest.ts |
| Agent-agnostic foundation | v1→v2 translation and canonical ingest | Implemented | detectPayloadVersion and translateV1ToV2 are in production ingest flow; canonical aggregation is active. | upload-translate.ts, upload-translate.ts, route.ts, route.ts |
| Rate limiting / abuse controls | Upload/connect/contact limits and input checks | Implemented | Upload limits are DB-count based; connect issuance is limited; contact endpoint has in-process per-IP throttling and validates abuse/contact fields. | ratelimit.ts, route.ts, route.ts, route.ts, route.ts |
| Deletion / device revocation / account controls | Soft delete + admin mutations + audit wrappers | Implemented | User self-delete and admin delete are soft deletes with device revocation; admin suspend/restore/delete actions are wrapped with audited action logging. | route.ts, selfDelete.ts, selfDelete.ts, userManagement.ts, userManagement.ts, userManagement.ts |

## 4. Partially Implemented Features

| Feature name | Status | What exists already | What is missing | Evidence |
|---|---|---|---|---|
| Public-surface lifecycle policy adoption | Partial | Central policy module exists and is used in profile/repo APIs and leaderboard/badge data paths. | Some page routes still gate only on legacy profilePublic/canViewProfile, not centralized lifecycle feature gating. | userLifecycle.ts, route.ts, page.tsx, page.tsx, route.ts |
| Verification admin operations | Partial | Admin verification list/detail GET APIs and UI pages exist. | Refresh/disconnect endpoints are explicitly deferred and route files are absent. | route.ts, route.ts, verification.ts, page.tsx |
| Verification telemetry pipeline | Partial | UploadAudit/VerificationAnomaly schemas and admin readers/metrics exist. | Runtime upload handler does not create UploadAudit or VerificationAnomaly rows; create calls are currently in tests. | schema.prisma, schema.prisma, metrics.ts, route.ts, uploadAudits.itest.ts, anomalies.itest.ts |
| Privacy migration bridge | Partial | Independent PrivacySettings + consent logs are implemented and used by /api/settings/privacy. | Legacy /api/settings/profile still writes User.profilePublic; RepoVisibilitySettings is present in schema but not runtime-wired beyond tests. | route.ts, privacySettings.ts, privacySettings.ts, route.ts, schema.prisma, route.ts, schema.itest.ts |
| Abuse-report handling | Partial | /api/contact accepts abuse-form shape and sends abuse-report email template. | No persistence to AbuseReport from this runtime path; AbuseReport create appears in tests only. | route.ts, route.ts, schema.prisma, schema.itest.ts |
| Mail delivery backend | Partial | SMTP mail service implementation exists with MailLog writes and retries. | Process-wide singleton is still InMemoryMailService; SmtpMailService instantiation appears in tests only. | smtpMailService.ts, mailService.ts, smtpMailService.itest.ts |
| Account deletion program | Partial | Immediate soft delete endpoint and core function exist and are active. | Two-step AccountDeletionJob-confirm/executor product flow is not surfaced by corresponding runtime endpoint flow in this audit path. | route.ts, selfDelete.ts, schema.prisma |

## 5. Missing or Doc-Only Features

| Feature name | Status | Why this appears missing | Evidence or absence of evidence |
|---|---|---|---|
| User verification refresh/disconnect API (/api/verification/github/refresh, DELETE /api/verification/github) | Missing / doc-only | Verification docs specify these routes; app route inventory has no app/api/verification routes. | promptstreak-verification-concrete-spec.md, promptstreak-verification-concrete-spec.md, file search result: no files under app/api/verification/** |
| Admin verification refresh/disconnect mutations | Missing / doc-only | Admin plan expects POST refresh/disconnect routes; only GET wrappers exist under admin/verification. | promptstreak-admin-implementation-plan.md, promptstreak-admin-implementation-plan.md, route.ts, route.ts, file search result: no refresh/disconnect files |
| Signed-upload verification write path (verifySignedUpload + guaranteed UploadAudit/VerificationAnomaly writes) | Missing / doc-only | Implementation plan says uploads should always create UploadAudit and anomaly rows for invalid states; current upload runtime writes UploadLog and no verification create path is present in runtime files. | promptstreak-verification-implementation-plan.md, promptstreak-verification-concrete-spec.md, route.ts, uploadAudits.itest.ts, anomalies.itest.ts |
| Verification schema objects described in docs (GitHubBillingCredential, UploadNonce, VerifiedMetricSnapshot, TrustState) | Missing / doc-only | Verification spec defines these models/enums, but this Prisma schema does not contain these model declarations. | promptstreak-verification-concrete-spec.md, promptstreak-verification-concrete-spec.md, promptstreak-verification-concrete-spec.md, promptstreak-verification-concrete-spec.md, current Prisma schema |

## 6. User-Visible Surfaces That Exist Today

Inventory note: static route scan found 42 route handlers under app/**/route.ts, including 40 API route files under app/api/**/route.ts, plus 26 page components under app/**/page.tsx.

### public pages
| Surface | What a user can currently do | Evidence |
|---|---|---|
| / | View main landing page | home page |
| /leaderboard, /leaderboard/repos, /leaderboard/ides | Browse user/repo/IDE rankings | leaderboard page, repo leaderboard page, IDE leaderboard page |
| /u/[username], /u/[username]/achievements | View public profile and achievement surfaces (subject to visibility checks) | page.tsx, page.tsx |
| /r/[username]/[...repo] | View public repo usage page | page.tsx |
| /badge/[username].svg and /card/[username].svg | Render shareable SVG badge/card URLs | route.ts, route.ts |
| legal pages | Terms/privacy/contact/impressum/report-abuse pages exist | terms, privacy, contact, report abuse |

### authenticated pages
| Surface | What a user can currently do | Evidence |
|---|---|---|
| /connect | Exchange one-time code for device token | page.tsx, route.ts |
| /settings | Manage profile/privacy/repo visibility, revoke devices, delete account | page.tsx, page.tsx, page.tsx |
| /admin/* | Admin-only operations (metrics, anomalies, users, action log, verification) | page.tsx, page.tsx, requireAdminPage.ts |

### API endpoints
| Endpoint group | What real users/operators can currently do | Evidence |
|---|---|---|
| /api/auth/[...nextauth] | Sign in/sign out via Auth.js | route.ts |
| /api/connect | Link a device and receive deviceToken | route.ts |
| /api/upload | Upload usage snapshots with auth/rate-limits/validation | route.ts |
| /api/profile/[username], /api/repo/[username]/[...repo] | Fetch public profile and public repo stats | route.ts, route.ts |
| /api/leaderboard, /api/leaderboard/repos, /api/leaderboard/ides | Fetch leaderboard datasets | route.ts, route.ts, route.ts |
| /api/settings/profile, /api/settings/privacy, /api/settings/repos, /api/settings/language | Update visibility/preferences and locale | route.ts, route.ts, route.ts, route.ts |
| /api/devices/[id], /api/account | Revoke device, self-delete account | route.ts, route.ts |
| /api/contact | Submit contact or abuse-form payload to outbound mail channel | route.ts |
| /api/admin/* | Admin auth, users, anomalies, verification read, upload-audit read, metrics, action log | route.ts, route.ts, route.ts |

### SVG badge endpoints
| Endpoint | Current behavior | Evidence |
|---|---|---|
| /badge/[username].svg | User badge-style SVG from public summary | route.ts |
| /api/badges/[user]/[type].svg | User badge variants (type-based) | route.ts |
| /api/badges/[user]/ranks/[key].svg | Rank card SVGs | rank badge API |
| /api/badges/[user]/achievements/[key].svg | Achievement SVGs | achievement badge API |
| /api/badges/repo/[owner]/[repo]/[type].svg | Repo badge variants | route.ts |
| /card/[username].svg | Summary card SVG | route.ts |

## 7. Current Core User Journey

1. Sign in through GitHub OAuth.
Evidence: auth.ts, route.ts.

2. Open /connect with a code and link a device.
Evidence: page.tsx, route.ts.

3. Client uploads snapshots to /api/upload using Bearer tokenId.secret.
Evidence: route.ts, route.ts, route.ts.

4. User configures visibility/privacy in /settings.
Evidence: page.tsx, page.tsx, privacySettings.ts.

5. Public surfaces become visible according to visibility checks.
Evidence: loadProfileByUsername.ts, route.ts, getUserLeaderboardAllTime.ts, data.ts.

6. User shares profile/repo/badge/card links.
Evidence: page.tsx, page.tsx, route.ts, route.ts.

## 8. Data and Trust Reality

- Data model breadth is high: legacy usage tables, canonical agent-agnostic tables, admin/auth/audit tables, privacy/compliance tables, and verification tables coexist.
Evidence: schema.prisma, schema.prisma, schema.prisma, schema.prisma, schema.prisma.

- Legacy and canonical tracks are both active today.
Evidence: route.ts, route.ts, agent-ingest.ts.

- Trust/security controls present in runtime include split-token auth, proxy trust header checks, denylist field rejection, lifecycle status checks, and multiple admin auth layers.
Evidence: route.ts, route.ts, route.ts, route.ts, middleware.ts, requireAdmin.ts, requireAdminPage.ts.

- Visibility enforcement is not fully consistent across all surfaces.
Evidence: policy-based paths ([policy helper](apps/web/src/lib/policy/userLifecycle.ts#L73), loadProfileByUsername.ts, route.ts); legacy-gated page paths (page.tsx, page.tsx, route.ts, profile-policy.ts).

- Account deletion in current runtime is soft delete, not hard delete.
Evidence: route.ts, selfDelete.ts, userManagement.ts, schema.prisma.

- Important caveats:
Verification write path appears incomplete in runtime; contact abuse reports are mailed but not persisted; SMTP backend is implemented but not wired as singleton; RepoVisibilitySettings table is not used by runtime settings path.
Evidence: route.ts, uploadAudits.itest.ts, route.ts, mailService.ts, schema.prisma, route.ts.

## 9. Technical Evidence Map

| Capability | Primary files | Key routes/functions | Confidence |
|---|---|---|---|
| GitHub auth/session | auth.ts, route.ts | authOptions, getSessionUser | High |
| Device linking | route.ts, ratelimit.ts | POST /api/connect | High |
| Upload ingest | route.ts, upload-translate.ts, agent-ingest.ts | POST /api/upload, detectPayloadVersion, writeCanonical | High |
| Public profile API | route.ts, loadProfileByUsername.ts | GET /api/profile/[username], loadProfileByUsername | High |
| Repo API/page | route.ts, page.tsx | GET /api/repo/[username]/[...repo], /r/[username]/[...repo] | High |
| Leaderboards | route.ts, getUserLeaderboardAllTime.ts, repo-leaderboard-data.ts | GET /api/leaderboard*, userVisibleForFeatureWhere/Sql | High |
| Badges/cards | route.ts, route.ts, data.ts | /badge/[username].svg, /card/[username].svg, /api/badges/... | High |
| Privacy + consent | route.ts, privacySettings.ts | GET/PATCH /api/settings/privacy, updatePrivacySettings | High |
| Verification read/admin surfaces | verification.ts, route.ts, page.tsx | GET /api/admin/verification, GET /api/admin/verification/[userId] | High |
| Verification write path parity with docs | route.ts, promptstreak-verification-concrete-spec.md, promptstreak-verification-implementation-plan.md | UploadAudit/VerificationAnomaly creation expectations | Medium |
| Contact abuse persistence | route.ts, schema.prisma, schema.itest.ts | POST /api/contact | High |
| Admin audit immutability | audit.ts, admin-action-log-immutable.sql, applyAuditLogImmutability.ts | withAuditedAction, DB trigger | High |

## 10. Mismatches Between Docs and Code

| Mismatch | Docs claim | Code reality | Evidence |
|---|---|---|---|
| Public profile page status | Marked in-progress/pending | Page exists and is implemented | web-app.md, web-app.md, page.tsx |
| Repo page and repo API status | Marked pending | Repo page and repo API are implemented | web-app.md, web-app.md, page.tsx, route.ts |
| Badge/card endpoint status | /badge and /card marked next/pending | Both routes exist and return SVG now | web-app.md, web-app.md, route.ts, route.ts |
| Account deletion semantics | Hard delete stated | Runtime performs soft delete/anonymization + revoke | web-app.md, route.ts, selfDelete.ts |
| Admin verification mutation endpoints | Plan includes refresh/disconnect endpoints | Only GET list/detail routes exist; refresh/disconnect deferred | promptstreak-admin-implementation-plan.md, route.ts, route.ts, verification.ts |
| UploadAudit/VerificationAnomaly per-upload expectation | Docs describe per-upload verification logging | Upload runtime writes UploadLog; UploadAudit/VerificationAnomaly creates are test-only here | promptstreak-verification-concrete-spec.md, promptstreak-verification-implementation-plan.md, route.ts, uploadAudits.itest.ts, anomalies.itest.ts |
| Verification schema scope in docs | Docs include GitHubBillingCredential/UploadNonce/VerifiedMetricSnapshot/TrustState | Current Prisma schema includes UserVerification/UploadAudit/VerificationAnomaly but not those extra models | promptstreak-verification-concrete-spec.md, promptstreak-verification-concrete-spec.md, schema.prisma |
| Admin user detail placeholder comment | Comment says VerificationAnomaly model does not yet exist | VerificationAnomaly model exists in Prisma schema | userManagement.ts, schema.prisma |
| Admin recovery-code payload | Verify page sends recoveryCode field | Handler expects code field | page.tsx, routeHandlers.ts |

## 11. Strongest Honest Marketing Positioning Based on Current Reality

- Tagline option 1: Public coding-agent usage profiles with user-controlled visibility.
- Tagline option 2: Link your device, sync usage, share stats and badges.
- Tagline option 3: Copilot-first transparency now, agent-agnostic foundation in motion.

- Short product description 1:
PromptStreak lets developers sign in, connect devices, upload coding-assistant usage, and publish selected stats to profile, leaderboard, repo, and badge surfaces.

- Short product description 2:
A working GitHub-authenticated usage layer with privacy settings, shareable SVG assets, and operational admin tooling for moderation and audit visibility.

- Short product description 3:
PromptStreak is already usable for public usage discovery and sharing, while deeper verification automation is still being completed.

- Honest positioning paragraph:
PromptStreak is currently strongest as a practical public-usage layer for coding assistants: users can authenticate, link devices, sync usage snapshots, control visibility, and share profile/repo/badge/card outputs. The platform already has meaningful privacy and admin controls, but full verification mutation flows and complete upload-side verification logging are not yet at parity with the most ambitious docs. Marketing should lead with what is live today and frame advanced verification as in-progress.

## 12. Recommended Content Boundaries

Claims marketing CAN safely make today:
- PromptStreak supports GitHub sign-in, device linking, and authenticated usage uploads.
- Public user and repo surfaces are live: profile pages, repo pages, leaderboards, and SVG badges/cards.
- Users can control visibility through settings endpoints and UI.
- Admin tooling exists for auth, audits, metrics, anomaly triage, and verification read views.

Claims marketing should avoid for now:
- Fully verified upload-signature pipeline across all uploads.
- Guaranteed persistence of abuse reports in AbuseReport via contact flow.
- Production SMTP delivery as the guaranteed default runtime mail backend.
- Complete verification refresh/disconnect self-service or admin mutation workflows.

Features that should be phrased as coming soon:
- Verification refresh/disconnect endpoints and end-to-end mutation workflow.
- Full runtime creation of UploadAudit and VerificationAnomaly per verification policy docs.
- Full cutover from legacy visibility fields to RepoVisibilitySettings-driven runtime behavior.
- Expanded verification model set described in verification spec (if still intended).

## 13. Open Questions / Unclear Areas

- Deployment wiring for mail backend is unclear from repository inspection alone.
Code shows in-memory singleton, but runtime environment override outside this repo cannot be confirmed. Evidence: mailService.ts, smtpMailService.ts.

- Per-environment status of admin audit immutability trigger is unclear.
SQL + applier script + runbook instructions exist, but whether each deployed DB has trigger applied cannot be confirmed statically. Evidence: admin-action-log-immutable.sql, applyAuditLogImmutability.ts, admin-ops-runbook.md.

- End-user route-level enforcement consistency after all edge cases is unclear without runtime traffic tests.
Static code shows mixed policy usage across API vs some pages. Evidence: userLifecycle.ts, page.tsx, route.ts.

- SUPER_ADMIN role presence in TypeScript union versus Prisma enum is inconsistent and intent is unclear.
Evidence: schema.prisma, userManagement.ts.

- This audit is code-only and read-only.
No runtime integration execution, seed-data walkthrough, or environment-specific behavior verification was performed in this pass.

## 14. Reality Snapshot

### What PromptStreak is today
A live GitHub-authenticated web platform for linking devices, ingesting coding-assistant usage, and publishing optional public usage surfaces (profiles, repo pages, leaderboards, badges/cards), with substantial admin and policy infrastructure.

### What is already marketable today
Device linking, upload/sync, public profile/repo/leaderboard presence, shareable SVG badges/cards, and user visibility controls are all real and demonstrable in code.

### What is not ready to market yet
Full verification mutation flows and documented signed-upload verification outcomes are not fully runtime-wired; abuse-report persistence and SMTP-default delivery are also not clearly complete.

### What content/positioning should lead the website right now
Lead with practical public usage sharing and privacy-controlled visibility for coding-agent activity today, while transparently framing advanced verification automation as in-progress.
