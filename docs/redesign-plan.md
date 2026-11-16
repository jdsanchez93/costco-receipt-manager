# Roadmap and open design questions

What is left to build, and the decisions already made about how. This is a
forward-looking document: it deliberately does **not** restate the current
architecture (`CLAUDE.md`), how the October 2026 migration off Lambda and
DynamoDB was carried out (`cdk-backend/RUNBOOK.md`), or the bucket
configuration that lives outside CDK (`cdk-backend/BUCKETS.md`). Earlier
revisions of this file carried all of that; `git log` has them.

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

## Contacts and claiming — decided 2026-11-12, not started

The goal: adding members to a receipt starts from the owner's contacts,
with "new person" as the fallback, and a share link is how someone becomes
a real user on a receipt.

Already true:
- A membership references a contact in the receipt owner's address book,
  and access comes from that contact's `UserId`. Assignments hang off
  `receipt_members.Id`, not the contact, so pointing a membership at a
  different contact keeps its items.
- An account has one name, on its `users` row, shown everywhere
  (`MemberNames`). A contact's own name shows only for a placeholder.
- The share view sends only each member's id and name. A signed-in member
  who opens a share link is sent to the receipt, even from an expired or
  deactivated link, and `?preview` shows them the public view instead.

### Decisions

- **Accounts become contacts only through a mutual act.** No lookup by
  email, no friend requests. An owner adds a placeholder and shares the
  receipt; the other person signs in through the link and claims the
  placeholder. That creates contacts in both directions — between the
  claimer and the receipt owner only, not with the receipt's other members.
  From then on the owner picks them directly.
- **Every active share link can be claimed through.** Links stay viewable
  signed out — someone can see what they owe and be done — and claiming is
  the invitation to do more. No per-link flag.
- **A claim covers one receipt.** It repoints that receipt's membership at
  the owner's contact for the claimer (found or created) and leaves the
  placeholder on the owner's other receipts; otherwise one forwarded link
  would hand over every receipt the placeholder is on. The owner is then
  asked whether it's the same person elsewhere. The prompt offers the
  placeholder's other receipts — "Jane claimed 'John' on Nov 3. Is Jane
  the John on your 4 other receipts?" — and, as separate suggestions, any
  other placeholders with the same name. Each is confirmed on its own, and
  confirming merges that placeholder into Jane's contact. A placeholder
  left on no receipts is removed.
- **A claim never makes anyone an owner.** The membership keeps its role,
  except that a placeholder the owner had made an owner is claimed as an
  editor: a forwarded link shouldn't hand over control of the receipt. The
  owner can promote them afterwards.
- **Claims are visible and reversible.** The member row reads "Jane Doe ·
  joined as John", and the owner can unlink. That puts the membership back
  on the placeholder it was claimed from, or on a new one with the same
  name if that's gone, and the assignments come along. Each claim is
  recorded — member, claimer, placeholder and its name, link, time — in a
  new `receipt_member_claims` table, which also says what a leaked link
  was used for.
- **Link holders can claim but not add themselves.** "Don't see your name?
  Ask Jordan to add you." The owner keeps the roster, and so the totals.
- **Prevent duplicates where people are added; keep merging as the
  backstop.** The merge in `PlaceholderContactMerger` moves into an API
  service shared by the contacts page, the claim prompt and the CLI. A
  merge needs the source to be a placeholder, both contacts to have the
  same owner, and the two never to be on the same receipt (they would
  collapse into one membership). The target may be a placeholder or an
  account; two accounts never merge. The CLI keeps its extra rule against
  conflicting emails, because it merges by name without asking anyone; an
  owner choosing a merge has already decided.
- **Only the uploader gets the contact picker.** A receipt's contacts live
  in the book of `Receipt.OwnerUserId`. A promoted co-owner's contacts are
  in another, and copying a real user across would link two people who
  never agreed to it. Co-owners keep adding by name.

### Phases, one PR each

1. **Contacts API and people picker.** No schema change: recency and
   frequency come from a contact's `receipt_members` rows.
   - `GET /api/contacts?q=` returning `{ contactId, displayName,
     hasAccount, receiptCount, lastUsedAt }` — not the caller's
     self-contact, and no Auth0 subs.
   - `POST /members` takes `{ contactId }` or `{ displayName }`. A
     `contactId` must belong to the receipt owner: contact ids are
     sequential, and without the check any owner could attach strangers'
     accounts to their receipts.
   - The add form becomes one people field (Material chip grid +
     autocomplete, like Gmail's recipients):
     - Before typing: recent people as one-tap chips, and "Same people as
       last receipt", which copies the members of the owner's previous
       receipt.
     - Typing filters contacts, ranked by exact name, then recency and
       frequency. Each row shows initials, the name, a "Has an account"
       badge, and "last on Nov 3".
     - "Add 'Joh…' as a new person" is always last — "Add another 'John
       Doe'" when that name already exists.
     - Each pick adds at once, with an Undo snackbar.
     - Email and role leave the form. Role defaults to editor and the role
       menu changes it; nothing reads the email.
   - "Placeholder" becomes "Hasn't joined" on member rows.
2. **Contacts page and the merge service.**
   - `/app/contacts`, in the side nav, with a count badge while anything
     needs review.
   - "Needs review" on top: claim prompts, and likely duplicates —
     placeholders with the same name, by the merger's grouping rule.
   - Then a searchable list by recent use, each with "N receipts
     together". The self-contact is hidden.
   - A contact's page lists the receipts you're both on, and offers rename
     (placeholders only; an account's name is theirs), merge into…, and
     delete. Delete works only on a contact on no receipts — the FK is
     Restrict anyway — and otherwise offers the merge.
   - `PATCH /api/contacts/{id}` to rename, `DELETE /api/contacts/{id}`
     (409 while in use), and `POST /api/contacts/{id}/merge
     { intoContactId }` under the merge rules above.
3. **Claiming.**
   - `receipt_member_claims`, additive.
   - `POST /api/receipts/shared/{token}/claim { memberId }`, authenticated,
     with its own entry ahead of the anonymous wildcard in `app.config.ts`.
     It checks the link is active, the caller isn't already a member and
     the member is still a placeholder; caps the role at editor; finds or
     creates the contacts both ways, race-safe on the unique index as
     `UserProvisioningMiddleware` is; repoints with `WHERE Id = @member AND
     ContactId = @placeholder` so two concurrent claims can't both win; and
     records the claim.
   - `POST /members/{id}/unlink` (owner), and the review prompt.
   - The shared response gains whether each member has joined, and which
     member is the owner, for the copy below.
   - Shared page:
     - "Which one are you?" for everyone, signed out included. It lists
       the members who haven't joined, each with their item count and
       total so people recognize themselves. Picking one highlights their
       items and share, remembered per link in local storage. This part
       doesn't need the claim endpoint and can ship ahead of it.
     - "Save this to your receipts" replaces the "Get started" card. It
       signs in, or opens sign-up (`screen_hint: 'signup'`) for a new
       visitor, and comes back with `?claim=<memberId>`.
     - One confirmation — "Join as John? You'll be able to edit this
       receipt, and you and Jordan will be added to each other's
       contacts." — then the claim, then `/app/receipts/{id}`, replacing
       the history entry.
     - A 409 because someone else just claimed refreshes the list and says
       so.
   - The share-links panel's hint says what a link now does: anyone can
     view without signing in, and people on the receipt can sign in to
     claim their spot.
   - `receipt_shares.CurrentUses` has never been incremented. With claims
     recorded per link it's redundant: show each link's claim count from
     the claims table, or stop sending it.
   - A .NET test project lands with this phase — WebApplicationFactory and
     Testcontainers on MariaDB 11.8 — covering concurrent claims, an
     existing member, an expired link, an owner-role placeholder claimed
     as an editor, unlink keeping assignments, a contact id from another
     owner's book, and merging two contacts on one receipt.

### Later

- Who uploaded each receipt, in the list. `Receipt {guid}` (above) gets
  worse once people see receipts they didn't upload.
- A contact picker for co-owners.
- Removing or blocking a real-user contact.
- Per-person totals across receipts. Needs a "settled" state first, or the
  number only grows.

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

**Widened 2026-10-22 with `s3:DeleteObject`**, so deleting a receipt
also deletes its image. On a versioned bucket that only writes a delete
marker; `s3:DeleteObjectVersion` is deliberately withheld, so a leaked
key still cannot destroy history before the 90-day noncurrent-version
expiry.

---

## Open questions

- Should placeholders keep an email at all? Nothing reads it, and matching
  on it is ruled out above. The contacts page could keep it as a note, or
  it could go. A self-contact's email still matters:
  `UserProvisioningMiddleware` retries /userinfo while it's missing.
- Does the Auth0 dashboard have "Allow Offline Access" enabled for the API?
  Needed for real refresh-token issuance. Silent auth still works without it
  via the iframe fallback, but that is fragile long-term.
- Should `cdk deploy` move into CI? The original blocker is gone — it was the
  retired .NET Lambda's non-reproducible asset hash, and the OCR Lambda's
  dependencies are now pinned. What remains is a preference: a bad processing
  deploy breaks the OCR trigger silently, and you would only find out on the
  next upload.
