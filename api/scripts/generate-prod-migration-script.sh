#!/usr/bin/env bash
# Generates an idempotent EF Core migration script against a throwaway
# MariaDB container matching the Pi's real version -- not the local-dev
# mysql:8.0 docker-compose service, whose dialect can differ enough
# (e.g. JSON columns) to produce a script that fails or silently drifts
# from what the real target needs. See docs/redesign-plan.local.md's
# "Gotchas worth remembering" for why this matters.
#
# Never connects to the real Pi/prod database -- EF's design-time
# factory needs *a* live connection just to detect the SQL dialect
# (ServerVersion.AutoDetect), even though script generation itself
# writes nothing. The throwaway container satisfies that without ever
# touching real credentials.
#
# Usage:
#   api/scripts/generate-prod-migration-script.sh [output-file]
#
# Then apply the result on the Pi as costco_migrator (see
# docs/redesign-plan.md for the recommended process and
# docs/redesign-plan.local.md for the credential setup).

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
echo "Next, on the Pi as costco_migrator (see docs/redesign-plan.local.md for credential setup):"
echo "  scp $OUTPUT_FILE pi:~/migrate.sql"
echo "  ssh pi 'mysql costco_receipts < ~/migrate.sql && rm ~/migrate.sql'"
