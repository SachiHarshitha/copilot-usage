# Promptstreak Privacy, Compliance & Public Sharing Feature Doc

**Product:** promptstreak.dev  
**Topic:** GitHub authentication, encrypted identity storage, usage-stat ingestion, public leaderboards, badges, privacy controls, and legal/compliance features  
**Status:** Draft for Copilot implementation review  
**Last reviewed:** 2026-05-01  
**Note:** This is an implementation feature document, not legal advice. It is designed to make Promptstreak privacy-friendly by default and easier to review with a lawyer later.

---

## 1. Context

Promptstreak is a public developer-facing web service that receives normalized token/request usage statistics from local tools such as a VS Code extension or CLI. Users authenticate with GitHub, then may optionally publish their usage profile, participate in leaderboards, and share public badges.

The intended data posture is intentionally minimal:

- GitHub authentication is used for account identity.
- The database stores only minimal identity data, primarily GitHub user ID and email address.
- GitHub user ID and email address are encrypted at rest.
- Tools send normalized usage metrics to the web service.
- Promptstreak does **not** store raw prompts, raw AI responses, source code, chat transcripts, or full IDE logs.
- Public features such as leaderboards, public profiles, and badges are opt-in.

Even with this minimized architecture, GitHub ID, email address, and usage metrics linked to a user are personal data. Usage metrics can reveal behavioral patterns, productivity patterns, repo activity, project intensity, and possibly employer/client context. Therefore the system must include privacy controls, export/deletion flows, transparent legal pages, and public-sharing consent.

---

## 2. Product Goals

### 2.1 Goals

1. Provide GitHub-based account login with minimal permissions.
2. Store user identity data securely, preferably encrypted at the application layer before persistence.
3. Accept normalized usage snapshots from trusted Promptstreak clients.
4. Keep private usage data private by default.
5. Allow users to explicitly opt into public profiles, public badges, and leaderboards.
6. Provide self-service privacy controls:
   - Download/export my data
   - Delete my account
   - Disconnect GitHub
   - Make profile public/private
   - Join/leave leaderboard
   - Enable/disable badges
   - Hide individual repositories/workspaces from public output
7. Provide footer/legal pages:
   - Impressum
   - Privacy Policy / Datenschutzerklärung
   - Terms / Nutzungsbedingungen
   - Cookie preferences, if non-essential cookies or local storage are used
   - Contact / privacy support
   - Report abuse
8. Maintain an audit trail for consent/privacy events without storing excessive personal data.
9. Support GDPR-level privacy controls for all users globally.
10. Avoid collecting secrets, source code, raw prompts, raw completions, or unnecessary GitHub permissions.

### 2.2 Non-goals

1. Do not verify actual GitHub Copilot billing data at launch.
2. Do not request broad GitHub repository permissions for the normal auth flow.
3. Do not store raw IDE logs server-side.
4. Do not store raw prompts, completions, source code, terminal output, files, or repository contents.
5. Do not expose private usage stats publicly unless the user opted in.
6. Do not build region-specific privacy systems per country at launch; use one GDPR-level global baseline.
7. Do not provide legal advice in-product.

---

## 3. Legal and Regulatory Reference Baseline

This section is for engineering awareness. It should guide implementation and be reviewed by counsel before public launch.

### 3.1 Germany

Promptstreak should include an **Impressum** if operated as a business-like digital service. Use modern wording:

```text
Angaben gemäß § 5 DDG
```

Do not use the outdated `§ 5 TMG` wording.

If Promptstreak later publishes editorial or journalistic content such as blog/news/opinion pages, consider adding a responsible person under German media law requirements.

### 3.2 EU / GDPR

Because Promptstreak is likely operated from Germany/EU or targets EU users, use GDPR as the global baseline.

Promptstreak should support:

- Transparent privacy notice
- Lawful-basis documentation
- Access/export request
- Correction request
- Deletion/erasure request
- Restriction/objection path
- Data portability in machine-readable format
- Processor/vendor inventory
- Security measures such as encryption and pseudonymisation
- Breach-response process
- Consent for non-essential cookies, tracking, analytics, and public sharing

### 3.3 Germany cookie/local-storage rule

Under German TDDDG-style rules, storing or accessing information on the user's device generally needs consent unless it is strictly necessary for the requested service. For Promptstreak:

No consent required in most cases, but disclose:

- Session cookie
- CSRF cookie
- Login security cookie
- User-selected privacy settings

Consent required or strongly recommended:

- Analytics cookies
- Marketing cookies
- Tracking pixels
- Fingerprinting
- Cross-site tracking
- Non-essential local storage

Recommended launch stance: avoid marketing pixels and invasive analytics.

### 3.4 GitHub OAuth

Use minimal GitHub OAuth scopes.

Recommended:

- Prefer no broad GitHub scopes for basic auth.
- Request email only if needed.
- Do not request `repo`, `public_repo`, organization, webhook, or code-related scopes for the standard login flow.
- Do not store GitHub OAuth tokens long-term unless required.
- If OAuth tokens are stored, encrypt them separately and provide disconnect/revoke flows.

### 3.5 EU Digital Services Act / public content

Promptstreak creates public profile pages, public badge endpoints, public leaderboard entries, and possibly public usernames/slugs. Therefore include a low-friction **Report abuse** flow for public content.

Report categories should include:

- Impersonation
- Spam/fake profile
- Offensive profile text or username
- Trademark/copyright issue
- False or manipulated public stats
- Security concern
- Other illegal content concern

---

## 4. Data Collection Policy

### 4.1 Data Promptstreak may collect

| Category | Example fields | Stored? | Public by default? | Notes |
|---|---|---:|---:|---|
| GitHub identity | GitHub user ID | Yes, encrypted | No | Required account identifier |
| Email | Primary or verified email from GitHub | Yes, encrypted | No | Only if needed for account/security/privacy contact |
| Display identity | GitHub username, avatar URL, chosen display name, public slug | Optional | Only if user enables public profile | Treat as personal data |
| Usage metrics | tokens, requests, model names, tool name, time bucket, repo/workspace hash or name | Yes | No | Public only after opt-in |
| Repo/workspace labels | repo name, repo URL, workspace name, or local alias | Optional | No | Avoid storing private repo names unless user opts in or client sends explicit name |
| Public settings | profile visibility, leaderboard opt-in, badge enabled | Yes | Some | Needed for product behavior |
| Security logs | IP, user agent, request timestamp, auth result | Yes, limited retention | No | Legitimate security purpose |
| Consent events | consent type, timestamp, version, IP hash/user agent optional | Yes | No | Avoid excessive detail |

### 4.2 Data Promptstreak must not collect

Promptstreak must not collect or store:

- Raw prompts
- Raw AI responses
- Source code
- Repository files
- Terminal output
- Secret values
- Full IDE logs
- Full chat transcripts
- `.env` contents
- GitHub access tokens unless absolutely necessary
- Private repository contents

The UI and privacy policy should explicitly state this.

---

## 5. Privacy-First Defaults

Default state after GitHub login:

```text
profile_public = false
leaderboard_opt_in = false
badges_enabled = false
repo_public_by_default = false
marketing_email_opt_in = false
analytics_opt_in = false
```

Users must explicitly enable:

- Public profile
- Leaderboard participation
- Public badges
- Public repo-level stats
- Marketing emails
- Optional analytics/tracking

Rationale: token usage is not raw content, but it is behavioral metadata and should not become public automatically.

---

## 6. User Journeys

### 6.1 Sign in with GitHub

1. User clicks **Sign in with GitHub**.
2. App requests minimal GitHub permissions.
3. App receives GitHub identity.
4. App stores encrypted GitHub user ID and encrypted email if needed.
5. App creates default private profile and privacy settings.
6. App shows onboarding explaining:
   - What Promptstreak collects
   - What Promptstreak does not collect
   - Public sharing is opt-in
   - How to download/delete data

Acceptance criteria:

- User can create account with GitHub.
- App does not request broad repo/code permissions.
- Profile is private by default.
- Leaderboard and badges are disabled by default.
- User can reach Privacy & Data settings from onboarding and account menu.

### 6.2 Tool sends usage snapshot

1. User installs VS Code extension or CLI.
2. User links the local tool to Promptstreak using a scoped upload token or device-code style flow.
3. Tool sends normalized usage snapshot to Promptstreak.
4. Server validates authentication, schema, size, timestamp, idempotency key, and rate limits.
5. Server stores usage stats privately.
6. Public aggregates are updated only if the user opted in.

Acceptance criteria:

- Payloads with raw prompt/code fields are rejected or stripped.
- Snapshot ingestion is idempotent.
- Invalid or old upload tokens are rejected.
- Rate limits protect ingestion endpoint.
- Private users do not appear in public endpoints.

### 6.3 Enable public profile

1. User opens Settings → Privacy & Data.
2. User enables **Public profile**.
3. UI explains what becomes visible.
4. User confirms.
5. System records a consent/audit event.
6. Public profile endpoint becomes active.

Acceptance criteria:

- Consent text is clear and versioned.
- User can disable public profile later.
- Disabling public profile removes public access immediately or returns private state.
- Badge and leaderboard behavior respects private state.

### 6.4 Join leaderboard

1. User enables **Join leaderboard**.
2. UI explains ranking dimensions and public fields.
3. User confirms.
4. User becomes eligible for ranking in next leaderboard calculation.

Acceptance criteria:

- Leaderboard opt-in is separate from account creation.
- User can leave leaderboard.
- Leaving leaderboard removes user from public rankings.
- Deleted/private users are excluded from recalculation.

### 6.5 Enable badges

1. User enables badges.
2. App generates badge URLs.
3. UI explains that badges are public image/SVG endpoints.
4. User can copy Markdown snippets.
5. User can disable badges later.

Acceptance criteria:

- Badge endpoint checks `badges_enabled` and profile/public settings.
- Disabled badges return a neutral disabled/private SVG or 404 depending on product decision.
- Badge cache invalidates on privacy changes, deletion, and visibility changes.

### 6.6 Download my data

1. User opens Settings → Privacy & Data.
2. User clicks **Download my data**.
3. System generates JSON export.
4. Export excludes secrets and access tokens.
5. Export includes account, privacy settings, usage snapshots, public settings, consent events, and deletion/retention notes.

Acceptance criteria:

- Export is machine-readable JSON.
- Export does not include OAuth tokens or upload tokens.
- Export is available immediately for small accounts or asynchronously as a downloadable file for larger accounts.
- Export files expire after a short retention window if stored temporarily.

### 6.7 Delete my account

1. User opens Settings → Privacy & Data.
2. User clicks **Delete account**.
3. UI explains what is deleted, anonymized, or temporarily retained.
4. User confirms with explicit confirmation step.
5. System removes public profile, badges, and leaderboard entry immediately.
6. System deletes or anonymizes identity and usage data according to retention policy.
7. System deletes GitHub OAuth tokens/upload tokens if any exist.
8. System records minimal deletion audit event that does not recreate profile identity.

Acceptance criteria:

- Public profile is immediately inaccessible or marked deleted/private.
- Leaderboard entry disappears.
- Badge endpoints stop exposing stats.
- Identity fields are deleted or irreversibly anonymized.
- Security logs may be retained for limited time, documented in privacy policy.
- User cannot log back in to the same deleted account unless a new account is created.

---

## 7. Functional Requirements

### 7.1 Authentication requirements

- Use GitHub OAuth or GitHub App user authentication.
- Use least privilege.
- Avoid repository scopes for normal login.
- Email scope should be requested only if email is required.
- Store only the minimum identity needed.
- Encrypt identity values before database persistence.
- Maintain deterministic lookup hash for login matching.

Recommended identity storage pattern:

```text
github_user_id_enc       encrypted GitHub user ID
github_user_id_hash      HMAC-SHA256 lookup hash using server-side pepper
email_enc                encrypted email
email_hash               HMAC-SHA256 lookup hash, nullable
```

Why: fully encrypted fields are hard to query. A keyed HMAC lookup hash enables account lookup without storing plaintext identifiers.

### 7.2 Usage ingestion requirements

Endpoint must accept only normalized stats.

Reject or strip fields that look like raw content:

- prompt
- completion
- code
- fileContent
- terminalOutput
- chatTranscript
- secret
- env
- diff
- patch

Snapshot should include:

```json
{
  "snapshot_id": "uuid-or-stable-idempotency-key",
  "source": "vscode-extension",
  "source_version": "1.0.0",
  "agent": "github-copilot",
  "period_start": "2026-05-01T00:00:00Z",
  "period_end": "2026-05-01T23:59:59Z",
  "timezone": "Europe/Berlin",
  "totals": {
    "input_tokens": 1000,
    "output_tokens": 2000,
    "total_tokens": 3000,
    "requests": 25
  },
  "models": [
    {
      "model": "example-model",
      "input_tokens": 1000,
      "output_tokens": 2000,
      "total_tokens": 3000,
      "requests": 25
    }
  ],
  "repos": [
    {
      "repo_key": "stable-client-generated-id-or-hash",
      "repo_label": "optional user-approved repo label",
      "visibility_hint": "public|private|unknown",
      "total_tokens": 3000,
      "requests": 25
    }
  ]
}
```

Rules:

- `snapshot_id` must be unique per user/source/period.
- Duplicate snapshots must be ignored or safely upserted.
- Server must validate numeric ranges.
- Server must reject negative token counts.
- Server must cap payload size.
- Server must rate limit by user and upload token.
- Server must store ingestion metadata for debugging without storing raw content.

### 7.3 Public profile requirements

Public profile may show only user-approved fields.

Potential public fields:

- Display name or GitHub username
- Public slug
- Avatar URL, if user agrees
- Total tokens
- Rank tier
- Streak information
- Public repo stats selected by user
- Badges selected by user

Private fields never shown:

- Email
- GitHub numeric user ID
- Upload tokens
- OAuth tokens
- Security log IP addresses
- Hidden repos/workspaces
- Private profile stats

### 7.4 Leaderboard requirements

Leaderboards must include only users with `leaderboard_opt_in = true`.

Ranking jobs must filter out:

- Deleted users
- Private users if product policy requires public profile for leaderboard
- Suspended users
- Users with suspicious stats under fraud rules
- Users who opted out

Leaderboard entry should contain:

- Public display name/slug
- Rank
- Tier
- Aggregated token/request stats
- Optional public profile URL

### 7.5 Badge requirements

Badge endpoint must check all visibility flags before rendering.

Required checks:

```text
account exists
account not deleted
account not suspended
badges_enabled = true
requested badge type is allowed
underlying stat is public or aggregate-safe
repo/workspace visibility allows display, if repo-specific badge
```

Cache-control recommendation:

- Public badges can be cached briefly.
- Privacy changes must trigger cache invalidation.
- Deleted/private accounts must not continue exposing stats through cached app responses.
- Document that external caches such as GitHub README image caching or search engines may take time to refresh.

---

## 8. Database Model Proposal

Adapt names to the existing stack.

### 8.1 `users`

```sql
id uuid primary key
created_at timestamptz not null
updated_at timestamptz not null
deleted_at timestamptz null
status text not null default 'active' -- active, suspended, deleted
```

### 8.2 `user_identities`

```sql
id uuid primary key
user_id uuid not null references users(id)
provider text not null -- github
github_user_id_enc text not null
github_user_id_hash text not null unique
email_enc text null
email_hash text null
email_verified boolean null
display_login_enc text null -- optional, if not public
avatar_url_enc text null -- optional
created_at timestamptz not null
updated_at timestamptz not null
```

### 8.3 `privacy_settings`

```sql
user_id uuid primary key references users(id)
profile_public boolean not null default false
leaderboard_opt_in boolean not null default false
badges_enabled boolean not null default false
repo_public_by_default boolean not null default false
analytics_opt_in boolean not null default false
marketing_email_opt_in boolean not null default false
created_at timestamptz not null
updated_at timestamptz not null
```

### 8.4 `public_profiles`

```sql
user_id uuid primary key references users(id)
slug text unique null
display_name text null
avatar_url text null
bio text null
public_profile_enabled_at timestamptz null
updated_at timestamptz not null
```

Note: values in this table may be public if profile is enabled. Validate and moderate user-editable content.

### 8.5 `usage_snapshots`

```sql
id uuid primary key
user_id uuid not null references users(id)
snapshot_id text not null
source text not null
source_version text null
agent text not null
period_start timestamptz not null
period_end timestamptz not null
timezone text null
input_tokens bigint not null default 0
output_tokens bigint not null default 0
total_tokens bigint not null default 0
requests bigint not null default 0
raw_payload_hash text null
created_at timestamptz not null
unique(user_id, source, snapshot_id)
```

### 8.6 `usage_snapshot_models`

```sql
id uuid primary key
snapshot_id uuid not null references usage_snapshots(id)
model text not null
input_tokens bigint not null default 0
output_tokens bigint not null default 0
total_tokens bigint not null default 0
requests bigint not null default 0
```

### 8.7 `usage_snapshot_repos`

```sql
id uuid primary key
snapshot_id uuid not null references usage_snapshots(id)
repo_key text not null
repo_label_enc text null
repo_label_public text null
visibility_hint text null -- public, private, unknown
total_tokens bigint not null default 0
requests bigint not null default 0
```

### 8.8 `repo_visibility_settings`

```sql
id uuid primary key
user_id uuid not null references users(id)
repo_key text not null
public_enabled boolean not null default false
public_label text null
created_at timestamptz not null
updated_at timestamptz not null
unique(user_id, repo_key)
```

### 8.9 `consent_events`

```sql
id uuid primary key
user_id uuid not null references users(id)
consent_type text not null -- public_profile, leaderboard, badges, analytics, marketing
consent_version text not null
action text not null -- granted, withdrawn
created_at timestamptz not null
ip_hash text null
user_agent_hash text null
```

### 8.10 `upload_tokens`

```sql
id uuid primary key
user_id uuid not null references users(id)
token_hash text not null unique
name text null
last_used_at timestamptz null
expires_at timestamptz null
revoked_at timestamptz null
created_at timestamptz not null
```

Never store plaintext upload tokens.

### 8.11 `data_export_requests`

```sql
id uuid primary key
user_id uuid not null references users(id)
status text not null -- pending, ready, failed, expired
file_key text null
requested_at timestamptz not null
ready_at timestamptz null
expires_at timestamptz null
```

### 8.12 `account_deletion_jobs`

```sql
id uuid primary key
user_id uuid not null references users(id)
status text not null -- pending, processing, complete, failed
requested_at timestamptz not null
completed_at timestamptz null
error text null
```

### 8.13 `abuse_reports`

```sql
id uuid primary key
reporter_user_id uuid null references users(id)
target_type text not null -- profile, badge, leaderboard_entry, other
target_ref text not null
category text not null
message text null
status text not null default 'open'
created_at timestamptz not null
resolved_at timestamptz null
```

---

## 9. API Requirements

### 9.1 Auth

```http
GET  /api/auth/github/start
GET  /api/auth/github/callback
POST /api/auth/logout
```

Requirements:

- Use CSRF/state parameter.
- Use secure cookies.
- Use `SameSite=Lax` or stricter where possible.
- Store session securely.
- Avoid exposing GitHub identity values in logs.

### 9.2 Privacy settings

```http
GET   /api/me/privacy
PATCH /api/me/privacy
POST  /api/me/privacy/consent
```

PATCH must support:

```json
{
  "profile_public": false,
  "leaderboard_opt_in": false,
  "badges_enabled": false,
  "repo_public_by_default": false,
  "analytics_opt_in": false,
  "marketing_email_opt_in": false
}
```

Requirements:

- Changes to public visibility must create consent/audit events.
- Changes to public visibility must invalidate public cache.
- User must be able to withdraw consent as easily as grant it.

### 9.3 Usage ingestion

```http
POST /api/ingest/usage-snapshot
```

Headers:

```http
Authorization: Bearer <upload-token>
Idempotency-Key: <snapshot-id>
Content-Type: application/json
```

Requirements:

- Validate upload token hash.
- Validate JSON schema.
- Reject raw-content fields.
- Rate limit.
- Upsert by user/source/snapshot_id.
- Return stable result for duplicate idempotency keys.

### 9.4 Data export

```http
POST /api/me/data-export
GET  /api/me/data-export/:id
GET  /api/me/data-export/:id/download
```

For small accounts, direct download is acceptable:

```http
GET /api/me/export.json
```

Export must exclude:

- OAuth tokens
- Upload tokens
- Passwords, if any
- Internal fraud/security signals that would create security risk

### 9.5 Delete account

```http
POST /api/me/delete-account/request
POST /api/me/delete-account/confirm
```

Requirements:

- Require logged-in user.
- Require explicit confirmation.
- Immediately remove public artifacts.
- Revoke upload tokens.
- Delete OAuth tokens if stored.
- Delete/anonymize encrypted identity data.
- Delete/anonymize usage stats unless retention policy requires limited retention.
- Keep minimal non-identifying audit entry.

### 9.6 GitHub disconnect

```http
POST /api/me/github/disconnect
```

Requirements:

- Remove stored GitHub OAuth token if any.
- Revoke/disable upload tokens if they depend on GitHub connection.
- Keep account only if product supports email-less/accountless mode; otherwise explain that GitHub auth is required.

### 9.7 Public profile

```http
GET /u/:slug
GET /api/public/users/:slug
```

Requirements:

- Return 404 or private state if profile is not public.
- Never return email or GitHub numeric ID.
- Never return hidden repo/workspace stats.

### 9.8 Badge endpoints

```http
GET /badge/user/:slug/:badgeType.svg
GET /badge/repo/:slug/:repoKey/:badgeType.svg
```

Requirements:

- Check visibility before rendering.
- Use safe SVG rendering.
- Escape all user-controlled strings.
- Set cache headers carefully.
- Invalidate on privacy/deletion updates.

### 9.9 Abuse/reporting

```http
POST /api/report
GET  /api/admin/reports
PATCH /api/admin/reports/:id
```

Requirements:

- Public report form should not require login for clear public abuse cases.
- Apply spam/rate limits.
- Record category and target.
- Avoid exposing reporter personal data publicly.

---

## 10. Data Export Format

Recommended export file name:

```text
promptstreak-data-export-YYYY-MM-DD.json
```

Recommended shape:

```json
{
  "exported_at": "2026-05-01T12:00:00Z",
  "account": {
    "created_at": "2026-05-01T10:00:00Z",
    "provider": "github",
    "github_connected": true,
    "github_user_id": "123456",
    "github_username": "example",
    "email": "user@example.com"
  },
  "privacy_settings": {
    "profile_public": false,
    "leaderboard_opt_in": false,
    "badges_enabled": false,
    "repo_public_by_default": false,
    "analytics_opt_in": false,
    "marketing_email_opt_in": false
  },
  "usage_stats": [
    {
      "snapshot_id": "snapshot-123",
      "source": "vscode-extension",
      "agent": "github-copilot",
      "period_start": "2026-05-01T00:00:00Z",
      "period_end": "2026-05-01T23:59:59Z",
      "input_tokens": 1000,
      "output_tokens": 2000,
      "total_tokens": 3000,
      "requests": 25,
      "models": [
        {
          "model": "example-model",
          "input_tokens": 1000,
          "output_tokens": 2000,
          "total_tokens": 3000,
          "requests": 25
        }
      ],
      "repos": [
        {
          "repo_key": "repo-hash-or-id",
          "public_label": null,
          "total_tokens": 3000,
          "requests": 25
        }
      ]
    }
  ],
  "public_profile": {
    "enabled": false,
    "slug": null,
    "public_url": null
  },
  "leaderboard": {
    "opted_in": false
  },
  "badges": {
    "enabled": false,
    "public_badge_urls": []
  },
  "consent_events": [
    {
      "type": "leaderboard",
      "version": "2026-05-01",
      "action": "withdrawn",
      "created_at": "2026-05-01T11:00:00Z"
    }
  ],
  "notes": {
    "excluded": [
      "OAuth tokens",
      "upload tokens",
      "internal security signals"
    ]
  }
}
```

---

## 11. Account Deletion Behavior

### 11.1 Immediate actions

On confirmed deletion:

- Set user status to `deleted`.
- Disable profile_public.
- Disable leaderboard_opt_in.
- Disable badges_enabled.
- Remove from leaderboard materialized views.
- Invalidate public cache.
- Disable badge URLs.
- Revoke upload tokens.
- Delete OAuth tokens if stored.
- Delete or blank public profile data.

### 11.2 Data deletion/anonymization

Recommended:

- Delete encrypted GitHub user ID.
- Delete encrypted email.
- Delete email hash.
- Delete GitHub ID hash unless needed to prevent immediate abuse/re-registration; if retained, document limited purpose and retention.
- Delete or anonymize usage snapshots.
- Delete repo labels.
- Keep only aggregate non-identifying global statistics if they cannot reasonably identify the user.

### 11.3 Retained data

May retain temporarily if documented:

- Security logs
- Abuse/fraud logs
- Backup copies until normal backup rotation expires
- Payment/accounting records if monetization is added later

Recommended retention policy:

```text
Security logs: 30-90 days unless needed for abuse/security investigation
Temporary export files: 7 days or less
Backups: normal rotation, e.g. 30 days
Deleted account identity: deleted/anonymized immediately or within deletion job SLA
```

---

## 12. Security Requirements

### 12.1 Encryption

- Use TLS everywhere.
- Encrypt sensitive fields at application layer before database persistence.
- Use proven encryption libraries.
- Do not create custom crypto.
- Store encryption keys outside the database.
- Rotate keys with a documented process.
- Use separate secrets for encryption and HMAC lookup hashes.

### 12.2 Lookup hashes

For encrypted identifiers that need lookup:

```text
lookup_hash = HMAC_SHA256(server_side_pepper, normalized_identifier)
```

Do not use plain SHA-256 for email/GitHub ID lookup because identifiers are guessable.

### 12.3 Upload tokens

- Generate high-entropy random tokens.
- Show plaintext token only once.
- Store only token hash.
- Allow user to revoke tokens.
- Support expiration.
- Rate limit per token and user.

### 12.4 Logging

Logs must not contain:

- Email plaintext
- GitHub user ID plaintext
- OAuth tokens
- Upload tokens
- Raw usage payload if it might contain sensitive labels
- Raw request bodies from ingest endpoint

Logs may contain:

- Internal user UUID
- Request ID
- Timestamp
- Route
- Status code
- Error code
- IP hash for abuse detection

### 12.5 Abuse/fraud hardening

Initial checks:

- Rate limit usage ingestion.
- Reject impossible token spikes.
- Flag large backdated imports.
- Track source version.
- Track snapshot hash.
- Require idempotency key.
- Add verification badges later for trusted/validated stats.

Do not claim public stats are verified unless you have implemented verification.

---

## 13. UI Requirements

### 13.1 Footer links

Footer must include:

```text
Impressum
Datenschutz / Privacy Policy
Terms / Nutzungsbedingungen
Contact
Report abuse
Cookie preferences, if optional cookies exist
```

### 13.2 Settings → Privacy & Data

Required controls:

```text
Account
- Connected GitHub account
- Disconnect GitHub

Public sharing
- Public profile toggle
- Leaderboard toggle
- Badges toggle
- Repo/workspace visibility controls

Data rights
- Download my data
- Delete my account
- Request correction / contact privacy support

Consent
- Analytics opt-in/out, if analytics exists
- Marketing email opt-in/out, if marketing exists
```

### 13.3 Public-sharing confirmation copy

When enabling public profile:

```text
Your public profile may show your selected display name, rank tier, aggregate token usage, badges, and any repositories/workspaces you explicitly mark as public. Your email address and GitHub numeric user ID are never shown publicly.
```

When enabling leaderboard:

```text
Your selected public identity and aggregate usage statistics may appear in public rankings. You can leave the leaderboard at any time from Privacy & Data settings.
```

When enabling badges:

```text
Badge URLs are public. Anyone with the URL may request the badge image and see the statistics shown on that badge. You can disable badges at any time.
```

### 13.4 Delete account confirmation copy

```text
Deleting your account removes your public profile, leaderboard entry, badges, GitHub connection, and stored usage statistics according to our retention policy. Some external caches, such as GitHub README image caches or search engines, may take time to refresh.
```

---

## 14. Legal Page Content Requirements

### 14.1 Impressum

Must include, as applicable:

```text
Angaben gemäß § 5 DDG

[Legal name / company name]
[Street address]
[Postal code, city, country]

Represented by:
[Name, if company]

Contact:
Email: [legal/contact email]
Website: https://promptstreak.dev

Register entry, if applicable:
[Register court]
[Register number]

VAT ID, if applicable:
[VAT ID]

Responsible for content under media-law rules, if editorial content is offered:
[Name and address]
```

### 14.2 Privacy Policy

Must explain:

- Controller identity and contact
- What data is collected
- What data is not collected
- GitHub authentication
- Token usage statistics
- Public profiles, leaderboards, and badges
- Legal bases
- Processors/vendors
- International transfers, if any
- Retention periods
- User rights
- How to request access/export/deletion/correction
- Security measures
- Cookies/local storage
- Abuse/reporting
- Contact and complaint route

### 14.3 Terms

Should include:

- User responsibility for submitted stats
- No guarantee that user-submitted usage stats are verified unless explicitly marked
- Prohibition on manipulation/abuse/spam
- Public badge/profile terms
- Account suspension/moderation rights
- Availability disclaimer
- API/tool usage limits

---

## 15. International Support Strategy

Recommended launch strategy:

```text
Provide GDPR-level controls to all users globally.
```

This means every user gets:

- Export
- Delete
- Correction/contact path
- Public/private controls
- Leaderboard opt-in/out
- Badge opt-in/out
- Consent withdrawal

Region-specific complexity to monitor later:

| Region | Launch approach |
|---|---|
| Germany | Impressum + Datenschutz + cookie/local-storage compliance |
| EU/EEA | GDPR baseline for everyone |
| UK | UK GDPR-compatible rights text; assess representative only if actively targeting UK |
| Switzerland | GDPR-style notice generally maps well; add Swiss clause if targeting Switzerland |
| US/California | Avoid sale/share/tracking; monitor thresholds if growth increases |
| Brazil | GDPR-style export/delete/correction helps; add LGPD clause if targeting Brazil |
| India | Avoid minors; add grievance/contact path; monitor DPDP implementation |
| China | Do not actively target without separate PIPL review |
| Korea/Japan/Singapore | GDPR-style controls help; add local notices if actively targeting |

Age policy recommendation:

```text
Promptstreak is intended for users aged 18 or older.
```

This avoids high-friction child-data obligations in regions such as India and parts of the EU.

---

## 16. Admin Requirements

Admin interface should support:

- View user by internal UUID, not plaintext email by default.
- View privacy settings.
- Trigger data export on behalf of user if support receives request.
- Trigger deletion job.
- Review abuse reports.
- Suspend account.
- Remove public profile/badge/leaderboard entry.
- View consent event history.
- View ingestion error summaries.

Admin access must be protected by:

- Strong authentication
- Role-based access control
- Audit logs
- Least privilege
- No unnecessary access to decrypted identity data

---

## 17. Testing Plan

### 17.1 Unit tests

- Encryption/decryption works.
- Lookup HMAC is deterministic and does not reveal plaintext.
- Ingest schema rejects invalid payloads.
- Ingest rejects raw-content fields.
- Privacy toggles update correct state.
- Consent events are recorded.
- Badge visibility checks work.
- Leaderboard filters private/deleted/opted-out users.

### 17.2 Integration tests

- GitHub auth callback creates private account.
- User can ingest usage snapshot with valid token.
- Duplicate snapshot is idempotent.
- Private user does not appear publicly.
- Public profile appears only after opt-in.
- Leaderboard entry appears only after opt-in.
- Badge renders only after badge opt-in.
- Account deletion removes public endpoints.
- Data export contains expected fields and no secrets.

### 17.3 Security tests

- Upload token is never stored plaintext.
- OAuth token is not stored unless feature requires it.
- Logs do not contain email, GitHub ID, tokens, or raw payloads.
- SVG badge output escapes user-controlled text.
- Rate limits apply to auth, ingest, export, and report endpoints.
- CSRF protection applies to state-changing browser endpoints.

### 17.4 Privacy regression tests

Create test fixtures:

1. Private user with usage stats
2. Public profile user
3. Leaderboard user
4. Badge-enabled user
5. Deleted user
6. User with hidden repo

Assert:

- Private user has no public exposure.
- Deleted user has no public exposure.
- Hidden repo never appears in public profile/badge/leaderboard.
- Export includes hidden/private data for the owner only.
- Public endpoints never include email or GitHub numeric ID.

---

## 18. Acceptance Criteria

The feature is complete when:

- GitHub auth works with least privilege.
- GitHub ID and email are encrypted at rest.
- Lookup works through HMAC hashes, not plaintext fields.
- Usage ingestion accepts only normalized metrics.
- Raw prompts/code/completions are not accepted or stored.
- Account is private by default.
- Public profile is opt-in.
- Leaderboard is opt-in.
- Badges are opt-in.
- Repo/workspace public visibility is controllable.
- User can export data as JSON.
- User can delete account.
- Delete removes profile, leaderboard, badges, OAuth/upload tokens, and identity data.
- Footer includes Impressum, Privacy Policy, Terms, Contact, Report abuse.
- Privacy Policy describes exactly what is and is not collected.
- Cookie preferences exist if optional analytics/tracking is used.
- Abuse report flow exists for public content.
- Tests cover public/private/deleted states.
- Admin tools support DSAR/export/deletion/report workflows.

---

## 19. Copilot Implementation Prompt

Use this prompt to ask Copilot or an agentic coding tool to implement or review the feature:

```text
You are working on promptstreak.dev, a privacy-first developer usage leaderboard and badge platform. Implement the privacy/compliance layer described in docs/promptstreak-privacy-compliance-feature-doc.md.

Core constraints:
- GitHub authentication only.
- Store GitHub user ID and email encrypted at rest.
- Use HMAC lookup hashes for encrypted identifiers that need lookup.
- Do not request GitHub repo/code scopes for normal login.
- Do not store raw prompts, completions, source code, terminal output, or full IDE logs.
- Usage ingestion must accept only normalized token/request metrics.
- Public profile, leaderboard, badges, and repo-level public stats must be opt-in.
- Private by default.
- Add self-service data export and account deletion.
- Deletion must remove public profile, leaderboard entry, badge output, upload tokens, OAuth tokens if any, and identity fields.
- Add Privacy & Data settings UI.
- Add footer links for Impressum, Privacy Policy, Terms, Contact, and Report abuse.
- Add abuse report flow for public profiles/badges/leaderboards.
- Add tests for private/public/deleted states and no-secret exports.

Before coding, inspect the existing auth, user, leaderboard, badge, and usage ingestion models. Then propose the smallest safe migration path. Prefer incremental implementation with tests.
```

---

## 20. Official / Authoritative References

- GDPR Article 13 — information to be provided when personal data are collected: https://gdpr-info.eu/art-13-gdpr/
- GDPR Article 15 — right of access: https://gdpr-info.eu/art-15-gdpr/
- GDPR Article 17 — right to erasure: https://gdpr-info.eu/art-17-gdpr/
- GDPR Article 20 — right to data portability: https://gdpr-info.eu/art-20-gdpr/
- GDPR Article 12 — response timing for data subject requests: https://gdpr-info.eu/art-12-gdpr/
- GDPR Article 32 — security of processing, including encryption/pseudonymisation: https://gdpr-info.eu/art-32-gdpr/
- Germany DDG § 5 — provider information / Impressum: https://www.gesetze-im-internet.de/ddg/__5.html
- Germany TDDDG § 25 / cookie and terminal-equipment privacy overview: https://gesetz-tdddg.de/
- GitHub OAuth scopes: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps
- GitHub OAuth authorisation and `user:email` behavior: https://docs.github.com/en/apps/oauth-apps/using-oauth-apps/authorizing-oauth-apps
- EU Digital Services Act overview: https://digital-strategy.ec.europa.eu/en/policies/digital-services-act
- DSA Article 16 notice-and-action mechanism text: https://www.eu-digital-services-act.com/Digital_Services_Act_Article_16.html
