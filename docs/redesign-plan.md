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

### Components of the external stack (inferred)
- **S3 bucket** — stores receipt image originals
- **Upload-URL Lambda** — POST endpoint; generates presigned URL,
  returns receipt_id
- **Download-URL Lambda** — GET endpoint; generates presigned GET URL
  for a given receipt_id
- **Textract trigger** — S3 event → Lambda that calls Textract
  ("AnalyzeExpense" or similar) on the uploaded object
- **DynamoDB writer** — receives Textract result and writes items +
  geometry into `dev-costco-receipt-parser-main`
- **API Gateway** — fronts the two URL Lambdas, does Auth0 JWT
  validation

### Why this is a problem for the new architecture
The .NET API's `GetUploadUrl` endpoint just forwards to this stack.
Uploads through the new stack still land in **DynamoDB, not MySQL**.
The MySQL data was seeded once by `CostcoReceipts.Migration` and only
grows via manual member/assignment edits through the new API — new
uploads are invisible to it.

Until this stack is moved (or bridged), the new backend is effectively
a read/write view over a stale snapshot for new receipts.

### Plan to bring it in-house

**Design decisions to make (whiteboard session before coding):**

1. **OCR engine** — three viable paths:
   - Keep **AWS Textract** — proven for receipts, requires Pi (or
     wherever the API runs) to have AWS credentials. Costs per page.
   - **Tesseract** on the Pi — free, fully local, but noticeably
     worse quality for receipt-style layouts. Would require
     significant post-processing to hit Textract-level accuracy.
   - **Third-party API** (Mindee, Veryfi, etc.) — designed for
     receipts specifically, subscription cost, another vendor.

2. **Storage for receipt images** — either:
   - Keep **AWS S3** — cheap, durable, presigned URLs are trivial via
     AWS SDK for .NET. Pi needs AWS creds.
   - Self-host on the Pi (MinIO, plain filesystem behind nginx). Ties
     image availability to the Pi's uptime and disk. Cheaper long-term
     but adds an operational surface.

3. **Processing model** — sync vs async:
   - **Synchronous**: the upload endpoint calls Textract inline and
     returns items in the response. Simplest, but Textract can take
     5–30 seconds — bad UX and holds a request thread.
   - **Async with polling**: upload returns a receipt_id, client polls
     `GET /receipts/{id}` until items appear. Works everywhere.
   - **Async with SSE / WebSocket**: server pushes when ready.
     Snazzier UX, more infrastructure.
   - **Background job queue**: the endpoint enqueues the OCR work,
     a background worker processes it. Requires a queue (in-process
     `Channel<T>` for a single-instance Pi is fine; something like
     RabbitMQ for multi-instance).

4. **Retry / re-processing** — should users be able to re-run OCR on
   an existing receipt if the parser improves? Adds complexity but
   removes a "one-shot" limitation.

**Suggested phased migration:**

1. **Phase 1 — Presigned URL endpoint in .NET.**
   Move just the URL-generation piece from the SAM Lambdas into the
   .NET API. `GetUploadUrl` and `GetDownloadUrl` stop being
   passthroughs and use `AWSSDK.S3` directly. The Pi needs AWS
   credentials (via IAM user or role) to sign requests, but no other
   AWS runtime is invoked from the Pi. Small, self-contained change.
   S3 stays as-is; Textract stays in AWS. Nothing about the parsing
   pipeline changes yet.

2. **Phase 2 — Bridge new uploads into MySQL.**
   The existing Textract → DynamoDB Lambda gets a sibling that also
   writes into MySQL (or replaces the DynamoDB writer entirely).
   Simplest bridge: the Lambda POSTs the parsed receipt payload to a
   new internal endpoint on the .NET API (`POST /api/internal/receipts`,
   authenticated by a shared secret since it's server-to-server). The
   .NET API writes to MySQL. Lambda ↔ Pi connectivity handled via
   Cloudflare Tunnel (already planned for the frontend).
   After this, the app is source-of-truth-correct: every new upload
   lands in MySQL.

3. **Phase 3 — Own the OCR pipeline (optional).**
   Move Textract invocation into the .NET API too, using a background
   queue for async processing. This kills the last dependency on the
   SAM stack. Can happen at any point after Phase 2, but Phase 2 is
   what unblocks Pi cutover.

4. **Phase 4 — Retire the SAM stack.**
   Once Phase 2 is running and Phase 3 either lands or is explicitly
   deferred, the DynamoDB writer Lambda can be removed. The rest of
   the SAM stack (if Textract stays in AWS) may still be there,
   invoked directly from .NET rather than from an API Gateway.

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

---

## Suggested next order of operations

1. ~~**Members management UI**~~ ✅ done — `receipt-members/`
2. ~~**Share management + public shared-receipt view**~~ ✅ done —
   `receipt-shares/` + `shared-receipt/`. Sharing now works end-to-end.
3. ~~**Per-member totals**~~ ✅ done — `member-totals/` (on both the
   shared view and the authenticated detail page)
4. ~~**Receipt validation**~~ ✅ done — automated subtotal-match badge (see Priority 1 table); no manual confirm/dispute step
5. **Upload pipeline design session** — commit to a plan from the
   Phase 1–4 above
6. **Pi setup** (physical) — can happen in parallel with any of the
   above
7. **Phase 1 of upload migration** — presigned URLs in .NET
8. **Phase 2 of upload migration** — bridge Lambda → MySQL
9. **Receipt upload UI** (unblocked by Phase 2)
10. **Retire React frontend** — once feature parity is reached

---

## Open questions (things a future session should ask before starting)

- Is the Pi hardware set up yet? (blocker for actual deployment; not a
  blocker for any code work)
- Which OCR engine for Phase 3? Cost, quality, and vendor tolerance
  trade off differently
- Is there a hard budget cap on AWS spend? (drives whether to keep
  Textract or move to a local/paid alternative)
- Is `SharedController`'s response shape still correct given the new
  contacts model? Worth a quick review before wiring the public view
- Does the Auth0 dashboard have "Allow Offline Access" turned on for
  the API? Needed for real refresh-token issuance (silent auth still
  works without it via iframe fallback, but is fragile long-term)

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
├── cdk-backend/                  ← old Lambda backend (dead code, kept for reference)
├── backend/                      ← original Node/Express backend (dead code)
└── CLAUDE.md                     ← detailed architecture doc
```

## Reference: relevant memory notes

Loaded via `MEMORY.md`:
- User's .NET/Angular preference (prefers relational + EF Core)
- Dev config location rule (backend appsettings vs user-secrets;
  frontend environment.ts gitignored)
- Auth0 Angular v2.11 interceptor gotcha (must use
  `withInterceptors([authHttpInterceptorFn])`, not
  `withInterceptorsFromDi()`)
