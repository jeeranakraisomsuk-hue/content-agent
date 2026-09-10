# LINE OA Review and Scheduled Publishing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an internal LINE OA review loop where approved image/video-and-caption snapshots wait for their scheduled publication time before Make distributes them to configured social platforms.

**Architecture:** The Next.js dashboard writes immutable review rounds to Supabase and stores original media privately in Google Drive. A signed server delivery route gives LINE and Make short-lived access to one exact Drive asset; LINE webhook events decide the current round atomically, while the scheduler dispatches only the latest approved snapshot at its configured Thailand publication time.

**Tech Stack:** TypeScript, Next.js App Router, React, Supabase Auth/PostgreSQL, Google Drive API, LINE Messaging API, Make webhooks, Zod, Vitest, pgTAP, Playwright, pnpm.

**Spec:** `docs/superpowers/specs/2026-09-10-line-oa-review-and-scheduled-publishing-design.md`

## Global Constraints

- Every LINE OA follower in the internal account may see a review notification and make a review decision; save the actor identity and time for each action.
- Send a new LINE notification for every submitted or resubmitted review round.
- Google Drive stores original media privately. Never make a Drive folder public and never use a Drive Preview page as media delivery.
- LINE and Make may access only a short-lived HTTPS delivery URL for one exact asset.
- Approval changes an item to **พร้อมโพสต์** and waits for the configured Asia/Bangkok publication time; it never posts immediately.
- The most recently approved immutable media-and-caption snapshot is the only publishable revision.
- A change to reviewed media or caption supersedes the older round and requires a new LINE review.
- Existing Make publish-result callbacks remain the only source of `เผยแพร่แล้ว` and canonical HTTPS post links.
- Secrets remain server-side. Client code, browser storage, Git, logs, and error responses never contain LINE, Google Drive, Make, or signing-key values.
- Verify the LINE signature on every webhook request and make decisions, dispatches, and provider callbacks idempotent.
- Use TDD in every task and commit only after its focused tests pass.

---

## File Structure

```text
apps/dashboard/
  app/api/reviews/route.ts                            # create a new review round
  app/api/reviews/[roundId]/feedback/route.ts         # dashboard feedback history
  app/api/review-media/[assetId]/route.ts             # short-lived Drive delivery stream
  app/api/webhooks/line/route.ts                      # verified LINE events and postbacks
  app/api/cron/review-publications/route.ts           # due approved-round dispatch
  app/(authenticated)/reviews/changes/page.tsx        # งานต้องแก้ page
  components/reviews/review-panel.tsx                 # content editor review summary/send action
  components/reviews/review-history.tsx               # immutable rounds and feedback
  components/reviews/changes-requested-list.tsx       # repair queue
  components/production/review-aware-card.tsx         # board card state/actions
  features/reviews/contracts.ts                       # shared schemas and status types
  features/reviews/server/review-repository.ts        # transactional review persistence
  features/reviews/server/review-service.ts           # state transitions and supersession
  features/reviews/server/google-drive-media.ts       # private upload and metadata verification
  features/reviews/server/delivery-token.ts           # narrow expiring asset tokens
  features/reviews/server/line-client.ts              # Flex notification and reply helpers
  features/reviews/server/line-webhook.ts             # signature/event/keyword interpretation
  features/reviews/server/make-dispatcher.ts          # exact approved snapshot to Make
  features/reviews/server/publish-scheduler.ts        # due-time selection and lease handling
  tests/reviews/*.test.ts                             # route/service/component tests
  e2e/reviews.spec.ts                                 # dashboard review lifecycle
  .env.example                                        # variable names only

supabase/
  migrations/20260910110000_line_review_rounds.sql    # tables, RLS, constraints
  migrations/20260910111000_review_leases.sql         # atomic decision and publish leases
  tests/line_review_rounds.sql                        # pgTAP data/RLS/idempotency tests

docs/
  line-review-operations.md                           # configuration, recovery, security
```

The review feature depends on a narrow `CalendarContentGateway` that reads content schedule and updates production status. `review-service.ts` is the only review module that calls it. `make-dispatcher.ts` receives an approved snapshot and never reads mutable draft media or caption fields.

---

### Task 1: Define review contracts and create the review database schema

**Files:**
- Create: `apps/dashboard/features/reviews/contracts.ts`
- Create: `apps/dashboard/tests/reviews/contracts.test.ts`
- Create: `supabase/migrations/20260910110000_line_review_rounds.sql`
- Create: `supabase/tests/line_review_rounds.sql`

**Interfaces:**
- Produces: `ReviewRoundStatus`, `ReviewDecision`, `reviewSubmissionSchema`, `lineDecisionSchema`, `ReviewSnapshot`, `ReviewRoundView`, and `CalendarContentGateway`.
- Produces: `review_rounds`, `review_events`, `review_feedback`, and `review_delivery_attempts` tables.
- Consumes: authenticated dashboard user IDs and existing calendar content IDs.

- [ ] **Step 1: Write failing shared-contract tests**

```ts
import { describe, expect, it } from "vitest";
import { lineDecisionSchema, reviewSubmissionSchema } from "../../features/reviews/contracts";

describe("review contracts", () => {
  it("requires a caption, one or more verified assets, and a scheduled content ID", () => {
    expect(() => reviewSubmissionSchema.parse({ contentId: "bad", caption: "", assets: [] })).toThrow();
  });

  it("accepts a LINE approval tied to one opaque round ID", () => {
    expect(lineDecisionSchema.parse({ roundId: crypto.randomUUID(), decision: "approved" })).toMatchObject({ decision: "approved" });
  });

  it("requires feedback for a changes request", () => {
    expect(() => lineDecisionSchema.parse({ roundId: crypto.randomUUID(), decision: "changes_requested" })).toThrow();
  });
});
```

- [ ] **Step 2: Run the test and confirm failure**

Run: `pnpm --dir apps/dashboard vitest run tests/reviews/contracts.test.ts`

Expected: FAIL because `contracts.ts` does not exist.

- [ ] **Step 3: Define exact schemas and types**

```ts
import { z } from "zod";

export const reviewRoundStatuses = ["draft", "submitted", "changes_requested", "approved", "superseded", "queued", "completed"] as const;
export type ReviewRoundStatus = (typeof reviewRoundStatuses)[number];
export type ReviewDecision = "approved" | "changes_requested";

export const reviewAssetSchema = z.object({
  assetId: z.string().uuid(),
  driveFileId: z.string().min(1),
  kind: z.enum(["image", "video"]),
  mimeType: z.string().min(1),
  byteSize: z.number().int().positive(),
  previewAssetId: z.string().uuid().optional(),
});

export const reviewSubmissionSchema = z.object({
  contentId: z.string().uuid(),
  expectedContentRevision: z.number().int().positive(),
  caption: z.string().trim().min(1).max(20_000),
  assets: z.array(reviewAssetSchema).min(1).max(10),
});

export const lineDecisionSchema = z.discriminatedUnion("decision", [
  z.object({ roundId: z.string().uuid(), decision: z.literal("approved") }),
  z.object({ roundId: z.string().uuid(), decision: z.literal("changes_requested"), feedback: z.string().trim().min(1).max(8_000) }),
]);

export type ReviewSnapshot = z.infer<typeof reviewSubmissionSchema> & { roundId: string; roundNumber: number; scheduledAt: string };
export type ReviewRoundView = ReviewSnapshot & {
  status: ReviewRoundStatus;
  captionSnapshot: string;
  decidedAt: string | null;
  decidedByDisplayName: string | null;
  feedback: Array<{ id: string; text: string; actorDisplayName: string; createdAt: string }>;
};
export interface CalendarContentGateway {
  getReviewableContent(contentId: string, ownerId: string): Promise<{ id: string; revision: number; scheduledAt: string; status: string }>;
  setProductionStatus(contentId: string, revision: number, status: "รอตรวจ" | "ต้องแก้" | "พร้อมโพสต์"): Promise<void>;
  clearReviewPublishEligibility(contentId: string, revision: number): Promise<void>;
}
```

- [ ] **Step 4: Write the migration and database assertions**

Create `review_rounds` with immutable JSONB columns `media_snapshot` and `caption_snapshot`, status constrained to the seven values above, `content_id`, `content_revision`, `round_number`, scheduled timestamp, and a unique `(content_id, round_number)`. Create `review_events` as append-only, `review_feedback` with one feedback row per decision event, and `review_delivery_attempts` keyed by `(round_id, attempt_number)`. Enable RLS on all tables and permit only the authenticated content owner to read dashboard records; server service-role calls perform LINE and scheduler writes.

```sql
create table public.review_rounds (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null,
  content_revision integer not null check (content_revision > 0),
  round_number integer not null check (round_number > 0),
  status text not null check (status in ('draft','submitted','changes_requested','approved','superseded','queued','completed')),
  media_snapshot jsonb not null check (jsonb_array_length(media_snapshot) between 1 and 10),
  caption_snapshot text not null check (char_length(caption_snapshot) between 1 and 20000),
  scheduled_at timestamptz not null,
  decided_at timestamptz,
  decided_by_line_user_id text,
  decided_by_display_name text,
  created_at timestamptz not null default now(),
  unique (content_id, round_number)
);
```

`supabase/tests/line_review_rounds.sql` must assert the four tables, RLS, status constraint, unique round number, and rejection of an empty snapshot.

- [ ] **Step 5: Run focused checks**

Run: `pnpm --dir apps/dashboard vitest run tests/reviews/contracts.test.ts`

Run: `supabase test db --file supabase/tests/line_review_rounds.sql`

Expected: both PASS.

- [ ] **Step 6: Commit the review foundation**

```bash
git add apps/dashboard/features/reviews/contracts.ts apps/dashboard/tests/reviews/contracts.test.ts supabase/migrations/20260910110000_line_review_rounds.sql supabase/tests/line_review_rounds.sql
git commit -m "feat: add immutable review round schema"
```

---

### Task 2: Add private Google Drive asset storage and temporary delivery URLs

**Files:**
- Create: `apps/dashboard/features/reviews/server/google-drive-media.ts`
- Create: `apps/dashboard/features/reviews/server/delivery-token.ts`
- Create: `apps/dashboard/app/api/review-media/[assetId]/route.ts`
- Create: `apps/dashboard/tests/reviews/google-drive-media.test.ts`
- Modify: `apps/dashboard/.env.example`

**Interfaces:**
- Produces: `storeReviewAsset(input): Promise<StoredReviewAsset>` and `createDeliveryToken(assetId, audience): string`.
- Produces: `GET /api/review-media/:assetId?token=…` which streams one verified Drive object.
- Consumes: `GOOGLE_DRIVE_REVIEW_FOLDER_ID`, a server-only Drive credential, and `REVIEW_DELIVERY_TOKEN_SECRET`.

- [ ] **Step 1: Write failing storage and token tests**

```ts
it("keeps the Drive object private and mints an expiring LINE delivery URL", async () => {
  const asset = await media.storeReviewAsset(imageFixture);
  const url = delivery.createDeliveryUrl(asset.id, "line", new Date("2026-09-10T09:00:00Z"));
  expect(asset.drivePermission).toBe("private");
  expect(url).toMatch(/\/api\/review-media\//);
  expect(delivery.verifyDeliveryToken(urlToken(url), "line", new Date("2026-09-10T09:10:00Z"))).toMatchObject({ assetId: asset.id });
});

it("rejects an expired or wrong-audience URL", () => {
  const token = delivery.createDeliveryToken(assetId, "line", new Date("2026-09-10T09:00:00Z"));
  expect(() => delivery.verifyDeliveryToken(token, "make", new Date("2026-09-10T09:01:00Z"))).toThrow();
  expect(() => delivery.verifyDeliveryToken(token, "line", new Date("2026-09-10T10:00:00Z"))).toThrow();
});
```

- [ ] **Step 2: Run the storage test and confirm failure**

Run: `pnpm --dir apps/dashboard vitest run tests/reviews/google-drive-media.test.ts`

Expected: FAIL because Drive and delivery modules do not exist.

- [ ] **Step 3: Implement verified private uploads**

`storeReviewAsset` must accept only JPEG, PNG, WebP, MP4, MOV, or WebM; inspect server-side bytes and decode metadata before upload. Store the Drive file under `reviews/<contentId>/<assetId>/<originalName>`, record the Drive file ID and verified MIME/size, and explicitly set Drive permission to private. For video, create a JPEG preview asset; for image, create a normalised JPEG preview asset. Do not create `anyone` or `domain` sharing permissions.

- [ ] **Step 4: Implement audience-bound tokens and streaming**

Use an HMAC-SHA-256 signed payload `{ assetId, audience, expiresAt, nonce }`. Set expiry to 15 minutes for LINE and 30 minutes for Make. The route verifies the HMAC, expiration, and `audience === 'line'` before retrieving the one Drive file by ID. It returns the verified MIME type with `Cache-Control: private, no-store`. It never accepts a Drive URL or arbitrary file ID from the request.

- [ ] **Step 5: Document configuration names without values**

Add these names to `.env.example`: `GOOGLE_DRIVE_REVIEW_FOLDER_ID`, `GOOGLE_DRIVE_CLIENT_EMAIL`, `GOOGLE_DRIVE_PRIVATE_KEY`, and `REVIEW_DELIVERY_TOKEN_SECRET`. The comments must state that values belong in deployment secrets and that Drive links are not public.

- [ ] **Step 6: Run focused tests**

Run: `pnpm --dir apps/dashboard vitest run tests/reviews/google-drive-media.test.ts`

Expected: PASS for private upload, MIME/size rejection, preview creation contract, token audience, expiry, and asset-ID binding.

- [ ] **Step 7: Commit secure Drive delivery**

```bash
git add apps/dashboard/features/reviews/server/google-drive-media.ts apps/dashboard/features/reviews/server/delivery-token.ts apps/dashboard/app/api/review-media apps/dashboard/tests/reviews/google-drive-media.test.ts apps/dashboard/.env.example
git commit -m "feat: add private Drive review media delivery"
```

---

### Task 3: Implement review-round state transitions and immutable snapshots

**Files:**
- Create: `apps/dashboard/features/reviews/server/review-repository.ts`
- Create: `apps/dashboard/features/reviews/server/review-service.ts`
- Create: `apps/dashboard/app/api/reviews/route.ts`
- Create: `apps/dashboard/app/api/reviews/[roundId]/feedback/route.ts`
- Create: `apps/dashboard/tests/reviews/review-service.test.ts`

**Interfaces:**
- Produces: `submitReview(ownerId, input)`, `approveReview(actor, roundId)`, `requestChanges(actor, roundId, feedback)`, and `supersedeOpenRounds(contentId, revision)`.
- Produces: `ReviewRoundView` containing snapshot, decision, feedback history, and delivery status.
- Consumes: the contracts from Task 1, verified Drive assets from Task 2, and `CalendarContentGateway`.

- [ ] **Step 1: Write failing review-state tests**

```ts
it("creates the next round from an immutable media-and-caption snapshot", async () => {
  const round = await service.submitReview(ownerId, validSubmission);
  await calendar.changeCaption(validSubmission.contentId, "แก้ไขหลังส่งตรวจ");
  expect((await repository.getRound(round.id)).captionSnapshot).toBe(validSubmission.caption);
  expect((await repository.getRound(round.id)).status).toBe("superseded");
});

it("accepts only the first valid decision and changes the board status", async () => {
  const approved = await service.approveReview(lineActor, submittedRound.id);
  const second = await service.requestChanges(otherActor, submittedRound.id, "ขอแก้สี");
  expect(approved.status).toBe("approved");
  expect(second.accepted).toBe(false);
  expect(await calendar.status(submittedRound.contentId)).toBe("พร้อมโพสต์");
});

it("records rejection feedback and exposes the content as changes requested", async () => {
  await service.requestChanges(lineActor, submittedRound.id, "เปลี่ยนภาพเปิดและลดแคปชัน");
  expect(await repository.feedback(submittedRound.id)).toContainEqual(expect.objectContaining({ text: "เปลี่ยนภาพเปิดและลดแคปชัน" }));
  expect(await calendar.status(submittedRound.contentId)).toBe("ต้องแก้");
});
```

- [ ] **Step 2: Run the test and confirm failure**

Run: `pnpm --dir apps/dashboard vitest run tests/reviews/review-service.test.ts`

Expected: FAIL because review repository and service do not exist.

- [ ] **Step 3: Implement transactional round creation**

In one database transaction, verify content ownership, content revision, scheduled time, caption, and Drive asset ownership. Allocate `round_number` with a row lock on that content, write the immutable snapshot, append a `submitted` review event, and update the board state to `รอตรวจ`. A submit request with the same `(content_id, content_revision, snapshot checksum)` returns the already-created round rather than creating a duplicate.

- [ ] **Step 4: Implement atomic decisions and supersession**

`approveReview` changes only `submitted` to `approved` with `WHERE status = 'submitted'`, stores actor identity/time, appends an event, and asks the calendar gateway to set **พร้อมโพสต์**. `requestChanges` performs the same conditional update to `changes_requested`, inserts feedback, and changes the board to **ต้องแก้**. `supersedeOpenRounds` changes `submitted` and `approved` rounds for an older content revision to `superseded`, then removes its publish eligibility.

- [ ] **Step 5: Add authenticated routes**

`POST /api/reviews` responds `202` with `{ roundId, status: 'submitted' }`. `GET /api/reviews/:roundId/feedback` responds with current-round feedback/history only for the content owner. Return `404` for cross-owner records, `409` for stale revision or already-decided round, and `422` for malformed snapshot data.

- [ ] **Step 6: Run focused tests**

Run: `pnpm --dir apps/dashboard vitest run tests/reviews/review-service.test.ts`

Expected: PASS for immutable snapshots, idempotent submit, approval, rejection, actor audit, stale decision, and superseding approval after a content edit.

- [ ] **Step 7: Commit review lifecycle**

```bash
git add apps/dashboard/features/reviews/server/review-repository.ts apps/dashboard/features/reviews/server/review-service.ts apps/dashboard/app/api/reviews apps/dashboard/tests/reviews/review-service.test.ts
git commit -m "feat: add review round lifecycle"
```

---

### Task 4: Send LINE OA notifications and verify inbound decisions

**Files:**
- Create: `apps/dashboard/features/reviews/server/line-client.ts`
- Create: `apps/dashboard/features/reviews/server/line-webhook.ts`
- Create: `apps/dashboard/app/api/webhooks/line/route.ts`
- Create: `apps/dashboard/tests/reviews/line-webhook.test.ts`
- Modify: `apps/dashboard/.env.example`

**Interfaces:**
- Produces: `sendReviewNotification(round: ReviewSnapshot): Promise<LineDeliveryReceipt>`.
- Produces: `verifyLineWebhook(rawBody, signature)` and `handleLineEvent(event)`.
- Consumes: review service from Task 3, temporary LINE delivery URLs from Task 2, and `LINE_CHANNEL_SECRET`/`LINE_CHANNEL_ACCESS_TOKEN` server secrets.

- [ ] **Step 1: Write failing LINE delivery and webhook tests**

```ts
it("sends every submitted round as a Flex review card", async () => {
  await client.sendReviewNotification(roundSnapshot);
  expect(lineApi.broadcast).toHaveBeenCalledWith(expect.objectContaining({
    type: "flex",
    altText: expect.stringContaining("REV-"),
  }));
});

it("rejects a bad signature before parsing the event", async () => {
  const response = await route.post(requestWith({ signature: "wrong", body: lineFixture }));
  expect(response.status).toBe(401);
  expect(service.approveReview).not.toHaveBeenCalled();
});

it("stores feedback only after the same reviewer started a change request", async () => {
  await webhook.handle(postbackChangesRequested(round.id, lineActor));
  await webhook.handle(textEvent("ลดแคปชันและเปลี่ยนช็อตแรก", lineActor));
  expect(service.requestChanges).toHaveBeenCalledWith(expect.objectContaining({ lineUserId: lineActor.id }), round.id, "ลดแคปชันและเปลี่ยนช็อตแรก");
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `pnpm --dir apps/dashboard vitest run tests/reviews/line-webhook.test.ts`

Expected: FAIL because LINE modules and route do not exist.

- [ ] **Step 3: Create Flex notification and delivery recording**

Build a Flex bubble containing content title, `REV-<roundNumber>`, one image or video preview, caption excerpt limited to 1,000 characters, scheduled Thai date/time, and postback buttons: `ผ่าน`, `ไม่ผ่าน / ส่งบรีฟแก้`, `เปิดงานในเว็บ`. Broadcast to the internal OA follower audience. Store a delivery attempt with `accepted`, `failed`, or `retryable_failed`; retry only a failed send for the same round and attempt number.

- [ ] **Step 4: Verify LINE signatures and map events**

Read the raw request body, calculate HMAC-SHA-256 with `LINE_CHANNEL_SECRET`, and compare it using timing-safe equality against `x-line-signature`. Deduplicate events by LINE webhook event ID. An approve postback calls `approveReview`; a changes postback records `{ lineUserId, displayName, roundId }` as that actor's pending feedback context and replies asking for a text brief. The next text from that same actor submits feedback. Parse `ผ่าน REV-123` and `ไม่ผ่าน REV-123 <ข้อความ>` as alternatives to the buttons.

- [ ] **Step 5: Add secret names only**

Add `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`, and `LINE_REVIEW_WEBHOOK_SECRET` to `.env.example`. Include one comment: "Set these only in server deployment secrets; do not copy values into the dashboard or Make mapping fields."

- [ ] **Step 6: Run focused tests**

Run: `pnpm --dir apps/dashboard vitest run tests/reviews/line-webhook.test.ts`

Expected: PASS for Flex card generation, every resubmission notification, valid signature, invalid signature, button approval, feedback flow, text commands, duplicate webhook, and already-decided acknowledgement.

- [ ] **Step 7: Commit LINE review integration**

```bash
git add apps/dashboard/features/reviews/server/line-client.ts apps/dashboard/features/reviews/server/line-webhook.ts apps/dashboard/app/api/webhooks/line apps/dashboard/tests/reviews/line-webhook.test.ts apps/dashboard/.env.example
git commit -m "feat: add LINE OA review notifications"
```

---

### Task 5: Build review-aware dashboard controls, repair queue, and production board states

**Files:**
- Create: `apps/dashboard/components/reviews/review-panel.tsx`
- Create: `apps/dashboard/components/reviews/review-history.tsx`
- Create: `apps/dashboard/components/reviews/changes-requested-list.tsx`
- Create: `apps/dashboard/app/(authenticated)/reviews/changes/page.tsx`
- Create: `apps/dashboard/components/production/review-aware-card.tsx`
- Create: `apps/dashboard/tests/reviews/review-ui.test.tsx`
- Modify: existing content editor component
- Modify: existing production board component
- Modify: existing dashboard navigation component

**Interfaces:**
- Produces: content-editor review send UI, **งานต้องแก้** page, and review-aware production cards.
- Consumes: review routes from Task 3 and delivery state from Task 4.

- [ ] **Step 1: Write failing UI tests**

```tsx
it("renders the send-review action only when media, caption, schedule, and connections are ready", () => {
  render(<ReviewPanel content={readyContent} review={null} connection={{ line: true, drive: true }} />);
  expect(screen.getByRole("button", { name: "ส่งตรวจใน LINE" })).toBeEnabled();

  render(<ReviewPanel content={{ ...readyContent, caption: "" }} review={null} connection={{ line: true, drive: true }} />);
  expect(screen.getByRole("button", { name: "ส่งตรวจใน LINE" })).toBeDisabled();
});

it("shows LINE feedback and starts a new review submission after correction", async () => {
  render(<ChangesRequestedList rounds={[changesRequestedRound]} />);
  expect(screen.getByText("เปลี่ยนภาพเปิดและลดแคปชัน")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "แก้ไขและส่งตรวจใหม่" }));
  expect(navigate).toHaveBeenCalledWith(expect.stringContaining(changesRequestedRound.contentId));
});

it("does not render a free status selector that can bypass review", () => {
  render(<ReviewAwareCard content={waitingReviewContent} round={submittedRound} />);
  expect(screen.queryByRole("combobox", { name: "สถานะผลิต" })).not.toBeInTheDocument();
  expect(screen.getByText("รอตรวจ")).toBeVisible();
});
```

- [ ] **Step 2: Run UI tests and confirm failure**

Run: `pnpm --dir apps/dashboard vitest run tests/reviews/review-ui.test.tsx`

Expected: FAIL because review components do not exist.

- [ ] **Step 3: Add the content editor review panel**

Show latest round number/status, preview, reviewed caption snapshot, reviewer/time, and a history link. Enable **ส่งตรวจใน LINE** only when verified Drive media, non-empty caption, valid scheduled publication, and both LINE/Drive health checks are present. After a successful request, show `ส่ง REV-… เข้า LINE OA แล้ว` and lock the captured snapshot from editing in that round view.

- [ ] **Step 4: Add the งานต้องแก้ page**

List current `changes_requested` rounds in reverse feedback time. Each card includes preview, caption snapshot, feedback text, reviewer display name, timestamp, and **แก้ไขและส่งตรวจใหม่**. The edit route opens the original content; saving changed media/caption supersedes the old round, and the review panel creates the new round when the user chooses resubmit.

- [ ] **Step 5: Replace bypassable board status transitions**

Board cards derive `รอตรวจ`, `ต้องแก้`, and `พร้อมโพสต์` from review-round state. Remove or disable any general status dropdown for those three states. Cards open review history; `พร้อมโพสต์` shows approved round and local scheduled time; `กำลังส่ง` and `เผยแพร่แล้ว` retain existing per-platform display and links.

- [ ] **Step 6: Run focused tests**

Run: `pnpm --dir apps/dashboard vitest run tests/reviews/review-ui.test.tsx`

Expected: PASS for send readiness, history, repair queue, keyboard labels, feedback display, resubmit navigation, and removal of review-bypass controls.

- [ ] **Step 7: Commit dashboard review UX**

```bash
git add apps/dashboard/components/reviews apps/dashboard/components/production/review-aware-card.tsx apps/dashboard/app/'(authenticated)'/reviews/changes apps/dashboard/tests/reviews/review-ui.test.tsx
git commit -m "feat: add review repair queue and board states"
```

---

### Task 6: Dispatch only approved snapshots to Make at scheduled time

**Files:**
- Create: `apps/dashboard/features/reviews/server/make-dispatcher.ts`
- Create: `apps/dashboard/features/reviews/server/publish-scheduler.ts`
- Create: `apps/dashboard/app/api/cron/review-publications/route.ts`
- Create: `supabase/migrations/20260910111000_review_leases.sql`
- Create: `apps/dashboard/tests/reviews/publish-scheduler.test.ts`

**Interfaces:**
- Produces: `claimDueApprovedRounds(now, workerId): Promise<ReviewRound[]>` and `dispatchApprovedRound(roundId): Promise<DispatchResult>`.
- Produces: scheduler endpoint secured with `CRON_SECRET`.
- Consumes: approved review snapshots, temporary Make delivery URLs, existing Make publish webhook, and existing publication IDs.

- [ ] **Step 1: Write failing scheduler tests**

```ts
it("dispatches only the newest approved round after its Bangkok schedule", async () => {
  const claimed = await scheduler.claimDueApprovedRounds(new Date("2026-09-10T02:01:00Z"), "worker-a");
  expect(claimed.map((round) => round.id)).toEqual([approvedRound.id]);
  await dispatcher.dispatchApprovedRound(approvedRound.id);
  expect(makeWebhook.send).toHaveBeenCalledWith(expect.objectContaining({
    roundId: approvedRound.id,
    caption: approvedRound.captionSnapshot,
    mediaUrl: expect.stringContaining("/api/review-media/"),
  }));
});

it("does not dispatch a superseded, rejected, future, or previously leased round", async () => {
  const claimed = await scheduler.claimDueApprovedRounds(new Date("2026-09-10T02:01:00Z"), "worker-a");
  expect(claimed).not.toContainEqual(expect.objectContaining({ status: "superseded" }));
  expect(claimed).not.toContainEqual(expect.objectContaining({ id: futureRound.id }));
});
```

- [ ] **Step 2: Run scheduler tests and confirm failure**

Run: `pnpm --dir apps/dashboard vitest run tests/reviews/publish-scheduler.test.ts`

Expected: FAIL because scheduler and dispatcher do not exist.

- [ ] **Step 3: Add atomic due-round leases**

Create `publish_lease_owner`, `publish_lease_expires_at`, and `make_dispatch_idempotency_key` on `review_rounds`. Add SQL function `claim_due_approved_rounds(worker_id text, now_at timestamptz, lease_seconds integer)` that selects only `approved` rounds with `scheduled_at <= now_at`, no newer approved round for the same content, and no active lease; it updates them to `queued` with a 120-second lease in the same statement.

- [ ] **Step 4: Implement exact snapshot Make dispatch**

Create a 30-minute `make` delivery URL for every snapshot asset and send Make `{ roundId, contentId, contentRevision, caption, media, scheduledAt, publications, idempotencyKey }`. Use `roundId:contentRevision` as idempotency key. Never read current mutable caption or current media IDs. A non-2xx Make response records a retryable dispatch event and restores `approved` only if the lease owner still matches; it never marks a publication as published.

- [ ] **Step 5: Secure the scheduler route**

`POST /api/cron/review-publications` compares a bearer token with `CRON_SECRET` in constant time and returns only `{ claimed, dispatched, retryableFailures }`. It rejects missing or wrong authentication with `401`. It calls the scheduler with the server clock, not a browser-supplied timestamp.

- [ ] **Step 6: Run focused tests**

Run: `pnpm --dir apps/dashboard vitest run tests/reviews/publish-scheduler.test.ts`

Expected: PASS for Bangkok due time, latest approved round, lease contention, idempotency, expired URL replacement, bad cron authentication, and Make failure without a false published state.

- [ ] **Step 7: Commit scheduled Make dispatch**

```bash
git add apps/dashboard/features/reviews/server/make-dispatcher.ts apps/dashboard/features/reviews/server/publish-scheduler.ts apps/dashboard/app/api/cron/review-publications supabase/migrations/20260910111000_review_leases.sql apps/dashboard/tests/reviews/publish-scheduler.test.ts
git commit -m "feat: dispatch approved review rounds on schedule"
```

---

### Task 7: Verify provider callbacks, full lifecycle, and operations

**Files:**
- Modify: existing Make publish-result callback route and callback tests
- Create: `apps/dashboard/e2e/reviews.spec.ts`
- Create: `docs/line-review-operations.md`
- Modify: `apps/dashboard/.env.example`

**Interfaces:**
- Produces: a publish-result guard that rejects callbacks for a non-current review round.
- Produces: repeatable browser acceptance tests and deployment/recovery instructions.
- Consumes: all prior review APIs, LINE test doubles, Drive fake adapter, Make fake adapter, and existing social callback path.

- [ ] **Step 1: Write failing provider-callback and browser tests**

```ts
it("accepts a provider link only for the dispatched current approved round", async () => {
  const result = await publishResult.handle(validCallback({ roundId: approvedRound.id, postUrl: "https://facebook.com/reel/123" }));
  expect(result.publication.status).toBe("published");
  await expect(publishResult.handle(validCallback({ roundId: supersededRound.id }))).rejects.toThrow("รอบตรวจไม่ใช่รอบที่ส่งเผยแพร่");
});
```

```ts
test("team rejection, correction, approval, and scheduled publish keeps review history", async ({ page }) => {
  await page.goto(`/content/${contentId}`);
  await page.getByRole("button", { name: "ส่งตรวจใน LINE" }).click();
  await lineFixture.requestChanges({ roundNumber: 1, feedback: "เปลี่ยนภาพเปิด" });
  await page.goto("/reviews/changes");
  await expect(page.getByText("เปลี่ยนภาพเปิด")).toBeVisible();
  await page.getByRole("button", { name: "แก้ไขและส่งตรวจใหม่" }).click();
  await page.getByLabel("แคปชัน").fill("เวอร์ชันแก้ไข");
  await page.getByRole("button", { name: "ส่งตรวจใน LINE" }).click();
  await lineFixture.approve({ roundNumber: 2 });
  await expect(page.getByText("พร้อมโพสต์")).toBeVisible();
  await schedulerFixture.runAtScheduledTime();
  await expect(makeFixture.lastPayload()).resolves.toMatchObject({ caption: "เวอร์ชันแก้ไข" });
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `pnpm --dir apps/dashboard vitest run tests/reviews`

Run: `pnpm --dir apps/dashboard playwright test e2e/reviews.spec.ts`

Expected: FAIL until callback guard and full lifecycle fixtures are wired.

- [ ] **Step 3: Extend the callback guard**

Require `roundId` on Make callback payloads. Look up the dispatch lease/idempotency record and reject an unknown, superseded, or unqueued round before the existing per-platform update occurs. Preserve the existing rule that a canonical HTTPS post URL and provider result are required before any card turns green or content becomes `เผยแพร่แล้ว`.

- [ ] **Step 4: Add deterministic test doubles**

Use dependency injection for LINE broadcast, Drive object retrieval, and Make HTTP dispatch in test mode. Test doubles return fixed IDs and signed-token clocks, but the application still uses the real review repository, SQL transaction, and calendar/board gateway. No production behavior branches on title, caption, or review feedback text.

- [ ] **Step 5: Write operations documentation**

`docs/line-review-operations.md` must include exact deployment order: apply Supabase migrations, configure private Drive folder/service credential, set secret names, set LINE webhook URL, enable webhook signature validation, configure Make endpoint/callback, configure the authenticated cron scheduler, send one test round, and verify a single safe provider callback. Include recovery rules for failed LINE delivery, Drive access expiry, stuck 120-second leases, wrong LINE signature, duplicate LINE event, and Make retry. State that deleting media requires checking that no review round or published snapshot still references it.

- [ ] **Step 6: Run complete verification**

Run: `pnpm --dir apps/dashboard lint`

Run: `pnpm --dir apps/dashboard typecheck`

Run: `pnpm --dir apps/dashboard vitest run tests/reviews`

Run: `supabase test db --file supabase/tests/line_review_rounds.sql`

Run: `pnpm --dir apps/dashboard playwright test e2e/reviews.spec.ts`

Expected: every command exits 0. Test logs and browser output contain no API key, Drive private key, LINE secret, Make secret, permanent Drive URL, or raw signature value.

- [ ] **Step 7: Commit lifecycle verification and operations guide**

```bash
git add apps/dashboard/e2e/reviews.spec.ts docs/line-review-operations.md apps/dashboard/.env.example
git add apps/dashboard/app/api apps/dashboard/tests/reviews
git commit -m "test: verify LINE review publishing lifecycle"
```

---

## Plan Self-Review

- Spec coverage: Tasks 1 and 3 create immutable rounds, actor audit, feedback, supersession, and board states. Task 2 keeps Drive original files private while supplying narrow delivery URLs. Task 4 sends every review round to LINE and processes buttons/text feedback with signature verification. Task 5 supplies the content-editor panel, repair queue, and review-aware board. Task 6 waits for calendar time and sends only the approved snapshot to Make. Task 7 protects provider results and verifies the end-to-end loop.
- Scope boundary: This plan does not create social account OAuth, alter platform-specific publishing rules, open Drive folders publicly, or expose any secret in the browser.
- Type consistency: `ReviewRoundStatus`, `ReviewSnapshot`, `roundId`, immutable `captionSnapshot`, immutable `mediaSnapshot`, and `CalendarContentGateway` are defined in Task 1 and used under the same names throughout.
- Failure coverage: Invalid Drive assets, delivery expiry, signature mismatch, duplicate events, stale decisions, concurrent decisions, superseded rounds, cron authentication, Make failure, and stale provider callbacks each have an explicit implementation and test step.
