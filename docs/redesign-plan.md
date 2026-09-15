# Costco Receipt Manager — Redesign Plan

This is the north-star doc for the ongoing migration from the original
Node.js / React / DynamoDB / AWS-SAM stack to the current .NET 10 /
Angular / MySQL stack targeted for self-hosted deployment. Keep it up
to date as decisions land; it's meant to be the fastest way for
future-you (or a fresh session) to pick up where things stand.

---

## Current state (as of 2026-09)

### Backend — ✅ mostly done
- **`api/CostcoReceipts.Api/`** — ASP.NET Core 10, EF Core (Pomelo MySQL)
- Schema: `users`, `contacts` (owner-scoped address book), `receipts`,
  `receipt_members`, `receipt_items`, `receipt_item_assignments`,
  `receipt_geometry`, `receipt_shares`. Migrations under `Migrations/`.
- Auth0 JWT auth via `Authentication/`; per-receipt role guard
  (`Authorization/ReceiptRoleAuthorizationHandler`) enforces
  `ReceiptMember` / `ReceiptEditor` / `ReceiptOwner` policies.
- `UserProvisioningMiddleware` upserts `users` + a self-contact on
  every authenticated request.
- Controllers: `ReceiptsController`, `ReceiptItemsController`,
  `ReceiptMembersController`, `ReceiptSharesController`,
  `SharedController` (public), `HealthController`.
- **`api/CostcoReceipts.Migration/`** — one-shot DynamoDB → MySQL data
  migration + `--merge-placeholders-by-name` cleanup command.
- Local dev: `docker compose -f api/docker-compose.yml up -d` then
  `cd api/CostcoReceipts.Api && dotnet run` on port 5002.

### Frontend (new) — 🚧 in progress
- **`frontend-angular/`** — Angular 21, Angular Material 21 (M3 tokens,
  cyan primary), Auth0 SDK v2.11.
- Landed:
  - Landing page (public, redirects to `/app` if authenticated via
    `skipLandingIfAuthed` guard)
  - Shell (nav + toolbar + logout) under `/app`, gated by `AuthGuard`
  - Receipts list at `/app/receipts`
  - Receipt detail at `/app/receipts/:receiptId` with interactive
    assignment editing (chip + `+` menu pattern), bulk actions
    (Assign to / Split evenly), optimistic updates + revert
  - Member management (`receipt-members/`) inside receipt detail —
    add placeholder participant, change role (owner/editor), remove.
    Owner-only controls gated on the caller's own membership role;
    non-owners get a read-only roster. Parent re-derives item
    assignments when the roster changes (removed member cascades off
    items, matching the backend's FK cascade).
  - Share management (`receipt-shares/`) inside receipt detail —
    owner-only panel to create / list / deactivate public share links.
  - Public shared-receipt view at `/shared-receipt/:shareToken`
    (`shared-receipt/`) — no shell, no guard, no bearer token (added an
    `allowAnonymous` allowlist entry for `/api/receipts/shared/*` in
    `app.config.ts`). Read-only; renders a stat strip, the per-member
    breakdown, the item list, and a sign-up CTA. Invalid/expired tokens
    render an error state (the route itself is unguarded).
  - Per-member totals (`member-totals/`, `<app-member-totals>`) — "who
    owes what", equal split of each item's `price − discount` across its
    assignees + an unassigned bucket + a reconcile check. Shown on both
    the shared view and the authenticated detail page.
  - Shared presentational pieces: `<app-receipt-items>`
    (`receipt-items/`, the item list — `editable`/`selectable` inputs)
    and pure helpers in `receipts/receipt-view.ts` (`Loadable<T>`,
    `enrichItems`, `receiptTotal`, `computeMemberTotals`), used by the
    detail page, the shared view, and the shares panel.
  - Routes are now lazy (`loadComponent`) so an anonymous visitor on
    `/shared-receipt` doesn't pull the authenticated app; this also
    brought the production bundle back under the CI budget.
- API client at `src/app/api/` — typed against backend DTOs
- Auth0 config uses refresh tokens + localStorage for silent re-auth
- Config files (`environment*.ts`) are **gitignored** — see
  `MEMORY.md` for the reasoning

### Frontend (old React) — kept as reference
- **`frontend/`** — the original React + Material-UI implementation
- **Not being deleted yet** — it's the design/UX reference for
  everything not yet ported. When building a new Angular component,
  look at its React equivalent first for UX cues (some patterns will
  need adjustment; see the ItemAssignment story in git history for
  how we translated Material-UI conventions into Angular Material).
- Key components worth referencing per port target below.

---

## External infrastructure — the AWS SAM stack

This is the biggest piece of the puzzle that **still lives outside this
repo**. It predates the current migration and continues to run in
production.

### What it does
Per the "S3 Upload Integration" section of `CLAUDE.md`:

1. Frontend calls `POST /api/receipts/get-upload-url` on the .NET API
2. .NET API forwards the JWT to an external AWS API Gateway
   (`S3_UPLOAD_API_URL`) with an optional `content_type` in the body
3. External Lambda returns `{ upload_url, receipt_id, expires_in }`
4. Frontend uploads the file directly to the presigned S3 URL
5. S3 upload triggers a Textract job on the image
6. A downstream Lambda parses Textract output and writes the receipt
   (items, geometry, ownership) into **DynamoDB** — *not the new
   MySQL database*
7. Download URLs work the same way via `S3_DOWNLOAD_API_URL`

### Where it lives
- Separate AWS SAM project in another repo (not in this workspace)
- Deployed to the user's AWS account
- Currently referenced from .NET user-secrets as
  `S3_UPLOAD_API_URL` / `S3_DOWNLOAD_API_URL` (dev values are the
  `a2b584vx4d.execute-api.us-east-1.amazonaws.com/Prod/*` endpoints)
- Uses the same Auth0 tenant / audience as this app for JWT validation

### Components of the external stack (confirmed 2026-09-11 by reading `costco-receipt-parser`)
- **S3 bucket** — stores receipt image originals at
  `uploads/{user_id}/{receipt_id}.jpg`
- **`UploadUrlFunction` / `DownloadUrlFunction`** — the two Lambdas
  behind API Gateway; pure presigned-URL generators, no OCR logic
- **`ReceiptProcessorFunction`** (`receipt_processor/app.py`) — S3
  `ObjectCreated` trigger. Calls `get_receipt_data_from_s3()`
  (Textract `AnalyzeExpense` + **255 lines of bespoke regex parsing**
  in `textract_ocr.py` tuned to Costco's specific receipt layout —
  item/price/discount line patterns), then makes three isolated calls
  into `single_table.py`: `write_receipt_items`,
  `store_receipt_geometry`, `add_authenticated_user_to_receipt`
  (owner role, empty display_name/email for the webapp to fill in).
  This is a small, clean write path — good news for the Phase 2 bridge
  below.
- **API Gateway** — fronts only the two URL Lambdas with an Auth0 JWT
  authorizer; `ReceiptProcessorFunction` has no HTTP route, it's
  purely S3-triggered
- **DynamoDB table** (`{stack-name}-main`) — written to only by
  `ReceiptProcessorFunction`'s three calls above

The parsing logic is under active tuning (`costco-receipt-parser`
last commit 2026-02-09, "Improve discount matching strategy") — it's
not a thin Textract wrapper, it's the product of real-world debugging
against actual Costco receipts.

### Why this is a problem for the new architecture
The .NET API's `GetUploadUrl` endpoint just forwards to this stack.
Uploads through the new stack still land in **DynamoDB, not MySQL**.
The MySQL data was seeded once by `CostcoReceipts.Migration` and only
grows via manual member/assignment edits through the new API — new
uploads are invisible to it.

Until this stack is moved (or bridged), the new backend is effectively
a read/write view over a stale snapshot for new receipts.

### Plan to bring it in-house

**Design decisions — resolved 2026-09-11:**

1. **OCR engine — keep AWS Textract, via the existing Python Lambda,
   indefinitely.** No hard AWS budget cap, so per-page Textract cost
   isn't a constraint. More importantly, `textract_ocr.py` isn't a
   thin Textract wrapper — it's tuned, actively-maintained regex
   parsing specific to Costco's layout. Porting it to C# would be a
   real rewrite with real regression risk for zero user-facing
   benefit. **The "own the OCR pipeline" phase is dropped** — see
   revised phased plan below. `ReceiptProcessorFunction` stays a
   permanent part of the architecture (still Python, still calling
   Textract), not a migration target for rewriting logic — though see
   the 2026-09-13 update below on *where* it's deployed from.

2. **Storage for receipt images — keep AWS S3.** Same reasoning: no
   budget pressure to self-host, and presigned URLs are trivial via
   `AWSSDK.S3` for .NET. No need to explore MinIO/filesystem hosting
   on the Pi.

3. **Processing model — unaffected, stays async via S3 event trigger.**
   Since OCR keeps running in the existing Lambda (not moved into the
   .NET request path), there's no sync-vs-async tradeoff to make on
   the .NET side. The only remaining question is how the frontend
   learns an upload finished processing (poll `GET /receipts/{id}` vs.
   SSE/WebSocket) — that's a frontend detail, not an infra decision,
   and already tracked in the Priority 2 table below.

4. **Retry / re-processing — still open, deferred.** Should users be
   able to re-run OCR on an existing receipt if the parser improves?
   Low urgency; revisit if it comes up in practice.

5. **Where the bucket + processor Lambda are deployed from — resolved
   2026-09-13: consolidate into the `cdk-backend` CDK stack, don't
   leave them in the standalone SAM app.** Originally the plan kept
   `ReceiptImageBucket` + `ReceiptProcessorFunction` living forever in
   the separate `costco-receipt-parser` SAM stack, on the theory that
   they're permanent anyway so there's no need to move them. But the
   separation itself has been actual, recurring friction — `template.yaml`
   and `costco-receipts-stack.ts` independently thread `mainTableName`,
   `s3UploadApiUrl`, `s3DownloadApiUrl` between two stacks deployed by
   two different tools (`sam deploy` vs `cdk deploy`), and once Phase 1
   ships the two URL-Lambda params are dead weight anyway. Moving the
   Lambda in *with* the bucket (not just the bucket) avoids the
   cross-stack S3-notification-to-Lambda wiring problem entirely, since
   CDK can own both ends and wire the event notification itself
   (`bucket.addEventNotification(...)`) instead of the manual
   `AWS::Lambda::Permission` + `NotificationConfiguration` glue in
   `template.yaml` today.

   `receipt_processor/`'s Python source gets **vendored into this repo**
   (e.g. `cdk-backend/receipt-processor/`) rather than referenced from
   the sibling `costco-receipt-parser` repo by relative path — keeps
   the deploy self-contained (no assumption that a sibling repo exists
   on disk or in CI) and lets `costco-receipt-parser` be archived once
   cutover is verified. Bundled the same way the existing .NET Lambda
   already is (`costco-receipts-stack.ts:127-138` — `Code.fromAsset`
   with a Docker `bundling.image`), just swapping in
   `lambda.Runtime.PYTHON_3_13.bundlingImage` and a `pip install -t
   /asset-output` command instead of `dotnet publish`. No new tooling;
   same pattern applied twice.

**Suggested phased migration:**

1. **Phase 1 — Presigned URL endpoint in .NET.**
   Move just the URL-generation piece from the SAM Lambdas into the
   .NET API. `GetUploadUrl` and `GetDownloadUrl` stop being
   passthroughs and use `AWSSDK.S3` directly. The Pi needs AWS
   credentials (via IAM user or role) to sign requests, but no other
   AWS runtime is invoked from the Pi. Small, self-contained change.
   S3 stays as-is; Textract stays in AWS. Nothing about the parsing
   pipeline changes yet.

2. **Phase 2 — Consolidate the bucket + processor into CDK, and bridge
   writes into MySQL, in one migration.**

   **Part A — build now, cut over later — done 2026-09-15**
   (`feat/receipt-processing-bridge`): the internal bridge endpoint
   (`POST /api/internal/receipts/{id}/ocr-results`, shared-secret
   auth), the vendored + rewritten `receipt-processor/` Lambda source
   (POSTs to the bridge instead of writing DynamoDB), and the CDK
   constructs — all built and verified (real Textract + real MySQL
   write, confirmed via a local invocation script — see below), but
   **not deployed**. `deployReceiptProcessing` defaults `false`, so
   `cdk deploy` today is a no-op for all of it (confirmed via
   byte-for-byte `cdk synth` diff against the pre-change template).

   **Local dev without deploying anything**: `receipt_processor/app.py`'s
   `lambda_handler` is a plain Python function — no Lambda runtime
   required to run it. `cdk-backend/scripts/local_upload_and_process.py`
   calls `get-upload-url`, PUTs to the real (still SAM-managed) dev
   bucket, then invokes `lambda_handler` directly in-process, so
   `INTERNAL_API_URL` is just `localhost` — nothing to bridge. Real
   Textract, real bridge write, zero deploys.

   **Gotcha found while building this**: the *live* SAM stack's bucket
   notification (`template.yaml`'s `ReceiptImageBucket`) has no prefix
   filter — `Event: 's3:ObjectCreated:*'` with no `Filter` block fires
   on *any* object written anywhere in the bucket. So every test
   upload today (local script or otherwise) also fires the old,
   still-live `ReceiptProcessorFunction` in parallel, which throws
   `ConditionalCheckFailedException` on repeat uploads to the same
   receipt (its DynamoDB write uses
   `ConditionExpression='attribute_not_exists(...)'`, not an idempotent
   replace). Harmless noise for now — the old stack is being retired,
   not real data — but worth knowing so it isn't mistaken for a bug in
   the new pipeline.

   **Cutover-time trigger design (resolved 2026-09-15)**: split into
   two independent flags rather than one. `deployReceiptProcessing`
   deploys the bucket + Lambda + DLQ; a separate
   `attachReceiptProcessorTrigger` wires the S3 event notification.
   **Dev**: first flag `true`, second `false` — real CDK-managed
   bucket and real deployed Lambda (so the actual deployed artifact
   can be manually `aws lambda invoke`d and sanity-checked
   occasionally — catches packaging/IAM bugs a local Python call with
   a broad SSO profile wouldn't), but test uploads never also trigger
   it automatically, avoiding the exact double-processing/noise/cost
   problem above. **Prod**: both flags `true` — real users need real
   automatic triggering. Verified via `cdk synth` in all three shapes
   (flag off / dev shape / full shape) that the notification-related
   resources appear only when both flags are on.

   **Part B — the actual cutover, still deferred until the Pi + Cloudflare
   Tunnel exist:**
   - **Bucket** (has real data — needs the import dance, not a fresh
     create): set `DeletionPolicy: Retain` + `UpdateReplacePolicy: Retain`
     on `ReceiptImageBucket` in `template.yaml`, `sam deploy` to apply
     it, remove the resource from `template.yaml`, `sam deploy` again
     (CFN drops it from the SAM stack but Retain keeps the real bucket
     + its objects alive — same name, same data, zero copying). Run
     `cdk import` to adopt the existing bucket into the already-written
     `s3.Bucket` construct.
   - Deploy with `deployReceiptProcessing=true`, `attachReceiptProcessorTrigger=false`
     first, manually invoke the real deployed Lambda to confirm it
     works, *then* redeploy with the trigger flag also `true` once
     confident.
   - Point `internalApiUrl` at the real Pi/Cloudflare-Tunnel address.
   - Verify end-to-end with a real receipt upload against the new CDK
     stack, then `sam delete --stack-name costco-receipt-parser` and
     archive that repo.
   - After this: one CDK stack, one `cdk deploy`, no DynamoDB in this
     data path, and `S3_UPLOAD_API_URL` / `S3_DOWNLOAD_API_URL` /
     the SAM-side `mainTableName` usage are all gone. (Note:
     `mainTableName` itself isn't fully dead yet — `cdk-backend`'s own
     .NET 8 Lambda API still reads/writes the same DynamoDB table until
     Pi cutover retires that Lambda too; this phase only removes the
     *processor's* DynamoDB dependency.)

---

## Frontend plan (remaining Angular work)

Ordered by user-visible value, with the corresponding React reference
component and any dependencies.

### Priority 1 — features that work today (backend already supports them)

| Feature | Angular status | React reference | Notes |
|---|---|---|---|
| **Member management** — add placeholder, change role, remove | ✅ Built (`receipt-members/`) | `ReceiptMembers.tsx` | Lives in receipt detail as a panel. Add form is inline (name + optional email + role); role change via row menu; remove has an inline confirm. Owner-gated; backend last-owner guards surface as snackbars. |
| **Share management** — create / list / deactivate a share link | ✅ Built (`receipt-shares/`) | `ReceiptSharing.tsx` | Owner-only panel in receipt detail. Create form uses preset expiry chips (7/30/90 + custom); per-row copy-to-clipboard (`@angular/cdk/clipboard`) + inline-confirm deactivate. Panel owns its own list (no parent state depends on it). Note: `currentUses` is never incremented by the backend, so no view-count is shown. |
| **Public shared-receipt view** at `/shared-receipt/:token` | ✅ Built (`shared-receipt/`) | `SharedReceipt.tsx` | Unauthenticated top-level route, no shell. Reuses `<app-receipt-items>` (read-only) + `<app-member-totals>`. Anonymous API call via an `allowAnonymous` interceptor entry. The receipt image is still intentionally omitted (needs `GetDownloadUrl` + is a public-surface risk to design carefully — see below); the server-computed subtotal-match badge (below) *is* now included — only the raw OCR label/value/bounding-box geometry stays off the public DTO. |
| **Receipt validation** — automated subtotal match badge | ✅ Built | `ReceiptValidation.tsx` | Done 2026-09-11: dropped the manual confirm/dispute step entirely. In the old React app the "confirmed/disputed" click never added information beyond a comparison the frontend already computed cosmetically (`getValidationStatus()` in `ReceiptValidation.tsx`, diffing OCR subtotal vs. summed items with a 1¢ tolerance) — the backend never checked it itself, and the buttons didn't even respect the computed status. Now `GeometryDto.SubtotalMatch` (`ReceiptCalculations`/`SubtotalMatchDto` in `Models/ReceiptDtos.cs`) computes `matches`/`ocrSubtotal`/`difference` server-side in `GET /receipt/{id}/geometry` and the shared endpoint alike (`|OCR subtotal − Σ(price − discount)| ≤ $0.01`), rendered as an `<app-status-badge>` on both receipt detail and the shared view. `ValidationStatus`/`ValidatedAt`/`Comments` were dropped from `ReceiptMember` (migration `RemoveReceiptMemberValidationFields`) and `POST /api/receipts/validate/:id` was deleted — nothing referenced them outside the removed endpoint and the migration project's write path (which now just stops persisting those columns; still parses them off legacy Dynamo rows, same as the already-unused `ValidatedBy`). The "flag this receipt" idea in Priority 3 remains a separate, not-yet-built feature. |
| **Per-member totals** — "who owes what" breakdown at the bottom of a receipt | ✅ Built (`member-totals/`) | `MemberTotals.tsx` | `computeMemberTotals` in `receipts/receipt-view.ts`; equal split of `price − discount` per assignee + unassigned bucket + reconcile check. On both the shared view and the authenticated detail page. |

### Priority 2 — needs infrastructure decisions first

| Feature | Angular status | React reference | Blocker |
|---|---|---|---|
| **Receipt upload** (drag-drop → presigned URL → S3 → OCR) | Not built | `ReceiptUpload.tsx` | Waits on **Phase 1 or Phase 2** of the SAM migration above. Without Phase 2, uploads land in DynamoDB and never appear in the MySQL-backed UI. |
| **Receipt image display** in detail page | Not built | `ReceiptImage.tsx` | Needs the `GetDownloadUrl` endpoint wired end-to-end. Backend method exists but isn't consumed yet. **Also decide the shared-view story**: exposing a presigned S3 URL on the *public* `/shared/{token}` endpoint is an abuse surface (bandwidth/cost via scripted refresh). Mitigate at the API — short URL TTL, per-token rate limit, maybe a `currentUses` cap — before adding the image to `shared-receipt/`. The frontend split doesn't constrain this either way. **Design idea (2026-09-11):** once the image is on screen, revisit where the subtotal-match badge (Priority 1, done) lives — the old React app highlighted the OCR'd subtotal region directly on the receipt image via its bounding-box geometry (`GeometryEntryDto.BoundingBox`, already returned by the API and unused on the frontend today); worth reintroducing that highlight colored to match the badge's tone (success/warning) instead of (or alongside) a standalone badge. |

### Priority 3 — polish / nice-to-have

- **Skeleton loaders** instead of centered spinners on both list and detail pages
- **Empty state on receipts list** that links to upload once upload UI exists
- **Better receipt display in list** — currently shows raw UUID; would need per-receipt aggregate endpoint or client-side derivation from items
- **Bulk actions we skipped:** "assign unassigned to me," per-item split-evenly button
- **Frontend CI/deploy story** — build → S3 sync → CloudFront invalidation
- **"Flag this receipt" comment** — free-text flag for problems the automated subtotal check can't catch (e.g. OCR misreads an item price but the subtotal still happens to match). Demoted from the old manual-validation flow (see Priority 1) — genuinely useful but low-value on its own; revisit once the automated badge ships.

---

## Infrastructure plan (Pi deployment)

The Pi target isn't set up yet. When it is:

- MySQL 8 running on the Pi (from `docker compose up -d` matching
  the current local dev setup)
- `dotnet publish -r linux-arm64 --self-contained false` for the API
- `systemd` unit to keep the API running (draft goes in `api/deploy/`)
- Cloudflare Tunnel exposes the API at
  `api.costco.jd-sanchez.com` (or similar) — no port opening on the
  home LAN
- Frontend continues to deploy to S3 + CloudFront (unchanged)
- Frontend's `environment.production.ts` (gitignored) is generated by
  CI from GitHub Actions secrets before `ng build`

None of the above is blocked by anything except deciding to do it.

### AWS credentials on the Pi (decided 2026-09-13)

The API runs as a native `linux-arm64` process under `systemd` on the
Pi, not in a container and not on any AWS-managed compute — so the
usual "just use an IAM role" answer doesn't apply, and neither does
**container credentials** (`AWS_CONTAINER_CREDENTIALS_*`): that
mechanism only works because something is actually running to vend the
credentials (the ECS agent for a Task IAM Role, or the EKS Pod Identity
agent), and neither exists on a bare Pi. Standing up an equivalent
yourself would mean building and operating a personal clone of the ECS
agent for one physical box — not worth it.

The AWS-native answer for a non-AWS physical host wanting to avoid
static keys is **IAM Roles Anywhere** (mutual-TLS, vends short-lived
STS credentials). Its trust anchor doesn't require **AWS Private CA**
(that would cost real money — $400/mo general-purpose, or $50/mo in
"short-lived certificate" mode — dwarfing everything else this project
spends on AWS): Roles Anywhere explicitly also accepts an **external,
self-managed CA certificate** as the trust anchor, which is free.
The catch is you're then running your own PKI — generating and
protecting a CA private key, issuing/rotating the Pi's client cert, and
handling revocation by hand (Roles Anywhere can import a CRL, but you
have to produce and upload it yourself). Real ongoing operational
surface for a single box.

**Decision: use a plain IAM user with an access key**, scoped to
exactly what's needed (`s3:PutObject`/`s3:GetObject`/`s3:HeadObject` on
`arn:aws:s3:::<bucket>/uploads/*`, nothing broader), delivered to the
Pi's systemd unit as `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` env
vars (or an `~/.aws/credentials` profile via `AWS:Profile` — either
works with the app code as written, since `AwsOptions.Profile` is
optional and falls through to the SDK's default credential chain when
unset). It's a static long-lived secret, but tight IAM scoping plus
treating it like any other secret is proportionate for a single
personal device — revisit Roles Anywhere with an external CA later if
eliminating static keys becomes a real priority.

---

## Suggested next order of operations

1. ~~**Members management UI**~~ ✅ done — `receipt-members/`
2. ~~**Share management + public shared-receipt view**~~ ✅ done —
   `receipt-shares/` + `shared-receipt/`. Sharing now works end-to-end.
3. ~~**Per-member totals**~~ ✅ done — `member-totals/` (on both the
   shared view and the authenticated detail page)
4. ~~**Receipt validation**~~ ✅ done — automated subtotal-match badge (see Priority 1 table); no manual confirm/dispute step
5. ~~**Upload pipeline design session**~~ ✅ done 2026-09-11, extended
   2026-09-13 — see resolved decisions above (keep Textract + existing
   Python parser, keep S3, drop the OCR-pipeline-rewrite phase,
   consolidate the bucket + processor Lambda into the CDK stack).
   Phase 1 and Phase 2 are pure code changes and don't need the Pi to
   be ready.
6. **Phase 1 of upload migration** — presigned URLs in .NET
7. **Phase 2 of upload migration** — consolidate bucket + processor
   Lambda into CDK, bridge writes to MySQL, retire the SAM app
8. **Receipt upload UI** (unblocked by Phase 2)
9. **Pi setup** (physical, not started yet) — can happen in parallel
   with any of the above; only actually blocks self-hosted production
   deployment, not the code work
10. **Retire React frontend** — once feature parity is reached

---

## Open questions (things a future session should ask before starting)

- ~~Is the Pi hardware set up yet?~~ Confirmed 2026-09-11: not set up
  yet. Blocks actual production self-hosted deployment; does not
  block Phase 1/2 code work, which can be built and tested against
  local/dev infra.
- ~~Which OCR engine?~~ Resolved 2026-09-11: keep AWS Textract via the
  existing Python Lambda, indefinitely — see "Design decisions" above.
- ~~Is there a hard budget cap on AWS spend?~~ Confirmed 2026-09-11:
  no hard cap — Textract/S3 cost is acceptable, no need to explore
  local/self-hosted alternatives.
- Is `SharedController`'s response shape still correct given the new
  contacts model? Worth a quick review before wiring the public view
- Does the Auth0 dashboard have "Allow Offline Access" turned on for
  the API? Needed for real refresh-token issuance (silent auth still
  works without it via iframe fallback, but is fragile long-term)

## Docs cleanup (low priority, not blocking anything)

Both root-level docs predate the current migration and are stale
relative to this plan:
- **`CLAUDE.md`** documents `cdk-backend` (Lambda + DynamoDB) as the
  backend without mentioning `api/` (.NET 10 + MySQL), which is now
  the actively-developed backend.
- **`README.md`** references a `backend/` Node/Express directory that
  no longer exists in the repo, plus DynamoDB table setup and
  Docker/ECS deployment instructions that don't match the Pi-targeted
  plan.

Worth a rewrite pass once the upload migration phases settle down and
the architecture stops shifting under the docs.

---

## Reference: file layout

```
claude-costco-webapp/
├── docs/
│   └── redesign-plan.md          ← this file
├── api/                          ← new backend
│   ├── CostcoReceipts.Api/
│   ├── CostcoReceipts.Migration/
│   └── docker-compose.yml
├── frontend-angular/             ← new frontend (in progress)
│   └── src/app/
│       ├── landing/
│       ├── shell/
│       ├── receipts/             ← list
│       ├── receipt/              ← detail + assignment
│       ├── auth/
│       └── api/
├── frontend/                     ← old React (reference only)
│   └── src/components/           ← port targets live here
├── cdk-backend/                  ← CDK infra: frontend hosting (S3+CloudFront)
│   │                                today; gains the receipt image bucket +
│   │                                processor Lambda in Phase 2 (see above) —
│   │                                not dead code, still the active IaC stack
│   └── receipt-processor/        ← (Phase 2) vendored from costco-receipt-parser
└── CLAUDE.md                     ← detailed architecture doc (stale, see
                                     "Docs cleanup" above)
```

Note: there is no `backend/` directory in this repo — the original
Node/Express backend referenced in the root `README.md` doesn't exist
here anymore (see "Docs cleanup" above).

## Reference: relevant memory notes

Loaded via `MEMORY.md`:
- User's .NET/Angular preference (prefers relational + EF Core)
- Dev config location rule (backend appsettings vs user-secrets;
  frontend environment.ts gitignored)
- Auth0 Angular v2.11 interceptor gotcha (must use
  `withInterceptors([authHttpInterceptorFn])`, not
  `withInterceptorsFromDi()`)
