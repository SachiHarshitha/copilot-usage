# promptstreak.dev Web App — Implementation Plan

> **Status (April 2026):** Phases 0–2 complete. Phase 3 (profile page UI, `/r/` route) in progress. Phase 4 (badge/card SVG) next. See [Section 10](#10-step-by-step-delivery-plan) for current status.

---

## 1. Product Goals

### What it is for
A **voluntary public layer** for coding-agent usage. Users who track any coding agent (GitHub Copilot, Claude Code, Codex CLI, Cursor, etc.) can log in with GitHub, push a normalized snapshot from the VS Code extension or CLI, and get a public profile page, embeddable README badges, and a community leaderboard on promptstreak.dev — all opt-in.

GitHub Copilot is the first supported adapter. The architecture is agent-agnostic by design.

### What it is not for
- Replacing the local tool. If a user never logs in, nothing changes.
- Billing or GitHub account management.
- Parsing VS Code JSONL files server-side. The server never touches raw session data.
- Real-time or streaming analytics. Snapshots are periodic pushes.

### Core User Journeys
1. **Share** — User installs CLI/extension, runs a sync, and gets a public profile URL to put in their README.
2. **Browse** — Anyone (no login) views the leaderboard or a public profile.
3. **Embed** — Paste a badge URL into a README; it renders with live stats.
4. **Control** — User hides/unpublishes repos, adjusts what is public, or deletes their account.

---

## 2. Feature Scope

### v1 — Copilot Adapter (largely complete)

| Feature | Status | Notes |
|---------|--------|-------|
| GitHub OAuth login | ✅ Done | Auth.js, `read:user` scope; dev-login supported via `ENABLE_DEV_LOGIN` |
| Upload API (v1) | ✅ Done | `POST /api/upload` — accepts `SnapshotPayload` from Copilot extension/CLI |
| Upload API (v2) | ✅ Done | Accepts `AgentSnapshot` envelope; v1 payloads auto-translated |
| Device linking | ✅ Done | Split-token device auth; `POST /api/connect`; CSRF-protected |
| Leaderboard | ✅ Done | `/leaderboard` — ranked by tokens or premium requests; 7d/30d/all-time |
| Settings | ✅ Done | Profile visibility, repo visibility, device management, account deletion |
| Streak tracking | ✅ Done | Current + best streaks (≥10K tokens/day threshold) |
| Public profile page | 🚧 In progress | `/u/[username]` — API route done; page component pending |
| Repo/project stats | 🚧 In progress | `/r/[username]/[repo]` pending |
| Badge/card endpoints | 📋 Next | `/badge/[username].svg` and `/card/[username].svg` — SVG generation pending |
| Repo identity control | ✅ Done (server) | Per-workspace: GitHub link / alias / redacted. Extension UI pending |

### v1.5 — Agent-Agnostic Foundation (infrastructure complete)

| Feature | Status | Notes |
|---------|--------|-------|
| `AgentSnapshot` schema | ✅ Done | Canonical v2 envelope in `packages/shared-schema` |
| Adapter-agnostic DB tables | ✅ Done | `AgentRun`, `ModelUsageDaily`, `ActionUsageDaily`, dimensional rollups |
| V1→V2 translation layer | ✅ Done | `upload-translate.ts` auto-converts legacy payloads |
| Canonical ingest pipeline | ✅ Done | `agent-ingest.ts` writes to v2 tables transactionally |
| ProductStat / ProviderStat / ModelStat rollups | ✅ Done | Computed on each upload |
| TrustLevel tracking | ✅ Done | `verified` / `observed` / `inferred` per model call |
| Multi-product leaderboard tabs | 📋 Future | UI for per-product/provider filtering |
| Claude Code adapter | 📋 Future | v1.5 milestone |

---

## 3. Non-Goals for v1

- **Team/org leaderboards** — involves GitHub org API scope, too much complexity
- **Real-time sync** — webhooks, websockets; snapshot push is enough
- **Historical trend charts on the web** — daily chart data is large; v1 shows totals only
- **Cross-user repo aggregation** — "how much Copilot was used on OSS repo X" — privacy nightmare, skip
- **Email notifications / digests**
- **Payments, subscriptions, tiers**
- **Social features** — follows, comments, reactions
- **Mobile app**
- **API keys for third parties**

---

## 4. Architecture

### Shape: Next.js monolith in `apps/web`

Everything lives in one Next.js app. API Routes (App Router) serve as the backend. No separate API server, no microservices.

```
Browser ──→ Next.js (App Router)
               ├─ /app/(pages)         React Server Components for all public pages
               ├─ /app/api/            Route Handlers for upload, auth, badges
               └─ Prisma → PostgreSQL  Single DB for everything
```

**Why no separate backend?** One developer, one database, modest traffic. When leaderboard reads need caching, add a server-side cache keyed per time-bucket — no extra deployment.

### Dual-track data model (v1 + v2 coexisting)

The upload pipeline writes two independent tracks in a single transaction:

```
POST /api/upload
  │
  ├─ detect payload version (v1 SnapshotPayload | v2 AgentSnapshot)
  ├─ v1: translateV1ToV2() → AgentSnapshot  (adapter: "github-copilot-vscode")
  │
  ├─ Track 1 — Legacy Copilot tables (backward compat)
  │   ├─ UPSERT UsageDaily[]     ← (userId, deviceId, date)
  │   ├─ UPSERT UserStat         ← recomputed SUM across all devices + streaks
  │   └─ UPSERT RepoStat[]       ← per repoIdentity
  │
  ├─ Track 2 — Agent-agnostic tables (additive)
  │   ├─ UPSERT AgentRun[]       ← (userId, adapter, runExternalId)
  │   ├─ UPSERT ModelUsageDaily[]← (userId, date, provider, product, surface, modelId)
  │   ├─ UPSERT ActionUsageDaily[]
  │   ├─ UPSERT ProductStat[]    ← per user+product
  │   ├─ UPSERT ProviderStat[]   ← per user+provider
  │   └─ UPSERT ModelStat[]      ← per user+model
  │
  └─ INSERT UploadLog            ← best-effort audit (outside transaction)
```

| Layer | Table(s) | Purpose |
|-------|----------|---------|
| **History (v1)** | `UsageDaily` | Date-range leaderboard filters, trend charts. One row per `(userId, deviceId, date)`. |
| **Rollup (v1)** | `UserStat`, `RepoStat` | Fast profile pages, leaderboard, badge SVG. Recomputed from facts on each sync. |
| **Facts (v2)** | `AgentRun`, `ModelUsageDaily`, `ActionUsageDaily` | Agent-agnostic raw events per session/day. Immutable facts. |
| **Rollup (v2)** | `ProductStat`, `ProviderStat`, `ModelStat` | Fast per-product/provider/model profile sections. |
| **Audit** | `UploadLog` | One row per sync attempt. IP hash, payload metadata. |

**Rollup strategy:** All rollup tables are recomputed from facts on each upload — never incremented. This makes retries idempotent and eliminates drift.

### `packages/shared-schema` — actual contents

```
packages/shared-schema/
  src/
    snapshot.ts        # Legacy v1 Zod schema — SnapshotPayload, DailyBucketSchema, RepoEntrySchema
    agent-snapshot.ts  # V2 Zod schema — AgentSnapshotSchema, AgentRun, AgentModelCall, AgentAction
    enums.ts           # TrustLevel, Surface, ActionType, RepoRefMode, KNOWN_PROVIDERS, KNOWN_PRODUCTS
    multipliers.ts     # MODEL_REGISTRY — canonical model records with provider/product/multiplier
    types.ts           # RepoRefPrefs — workspace-level repo identity preferences
    index.ts           # Re-exports all schemas and types
  package.json
  tsconfig.json
```

Both `apps/web` and `apps/vscode-extension` import from `@copilot-usage/shared-schema`. The Python CLI maintains its own schema copy.

### Adapter layer

Each agent integration wraps raw telemetry into the `AgentSnapshot` envelope:

- **`github-copilot-vscode`** — current VS Code extension (trust level: `observed`)
- Future: `claude-code-local`, `cursor-local`, `codex-cli-local`

The `upload-translate.ts` module handles v1→v2 translation server-side, so older extension versions continue to work without changes.

### How the VS Code Extension Sends Data

The extension gets a **short-lived upload token** from the web app after the user links their account once. Flow:

1. User clicks "Sync to promptstreak.dev" in the extension
2. Extension opens browser to `/connect?code=[random]` 
3. User logs in (GitHub OAuth), the web app ties `code` to their account and returns a **device token** (long-lived opaque random token stored in VS Code `SecretStorage`)
4. On each sync, extension calls `POST /api/upload` with Bearer device token + snapshot JSON
5. Web validates, stores, returns `{ ok: true }`

**No signed payloads needed** beyond the Bearer token. The server trusts the token, not the payload content. Data quality is the user's own problem — it's their stats.

### On Abuse / Replay
- Rate-limit uploads per device token (max 10/hour, 50/day via Redis or DB counter)
- Each upload has a `clientUploadedAt` timestamp; server rejects payloads more than 24h old
- Idempotency is natural: `UsageDaily` rows are upserted by `(userId, deviceId, date)` — retrying the same sync from the same device is a safe no-op, and multiple devices never collide

---

## 5. Data Model

The schema has two generations that coexist. V1 tables support the current Copilot adapter and leaderboard. V2 tables are the agent-agnostic foundation, populated in parallel on every upload.

### V1 — Copilot-optimized tables (active)

```prisma
model User {
  id            String    @id @default(cuid())
  githubId      Int       @unique
  username      String    @unique        // github login
  displayName   String?
  avatarUrl     String?
  profilePublic Boolean   @default(false)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  // relations: devices, usageDaily, uploadLogs, userStat, repoStats, agentRuns, ...
}

model Device {
  tokenId     String   @unique    // public prefix for fast lookup
  secretHash  String              // bcrypt(secret) — never stored plain
  revokedAt   DateTime?
  // split token: extension holds "tokenId.secret"
}

// One row per (userId, deviceId, date) — multi-device safe, idempotent upsert
model UsageDaily {
  // @@unique([userId, deviceId, date])
  // @@index([date, userId])  — date-first for leaderboard range scans
  totalRequests, promptTokens, outputTokens, totalTokens, premiumRequests
}

// Recomputed from UsageDaily SUM on each upload. Also holds streak and rolling window fields.
model UserStat {
  totalRequests, promptTokens, outputTokens, totalTokens, premiumRequests
  workspaceCount, sessionCount, topModel
  currentStreak, bestStreak        // contiguous days ≥ 10,000 tokens
  tokens30d, tokens7d              // rolling windows
  lastSyncedAt
}

// Per user+repoIdentity rollup. Key: "github:owner/repo" or "alias:My Project"
model RepoStat {
  // @@unique([userId, repoIdentity])
  repoIdentity, displayMode, githubRepo, aliasLabel, isPublic
  requests, promptTokens, outputTokens, totalTokens, premiumReqs, topModel
}

model UploadLog {
  // best-effort audit: ipHash, payloadBytes, bucketCount, earliestDate, latestDate, accepted
}
```

### V2 — Agent-agnostic tables (additive, populated in parallel)

```prisma
// Registry of known adapter capabilities
model AgentAdapter {
  adapterId    String  @id  // "github-copilot-vscode"
  provider, product, surface
  supportsTokens, supportsCosts, supportsRunIds
  supportsRepoAttribution, supportsToolActions, supportsVerifiedProviderData
}

// One row per normalized session/run
model AgentRun {
  // @@unique([userId, adapterId, runExternalId])
  userId, deviceId, adapterId
  provider, product, surface
  startedAt?, endedAt?, repoIdentity, trustLevel
}

// Daily aggregation by all dimensions
model ModelUsageDaily {
  // @@unique([userId, deviceId, date, provider, product, surface, modelId, repoIdentity])
  requestCount, inputTokens, outputTokens, totalTokens
  costMicros, cacheReadTokens, cacheWriteTokens, trustLevel
}

model ActionUsageDaily {
  // @@unique([userId, deviceId, date, provider, product, surface, repoIdentity, actionType])
  count, filesTouched
}

// Fast rollup tables — recomputed on each upload from ModelUsageDaily facts
model ProductStat  { // @@unique([userId, product]);   totalTokens, requestCount, lastSyncedAt }
model ProviderStat { // @@unique([userId, provider]);  totalTokens, requestCount, lastSyncedAt }
model ModelStat    { // @@unique([userId, modelId]);   totalTokens, requestCount, lastSyncedAt }
```

**No `BadgeConfig` table.** Badge appearance is derived from public stats on demand.

---

## 6. API Design

### Auth
| Endpoint | Status | Purpose |
|----------|--------|---------|
| `GET /api/auth/[...nextauth]` | ✅ | Auth.js catch-all — GitHub OAuth + dev credentials |
| `POST /api/connect` | ✅ | Device linking — validates code, issues split token, returns `{ token }` |
| `DELETE /api/devices/[id]` | ✅ | Revoke a device token (sets `revokedAt`) |

### Upload
| Endpoint | Status | Purpose |
|----------|--------|---------|
| `POST /api/upload` | ✅ | Authenticated upload. Detects v1/v2 payload. v1 auto-translated to `AgentSnapshot`. Single transaction writes both v1 and v2 tables. DB-based rate limiting (device: 10/hr, 50/day; user: 60/hr, 240/day; IP: 120/hr, 400/day). Returns `{ ok, logId }`. |

### Profile & Leaderboard
| Endpoint | Status | Purpose |
|----------|--------|---------|
| `GET /api/profile/[username]` | ✅ | `UserStat` + public `RepoStat[]` — only if `profilePublic = true` |
| `GET /api/leaderboard` | ✅ | All-time: `UserStat` indexed scan. Date-filtered: `UsageDaily WHERE date >= ?` with `(date, userId)` index. |
| `GET /api/leaderboard/repos` | ✅ | Repo-level leaderboard from public `RepoStat` rows |
| `GET /api/repo/[username]/[...repo]` | 📋 | Pending — individual repo stat page |

### Badges/Cards
| Endpoint | Status | Purpose |
|----------|--------|---------|
| `GET /badge/[username].svg` | 📋 Next | Shields.io-style SVG. `?stat=tokens\|requests\|premium\|top-model\|top-product`. `Cache-Control: public, max-age=3600`. |
| `GET /card/[username].svg` | 📋 Next | Wider stat card SVG. `Cache-Control: public, max-age=3600`. |

### Settings & Actions
| Endpoint | Status | Purpose |
|----------|--------|---------|
| `GET /api/settings/profile` | ✅ | Return current profile settings |
| `PATCH /api/settings/profile` | ✅ | Toggle `profilePublic`, update `displayName` |
| `PATCH /api/settings/repos` | ✅ | Bulk update `isPublic` per `repoIdentity` |
| `DELETE /api/account` | ✅ | Hard delete — wipes `User` + all cascades |

---

## 7. Sync and Trust Model

### What IS uploaded

The server accepts two payload versions:

**V1 — `SnapshotPayload`** (legacy, from Copilot extension/CLI):
```ts
{
  clientUploadedAt: string,          // ISO timestamp
  workspaceCount: number,
  sessionCount: number,
  dailyBuckets: [{
    date: string,                    // "YYYY-MM-DD"
    requests: number,
    promptTokens: number,
    outputTokens: number,
    premiumRequests: number,
  }],
  repos: [{
    // Raw workspace source key — VS Code storage hash. Sent for server-side audit/logging only.
    // NOT used as the rollup key. The server derives rollup identity from displayMode+githubRepo/aliasLabel.
    workspaceKey: string,
    // How the user wants this repo displayed.
    // 'redacted' entries are EXCLUDED from this array entirely —
    // their token counts still roll into the top-level totals.
    displayMode: 'github' | 'alias',
    githubRepo: string | null,       // "owner/repo" — present when displayMode = 'github'
    aliasLabel: string | null,       // custom label — present when displayMode = 'alias'
    requests: number,
    promptTokens: number,
    outputTokens: number,
    premiumRequests: number,
    topModel: string,
  }],
  modelBreakdown: [{
    modelId: string,
    requests: number,
    totalTokens: number,
  }],
}
```

V1 payloads are auto-translated to `AgentSnapshot` via `upload-translate.ts` with adapter `"github-copilot-vscode"`.

**V2 — `AgentSnapshot`** (canonical, adapter-agnostic):
```ts
{
  schemaVersion: 2,
  clientUploadedAt: string,
  source: {
    adapter: string,           // "github-copilot-vscode" | "claude-code" | ...
    adapterVersion: string,
    provider: string,          // "github" | "anthropic" | "openai" | ...
    product: string,           // "copilot" | "claude-code" | ...
    surface: string,           // "vscode" | "terminal" | "browser" | ...
    capabilities: { supportsTokens, supportsCosts, supportsRunIds, ... }
  },
  deviceId: string,
  runs: [{
    runId: string,
    startedAt?, endedAt?,
    workspaceKey?,
    repoRef?: { mode: "github" | "alias" | "redacted", ... },
    modelCalls: [{ modelId, inputTokens, outputTokens, requestCount, costMicros, sourceOfTruth }],
    actions: [{ type, count, filesTouched }],
    dailyBuckets?: [{ date, modelId, inputTokens, outputTokens, requestCount }]
  }]
}
```

### Repo identity — how the server builds the rollup key
The server derives a `repoIdentity` string from each entry in `repos[]`:
- `displayMode = 'github'` → `repoIdentity = "github:" + githubRepo` (e.g. `"github:owner/repo"`)
- `displayMode = 'alias'` → `repoIdentity = "alias:" + aliasLabel` (e.g. `"alias:My Side Project"`)
- `displayMode = 'redacted'` → excluded from `repos[]` entirely; stats roll into top-level totals only

Upsert `RepoStat` by `(userId, repoIdentity)`. If the same user has two workspaces on two devices both mapped to `github:owner/repo`, they merge into one public `RepoStat` row. Last sync wins for the total stats (all repo entries are cumulative from each device's local DB).

### Repo identity — how the extension builds the payload
For each tracked workspace before upload:
1. Run `git -C <workspacePath> remote get-url origin` to detect a GitHub remote.
2. Normalize to `owner/repo` (handles both HTTPS and SSH remotes). Cache the result in `globalState`.
3. Check the user's saved `RepoRefPrefs` (keyed by workspace path):
   - If a preference exists → use it directly (no prompt).
   - If no preference exists and a GitHub remote was detected → show a one-time modal:  
     *"We detected `owner/repo` — how should this appear on your public profile? [Link to GitHub repo] [Use a custom alias] [Keep private]"*
   - If no preference exists and no GitHub remote → modal asks for alias or private only.
4. Redacted workspaces are omitted from `repos[]` entirely. Their stats are only in top-level totals.

```typescript
// Persisted in VS Code globalState
type RepoRefPrefs = Record<string, {   // key = workspaceId (the hex hash from discovery.ts)
  mode: 'github' | 'alias' | 'redacted';
  value: string;   // "owner/repo" or alias text; empty string for redacted
  detectedRemote?: string;  // cached so we can warn if the remote changes
}>;
```

The extension uses `workspaceId` as the `RepoRefPrefs` key (not `workspacePath`) so It survives workspace moves on disk.

### What is NEVER uploaded by default
- Full workspace paths (the `workspaceKey` is the VS Code workspace storage hash — an opaque hex ID with no path content, the same value `discovery.ts` already uses as `workspaceId`)
- Any repo identity information without explicit user consent (the confirmation modal gating every new workspace)
- Chat session IDs
- Request IDs
- Raw JSONL content
- File paths on disk
- Timestamps of individual requests
- Session content or code snippets (there are none in the local data, but worth stating)

### Abuse / Spam prevention
- Rate limit: 10 uploads/hour, 50/day per device token. Return 429 with retry-after.
- Payload size limit: 64KB max. Any larger and the user has >10,000 repos listed, which is clearly wrong.
- IP hashing in `UploadLog` for investigation without storing raw IPs.
- Numbers must be non-negative integers. Zod validates this at schema level.
- `workspaceKey` must be a hex string matching `^[0-9a-f]{32}$` (the VS Code storage directory name format). Validated in Zod — server rejects any other format.
- `githubRepo` when present must match `^[^/]+\/[^/]+$`. Server optionally spot-checks against the GitHub API that the authenticated user is a contributor (future phase; not v1).

### Idempotency and replay protection
`clientUploadedAt` is the wall-clock time the upload was initiated. Server rejects if `clientUploadedAt` is > 24h in the past or > 5 min in the future. Zod validates this.

Upload retries are safe by design: `UsageDaily` rows are upserted by `(userId, deviceId, date)` — sending the same daily buckets from the same device twice is a no-op. Separate devices upsert separate rows and both contribute to `UserStat`.

Each `date` in `dailyBuckets` must be ≤ `clientUploadedAt` (can't report future usage). Zod validates this per bucket.

### Trust levels
Every model call record stores a `sourceOfTruth` / trust level:
- `"verified"` — provider-confirmed billing/metrics data
- `"observed"` — local client directly observed requests
- `"inferred"` — estimated from partial data or heuristics

Current Copilot adapter trust level: `"observed"`. The leaderboard footer states: *"Stats are self-reported estimates from local session data."* No verification badge in v1.

---

## 8. Page Structure

### `/` — Landing
- Hero: "Track your Copilot usage. Share it on promptstreak.dev. Embed it in your README."
- Two CTAs: "Connect VS Code" and "View Leaderboard"
- 3 feature bullets
- Example badge/card preview
- Static page, no auth required

### `/leaderboard` — Leaderboard  
- Table: rank, avatar, username, total tokens, premium requests, top model, workspace count
- Sort toggle: by tokens vs by premium requests
- Date filter: all-time (reads `UserStat`) / last 30 days / last 7 days (aggregates `UsageDaily WHERE date >= ?` using event dates — cached result, not computed inline per request)
- Paginated, 25 per page
- Public only; no auth required

### `/u/[username]` — User Profile
- Header: GitHub avatar, username, "joined" date, last synced
- KPI row: total tokens, premium requests, workspaces, sessions
- Model breakdown table
- Public repos table (if any repos published)
- Embeddable badge/card with copy button
- If `profilePublic = false`: 404

### `/r/[username]/[...repo]` — Repo/Project Page
- Header: repo name (last 2 path segments), owner username
- KPI row: requests, prompt tokens, output tokens, premium requests
- Top model
- "View profile" link back to user
- If `isPublic = false` on that RepoStat: 404

### `/settings` — Settings (auth required)
- **Account**: display name, delete account
- **Privacy**: toggle profile public/private; table of repos with public/private toggle per row
- **Repo identity**: table of all tracked workspaces showing their current display mode (GitHub link / alias / redacted) with an edit button per row. Shows the auto-detected remote (if any) alongside the user's current choice. Allows changing mode at any time — takes effect on the next upload.
- **Devices**: list of linked devices with revoke button
- **Badge**: live preview + copy-paste snippets for Markdown and HTML

### `/connect` — Device Linking (auth required)
- Confirms the device code, issues device token
- Shows instructions for using it in VS Code

---

## 9. Folder Structure

```
apps/web/
├── src/
│   ├── app/
│   │   ├── page.tsx                        # Landing ✅
│   │   ├── leaderboard/page.tsx            # Leaderboard ✅
│   │   ├── settings/page.tsx               # Settings ✅
│   │   ├── connect/page.tsx                # Device linking ✅
│   │   ├── u/[username]/page.tsx           # Profile 🚧
│   │   ├── r/[username]/[...repo]/         # Repo page 📋
│   │   ├── badge/[username]/route.ts       # SVG badge 📋
│   │   ├── card/[username]/route.ts        # SVG card 📋
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/route.ts # ✅
│   │   │   ├── upload/route.ts             # ✅ v1+v2
│   │   │   ├── connect/route.ts            # ✅
│   │   │   ├── leaderboard/route.ts        # ✅
│   │   │   ├── leaderboard/repos/route.ts  # ✅
│   │   │   ├── profile/[username]/route.ts # ✅
│   │   │   ├── settings/profile/route.ts   # ✅
│   │   │   ├── settings/repos/route.ts     # ✅
│   │   │   ├── devices/[id]/route.ts       # ✅
│   │   │   └── account/route.ts            # ✅
│   │   ├── layout.tsx
│   │   ├── globals.css
│   │   └── components/
│   └── lib/
│       ├── auth.ts                         # Auth.js config (GitHub OAuth + dev login)
│       ├── auth-policy.ts                  # Dev login gating, dev account config
│       ├── db.ts                           # Prisma singleton
│       ├── ratelimit.ts                    # DB-based rate limiter (device/user/IP)
│       ├── agent-ingest.ts                 # V2 canonical ingest: aggregateCanonical + writeCanonical
│       ├── upload-translate.ts             # V1→V2 translation (detectPayloadVersion, translateV1ToV2)
│       ├── streak.ts                       # Streak computation (current + best)
│       ├── connect-policy.ts               # Device code validation, CSRF origin check
│       └── profile-policy.ts               # canViewProfile
├── prisma/
│   ├── schema.prisma                       # Full v1+v2 schema
│   ├── seed.ts
│   └── migrations/
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.ts
└── .env.example

packages/shared-schema/
├── src/
│   ├── snapshot.ts        # V1 Zod schemas
│   ├── agent-snapshot.ts  # V2 AgentSnapshot Zod schema
│   ├── enums.ts           # TrustLevel, Surface, ActionType, KNOWN_PROVIDERS, KNOWN_PRODUCTS
│   ├── multipliers.ts     # MODEL_REGISTRY with getMultiplier, lookupModel
│   ├── types.ts           # RepoRefPrefs
│   └── index.ts
└── package.json
```

---

## 10. Step-by-Step Delivery Plan

### Phase 0 — Project Setup ✅ COMPLETE
- Next.js 15 App Router, Tailwind, TypeScript
- `packages/shared-schema` with V1 + V2 Zod schemas, `MODEL_REGISTRY`, enums, `RepoRefPrefs`
- Prisma schema with V1 + V2 tables, initial migrations run
- `.env.example` with all required vars

### Phase 1 — Auth + Database ✅ COMPLETE
- Auth.js with GitHub OAuth provider; dev credentials provider (gated by `ENABLE_DEV_LOGIN=true` + `NODE_ENV=development`)
- Session enriched with `userId`, `username`, `displayName`, `avatarUrl`
- Split device token flow: `POST /api/connect` validates code, issues `tokenId.secret`, stores `bcrypt(secret)` in DB
- Device list + revoke in settings
- `auth-policy.ts` for dev login gating; `connect-policy.ts` for CSRF + code validation

### Phase 2 — Upload API + Schema Validation ✅ COMPLETE
- `POST /api/upload`: detects v1/v2, translates v1 via `upload-translate.ts`, validates with Zod
- Three-dimensional DB-based rate limiting (device / user / IP)
- Single Prisma transaction: v1 tables + v2 canonical tables via `agent-ingest.ts`
- Streak computation via `streak.ts` (current + best, 10K token threshold)
- `UploadLog` written outside transaction (best-effort)

### Phase 3 — Public Profile + Leaderboard 🚧 IN PROGRESS
- ✅ Leaderboard page + `/api/leaderboard` (all-time + 7d/30d, tokens + premium sort)
- ✅ `/api/leaderboard/repos` repo-level leaderboard
- ✅ Settings: profile visibility, repo visibility, device management
- ✅ `/api/profile/[username]` API route
- 🚧 `/u/[username]` profile page component (directory exists, page pending)
- 📋 `/r/[username]/[...repo]` repo detail page
- 📋 Repo identity settings table (workspace → display mode mapping)

### Phase 4 — Badges / Cards 📋 NEXT
- `GET /badge/[username].svg` — Shields.io-style; `?stat=tokens|requests|premium|top-model|top-product|top-provider`
- `GET /card/[username].svg` — wider stat card with 3–4 KPIs
- Both: `Cache-Control: public, max-age=3600, stale-while-revalidate=86400`
- Settings page badge section: live preview + Markdown/HTML copy snippets

### Phase 5 — VS Code Extension Sync Command 📋
- `RepoRefPrefs` store in `globalState` (keyed by `workspaceId`)
- Per-workspace GitHub remote detection + first-upload confirmation modal
- `computeDailyStats()` → `AgentSnapshot` build → `POST /api/upload` via `SecretStorage` token
- `vscode://` URI handler for seamless device-link redirect

### Phase 6 — Polish + Production Readiness 📋
- Landing page OG image, final copy: *"Track your coding-agent usage across Copilot, Claude Code, and more"*
- `reportedAt` flag on `User` for basic moderation
- DB indexes audit: `UserStat(totalTokens DESC)`, `(date, userId)` on `UsageDaily`
- GitHub Actions CI: `tsc --noEmit`, lint, `prisma validate` on push to `main`
- Set up Vercel deployment (see Section 12)

---

## 11. Risks and Open Questions

| Risk | Severity | Mitigation |
|------|----------|-----------|
| **Rollup drift** | Low | If `UsageDaily` upserts succeed but `UserStat` recompute fails mid-transaction, rollup will be stale. Mitigation: all three writes in `prisma.$transaction([...])` — they commit or roll back together. `UploadLog` is outside (best-effort). An admin endpoint `POST /api/admin/recompute` can rebuild `UserStat` from `UsageDaily` at any time. |
| **Data inflation / gaming** | Medium | All-time stat inflation is obvious to viewers. The disclaimer handles it. Don't add server-side verification until you have evidence of systematic abuse. |
| **Workspace path leakage** | Low | `workspaceKey` is the VS Code workspace storage hash (`WorkspaceInfo.workspaceId`) — an opaque hex string with no path content. `githubRepo` and `aliasLabel` are explicitly user-confirmed per workspace before first upload. Zod enforces `^[0-9a-f]{32}$` on `workspaceKey` server-side. |
| **Cold start / empty leaderboard** | High | Solve by dogfooding: publish your own stats on day 1 and add it to the README as a live example. |
| **Token model** | Low | Use a split device token: `tokenId.secret`. `tokenId` is stored in plain text for fast `Device` row lookup; `secretHash = bcrypt(secret)` is stored for verification. No JWT, no expiry. Revocation is updating `revokedAt` on the `Device` row. |
| **Vercel free tier + Postgres size** | Low | Neon or Supabase free tier is fine for months. The schema is narrow and snapshots are small. |
| **VS Code extension sync complexity** | Medium | The sync command adds the device-link flow and the per-workspace repo-identity confirmation modal. Budget extra time for Phase 1/2. |
| **Next.js App Router RSC + Auth.js complexity** | Medium | Don't overthink this. Use the basic Auth.js `getServerSession` pattern everywhere. Don't try to use RSC streaming for auth-gated routes. |
| **Model multipliers drift** | Medium | `shared-schema` owns `MODEL_REGISTRY` — update one place, both extension and web stay in sync. |
| **V1/V2 rollup drift** | Low | Both tracks write in the same Prisma transaction. If either fails, both roll back. An admin recompute endpoint can rebuild rollups from facts at any time. |
| **Adapter trust inflation** | Low | Every model call records `sourceOfTruth`. UI can show "observed" vs "inferred" so viewers understand reliability. |

---

## 12. Deployment

### Infrastructure

| Service | Purpose | Recommended option |
|---------|---------|-------------------|
| **Next.js hosting** | App server + API routes | Vercel (free tier sufficient to start) |
| **PostgreSQL** | Primary database | Neon (free tier: 512MB, auto-suspend) or Supabase |
| **GitHub OAuth App** | User authentication | Register at github.com/settings/developers |

No Redis or queue service required — rate limiting and leaderboard are DB-based.

### Environment Variables

```env
# Database (required)
DATABASE_URL=postgresql://user:pass@host:5432/promptstreak?sslmode=require

# Auth.js (required)
NEXTAUTH_SECRET=<random 32+ byte secret>
NEXTAUTH_URL=https://promptstreak.dev          # exact production URL, no trailing slash

# GitHub OAuth (required in production)
GITHUB_CLIENT_ID=<GitHub OAuth App client ID>
GITHUB_CLIENT_SECRET=<GitHub OAuth App client secret>

# Dev-only (never set in production)
ENABLE_DEV_LOGIN=false
ENABLE_DEV_TEST_ACCOUNT=false
DEV_TEST_ACCOUNT_USERNAME=
DEV_TEST_ACCOUNT_GITHUB_ID=
```

### GitHub OAuth App Setup

1. Go to **github.com/settings/developers** → OAuth Apps → New OAuth App
2. **Application name**: `promptstreak.dev`
3. **Homepage URL**: `https://promptstreak.dev`
4. **Authorization callback URL**: `https://promptstreak.dev/api/auth/callback/github`
5. Copy `Client ID` and generate a `Client Secret` → set as env vars

For local dev: create a second OAuth App with callback `http://localhost:3000/api/auth/callback/github`.

### Vercel Setup

This is a pnpm monorepo. Vercel needs to build from the repo root so workspace package resolution works.

**Recommended Vercel project settings:**
1. Import repository at vercel.com
2. Leave **Root Directory** empty (repo root)
3. Set **Framework Preset** to `Next.js`
4. Set **Install Command** to `pnpm install --frozen-lockfile`
5. Set **Build Command** to `pnpm --filter @promptstreak/web build`
6. Set **Output Directory** to `apps/web/.next`

> **Why root directory?** Setting root to `apps/web` breaks resolution of `packages/shared-schema` since pnpm workspace links are relative to the repo root.

Add `postinstall` to `apps/web/package.json` so Prisma client generates in the Vercel build environment:
```json
{
  "scripts": {
    "postinstall": "prisma generate"
  }
}
```

### Prisma Migrations

Vercel does not run migrations automatically. Run before each deployment:

```bash
# From repo root
pnpm db:migrate    # runs prisma migrate deploy in apps/web
```

Or add a pre-deploy CI step:
```yaml
- name: Run migrations
  run: pnpm --filter @promptstreak/web exec prisma migrate deploy
  env:
    DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

### Neon Database Setup

1. Create a project at **neon.tech**
2. Use the **pooled connection string** (pgbouncer, port 5432) for `DATABASE_URL`
3. Set `DATABASE_URL` in Vercel environment variables (Production + Preview)
4. Run initial migration: `DATABASE_URL=<neon-url> pnpm --filter @promptstreak/web exec prisma migrate deploy`

Neon free tier: 512MB storage, auto-suspends after 5 min inactivity (cold start ~1s — acceptable).

### Pre-Launch Checklist

- [ ] `NEXTAUTH_URL` matches exact production domain (no trailing slash)
- [ ] GitHub OAuth callback URL matches `NEXTAUTH_URL/api/auth/callback/github`
- [ ] `NEXTAUTH_SECRET` is a unique random value (not the dev placeholder)
- [ ] `ENABLE_DEV_LOGIN` is `false` or unset in production
- [ ] `DATABASE_URL` uses SSL (`?sslmode=require` for Neon)
- [ ] Prisma migrations applied to production DB before first deploy
- [ ] `postinstall: prisma generate` in `apps/web/package.json`
- [ ] Vercel build command targets `apps/web` via workspace filter
- [ ] `robots.txt` deployed (disallows `/api/*`, `/settings`)
- [ ] Leaderboard disclaimer visible: *"Stats are self-reported estimates from local session data. Not affiliated with GitHub or Microsoft."*
- [ ] Dogfood: publish your own stats on day 1

### Open Questions to Decide Before Coding
1. **Domain name** — `promptstreak.dev`.
2. **Device token UX** — Browser redirect back to VS Code via `vscode://` URI scheme vs manual paste? URI scheme is slicker but requires registering a URI handler in the extension's package.json.
3. **`last 30 days` leaderboard filter** — Based on event dates (when the Copilot requests happened), not upload dates. `UsageDaily.date` is always the event date. This is what the `(date, userId)` index is designed for.
4. **Public by default?** — I recommend private by default (toggle to publish). Opt-in is safer for trust and GDPR-adjacent concerns.

---

**My top 3 recommendations before writing a line of code:**

1. Stand up `packages/shared-schema` first. It's the contract everything else depends on.
2. Build Phase 2 (upload API) before building the UI. Test it with curl before touching the extension. Don't let UI work block the trust-critical path.
3. All-time leaderboard reads from `UserStat(totalTokens)` — one indexed scan. Date-range leaderboards use `UsageDaily WHERE date >= ? GROUP BY userId` with a `(date, userId)` index so the scan is bounded by the date window, not the full table. Cache the result per time-bucket (e.g. a 10-min server-side cache keyed by `sort+since`).