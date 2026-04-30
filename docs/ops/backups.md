# PromptStreak — Postgres Backups (H.1)

Daily encrypted Postgres dumps with rotation. Backups never leave the VPS in
plaintext; the only key that can decrypt them is escrowed offline (see
[key-escrow.md](key-escrow.md)).

## What runs

The `postgres-backup` service in [`deploy/docker-compose.yml`](../../deploy/docker-compose.yml)
extends `prodrigestivill/postgres-backup-local:15` with:

- the `age` binary (Alpine community package), and
- a post-archive hook ([`deploy/postgres-backup-encrypt.sh`](../../deploy/postgres-backup-encrypt.sh))
  that encrypts each rotated dump in place to `*.sql.gz.age` and removes the
  plaintext file.

Schedule and retention (set via env vars on the service):

| Tier    | Retained |
| ------- | -------- |
| Daily   | 7        |
| Weekly  | 4        |
| Monthly | 6        |

Total maximum on disk: 17 encrypted dumps. The `pgbackups` named volume holds
them.

## One-time setup on a fresh VPS

1. Generate the recovery keypair on a TRUSTED LAPTOP (never on the VPS):
   ```sh
   age-keygen -o promptstreak-backup.key
   age-keygen -y promptstreak-backup.key   # prints the public key
   ```
2. Copy the public key (the `age1...` line) into [`deploy/age-recipients.txt`](../../deploy/age-recipients.txt),
   replacing the placeholder. Commit the change.
3. Escrow the PRIVATE key per [key-escrow.md](key-escrow.md). Then shred every
   on-disk copy on the laptop.
4. Bring the stack up:
   ```sh
   docker compose -f deploy/docker-compose.yml --env-file .env up -d --build
   ```

## Verifying a backup

After the first scheduled run (or manually triggered with
`docker compose exec postgres-backup /backup.sh`):

```sh
docker compose exec postgres-backup ls -lh /backups/daily
```

You should see one or more `*.sql.gz.age` files and zero `*.sql.gz` files. If
you see plaintext gzip files, the encryption hook failed — investigate before
relying on the backup.

## Negative test (per acceptance criteria)

Confirm a backup is unreadable without the recovery key:

```sh
docker compose exec postgres-backup sh -c '
  f=$(ls /backups/daily/*.sql.gz.age | head -1)
  age --decrypt "$f" 2>&1 || true
'
# Expected: "no identity matched any of the recipients"
```

## Restoring (smoke test, NOT a real restore drill — see H.4)

On a workstation that has the escrowed private key:

```sh
scp vps:/var/lib/docker/volumes/deploy_pgbackups/_data/daily/<file>.sql.gz.age .
age --decrypt -i promptstreak-backup.key <file>.sql.gz.age | gunzip | head -50
```

A real restore drill spins up a fresh Postgres and replays the dump end to end.
See [restore-drill-template.md](restore-drill-template.md).

## Free-space monitoring

The image exposes a healthcheck on `:8080`. Wire it into Grafana (Phase I) or
add a simple cron alert that fires when the volume drops below 20 % free:

```sh
docker run --rm -v deploy_pgbackups:/b alpine df -h /b
```

## What this does NOT cover (yet)

- **H.2 (off-VPS copy)**: deferred until an off-site bucket is chosen.
  Currently a single-VPS-failure event = total loss of backups.
- **Disk-level encryption**: the `pgbackups` volume holds ciphertext but the
  underlying VPS disk should still be on LUKS for defense in depth.
