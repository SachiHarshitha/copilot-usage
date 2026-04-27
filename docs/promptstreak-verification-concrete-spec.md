# Promptstreak Verification & Anti-Cheat — Concrete Implementation Spec

> **Status:** Implementation-ready v1.1 spec  
> **Updated:** 2026-04-27  
> **Primary target:** Personal GitHub Copilot users  
> **Product:** promptstreak.dev  
> **Goal:** Add a narrow but credible verification layer for Promptstreak profiles, badges, and leaderboards without pretending that local telemetry can be fully cheat-proof.

---

## 0. Executive Decision

Build this feature as a **layered trust system**, not as “encryption that prevents cheating.”

The v1 implementation should ship these pieces in order:

1. **Signed uploads** using HMAC + timestamp + nonce.
2. **Replay protection** for upload requests.
3. **Trust-state fields** on stats and profiles.
4. **Anomaly logging** for suspicious usage patterns.
5. **GitHub billing verification** for personal-account premium request totals.
6. **Private comparison card** in Settings.
7. **Public badge** that says only:  
   **GitHub-validated premium usage**

Do **not** claim that GitHub verifies repo-level usage, token usage, workspace attribution, or all Promptstreak stats.

---

## 1. Product Summary

Promptstreak is local-first. The VS Code extension or CLI observes coding-agent activity locally, computes summaries, and uploads normalized snapshots to promptstreak.dev.

This model is privacy-preserving and flexible, but it also means the local client can be modified. Therefore, Promptstreak must distinguish between:

- data reported by the local client,
- data observed by a known linked client and protected against request tampering,
- data verified by an external source,
- data flagged as suspicious.

The first external verification source is GitHub’s billing API for **personal premium request usage**.

---

## 2. Non-Negotiable Truths

### 2.1 What can be verified

For personal GitHub Copilot users, Promptstreak can verify:

- account-level premium request usage,
- for a given UTC month,
- from GitHub billing data,
- after the user authorizes Promptstreak with a GitHub App user access token that has the required read permission.

### 2.2 What cannot be verified

Promptstreak cannot verify via GitHub billing:

- repo-level premium request attribution,
- local workspace mapping,
- token counts from local logs,
- which machine generated the activity,
- whether local telemetry was fabricated before being signed,
- whether every stat on the profile is true.

### 2.3 Required public wording

Use narrow language everywhere.

Allowed:

> Monthly premium request total verified from GitHub billing.

Allowed:

> GitHub-validated premium usage.

Not allowed:

> GitHub verified profile.

Not allowed:

> Verified Copilot usage by repo.

Not allowed:

> Verified token usage.

---

## 3. External Source of Truth: GitHub Billing API

### 3.1 Endpoint

Use the GitHub REST endpoint:

```http
GET https://api.github.com/users/{username}/settings/billing/premium_request/usage
```

Recommended headers:

```http
Accept: application/vnd.github+json
Authorization: Bearer <github_user_access_token>
X-GitHub-Api-Version: 2026-03-10
```

Query parameters for v1:

```http
year=<UTC_YEAR>
month=<UTC_MONTH_1_TO_12>
```

Do not use `day`, `model`, or `product` filters in the first version unless the unfiltered monthly baseline works reliably.

### 3.2 Auth type

Preferred:

- GitHub App user access token.

Fallback later:

- Fine-grained personal access token.

Do not use classic PAT as the default UX.

### 3.3 Required permission

The GitHub App must request the minimum required user permission:

```txt
Plan: read
```

### 3.4 Data availability caveat

Only use this feature for users where the endpoint succeeds. If GitHub returns 403 or 404, treat verification as unsupported or unavailable, not as cheating.

### 3.5 Response shape to expect

Example shape:

```json
{
  "timePeriod": {
    "year": 2025,
    "month": 8
  },
  "user": "monalisa",
  "usageItems": [
    {
      "product": "Copilot",
      "sku": "Copilot Premium Request",
      "model": "GPT-5",
      "unitType": "requests",
      "pricePerUnit": 0.04,
      "grossQuantity": 100,
      "grossAmount": 4,
      "discountQuantity": 0,
      "discountAmount": 0,
      "netQuantity": 100,
      "netAmount": 4
    }
  ]
}
```

### 3.6 Which field to use

For “premium requests used,” use:

```ts
verifiedPremiumRequests = sum(
  usageItems
    .filter(item => item.sku === "Copilot Premium Request")
    .filter(item => item.unitType === "requests")
    .map(item => item.grossQuantity)
)
```

Why `grossQuantity`:

- It represents total usage.
- `netQuantity` can be affected by discounts, allowances, or billing adjustments.
- Promptstreak is measuring activity credibility, not payable overage.

Store `netQuantity` separately only for future billing/overage features.

### 3.7 Month boundaries

Use UTC month periods.

```ts
periodKey = `${utcYear}-${String(utcMonth).padStart(2, "0")}`
```

Premium request counters reset on the first day of each month at `00:00:00 UTC`, so do not use the user’s local timezone for monthly verification matching.

---

## 4. Trust Model

Use stat-level trust states.

```ts
export enum TrustState {
  SELF_REPORTED = "self_reported",
  OBSERVED = "observed",
  VERIFIED_EXTERNAL = "verified_external",
  FLAGGED = "flagged"
}
```

### 4.1 Meaning

| Trust state | Meaning | Source |
|---|---|---|
| `self_reported` | Reported by a local client without strong upload integrity | Extension / CLI |
| `observed` | Reported by a linked local client with signed upload + plausibility checks | Extension / CLI + server checks |
| `verified_external` | Confirmed by an external authoritative source | GitHub billing API |
| `flagged` | Suspicious enough to affect trust display or leaderboard eligibility | Server anomaly rules |

### 4.2 Initial Copilot mapping

| Metric | Trust state |
|---|---|
| Total tokens from local VS Code/Copilot logs | `observed` |
| Repo-level token attribution | `observed` |
| Local premium request estimate | `observed` |
| GitHub monthly premium request total | `verified_external` |
| Repo-level premium request split | `observed` only |
| Badge rank derived from local token totals | `observed` |
| Badge rank derived from GitHub verified premium total | `verified_external` |

---

## 5. Upload Integrity

### 5.1 Goal

Protect the upload channel against:

- modified request bodies,
- replayed uploads,
- stolen `tokenId` without secret,
- stale requests,
- accidental ingestion from revoked devices.

This does not prove that the local data itself is truthful.

### 5.2 Device token model

Keep split token format:

```txt
tokenId.secret
```

Server stores:

```txt
tokenId
secretHash
secretLastFour
revokedAt
createdAt
lastUsedAt
```

Client stores the full token once.

### 5.3 Upload headers

`POST /api/upload` must require these headers for v1.1 clients:

```http
X-Promptstreak-Token-Id: <tokenId>
X-Promptstreak-Timestamp: <ISO_8601_UTC>
X-Promptstreak-Nonce: <random_128_bit_base64url>
X-Promptstreak-Payload-Hash: <sha256_hex_raw_body>
X-Promptstreak-Signature: <hmac_sha256_hex>
X-Promptstreak-Client-Version: <extension_or_cli_version>
X-Promptstreak-Chain-Head: <optional_local_journal_chain_hash>
```

### 5.4 Canonical request string

The client signs exactly this string:

```txt
POST
/api/upload
<TIMESTAMP>
<NONCE>
<PAYLOAD_HASH>
```

Example:

```txt
POST
/api/upload
2026-04-27T12:34:56.000Z
Zr8m7N7F4x0rPZ0lB4JhNg
a3b25d4f2f9e7e5b5...
```

### 5.5 Signature algorithm

```ts
signature = hex(
  hmacSha256(
    deviceSecret,
    canonicalRequest
  )
)
```

### 5.6 Server validation order

On every upload:

1. Read raw request body.
2. Read `X-Promptstreak-Token-Id`.
3. Resolve device token by `tokenId`.
4. Reject if device does not exist.
5. Reject if device is revoked.
6. Hash provided client secret using existing server token logic if the secret is part of auth; otherwise use stored encrypted/derived secret material.
7. Parse timestamp.
8. Reject if timestamp is outside `±5 minutes` from server time.
9. Reject if nonce already exists for this `tokenId`.
10. Recompute SHA-256 hash of raw body.
11. Reject if body hash does not match `X-Promptstreak-Payload-Hash`.
12. Recompute HMAC.
13. Compare signatures using constant-time comparison.
14. Persist nonce.
15. Continue schema validation.
16. Ingest snapshot.
17. Run anomaly checks.
18. Update `lastUsedAt`.

### 5.7 Nonce storage

Add a nonce table:

```prisma
model UploadNonce {
  id        String   @id @default(cuid())
  tokenId   String
  nonce     String
  createdAt DateTime @default(now())

  @@unique([tokenId, nonce])
  @@index([createdAt])
}
```

Retention job:

```txt
Delete UploadNonce rows older than 10 minutes.
```

Recommended stale timestamp window:

```txt
5 minutes
```

Recommended nonce TTL:

```txt
10 minutes
```

### 5.8 Backwards compatibility

For rollout:

- Phase 1 accepts unsigned uploads but records `signatureStatus = "missing"`.
- Phase 2 warns old clients.
- Phase 3 rejects unsigned uploads after a forced extension/CLI version cutoff.

---

## 6. Local Tamper-Evident Journal

### 6.1 Goal

Make casual local history editing obvious.

This is not cryptographic proof against a determined attacker because the local user controls the machine.

### 6.2 Journal record

Each local upload journal record should include:

```json
{
  "schemaVersion": 1,
  "recordId": "uuid",
  "createdAt": "2026-04-27T12:34:56.000Z",
  "adapter": "github-copilot-vscode",
  "periodStart": "2026-04-27T12:00:00.000Z",
  "periodEnd": "2026-04-27T13:00:00.000Z",
  "payloadHash": "sha256_hex",
  "previousRecordHash": "sha256_hex_or_null",
  "recordHash": "sha256_hex"
}
```

### 6.3 Record hash

```ts
recordHash = sha256(canonicalJson({
  schemaVersion,
  recordId,
  createdAt,
  adapter,
  periodStart,
  periodEnd,
  payloadHash,
  previousRecordHash
}))
```

### 6.4 Upload behavior

Each upload includes:

```http
X-Promptstreak-Chain-Head: <recordHash>
```

Payload may also include:

```json
{
  "journal": {
    "chainHead": "...",
    "previousChainHead": "...",
    "recordCount": 42
  }
}
```

### 6.5 Server-side checks

Record anomaly if:

- chain head moves backwards,
- previous chain head does not match the server’s last known chain head,
- record count decreases unexpectedly,
- a large historical rewrite appears.

Do not block upload solely because of a journal mismatch in v1. Treat it as a trust signal.

---

## 7. GitHub Verification Flow

### 7.1 User flow

1. User goes to `/settings/verification`.
2. User clicks **Connect GitHub billing verification**.
3. App starts GitHub App user authorization.
4. User approves requested permissions.
5. GitHub redirects to callback.
6. Server exchanges code for user access token.
7. Server stores encrypted token metadata.
8. Server fetches current UTC month premium request usage.
9. Server stores a `VerifiedMetricSnapshot`.
10. Settings page shows comparison card.
11. Public profile becomes eligible for narrow trust badge.

### 7.2 Routes

| Route | Method | Purpose | Auth |
|---|---:|---|---|
| `/settings/verification` | UI | Settings page | Session |
| `/api/verification/status` | GET | Return private verification state | Session |
| `/api/verification/github/start` | POST | Create auth state + redirect URL | Session |
| `/api/verification/github/callback` | GET | OAuth callback | GitHub state |
| `/api/verification/github/refresh` | POST | Refresh verified usage now | Session |
| `/api/verification/github` | DELETE | Disconnect verification | Session |
| `/api/profile/[username]` | GET | Include public trust metadata | Public |

### 7.3 GitHub token storage

Create a dedicated table. Do not store GitHub tokens on the general user row.

```prisma
model GitHubBillingCredential {
  id                    String   @id @default(cuid())
  userId                String   @unique
  githubUserId          String
  githubUsername        String

  encryptedAccessToken  String
  accessTokenExpiresAt  DateTime?
  encryptedRefreshToken String?
  refreshTokenExpiresAt DateTime?

  scopes                String?
  permissionsJson       Json?
  status                GitHubBillingCredentialStatus @default(ACTIVE)

  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
  lastRefreshAttemptAt  DateTime?
  lastRefreshSuccessAt  DateTime?

  @@index([githubUsername])
}

enum GitHubBillingCredentialStatus {
  ACTIVE
  EXPIRED
  REVOKED
  ERROR
}
```

### 7.4 Token encryption

Use envelope encryption or a server-managed encryption key.

Required environment variable:

```txt
GITHUB_TOKEN_ENCRYPTION_KEY
```

Minimum behavior:

- encrypt access token before storing,
- encrypt refresh token before storing,
- never log raw token,
- never return token to client,
- delete credentials on disconnect.

### 7.5 Refresh behavior

Before calling GitHub:

1. Load credential.
2. If access token is still valid with at least 2 minutes of buffer, use it.
3. If expired and refresh token exists, call GitHub token refresh endpoint.
4. Store the new access token and new refresh token.
5. If refresh fails, set credential status to `EXPIRED`.
6. Mark verification status as `expired`.

### 7.6 Disconnect behavior

On `DELETE /api/verification/github`:

- delete or revoke stored GitHub credential,
- set `githubBillingConnected = false`,
- preserve historical verified metric snapshots,
- set public badge eligibility to false,
- keep past snapshots available internally for audit.

---

## 8. Data Model

### 8.1 Main verification status

```prisma
model UserVerification {
  id                      String   @id @default(cuid())
  userId                  String   @unique

  githubBillingConnected  Boolean  @default(false)
  githubBillingStatus     VerificationStatus @default(NOT_CONNECTED)

  verifiedAt              DateTime?
  lastCheckedAt           DateTime?
  lastHealthyAt           DateTime?

  currentPeriodKey        String?
  localPremiumRequests    BigInt?
  verifiedPremiumRequests BigInt?
  differenceAbsolute      BigInt?
  differencePercent       Decimal? @db.Decimal(8, 4)

  mismatchScore           Int      @default(0)
  trustScore              Int      @default(0)

  publicBadgeEligible     Boolean  @default(false)

  createdAt               DateTime @default(now())
  updatedAt               DateTime @updatedAt
}

enum VerificationStatus {
  NOT_CONNECTED
  CONNECTED
  HEALTHY
  MINOR_MISMATCH
  WARNING
  MISMATCH
  UNSUPPORTED
  EXPIRED
  ERROR
}
```

### 8.2 Verified metric snapshots

```prisma
model VerifiedMetricSnapshot {
  id                    String   @id @default(cuid())
  userId                String

  source                VerifiedMetricSource
  metricKey             VerifiedMetricKey
  periodKey             String

  valueGross            BigInt
  valueNet              BigInt?
  unitType              String   // requests
  product               String?
  sku                   String?
  model                 String?

  rawResponseHash        String?
  fetchedAt             DateTime @default(now())
  trustState            TrustState @default(VERIFIED_EXTERNAL)

  createdAt             DateTime @default(now())

  @@unique([userId, source, metricKey, periodKey, product, sku, model])
  @@index([userId, periodKey])
}

enum VerifiedMetricSource {
  GITHUB_BILLING
}

enum VerifiedMetricKey {
  PREMIUM_REQUESTS_MONTHLY
}

enum TrustState {
  SELF_REPORTED
  OBSERVED
  VERIFIED_EXTERNAL
  FLAGGED
}
```

### 8.3 Upload audit

```prisma
model UploadAudit {
  id                 String   @id @default(cuid())
  userId             String
  deviceId           String?
  tokenId            String?

  receivedAt         DateTime @default(now())
  clientTimestamp    DateTime?
  clientVersion      String?

  payloadHash        String?
  signatureStatus    UploadSignatureStatus
  chainHead          String?
  previousChainHead  String?

  accepted           Boolean
  rejectionCode      String?

  ipHash             String?
  userAgentHash      String?

  @@index([userId, receivedAt])
  @@index([tokenId, receivedAt])
}

enum UploadSignatureStatus {
  VALID
  MISSING
  INVALID
  STALE_TIMESTAMP
  REPLAYED_NONCE
  BODY_HASH_MISMATCH
  DEVICE_REVOKED
}
```

### 8.4 Anomalies

```prisma
model VerificationAnomaly {
  id          String   @id @default(cuid())
  userId      String

  code        VerificationAnomalyCode
  severity    VerificationSeverity
  summary     String
  detailsJson Json?

  detectedAt  DateTime @default(now())
  resolvedAt  DateTime?
  resolution   String?

  @@index([userId, detectedAt])
  @@index([code, detectedAt])
}

enum VerificationAnomalyCode {
  PREMIUM_MISMATCH_MINOR
  PREMIUM_MISMATCH_WARNING
  PREMIUM_MISMATCH_LARGE
  IMPOSSIBLE_DAILY_SPIKE
  IMPOSSIBLE_THROUGHPUT
  REPLAY_ATTEMPT
  INVALID_SIGNATURE
  JOURNAL_CHAIN_REWRITE
  HISTORIC_REWRITE
  DEVICE_FINGERPRINT_COLLISION
}

enum VerificationSeverity {
  LOW
  MEDIUM
  HIGH
  CRITICAL
}
```

---

## 9. API Contracts

### 9.1 `GET /api/verification/status`

Returns private status for signed-in user.

Response:

```json
{
  "githubBilling": {
    "connected": true,
    "status": "HEALTHY",
    "githubUsername": "octocat",
    "lastCheckedAt": "2026-04-27T12:34:56.000Z",
    "verifiedAt": "2026-04-27T12:34:56.000Z"
  },
  "currentPeriod": {
    "periodKey": "2026-04",
    "localPremiumRequests": 412,
    "verifiedPremiumRequests": 401,
    "differenceAbsolute": 11,
    "differencePercent": 2.74,
    "result": "MINOR_MISMATCH"
  },
  "publicBadgeEligible": true,
  "copy": {
    "publicBadge": "GitHub-validated premium usage",
    "tooltip": "Monthly premium request total verified from GitHub billing. Repo attribution remains locally observed and is not confirmed by GitHub."
  }
}
```

### 9.2 `POST /api/verification/github/start`

Request:

```json
{}
```

Response:

```json
{
  "redirectUrl": "https://github.com/login/oauth/authorize?..."
}
```

Server must:

- require signed-in user,
- create CSRF/state value,
- store state with short TTL,
- redirect to GitHub App authorization URL.

### 9.3 `GET /api/verification/github/callback`

Query:

```txt
code=<github_code>
state=<state>
```

Server must:

- validate state,
- exchange code for user access token,
- fetch GitHub user identity,
- store encrypted credential,
- run initial usage fetch,
- redirect to `/settings/verification?connected=1`.

### 9.4 `POST /api/verification/github/refresh`

Request:

```json
{
  "periodKey": "2026-04"
}
```

If `periodKey` omitted, use current UTC month.

Response:

```json
{
  "status": "HEALTHY",
  "periodKey": "2026-04",
  "verifiedPremiumRequests": 401,
  "localPremiumRequests": 412,
  "differencePercent": 2.74
}
```

### 9.5 `DELETE /api/verification/github`

Response:

```json
{
  "disconnected": true
}
```

### 9.6 `GET /api/profile/[username]`

Public profile should include only safe trust metadata:

```json
{
  "username": "octocat",
  "trust": {
    "hasGithubBillingVerification": true,
    "publicBadgeLabel": "GitHub-validated premium usage",
    "publicBadgeTooltip": "Monthly premium request total verified from GitHub billing. Repo attribution remains locally observed and is not confirmed by GitHub.",
    "lastVerifiedPeriodKey": "2026-04"
  }
}
```

Do not expose:

- GitHub tokens,
- raw GitHub billing response,
- private mismatch details,
- internal anomaly details unless intentionally public later.

---

## 10. Local vs GitHub Matching Logic

### 10.1 Inputs

For each user and period:

```ts
localPremiumRequests: bigint
verifiedPremiumRequests: bigint
periodKey: string
```

### 10.2 Difference calculation

```ts
differenceAbsolute = localPremiumRequests - verifiedPremiumRequests

differencePercent =
  verifiedPremiumRequests === 0
    ? localPremiumRequests > 0 ? 100 : 0
    : Math.abs(Number(differenceAbsolute)) / Number(verifiedPremiumRequests) * 100
```

### 10.3 Status thresholds

| Difference | Status | Severity | Public badge |
|---:|---|---|---|
| 0–2% | `HEALTHY` | none | eligible |
| >2–10% | `MINOR_MISMATCH` | low | eligible with internal note |
| >10–25% | `WARNING` | medium | not eligible for premium leaderboard boost |
| >25% | `MISMATCH` | high | no verified badge |

### 10.4 Special cases

| Situation | Status |
|---|---|
| GitHub endpoint returns 403 | `UNSUPPORTED` or `ERROR`, depending on response |
| GitHub endpoint returns 404 | `UNSUPPORTED` |
| GitHub endpoint returns 503 | keep previous status, show temporary unavailable |
| Token expired and refresh fails | `EXPIRED` |
| GitHub verified = 0 and local > 0 | `MISMATCH` |
| Local = 0 and GitHub > 0 | `MINOR_MISMATCH` or `WARNING`, depending on percent |

### 10.5 Anomaly creation

Create anomaly records when:

- difference > 10%,
- difference > 25%,
- upload signature invalid,
- replayed nonce detected,
- impossible daily spike detected,
- chain rewrite detected.

Do not publicly accuse the user.

---

## 11. Anomaly Rules v1

### 11.1 Premium mismatch

```ts
if (differencePercent > 25) {
  code = "PREMIUM_MISMATCH_LARGE"
  severity = "HIGH"
} else if (differencePercent > 10) {
  code = "PREMIUM_MISMATCH_WARNING"
  severity = "MEDIUM"
} else if (differencePercent > 2) {
  code = "PREMIUM_MISMATCH_MINOR"
  severity = "LOW"
}
```

### 11.2 Replay attempt

If nonce already exists for token:

```ts
code = "REPLAY_ATTEMPT"
severity = "HIGH"
rejectUpload = true
```

### 11.3 Invalid signature

```ts
code = "INVALID_SIGNATURE"
severity = "HIGH"
rejectUpload = true
```

### 11.4 Historic rewrite

If a new upload changes a closed historical day by more than 5% after 48 hours:

```ts
code = "HISTORIC_REWRITE"
severity = "MEDIUM"
allowUpload = true
```

### 11.5 Journal chain rewrite

If `previousChainHead` does not match server’s last known chain head:

```ts
code = "JOURNAL_CHAIN_REWRITE"
severity = "LOW"
allowUpload = true
```

### 11.6 Impossible throughput

Use conservative thresholds first.

Example placeholder:

```ts
if (premiumRequestsInHour > 500) {
  code = "IMPOSSIBLE_THROUGHPUT"
  severity = "MEDIUM"
}
```

This threshold must be configurable.

---

## 12. Public Badge Policy

### 12.1 Badge eligibility

A user is eligible for the public trust badge if:

- GitHub billing is connected,
- latest verification status is `HEALTHY` or `MINOR_MISMATCH`,
- latest verified snapshot is for the current or previous UTC month,
- no unresolved high-severity anomaly exists for the current period.

### 12.2 Badge label

Use:

```txt
GitHub-validated premium usage
```

### 12.3 Badge tooltip

Use:

```txt
Monthly premium request total verified from GitHub billing. Repo attribution remains locally observed and is not confirmed by GitHub.
```

### 12.4 Profile detail copy

Use:

```txt
This badge confirms that this user connected GitHub billing verification and that their monthly premium request total is within tolerance of GitHub’s billing data. It does not verify repo-level attribution, token counts, or all local Promptstreak telemetry.
```

### 12.5 Leaderboard behavior

Default:

- show all public users,
- add subtle marker for eligible users,
- do not call anyone a cheater.

For high severity mismatch:

- remove verified marker,
- exclude from premium-request leaderboard boost,
- exclude from featured sections,
- keep profile visible unless separate moderation rules say otherwise.

---

## 13. Settings UI

### 13.1 Page

Add:

```txt
/settings/verification
```

### 13.2 Sections

1. Verification status
2. Connect GitHub billing
3. What this verifies
4. What this does not verify
5. Current comparison
6. Disconnect

### 13.3 Empty state copy

```txt
Connect GitHub billing verification to make your Promptstreak profile more credible.

This verifies your account-level GitHub Copilot premium request total. It does not verify repo-level attribution or local token counts.
```

### 13.4 Connected healthy copy

```txt
Your premium request total is verified with GitHub billing for the current month.

Repo attribution remains locally observed and is not confirmed by GitHub.
```

### 13.5 Mismatch copy

```txt
Your local premium request count differs from GitHub billing more than expected. This may be caused by upload lag, billing delay, local parser differences, or unsupported usage sources.
```

### 13.6 Unsupported copy

```txt
GitHub billing verification is unavailable for this account. This can happen if your Copilot usage is billed through an organization, enterprise, or a billing setup that does not expose personal premium request usage to this endpoint.
```

---

## 14. Implementation Files / Suggested Structure

Assuming Next.js App Router + Prisma:

```txt
src/
  app/
    settings/
      verification/
        page.tsx
    api/
      upload/
        route.ts
      verification/
        status/
          route.ts
        github/
          start/
            route.ts
          callback/
            route.ts
          refresh/
            route.ts
          route.ts
      profile/
        [username]/
          route.ts

  lib/
    upload/
      verifySignedUpload.ts
      canonicalRequest.ts
      nonceStore.ts
      uploadAudit.ts

    verification/
      githubBillingClient.ts
      githubTokenStore.ts
      refreshGithubUserToken.ts
      aggregatePremiumRequests.ts
      comparePremiumUsage.ts
      verificationStatus.ts
      anomalyRules.ts

    crypto/
      hmac.ts
      sha256.ts
      constantTimeEqual.ts
      encryptToken.ts

  components/
    verification/
      VerificationStatusCard.tsx
      GitHubBillingConnectButton.tsx
      PremiumUsageComparisonCard.tsx
      VerificationExplainer.tsx

prisma/
  schema.prisma
  migrations/
```

---

## 15. Core Helper Contracts

### 15.1 `aggregatePremiumRequests`

```ts
type GitHubUsageItem = {
  product?: string
  sku?: string
  model?: string
  unitType?: string
  grossQuantity?: number
  netQuantity?: number
}

export function aggregatePremiumRequests(items: GitHubUsageItem[]) {
  return items
    .filter(item => item.sku === "Copilot Premium Request")
    .filter(item => item.unitType === "requests")
    .reduce(
      (acc, item) => {
        acc.gross += BigInt(item.grossQuantity ?? 0)
        acc.net += BigInt(item.netQuantity ?? 0)
        return acc
      },
      { gross: 0n, net: 0n }
    )
}
```

### 15.2 `comparePremiumUsage`

```ts
export function comparePremiumUsage(input: {
  local: bigint
  verified: bigint
}) {
  const difference = input.local - input.verified

  const percent =
    input.verified === 0n
      ? input.local > 0n ? 100 : 0
      : Math.abs(Number(difference)) / Number(input.verified) * 100

  if (percent <= 2) return { status: "HEALTHY", percent, difference }
  if (percent <= 10) return { status: "MINOR_MISMATCH", percent, difference }
  if (percent <= 25) return { status: "WARNING", percent, difference }

  return { status: "MISMATCH", percent, difference }
}
```

### 15.3 `canonicalRequest`

```ts
export function buildCanonicalUploadRequest(input: {
  method: "POST"
  path: "/api/upload"
  timestamp: string
  nonce: string
  payloadHash: string
}) {
  return [
    input.method,
    input.path,
    input.timestamp,
    input.nonce,
    input.payloadHash
  ].join("\n")
}
```

---

## 16. Environment Variables

```txt
GITHUB_APP_CLIENT_ID=
GITHUB_APP_CLIENT_SECRET=
GITHUB_APP_ID=
GITHUB_APP_PRIVATE_KEY=

GITHUB_TOKEN_ENCRYPTION_KEY=

PROMPTSTREAK_UPLOAD_SIGNATURE_WINDOW_SECONDS=300
PROMPTSTREAK_UPLOAD_NONCE_TTL_SECONDS=600

NEXT_PUBLIC_APP_URL=https://promptstreak.dev
```

---

## 17. Background Jobs

### 17.1 Cleanup upload nonces

Frequency:

```txt
Every 5 minutes
```

Action:

```sql
DELETE FROM UploadNonce WHERE createdAt < now() - interval '10 minutes';
```

### 17.2 Refresh GitHub verification

Frequency:

```txt
Daily
```

For each connected user:

- refresh token if needed,
- fetch current UTC month,
- store snapshot,
- compare with local,
- update `UserVerification`,
- create anomalies if needed.

### 17.3 Recompute badge eligibility

Frequency:

```txt
After every verification refresh and after every accepted upload.
```

---

## 18. Rollout Plan

### Phase 1 — Upload trust plumbing

Ship:

- Prisma enums/tables,
- signed upload verification helper,
- upload audit table,
- nonce replay protection,
- anomaly logging for invalid signatures and replay attempts.

Temporary compatibility:

- unsigned old clients accepted but marked as `MISSING`.

### Phase 2 — Require signed uploads

Ship:

- extension/CLI update,
- HMAC signing,
- timestamp + nonce,
- body hash,
- server rejection for invalid signatures,
- warning for old clients.

After grace period:

- reject unsigned uploads from clients below minimum version.

### Phase 3 — GitHub billing verification private beta

Ship:

- GitHub App permission,
- GitHub auth start/callback,
- encrypted token storage,
- refresh token handling,
- usage fetch,
- verified snapshot storage,
- settings comparison card.

Do not show public badge yet.

### Phase 4 — Public badge

Ship:

- profile trust metadata,
- public badge,
- tooltip,
- leaderboard marker,
- badge eligibility logic.

### Phase 5 — Leaderboard policy

Ship:

- exclude high-mismatch profiles from premium-based featured leaderboard views,
- add internal moderation view later.

---

## 19. Testing Plan

### 19.1 Unit tests

Required tests:

- canonical request is stable,
- HMAC signature validates,
- changed body fails body hash,
- changed nonce fails signature,
- stale timestamp rejected,
- replayed nonce rejected,
- `grossQuantity` aggregation works,
- non-Copilot SKU ignored,
- non-request unit ignored,
- compare thresholds map correctly,
- zero verified usage handled safely.

### 19.2 Integration tests

Required tests:

- signed upload accepted,
- revoked device rejected,
- invalid signature rejected,
- replayed request rejected,
- GitHub callback stores encrypted credential,
- refresh flow stores `VerifiedMetricSnapshot`,
- mismatch creates anomaly,
- disconnect removes credential and disables public badge.

### 19.3 UI tests

Required tests:

- unconnected settings state,
- connected healthy state,
- mismatch state,
- unsupported state,
- expired token state,
- public badge visible only when eligible,
- repo stats do not show verified wording.

---

## 20. Acceptance Criteria

### Upload integrity

- A valid signed upload succeeds.
- A request with modified body fails.
- A request with reused nonce fails.
- A request older than 5 minutes fails.
- A revoked device cannot upload.
- Every upload creates an `UploadAudit` row.

### GitHub verification

- User can connect GitHub billing verification.
- Tokens are encrypted at rest.
- Current UTC month usage is fetched.
- `grossQuantity` is summed for `Copilot Premium Request`.
- Snapshot is stored by `periodKey`.
- Local vs verified comparison is computed.
- Status updates to `HEALTHY`, `MINOR_MISMATCH`, `WARNING`, or `MISMATCH`.
- Unsupported/expired/error states are handled without accusing the user.

### Public profile

- Eligible users show `GitHub-validated premium usage`.
- Tooltip clearly says repo attribution is not verified.
- Repo badges do not inherit GitHub verification.
- Mismatched users lose badge eligibility.

### Security

- Raw GitHub tokens are never logged.
- Raw GitHub tokens are never returned to the browser.
- HMAC comparison uses constant-time comparison.
- Nonces are unique per token ID.
- GitHub OAuth state is validated.

---

## 21. Copilot Implementation Prompt

Use this prompt when asking GitHub Copilot / Copilot Agent to implement:

```txt
Implement the Promptstreak verification and anti-cheat v1.1 feature based on docs/promptstreak-verification-concrete-spec.md.

Scope:
1. Add Prisma models/enums for UserVerification, GitHubBillingCredential, VerifiedMetricSnapshot, UploadNonce, UploadAudit, and VerificationAnomaly.
2. Add signed upload verification for POST /api/upload using:
   - X-Promptstreak-Token-Id
   - X-Promptstreak-Timestamp
   - X-Promptstreak-Nonce
   - X-Promptstreak-Payload-Hash
   - X-Promptstreak-Signature
   - optional X-Promptstreak-Chain-Head
3. Canonical upload string must be:
   POST + "\n" +
   /api/upload + "\n" +
   timestamp + "\n" +
   nonce + "\n" +
   payloadHash
4. Use HMAC-SHA256 with the device secret.
5. Reject stale timestamps outside 5 minutes.
6. Reject replayed nonce per tokenId.
7. Store upload audit rows.
8. Add GitHub billing verification routes:
   - GET /api/verification/status
   - POST /api/verification/github/start
   - GET /api/verification/github/callback
   - POST /api/verification/github/refresh
   - DELETE /api/verification/github
9. Use GitHub App user access tokens, not classic PAT.
10. Request only Plan: read permission.
11. Fetch:
   GET https://api.github.com/users/{username}/settings/billing/premium_request/usage?year=YYYY&month=M
12. Aggregate verified premium requests by summing grossQuantity where:
   sku === "Copilot Premium Request" && unitType === "requests"
13. Use UTC period keys.
14. Compare local premium request count to GitHub verified count:
   0–2% HEALTHY
   >2–10% MINOR_MISMATCH
   >10–25% WARNING
   >25% MISMATCH
15. Add settings UI at /settings/verification.
16. Add narrow public badge:
   "GitHub-validated premium usage"
   Tooltip:
   "Monthly premium request total verified from GitHub billing. Repo attribution remains locally observed and is not confirmed by GitHub."
17. Do not label repo-level stats as verified.
18. Add unit and integration tests for all acceptance criteria.
```

---

## 22. Source Notes

This spec depends on GitHub’s current billing and Copilot documentation as of 2026-04-27.

Relevant GitHub docs:

- GitHub REST billing usage API: `https://docs.github.com/en/rest/billing/usage`
- GitHub Copilot premium request monitoring: `https://docs.github.com/en/copilot/how-tos/manage-and-track-spending/monitor-premium-requests`
- GitHub Copilot request behavior and SKU attribution: `https://docs.github.com/en/copilot/concepts/billing/copilot-requests`
- GitHub App user token refresh behavior: `https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens`

---

## 23. Final Product Recommendation

The correct product stance is:

> Promptstreak makes local AI usage stats more credible through signed uploads, anomaly detection, and narrow external verification where official APIs exist. For GitHub Copilot personal users, Promptstreak can verify the monthly premium request total from GitHub billing. Repo attribution, token counts, and local workspace mapping remain locally observed and should not be presented as GitHub-verified.

This gives Promptstreak a credible trust story while staying honest about the limits of a local-first architecture.
