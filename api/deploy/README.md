# Deployment and operations

One-time setup for the pieces CI can't do itself. Everything here is manual on
purpose — see the notes on each section for why.

Phase 1 (this directory today) covers database backups and the frontend deploy
pipeline. Phase 2 — the self-hosted runner and automated API deploy — is
deliberately deferred until after the `costco.jd-sanchez.com` cutover and the
decommissioning of the old Lambda stack; nothing for it exists here yet.

---

## Database backups (on the Pi)

The Pi holds the only copy of the data migrated out of DynamoDB. `mariadb-dump`
runs as root over MariaDB's `unix_socket` plugin, so no password is stored,
passed, or logged.

```bash
sudo install -o root -g root -m 0755 costco-db-backup.sh /usr/local/bin/costco-db-backup
sudo install -o root -g root -m 0644 systemd/costco-db-backup.service /etc/systemd/system/
sudo install -o root -g root -m 0644 systemd/costco-db-backup.timer   /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now costco-db-backup.timer
```

Verify:

```bash
sudo /usr/local/bin/costco-db-backup     # should write one file and report its size
systemctl list-timers costco-db-backup   # next run should be listed
sudo ls -la /var/backups/costco
```

Dumps land in `/var/backups/costco` (`0700`, files `0600`) and are pruned after
14 days. Override with `COSTCO_BACKUP_DIR` / `COSTCO_BACKUP_KEEP_DAYS`.

A failing dump leaves no file behind: the script writes to a `.partial`, checks
gzip integrity and that the output actually contains `CREATE TABLE`, and only
then renames. A truncated dump that looks restorable is worse than no dump,
because it's the file a panicked restore reaches for first.

**Run this by hand before applying any migration script**, until Phase 2 wires
it into the deploy:

```bash
sudo /usr/local/bin/costco-db-backup
mysql costco_receipts < ~/migrate.sql    # as costco_migrator, see redesign-plan.local.md
```

### Restore drill

Worth doing once, so the first restore isn't also the first rehearsal:

```bash
docker run --rm -d --name restore-drill \
  -e MARIADB_ROOT_PASSWORD=tmp -e MARIADB_DATABASE=costco_receipts mariadb:11.8
until docker exec restore-drill mariadb -uroot -ptmp -e 'SELECT 1' >/dev/null 2>&1; do sleep 1; done

zcat /var/backups/costco/costco_receipts-<ts>.sql.gz \
  | docker exec -i restore-drill mariadb -uroot -ptmp costco_receipts

docker exec restore-drill mariadb -uroot -ptmp costco_receipts \
  -e 'SHOW TABLES; SELECT COUNT(*) FROM receipts; SELECT * FROM __EFMigrationsHistory;'
docker rm -f restore-drill
```

The migrations history in that last query should match the migrations under
`api/CostcoReceipts.Api/Migrations/`.

The dumps are local-only, so a dead SSD loses them along with the database.
Replicating them off-box would mean widening the Pi's IAM user past
`s3:PutObject` on `uploads/*` — a real decision, not a freebie, so it is
deliberately not done here.

---

## Frontend deploy — remaining setup

`.github/workflows/frontend.yml` authenticates with GitHub OIDC and assumes an
IAM role, so no AWS access keys are stored in this repository.

**Already done** during the 2026-10-05 cutover (see `cdk-backend/RUNBOOK.md`):

- The account's GitHub OIDC provider already existed and is referenced by ARN
  (`arn:aws:iam::515966506000:oidc-provider/token.actions.githubusercontent.com`).
  Nothing to create — the account hosts other projects that may already use it,
  which is why the stack references rather than creates it.
- The deploy role is deployed as part of `Prod-CostcoReceipts-Frontend`:
  `arn:aws:iam::515966506000:role/costco-receipts-prod-frontend-deploy`. It can
  write only to the frontend bucket and invalidate only that one distribution,
  and its trust policy requires both this repository **and** its `production`
  environment — which matters because this repository is public.

### What is left: GitHub configuration

Do this **before** committing `frontend.yml`. The workflow triggers on pushes
touching `frontend-angular/**`, and if it runs first it will fail at credential
assumption *and* implicitly create a `production` environment with no
protection rules — losing the deployment-branch restriction the role's trust
policy depends on.

1. Create a **`production` environment** with a deployment branch rule limited
   to `main`. Optionally add yourself as a required reviewer.
2. Set these repository **variables** (not secrets — none are sensitive, and
   secret masking only makes logs harder to read):

| Variable | Value |
|---|---|
| `AWS_DEPLOY_ROLE_ARN` | `arn:aws:iam::515966506000:role/costco-receipts-prod-frontend-deploy` |
| `FRONTEND_BUCKET` | `costco-receipts-prod-frontend-515966506000` |
| `CLOUDFRONT_DISTRIBUTION_ID` | `E2EVLA19XVOJOI` |

Re-read them from the stack rather than trusting this table if anything has
been redeployed since:

```bash
aws cloudformation describe-stacks --stack-name Prod-CostcoReceipts-Frontend \
  --query 'Stacks[0].Outputs' --output table --profile jd-sanch-admin
```

### Verifying a deploy

```bash
curl -sI https://costco.jd-sanchez.com/index.html | grep -i cache-control
# expect: no-cache,must-revalidate

curl -s https://costco.jd-sanchez.com/ | grep -o 'main-[A-Za-z0-9_-]*\.js'
curl -sI "https://costco.jd-sanchez.com/<that file>" | grep -i cache-control
# expect: public,max-age=31536000,immutable
```

Then log in and open a receipt, to exercise
Auth0 → CloudFront → Cloudflare Tunnel → Pi → MariaDB.
