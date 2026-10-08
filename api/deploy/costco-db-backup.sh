#!/usr/bin/env bash
# Dump the Pi's costco_receipts database to a local gzipped file.
#
# The Pi holds the only copy of the data migrated out of DynamoDB, so this is
# worth running on its own merits; it is also the step that makes automated
# migrations safe (see api/deploy/README.md).
#
# Runs as root and authenticates through MariaDB's unix_socket plugin, so no
# password is stored, passed, or logged anywhere. Invoked by the nightly
# systemd timer, by hand before applying a migration script, and (in Phase 2)
# by costco-deploy before it migrates.
set -euo pipefail

DB=costco_receipts
DEST=${COSTCO_BACKUP_DIR:-/var/backups/costco}
KEEP_DAYS=${COSTCO_BACKUP_KEEP_DAYS:-14}

if [[ $EUID -ne 0 ]]; then
  echo "must run as root — this relies on MariaDB unix_socket auth for root" >&2
  exit 1
fi

install -d -o root -g root -m 0700 "$DEST"

ts=$(date -u +%Y%m%dT%H%M%SZ)
final="$DEST/$DB-$ts.sql.gz"
partial="$final.partial"

cleanup() { rm -f "$partial"; }
trap cleanup EXIT

# --single-transaction: a consistent snapshot without LOCK TABLES, so the
#   running API is never blocked (everything is InnoDB).
# --routines: Pomelo defines helper stored procedures during some migrations
#   (e.g. POMELO_BEFORE_DROP_PRIMARY_KEY); a dump without them would restore an
#   incomplete schema.
# `set -o pipefail` above is what makes a failing dump fail this script instead
# of quietly leaving a perfectly valid gzip of a truncated stream.
mariadb-dump --single-transaction --routines "$DB" | gzip -9 > "$partial"

# A dump that produced nothing useful is worse than no dump at all, because it
# is the file a panicked restore would reach for first.
gzip -t "$partial" || { echo "dump failed gzip integrity check" >&2; exit 1; }
zgrep -q 'CREATE TABLE' "$partial" || { echo "dump contains no CREATE TABLE statements" >&2; exit 1; }

mv "$partial" "$final"
trap - EXIT
chmod 0600 "$final"
echo "wrote $final ($(du -h "$final" | cut -f1))"

pruned=$(find "$DEST" -maxdepth 1 -type f -name "$DB-*.sql.gz" -mtime "+$KEEP_DAYS" -print -delete | wc -l | tr -d ' ')
echo "pruned $pruned backup(s) older than $KEEP_DAYS days"
