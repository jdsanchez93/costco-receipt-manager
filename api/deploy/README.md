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

## Frontend deploy (AWS + GitHub, one-time)

`.github/workflows/frontend.yml` authenticates with GitHub OIDC and assumes an
IAM role, so no AWS access keys are stored in this repository.

### 1. OIDC provider (once per AWS account)

AWS permits exactly one provider per URL per account, and it's a shared
account-level resource rather than something an app stack should own — hence
created out of band and referenced by ARN.

```bash
aws iam list-open-id-connect-providers    # reuse the existing ARN if present
```

If there isn't one:

```bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com
```

### 2. Deploy the role

Add to `cdk-backend/cdk.context.json` (gitignored):

```json
"nextFrontendGithubRepo": "jdsanchez93/costco-receipt-manager",
"nextFrontendGithubOidcProviderArn": "arn:aws:iam::<account>:oidc-provider/token.actions.githubusercontent.com"
```

```bash
cd cdk-backend && npx cdk deploy NextFrontendStack
```

This adds only an `AWS::IAM::Role` and its policy — verified by diffing the
synthesized template with and without those context values. The role can write
only to the frontend bucket and invalidate only that one distribution, and its
trust policy requires both this repository **and** its `production`
environment, so a workflow on another branch or from a fork's pull request
cannot assume it. That scoping matters because this repository is public.

### 3. GitHub configuration

Create a `production` **Environment** with a deployment branch rule limited to
`main`, then set these repository **variables** (not secrets — none of them are
sensitive, and secret masking only makes logs harder to read):

| Variable | Value |
|---|---|
| `AWS_DEPLOY_ROLE_ARN` | `GithubDeployRoleArn` stack output |
| `FRONTEND_BUCKET` | `FrontendBucketName` stack output |
| `CLOUDFRONT_DISTRIBUTION_ID` | `CloudFrontDistributionId` stack output |

```bash
aws cloudformation describe-stacks --stack-name NextFrontendStack \
  --query 'Stacks[0].Outputs' --output table
```

### Verifying a deploy

```bash
curl -sI https://next.jd-sanchez.com/index.html | grep -i cache-control
# expect: no-cache,must-revalidate
curl -s https://next.jd-sanchez.com/ | grep -o 'main-[A-Za-z0-9_-]*\.js'
curl -sI "https://next.jd-sanchez.com/<that file>" | grep -i cache-control
# expect: public,max-age=31536000,immutable
```

Then log in and load a receipt, to confirm the whole
Auth0 → CloudFront → tunnel → API → MariaDB path.
