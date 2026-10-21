# CDK infrastructure

Three stacks, one class per concern, instantiated per stage from a nested
`dev` / `prod` block in `cdk.context.json` (gitignored — it holds bucket names
and the internal API shared secrets).

| Stack | Contents |
|---|---|
| `Dev-CostcoReceipts-Processing` | OCR Lambda, DLQ, S3 notification — dev |
| `Prod-CostcoReceipts-Processing` | the same, prod |
| `Prod-CostcoReceipts-Frontend` | S3 bucket, CloudFront distribution, ACM certificate, GitHub Actions deploy role |

Dev has no frontend stack; local development serves the app from `ng serve`.

```bash
npx cdk ls                                                   # dev stage (the default)
npx cdk ls -c stage=prod

npx cdk deploy Dev-CostcoReceipts-Processing
npx cdk deploy -c stage=prod Prod-CostcoReceipts-Processing
npx cdk deploy -c stage=prod Prod-CostcoReceipts-Frontend

npx cdk diff -c stage=prod Prod-CostcoReceipts-Frontend      # always worth running first
```

Deploy by name. A bare `cdk deploy` is not meaningful here, and `--all` only
covers the stacks the current stage selects.

## Things to know before changing anything

**The receipt-image buckets are not CDK resources.** They hold real user
uploads and are referenced with `fromBucketName`, which is what keeps every
stack resource disposable and the stacks freely renameable. Their CORS,
encryption and public-access settings therefore live outside CDK — see
`BUCKETS.md`.

**Only one stack may own a bucket's event notification.** CDK writes
notifications on a non-managed bucket with `Managed: false`, which *merges*
into the existing configuration rather than replacing it, so two stacks
pointing at the same prefix will OCR every upload twice.
`attachReceiptProcessorTrigger` is opt-in per stage for exactly this reason.

**The frontend stack keeps certificate domains separate from CloudFront
aliases.** An alias can only exist on one distribution at a time, so during a
cutover the stack is deployed first with no aliases — letting the certificate
issue and the distribution build outside the downtime window — and the alias is
added in a second deploy.

**`receipt-processor/requirements.txt` is pinned down to transitive
dependencies** so the Lambda's asset hash is reproducible — without that, the
same source resolves different package versions and produces an unintended
"code changed" diff on an unrelated deploy. Dependabot maintains the pins
(`.github/dependabot.yml`); regenerate by hand with
`pip install --dry-run --report r.json requests`.

See `RUNBOOK.md` for how the current layout came about and what the migration
taught us.
