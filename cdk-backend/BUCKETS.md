# Receipt-image buckets (not CDK-managed)

`prod-costco-receipt-images` and `dev-costco-receipt-images` hold real
user-uploaded receipt images. They are deliberately **outside** CDK's ownership,
referenced by name via `s3.Bucket.fromBucketName` in
`lib/receipt-processing-stack.ts` — the same way the DynamoDB table always was
("must exist before deployment, not created by this stack").

**Why:** they long predate the current stacks and never change shape, while the
stacks around them get renamed, recreated and destroyed. Keeping a durable data
store inside a stack is what made the previous layout effectively unrenameable —
moving it would have meant another retain + `cdk import` dance, against the
documented gotchas (the no-other-changes rule, `Outputs` having to match
exactly, silent drift on non-identity properties). Taking the bucket out instead
makes every remaining resource disposable.

**The tradeoff** is this file: the bucket's own configuration isn't IaC, so it
lives here. Less of a loss than it looks — `cdk import` had already left drift
on exactly these properties (dev's CORS stayed on the old SAM `localhost:3000`
origin while CDK's declared state said `4200`), so the declared state was
already not the real state.

> **Verified against the live buckets on 2026-10-05** (Phase 0 of `RUNBOOK.md`).
> Raw captures are in `cdk-backend/bucket-config/` (gitignored).

## CORS

Required for the browser's direct presigned `PUT` (upload) and `GET` (image
display). Identical on both buckets except `AllowedOrigins`.

```jsonc
{
  "CORSRules": [
    {
      "AllowedHeaders": ["*"],
      "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
      // prod: ["https://costco.jd-sanchez.com", "https://next.jd-sanchez.com"]
      //       drop the next. origin once that domain is retired
      // dev:  ["http://localhost:4200"]
      "AllowedOrigins": ["https://costco.jd-sanchez.com"],
      "ExposeHeaders": ["ETag", "x-amz-meta-custom-header"],
      "MaxAgeSeconds": 3000
    }
  ]
}
```

Reapply from a Phase 0 capture:

```bash
aws s3api put-bucket-cors --bucket prod-costco-receipt-images \
  --cors-configuration "$(python3 -c "import json;d=json.load(open('bucket-config/prod-costco-receipt-images.cors.json'));print(json.dumps({'CORSRules':d['CORSRules']}))")"
```

## Encryption

SSE-S3 (`AES256`), `BucketKeyEnabled: false`, on both. Nothing to maintain.

## Versioning — OFF on both

Worth knowing, because it's easy to assume otherwise: these buckets hold the
**only** copy of every receipt image, with no versioning, no replication and no
backup. An accidental delete or an overwrite of an existing key is
unrecoverable. Enabling versioning is one command and costs almost nothing at
this scale:

```bash
aws s3api put-bucket-versioning --bucket prod-costco-receipt-images \
  --versioning-configuration Status=Enabled
```

(Deliberately not done as part of the migration — it's an independent
durability decision, not a migration step.)

## Bucket policy and lifecycle rules

Neither bucket has either (`NoSuchBucketPolicy`, `NoSuchLifecycleConfiguration`).
Access is entirely via IAM identity policies — the Pi's IAM user and the OCR
Lambda's role.

## Public access block

All four settings **disabled** on both buckets, inherited from the original SAM
template and predating S3's block-by-default change. Nothing is public, but the
bucket permits a public ACL or policy to be set. Presigned URLs — the only way
this app touches S3 — work fine with the block fully enabled, so tightening it
is recommended; see `RUNBOOK.md`'s hardening section.

## Key layout

Uploads live under `uploads/<url-encoded-auth0-sub>/<receiptId>.jpg`. The
`uploads/` prefix is load-bearing in two places: the OCR Lambda's IAM grant is
scoped to `uploads/*`, and the S3 event notification filters on it.

## Who writes to them

- **The Pi's API** (`ReceiptsController`) mints presigned PUT/GET URLs with an
  IAM user scoped to `s3:PutObject`/`GetObject`/`HeadObject` on `uploads/*`.
  See `redesign-plan.md`'s "AWS credentials on the Pi".
- **The OCR Lambda** reads `uploads/*` only, triggered by the bucket
  notification configured in `ReceiptProcessingStack`.
