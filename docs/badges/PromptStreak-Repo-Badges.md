# PromptStreak Repo README Badges

This document defines the badges intended to be embedded directly inside a public repository `README.md`.

These badges are different from user profile badges:
- **Repo README badges** describe one public repository.
- **User profile badges** describe one user account across all public data.

## Goal

Let maintainers showcase a repo's public PromptStreak stats directly in the repo page on GitHub:
- public leaderboard position
- token usage
- tracked models

Each badge must:
- render as a public SVG
- work in GitHub `README.md`
- link back to the repo page on `promptstreak.dev`
- include a subtle `promptstreak.dev` watermark
- never expose private repos or private usage data

## Badge Types

### 1. Leaderboard Badge
**Purpose:** show where the repo ranks on the public PromptStreak leaderboard.

Example values:
- `#12 ON PROMPTSTREAK`
- `TOP 5%`
- `TRENDING #8`

Route:
- `GET /api/badges/repo/:owner/:repo/leaderboard.svg`

Recommended README embed:
```md
[![PromptStreak Rank](https://promptstreak.dev/api/badges/repo/owner/repo/leaderboard.svg)](https://promptstreak.dev/r/owner/repo)
```

### 2. Lifetime Tokens Badge
**Purpose:** show total tracked token usage for the repo.

Example values:
- `12.4M TOKENS`
- `480K TOKENS`

Route:
- `GET /api/badges/repo/:owner/:repo/tokens.svg`

Recommended README embed:
```md
[![PromptStreak Tokens](https://promptstreak.dev/api/badges/repo/owner/repo/tokens.svg)](https://promptstreak.dev/r/owner/repo)
```

### 3. 30-Day Tokens Badge
**Purpose:** show recent repo activity using a rolling 30-day window.

Example values:
- `480K TOKENS`
- `2.3M TOKENS`

Route:
- `GET /api/badges/repo/:owner/:repo/tokens-30d.svg`

Recommended README embed:
```md
[![PromptStreak 30d](https://promptstreak.dev/api/badges/repo/owner/repo/tokens-30d.svg)](https://promptstreak.dev/r/owner/repo)
```

### 4. Models Badge
**Purpose:** show the models used in the repo in a compact README-safe format.

Recommended formatting:
- list up to 3 models
- if there are more than 3, collapse after the first model
- keep the badge readable in narrow README columns

Example values:
- `GPT-5 · CLAUDE · O4`
- `GPT-5 +2`
- `3 MODELS`

Route:
- `GET /api/badges/repo/:owner/:repo/models.svg`

Recommended README embed:
```md
[![PromptStreak Models](https://promptstreak.dev/api/badges/repo/owner/repo/models.svg)](https://promptstreak.dev/r/owner/repo)
```

### 5. Primary Model Badge
**Purpose:** show the dominant model used in the repo by token share.

Example values:
- `GPT-5`
- `CLAUDE SONNET`

Route:
- `GET /api/badges/repo/:owner/:repo/primary-model.svg`

Recommended README embed:
```md
[![PromptStreak Primary Model](https://promptstreak.dev/api/badges/repo/owner/repo/primary-model.svg)](https://promptstreak.dev/r/owner/repo)
```

### 6. Summary Badge
**Purpose:** show a compact all-in-one badge for maintainers who only want one badge in the README.

Example values:
- `#12 · 12.4M · GPT-5 +2`
- `TOP 5% · 2.1M · 3 MODELS`

Route:
- `GET /api/badges/repo/:owner/:repo/summary.svg`

Recommended README embed:
```md
[![PromptStreak Summary](https://promptstreak.dev/api/badges/repo/owner/repo/summary.svg)](https://promptstreak.dev/r/owner/repo)
```

## Display Rules

### Watermark
Every repo badge must include a subtle `promptstreak.dev` watermark:
- bottom-right aligned
- low contrast
- not styled like a CTA
- visible enough to brand the asset
- never larger than the primary stat text

### Typography
- labels should be uppercase
- values should remain compact
- reduce font size for long values
- prioritize readability over exactness

### Truncation and Formatting
- repo badges should avoid wrapping
- large token counts should be abbreviated (`480K`, `12.4M`, `1.2B`)
- model lists should collapse after 2 to 3 items
- values should be capped for readability before they are capped for precision

### Public Data Only
Repo badges may only render when:
- the repo is public
- the repo is opted in for publishing
- the data shown is safe to publish

Repo badges must never:
- reveal private repo names
- reveal prompt contents
- reveal file paths
- reveal issue titles unless separately published
- reveal model usage for repos that are not public

## Suggested Launch Set

For launch, the recommended default repo README set is:
1. `leaderboard`
2. `tokens`
3. `models`

That gives each repo:
- social proof
- activity proof
- technical identity

## Optional Extras for Later

Future repo-specific badge categories:
- repo streak
- trending badge
- repo rank tier badge
- cost estimate badge
- issue-to-token efficiency badge
- model mix badge with percentages

## Acceptance Criteria

- badge URLs return valid SVG
- badges render correctly inside GitHub README files
- the site watermark is present on every badge
- private repos never receive public badge output
- model text remains readable for common real-world values
- each badge links back to the repo page on `promptstreak.dev`
- responses are cacheable for CDN delivery

## Included Files in This Pack

- `badges/repo-readme/leaderboard-template.svg`
- `badges/repo-readme/tokens-lifetime-template.svg`
- `badges/repo-readme/tokens-30d-template.svg`
- `badges/repo-readme/models-template.svg`
- `badges/repo-readme/primary-model-template.svg`
- `badges/repo-readme/summary-template.svg`
- `code/nextjs-repo-route-example.ts`
