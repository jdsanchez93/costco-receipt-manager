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

## Still outstanding

- **Public access block is disabled on both receipt buckets**, inherited from
  the original SAM template and predating S3's block-by-default change. Nothing
  is public, but the buckets permit a public ACL or policy. Presigned URLs — the
  only way this app reaches S3 — work fine with the block fully enabled.
- **Versioning is off on both buckets**, which hold the only copy of every
  receipt image. No versioning, no replication, no backup: an accidental delete
  or key overwrite is unrecoverable.
- **Prod CORS still allows `https://next.jd-sanchez.com`**, a domain retired at
  the cutover.
- **`receipt-processor/requirements.txt` is unpinned**, which is why that
  Lambda's asset hash is not reproducible.
- **Local development runs MySQL 8 while production runs MariaDB 11.8.**
  Migrations are generated against MariaDB by pinned configuration, but they are
  tested locally against a different engine.
