# Extends the approved upstream image with `age` (https://age-encryption.org/),
# a small, audited file-encryption tool. We do NOT modify any upstream behavior;
# the only addition is the `age` binary and a post-archive hook script that
# encrypts each freshly-written dump with the operator's public recovery key.
FROM prodrigestivill/postgres-backup-local:15

USER root

# `age` is in Alpine community since 3.16. The base image is alpine-based.
# Pin the package to a specific version range via apk for reproducibility.
RUN apk add --no-cache age=~1

# The upstream image runs scripts in /hooks/post-archive after each successful
# dump rotation. See https://github.com/prodrigestivill/docker-postgres-backup-local#hooks
COPY postgres-backup-encrypt.sh /hooks/post-archive/encrypt.sh
RUN chmod +x /hooks/post-archive/encrypt.sh

# Drop back to the unprivileged user the upstream image uses.
USER postgres
