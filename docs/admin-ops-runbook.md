# Admin operations runbook

This runbook covers the operator side of the PromptStreak admin surface
introduced in Phase A of `docs/promptstreak-admin-implementation-plan.md`. The
admin surface is intentionally **loopback-only** on the production VPS — there
is no public URL. Reach it through an SSH tunnel.

## Architecture (one-liner)

```
laptop --[SSH tunnel :8443 → vps:127.0.0.1:8081]--> Caddy admin vhost
                                                       │ injects X-Internal-* headers
                                                       ▼
                                                    Next.js (apps/web)
                                                       │ middleware verifies headers
                                                       │ requireAdmin checks session + 2FA
                                                       ▼
                                                    Postgres
```

Public traffic never touches the admin vhost. The Next.js middleware
(`apps/web/src/middleware.ts`) returns `404` whenever the trusted-origin
headers are missing or wrong, so even if a misconfiguration exposed the path
publicly the surface still appears not to exist.

## Environment variables

All required env vars live in [`deploy/.env.example`](../deploy/.env.example).
Copy it to `.env` on the VPS and fill in real values. Critical secrets:

- `ADMIN_INTERNAL_PROXY_SECRET` — shared between Caddy and the Next.js
  middleware. If unset, the middleware fails closed (404).
- `ADMIN_FINGERPRINT_SALT` — sha256 salt for hashing IP/email/user-agent
  before they hit the audit log.
- `ADMIN_TOTP_KEYS` / `ADMIN_TOTP_ACTIVE_KEY` — versioned AES-256-GCM key ring
  for the encrypted TOTP secret.

Generate fresh secrets with `openssl rand -hex 32` (or `-base64 32` for the
key-ring entries).

## First-time bootstrap

On the VPS:

```bash
# 1. Provision the database schema (one time, or after schema changes).
docker compose -f deploy/docker-compose.yml --env-file .env exec web \
  pnpm --filter @promptstreak/web prisma db push --skip-generate

# 2. Create the first admin (interactive). The CLI prompts for password
#    and prints the TOTP otpauth URL once.
docker compose -f deploy/docker-compose.yml --env-file .env exec web \
  pnpm --filter @promptstreak/web admin:create --email you@example.com --role SUPER_ADMIN
```

Save the printed recovery codes somewhere offline. They are shown only once.

## Reaching the admin UI

From your laptop:

```bash
ssh -L 8443:127.0.0.1:8081 user@vps
```

Then open <https://localhost:8443/admin>. Browser will warn about the
self-signed cert — accept it once per laptop. Sign in with your email +
password, complete the TOTP step.

## Routine operations

- **Rotate the proxy secret**: change `ADMIN_INTERNAL_PROXY_SECRET` in `.env`
  and restart both `web` and `caddy` (`docker compose ... up -d`). Restart
  order does not matter — until both have the new value, the middleware
  returns 404 on every admin request.
- **Rotate a TOTP encryption key**: append a new entry to `ADMIN_TOTP_KEYS`
  (e.g. `v1:...,v2:...`), set `ADMIN_TOTP_ACTIVE_KEY=v2`, restart `web`. New
  enrollments use v2; existing secrets keep decrypting under v1 until they
  are re-enrolled.
- **Read the audit log**: every admin action — successful or failed — writes a
  row to `AdminActionLog` with status `ATTEMPTED`/`SUCCEEDED`/`FAILED` and a
  reason in the metadata JSON. Email/IP/UA are sha256-salted; correlate by
  hash, never by raw value.

## Lockout recovery

After 5 consecutive failed password attempts, an admin account is locked for
30 minutes. To clear a lockout early (operator running as a higher-privileged
admin):

```sql
UPDATE "AdminUser"
SET "failedLoginCount" = 0, "lockedUntil" = NULL
WHERE email = 'locked-user@example.com';
```

If the locked account is the only admin, run the bootstrap CLI from the host
to provision a second `SUPER_ADMIN` and recover from there.

## Lost TOTP device, no recovery codes

This is a destructive recovery — it invalidates 2FA enrollment for that
admin and forces them through enrollment again on next login.

```sql
UPDATE "AdminUser"
SET "totpSecretCiphertext" = NULL,
    "totpSecretKeyVersion" = NULL,
    "totpConfirmedAt" = NULL
WHERE email = 'locked-user@example.com';

DELETE FROM "AdminRecoveryCode" WHERE "adminUserId" = (
  SELECT id FROM "AdminUser" WHERE email = 'locked-user@example.com'
);

-- Also revoke any half-authenticated sessions.
DELETE FROM "AdminSession" WHERE "adminUserId" = (
  SELECT id FROM "AdminUser" WHERE email = 'locked-user@example.com'
);
```

Always perform this from a higher-privileged admin account so the change
itself appears in the audit log.

## Emergency: revoke all admin sessions

```sql
DELETE FROM "AdminSession";
```

Followed by a `caddy` restart for good measure. All admins will be forced
through password + 2FA again on next visit.

## Troubleshooting

- **`/admin` returns 404 even from the SSH tunnel** — Caddy is not injecting
  the trusted-origin headers, or `ADMIN_INTERNAL_PROXY_SECRET` differs
  between Caddy and `web`. Check `docker compose logs caddy web` and confirm
  both containers see the same value.
- **`prisma generate` fails with EPERM on Windows dev** — kill any running
  `node.exe` processes that have the query engine DLL open.
- **Tests pass locally but `npx tsc --noEmit` fails** — there are pre-existing
  type errors in unrelated legacy files (`badges/data.test.ts` BigInt
  literals, `crypto/tokenEncryption.test.ts` `NODE_ENV`). Scope the type
  check to admin code: `npx tsc --noEmit 2>&1 | Select-String "src.lib.admin|src.app.api.admin"`.
