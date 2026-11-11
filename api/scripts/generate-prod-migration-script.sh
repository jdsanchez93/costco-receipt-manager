#!/usr/bin/env bash
# Generates an idempotent EF Core migration script against a throwaway
# MariaDB container matching the Pi's real version.
#
# Local dev now runs MariaDB too, so the dialect argument for a separate
# container no longer applies. What does still apply: this one is empty.
# An idempotent script has to be exercised from a clean schema for every
# guard to be taken, and the local dev database already has the migrations
# applied -- running it there would skip almost everything it needs to
# prove.
#
# Never connects to the real Pi/prod database. Generating the script needs
# no database at all, since Database:ServerVersion pins the dialect; the
# throwaway container is only what the script is test-applied to.
#
# Usage:
#   api/scripts/generate-prod-migration-script.sh [output-file]
#
# Deploys apply migrations themselves (costco-deploy runs the new image with
# --migrate), so this is for reviewing the SQL a migration will run, or for
# applying it by hand when a deploy can't (see api/deploy/README.md).

set -euo pipefail

MARIADB_VERSION="11.8"   # matches the Pi's real MariaDB version -- update if the Pi's ever upgraded
CONTAINER_NAME="costco-migration-script-tmp"
TEMP_PASSWORD="tempPassw0rd!"
OUTPUT_FILE="${1:-/tmp/costco-migrate-$(date +%s).sql}"
PORT=13307

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_DIR="$SCRIPT_DIR/../CostcoReceipts.Api"

cleanup() {
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "==> Starting throwaway MariaDB $MARIADB_VERSION container..."
docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
docker run --rm -d --name "$CONTAINER_NAME" \
  -e MARIADB_ROOT_PASSWORD="$TEMP_PASSWORD" \
  -e MARIADB_DATABASE=costco_receipts \
  -p "$PORT:3306" \
  "mariadb:$MARIADB_VERSION" >/dev/null

echo "==> Waiting for it to be ready..."
ready=false
for _ in $(seq 1 30); do
  if docker exec "$CONTAINER_NAME" mariadb -uroot -p"$TEMP_PASSWORD" -e "SELECT 1" >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
if [ "$ready" != "true" ]; then
  echo "MariaDB container never became ready." >&2
  exit 1
fi

echo "==> Generating idempotent migration script..."
(
  cd "$API_DIR"
  ConnectionStrings__MySql="Server=127.0.0.1;Port=$PORT;Database=costco_receipts;User=root;Password=$TEMP_PASSWORD;" \
    dotnet ef migrations script --idempotent -o "$OUTPUT_FILE"
)

echo "==> Sanity-testing the script against the same throwaway container..."
docker exec -i "$CONTAINER_NAME" mariadb -uroot -p"$TEMP_PASSWORD" costco_receipts < "$OUTPUT_FILE"

echo
echo "Done: $OUTPUT_FILE"
echo "Applied cleanly against a real MariaDB $MARIADB_VERSION instance -- safe to review and ship."
echo
echo "Deploys apply migrations on their own. To apply this by hand instead, back up first:"
echo "  see api/deploy/README.md, Database backups"
