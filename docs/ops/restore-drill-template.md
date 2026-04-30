# PromptStreak — Restore Drill Template (H.4)

Copy this file to `docs/ops/restore-drill-<YYYY-MM-DD>.md` and fill in every
placeholder. The drill is **completed** when every checkbox is ticked AND the
file is committed to `main`.

Cadence: at least quarterly, and unconditionally before each production
launch or major schema change.

---

## Drill metadata

- **Date:** YYYY-MM-DD
- **Operator(s):** \<github handles>
- **Source backup file:** `<filename>.sql.gz.age`
- **Backup tier (daily / weekly / monthly):** \<tier>
- **Off-site copy used? (Y/N):** \<value> *(N is acceptable until H.2 lands)*
- **Target environment:** clean staging VPS, fresh Postgres volume
- **Started at:** HH:MM UTC
- **Completed at:** HH:MM UTC
- **Total elapsed:** \<minutes>

## Pre-drill state

- [ ] Confirmed both escrowed keys readable per the procedure in
      [key-escrow.md](key-escrow.md).
- [ ] Staging VPS provisioned with same OS + Docker version as production.
- [ ] This repo cloned to staging at the production-deployed commit SHA:
      `<sha>`.
- [ ] No production traffic involved; production untouched.

## Steps

1. [ ] **Pull backup.** Copy the chosen `*.sql.gz.age` to the staging host.
       File size: \<bytes>. SHA-256: `<sha256>`.
2. [ ] **Decrypt.** With the escrowed age private key on the staging host
       (transient — shred after the drill):
       ```sh
       age --decrypt -i promptstreak-backup.key <file>.sql.gz.age > dump.sql.gz
       gunzip dump.sql.gz
       ```
       Resulting `dump.sql` size: \<bytes>.
3. [ ] **Bring up the stack** with an empty `pgdata` volume:
       ```sh
       docker compose -f deploy/docker-compose.yml --env-file .env up -d postgres
       ```
4. [ ] **Restore.**
       ```sh
       docker compose exec -T postgres \
         psql -U $POSTGRES_USER -d $POSTGRES_DB < dump.sql
       ```
       Restore exit code: \<code>. No errors in `docker compose logs postgres`.
5. [ ] **Bring up the web tier** with the escrowed `GITHUB_TOKEN_ENCRYPTION_KEYS`
       value in `.env`:
       ```sh
       docker compose -f deploy/docker-compose.yml --env-file .env up -d
       ```
6. [ ] **Decrypt one GitHub credential.** Pick one row from
       `GitHubCredential` and run:
       ```sh
       docker compose exec web node -e "
         const { decryptToken } = require('./.next/server/lib/crypto/tokenEncryption');
         console.log((await decryptToken(process.argv[1])).slice(0, 8));
       " "<encrypted-token-from-row>"
       ```
       First 8 chars of decrypted value: `<value>` (compare against expected
       prefix from the operator's records).
7. [ ] **Verification route smoke test.** Hit the public health endpoint and
       one verification route from the laptop via SSH tunnel:
       ```sh
       curl -sS http://127.0.0.1:8081/api/health | jq .
       curl -sS http://127.0.0.1:8081/api/verify/<some-known-id>
       ```
       Both return HTTP 200 with the expected payload.
8. [ ] **Admin login smoke test.** SSH-tunnel to `/admin`, log in with the
       escrowed admin TOTP, confirm the audit log shows the just-completed
       `LOGIN_PASSWORD` SUCCEEDED row.
9. [ ] **Tear down.** `docker compose down -v` on staging. Shred the local
       copies of the dump, the decrypted SQL, and the age private key on the
       staging host.

## Post-drill assessment

- [ ] Time-to-restore was under \<target> minutes (current target: 60).
- [ ] No data loss observed: row counts in `User`, `GitHubCredential`,
      `AdminActionLog` match the source backup metadata recorded by the
      backup image.
- [ ] Encrypted GitHub token successfully decrypted with escrowed key.
- [ ] No surprises in the procedure; runbook still accurate. (If not, file
      issues to fix it.)

## Issues found

\<List anything that didn't work as documented. Each item links to a tracking
issue or a PR fixing the runbook.>

## Sign-off

- Operator A: \<handle> — \<date>
- Operator B: \<handle> — \<date>

After both sign-offs, this file is ready to commit.
