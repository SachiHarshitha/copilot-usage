# PromptStreak Badge System — Feature Specification

Version: 1.0  
Target: `promptstreak.dev`  
Primary audience: GitHub Copilot / engineering implementation

## 1. Overview

PromptStreak needs a public, opt-in badge system that turns Copilot usage into something developers can display in GitHub READMEs and public PromptStreak profiles. The system should feel collectible and competitive without rewarding meaningless token burn.

The badge system has three jobs:

1. Show current public stats in embeddable SVG badges.
2. Award milestone and rank badges that users can show off on their profile.
3. Turn usage into a game loop with clear thresholds, visual prestige, and progression.

## 2. Product goals

### Goals
- Generate public SVG badges from PromptStreak data.
- Support README embeds and clicks back to `promptstreak.dev`.
- Show a subtle PromptStreak watermark on every badge.
- Separate permanent achievements from dynamic ranks.
- Keep the implementation simple enough for a Next.js route-based MVP.
- Make the system visually premium and recognizable.

### Non-goals
- No private stats exposure.
- No badge rendering in the VS Code extension.
- No client-side badge drawing for the MVP.
- No animated README badges for the MVP.
- No rewards based purely on "highest total tokens ever" without recent activity context.

## 3. Surfaces

### 3.1 README badges
Compact SVGs intended for GitHub Markdown.

Use cases:
- current streak
- lifetime tokens
- current rank
- weekly usage
- top repo

### 3.2 PromptStreak public profile
Larger cards or medallions for:
- lifetime milestones
- streak milestones
- current seasonal rank
- unlocked achievement gallery

### 3.3 Leaderboard / profile summary
A small subset of badge visuals can be reused in lists and leaderboard rows.

## 4. Core system rules

### 4.1 Public-only
A badge can only be generated from data that the user has explicitly chosen to publish.

### 4.2 Permanent vs dynamic
**Permanent badges**
- lifetime token milestones
- historic streak achievements once unlocked

**Dynamic badges**
- current streak badge
- rolling 30-day rank
- weekly token badge
- top repo badge

### 4.3 Streak qualification
A day counts toward the streak only if the user reaches the minimum qualifying usage threshold for that day.

Recommended thresholds:
- Active day: `10,000` tokens
- Strong day: `40,000` tokens
- Deep-work day: `100,000` tokens
- Marathon day: `250,000` tokens

Rule:
- The official streak counter uses the **Active day** threshold (`10k`).

### 4.4 Retroactive unlocks
If a user already has enough imported lifetime data for a milestone, unlock it immediately.

Examples:
- A user with 53.2M lifetime tokens instantly unlocks all lifetime milestones up to 50M.
- A user only gets a 30-day streak badge retroactively if verified daily history proves the streak.

## 5. Badge categories

## 5.1 Dynamic stat badges (README-first)
These are rendered directly from current public stats.

| Badge key | Purpose | Typical text | Shape |
|---|---|---|---|
| `streak` | Show current consecutive qualifying days | `🔥 18 DAYS` | pill |
| `lifetime` | Show total public lifetime tokens | `⚡ 12.4M TOKENS` | pill |
| `rank` | Show current 30-day rank | `💎 DIAMOND` | pill |
| `weekly` | Show tokens in the last 7 days | `📈 420K TOKENS` | pill |
| `repo` | Show top public repo by recent usage | `🏆 promptstreak-web` | pill |

## 5.2 Rank badges
Rolling 30-day performance tier.

| Rank | Threshold (30d) | Tone |
|---|---:|---|
| Bronze | 100k | early momentum |
| Silver | 300k | consistent |
| Gold | 750k | sharp |
| Platinum | 1.5M | polished |
| Diamond | 3M | elite |
| Master | 6M | relentless |
| Grandmaster | 12M+ | mythic pace |

Rules:
- Rank is recalculated from the last 30 days.
- Rank can move up or down.
- Rank badges are dynamic, not permanent.

## 5.3 Lifetime achievement badges
Permanent collectible badges unlocked by total lifetime public tokens.

| Milestone | Badge name |
|---:|---|
| 100k | Spark |
| 500k | Warmed Up |
| 1M | Million Club |
| 5M | Forge Master |
| 10M | AI Workhorse |
| 25M | Titan |
| 50M | Legend |
| 100M | Mythic |

Rules:
- Unlock immediately when threshold is met.
- Never remove once unlocked.
- Lower milestones remain visible as part of the achievement history.

## 5.4 Streak achievement badges
Permanent collectible badges unlocked when the user's **best verified streak** reaches the threshold.

| Streak | Badge name |
|---:|---|
| 3 days | Ignition |
| 7 days | On Fire |
| 14 days | Locked In |
| 30 days | Unbroken |
| 60 days | Relentless |
| 100 days | Centurion |
| 180 days | Machine |
| 365 days | Immortal |

Rules:
- These are based on best verified streak, not just current streak.
- Once unlocked, they stay unlocked.

## 6. Visual system

### 6.1 Brand style
Overall look:
- dark premium background
- soft neon highlight
- high-contrast numeric value
- understated glass / glow feel
- subtle PromptStreak watermark

### 6.2 Watermark
Every badge should include a subtle website signature:

Default watermark text:
- `promptstreak.dev`

Rules:
- low contrast only
- never brighter than the main stat
- small text, usually bottom-right
- not styled like a clickable hyperlink
- should feel like a maker's mark, not a CTA

Recommended values:
- opacity: `0.18` to `0.28`
- font size: `9px` to `11px`
- letter spacing: `0.4` to `0.8`

### 6.3 Shape system
- README badges: rounded pill
- rank badges: shield / diamond / medallion
- achievement badges: card or emblem

### 6.4 Typography
- label text: uppercase, compact, medium contrast
- stat text: uppercase or title-case, strong contrast
- watermark: tiny and subtle
- preferred stack: `Inter, Arial, sans-serif`

### 6.5 Color mapping
- streak: orange / ember
- lifetime: blue / indigo
- weekly: cyan
- repo: green
- rank tiers: distinct tier-specific gradients
- mythic / high prestige: warmer or stronger spectrum accents

## 7. SVG component requirements

Every generated SVG should:
- include `role="img"`
- include a useful `aria-label`
- use deterministic dimensions per badge family
- escape user-controlled text
- render correctly in GitHub README image contexts
- avoid external fonts, scripts, or remote assets

Recommended README badge size:
- `420 x 96`

Recommended rank card size:
- `320 x 170`

Recommended achievement card size:
- `380 x 210`

## 8. Data model

A minimal badge system can derive from these public fields:

```ts
type PublicUserBadgeStats = {
  username: string;
  lifetimeTokens: number;
  weeklyTokens: number;
  currentStreakDays: number;
  bestStreakDays: number;
  rolling30DayTokens: number;
  topRepoName: string | null;
  publicRepoCount: number;
  unlockedLifetimeMilestones: string[];
  unlockedStreakMilestones: string[];
};
```

Derived values:
- `rank` from `rolling30DayTokens`
- `current streak badge` from `currentStreakDays`
- `best streak achievements` from `bestStreakDays`
- `lifetime achievements` from `lifetimeTokens`

## 9. Public routes

Suggested API routes:

```txt
GET /api/badges/:user/streak.svg
GET /api/badges/:user/lifetime.svg
GET /api/badges/:user/rank.svg
GET /api/badges/:user/weekly.svg
GET /api/badges/:user/repo.svg
GET /api/badges/:user/achievements/:achievementKey.svg
GET /api/badges/:user/ranks/:rankKey.svg
```

Suggested public profile routes:

```txt
GET /u/:user
GET /u/:user/achievements
GET /u/:user/repos/:repo
```

## 10. Badge generation flow

1. Parse the route parameters.
2. Resolve the user's public badge stats.
3. Reject if the user is private or not found.
4. Map stats to a badge configuration.
5. Render SVG string.
6. Return `Content-Type: image/svg+xml; charset=utf-8`.
7. Cache for a short TTL.

## 11. Caching

Recommended cache policy for the MVP:
- `max-age=300`
- `s-maxage=300`
- `stale-while-revalidate=600`

Why:
- README badges should not hammer the origin.
- Small delays in stat refresh are acceptable.
- GitHub image fetch behavior is not fully under our control.

## 12. Privacy and access rules

- Only render badges for users who enabled public sharing.
- If a stat is unavailable, return a fallback badge or a 404, depending on product preference.
- Do not expose hidden repo names in badge output.
- If the repo badge depends on private repo data, do not render it publicly.
- Public routes must never reveal raw internal IDs.

## 13. README embedding

Recommended snippet:

```md
[![PromptStreak](https://promptstreak.dev/api/badges/harshitha/streak.svg)](https://promptstreak.dev/u/harshitha)
[![Lifetime Tokens](https://promptstreak.dev/api/badges/harshitha/lifetime.svg)](https://promptstreak.dev/u/harshitha)
[![Rank](https://promptstreak.dev/api/badges/harshitha/rank.svg)](https://promptstreak.dev/u/harshitha)
```

## 14. Unlock logic

### 14.1 Lifetime milestones
```ts
const lifetimeMilestones = [
  { key: "100k", threshold: 100_000 },
  { key: "500k", threshold: 500_000 },
  { key: "1m", threshold: 1_000_000 },
  { key: "5m", threshold: 5_000_000 },
  { key: "10m", threshold: 10_000_000 },
  { key: "25m", threshold: 25_000_000 },
  { key: "50m", threshold: 50_000_000 },
  { key: "100m", threshold: 100_000_000 },
];
```

Rule:
- unlock every milestone whose threshold is `<= lifetimeTokens`

### 14.2 Streak milestones
```ts
const streakMilestones = [
  { key: "3d", threshold: 3 },
  { key: "7d", threshold: 7 },
  { key: "14d", threshold: 14 },
  { key: "30d", threshold: 30 },
  { key: "60d", threshold: 60 },
  { key: "100d", threshold: 100 },
  { key: "180d", threshold: 180 },
  { key: "365d", threshold: 365 },
];
```

Rule:
- unlock every streak badge whose threshold is `<= bestStreakDays`

### 14.3 Rank
```ts
function getRank(tokens30d: number) {
  if (tokens30d >= 12_000_000) return "grandmaster";
  if (tokens30d >= 6_000_000) return "master";
  if (tokens30d >= 3_000_000) return "diamond";
  if (tokens30d >= 1_500_000) return "platinum";
  if (tokens30d >= 750_000) return "gold";
  if (tokens30d >= 300_000) return "silver";
  if (tokens30d >= 100_000) return "bronze";
  return "unranked";
}
```

## 15. Acceptance criteria

### Functional
- Badge endpoints return valid SVG.
- Public users can embed README badges.
- Watermark appears on every badge.
- Lifetime badges unlock retroactively.
- Rank recalculates from rolling 30-day totals.
- Streak achievements rely on verified daily history.

### Visual
- Badge text never clips for normal supported values.
- Watermark is visible but subordinate.
- Badge families feel consistent.
- Rank and achievement badges look more collectible than README pills.

### Security
- No private user or repo data leaks.
- User text is escaped in SVG output.
- Routes return 404 or safe fallback for invalid/unpublished users.

## 16. Suggested folder structure

```txt
app/
  api/
    badges/
      [user]/
        streak.svg/route.ts
        lifetime.svg/route.ts
        rank.svg/route.ts
        weekly.svg/route.ts
        repo.svg/route.ts
        achievements/
          [achievementKey].svg/route.ts
        ranks/
          [rankKey].svg/route.ts

lib/
  badges/
    badge-generator.ts
    badge-config.ts
    badge-types.ts
    badge-thresholds.ts
    badge-utils.ts
    badge-watermark.ts
```

## 17. Implementation notes for Copilot

Build the badge system as a small SVG rendering library plus thin Next.js routes.

Implementation guidance:
- Keep SVG layout deterministic.
- Store thresholds in a shared config file.
- Use pure functions for rank and milestone resolution.
- Make watermark generation reusable.
- Separate **data fetch**, **badge config mapping**, and **SVG rendering**.
- Add unit tests for:
  - rank thresholds
  - retroactive lifetime unlocks
  - best streak unlocks
  - text escaping
  - public/private access control

## 18. Badge asset pack included with this spec

This package includes:
- README template badges
- rank badge set
- lifetime achievement badge set
- streak achievement badge set
- TypeScript generator example
- Next.js route example

## 19. Implementation prompt for Copilot

Use this prompt directly:

> Build a PromptStreak badge system in a Next.js app-router project. Create server routes that return SVG badges for streak, lifetime tokens, rank, weekly usage, top repo, lifetime achievements, and streak achievements. Use a shared badge config module for thresholds and colors. Include a subtle `promptstreak.dev` watermark on every badge. Lifetime achievements must unlock retroactively from imported history. Rank must be computed from rolling 30-day tokens and be dynamic. Streak achievements must be based on best verified streak. Return `image/svg+xml` with public cache headers. Keep rendering deterministic, escape all user-controlled text, and make badge families visually consistent with dark premium backgrounds and tier-based accents.

## 20. Recommended MVP order

1. shared thresholds + badge config
2. SVG pill generator
3. streak / lifetime / rank routes
4. profile achievement gallery
5. lifetime and streak unlock calculation
6. rank badge family
7. repo and weekly variants
8. tests and fallback handling
