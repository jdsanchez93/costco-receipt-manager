# The October 2026 migration

A record of moving this project off its original AWS Lambda / API Gateway /
DynamoDB architecture and onto a self-hosted API with a stage-parameterized CDK
layout. Executed in one sitting on 2026-10-05, with the DynamoDB tables and the
last SAM stacks removed on 2026-10-16.

Kept because the findings below cost real effort to discover and several of
them are live hazards in the current design, not just history. The
phase-by-phase command list it used to carry has been dropped — those steps ran
once and will not run again. `git log` has the detail if it is ever needed.

## What changed

| Before | After |
|---|---|
| .NET API on Lambda behind API Gateway | ASP.NET Core in Docker on a Raspberry Pi, behind a Cloudflare Tunnel |
| DynamoDB single-table | MariaDB 11.8 on the same Pi |
| React SPA on CloudFront | Angular SPA on CloudFront, `/api/*` routed to the tunnel |
| `CostcoReceiptsStack`, `NextFrontendStack`, `DevReceiptProcessingStack`, two SAM stacks | `Dev-/Prod-CostcoReceipts-Processing`, `Prod-CostcoReceipts-Frontend` |

Deleted along the way: both DynamoDB tables (644 prod items / 330 dev, exported
first), the old Lambda API and API Gateway, two CloudFront distributions, the
original React app, and ~950 lines of documentation describing all of it.

The receipt-image buckets survived untouched and left CDK's ownership — see
`BUCKETS.md` for why and for their configuration.

## Findings worth keeping

**ACM's DNS validation record name is deterministic per domain.** Two
independently requested certificates covering `costco.jd-sanchez.com` were
issued against the identical validation CNAME. A third request reused it, so
the replacement certificate issued with no manual step and no wait. The
practical consequence: **do not delete ACM validation records from Route 53**
during a cutover — they are what makes certificate re-issuance instant.

**Freeing a CloudFront alias is a config update, not a deletion.** An alternate
domain name can live on only one distribution, so a cutover has to release it
first. Removing just the alias (and the certificate — CloudFront rejects a
certificate without an alias) takes about ten minutes; deleting the whole
distribution takes closer to twenty. That difference was most of the downtime
budget.

**Rollback was never real, and assuming otherwise would have been dangerous.**
The plan described the DNS flip as "instantly reversible." It was not: DynamoDB
had been stale since the OCR pipeline started writing to MariaDB weeks earlier,
so pointing DNS back would have served a working application over out-of-date
data. The actual safety property was that nothing in the migration touched the
Pi, MariaDB, or the receipt images. Worth checking, on any cutover, whether the
old path is still *correct* rather than merely still *running*.

**S3 notifications on a non-CDK-managed bucket merge rather than overwrite.**
CDK writes them with `Managed: false`, which preserves existing configurations.
Two stacks owning a trigger on the same bucket and prefix therefore OCR every
upload twice — a real Textract bill and two writes racing into MySQL. This is
why `attachReceiptProcessorTrigger` is opt-in per stage and only enabled after
the previous owner is gone. Still live in the current design.

**A DynamoDB table inside a CloudFormation stack is deleted with the stack.**
Neither SAM template set `DeletionPolicy` or `DeletionProtectionEnabled`, so
`delete-stack` took the tables with it. Deleting them separately with
`aws dynamodb delete-table` would have left CloudFormation referencing
resources that no longer existed. Check the owning stack before deleting any
resource by hand.

**Lambda asset bundling runs when the CDK app is constructed, not when a stack
is selected.** One stack with a slow Docker bundle makes *every* `cdk synth`
and `cdk ls` slow, including for unrelated stacks, and fails outright when
Docker is not running. It is also why `cdk synth` could not be a PR check until
the old stack was deleted. The context key that would skip bundling
(`aws:cdk:bundling-stacks`) is rejected from the CLI, because user-provided
context cannot use `aws:`-prefixed keys.

**"It does not resolve" after a DNS change is usually not DNS.** Immediately
after the cutover the site appeared broken in a normal browser window while
working in a private one. Local, `8.8.8.8` and `1.1.1.1` all already agreed on
the new distribution's addresses — it was browser-level caching, which flushing
the OS resolver does nothing for. Check with `curl` and `dig` before chasing
DNS. (Separately, macOS *does* cache negative results in a way `dig` bypasses;
`sudo dscacheutil -flushcache && sudo killall -HUP mDNSResponder` fixes that
one.)

**Verify a refactor against deployed state, not against another synth.** After
removing the retired stacks, `cdk diff` against the live stacks reported "There
were no differences" for all three — stronger evidence than comparing two local
synth outputs, and it needs no baseline captured beforehand.

## Everything it surfaced is now closed

The migration turned up five problems it did not stop to fix. All five were
resolved between 2026-10-16 and 2026-10-21:

- **Public access block** is now fully enabled on both receipt buckets. It had
  been off since the original SAM template, predating S3's block-by-default
  change. Presigned URLs are IAM-signed and unaffected; verified by upload in
  both stages.
- **Versioning is on**, with lifecycle rules expiring noncurrent versions after
  90 days and aborting incomplete multipart uploads after 7. The buckets hold
  the only copy of every receipt image, so a delete or overwrite used to be
  unrecoverable.
- **Prod CORS** no longer allows the retired `https://next.jd-sanchez.com`, and
  its methods narrowed from `GET/PUT/POST/DELETE/HEAD` to `GET/PUT/HEAD` — the
  browser only ever issues the one presigned `PUT`.
- **`receipt-processor/requirements.txt` is pinned**, transitives included, so
  the Lambda's asset hash no longer drifts. Worth knowing how real that was:
  `certifi` moved from 2026.7.22 to 2026.10.19 in the sixteen days after the
  cutover, which alone would have pushed an unintended "code changed" diff
  during some unrelated deploy. Dependabot maintains the pins.
- **Local development runs MariaDB 11.8**, the same engine as the Pi, instead
  of MySQL 8.

The intended S3 state now lives as applyable JSON in `cdk-backend/s3-config/`
rather than only as prose — see `BUCKETS.md`. Nothing detects drift on it
automatically, which is the standing cost of keeping those buckets out of CDK.
