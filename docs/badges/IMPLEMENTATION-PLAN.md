# PromptStreak Badge System — Concrete Implementation Plan

> Target: `apps/web` (Next.js 15, App Router, Prisma/PostgreSQL)  
> Spec: `PromptStreak-Badge-System-Spec.md` + `PromptStreak-Repo-Badges.md`  
> Templates: `docs/badges/badges/`  
> Code samples: `docs/badges/code/`

---

## 1. What already exists vs. what must be built

### Already in the web app
| Existing | Location | Gap |
|----------|----------|-----|
| Simple Shields.io-style badge | `src/lib/svg.ts → generateBadgeSvg()` | Wrong shape and style — not pill, no icon box, no watermark |
| Wide stat card | `src/lib/svg.ts → generateCardSvg()` | Correct idea, wrong branding, no achievement/rank variant |
| Single badge route | `src/app/badge/[username]/route.ts` | Single flat route, no per-type dispatch, no repo surface |
| `UserStat` model | `prisma/schema.prisma` | Missing streak fields and weekly/30d rollups |
| `RepoStat` model | `prisma/schema.prisma` | Missing 30d rollup and rank position |

### Must be built from scratch
- Full pill badge renderer (matches `badges/readme/*.svg` visual)
- Rank card renderer (320×170 hexagon — matches `badges/ranks/*.svg`)
- Achievement card renderer (380×210 emblem — matches `badges/achievements/**/*.svg`)
- Repo badge routes (6 types) under `/api/badges/repo/[owner]/[repo]/[type].svg`
- User badge routes (5 dynamic + 2 achievement/rank) under `/api/badges/[user]/[type].svg`
- Streak computation (current + best) written into the upload pipeline
- Achievement unlock utility (lifetime + streak milestones)
- `/u/[user]/achievements` gallery page
- Rank badge on leaderboard rows and profile header
- README copy snippets for every badge type in Settings page

---

## 2. Schema additions

Two fields must be added to `UserStat` to power streak and rank badges without re-querying `UsageDaily` on every badge render.

```prisma
// Additions to UserStat in prisma/schema.prisma
currentStreakDays    Int      @default(0)   // consecutive days with ≥ 10k tokens ending today
bestStreakDays       Int      @default(0)   // all-time best verified streak
rolling30DayTokens  BigInt   @default(0)   // SUM(totalTokens) for last 30 calendar days
weeklyTokens        BigInt   @default(0)   // SUM(totalTokens) for last 7 calendar days
```

`RepoStat` needs a 30-day rollup for the `tokens-30d` repo badge:

```prisma
// Addition to RepoStat in prisma/schema.prisma
tokens30d    BigInt   @default(0)  // SUM(totalTokens) for last 30 calendar days
```

**Migration:** `pnpm db:migrate` (dev) / `pnpm db:push` (prototype). Both are additive with defaults — no data loss.

---

## 3. New utility files

### 3.1 `src/lib/badge-svg.ts`
Central SVG renderer. Copy from `docs/badges/code/badge-generator.ts` as the starting point. Add:

**`renderPillBadge(opts)`** — 420×96, dark pill, icon box on left, label+value on right, watermark  
Visual spec: `badges/readme/streak-template.svg`

**`renderRankCard(rank, tokens30d)`** — 320×170, hexagon, tier-specific gradient, progress bar  
Visual spec: `badges/ranks/diamond.svg` (clone for each tier with different gradient/label)

**`renderAchievementCard(name, threshold, icon, label)`** — 380×210, emblem, dual-ring, milestone chip  
Visual spec: `badges/achievements/lifetime/1m-million-club.svg`

Color constants per rank/tier are already in `badge-catalog.json` and `repoBadgePresets` in the code sample — copy them directly.

### 3.2 `src/lib/badge-stats.ts`
Derives the `PublicUserBadgeStats` object from the DB. Used by every badge route.

```ts
// Fetches UserStat + top public RepoStat for a user, returns null if private
async function getPublicBadgeStats(username: string): Promise<PublicUserBadgeStats | null>
```

Also exposes:
- `computeRank(rolling30DayTokens)` — returns tier key from spec thresholds
- `computeUnlockedLifetime(lifetimeTokens)` — returns array of milestone keys
- `computeUnlockedStreak(bestStreakDays)` — returns array of streak milestone keys

### 3.3 `src/lib/streak.ts`
Called during the upload pipeline to recompute streak fields before writing `UserStat`.

```ts
// Given all UsageDaily rows for a user, returns { currentStreak, bestStreak }
function computeStreaks(rows: Array<{ date: Date; totalTokens: bigint }>): {
  currentStreakDays: number;
  bestStreakDays: number;
}
```

Logic:
1. Filter rows where `totalTokens >= 10_000`.
2. Sort descending by date.
3. Walk backward from today: if the gap between consecutive qualifying days is exactly 1, extend streak; otherwise stop.
4. Simultaneously track the historical longest run.

---

## 4. Upload pipeline changes

In `src/app/api/upload/route.ts`, after the existing `UsageDaily` + `UserStat` upsert transaction, add:

```
1. Fetch all UsageDaily rows for this userId, ordered by date.
2. Call computeStreaks() → { currentStreakDays, bestStreakDays }.
3. Compute rolling30DayTokens = SUM(totalTokens WHERE date >= today-30d).
4. Compute weeklyTokens = SUM(totalTokens WHERE date >= today-7d).
5. Include all four values in the UserStat upsert within the same transaction.
```

No new DB round-trip is needed — these can reuse the rows already queried for the `UserStat` SUM.

---

## 5. Route structure

### User badge routes
All responses: `Content-Type: image/svg+xml; charset=utf-8`, `Cache-Control: public, max-age=300, stale-while-revalidate=600`

```
src/app/api/badges/[user]/[type]/route.ts
```

Handled `type` values:

| `type` | Icon | Label | Value source |
|--------|------|-------|-------------|
| `streak.svg` | 🔥 | STREAK | `currentStreakDays` |
| `lifetime.svg` | ⚡ | LIFETIME | `lifetimeTokens` formatted |
| `rank.svg` | 💎 | RANK | `computeRank(rolling30DayTokens)` |
| `weekly.svg` | 📈 | THIS WEEK | `weeklyTokens` formatted |
| `repo.svg` | 🏆 | TOP REPO | `topRepoName` |

Achievement and rank card sub-routes:

```
src/app/api/badges/[user]/achievements/[key]/route.ts
src/app/api/badges/[user]/ranks/[key]/route.ts
```

- `achievements/[key]` renders `renderAchievementCard()` only if `key` is in `unlockedLifetimeMilestones` or `unlockedStreakMilestones`.
- `ranks/[key]` renders `renderRankCard()` for any valid rank key (these are dynamic, not gated by unlock).

### Repo badge routes

```
src/app/api/badges/repo/[owner]/[repo]/[type]/route.ts
```

Handled `type` values (all use `renderPillBadge()` with `repoBadgePresets`):

| `type` | Preset | Value |
|--------|--------|-------|
| `leaderboard.svg` | `leaderboard` | `#N ON PROMPTSTREAK` |
| `tokens.svg` | `lifetimeTokens` | `totalTokens` formatted |
| `tokens-30d.svg` | `tokens30d` | `tokens30d` formatted |
| `models.svg` | `models` | top 3 models collapsed |
| `primary-model.svg` | `primaryModel` | `topModel` |
| `summary.svg` | `summary` | `#N · XM · MODEL +N` |

Repo rank position (`leaderboard.svg`) requires a fast query: `SELECT rank() OVER (ORDER BY totalTokens DESC) FROM RepoStat WHERE isPublic = true`. Use a window function or pre-rank at upload time.

---

## 6. Updated existing route

The legacy `/badge/[username].svg` route in `src/app/badge/[username]/route.ts` can stay as a compatibility shim but its SVG should be upgraded to use the new `renderPillBadge()` from `badge-svg.ts`.

---

## 7. Profile / leaderboard integration

### `/u/[username]` profile page
- Show current rank badge (rank card, 320×170) at the top.
- Show achievement gallery section: grid of unlocked `renderAchievementCard()` SVGs or static previews.
- Keep existing KPI cards below.
- Update README embed section to list all available badge URLs with copy snippets.

### `/leaderboard`
- Add rank badge (small pill, reuse `rank.svg`) next to each row.
- Show streak count as secondary stat in the row.

### `/u/[username]/achievements` (new page)
- Full-page achievement gallery.
- Two sections: lifetime milestones + streak milestones.
- Each unlocked badge shown as `renderAchievementCard()` — locked ones shown as greyed-out.
- Progress toward next milestone shown below locked badges.

### `/settings`
- Add a new "Badges" section with copy-paste snippets for all badge types:
  - 5 user README pills
  - 6 repo README pills (for each linked public repo)
  - Rank card embed
  - Achievement card embeds for unlocked achievements

---

## 8. Implementation phases

### Phase A — Foundation (pre-req for everything)
1. `prisma/schema.prisma`: add 4 fields to `UserStat`, 1 field to `RepoStat`; run migration.
2. Create `src/lib/streak.ts` with `computeStreaks()`.
3. Update upload pipeline to compute and persist streak + rolling stats.
4. Create `src/lib/badge-stats.ts` with `getPublicBadgeStats()`, `computeRank()`, `computeUnlockedLifetime()`, `computeUnlockedStreak()`.

### Phase B — SVG renderers
5. Create `src/lib/badge-svg.ts` (from `docs/badges/code/badge-generator.ts`):
   - `renderPillBadge()` — pill, 420×96
   - `renderRankCard()` — hexagon card, 320×170, per-tier gradients
   - `renderAchievementCard()` — emblem card, 380×210, per-key icon+label
6. Upgrade legacy `src/lib/svg.ts` `generateCardSvg()` to delegate to `renderPillBadge()`.
7. Update `src/app/badge/[username]/route.ts` to use `renderPillBadge()`.

### Phase C — User badge routes
8. Create `src/app/api/badges/[user]/[type]/route.ts` (5 pill types).
9. Create `src/app/api/badges/[user]/achievements/[key]/route.ts`.
10. Create `src/app/api/badges/[user]/ranks/[key]/route.ts`.

### Phase D — Repo badge routes
11. Create `src/app/api/badges/repo/[owner]/[repo]/[type]/route.ts` (6 types).
12. Add repo-rank position logic (window query or pre-rank column).

### Phase E — Profile + leaderboard integration
13. Update `/u/[username]/page.tsx`: rank badge, achievement gallery, updated embed section.
14. Update `/leaderboard/page.tsx`: rank pill per row, streak count.
15. Create `/u/[username]/achievements/page.tsx`: full gallery with locked/unlocked state.
16. Update `/settings/page.tsx`: comprehensive badge copy-paste section.

### Phase F — Seed and test
17. Update `prisma/seed.ts` to populate the new `UserStat` fields (streak, rolling30d, weekly) so local dev immediately shows badges.
18. Run through all badge URLs manually (or write a quick test matrix in `/api/badges/test`).

---

## 9. Files to create / edit

### New files
```
src/lib/badge-svg.ts
src/lib/badge-stats.ts
src/lib/streak.ts
src/app/api/badges/[user]/[type]/route.ts
src/app/api/badges/[user]/achievements/[key]/route.ts
src/app/api/badges/[user]/ranks/[key]/route.ts
src/app/api/badges/repo/[owner]/[repo]/[type]/route.ts
src/app/u/[username]/achievements/page.tsx
```

### Files to edit
```
prisma/schema.prisma                          — add 5 new fields
src/app/api/upload/route.ts                   — streak + rolling stats in upload pipeline
src/lib/svg.ts                                — delegate card to new renderer
src/app/badge/[username]/route.ts             — switch to renderPillBadge
src/app/u/[username]/page.tsx                 — rank badge, achievement gallery, embed snippets
src/app/leaderboard/page.tsx                  — rank pill per row
src/app/settings/page.tsx                     — badge copy-paste section
prisma/seed.ts                                — populate new streak/rolling fields
```

---

## 10. Milestone thresholds (implementation constants)

Copy directly into `src/lib/badge-stats.ts`:

```ts
// Rank thresholds — rolling 30-day tokens
const RANK_TIERS = [
  { key: 'grandmaster', label: 'Grandmaster', min: 12_000_000, accent: '#f59e0b', accent2: '#fef3c7' },
  { key: 'master',      label: 'Master',      min: 6_000_000,  accent: '#a855f7', accent2: '#e9d5ff' },
  { key: 'diamond',     label: 'Diamond',     min: 3_000_000,  accent: '#3c6cff', accent2: '#d5dbff' },
  { key: 'platinum',    label: 'Platinum',    min: 1_500_000,  accent: '#2dd4bf', accent2: '#ccfbf1' },
  { key: 'gold',        label: 'Gold',        min: 750_000,    accent: '#eab308', accent2: '#fef9c3' },
  { key: 'silver',      label: 'Silver',      min: 300_000,    accent: '#94a3b8', accent2: '#f1f5f9' },
  { key: 'bronze',      label: 'Bronze',      min: 100_000,    accent: '#a16207', accent2: '#fef3c7' },
] as const;

// Lifetime milestone badges
const LIFETIME_MILESTONES = [
  { key: '100k',  label: 'Spark',        min: 100_000,      icon: '✨' },
  { key: '500k',  label: 'Warmed Up',    min: 500_000,      icon: '🔥' },
  { key: '1m',    label: 'Million Club', min: 1_000_000,    icon: '⚡' },
  { key: '5m',    label: 'Forge Master', min: 5_000_000,    icon: '🔨' },
  { key: '10m',   label: 'AI Workhorse', min: 10_000_000,   icon: '🤖' },
  { key: '25m',   label: 'Titan',        min: 25_000_000,   icon: '🏔️' },
  { key: '50m',   label: 'Legend',       min: 50_000_000,   icon: '🌟' },
  { key: '100m',  label: 'Mythic',       min: 100_000_000,  icon: '💫' },
] as const;

// Streak milestone badges
const STREAK_MILESTONES = [
  { key: '3d',   label: 'Ignition',   min: 3,   icon: '🔥' },
  { key: '7d',   label: 'On Fire',    min: 7,   icon: '🔥' },
  { key: '14d',  label: 'Locked In',  min: 14,  icon: '🔒' },
  { key: '30d',  label: 'Unbroken',   min: 30,  icon: '⚡' },
  { key: '60d',  label: 'Relentless', min: 60,  icon: '💪' },
  { key: '100d', label: 'Centurion',  min: 100, icon: '🛡️' },
  { key: '180d', label: 'Machine',    min: 180, icon: '⚙️' },
  { key: '365d', label: 'Immortal',   min: 365, icon: '👑' },
] as const;

// Active day threshold for streak qualification
const ACTIVE_DAY_TOKENS = 10_000;
```

---

## 11. Cache and delivery

All badge routes must return:

```
Content-Type: image/svg+xml; charset=utf-8
Cache-Control: public, max-age=300, s-maxage=300, stale-while-revalidate=600
CDN-Cache-Control: public, s-maxage=300
Vercel-CDN-Cache-Control: public, s-maxage=300
X-Robots-Tag: noindex
```

GitHub caches badge images aggressively through camo.github.com — the 5-minute TTL is deliberately short so rank/streak updates show within one cache cycle.

---

## 12. Security rules

- All user-controlled strings (username, repo name, model names, alias labels) **must go through `escapeXml()`** before insertion into SVG output. The `esc()` helper in `badge-generator.ts` already handles this correctly.
- Badge routes must call `getPublicBadgeStats()` which gates on `profilePublic = true`. Never render badges for private users — return a 404 SVG fallback, not an error page.
- Repo badges gate on `RepoStat.isPublic = true`. Never infer or expose the raw GitHub repo path if the user chose alias mode.
- Never include raw internal IDs, database IDs, or file paths in SVG output.

---

## 13. README embed snippets (reference)

For Settings page copy-paste and docs:

```md
<!-- User badges -->
[![Streak](https://promptstreak.dev/api/badges/USERNAME/streak.svg)](https://promptstreak.dev/u/USERNAME)
[![Lifetime](https://promptstreak.dev/api/badges/USERNAME/lifetime.svg)](https://promptstreak.dev/u/USERNAME)
[![Rank](https://promptstreak.dev/api/badges/USERNAME/rank.svg)](https://promptstreak.dev/u/USERNAME)
[![This Week](https://promptstreak.dev/api/badges/USERNAME/weekly.svg)](https://promptstreak.dev/u/USERNAME)
[![Top Repo](https://promptstreak.dev/api/badges/USERNAME/repo.svg)](https://promptstreak.dev/u/USERNAME)

<!-- Repo badges (inside a repo README) -->
[![PromptStreak Rank](https://promptstreak.dev/api/badges/repo/OWNER/REPO/leaderboard.svg)](https://promptstreak.dev/r/OWNER/REPO)
[![Tokens](https://promptstreak.dev/api/badges/repo/OWNER/REPO/tokens.svg)](https://promptstreak.dev/r/OWNER/REPO)
[![30d Tokens](https://promptstreak.dev/api/badges/repo/OWNER/REPO/tokens-30d.svg)](https://promptstreak.dev/r/OWNER/REPO)
[![Models](https://promptstreak.dev/api/badges/repo/OWNER/REPO/models.svg)](https://promptstreak.dev/r/OWNER/REPO)
[![Primary Model](https://promptstreak.dev/api/badges/repo/OWNER/REPO/primary-model.svg)](https://promptstreak.dev/r/OWNER/REPO)
[![Summary](https://promptstreak.dev/api/badges/repo/OWNER/REPO/summary.svg)](https://promptstreak.dev/r/OWNER/REPO)
```
