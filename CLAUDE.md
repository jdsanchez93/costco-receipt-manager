# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working in this repository.

## What this is

A receipt-splitting app: upload a Costco receipt photo, OCR extracts the line
items, then members assigned to the receipt are allocated items and per-person
totals are computed.

| Piece | Stack |
|---|---|
| `frontend-angular/` | Angular 22 + Angular Material, Auth0 SDK v2.11 |
| `api/CostcoReceipts.Api/` | ASP.NET Core 10, EF Core 10 via `Microting.EntityFrameworkCore.MySql` (a Pomelo fork; MySQL/MariaDB) |
| `api/CostcoReceipts.Migration/` | one-off data maintenance CLI (see below) |
| `cdk-backend/` | AWS CDK: S3 + CloudFront, and the Textract OCR Lambda |

The API is **self-hosted** on a Raspberry Pi, in Docker with
`network_mode: host`, behind a Cloudflare Tunnel. MariaDB 11.8 runs natively on
the same box, bound to loopback. Everything else is AWS.

An earlier Node/React/DynamoDB/SAM architecture was fully retired on
2026-10-05. If you find documentation or code referring to DynamoDB, a
`backend/` directory, API Gateway, or a Lambda-hosted API, it is stale —
report it rather than following it.

## Request path

```
browser → CloudFront (costco.jd-sanchez.com)
            ├── /*      → S3 bucket with the Angular build
            └── /api/*  → Cloudflare Tunnel (costco-api.jd-sanchez.dev) → Pi → MariaDB
```

The browser only ever talks to one origin, so there is no CORS between the SPA
and the API. CloudFront reaches the tunnel over ordinary HTTPS.

Two domains. `jd-sanchez.com` is in Route 53, in a different AWS account from
these stacks, and carries the site and Auth0's custom domain
(`auth0.jd-sanchez.com`). `jd-sanchez.dev` is on Cloudflare and carries only
tunnel hostnames, which nothing reaches except through CloudFront or the OCR
Lambda. `jd-sanchez.com` can't move to Cloudflare on its free plan: delegating
a subdomain needs Enterprise, and a partial (CNAME) setup needs Business.

**OCR pipeline**, entirely separate from the request path:

```
browser → presigned PUT → S3 uploads/<auth0-sub>/<receiptId>.{jpg,png}
                            → ObjectCreated event
                            → Python Lambda → Textract
                            → POST /api/internal/receipts/{id}/ocr-results  (shared secret)
                            → MariaDB
```

Processing is async. `Receipt.ProcessingStatus` is `pending` → `completed` /
`failed`, and the receipt view polls it with bounded backoff.

## Local development

```bash
docker compose -f api/docker-compose.yml up -d        # MariaDB 11.8 on 127.0.0.1:3306
cd api/CostcoReceipts.Api && dotnet run               # http://127.0.0.1:5002, Swagger at /swagger
cd frontend-angular && npm start                      # http://localhost:4200, proxies /api → :5002
```

The dev OCR pipeline posts its results to `https://costco-api-dev.jd-sanchez.dev`,
a Cloudflare Tunnel to the local API, run only while testing uploads:

```bash
docker run --rm -v ~/.cloudflared:/home/nonroot/.cloudflared cloudflare/cloudflared \
  tunnel --url http://host.docker.internal:5002 run costco-dev
```

The image runs as `nonroot`, so a mount at `/root/.cloudflared` silently loses
the tunnel's credentials. Docker Desktop has no real host networking, hence
`host.docker.internal` rather than `network_mode: host`.

```bash
cd frontend-angular && npx ng test --watch=false      # vitest
cd api/CostcoReceipts.Api && dotnet build -warnaserror
cd cdk-backend && npx tsc --noEmit && npx cdk synth --all
```

There is no .NET test project. The Angular suite is the only automated test
coverage.

## Database and migrations

Eight entities under `Data/Entities/`: `User`, `Contact`, `Receipt`,
`ReceiptMember`, `ReceiptItem`, `ReceiptItemAssignment`, `ReceiptGeometry`,
`ReceiptShare`. `Contact` is an owner-scoped address book — see its doc comment
for the authenticated/placeholder distinction, which is load-bearing.

**Creating a migration** is ordinary `dotnet ef migrations add`. The dialect is
pinned to production's engine by `Database:ServerVersion` in `appsettings.json`,
so `AppDbContextFactory` never needs a live database and migrations are always
generated against MariaDB 11.8 regardless of what is running locally. The API
reads the same setting at runtime rather than detecting the version, so
building a `DbContext` never touches the database.

**Applying to production happens on deploy.** The API's DB user (`costco_app`)
has DML only; DDL belongs to `costco_migrator`. `costco-deploy` on the Pi backs
the database up, then runs the new image once with `--migrate` as
`costco_migrator`, and only then swaps containers. So **migrations must stay
additive**: the old container keeps serving while one runs, and rolling back an
image never rolls back the schema. A migration that can't be additive needs a
plan of its own, not a merge.

`api/scripts/generate-prod-migration-script.sh` still produces the idempotent
SQL, sanity-applied to a throwaway MariaDB, for reviewing what a migration will
run.

Local development runs the same engine as production — `mariadb:11.8`, matching
the Pi's 11.8.6. The series tag rather than an exact patch, so local drifts the
way the Pi does through apt rather than pinning against it; expect local to sit
a few patches ahead. Moving off 11.8 means updating three places together: the
image tag, `Database:ServerVersion`, and `MARIADB_VERSION` in
`scripts/generate-prod-migration-script.sh`.

## Configuration

Secrets never live in the repo. The pattern is a committed `.example` plus a
gitignored real file:

| Real file | Template | Holds |
|---|---|---|
| `/opt/costco-api/.env` (on the Pi) | `api/.env.example` | DB password, AWS keys, internal shared secret |
| `/opt/costco-api/migrator.env` (on the Pi) | — | `costco_migrator`'s connection string; never in `.env`, which the API container loads |
| `cdk-backend/cdk.context.json` | — | bucket names, internal API keys, per-stage config |
| `frontend-angular/src/environments/environment.development.ts` | `environment.example.ts` | local Auth0 app |

`environment.ts` (production) **is** committed: its Auth0 domain, clientId and
audience already ship in the public bundle. The dev one is not, because its
clientId belongs to a separate local-only Auth0 application and is not public
anywhere. The test applied to any config file is "would committing this leak
something new?"

Local API config goes in user secrets or `appsettings.Development.json`, never
in `appsettings.json`.

## Infrastructure

Three CDK stacks, stage-parameterized from a nested `dev`/`prod` block in
`cdk.context.json`:

```bash
cd cdk-backend
npx cdk deploy Dev-CostcoReceipts-Processing                    # dev OCR pipeline
npx cdk deploy -c stage=prod Prod-CostcoReceipts-Processing     # prod OCR pipeline
npx cdk deploy -c stage=prod Prod-CostcoReceipts-Frontend       # S3 + CloudFront + deploy role
```

The receipt-image buckets are deliberately **not** CDK resources — they hold
real user data and are referenced by name, so every stack resource stays
disposable. Their configuration lives in `cdk-backend/BUCKETS.md`.

## CI/CD

- `.github/workflows/ci.yml` — on PRs and pushes to `main`: builds both .NET
  projects with `-warnaserror`, Angular production build plus vitest, CDK
  typecheck and synth, and `dotnet ef migrations has-pending-model-changes` so
  an entity change without a migration fails the PR.
- `.github/workflows/frontend.yml` — on pushes to `main` touching
  `frontend-angular/**`: builds and deploys to S3 + CloudFront, authenticating
  with GitHub OIDC (no stored AWS keys). Runs in the protected `production`
  environment, which supplies the role ARN, bucket and distribution ID as
  environment-scoped variables.
- `.github/workflows/api.yml` — on pushes to `main` touching
  `api/CostcoReceipts.Api/**`: builds the image on a GitHub-hosted arm64
  runner, pushes it to GHCR (public), then starts and watches `deploy.yml` in
  the **private** repository `jdsanchez93/costco-deploy`. That repository
  exists only to hold the Pi's self-hosted runner, because a self-hosted runner
  on a public repository can be sent jobs from fork pull requests. The link is
  a GitHub App with Actions read/write on that one repository.

The Pi has no inbound path, so the runner polls GitHub. The deploy runs
`/usr/local/sbin/costco-deploy`, which deploys by digest, health-checks, and
puts the previous image back on failure. That script, its sudoers entry and
`docker-compose.prod.yml` are installed on the Pi by hand, never by CI.
`api/deploy/README.md` has the design, setup and rollback.

PR descriptions follow `.github/pull_request_template.md` — short; the
reasoning lives in the commits.

## Things that have bitten before

- **A TCP connection to `127.0.0.1` counts as `localhost`.** The Pi's MariaDB
  resolves client names (no `skip-name-resolve`), so a loopback connection
  matches `@'localhost'` accounts as well as `@'127.0.0.1'` ones. When a user
  has both, MariaDB picks `@'localhost'` and never tries the other, so a
  different password on `@'127.0.0.1'` just fails: that broke
  `costco_migrator`'s first deploy. Keep one account per user. `costco_app` is
  `@'127.0.0.1'` only, which matches by IP either way; turning on
  `skip-name-resolve` would leave `@'localhost'` matching socket connections
  only.
- **`costco_migrator` needs `CREATE ROUTINE`, `ALTER ROUTINE` and `EXECUTE`**,
  not just DDL. Pomelo, and so the fork, can't drop and recreate a primary key
  on an `AUTO_INCREMENT` column with a plain `ALTER TABLE`, so it defines
  helper stored procedures such as `POMELO_BEFORE_DROP_PRIMARY_KEY`, and
  MariaDB grants routines separately from tables. Without them such a
  migration fails with error 1370, "alter routine command denied".
- **S3 notifications on a non-CDK-managed bucket merge rather than overwrite**
  (`Managed: false`). Two stacks owning a trigger on the same prefix OCRs every
  upload twice.
- **Only JPEG and PNG are accepted on upload.** Textract reads neither HEIC nor
  WebP, and non-Safari browsers cannot render HEIC. Enforced on both sides.
  Client-side conversion is a known gap — a Mac Photos export currently has to
  be converted by hand.
- **Deleting a receipt removes its image only best-effort.** `DeleteReceipt`
  commits the DB delete first, then deletes the S3 object (a delete marker,
  since the bucket is versioned), logging a warning rather than failing if S3
  refuses — so a missing `s3:DeleteObject` grant shows up as orphans, not 500s.
  Deleting while OCR is still pending, and the abandoned-upload path, still let
  the Lambda POST results for a receipt that is gone: a 404, a burned Textract
  call, and an event in the DLQ.
- **Access tokens carry no profile claims** — no `email`, `name` or
  `nickname`, only the ID token does. `UserProvisioningMiddleware` gets them
  from Auth0's `/userinfo` with the caller's own access token (valid there
  because the SPA requests `openid` alongside the API audience): first for a
  user with no self-contact, then retried while it has no email. A failed
  fetch leaves the `sub` as a stand-in name, which `GET /api/me` reports as
  `needsName` and the shell prompts the user to replace. A real name belongs
  to the user (`/api/me`) and is never overwritten from Auth0.
- **`docker compose restart` does not re-read `.env`**; it takes a recreate. On
  the Pi that is `sudo costco-deploy --recreate`, since plain `compose` there
  also needs the image from `deploy.env`.

## Documentation map

- `README.md` — project overview for humans
- `cdk-backend/README.md` — the stacks and how to deploy them
- `cdk-backend/BUCKETS.md` — bucket config that lives outside CDK
- `cdk-backend/RUNBOOK.md` — how the 2026-10 migration was executed, and what
  was learned
- `api/deploy/README.md` — the API deploy pipeline, Pi operations, and one-time
  AWS/GitHub setup
- `docs/redesign-plan.md` — roadmap: what is left to build and the decisions
  already made about how. Forward-looking only; completed work lives in
  `RUNBOOK.md` and `git log`.
- `PI.md` in the **private** repository `jdsanchez93/costco-deploy` — the Pi's
  exact configuration: storage and boot, MariaDB tuning and accounts, the
  tunnel ID, firewall and SSH. Kept out of this public repository because it
  fingerprints the box. It holds no secrets.
