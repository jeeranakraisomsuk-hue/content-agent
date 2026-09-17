# Dashboard to LINE OA Single-Recipient Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send one uploaded dashboard asset and its caption to คุณพลิก through a private LINE OA chat after an explicit button click.

**Architecture:** Pair one recipient through a verified LINE webhook and a one-time code, then use a server-only push client to deliver an immutable asset-and-caption snapshot. Images and MP4 videos use native LINE messages; other allowed files use an opaque short-lived download link. Database uniqueness and LINE retry keys make clicks and retries idempotent.

**Tech Stack:** TypeScript, Next.js App Router, Supabase/PostgreSQL, private object storage or Google Drive, LINE Messaging API, Zod, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-17-dashboard-to-line-oa-single-recipient-design.md`

## Global Constraints

- Manual send only; upload never triggers LINE automatically.
- Require both an authoritative stored asset and a non-empty caption.
- Push to one paired LINE user ID; never use broadcast.
- Keep LINE secrets, raw user IDs, signed URLs, and storage credentials server-only.
- Image: JPEG/PNG, at most 10 MB. Video: MP4, at most 200 MB, with JPEG/PNG preview at most 1 MB.
- Other allowed file types are delivered as expiring download links.
- Every snapshot and retry is idempotent.
- Approval/rejection and Make publishing are outside this milestone.

---

### Task 1: Add connection and delivery persistence

**Files:**
- Create: `supabase/migrations/<timestamp>_line_single_recipient_delivery.sql`
- Create: `apps/dashboard/features/line-oa/server/line-repository.ts`
- Create: `apps/dashboard/features/line-oa/server/line-types.ts`
- Test: `apps/dashboard/tests/line-oa/line-repository.test.ts`

**Interfaces:**
- Produces: `LineConnectionStatus`, `LineDeliveryStatus`, `createPairingChallenge()`, `claimPairingChallenge()`, `createDeliverySnapshot()`, `markDeliverySent()`, and `markDeliveryFailed()`.
- Consumes: the existing authenticated user ID, content ID, content revision, stored asset metadata, and database client.

- [ ] **Step 1: Write failing repository tests**

  Cover one active `primary` connection, hashed code storage, 10-minute expiry, single-use claim, unique delivery idempotency key, and no persisted signed URLs or raw provider bodies.

- [ ] **Step 2: Run the focused tests and confirm failure**

  Run: `pnpm --dir apps/dashboard vitest run tests/line-oa/line-repository.test.ts`

  Expected: FAIL because the schema and repository do not exist.

- [ ] **Step 3: Add the migration and contracts**

  Define focused interfaces:

  ```ts
  type LineConnectionStatus = "not_connected" | "pairing" | "connected" | "disabled";
  type LineDeliveryStatus = "queued" | "sent" | "failed";

  interface DeliverySnapshotInput {
    contentId: string;
    contentRevision: number;
    assetId: string;
    assetType: string;
    assetSize: number;
    caption: string;
  }
  ```

  Add database uniqueness for the `primary` connection and `idempotency_key`.

- [ ] **Step 4: Implement the minimal repository**

  Hash pairing codes with the existing server crypto utility, encrypt the LINE user ID with the deployment key, and expose only a masked recipient description to callers.

- [ ] **Step 5: Re-run tests and commit**

  Run the focused test, then the existing database tests.

  Commit: `feat: add LINE connection and delivery persistence`

### Task 2: Pair คุณพลิก through a verified LINE webhook

**Files:**
- Create: `apps/dashboard/features/line-oa/server/line-signature.ts`
- Create: `apps/dashboard/features/line-oa/server/line-pairing-service.ts`
- Create: `apps/dashboard/app/api/integrations/line/pair/route.ts`
- Create: `apps/dashboard/app/api/integrations/line/webhook/route.ts`
- Test: `apps/dashboard/tests/line-oa/line-pairing.test.ts`

**Interfaces:**
- Consumes: `LINE_CHANNEL_SECRET`, authenticated admin session, raw webhook body, signature header, and Task 1 repository.
- Produces: `verifyLineSignature(rawBody, signature): boolean` and `handlePairingEvent(event): Promise<PairingResult>`.

- [ ] **Step 1: Write failing pairing tests**

  Test valid pairing, bad signature, expired code, reused code, missing `source.userId`, two concurrent claims, and attempted replacement while connected.

- [ ] **Step 2: Verify the tests fail**

  Run: `pnpm --dir apps/dashboard vitest run tests/line-oa/line-pairing.test.ts`

- [ ] **Step 3: Implement raw-body signature verification**

  Calculate HMAC-SHA-256 over the exact raw bytes using `LINE_CHANNEL_SECRET`, Base64-encode it, and compare equal-length buffers with a timing-safe comparison before parsing JSON.

- [ ] **Step 4: Implement pairing endpoints**

  The authenticated pair endpoint returns a display command such as `เชื่อมต่อ 483921`, never the code hash. The webhook accepts only a signed text event matching `เชื่อมต่อ <six digits>` and atomically claims the code.

- [ ] **Step 5: Add safe reset behavior**

  Require an authenticated dashboard action to disable the current recipient before a new pairing challenge can be created.

- [ ] **Step 6: Re-run tests and commit**

  Commit: `feat: pair one LINE OA recipient securely`

### Task 3: Serve private assets through scoped delivery URLs

**Files:**
- Create: `apps/dashboard/features/line-oa/server/line-asset-token.ts`
- Create: `apps/dashboard/features/line-oa/server/line-asset-service.ts`
- Create: `apps/dashboard/app/api/integrations/line/assets/[assetId]/route.ts`
- Test: `apps/dashboard/tests/line-oa/line-assets.test.ts`

**Interfaces:**
- Consumes: authoritative storage metadata and a server signing key.
- Produces: `createLineAssetUrl(assetId, purpose, expiresAt)`, `verifyLineAssetToken()`, and `streamLineAsset()`.

- [ ] **Step 1: Write failing delivery URL tests**

  Cover one-file scope, tamper rejection, expiry, unsupported MIME type, byte-range video requests, correct content type, and absence of storage-folder details in the URL.

- [ ] **Step 2: Verify the tests fail**

  Run: `pnpm --dir apps/dashboard vitest run tests/line-oa/line-assets.test.ts`

- [ ] **Step 3: Implement opaque signed tokens**

  Token claims contain only an internal asset ID, purpose (`original | preview | download`), and expiry. The route reloads the asset record before streaming and never accepts a browser-supplied storage URL.

- [ ] **Step 4: Implement media validation and streaming**

  Support JPEG/PNG images, MP4 video plus JPEG/PNG preview, and an explicit allowlist of downloadable document types. Reject HTML and executable content. Preserve range responses for MP4 playback.

- [ ] **Step 5: Re-run tests and commit**

  Commit: `feat: add secure LINE asset delivery`

### Task 4: Build the one-to-one LINE push client

**Files:**
- Create: `apps/dashboard/features/line-oa/server/line-message-builder.ts`
- Create: `apps/dashboard/features/line-oa/server/line-push-client.ts`
- Test: `apps/dashboard/tests/line-oa/line-push-client.test.ts`

**Interfaces:**
- Consumes: paired encrypted user ID, `LINE_CHANNEL_ACCESS_TOKEN`, Task 3 URLs, immutable delivery snapshot, and idempotency key.
- Produces: `buildLineMessages(snapshot, urls): LineMessage[]` and `pushLineDelivery(input): Promise<LinePushResult>`.

- [ ] **Step 1: Write failing message-shape tests**

  Assert image plus caption, video plus preview plus caption, document download action plus caption, message count at most five, and correct rejection of oversized or unsafe media.

- [ ] **Step 2: Write failing provider tests**

  Assert one-to-one `/v2/bot/message/push`, bearer authentication, `X-Line-Retry-Key`, timeout handling, sanitized error mapping, and no token/body logging.

- [ ] **Step 3: Verify the tests fail**

  Run: `pnpm --dir apps/dashboard vitest run tests/line-oa/line-push-client.test.ts`

- [ ] **Step 4: Implement the message builder**

  ```ts
  type LineMessage =
    | { type: "text"; text: string }
    | { type: "image"; originalContentUrl: string; previewImageUrl: string }
    | { type: "video"; originalContentUrl: string; previewImageUrl: string }
    | { type: "flex"; altText: string; contents: unknown };
  ```

  Documents use a Flex button or text link pointing at the scoped download URL.

- [ ] **Step 5: Implement the push client**

  Use a bounded timeout. Map 401/403 to configuration, 429 to quota, 5xx/timeout to retryable, and blocked/invalid recipient responses to unhealthy connection.

- [ ] **Step 6: Re-run tests and commit**

  Commit: `feat: send dashboard assets through LINE OA`

### Task 5: Gate and orchestrate dashboard sends

**Files:**
- Create: `apps/dashboard/features/line-oa/server/send-to-line-service.ts`
- Create: `apps/dashboard/app/api/content/[contentId]/send-to-line/route.ts`
- Test: `apps/dashboard/tests/line-oa/send-to-line.test.ts`

**Interfaces:**
- Consumes: authenticated session, authoritative content and asset repositories, Tasks 1, 3, and 4.
- Produces: `sendContentToLine({ contentId, expectedRevision, actorId }): Promise<DeliveryView>`.

- [ ] **Step 1: Write failing orchestration tests**

  Test missing asset, blank caption, stale revision, disconnected recipient, unsupported file, successful send, provider failure, duplicate click, and concurrent duplicate requests.

- [ ] **Step 2: Verify the tests fail**

  Run: `pnpm --dir apps/dashboard vitest run tests/line-oa/send-to-line.test.ts`

- [ ] **Step 3: Implement server-authoritative validation**

  Accept only the content ID and expected revision from the browser. Reload the caption, asset, MIME type, size, preview, and connection on the server.

- [ ] **Step 4: Implement immutable snapshot and idempotent send**

  Derive the stable key from the content ID, revision, asset ID, and caption digest. Insert or reuse one queued delivery, then call the push client with the same LINE retry key.

- [ ] **Step 5: Record terminal state**

  Record `sent` only after LINE returns success. Record sanitized failures and whether retry is allowed; never create a new snapshot for a retry of unchanged content.

- [ ] **Step 6: Re-run tests and commit**

  Commit: `feat: orchestrate idempotent LINE delivery`

### Task 6: Connect the existing dashboard button and settings UI

**Files:**
- Create: `apps/dashboard/features/line-oa/components/LineConnectionCard.tsx`
- Create: `apps/dashboard/features/line-oa/components/SendToLineButton.tsx`
- Modify: the existing content editor that owns the current **ส่งเข้า LINE OA** button
- Modify: the existing authenticated integration/settings page
- Test: `apps/dashboard/tests/line-oa/line-dashboard-ui.test.tsx`

**Interfaces:**
- Consumes: connection-status endpoint and Task 5 send endpoint.
- Produces: accessible pairing, disabled-state, sending, sent, failed, and retry UI.

- [ ] **Step 1: Write failing component tests**

  Verify the button is disabled for missing asset, blank caption, in-progress upload, stale content, disconnected OA, and active send. Verify it is enabled only for a complete current revision.

- [ ] **Step 2: Verify the tests fail**

  Run: `pnpm --dir apps/dashboard vitest run tests/line-oa/line-dashboard-ui.test.tsx`

- [ ] **Step 3: Implement connection settings**

  Show `ยังไม่เชื่อมต่อ`, `รอจับคู่`, `เชื่อมต่อแล้ว: คุณพลิก`, or `ต้องเชื่อมต่อใหม่`. Display the pairing command only while it is valid.

- [ ] **Step 4: Wire the existing send button**

  Submit the current content ID and revision, lock double clicks, then show delivery status and timestamp. Never mark a failed request as sent.

- [ ] **Step 5: Add retry behavior**

  Retry an unchanged failed snapshot through the same delivery ID; require a new snapshot when media or caption changes.

- [ ] **Step 6: Re-run tests and commit**

  Commit: `feat: connect dashboard LINE OA controls`

### Task 7: End-to-end verification and operations guide

**Files:**
- Create: `apps/dashboard/tests/e2e/line-oa-delivery.spec.ts`
- Create: `docs/line-oa-single-recipient-operations.md`
- Modify: `apps/dashboard/.env.example`

**Interfaces:**
- Consumes: the completed connection, media, push, API, and UI flows.
- Produces: repeatable deployment and recovery instructions.

- [ ] **Step 1: Add E2E tests**

  Cover pairing, disabled button, image send, MP4 send, document-link send, duplicate click, expired asset URL, provider retry, and recipient reset. Mock only the external LINE HTTP boundary; use real application routes and persistence.

- [ ] **Step 2: Document deployment configuration**

  List secret names only: `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`, public application origin, storage configuration, and signing/encryption keys. Include LINE Developers webhook setup, webhook verification, pairing, rotation, quota failure, blocked OA, and re-pairing procedures.

- [ ] **Step 3: Run the full automated gate**

  Run focused Vitest suites, database tests, typecheck, production build, and the LINE OA Playwright suite. All must pass without printing secrets.

- [ ] **Step 4: Run one controlled live test**

  After explicit confirmation, send one non-sensitive image or short MP4 and caption to the real OA. Confirm exactly one message appears in คุณพลิก's chat and that the dashboard records one sent delivery.

- [ ] **Step 5: Commit**

  Commit: `test: verify LINE OA single-recipient delivery`

## Plan self-review

- Manual gating and existing button: Tasks 5–6.
- One paired recipient, not broadcast: Tasks 1–2 and 4.
- Native image/video plus secure document links: Tasks 3–4.
- Idempotent clicks and retries: Tasks 1, 4, and 5.
- Secret isolation, signature verification, and safe logs: Tasks 2–5.
- Automated and controlled live verification: Task 7.
- Approval/rejection and Make are intentionally excluded so this plan yields one independently testable dashboard-to-LINE delivery milestone.
