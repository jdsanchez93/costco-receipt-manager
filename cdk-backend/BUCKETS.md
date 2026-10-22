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

**The tradeoff** is that the configuration is not applied by `cdk deploy`. It is
still version-controlled and reproducible, as JSON in `s3-config/` plus the
commands below — just applied deliberately rather than on every deploy. Less of
a loss than it sounds: `cdk import` had already left drift on exactly these
properties (dev's CORS stayed on the old SAM `localhost:3000` origin while
CDK's declared state said `4200`), so being CDK-managed never did guarantee the
declared state was the real one.

The flip side is that nothing detects drift automatically. If something here
ever looks wrong, compare against the live buckets rather than trusting this
file.

## Desired state lives in `s3-config/`

Because these buckets are outside CDK, their configuration is kept as applyable
JSON next to this file rather than only described here. To reapply any of it:

```bash
export AWS_PROFILE=jd-sanch-admin
B=prod-costco-receipt-images          # or dev-costco-receipt-images

aws s3api put-bucket-cors               --bucket $B --cors-configuration file://s3-config/cors-prod.json
aws s3api put-public-access-block       --bucket $B --public-access-block-configuration file://s3-config/public-access-block.json
aws s3api put-bucket-versioning         --bucket $B --versioning-configuration Status=Enabled
aws s3api put-bucket-lifecycle-configuration --bucket $B --lifecycle-configuration file://s3-config/lifecycle.json
```

(`s3-config/` is the intended state and is tracked. `bucket-config/` is a
gitignored point-in-time capture taken during the migration — different thing.)

## CORS

Required for the browser's direct presigned `PUT`. Note the browser makes
exactly one kind of request to S3: that `PUT`, with a `Content-Type` header, so
it is preflighted. Receipt images render through a plain `<img [src]>` with no
`crossorigin` attribute, which is not a CORS request at all — `GET` and `HEAD`
are kept only so a future `fetch()` of an image does not fail mysteriously.

`POST` and `DELETE` were in the original SAM rule and nothing ever used them.
`ExposeHeaders` likewise carried an `x-amz-meta-custom-header` entry with no
consumer.

Origins differ per stage: prod is `https://costco.jd-sanchez.com`, dev is
`http://localhost:4200`.

## Public access block

All four settings on. Nothing here is public and nothing needs to be: presigned
URLs are IAM-signed requests, unaffected by the block. These buckets predate
S3's block-by-default change, which is why it had to be enabled explicitly.

## Versioning and lifecycle

Versioning is **on**. These buckets hold the only copy of every receipt image —
no replication, no backup — so without it an accidental delete or a key
overwrite is unrecoverable. It is also what makes deleting a receipt's image
when the receipt is deleted safe: the API's delete only writes a delete
marker, and the Pi's IAM user has no `s3:DeleteObjectVersion`, so the image
stays recoverable until the noncurrent-version rule below expires it.

Two lifecycle rules keep that from growing without bound:

- noncurrent versions expire after 90 days
- incomplete multipart uploads are aborted after 7 days, so a failed large
  upload cannot leave invisible billable parts behind

## Encryption

SSE-S3 (`AES256`), `BucketKeyEnabled: false`, on both. Nothing to maintain.

## Bucket policy

Neither bucket has one. Access is entirely through IAM identity policies — the
Pi's IAM user and the OCR Lambda's role.

## Key layout

Uploads live under `uploads/<url-encoded-auth0-sub>/<receiptId>.<ext>`, the
extension following the upload's content type (`.jpg` or `.png`; everything
uploaded before 2026-10-22 is `.jpg` regardless). The key is chosen once at
upload and stored in `receipts.ImageKey`, so download and delete read it rather
than rebuild it. The `uploads/` prefix is load-bearing in two places: the OCR
Lambda's IAM grant is scoped to `uploads/*`, and the S3 event notification
filters on it.

## Who writes to them

- **The Pi's API** (`ReceiptsController`) mints presigned PUT/GET URLs, and
  deletes a receipt's image when the receipt is deleted, with an IAM user
  scoped to `s3:PutObject`/`GetObject`/`HeadObject`/`DeleteObject` on
  `uploads/*`. See `redesign-plan.md`'s "AWS credentials on the Pi".
- **The OCR Lambda** reads `uploads/*` only, triggered by the bucket
  notification configured in `ReceiptProcessingStack`.
