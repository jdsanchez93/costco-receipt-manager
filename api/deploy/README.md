# Deployment and operations

One-time setup for the pieces CI can't do itself. Everything here is manual on
purpose — see the notes on each section for why.

Covers the API deploy pipeline and the Pi it deploys to, database backups, and
the frontend deploy pipeline.

---

## API deploy

Merging a pull request that touches `api/CostcoReceipts.Api/**` deploys it:

```
costco-receipt-manager (public)  .github/workflows/api.yml
├─ build   GitHub-hosted arm64: docker build → ghcr.io/jdsanchez93/costco-api:sha-<sha>, :main
└─ deploy  environment: production — starts the private workflow, then watches it
     └─ costco-deploy (private)  deploy.yml, on the Pi's self-hosted runner
          sudo costco-deploy sha256:<digest>
            pull → costco-db-backup → migrate (one-shot container) → compose up → /healthz
            unhealthy → previous image back, run fails
```

**Why two repositories.** A self-hosted runner executes whatever job it is
sent, and in a public repository any workflow can send it one, including a
workflow edited in a fork's pull request, since a `pull_request` run uses the
PR's own workflow files. Restricting the deploy workflow to `main` and the
`production` environment doesn't help; another workflow simply wouldn't
declare them. GitHub's advice is to keep self-hosted runners off public
repositories, and on a personal account there are no runner groups to limit
one to chosen workflows. So the runner is registered on
`jdsanchez93/costco-deploy`, where only the owner can write workflows. The
image is still built here, on the arm64 runner that is free for public
repositories.

**The link between them** is a GitHub App, installed only on
`costco-deploy`, with one repository permission: **Actions: read and write**.
That is enough to start and re-run `deploy.yml`, and too little to change it:
pushing a commit needs Contents, and touching a workflow file needs Workflows.
A leaked key can therefore redeploy an image that is already in the GHCR
package, and nothing else. It is a `production` environment secret here, so
only a job on `main` can read it. An App rather than a fine-grained token,
because it doesn't expire and doesn't act as you, so it doesn't carry your
bypass of the `main` ruleset.

**Why the script lives on the Pi, not in the private repository.** If the
runner ran a script it had checked out, its sudo entry would amount to root
for whatever that repository contains. Installed by hand and root-owned,
`costco-deploy` is the runner user's only privilege, and it takes nothing but
a digest from a fixed GHCR repository. So someone with your GitHub account can
deploy a bad *image*, which runs as non-root in a container with the API's
secrets, but can't get root on the host. The price is that changes to
`costco-deploy.sh`, `costco-deploy.sudoers` or `docker-compose.prod.yml` are
installed by hand. CI never touches them; that is deliberate.

**Migrations** run from the image being deployed (`--migrate`), as
`costco_migrator`, after a verified backup, before the container swap. Its
credentials are in `migrator.env`, never `.env`: `.env` is the API container's
`env_file`, and the API gets DML only. Two consequences:

- **Migrations must stay additive.** The old container keeps serving while a
  migration runs, and rolling back an image never rolls back the schema.
- MariaDB commits DDL implicitly, so a migration that fails partway is left
  half-applied. The backup taken just before is what undoes that.

### On the Pi

| Path | Owner, mode | What |
|---|---|---|
| `/usr/local/sbin/costco-deploy` | root, `0755` | `costco-deploy.sh` |
| `/etc/sudoers.d/costco-deploy` | root, `0440` | `costco-deploy.sudoers` |
| `/opt/costco-api/` | root, `0700` | everything below |
| `/opt/costco-api/docker-compose.prod.yml` | root, `0644` | from this directory's parent |
| `/opt/costco-api/.env` | root, `0600` | the API's config and secrets (`api/.env.example`) |
| `/opt/costco-api/migrator.env` | root, `0600` | `costco_migrator`'s connection string, nothing else |
| `/opt/costco-api/deploy.env` | root | written by `costco-deploy`: current and previous image |
| `/home/gh-runner/actions-runner/` | `gh-runner` | the runner, registered on `costco-deploy` |

### Day to day

- **Deploy:** merge. The `api` run's summary links the deploy run in
  `costco-deploy`, and the `api` run fails if the deploy does.
- **Roll back:** re-run an earlier successful run in `costco-deploy`. A re-run
  keeps its inputs, so it redeploys that run's digest. Or, on the Pi,
  `sudo costco-deploy --rollback`, which swaps to the previous image without
  migrating.
- **After editing `.env`:** `sudo costco-deploy --recreate`. `docker compose
  restart` doesn't re-read `.env`.
- **A specific image, by hand:** `sudo costco-deploy sha256:<digest>`. Every
  `api` run's summary records its digest.
- **Rebuild without a code change**, say for base-image patches: run the `api`
  workflow from the Actions tab, on `main`.

### One-time setup

In this order. Steps 2 and 9 lean on the first merge, since there is no image
to deploy until `api.yml` has run once.

1. **Create the private repository** with `deploy.yml` and its README. It has
   no secrets and no environment, and its workflow uses no actions, so it can
   be limited to actions defined in the repository itself, of which there are
   none. (GitHub refuses a `selected` list with everything turned off;
   `local_only` is how it spells that.)

   ```bash
   gh repo create jdsanchez93/costco-deploy --private
   gh api -X PUT repos/jdsanchez93/costco-deploy/actions/permissions \
     -F enabled=true -f allowed_actions=local_only
   ```

2. **Merge the pull request that adds `api.yml`.** `build` pushes the first
   image and `deploy` fails at minting a token, because the App doesn't exist
   yet. Note the digest from the run's summary.

3. **Make the package public**, so the Pi pulls with no credential: Package
   settings for `costco-api` → Change visibility → Public. This can't be
   undone. The image is the compiled contents of a public repository, and
   `api/.dockerignore` keeps local config out of the build context.

4. **Check that `costco_migrator` can log in the way the migrate container
   will.** The container connects over TCP to `127.0.0.1`. The Pi's MariaDB
   resolves client names, so it treats that connection as coming from
   `localhost`, and the existing `costco_migrator@'localhost'` account is the
   one it matches. There is nothing to create; type that account's password:

   ```bash
   mariadb -h 127.0.0.1 -u costco_migrator -p -e 'SELECT CURRENT_USER()'
   # expect costco_migrator@localhost
   ```

   Don't add a `costco_migrator@'127.0.0.1'` account. MariaDB would still pick
   `@'localhost'` and never try the other, so a different password on it only
   fails. See "Things that have bitten before" in `CLAUDE.md`.

5. **Lay out `/opt/costco-api`**, moving `.env` from wherever the API's compose
   project lives today:

   ```bash
   sudo install -d -o root -g root -m 0700 /opt/costco-api
   sudo install -o root -g root -m 0644 docker-compose.prod.yml /opt/costco-api/
   sudo install -o root -g root -m 0600 <old dir>/.env /opt/costco-api/.env
   sudo install -o root -g root -m 0600 /dev/null /opt/costco-api/migrator.env
   sudoedit /opt/costco-api/migrator.env
   # ConnectionStrings__MySql=Server=127.0.0.1;Port=3306;Database=costco_receipts;User=costco_migrator;Password=<step 4's password>;
   ```

   Then check the password in it without printing it. The first command gives
   its hash, which must equal the one in the `IDENTIFIED BY PASSWORD` line of
   the second:

   ```bash
   sudo sed -n 's/.*Password=\([^;]*\).*/\1/p' /opt/costco-api/migrator.env | tr -d '\n' |
     openssl dgst -sha1 -binary | openssl dgst -sha1 | awk '{print "*" toupper($NF)}'
   sudo mariadb -e "SHOW GRANTS FOR 'costco_migrator'@'localhost'"
   ```

6. **Install `costco-deploy` and run the first deploy by hand**, watching it.
   Take the old compose project down first: the new one is named
   `costco-api` and would otherwise fight it for port 8080.

   ```bash
   sudo install -o root -g root -m 0755 costco-deploy.sh /usr/local/sbin/costco-deploy
   (cd <old dir> && docker compose -f docker-compose.prod.yml down)
   sudo costco-deploy sha256:<digest from step 2>
   ```

   Then log in to the site and open a receipt.

   If this deploy fails, nothing is serving: the old project is already down,
   and there is no previous image to put back. Bring the old one back up while
   you fix the cause, and take it down again before retrying:

   ```bash
   (cd <old dir> && docker compose -f docker-compose.prod.yml up -d)
   ```

7. **Create the runner user and register the runner on `costco-deploy`.** The
   user is deliberately not in the `docker` group, which would be root by
   another name. Get the download commands and a registration token from
   `costco-deploy` → Settings → Actions → Runners → New self-hosted runner
   (Linux, ARM64). The token lasts an hour. Run the download and `config.sh`
   as that user, not as root: files unpacked as root leave a runner that can't
   write its own directory. If that happens, delete the directory and start
   again; nothing is registered until `config.sh` finishes. Each line below
   runs wholly as `gh-runner` or wholly as root, with no `cd` in your own
   shell, which the runner's home may not let in:

   ```bash
   sudo useradd --system --create-home --shell /usr/sbin/nologin gh-runner
   sudo -u gh-runner mkdir /home/gh-runner/actions-runner
   sudo -u gh-runner bash -c 'cd /home/gh-runner/actions-runner && <download, checksum and extract, from that page>'
   sudo -u gh-runner bash -c 'cd /home/gh-runner/actions-runner && ./config.sh --unattended \
     --url https://github.com/jdsanchez93/costco-deploy --token <token> \
     --name costco-pi --labels costco-pi'
   sudo bash -c 'cd /home/gh-runner/actions-runner && ./svc.sh install gh-runner && ./svc.sh start'

   sudo visudo -cf costco-deploy.sudoers
   sudo install -o root -g root -m 0440 costco-deploy.sudoers /etc/sudoers.d/costco-deploy
   ```

   If `config.sh` reports missing libraries (usually ICU), run the runner's
   own installer as root, then `config.sh` again:
   `sudo bash -c 'cd /home/gh-runner/actions-runner && ./bin/installdependencies.sh'`.

   Check that it got the one privilege and nothing else. The first check runs
   as you: `gh-runner` has no password, so its own `sudo -l` would ask for one
   whenever its sudoers rule is missing.

   ```bash
   sudo -l -U gh-runner                            # only (root) NOPASSWD: /usr/local/sbin/costco-deploy
   sudo -u gh-runner cat /opt/costco-api/.env      # Permission denied
   sudo -u gh-runner cat <old dir>/.env            # Permission denied; step 5 copied it, so it's still there
   sudo -u gh-runner docker ps                     # permission denied on docker.sock
   sudo -u gh-runner ls /home/<you>                # Permission denied
   ```

   The runner should now show as Idle under `costco-deploy` → Settings →
   Actions → Runners.

8. **Create the GitHub App** at github.com/settings/apps/new:
   - Webhook off.
   - Repository permissions: **Actions: Read and write**, nothing else.
     Metadata read-only is added automatically.
   - "Only on this account".

   Then generate a private key, and install the App on **only**
   `costco-deploy`. Store the App ID and key on this repository's `production`
   environment, and delete the downloaded `.pem`. The App ID is the number
   under General on the App's settings page, not its Client ID (`Iv23…`) or
   its name; a name fails at minting the token with "'Issuer' claim ('iss')
   must be an Integer".

   ```bash
   gh variable set DEPLOY_APP_ID --env production --body <numeric App ID>
   gh secret set DEPLOY_APP_PRIVATE_KEY --env production < <key>.pem
   ```

9. **Re-run the failed `deploy` job from step 2.** It starts `deploy.yml`,
   which redeploys the digest that step 6 already deployed. That makes the
   first automated deploy a deliberate no-op, exercising the whole path with
   nothing at stake.

   Once it passes, delete the old compose project and the image it ran. The
   new project is serving, and from the next deploy on, `costco-deploy
   --rollback` is the way back. The old directory's `.env` is a second copy of
   the production secrets:

   ```bash
   sudo rm -r <old dir>
   docker image rm costco-api:latest
   ```

### Verifying

```bash
# A deploy that can't succeed: the run fails at `docker pull` and nothing on the Pi changes.
gh workflow run deploy.yml -R jdsanchez93/costco-deploy \
  -f digest=sha256:0000000000000000000000000000000000000000000000000000000000000000 \
  -f source_sha=test

# The health check is loopback-only. Expect 404 through the tunnel; a 200
# would mean cloudflared rewrote the Host header, which is harmless but worth knowing.
curl -s -o /dev/null -w '%{http_code}\n' https://costco-api.jd-sanchez.dev/healthz
```

After the second real deploy, try `sudo costco-deploy --rollback` and check the
older commit is serving (`costco-deploy` prints it), then roll forward the
same way.

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

`costco-deploy` runs it before every migration. **Run it by hand before
applying SQL any other way:**

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
2. Add these as **environment variables on that environment**, not repository
   variables — Settings → Environments → `production` → "Environment
   variables". They are variables rather than secrets because none of them is
   sensitive, and secret masking only makes logs harder to read.

| Variable | Value |
|---|---|
| `AWS_DEPLOY_ROLE_ARN` | `arn:aws:iam::515966506000:role/costco-receipts-prod-frontend-deploy` |
| `FRONTEND_BUCKET` | `costco-receipts-prod-frontend-515966506000` |
| `CLOUDFRONT_DISTRIBUTION_ID` | `E2EVLA19XVOJOI` |

Environment scope rather than repository scope for two reasons. It matches the
stage-parameterized CDK layout: adding a staging frontend later means creating
a `staging` environment with its own three values, and `frontend.yml` works
unchanged — whereas repository variables would force `PROD_*`/`STAGING_*`
names and workflow edits. And repository variables are readable by any
workflow including one triggered from a PR branch, while environment variables
reach only a job that declares `environment: production` and therefore also
passes the branch policy — the same boundary the role's trust policy draws.

The tradeoff to recognize: `vars.X` silently resolves to empty in any job that
does **not** declare `environment: production`. Only the deploy job reads them
today.

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
