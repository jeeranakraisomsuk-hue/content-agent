# INDY LINE Review and Corrections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Recommended model:** Use `gpt-5.6-sol` with `high` reasoning. This job crosses authentication, external delivery, durable webhook state, and approval invariants.

**Goal:** Complete the real LINE OA review loop: eligible send, provider receipt, signed webhook processing, approval or correction events, refresh, resolution, and resubmission.

**Architecture:** Reuse the existing signature, message-builder, pairing, and push-client modules. Add a durable Google Sheets review-event store so webhook events can be consumed by the browser across devices; local state changes only after verified server responses.

**Tech Stack:** LINE Messaging API, Google Sheets API, Next.js route handlers, React, TypeScript, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-18-indy-full-feature-parity-design.md`

**Provider Reference:** [LINE Messaging API — sending messages](https://developers.line.biz/en/docs/messaging-api/sending-messages/)

## Global Constraints

- Requires Jobs 01, 03, 05, and 09.
- Server environment keys are `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_RECIPIENT_USER_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, and `GOOGLE_SHEET_ID`.
- Secrets never enter client state, responses, logs, exports, or test snapshots.
- Sending requires at least one Drive-ready uploaded asset or safe HTTPS external asset and a non-empty caption.
- Caption or media changes after approval create an approval-reset history event.

---

### Task 1: Define review cycles, commands, and webhook event parsing

**Files:**
- Create: `apps/indy-content-studio/features/line-oa/review-model.ts`
- Create: `apps/indy-content-studio/features/line-oa/server/line-review-event.ts`
- Test: `apps/indy-content-studio/tests/line-review-model.test.ts`
- Test: `apps/indy-content-studio/tests/line-review-event.test.ts`

**Interfaces:**
- Produces: `beginReviewCycle`, `applyLineReviewEvent`, `resolveCorrection`, `buildReviewCode`, and `parseLineReviewEvent`.

- [ ] **Step 1: Write failing model tests**

```ts
expect(beginReviewCycle(eligibleContent, fixtureClock).lineReview.status).toBe("queued");
expect(applyLineReviewEvent(sentContent, approvedEvent).lineReview.status).toBe("approved");
expect(applyLineReviewEvent(sentContent, correctionEvent).productionStatus).toBe("needs-changes");
expect(resolveCorrection(state, correctionId, fixtureClock).corrections[0].status).toBe("resolved");
```

- [ ] **Step 2: Write failing parser tests**

Support signed webhook message text in these exact user-facing forms:

```text
อนุมัติ R-AB12CD
แก้ไข R-AB12CD: เพิ่มราคาและวันสมัคร
```

Ignore other messages, group sources, unknown codes, and duplicate LINE event IDs.

- [ ] **Step 3: Run tests and verify failure**

Run: `pnpm test -- tests/line-review-model.test.ts tests/line-review-event.test.ts`

Expected: FAIL.

- [ ] **Step 4: Implement deterministic cycle and parser logic**

`buildReviewCode` returns `R-` plus six uppercase alphanumeric characters derived from the cycle ID; it is a lookup code, not a secret. Events include `lineEventId`, `contentId`, `cycleId`, `type`, `comment`, `receivedAt`, and `reviewerUserIdHash`.

- [ ] **Step 5: Run the model tests**

Run: `pnpm test -- tests/line-review-model.test.ts tests/line-review-event.test.ts`

Expected: PASS.

### Task 2: Add a durable review-event store and complete server routes

**Files:**
- Create: `apps/indy-content-studio/features/line-oa/server/review-event-store.ts`
- Create: `apps/indy-content-studio/features/line-oa/server/google-sheets-review-event-store.ts`
- Create: `apps/indy-content-studio/features/line-oa/server/line-message-batches.ts`
- Create: `apps/indy-content-studio/app/api/line/send-review/route.ts`
- Create: `apps/indy-content-studio/app/api/line/reviews/route.ts`
- Modify: `apps/indy-content-studio/app/api/line/webhook/route.ts`
- Modify: `apps/indy-content-studio/features/line-oa/server/line-message-builder.ts`
- Modify: `apps/indy-content-studio/package.json`
- Modify: `apps/indy-content-studio/pnpm-lock.yaml`
- Test: `apps/indy-content-studio/tests/line-review-routes.test.ts`

**Interfaces:**
- Produces:
  - `POST /api/line/send-review` with `{ contentId, cycleId, reviewCode, caption, mediaRefs }`.
  - `GET /api/line/reviews?after=<ISO timestamp>` returning verified events.
  - Completed signed `POST /api/line/webhook` that appends idempotently.

- [ ] **Step 1: Verify the pinned server-auth dependency from Job 03**

Run: `pnpm why google-auth-library`

Expected: version `10.3.0` is installed. If the version differs, stop and reconcile Job 03 before changing LINE code.

- [ ] **Step 2: Write route tests before implementation**

Cover missing configuration `503`, invalid payload `400`, LINE authorization rejection `502`, provider success `200` with receipts, six media items split into valid batches, later-batch partial failure and retry, invalid webhook signature `401`, duplicate webhook event `200` without duplicate store row, and sanitized list results.

- [ ] **Step 3: Run the route test and verify failure**

Run: `pnpm test -- tests/line-review-routes.test.ts`

Expected: FAIL.

- [ ] **Step 4: Implement the store using sheet `LINE_Reviews` columns A:J**

Columns are `eventId`, `contentId`, `cycleId`, `reviewCode`, `type`, `comment`, `receivedAt`, `reviewerUserIdHash`, `providerReceipt`, and `payloadVersion`. Authenticate server-side with a service account. Hash reviewer IDs with SHA-256 before storage.

- [ ] **Step 5: Complete the send route and messages**

Accept media references, not client-generated Drive URLs. For uploaded assets, create one-hour signed original and preview URLs with the Job 03 signer; for external assets, require a preview URL for video and reject localhost, private-network hosts, credentials, non-HTTPS URLs, and redirects to unsafe hosts. Build ordered batches of at most five message objects, the current LINE limit. The first batch includes the text object containing title, review code, caption, and concise Thai reply instructions; remaining objects preserve media order across batches. Derive a stable UUID retry key per `cycleId + batchIndex`, capture each `x-line-request-id`, and return `{ status: "sent", providerReceipts, sentAt }` only after every batch is accepted. If a later batch fails, return a partial failure containing accepted receipts so retry resends only unaccepted batches.

- [ ] **Step 6: Complete webhook and list routes**

Verify signature against the raw body before JSON parsing. Resolve review code to the active cycle, append idempotently, and return `200` even for irrelevant signed events. The list route returns no raw user ID or secret configuration.

- [ ] **Step 7: Run server tests**

Run: `pnpm test -- tests/line-review-routes.test.ts tests/line-webhook-route.test.ts tests/line-push-client.test.ts tests/line-message-builder.test.ts`

Expected: PASS.

### Task 3: Finish review controls and Corrections workspace

**Files:**
- Create: `apps/indy-content-studio/features/line-oa/components/LineReviewPanel.tsx`
- Create: `apps/indy-content-studio/features/corrections/components/CorrectionsWorkspace.tsx`
- Test: `apps/indy-content-studio/tests/line-review-panel.test.tsx`
- Test: `apps/indy-content-studio/tests/corrections-workspace.test.tsx`
- Modify: `apps/indy-content-studio/features/content/components/ContentApprovalSection.tsx`
- Modify: `apps/indy-content-studio/app/page.tsx`
- Remove: `apps/indy-content-studio/features/dashboard/components/LineSendConfirmation.tsx`

**Interfaces:**
- Consumes: Task 1 commands and Task 2 routes.
- Produces: real editor review panel and working `corrections` workspace.

- [ ] **Step 1: Write panel tests for disconnected, ineligible, confirmation, sending, success, failure/retry, approved, and reset states**

The confirmation must show exact recipient label, asset order, caption preview, and review code. Closing without confirmation sends nothing.

- [ ] **Step 2: Write Corrections tests**

Test refresh, new correction, open content, mark resolved, resubmit creates a new cycle, empty state, fetch failure, and duplicate refresh.

- [ ] **Step 3: Run UI tests and verify failure**

Run: `pnpm test -- tests/line-review-panel.test.tsx tests/corrections-workspace.test.tsx`

Expected: FAIL.

- [ ] **Step 4: Implement the LINE review panel**

Call the send route, then persist `sent` with all provider receipts. Never set sent in an optimistic branch. Poll only while a cycle is pending; the explicit refresh button remains available.

- [ ] **Step 5: Implement Corrections and verified refresh**

Fetch events after the last stored timestamp, apply idempotently, show comment, received time, content, cycle, and status. `แก้แล้ว` resolves the correction; `ส่งตรวจอีกครั้ง` opens the current editor and creates a new cycle only after confirmed send.

- [ ] **Step 6: Verify the complete job and commit**

Run: `pnpm test && pnpm typecheck && pnpm build`

Expected: all commands exit 0.

```bash
git add -- apps/indy-content-studio/features/line-oa apps/indy-content-studio/features/corrections apps/indy-content-studio/features/content/components/ContentApprovalSection.tsx apps/indy-content-studio/features/dashboard/components/LineSendConfirmation.tsx apps/indy-content-studio/app/api/line apps/indy-content-studio/app/page.tsx apps/indy-content-studio/tests/line-review-model.test.ts apps/indy-content-studio/tests/line-review-event.test.ts apps/indy-content-studio/tests/line-review-routes.test.ts apps/indy-content-studio/tests/line-review-panel.test.tsx apps/indy-content-studio/tests/corrections-workspace.test.tsx apps/indy-content-studio/tests/line-webhook-route.test.ts apps/indy-content-studio/tests/line-push-client.test.ts apps/indy-content-studio/tests/line-message-builder.test.ts apps/indy-content-studio/package.json apps/indy-content-studio/pnpm-lock.yaml
git commit -m "feat: complete LINE review and correction loop"
```

### Human acceptance

1. With LINE disconnected, confirm the editor gives a truthful connection instruction and cannot send.
2. Connect a test OA, send an eligible item, and verify a provider receipt appears.
3. Reply `แก้ไข <code>: เพิ่มราคาและวันสมัคร`, refresh Corrections, and verify the exact comment appears on the correct content.
4. Resolve, edit, and resubmit; verify a new cycle code is used.
5. Reply `อนุมัติ <new-code>`, refresh, and verify the content shows LINE approved.
