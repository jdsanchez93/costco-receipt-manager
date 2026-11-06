#!/usr/bin/env bash
# Deploy a costco-api image to the Pi, by digest.
#
# Installed by hand as /usr/local/sbin/costco-deploy, and the one thing the
# self-hosted runner's user may run as root (see costco-deploy.sudoers). So
# its argument is untrusted input: it must be a bare digest, resolved against
# a repository fixed here, which means the sudo grant can deploy what api.yml
# pushed to GHCR and nothing else.
#
# Usage:
#   costco-deploy sha256:<digest>   pull, back up, migrate, swap, health-check
#   costco-deploy --rollback        back to the previous image, no migration
#   costco-deploy --recreate        same image, fresh container (after editing .env)
#
# A deploy whose new container fails its health check puts the previous image
# back and exits non-zero. A failed migration leaves the running container
# untouched. Migrations must stay additive for either of those to be safe;
# rolling back the image never rolls back the schema.
#
# Output lands in the deploy repo's Actions log. Keep it to progress lines:
# nothing here prints env, config, or a full `docker inspect`.
set -euo pipefail

export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

IMAGE_REPO=ghcr.io/jdsanchez93/costco-api
DIR=/opt/costco-api
STATE=$DIR/deploy.env
# Must match the Kestrel URL in docker-compose.prod.yml.
HEALTH_URL=http://127.0.0.1:8080/healthz
HEALTH_TIMEOUT_SECONDS=60

usage() {
  echo "usage: costco-deploy sha256:<64 hex> | --rollback | --recreate" >&2
  exit 2
}

if [[ $EUID -ne 0 ]]; then
  echo "must run as root" >&2
  exit 1
fi
[[ $# -eq 1 ]] || usage

# One deploy at a time, whether from CI or by hand.
exec 9>/run/lock/costco-deploy.lock
flock -w 300 9 || { echo "another deploy is still running" >&2; exit 1; }

# Written only by write_state below, so parsed rather than sourced.
current="" previous=""
if [[ -f $STATE ]]; then
  current=$(sed -n 's/^API_IMAGE=//p' "$STATE")
  previous=$(sed -n 's/^PREVIOUS_API_IMAGE=//p' "$STATE")
fi

compose() {
  docker compose --project-directory "$DIR" -f "$DIR/docker-compose.prod.yml" \
    --env-file "$STATE" "$@"
}

write_state() {  # image previous-image
  local tmp
  tmp=$(mktemp "$STATE.XXXXXX") || return 1
  printf 'API_IMAGE=%s\nPREVIOUS_API_IMAGE=%s\n' "$1" "$2" > "$tmp" || return 1
  mv "$tmp" "$STATE"
}

# The commit an image was built from, from the label api.yml sets.
revision() {
  docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$1" 2>/dev/null \
    || echo unknown
}

healthy() {
  local deadline=$((SECONDS + HEALTH_TIMEOUT_SECONDS))
  until curl -fs --max-time 3 -o /dev/null "$HEALTH_URL"; do
    ((SECONDS < deadline)) || return 1
    sleep 2
  done
}

# Callers test the result, which turns off `set -e` in here, hence the
# explicit `|| return 1`s.
activate() {  # image previous-image
  write_state "$1" "$2" || return 1
  echo "==> starting $1 (commit $(revision "$1"))"
  compose up -d || return 1
  if ! healthy; then
    echo "$HEALTH_URL did not answer healthy within ${HEALTH_TIMEOUT_SECONDS}s" >&2
    return 1
  fi
  echo "==> healthy"
}

# Puts back whatever was running when this invocation started, then fails.
restore() {
  if [[ -z $current ]]; then
    echo "nothing to go back to: this was the first deploy" >&2
    exit 1
  fi
  echo "==> going back to $current" >&2
  activate "$current" "$previous" || echo "and that is unhealthy too; look at the Pi" >&2
  exit 1
}

# Keeps the two images a rollback could need; removes other local copies.
# Best-effort, so a failed removal never fails a deploy.
prune() {
  local keep_current keep_previous ref
  keep_current=$(sed -n 's/^API_IMAGE=//p' "$STATE")
  keep_previous=$(sed -n 's/^PREVIOUS_API_IMAGE=//p' "$STATE")
  docker image ls --digests --format '{{.Repository}}@{{.Digest}}' "$IMAGE_REPO" |
    while read -r ref; do
      [[ $ref == *@sha256:* && $ref != "$keep_current" && $ref != "$keep_previous" ]] || continue
      docker image rm "$ref" >/dev/null 2>&1 && echo "pruned $ref" || true
    done
}

case $1 in
  sha256:*)
    [[ $1 =~ ^sha256:[0-9a-f]{64}$ ]] || usage
    target=$IMAGE_REPO@$1

    echo "==> pulling $target"
    docker pull --quiet "$target" >/dev/null

    echo "==> backing up the database"
    costco-db-backup

    # As costco_migrator, whose credentials live in migrator.env and never in
    # .env: .env is the API container's env_file, and the API gets DML only.
    echo "==> applying migrations"
    if ! docker run --rm --network host --env-file "$DIR/migrator.env" \
        -e Logging__LogLevel__Microsoft.EntityFrameworkCore.Migrations=Information \
        "$target" --migrate; then
      echo "migration failed; the running container is unchanged, and the backup above is from just before it" >&2
      exit 1
    fi

    # Redeploying what is already running must not make it its own rollback.
    if [[ $target == "$current" ]]; then keep=$previous; else keep=$current; fi
    activate "$target" "$keep" || restore
    prune || echo "pruning old images failed; the deploy itself succeeded" >&2
    ;;

  --rollback)
    [[ -n $previous ]] || { echo "no previous image recorded" >&2; exit 1; }
    activate "$previous" "$current" || restore
    ;;

  --recreate)
    [[ -n $current ]] || { echo "nothing has been deployed yet" >&2; exit 1; }
    echo "==> recreating $current"
    compose up -d --force-recreate
    healthy || { echo "unhealthy after recreate; check .env" >&2; exit 1; }
    echo "==> healthy"
    ;;

  *)
    usage
    ;;
esac
