# promptstreak.dev Web App — Implementation Plan

---

## 1. Product Goals

### What it is for
A **voluntary public layer** on top of the local-first product. Users who want to share their Copilot usage stats can log in with GitHub, push a snapshot from the VS Code extension or CLI, and get a public profile page, embeddable README badges, and a community leaderboard on promptstreak.dev — all opt-in.

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

## 2. v1 Feature Scope

| Feature | Notes |
|---------|-------|
| GitHub OAuth login | Auth.js, read-only GitHub scope (`read:user`) |
| Public profile page | `/u/[username]` — token totals, model breakdown, top repos |
| Leaderboard | `/leaderboard` — all public users ranked by total tokens or premium requests; date-filterable |
| Repo/project stats | Attached to each profile; top 5 repos by tokens, with per-repo public page at `/r/[username]/[repo]` |
| Badge/card endpoints | `/badge/[username].svg` and `/card/[username].svg` — Shields.io-compatible SVG responses |
| Upload API | `POST /api/upload` — authenticated JSON snapshot from extension/CLI, rate-limited, schema-validated |
| Privacy controls | Per-repo visibility toggle (public/hidden), global profile visibility (public/private), delete account |
| Publish/unpublish | Snapshots are always ingested privately; user explicitly publishes. Default = private |
| Repo identity control | Per-workspace choice: link to a GitHub repo (`owner/repo`), show a custom alias, or redact entirely. Auto-detected from git remote; user confirms before first upload. |

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

## 4. Recommended Architecture

### Shape: Next.js monolith in `apps/web`

Everything lives in one Next.js app. API Routes (or Route Handlers in App Router) serve as the backend. No separate API server, no microservices. This is the right call for a solo developer.

```
Browser ──→ Next.js (App Router)
               ├─ /app/(pages)         React Server Components for all public pages
               ├─ /app/api/            Route Handlers for upload, auth, badges
               └─ Prisma → PostgreSQL  Single DB for everything
```

**Why no separate backend?** You have one developer, one database, and modest traffic. A separate Express/FastAPI backend doubles infrastructure with zero benefit at this scale. When you need to scale reads (leaderboard), add a Redis cache in front of the leaderboard query — still one deployment.

### Two-layer data model

The database uses two distinct layers that are always written in the **same DB transaction**:

```
Upload write
  ├─ UPSERT UsageDaily[]  ← one row per (userId, deviceId, date); cross-device safe
  ├─ UPSERT UserStat      ← recomputed as SUM of all UsageDaily for this user (across all devices)
  ├─ UPSERT RepoStat[]    ← denormalized rollup per public repo identity
  └─ INSERT UploadLog     ← audit record (outside transaction, best-effort)
```

| Layer | Table(s) | Purpose |
|-------|----------|---------|
| **History** | `UsageDaily` | Powers real date-range filters and future trend charts. One row per `(userId, deviceId, date)` — multi-device safe. Upserted on each sync. |
| **Rollup** | `UserStat`, `RepoStat` | Powers fast profile pages, leaderboard, badge SVG. One row per user / per user+workspace — recomputed from `UsageDaily` on each sync; never aggregated at query time. |
| **Audit** | `UploadLog` | One row per sync attempt. Records device, timestamp, IP hash, bucket count. Never queried for stats. |

**Why real tables, not views or materialized views?** PostgreSQL materialized views don't auto-refresh on write — they need `REFRESH MATERIALIZED VIEW CONCURRENTLY` on a schedule. A regular view computing `SUM` across uploads is too slow for leaderboard queries at scale. Application-level upserts in the same transaction are simpler, consistent, and require no background jobs.

### Interaction with `packages/shared-schema`

Create `packages/shared-schema` as a TypeScript package containing:
- `SnapshotPayload` Zod schema (the upload contract)
- `MODEL_MULTIPLIERS` constant (single source of truth, shared by extension + web)
- TypeScript types generated from the schema

Both `apps/web` and vscode-extension import from `packages/shared-schema`. The CLI (cli) keeps its own Python copy for now; generate from the same schema JSON if divergence becomes a problem.

```
packages/shared-schema/
  src/
    snapshot.ts         # Zod schema for upload payload
    multipliers.ts      # Model multiplier table
    types.ts            # Inferred TypeScript types
  package.json
  tsconfig.json
```

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

```prisma
model User {
  id            String    @id @default(cuid())
  githubId      Int       @unique
  username      String    @unique        // github login
  displayName   String?
  avatarUrl     String?
  profilePublic Boolean   @default(false) // opt-in
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  devices       Device[]
  usageDaily    UsageDaily[]
  uploadLogs    UploadLog[]
  userStat      UserStat?
  repoStats     RepoStat[]
}

// A linked VS Code / CLI installation
model Device {
  id          String   @id @default(cuid())
  userId      String
  name        String?                     // e.g. "Work MacBook"
  // Split token: extension stores the raw token as "tokenId.secret".
  // Server fetches by tokenId (fast indexed lookup), then verifies bcrypt(secret) == secretHash.
  tokenId     String   @unique            // public prefix — used to find the Device row quickly
  secretHash  String                      // bcrypt hash of the secret suffix — never stored in plain text
  lastSeenAt  DateTime?
  revokedAt   DateTime?
  createdAt   DateTime @default(now())

  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

// One row per (userId, deviceId, date) — device-aware; multiple devices can sync independently without collision.
// Upserted on each sync. Retrying a sync from the same device is a safe no-op.
// UserStat is recomputed as the SUM across ALL devices for this user.
model UsageDaily {
  id              String   @id @default(cuid())
  userId          String
  deviceId        String                      // which device this bucket came from
  date            DateTime @db.Date           // calendar date these stats cover (event date, not upload date)
  totalRequests   Int      @default(0)
  promptTokens    BigInt   @default(0)
  outputTokens    BigInt   @default(0)
  totalTokens     BigInt   @default(0)        // promptTokens + outputTokens; denormalized for fast sort/index
  premiumRequests Float    @default(0)

  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([userId, deviceId, date])
  @@index([date, userId])                    // date-first: fast cross-user range scans for date-filtered leaderboard
}

// Audit log of each sync attempt — written outside the main transaction (best-effort).
model UploadLog {
  id           String   @id @default(cuid())
  userId       String
  deviceId     String
  uploadedAt   DateTime @default(now())
  ipHash       String               // SHA-256 of IP, never raw
  payloadBytes Int
  bucketCount  Int                  // number of UsageDaily upserts in this sync
  earliestDate DateTime?            // earliest date bucket
  latestDate   DateTime?            // latest date bucket
  accepted     Boolean

  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

// Denormalized rollup per user — one row per user, recomputed from UsageDaily on each sync.
// Powers leaderboard, profile KPIs, and badge SVG. Never aggregated at query time.
model UserStat {
  userId          String   @id
  totalRequests   Int      @default(0)
  promptTokens    BigInt   @default(0)
  outputTokens    BigInt   @default(0)
  totalTokens     BigInt   @default(0)        // promptTokens + outputTokens; indexed for leaderboard sort
  premiumRequests Float    @default(0)
  workspaceCount  Int      @default(0)
  sessionCount    Int      @default(0)
  topModel        String?
  lastSyncedAt    DateTime @default(now())

  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

// Denormalized rollup per public repo identity — keyed by the user-approved display name, not the raw workspace source.
// Multiple workspaces (or the same workspace from multiple devices) pointing to the same
// GitHub repo or alias collapse into a single row here.
// Last upload wins for stats (all totals are cumulative from the device's local DB).
model RepoStat {
  id            String       @id @default(cuid())
  userId        String
  // Normalized public identity — the rollup key.
  // Format: "github:owner/repo" or "alias:My Project"
  // Derived server-side from displayMode + githubRepo/aliasLabel in the upload payload.
  repoIdentity  String
  displayMode   String                    // "github" | "alias"
  githubRepo    String?                   // "owner/repo" — when displayMode = 'github'
  aliasLabel    String?                   // when displayMode = 'alias'
  isPublic      Boolean      @default(false)
  requests      Int          @default(0)
  promptTokens  BigInt       @default(0)
  outputTokens  BigInt       @default(0)
  totalTokens   BigInt       @default(0)  // promptTokens + outputTokens; denormalized for sorting
  premiumReqs   Float        @default(0)
  topModel      String?
  lastSyncedAt  DateTime     @default(now())

  user          User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([userId, repoIdentity])
}
```

**Intentional omissions**: No `BadgeConfig` table in v1. Badge appearance is derived from the user's public stats on demand; no user-customisable badge config needed until there is demand.

---

## 6. API Design

### Auth
| Endpoint | Purpose |
|----------|---------|
| `GET /api/auth/[...nextauth]` | Auth.js catch-all — GitHub OAuth |
| `GET /api/connect?code=X` | Device linking — exchange a one-time code for a device token |
| `DELETE /api/devices/[id]` | Revoke a device token |

### Upload
| Endpoint | Purpose |
|----------|---------|
| `POST /api/upload` | Authenticated upload. Validates payload with Zod schema from `shared-schema`. In a single transaction: UPSERTs `UsageDaily[]` by `(userId, deviceId, date)`, recomputes and UPSERTs `UserStat` (SUM of all `UsageDaily` across all devices), UPSERTs `RepoStat[]` by `(userId, repoIdentity)`. Writes `UploadLog` outside the transaction (best-effort). Rate-limited. Returns `{ ok, logId }` |

### Profile & Leaderboard
| Endpoint | Purpose |
|----------|---------|
| `GET /api/profile/[username]` | Reads from `UserStat` + public `RepoStat` rows — only if `profilePublic = true` |
| `GET /api/leaderboard` | Reads from `UserStat` JOIN `User` for all-time view — one indexed read, no aggregation. Date-filtered views (`since=7d`/`30d`) aggregate `UsageDaily WHERE date >= ? GROUP BY userId` — `date` is the event date, not the upload date. Uses the `(date, userId)` index so the scan is bounded by the date range across all users. Cached or precomputed; not inline on each page request. |
| `GET /api/repo/[username]/[...repo]` | Public repo stats for one repo — only if `RepoStat.isPublic = true` |

### Badges/Cards
| Endpoint | Purpose |
|----------|---------|
| `GET /badge/[username].svg` | Shields.io-style SVG. Query params: `label`, `stat` (tokens/requests/premium). Cache-Control 1h |
| `GET /card/[username].svg` | Larger stat card SVG for embedding in READMEs. Cache-Control 1h |

### Settings & Actions
| Endpoint | Purpose |
|----------|---------|
| `PATCH /api/settings/profile` | Toggle `profilePublic`, update display name |
| `PATCH /api/settings/repos` | Bulk update `isPublic` per `repoIdentity` |
| `DELETE /api/account` | Hard delete — wipes User + all cascades |

---

## 7. Sync and Trust Model

### What IS uploaded (inside each snapshot payload)
```ts
{
  clientUploadedAt: string,          // ISO timestamp — when the upload was initiated
  workspaceCount: number,
  sessionCount: number,
  // Daily usage buckets — one per calendar day per device. Upserted server-side by (userId, deviceId, date).
  // Natural idempotency: retrying the same sync re-upserts identical rows.
  // Built from the extension's computeDailyStats() / CLI's agg_daily table.
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

### Verified vs Unverified
**Don't add a verified badge in v1.** All stats are user-supplied estimates from an unofficial local parser. Label the leaderboard clearly: *"Stats are self-reported estimates from local Copilot session data."* This one footer sentence handles it. Adding a verification mechanism when the underlying data is inherently estimated is kabuki theater.

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
├── app/
│   ├── (public)/
│   │   ├── page.tsx                   # Landing
│   │   ├── leaderboard/page.tsx
│   │   ├── u/[username]/page.tsx      # Profile
│   │   └── r/[username]/[...repo]/page.tsx
│   ├── (auth)/
│   │   ├── settings/page.tsx
│   │   └── connect/page.tsx
│   ├── api/
│   │   ├── auth/[...nextauth]/route.ts
│   │   ├── upload/route.ts
│   │   ├── connect/route.ts
│   │   ├── profile/[username]/route.ts
│   │   ├── leaderboard/route.ts
│   │   ├── settings/
│   │   │   ├── profile/route.ts
│   │   │   └── repos/route.ts
│   │   ├── devices/[id]/route.ts
│   │   └── account/route.ts
│   ├── badge/[username]/route.ts      # SVG badge
│   ├── card/[username]/route.ts       # SVG card
│   ├── layout.tsx
│   └── globals.css
├── components/
│   ├── ui/                            # shadcn/ui primitives
│   ├── LeaderboardTable.tsx
│   ├── ProfileKpis.tsx
│   ├── RepoTable.tsx
│   ├── BadgePreview.tsx
│   └── DeviceList.tsx
├── lib/
│   ├── auth.ts                        # Auth.js config
│   ├── db.ts                          # Prisma client singleton
│   ├── ratelimit.ts                   # Upstash Redis or DB-based limiter
│   └── svg.ts                         # Badge/card SVG generation
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── public/
│   └── og-image.png
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.ts
└── .env.example
```

---

## 10. Step-by-Step Delivery Plan

### Phase 0 — Project Setup (Day 1–2)
- `npx create-next-app@latest apps/web --typescript --tailwind --app`
- Add to root `pnpm-workspace.yaml`
- Set up `packages/shared-schema` with the `SnapshotPayload` Zod schema (including `RepoRef` union type for `github`/`alias` display modes), model multipliers, and `RepoRefPrefs` TypeScript type; publish as `@copilot-usage/shared-schema` workspace package
- Add `prisma`, `@prisma/client`, `next-auth`, `zod` to `apps/web`
- Set up Prisma schema (all models above), run initial migration against local Postgres
- Add `.env.example` with all required vars (`DATABASE_URL`, `NEXTAUTH_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`)
- Set up Vercel project (or Railway) pointing to `apps/web` as the root directory

### Phase 1 — Auth + Database (Day 3–5)
- Auth.js with GitHub provider, storing `githubId` and `username` in `User`
- Session middleware for API routes
- Settings page scaffold (auth-gated)
- Device linking flow: `GET /connect?code=X` generates a **split device token** (`tokenId.secret` — both random, urlsafe base64). Stores `tokenId` and `bcrypt(secret)` as `secretHash` in the `Device` table. Returns full `tokenId.secret` once to the browser (user copies to VS Code or extension reads via redirect).
- Return device token once to the browser (user copies it to VS Code settings, or extension reads it via the browser redirect)
- Device list page with revoke

### Phase 2 — Upload API + Schema Validation (Day 6–9)
- Implement `POST /api/upload` with:
  - Bearer token extraction: split on `.` to get `tokenId`, look up `Device` by `tokenId` (indexed), verify `bcrypt(secret) == device.secretHash`. Reject if device is revoked.
  - Zod validation against `SnapshotPayload` from `shared-schema` (validates `dailyBuckets[]`, each `date` ≤ `clientUploadedAt`, all counts non-negative)
  - Rate limit check (start simple: count rows in `UploadLog` in last hour)
  - **Single Prisma transaction**: UPSERT `UsageDaily[]` by `(userId, deviceId, date)` + recompute and UPSERT `UserStat` (SUM of all `UsageDaily` across all devices for this user) + UPSERT `RepoStat[]` by `(userId, repoIdentity)` (derived from `displayMode`+`githubRepo`/`aliasLabel`)
  - Write `UploadLog` outside the transaction (best-effort audit)
  - Returns `{ ok, logId }`
- Implement upload in the VS Code extension:
  - Add `RepoRefPrefs` store in `globalState` (keyed by `workspaceId` — the hex hash `discovery.ts` already uses)
  - Use `WorkspaceInfo.workspaceId` directly as `workspaceKey` in the payload — already opaque, no extra UUID needed
  - For each workspace, run `git remote get-url origin`, normalize to `owner/repo` if GitHub
  - Show per-workspace confirmation modal on first upload (GitHub link / alias / redact); persist choice
  - Use `computeDailyStats()` to build `dailyBuckets`; read device token from `SecretStorage`, post to API
- Manual test with the extension against localhost

### Phase 3 — Public Profile + Leaderboard (Day 10–14)
- Profile page `/u/[username]` — reads `UserStat` for KPIs and public `RepoStat[]` for repo table; no upload aggregation at query time
- Leaderboard page `/leaderboard` — query public users ordered by tokens, paginate
- Privacy controls in settings: toggle profile public/private, toggle per-repo visibility
- Repo identity settings table: list of all tracked workspaces, their auto-detected remote, and current display mode (GitHub / alias / redacted) with inline edit
- Link between profile and repo pages
- Add `robots.txt` (allow leaderboard/profiles, disallow `/api/*` and `/settings`)

### Phase 4 — Badges / Cards (Day 15–18)
- `GET /badge/[username].svg` — minimal Shields.io-style SVG; stat param selects what to show
- `GET /card/[username].svg` — wider stat card with 3-4 KPIs in a dark card design
- Both return `Cache-Control: public, max-age=3600, stale-while-revalidate=86400`
- Settings page "Badge" section with live preview + Markdown/HTML copy snippets
- Test that GitHub renders the badge in a README (whitelist at `api.github.com` is the badge service's issue, not yours, since you serve SVG directly)

### Phase 5 — Polish and Moderation (Day 19–22)
- Landing page copywriting + OG image
- Add a `reportedAt` flag to `User` for basic moderation (no UI yet, just DB column + manual admin query)
- `DELETE /api/account` — cascade delete everything
- Add clearly visible disclaimer on leaderboard: *"Stats are self-reported estimates from local VS Code session data. Not affiliated with GitHub or Microsoft."*
- Load test the leaderboard query; DB indexes to add:
  - `UserStat(totalTokens DESC)` and `UserStat(premiumRequests DESC)` — for all-time leaderboard sort
  - `User(profilePublic)` — partial index filtering public-only users
  - `UsageDaily(date, userId)` — **date-first** composite; lets the DB scan a date range across all users for date-filtered leaderboards without a per-user full scan
  - The `@@unique([userId, deviceId, date])` on `UsageDaily` also covers per-device upsert lookups
- Set up GitHub Actions CI for `apps/web`: `tsc --noEmit`, lint, Prisma schema validation on every push to `main`

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
| **Model multipliers drift** | Medium | `shared-schema` owns the multiplier table — update one place, both extension and web stay in sync. |

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