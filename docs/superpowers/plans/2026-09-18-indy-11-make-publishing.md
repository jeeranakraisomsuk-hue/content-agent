# INDY Make Publishing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Recommended model:** Use `gpt-5.6-sol` with `high` reasoning. This job controls external publication, idempotency, callbacks, retries, and partial-platform failure.

**Goal:** Deliver real per-platform Make queueing with Thai schedules, truthful status, retry, verified callbacks, and publication receipts.

**Architecture:** The browser submits an eligible platform attempt to a server route. The server writes a durable event, calls the configured Make webhook with an idempotency key, and accepts HMAC-authenticated callbacks into a Google Sheets publication-event store. The dashboard reconciles events without rewriting successful sibling platforms.

**Tech Stack:** Make webhook API, Google Sheets API, Next.js route handlers, React, TypeScript, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-18-indy-full-feature-parity-design.md`

## Global Constraints

- Requires Jobs 01, 03, 05, and 10.
- Server environment keys are `MAKE_PUBLISH_WEBHOOK_URL`, `MAKE_CALLBACK_SECRET`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, and `GOOGLE_SHEET_ID`.
- Each platform has an independent attempt and terminal state.
- A local schedule is not a queued publication until Make returns an accepted receipt.
- A published state requires a receipt URL or provider publication ID.

---

### Task 1: Implement eligibility, attempts, and reconciliation

**Files:**
- Create: `apps/indy-content-studio/features/publishing/publication-model.ts`
- Create: `apps/indy-content-studio/features/publishing/publication-commands.ts`
- Test: `apps/indy-content-studio/tests/publication-model.test.ts`

**Interfaces:**
- Produces: `getPublicationEligibility`, `createPublicationAttempt`, `applyPublicationEvent`, `retryPublicationAttempt`, and `buildPublicationIdempotencyKey`.

- [ ] **Step 1: Write failing eligibility tests**

```ts
expect(getPublicationEligibility(eligibleFacebook, now)).toEqual({ eligible: true, reasons: [] });
expect(getPublicationEligibility(withoutApproval, now).reasons).toContain("ยังไม่ได้รับอนุมัติ");
expect(getPublicationEligibility(withLocalOnlyMedia, now).reasons).toContain("สื่อยังไม่พร้อมให้ระบบเผยแพร่เข้าถึง");
expect(getPublicationEligibility(withPastSchedule, now).reasons).toContain("เวลาที่ตั้งไว้ผ่านไปแล้ว");
```

- [ ] **Step 2: Write failing state-machine tests**

Cover `local-plan -> submitting -> queued -> publishing -> published`, rejection, retry, duplicate callback, out-of-order callback, one failed platform beside two successful platforms, and receipt validation.

- [ ] **Step 3: Run tests and verify failure**

Run: `pnpm test -- tests/publication-model.test.ts`

Expected: FAIL.

- [ ] **Step 4: Implement immutable platform-scoped transitions**

The idempotency key is SHA-256 of `contentId|platform|publishAt|caption|orderedRemoteAssetUrls`. A retry creates a new attempt ID but retains the same idempotency key unless schedule, caption, or media changed.

- [ ] **Step 5: Run the model test**

Run: `pnpm test -- tests/publication-model.test.ts`

Expected: PASS.

### Task 2: Implement Make submission, callback, and event listing routes

**Files:**
- Create: `apps/indy-content-studio/features/publishing/server/make-publishing-client.ts`
- Create: `apps/indy-content-studio/features/publishing/server/publication-event-store.ts`
- Create: `apps/indy-content-studio/features/publishing/server/google-sheets-publication-event-store.ts`
- Create: `apps/indy-content-studio/features/publishing/server/make-callback-signature.ts`
- Create: `apps/indy-content-studio/app/api/make/publish/route.ts`
- Create: `apps/indy-content-studio/app/api/make/callback/route.ts`
- Create: `apps/indy-content-studio/app/api/make/events/route.ts`
- Test: `apps/indy-content-studio/tests/make-publishing-routes.test.ts`

**Interfaces:**
- Produces:
  - `POST /api/make/publish` with one platform attempt.
  - HMAC-verified `POST /api/make/callback`.
  - `GET /api/make/events?after=<ISO timestamp>`.

- [ ] **Step 1: Write route tests before implementation**

Cover disconnected `503`, invalid payload `400`, non-HTTPS media `400`, accepted Make response `202`, Make rejection `502`, callback missing/invalid HMAC `401`, duplicate callback idempotency, out-of-order events, and sanitized event listing.

- [ ] **Step 2: Run the route test and verify failure**

Run: `pnpm test -- tests/make-publishing-routes.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement the Make payload contract**

```ts
export interface MakePublishPayload {
  payloadVersion: 1;
  attemptId: string;
  idempotencyKey: string;
  contentId: string;
  title: string;
  platform: Platform;
  publishAt: string;
  timezone: "Asia/Bangkok";
  caption: string;
  media: Array<{ order: number; kind: "image" | "video"; url: string; previewUrl: string }>;
  callbackUrl: string;
}
```

The browser sends media references. Resolve uploaded references into 30-minute signed Job 03 provider URLs and reject unsafe external URLs before building this server-to-Make payload. Send one request per platform. The Make scenario contract requires it to ingest media before returning `{ accepted: true, queueId }`; after acceptance, later publishing must not depend on the temporary URL. Store the accepted event before responding to the browser.

- [ ] **Step 4: Implement signed callbacks and durable events**

Verify `x-indy-signature` as HMAC-SHA256 of raw body with `MAKE_CALLBACK_SECRET`. Store sheet `Publication_Events` columns `eventId`, `attemptId`, `idempotencyKey`, `contentId`, `platform`, `status`, `occurredAt`, `queueId`, `providerPublicationId`, `receiptUrl`, `errorCode`, and `payloadVersion`.

- [ ] **Step 5: Implement safe event listing**

Return event fields needed by reconciliation. Omit secrets, raw Make request bodies, authentication headers, and provider debug payloads. Map provider errors to stable user-facing codes.

- [ ] **Step 6: Run all route tests**

Run: `pnpm test -- tests/make-publishing-routes.test.ts`

Expected: PASS.

### Task 3: Build the Make Publishing workspace

**Files:**
- Create: `apps/indy-content-studio/features/publishing/components/MakePublishingWorkspace.tsx`
- Create: `apps/indy-content-studio/features/publishing/components/PublicationReadinessDialog.tsx`
- Create: `apps/indy-content-studio/features/publishing/components/PublicationStatusCell.tsx`
- Test: `apps/indy-content-studio/tests/make-publishing-workspace.test.tsx`
- Modify: `apps/indy-content-studio/features/content/components/PlatformScheduleSection.tsx`
- Modify: `apps/indy-content-studio/app/page.tsx`
- Modify: `apps/indy-content-studio/app/globals.css`

**Interfaces:**
- Consumes: Tasks 1-2, repository provider, content editor.
- Produces: working `make-delivery` workspace.

- [ ] **Step 1: Write UI tests for disconnected, readiness, queue confirmation, accepted, partial failure, retry, callback refresh, manual evidence, and row opening**

```tsx
await user.click(screen.getByRole("button", { name: "ตรวจความพร้อม 3 ช่องทาง" }));
expect(screen.getByText("Facebook พร้อมส่ง")).toBeVisible();
expect(screen.getByText("Instagram ขาดวันเวลา")).toBeVisible();
```

- [ ] **Step 2: Run the UI test and verify failure**

Run: `pnpm test -- tests/make-publishing-workspace.test.tsx`

Expected: FAIL.

- [ ] **Step 3: Implement filters and the publication table**

Provide month/category/format/owner filters. Table columns: content, platform, Thai schedule, readiness, queue status, evidence, and action. Statuses include local plan, submitting, queued, publishing, published, failed, and disconnected.

- [ ] **Step 4: Implement confirmation and platform-isolated queueing**

The readiness dialog lists media, caption, approval, and each enabled platform schedule. `ส่งทั้ง 3 ช่องทาง` submits eligible platforms independently; a failed response must not roll back accepted platforms. Persist provider receipts only from server responses.

- [ ] **Step 5: Implement refresh, retry, and manual evidence**

Refresh retrieves verified events after the last cursor and reconciles idempotently. Retry targets only the failed platform. Manual evidence requires HTTPS receipt URL plus a note and is visibly labeled `ยืนยันด้วยตนเอง`, never as a provider-verified receipt.

- [ ] **Step 6: Replace the placeholder, verify, and commit**

Run: `pnpm test && pnpm typecheck && pnpm build`

Expected: all commands exit 0.

```bash
git add apps/indy-content-studio/features/publishing apps/indy-content-studio/features/content apps/indy-content-studio/app apps/indy-content-studio/tests
git commit -m "feat: add Make publication queue and receipts"
```

### Human acceptance

1. With Make disconnected, save schedules and confirm they remain labeled local plans.
2. Connect a test scenario and queue a three-platform video.
3. Simulate two successes and one failure; verify the successful receipts remain intact.
4. Retry only the failed platform and verify a duplicate callback does not duplicate history.
5. Open each receipt and confirm the content reaches `เผยแพร่แล้ว` only when every enabled platform has evidence.
