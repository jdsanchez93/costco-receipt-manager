# Cutover + decommission + restack runbook

One sitting. Moves `costco.jd-sanchez.com` onto the new Angular/Pi stack, deletes
the old Lambda/API-Gateway/DynamoDB architecture, and lands the final
stage-parameterized CDK layout.

Run every `cdk` command from `cdk-backend/`. **Never run a bare `cdk deploy` or
`cdk deploy --all` during this** — legacy and new stacks coexist until Phase 5,
and a bare deploy would touch all of them. Always name the stack.

### End state

| Stack | Holds |
|---|---|
| `Dev-CostcoReceipts-Processing` | dev OCR Lambda + DLQ + bucket notification |
| `Prod-CostcoReceipts-Processing` | prod OCR Lambda + DLQ + bucket notification |
| `Prod-CostcoReceipts-Frontend` | prod S3 + CloudFront + ACM cert + GitHub deploy role |

Gone: `CostcoReceiptsStack`, `NextFrontendStack`, `DevReceiptProcessingStack`,
the old .NET API Lambda, API Gateway, both old CloudFront distributions, the
DynamoDB table, `frontend/` (old React).

Not CDK-managed any more, by design: the two receipt-image buckets. They hold
real images and never change shape, so they're referenced by name the way the
DynamoDB table always was. That's what makes every stack above disposable.

### About rollback

There isn't a meaningful one, and it's better to know that going in. The old
React app depends on the old Lambda API and DynamoDB, and **DynamoDB has been
stale since the Phase 2B cutover** — OCR results have been landing in MariaDB
since then. Flipping DNS back would serve a working app over out-of-date data.

The real safety net is that nothing below touches the Pi, its MariaDB, or the
receipt images in S3. Those hold all live state. Everything being deleted is
either stateless or stale, so the recovery mode is fix-forward.

---

## Phase 0 — pre-flight ✅ done 2026-10-05

All commands use `export AWS_PROFILE=jd-sanch-admin` (account `515966506000`,
where every stack below lives). Route 53 for `jd-sanchez.com` is in a *different*
account, so DNS edits in Phase 3 are done from that one.

**0.1 Bucket config captured** — raw JSON in `cdk-backend/bucket-config/`
(gitignored); verified values written into `BUCKETS.md`. Both buckets: SSE-S3
`AES256`, no bucket policy, no lifecycle rules, all four public-access-block
settings disabled. CORS origins are `costco.` + `next.` for prod,
`localhost:4200` for dev.

> **Versioning is OFF on both buckets.** They hold the only copy of every receipt
> image, with no versioning, replication or backup, so an accidental delete or
> key overwrite is unrecoverable. Not a migration step — flagged in `BUCKETS.md`
> as its own decision.

**0.2 Both DLQs have messages**, and they are lost when the queues are replaced
in Phase 4. Record before destroying:
- **prod** — 1 event (delivered twice): receipt
  `8269585a-6473-4cae-98e2-4cc1fa0558fe`, a `.jpg`, 2026-09-23. **Investigated:
  benign, nothing recoverable or missing.** The receipt is absent from MariaDB
  and the object is absent from S3 — an abandoned upload whose PUT had already
  succeeded. The S3 event fired, the Lambda OCR'd it and POSTed to
  `/api/internal/receipts/{id}/ocr-results`, which 404'd because the row was
  already deleted; the fallback `ocr-failed` call 404'd for the same reason, so
  `app.py` re-raised and S3's two async retries pushed it to the DLQ. The object
  was deleted separately by hand (the API's `DeleteReceipt` deliberately leaves
  it — see its `TODO(upload-pipeline)`). Discard with the queue.
- **dev** — 3 deliveries of one event: receipt `65b4ea7d`, already one of the
  five documented dev receipts with an image but no items. Expendable, and the
  triple delivery is exactly the `app.py` re-raise behavior described in
  `redesign-plan.md`.

**0.3 Certificate validation will be instant — verified, no manual step.** Both
existing certs that cover `costco.jd-sanchez.com` (`b7df359a`, and `47929036`
where it's a SAN) were issued against the *same* validation record:

```
_1563a6d2397b86b9a71adeae74635f3d.costco.jd-sanchez.com
  -> _ae7a04fceae85ba6e14a91fc3e722f12.xlfgrmvvlj.acm-validations.aws
```

Two independently requested certs landing on one record confirms ACM's
validation name is deterministic per domain, and `dig` confirms the record is
live. A third request reuses it. **Do not delete that record.**

> Fallback, if the new certificate somehow misbehaves: `b7df359a`
> (`arn:aws:acm:us-east-1:515966506000:certificate/b7df359a-729b-4465-ad85-4827b52a01dc`)
> covers exactly `costco.jd-sanchez.com`, is ISSUED, and is *imported by ARN* by
> the old stack rather than owned by it — so Phase 2 orphans it rather than
> deleting it. It stays available as a ready-made spare.

**0.4 Current ownership:**

| What | Where |
|---|---|
| `costco.jd-sanchez.com` alias | distribution **`E1PM15RW3USICF`** (old stack) — this is what Phase 2 frees |
| `next.jd-sanchez.com` alias | distribution `E2SNHU4VFIDOT2` (`NextFrontendStack`) |
| prod bucket notification | `CostcoReceiptsStack-receipt-processor` |
| dev bucket notification | `DevReceiptProcessingStack-receipt-processor` |

Exactly one Lambda configuration per bucket, so the double-processing hazard in
Phase 4 is real but currently singular.

**0.5 OIDC provider already exists** — no creation needed. Recorded in
`cdk.context.json` at `prod.frontend.githubOidcProviderArn`:
`arn:aws:iam::515966506000:oidc-provider/token.actions.githubusercontent.com`.
Note the account hosts several other projects' distributions, so that provider
may already back another repo's deploy role — referencing it rather than
creating it was the right call. The deploy role synthesizes correctly with the
pinned name `costco-receipts-prod-frontend-deploy`.

---

## Phase 1 — stand up the new prod frontend ✅ done 2026-10-05

Created with no downtime and no contact with anything live.

| | |
|---|---|
| Stack | `Prod-CostcoReceipts-Frontend`, CREATE_COMPLETE |
| Distribution | **`E2EVLA19XVOJOI`** / `d2dtkpx15bdgde.cloudfront.net`, **0 aliases** |
| Bucket | `costco-receipts-prod-frontend-515966506000` |
| Deploy role | `arn:aws:iam::515966506000:role/costco-receipts-prod-frontend-deploy` |
| Certificate | ISSUED for `costco.jd-sanchez.com`, validated automatically |

The certificate validated against the existing
`_1563a6d2397b86b9a71adeae74635f3d.costco.jd-sanchez.com` record exactly as
Phase 0.3 predicted — no manual CNAME, no wait.

Verified over the distribution's own `*.cloudfront.net` name:

| Check | Result |
|---|---|
| `/` | 200, `cache-control: no-cache,must-revalidate` |
| `main-<hash>.js` | 200, `public,max-age=31536000,immutable` |
| `/app/receipts` (SPA deep link) | 200 — the 403/404 → `/index.html` rewrite works |
| `/api/health` | 200 `{"status":"healthy","environment":"Production"}` |
| `/api/health/ready` | 200 `{"status":"ready"}` — MariaDB reachable |
| `/api/receipts/user-receipts` unauthenticated | 401 — auth enforced |

So CloudFront → Cloudflare Tunnel → Pi → MariaDB is proven on the new
distribution before any DNS change. Auth0 login is *not* testable here (callback
URLs are domain-specific); that's Phase 3.4.

Also confirmed in passing: `aws s3 sync --delete --exclude "*.html"` does **not**
delete `index.html` — the exclude filter covers the delete scan as well as the
upload, so the workflow's two passes don't clobber each other. Worth having
tested, since the failure mode would have been deleting the entry point on every
deploy.

### Original Phase 1 steps, for reference

The certificate and the distribution are the slow, uncertain parts (~15 min for
CloudFront, plus validation). Doing them now keeps them out of the downtime
window. The stack deploys with **no alias**, so it can't collide with the live
distribution.

```bash
npx cdk deploy Prod-CostcoReceipts-Frontend -c stage=prod
```

Per Phase 0.3 the certificate should validate within a minute or two against the
record already in Route 53. If it blocks for more than ~10 minutes, the record
wasn't reused after all: get the CNAME from the ACM console and add it in Route
53 (that hosted zone is in the other account, which is why CDK can't write it).

**1.1 Upload a build and verify** over the distribution's own
`*.cloudfront.net` name, from the stack's `CloudFrontDomainName` output:

```bash
cd ../frontend-angular && npx ng build --configuration production && cd ../cdk-backend
aws s3 sync ../frontend-angular/dist/frontend-angular/browser "s3://$(aws cloudformation describe-stacks \
  --stack-name Prod-CostcoReceipts-Frontend \
  --query 'Stacks[0].Outputs[?OutputKey==`FrontendBucketName`].OutputValue' --output text)"

curl -sI https://<dist>.cloudfront.net/            # 200, index.html
curl -s  https://<dist>.cloudfront.net/api/health  # proves /api/* reaches the Pi
```

Auth0 login will **not** work from the `cloudfront.net` hostname — its callback
URLs are domain-specific. That's expected; this step only proves asset serving
and the tunnel origin.

---

## Phase 2 — free the alias ✅ done 2026-10-05

`cdk deploy CostcoReceiptsStack -c customDomainName= -c certificateArn=` →
UPDATE_COMPLETE, `E1PM15RW3USICF` left with 0 aliases, status Deployed. The
alias was released in the distribution config within ~25 seconds; the rest of the
~10 minutes was edge propagation.

As predicted, the deploy also pushed a code update to `CostcoReceiptsApiFunction`
("Eventual consistency check initiated") — the non-reproducible `dotnet publish`.
Harmless; that Lambda is deleted in Phase 4.

### Original Phase 2 steps, for reference

A CloudFront alternate domain name can only exist on one distribution, so
`E1PM15RW3USICF` must release `costco.jd-sanchez.com` first. Shedding it is a config update
(~10 min); deleting the whole distribution would be ~20 and isn't needed yet.

```bash
npx cdk deploy CostcoReceiptsStack -c customDomainName= -c certificateArn=
```

Both overrides are required: dropping only the domain leaves the certificate set,
and CloudFront rejects a certificate without an alias.

> This is a fresh `cdk deploy` on the stack holding the live .NET API Lambda —
> normally the thing to avoid, because `dotnet publish` isn't reproducible and
> the deploy pushes an unintended "Code changed" update (see the asset-hash
> gotcha in `redesign-plan.local.md`). It's harmless here *specifically* because
> that Lambda is deleted in Phase 4 minutes later, and the old app is not a
> rollback target. This is the one and only time to be relaxed about it.

---

## Phase 3 — claim the alias and cut over ✅ done 2026-10-05

`E2EVLA19XVOJOI` now holds `costco.jd-sanchez.com` with the stack's ACM cert
(`sni-only`, `TLSv1.2_2021`), and the Route 53 alias points at
`d2dtkpx15bdgde.cloudfront.net`. Verified from outside any browser:

| Check | Result |
|---|---|
| bundle served | `main-SUBTCFTD.js` — the artifact uploaded in Phase 1.1 |
| `/` | 200, `cache-control: no-cache,must-revalidate` |
| `/api/health` | 200 `{"status":"healthy","environment":"Production"}` |
| `/api/health/ready` | 200 `{"status":"ready"}` |
| `/app/receipts` | 200 (SPA rewrite) |
| `/api/receipts/user-receipts` unauthenticated | 401 |

**Downtime ended here.**

> **Gotcha, a sibling of the macOS resolver one:** right after the DNS flip the
> site appeared not to resolve in a normal browser window while working in
> incognito. It was *not* DNS — local, `8.8.8.8` and `1.1.1.1` all agreed on the
> new distribution's `99.84.105.x` (the old one was `18.160.143.x`). It was
> browser-level caching, so flushing the OS resolver changes nothing. Check with
> `curl`/`dig` before chasing DNS, and use a private window to confirm.

### Original Phase 3 steps, for reference

**3.1** Add the alias to the new stack and redeploy:

```bash
# cdk.context.json: prod.frontend.aliases = ["costco.jd-sanchez.com"]
npx cdk deploy Prod-CostcoReceipts-Frontend -c stage=prod
```

**3.2** Point the Route 53 alias record for `costco.jd-sanchez.com` at the new
distribution (hosted zone is in the other account).

**3.3** Flush the local resolver before testing — a stale negative result has
bitten this domain twice before. `dig` bypasses the cache; `curl`, Python and
Safari don't.

```bash
sudo dscacheutil -flushcache && sudo killall -HUP mDNSResponder
dig +short costco.jd-sanchez.com
```

**3.4 Verify the full path**: load `https://costco.jd-sanchez.com`, log in via
Auth0, list receipts, open one. That exercises CloudFront → tunnel → Pi API →
MariaDB. **Downtime ends here.**

---

## Phase 4 — destroy the legacy stacks ✅ done 2026-10-05

`CostcoReceiptsStack`, `NextFrontendStack` and `DevReceiptProcessingStack` all
deleted; `E1PM15RW3USICF` gone. Both receipt buckets survived with CORS identical
to the Phase 0 capture and all objects intact (prod 29, dev 31). The new
processing stacks are deployed with their triggers on.

Verified afterwards:

| | prod | dev |
|---|---|---|
| Lambda configurations on bucket | **1** | **1** |
| function | `costco-receipts-prod-receipt-processor` | `costco-receipts-dev-receipt-processor` |
| events / prefix | `s3:ObjectCreated:*` / `uploads/` | same |
| `INTERNAL_API_URL` | `https://costco-api.jd-sanchez.dev` | `https://costco-api-dev.jd-sanchez.dev` |
| DLQ | `costco-receipts-prod-processing-dlq` | `costco-receipts-dev-processing-dlq` |

Exactly one notification owner per bucket, so no double-processing, and no
cross-stage wiring — each Lambda posts to its own tunnel and its own DLQ. Both
`Active`, python3.13, 60s timeout.

> **Testing dev OCR needs the dev tunnel running.**
> `costco-api-dev.jd-sanchez.dev` is the ad-hoc `cloudflared` container on the
> Mac, not a permanent service (see `redesign-plan.local.md` for the exact
> `docker run`). Without it, a dev upload reaches S3 and triggers the Lambda,
> which then fails to reach the API and lands in the dev DLQ.

### Original Phase 4 steps, for reference

Order matters: each destroy releases a bucket notification or a domain that the
replacement then claims. `attachReceiptProcessorTrigger` is `false` in context
for both stages precisely so this can't overlap — CDK configures notifications on
these now-unmanaged buckets with `Managed: false`, which *merges* rather than
overwrites, so two stacks owning a trigger on the same prefix means every upload
gets OCR'd twice, against a real Textract bill and with two writes racing into
MySQL.

```bash
npx cdk destroy CostcoReceiptsStack        # old API Lambda, API GW, old distribution + bucket
npx cdk destroy NextFrontendStack          # frees next.jd-sanchez.com, deletes its cert
npx cdk destroy DevReceiptProcessingStack  # frees the dev bucket's notification
```

**4.1 Confirm the receipt buckets survived** — they're `RETAIN`, but verify
rather than assume, and confirm the notifications are now empty:

```bash
for b in prod-costco-receipt-images dev-costco-receipt-images; do
  aws s3api head-bucket --bucket "$b" && echo "$b: exists"
  aws s3api get-bucket-cors --bucket "$b" | diff - "bucket-config/$b.cors.json" && echo "$b: CORS unchanged"
  aws s3api get-bucket-notification-configuration --bucket "$b"   # expect {}
done
```

If CORS came back empty, reapply it from the captured file (see
`cdk-backend/BUCKETS.md`).

**4.2 Re-enable the triggers** now that nothing else owns them:

```bash
# cdk.context.json: prod.attachReceiptProcessorTrigger = true
npx cdk deploy Prod-CostcoReceipts-Processing -c stage=prod
# cdk.context.json: dev.attachReceiptProcessorTrigger = true
npx cdk deploy Dev-CostcoReceipts-Processing
```

**4.3 Verify OCR end to end** in both stages: upload a JPEG receipt, watch
`ProcessingStatus` go `pending` → `completed`, confirm items appear. Check the
new DLQs are empty.

---

## Phase 5 — delete DynamoDB and clean up the code

**5.1 Export the tables** ✅ done 2026-10-05 — `dynamo-final-export/`
(gitignored), prod 644 items / dev 330, verified complete (single scan page,
counts match `describe-table`).

> Correction to this runbook's original step: it used
> `aws dynamodb export-table-to-point-in-time`, which **requires PITR — and PITR
> is DISABLED on both tables**, so that command fails. At 213 KB / 102 KB a
> plain `aws dynamodb scan` to a local file is simpler and free anyway.

**5.1b Delete the old SAM stacks — this is what deletes the tables.**

Not in the original plan, which assumed the tables were standalone. They are not:
`MainTable` is a managed resource of each SAM stack, so `aws dynamodb
delete-table` would leave CloudFormation referencing a resource that no longer
exists. Delete the stacks instead and let them take their tables.

The SAM app was *disconnected* at the Phase 2 Part B cutover, not deleted. Both
stacks are still deployed and still hold live resources:

- `UploadUrlFunction` / `DownloadUrlFunction` behind an **ApiGatewayV2 HTTP API
  with an Auth0 JWT authorizer** — still internet-reachable, the
  `6tv76nzo6g.execute-api...` endpoint from the old `s3UploadApiUrl` config
- `ReceiptProcessorFunction` + its own DLQ — the superseded OCR Lambda
- `MainTable` — the DynamoDB table

Verified safe to delete: the receipt buckets were already removed from both
deployed templates (the Retain-and-remove dance), nothing in the repo still
references the SAM endpoints (the .NET API calls `GetPreSignedURLAsync`
directly), and neither table has `DeletionPolicy` or `DeletionProtectionEnabled`
set — so stack deletion removes them cleanly.

```bash
# irreversible: deletes the tables and their data
aws cloudformation delete-stack --stack-name dev-costco-receipt-parser
aws cloudformation delete-stack --stack-name prod-costco-receipt-parser
```

Do dev first and confirm it completes before prod. Afterwards verify both tables
are gone (`aws dynamodb list-tables`) and that
`https://costco.jd-sanchez.com/api/health/ready` is still 200 — the Pi's API
never touched DynamoDB, so it should be unaffected.

**5.2 Code cleanup** — now safe, because nothing references these stacks:

- Delete `lib/costco-receipts-stack.ts`, `lib/next-frontend-stack.ts`,
  `lib/dev-receipt-processing-stack.ts`, `lib/receipt-processing.ts`.
  (That last one only existed as a free function, rather than a Construct, to
  keep logical IDs stable for the `cdk import`ed bucket. Both reasons are gone.)
- Delete **`cdk-backend/src/`** — 15 files of old .NET Lambda API source.
  `grep` confirms its only consumer is `costco-receipts-stack.ts:175`
  (`lambda.Code.fromAsset('src', …)`), so it leaves with that stack. Deleting
  it is also what finally retires the non-reproducible `dotnet publish` that
  made every `cdk synth` slow.
- Delete the original-stack leftovers at the repo root, which predate this
  migration entirely and reference a `backend/` directory that no longer
  exists: `Dockerfile.backend`, `Dockerfile.frontend`, `nginx.conf`,
  `docker-compose.yml`, `package.json`, `package-lock.json` (and the
  now-unreferenced root `node_modules/`). They form one cluster — the compose
  file is the only thing referencing the two Dockerfiles and nginx.conf, and
  the root `package.json` holds nothing but two stray `react-router-dom`
  entries. Check whether the root `.dockerignore` is still needed once they
  are gone; `api/.dockerignore` is the one that matters for the Pi image.
- Remove their imports and instantiation blocks from `bin/app.ts`, leaving only
  the stage-parameterized section.
- Remove the now-unused flat keys from `cdk.context.json`: `mainTableName`,
  `s3UploadApiUrl`, `s3DownloadApiUrl`, `deployFrontend`, `customDomainName`,
  `certificateArn`, `next*`, `deployReceiptProcessing`, `receiptBucket*`,
  `internalApi*`, `dev*`. Keep `auth0*` only if something still reads them.
- Delete `frontend/` (old React).
- Strip the Dynamo half of `CostcoReceipts.Migration` per the note in
  `redesign-plan.md`'s step 9, keeping `PlaceholderContactMerger`.
- Add `.github/dependabot.yml` **after** the deletions above, not before, or
  it will open pull requests against the old Lambda API and the old React app.
- Re-add `cdk synth` to the `cdk` job in `.github/workflows/ci.yml`. It was
  dropped because asset bundling runs at app-construction time, so synthesizing
  anything also triggered the legacy stack's .NET publish in Docker. With that
  stack gone the only bundle left is one small Python Lambda. CI will need to
  write a throwaway `cdk.context.json` with `dev` and `prod` blocks first, since
  the real one is gitignored and the stacks skip instantiation without it.
  Synth catches CDK-level validation `tsc` can't — a distribution given a
  certificate but no alias, for instance.

**5.3 Finish the frontend pipeline.** Read the new stack outputs into GitHub
repository variables, then run the workflow:

```bash
aws cloudformation describe-stacks --stack-name Prod-CostcoReceipts-Frontend \
  --query 'Stacks[0].Outputs' --output table
```

| Variable | Output |
|---|---|
| `AWS_DEPLOY_ROLE_ARN` | `GithubDeployRoleArn` |
| `FRONTEND_BUCKET` | `FrontendBucketName` |
| `CLOUDFRONT_DISTRIBUTION_ID` | `CloudFrontDistributionId` |

**5.4** CI/CD Phase 2 (the self-hosted runner and automated API deploy) is
unblocked from here: the asset-hash hazard that made `cdk deploy` risky is gone
along with the old Lambda, and so is the reason it was deferred.

---

## Post-migration hardening (not required, worth doing)

The receipt buckets currently have **all four public-access-block settings
disabled**, inherited from the original SAM template and predating S3's
block-by-default change. Nothing is actually public, but the bucket permits a
public ACL or policy to be set. Presigned URLs — the only way this app reaches
S3 — work fine with the block fully enabled:

```bash
aws s3api put-public-access-block --bucket prod-costco-receipt-images \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
```

Do it one bucket at a time and upload a receipt afterwards to confirm. Prod CORS
can also drop the `https://next.jd-sanchez.com` origin once that domain is gone.
