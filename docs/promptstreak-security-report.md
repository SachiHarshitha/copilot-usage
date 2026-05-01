## Security Audit Report — PromptStreak Web App

### Open Findings Summary
| Severity | Count |
|---|---|
| Critical | 0 |
| High | 0 |
| Medium | 1 |
| Low | 1 |
| Info | 4 |

Resolved findings tracked in this report: **6**

---

### Deployment Assumptions (VPS)

- Cloudflare is the only public edge.
- VPS firewall allows 80/443 only from Cloudflare IP ranges.
- Nginx Proxy Manager strips/overwrites `X-Forwarded-For` and `X-Real-IP`.
- The app trusts only sanitized proxy headers from Nginx.
- The app process is not directly reachable from the public internet.
- The app runs as a single Docker container with one Node.js process (no replicas/cluster).

---

### Findings

#### [LOW][CONDITIONAL] Proxy trust drift can bypass upload IP rate limit

- **Location:** apps/web/src/app/api/upload/route.ts
- **Description:** `getClientIp()` now trusts only `X-Real-IP` and validates format (`isIP`). This removes direct reliance on `X-Forwarded-For`, but still assumes the app is reachable only via a trusted proxy that overwrites `X-Real-IP`.
- **Impact:** Under the VPS deployment assumptions above, this remains low risk. If the app becomes directly reachable or proxy header sanitation drifts, an attacker could still rotate `X-Real-IP` values to reduce IP-based rate-limit effectiveness. In that drift scenario, severity escalates to **HIGH**.
- **Proof of concept:**
  ```
  POST /api/upload
  Authorization: Bearer <valid-token>
  X-Real-IP: 10.0.0.1
  ```
  Repeat with incrementing fake IPs — bypass requires unsanitized headers to reach the app process.
- **Recommendation:** Keep the current network controls and add explicit runtime guarantees:
  - Deny direct access to the app process from non-proxy sources.
  - Ensure Nginx overwrites `X-Real-IP` and strips user-provided variants.
  - Prefer a single trusted header from proxy-to-app (for example `X-Real-IP`) and ignore user-supplied alternatives.
  - Treat this as a deployment control verification item in release checklists.

---

#### [INFO][RESOLVED] `$queryRawUnsafe` with string-interpolated ORDER BY clauses

- **Location:** apps/web/src/lib/repo-leaderboard-data.ts, apps/web/src/lib/ide-leaderboard-data.ts
- **Description:** This was previously a latent footgun: leaderboard queries used `prisma.$queryRawUnsafe(...)` with interpolated ORDER BY text. It has now been refactored to `prisma.$queryRaw(...)` with `Prisma.sql` and trusted ORDER BY fragments returned from a closed switch on the sort unions.
- **Impact:** The SQL injection footgun tied to future bypass of normalization has been removed for these two leaderboard queries.
- **Recommendation:** Keep this pattern as a repository standard: `Prisma.sql` + closed union/switch for ORDER BY fragments, and avoid `$queryRawUnsafe` in production code paths.
  ```ts
  import { Prisma } from '@prisma/client';
  // In orderByClause():
  case 'premium': return Prisma.raw('premium_reqs DESC, total_tokens DESC');
  // ...
  const rows = await prisma.$queryRaw<RepoLeaderboardRow[]>(
    Prisma.sql`... ORDER BY ${orderBy} LIMIT ${PAGE_SIZE} OFFSET ${offset}`
  );
  ```
  This keeps ORDER BY composition type-constrained and preserves Prisma's safer raw-query API usage.

---

#### [MEDIUM] CSP `script-src` still includes `'unsafe-inline'`

- **Location:** apps/web/src/lib/security-headers.ts
- **Description:** CSP hardening is now **partially implemented**. Production no longer includes `'unsafe-eval'`, but `'unsafe-inline'` is still present in `script-src`. This is materially better than before, but still weaker than nonce-based CSP.
- **Impact:** Removing `'unsafe-eval'` reduces script-injection blast radius. Remaining `'unsafe-inline'` still limits CSP effectiveness against XSS in user-influenced surfaces.
- **Recommendation (phased):**
  - **Phase 1 (completed):** Remove `'unsafe-eval'` in production only; keep development CSP relaxed for tooling compatibility.
  - **Phase 2:** Evaluate nonce-based CSP across public pages, badge routes, auth flows, admin pages, and any third-party scripts.
  - **Phase 3:** Consider route-profiled CSP policies:
    - Public pages: stricter
    - Admin pages: strictest
    - SVG badge routes: no script allowances
    - Development: relaxed CSP only in development
  Note: Next.js nonce CSP can force dynamic rendering and may reduce static optimization/ISR/cache benefits; evaluate performance impact before full rollout.

---

#### [INFO][RESOLVED] `ADMIN_NETWORK_GUARD=disabled` bypass has no `NODE_ENV` guard

- **Location:** apps/web/src/middleware.ts
- **Description:** This was previously a valid production-risk finding. The admin network guard could be bypassed via `ADMIN_NETWORK_GUARD=disabled` with no production check. It is now hardened to fail closed by throwing when disabled in production.
- **Impact:** Production bypass risk from accidental env drift is removed.
- **Recommendation:** Keep admin routes behind a trusted reverse proxy that injects private internal headers consumed by the app (for example `x-internal-proxy-secret` and the proxy marker header).
  For Nginx Proxy Manager, configure explicit header injection on the upstream location, for example:
  ```nginx
  proxy_set_header X-Internal-Source "admin-loopback";
  proxy_set_header X-Internal-Proxy-Secret "long-random-secret";
  ```
  In-app fail-closed enforcement:
  ```ts
  if (
    process.env.ADMIN_NETWORK_GUARD === 'disabled' &&
    process.env.NODE_ENV === 'production'
  ) {
    throw new Error('ADMIN_NETWORK_GUARD cannot be disabled in production');
  }
  ```

---

#### [LOW][RESOLVED] Hardcoded fallback salt for admin IP/UA fingerprinting

- **Location:** apps/web/src/lib/admin/auth/clientFingerprint.ts
- **Description:** The hardcoded fallback salt has been removed. `getSalt()` now throws when neither `ADMIN_FINGERPRINT_SALT` nor `IP_HASH_SALT` is configured.
- **Impact:** The known-default-salt deanonymization risk is removed.
- **Recommendation:** Keep this fail-closed behavior and ensure non-empty salt env vars are required in all environments (including test/CI):
  ```ts
  function getSalt(): string {
    const salt = process.env.ADMIN_FINGERPRINT_SALT || process.env.IP_HASH_SALT;
    if (!salt || !salt.trim()) {
      throw new Error('ADMIN_FINGERPRINT_SALT or IP_HASH_SALT is required');
    }
    return salt;
  }
  ```

---

#### [INFO] In-memory admin rate limiter is deployment-sensitive

- **Location:** apps/web/src/lib/admin/auth/rateLimit.ts
- **Description:** The admin auth rate limiter uses a module-level in-memory `Map`. Each process/container has an independent bucket, and bucket state is reset on process/container restart.
- **Impact:** In a single Docker container on one VPS, this is acceptable as defense-in-depth because the durable lockout control is DB-backed (`failedLoginCount` + `lockedUntil`). Risk returns if deployment changes to PM2 cluster mode, Docker replicas, multiple VPS instances, or serverless/horizontal scaling.
- **Recommendation:** Keep DB lockout as the primary brute-force control and keep in-memory limiting as extra protection. Add an explicit scale trigger: if more than one process/container instance is introduced, move auth rate limiting to shared storage (Redis/DB-backed bucket).

---

#### [LOW][RESOLVED] Session token not invalidated after `DELETE /api/account`

- **Location:** apps/web/src/app/api/account/route.ts
- **Description:** Account deletion now clears NextAuth/Auth.js session cookies in the DELETE response (`next-auth.session-token`, `__Secure-next-auth.session-token`, `authjs.session-token`, `__Secure-authjs.session-token`).
- **Impact:** Deleted-account sessions are invalidated immediately in the browser, reducing post-delete token reuse windows.
- **Recommendation:** Keep this cookie-clear list aligned with NextAuth/Auth.js cookie naming if auth library configuration changes.

---

#### [LOW][RESOLVED] `avatarUrl` served from arbitrary origins via `<img>` (bypasses `next/image` domain allowlist)

- **Location:** apps/web/src/app/components/profile-menu.tsx, apps/web/src/app/u/[username]/page.tsx, apps/web/src/app/leaderboard/page.tsx, apps/web/src/app/leaderboard/repos/page.tsx, apps/web/src/lib/profile-menu.ts
- **Description:** Avatar render points were migrated to `next/image`, and a shared helper (`getAllowedAvatarUrl`) now enforces `https://avatars.githubusercontent.com/...` before rendering.
- **Impact:** Arbitrary-origin avatar rendering risk is removed for these paths.
- **Recommendation:** Keep the shared allowlist helper as the default avatar rendering path, and add write-time DB/app validation for `avatarUrl` to maintain invariant at persistence boundaries.

---

#### [LOW][RESOLVED] `displayName` stored without trimming

- **Location:** apps/web/src/app/api/settings/profile/route.ts
- **Description:** The PATCH handler now trims `displayName` and only updates when the normalized value is non-empty and <= 100 chars.
- **Impact:** Whitespace-only display names are no longer persisted.
- **Recommendation:** Keep normalization at API boundaries and preserve test coverage for blank/whitespace display names.

---

#### [INFO] bcrypt cost inconsistency (device secrets at cost 10, admin passwords at cost 12)

- **Location:** apps/web/src/app/api/connect/route.ts vs apps/web/src/lib/admin/password.ts
- **Description:** Device token secrets are bcrypt-hashed at cost 10; admin passwords at cost 12.
- **Recommendation:** Cost 10 is acceptable for high-entropy random secrets (device tokens). No change required, but document the rationale.

---

#### [INFO] `NEXTAUTH_SECRET` absence not validated at startup

- **Location:** apps/web/src/lib/auth.ts
- **Description:** `secret: process.env.NEXTAUTH_SECRET` is passed as-is. If the env var is missing in production, NextAuth v4 behavior depends on the version — some versions will auto-generate a secret per restart (breaking sessions), others throw.
- **Recommendation:** Add an explicit startup check: `if (!process.env.NEXTAUTH_SECRET) throw new Error('NEXTAUTH_SECRET is required');`

---

#### [INFO] `topModel` field sourced from user-uploaded payload

- **Location:** apps/web/src/app/api/upload/route.ts, apps/web/src/lib/svg.ts
- **Description:** `topModel` is derived from `modelId` fields in the uploaded payload (user-controlled). It is stored in `UserStat.topModel` and rendered in SVG badges. The SVG path uses `escapeXml()` before writing to the SVG template — XSS is correctly blocked. The Zod schema validates payload structure but does not restrict `modelId` values to a known list.
- **Impact:** A user can set their `topModel` to any string (e.g., `"<script>"`). The SVG correctly escapes it, but JSON API responses that include `topModel` return the raw value to clients; those clients must escape on render.
- **Recommendation:** No immediate action needed on the SVG path. For API consumers, document that `topModel` is user-controlled. Consider adding a length cap on `modelId` in the Zod schema (currently unconstrained).

---

### Positive Observations

- **Admin authentication is well-architected**: Two-factor TOTP enforcement, bcrypt password hashing at cost 12 with strength validation, lockout after 5 failed attempts, idle (30 min) and absolute (8 hr) session expiry, session token stored as SHA-256 hash only, `__Host-` prefixed cookie with `HttpOnly; Secure; SameSite=Strict`.
- **Admin surface is network-isolated by default**: The middleware network guard requires a shared secret in a trusted proxy header; failure defaults to 404 (not 401), hiding the surface from scanners.
- **Device token split design is correct**: `tokenId` (lookup key) and `secret` (bcrypt-hashed) are stored separately; the full token never touches the database. Revocation via `revokedAt` is checked on every upload.
- **SVG/badge XSS protection**: Both svg.ts and badge-svg.ts call `escapeXml()` on all user-derived data before SVG template insertion.
- **Audit trail for all destructive admin operations**: `withAuditedAction()` wraps every mutation with before/after snapshots and a two-phase log (ATTEMPTED → SUCCEEDED/FAILED).
- **TOTP secret encrypted at rest**: Admin TOTP seeds are encrypted with AES-256-GCM via the key ring (tokenEncryption.ts) before storage; the DB stores only the ciphertext.
- **Origin check on device link**: `POST /api/connect` verifies `Origin`/`Referer` against `NEXTAUTH_URL` via `isTrustedRequestOrigin()`.
- **Rate limiting is multi-dimensional**: Upload rate limits operate on three independent axes (device, user, IP), providing defense-in-depth even when one dimension is bypassed.
- **`confirm: true` required for all destructive admin mutations**: Suspend, restore, and delete handlers require `{ confirm: true }` in the body, preventing accidental or CSRF-triggered state changes.
- **Timing-safe admin login**: Unknown email and wrong password paths both run `bcrypt.compare` against a dummy hash, making them indistinguishable to timing attacks.
- **Security headers are applied globally**: `Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Strict-Transport-Security` (production only), and `Referrer-Policy` are set on all routes via next.config.ts.

---

### Verification Snapshot

- `$queryRawUnsafe` remediation implemented in leaderboard data queries:
  - apps/web/src/lib/repo-leaderboard-data.ts
  - apps/web/src/lib/ide-leaderboard-data.ts
- Validation run: `pnpm --filter @promptstreak/web test`
- Result: **179 passed, 0 failed**
- Additional guard verification in tests:
  - `ADMIN_NETWORK_GUARD=disabled` bypasses only outside production
  - `ADMIN_NETWORK_GUARD=disabled` throws in production
- CSP phase-1 verification in tests:
  - production CSP excludes `'unsafe-eval'`
  - development CSP retains `'unsafe-eval'` for tooling compatibility
- Fingerprint hardening verification in tests:
  - `hashIp` throws when no fingerprint salt env is configured
- Avatar origin restriction verification in tests:
  - `getAllowedAvatarUrl` accepts only `https://avatars.githubusercontent.com/...`

---

### Priority Remediation Order

1. **MEDIUM** — Tighten CSP (remove `'unsafe-inline'`/`'unsafe-eval'`, adopt nonces)
2. **LOW** — Harden and continuously verify proxy IP-header trust guarantees
3. **INFO** — Add explicit startup validation for `NEXTAUTH_SECRET`
4. **INFO** — Move admin auth rate limits to shared storage when scaling beyond single-instance VPS

---

### Deployment-Adjusted Conclusion

Given the stated Cloudflare + VPS firewall + Nginx header-sanitization architecture, no **Critical** or **High** findings remain at this time. Open items are now limited to one **Medium** CSP hardening item and one **Low** conditional proxy-trust item. Residual risk is primarily configuration drift risk: if firewall/proxy trust guarantees weaken, the conditional IP-header finding should be reclassified back to **HIGH** immediately.
