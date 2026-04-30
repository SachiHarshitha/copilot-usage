#!/bin/sh
# Post-archive hook for prodrigestivill/postgres-backup-local.
#
# Invoked by the upstream image after every successful dump+rotation cycle.
# Receives the path to the freshly-written dump as $1 (e.g. /backups/daily/...).
#
# Behavior:
#   * If $AGE_RECIPIENTS_FILE points to a readable file containing one or more
#     `age` recipients (one per line), every newly-rotated *.sql.gz is encrypted
#     in place to *.sql.gz.age and the original plaintext dump is removed.
#   * If $AGE_RECIPIENTS_FILE is unset or empty, the hook is a no-op and the
#     plaintext gzip dumps remain on disk. This is intentional for local dev.
#
# By design we never need a private key inside the container — encryption uses
# the public-key path of `age`. Decryption requires the offline-escrowed key
# (see docs/ops/key-escrow.md).
set -eu

DUMP_PATH="${1:-}"

if [ -z "${AGE_RECIPIENTS_FILE:-}" ]; then
  exit 0
fi

if [ ! -r "$AGE_RECIPIENTS_FILE" ]; then
  echo "encrypt.sh: AGE_RECIPIENTS_FILE=$AGE_RECIPIENTS_FILE not readable" >&2
  exit 1
fi

# Encrypt every dump under /backups that doesn't already have an .age sibling.
# We can't rely on $1 alone because the hook may also fire after rotation
# operations that touch multiple files.
find /backups -type f -name '*.sql.gz' ! -name '*.age' | while IFS= read -r f; do
  out="${f}.age"
  if [ -f "$out" ]; then
    continue
  fi
  if age --encrypt --recipients-file "$AGE_RECIPIENTS_FILE" --output "$out.tmp" "$f"; then
    mv "$out.tmp" "$out"
    rm -f "$f"
  else
    rm -f "$out.tmp"
    echo "encrypt.sh: failed to encrypt $f" >&2
    exit 1
  fi
done
