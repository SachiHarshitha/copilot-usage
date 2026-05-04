# PromptStreak Feature Summary

## Scope
This document summarizes the currently implemented PromptStreak feature set based on the latest verified code and launch-readiness audit (May 2026).

Related references:
- [reality.md](docs/reality.md)
- [launch-readiness-gap-analysis.md](docs/launch-readiness-gap-analysis.md)

## Product Snapshot
PromptStreak is a GitHub-authenticated web product for linking devices, uploading coding-assistant usage snapshots, and publishing optional public usage surfaces (profile, repo, leaderboards, badges, cards) with user-controlled visibility.

## Core End-User Features

### Authentication and Identity
- GitHub OAuth sign-in/session flow is active.
- Authenticated session helpers power protected routes and user-scoped APIs.

### Device Linking and Token Lifecycle
- Users can exchange one-time connect codes for device tokens.
- Split-token authentication is enforced for ingest (`tokenId.secret` with hashed secret storage).
- Users can revoke linked devices.

### Usage Upload and Ingest
- Upload API accepts canonical v2 (`AgentSnapshot`) payloads.
- Runtime protections include authentication, rate limiting, payload caps, proxy trust checks, and denylist validation.
- Runtime writes canonical agent-agnostic usage records.

### Privacy and Visibility Controls
- Settings surfaces for profile/privacy/repo visibility are active.
- Visibility decisions are centralized through lifecycle-aware policy logic.
- Route-level visibility consistency work has been completed for key public profile/repo/card surfaces.

### Public Surfaces
- Public profile pages and achievements pages.
- Public repo pages.
- User/repo/IDE leaderboards.
- Shareable SVG surfaces:
  - User badge
  - User card
  - User badge variants
  - Repo badge variants

## Verification, Trust, and Moderation Features

### Verification Telemetry and Audit Signals
- Upload runtime writes `UploadAudit` for accepted, rejected, and transaction-failure paths.
- Verification telemetry is now runtime-wired for launch baseline trust claims.

### Verification Lifecycle APIs
- Disconnect functionality exists in code for admin and user-self flows.
- Refresh remains deferred pending GitHub-billing integration work and is excluded from launch claims.

### Abuse Reporting
- Contact abuse submissions are persisted to `AbuseReport` and then sent through mail.
- Persistence failure paths return server error responses rather than silently dropping data.

## Mail and Notification Backend
- Mail service is environment-driven:
  - SMTP backend is used when `MAIL_BACKEND=smtp`.
  - In-memory backend remains available for non-SMTP/test scenarios.
- SMTP path is lazily initialized and integrated behind a shared mail service interface.

## Admin and Operations Features

### Admin Surfaces
- Admin auth and protected admin pages.
- User lifecycle management actions (suspend, restore, delete) with audit wrappers.
- Verification read views.
- Upload-audit and anomaly read surfaces.
- Metrics and action log views.

### Audit Integrity
- Trigger-based immutability support exists for admin action logs.
- Deployment workflow includes:
  - `db:apply-triggers`
  - `db:deploy` (Prisma push plus trigger application)

## Data Platform Status
- Canonical agent-agnostic schema is the active runtime ingest path.
- Legacy tables remain in schema as cleanup debt, but are no longer the primary upload write path.
- Canonical rollups and model/provider/product aggregation are active.
- Privacy settings and consent event logging are active with `PrivacySettings` as the source of truth.

## Quality and Validation Snapshot
- Latest verification run: `pnpm --filter @promptstreak/web test`.
- Result: 247 passing, 0 failing.
- Recent launch-readiness hardening work closed the major code-level P0/P1 gaps identified in the previous audit.

## Deferred or Deliberately Scoped Items
- Verification refresh endpoint remains deferred pending GitHub-billing fetch worker integration.
- Full signed-upload anomaly auto-detection remains deferred until signed-upload protocol rollout.
- Canonical API contract publication remains a documentation/freeze task (not a current code blocker).

## Launch-Ready Positioning
PromptStreak can be positioned as a live, privacy-aware, GitHub-authenticated usage platform with working device linking, upload ingestion, public sharing surfaces, and admin moderation/audit capabilities. Advanced verification automation is partially implemented with clear, documented boundaries for deferred pieces.
