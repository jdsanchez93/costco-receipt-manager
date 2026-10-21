# Roadmap and open design questions

What is left to build, and the decisions already made about how. This is a
forward-looking document: it deliberately does **not** restate the current
architecture (`CLAUDE.md`), how the October 2026 migration off Lambda and
DynamoDB was carried out (`cdk-backend/RUNBOOK.md`), or the bucket
configuration that lives outside CDK (`cdk-backend/BUCKETS.md`). Earlier
revisions of this file carried all of that; `git log` has them.

`docs/redesign-plan.local.md` is gitignored and holds the infrastructure
identifiers and exact config that do not belong here.

---

## Frontend — not started

- **Receipt identity in the list.** `receipts.html` shows
  `Receipt {{ m.receiptId }}` — the raw GUID — as the primary label. Needs a
  product decision first: a nickname field (a schema change) or a label
  derived from receipt contents (total, item count). Its own branch.
- **HEIC/WebP → JPEG conversion in the browser.** See the decided approach
  below. Deferred, not rejected: until it lands, a Chrome/macOS upload
  straight from Photos has to be exported as JPEG by hand.
- Skeleton loaders instead of centred spinners.
- Empty state on the receipts list.
- Bulk actions: "assign unassigned to me", and a per-item split-evenly button.
- **"Flag this receipt"** — a free-text comment for problems the automated
  subtotal check cannot catch. Demoted from the old manual-validation flow;
  genuinely useful but low value on its own. Revisit if it comes up in use.

---

### HEIC and WebP — the decided conversion approach (2026-09-24)
Found while dev-testing, not one of the three review threads above. A
Mac Photos HEIC upload (Chrome on macOS) made it through
`getUploadUrl`/S3 fine but broke two places downstream:
- **Textract can't read it.** `DetectDocumentText` accepts JPEG, PNG,
  PDF, and TIFF only (AWS "Set Quotas" page: 10MB, ≤10000px per side
  for sync ops). True of the old SAM Lambda and the new one — neither
  ever transcoded. **WebP is in the same boat** and was in both
  allowlists too; it just hadn't been hit yet.
- **Non-Safari browsers can't render HEIC** in an `<img>`, so
  `receipt-image.ts`'s "broken image → treat as no image" fallback
  fired instead of a real error.

**Temporary fix (committed):** JPEG/PNG only, enforced on both sides —
`ACCEPTED_TYPES` + the file input's `accept` (`receipt-upload.*`) and
`AllowedContentTypes` (`ReceiptsController.cs`), so a HEIC/WebP file
fails fast with "unsupported file type" instead of silently two
systems downstream.

**Why narrowing alone doesn't really fix it on a Mac:** the earlier
theory was that the old React app worked because its `accept` didn't
name HEIC, and iOS's photo picker auto-converts to JPEG in that case.
That transcode is an iOS behavior; Chrome on macOS doesn't do it — the
picker hands over the original HEIC (or filters it out), and
drag-and-drop ignores `accept` entirely. So on Chrome/macOS, photos
straight from the Photos library now just get rejected; the user has
to export as JPEG first (Photos → File → Export) or set the camera to
"Most Compatible". Acceptable as a stopgap, not as the end state.

**Deferred follow-up — client-side conversion to JPEG before upload.**
Decided approach when this gets picked up:
- Normalize anything that isn't JPEG/PNG to JPEG in the browser,
  before `getUploadUrl()`. WebP: native `createImageBitmap` + canvas,
  no library. HEIC: `heic-to` (maintained libheif-wasm wrapper) —
  *not* `heic2any` (last release 0.0.4, 2023; known to fail on newer
  iPhone HEICs). Lazy `import()` so only HEIC uploads pay the wasm
  download.
- Detect HEIC by magic bytes (`ftyp` box brand, e.g. `heic`/`heix`/
  `mif1`) or extension, not just `file.type` — some platforms report
  an empty type for `.heic`.
- Downscale while converting (~4000px long edge). HEIC→JPEG inflates
  size a lot; 48MP iPhone shots can blow past the 10MB Textract/client
  limit, and receipts don't need that resolution anyway.
- Re-widen both allowlists only for types the client converts — the
  backend should still only ever presign JPEG/PNG.
- **Not server-side** (e.g. `pillow-heif` in the processor Lambda):
  browsers still couldn't display the stored HEIC, so the Lambda would
  have to write a JPEG back to S3 — same key re-fires the S3 trigger,
  a new key changes download-URL logic and the Lambda's IAM scope.
  More infra for the same result.
- Minor, related: `app.py` reports `ocr-failed` then re-raises, so an
  unsupported format gets S3's two async retries (three Textract calls)
  before landing in the DLQ. Permanent failures like
  `UnsupportedDocumentException` could skip the re-raise — low
  priority once the allowlists block them up front.

---

## CI/CD Phase 2 — designed, not built

Automated API deploy. Shape is decided, nothing is built:
- Image built on a GitHub-hosted `ubuntu-24.04-arm` runner (free for
  public repos, so native arm64 with the Dockerfile unchanged) and
  pushed to **GHCR** — `GITHUB_TOKEN` authenticates with no stored
  credential, and a public package needs no `docker login` on the Pi.
- Deploy triggered by a **self-hosted runner on the Pi**, because the
  tunnel exposes only `127.0.0.1:8080` and no cloud runner can reach
  the box. Hardened so the repo can't dictate what runs there: the
  deploy script lives on the Pi rather than in the workflow, the runner
  user is not in the `docker` group and gets one `NOPASSWD` sudoers
  entry for that script alone, and the job runs only on push to `main`
  inside a branch-pinned `production` Environment, never on
  `pull_request`. Same boundary a separate private deploy repo would
  buy, without the cross-repo plumbing.
- Migrations via a **one-shot container from the same image**
  (`--migrate` flag) run as `costco_migrator`, preserving the DML/DDL
  split and making code/schema version skew structurally impossible.
  Needs a `costco_migrator'@'127.0.0.1'` grant — the existing
  `@localhost` grant only matches Unix-socket connections, the same
  distinction that made `costco_app@127.0.0.1` necessary.
- **Rule this introduces:** migrations must stay additive /
  backward-compatible, so an image rollback never needs a schema
  rollback.
- Known cost of deferring: the API pipeline's first real deploy lands
  on production rather than staging. Mitigated by making that first run
  a deliberate no-op deploy of an identical SHA.
- The deploy script and `docker-compose.prod.yml` are copied to the Pi
  by hand, never by CI — that's the point. Changes to either need a
  manual `scp`.

---

## Standing decision: AWS credentials on the Pi (2026-09-13)

The API runs in a Docker container on the Pi, not on AWS-managed
compute, so neither "use an IAM role" nor container credentials
(`AWS_CONTAINER_CREDENTIALS_*`, which needs an ECS/EKS-style agent
that doesn't exist here) apply. The AWS-native alternative to a static
key, **IAM Roles Anywhere**, would need its own PKI (self-managed CA,
manual cert issuance/rotation/revocation) since AWS Private CA costs
$50–400/mo — real ongoing operational surface for one personal box.

**Decision: a plain IAM user with an access key**, scoped to exactly
`s3:PutObject`/`s3:GetObject`/`s3:HeadObject` on
`arn:aws:s3:::<bucket>/uploads/*`, delivered via `api/.env` as
`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` (the AWS SDK's own
well-known env var names, picked up by the default credential chain).
Static and long-lived, but tight IAM scoping is proportionate for a
single personal device — revisit Roles Anywhere with an external CA if
eliminating static keys ever becomes a real priority.

---

## Open questions

- Is `SharedController`'s response shape still correct given the newer contacts
  model? Worth a review before the shared-view path gets more traffic.
- Does the Auth0 dashboard have "Allow Offline Access" enabled for the API?
  Needed for real refresh-token issuance. Silent auth still works without it
  via the iframe fallback, but that is fragile long-term.
- Should `cdk deploy` move into CI? The original blocker is gone — it was the
  retired .NET Lambda's non-reproducible asset hash, and the OCR Lambda's
  dependencies are now pinned. What remains is a preference: a bad processing
  deploy breaks the OCR trigger silently, and you would only find out on the
  next upload.
