# Multi-channel Calendar Scheduling and Make Publishing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved multi-channel scheduling workflow, including calendar filtering, repeat copies, and explicit Final-gated Make publication.

**Architecture:** Keep `DashboardState` as the source of truth. Project each enabled platform schedule into its own calendar event, preserve one shared production state, and track queue/publication outcomes per platform. Use the existing Make webhook with a verified callback for actual publication receipts.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Vitest, Testing Library, Neon dashboard snapshots, Vercel Blob signed media delivery, Make webhook.

**Spec:** `docs/superpowers/specs/2026-09-27-multichannel-calendar-publishing-design.md`

## Files and responsibilities

- `features/calendar/schedule-time.ts` — Bangkok timestamp parsing, formatting, and legacy naive-time handling.
- `features/calendar/calendar-selectors.ts`, `calendar-commands.ts` — per-platform event projection, filters, sorting, and focused date moves.
- `features/calendar/components/PlatformScheduleFields.tsx` — shared per-platform enabled/date/time form controls.
- `features/dashboard/components/CreateContentModal.tsx`, `features/dashboard/dashboard-model.ts`, `app/home-page-view.tsx` — create form and compatibility adapter persist channel schedules and accept a date from a calendar cell.
- `features/content/content-draft.ts`, `features/content/components/ContentEditorDialog.tsx`, `features/content/content-commands.ts`, `features/content/content-recurrence.ts` — edit schedules and preview/create independent recurring copies.
- `features/publication/publication-eligibility.ts`, `publication-commands.ts`, `components/MakeDeliveryWorkspace.tsx`, and server handler(s) — finalization gates, per-platform attempts, webhook delivery, and queue visibility.
- `app/api/make/publications/route.ts`, `app/api/make/publications/result/route.ts`, `app/api/dashboard-state/route.ts`, `features/data/server/neon-dashboard-repository.ts`, `features/integrations/server/integration-health.ts`, `.env.example` — Make contract, verified results, server-side protection for queued payloads, and configuration health.
- Tests remain alongside existing calendar, create/edit, content command, Make, and integration-health suites; add focused recurrence and Make-route tests.

## Global constraints

- Saving or editing schedules never submits work to Make; the administrator explicitly submits only after Final.
- Date/time entry and display use Asia/Bangkok; persist new instants with an explicit offset and interpret legacy timezone-less schedules as Bangkok wall time.
- A Make `queued` response is not publication success. Green requires that platform's verified success receipt/callback.
- While an attempt is submitting, queued, or publishing, its publication payload (platform schedule, caption, format, and attached media) cannot be edited until Make confirms cancellation; enforce this both in UI and dashboard-state writes. A failed attempt can be reviewed and retried, but retries must not create duplicate posts.
- Repeated copies exclude the source, reset workflow/review/publication history, and never enqueue automatically.
- Preserve the existing immediate LINE composer and its date-only behavior.
- Do not read, expose, or commit secrets; do not configure Make scenarios or deploy production in this implementation.

## Review focus

- Legacy timezone-less schedule values remain on the intended Bangkok date/time — Task 1 selector/time tests.
- Several platforms for one content item sort correctly and filter without duplicate events — Task 1 projection tests and Task 2 rendered-calendar tests.
- Clicking a blank date pre-fills the create form; dragging one platform does not move siblings — Task 2 UI and command tests.
- A queued platform is not green, and one platform's callback/retry does not alter siblings — Task 4 callback/state tests.
- A duplicate/late callback or a partially accepted Make batch cannot cause a duplicate post or erase a successful result — Task 4 idempotency/partial-failure tests.

---

### Task 1: Model Bangkok schedules as platform-specific calendar events

**Files:**
- Create: `apps/indy-content-studio/features/calendar/schedule-time.ts`
- Modify: `apps/indy-content-studio/features/calendar/calendar-selectors.ts`
- Modify: `apps/indy-content-studio/features/calendar/calendar-commands.ts`
- Test: `apps/indy-content-studio/tests/calendar-model.test.ts`

**Interfaces:**
- `createBangkokScheduleTimestamp(date: string, time: string): string` stores an explicit `+07:00` offset.
- `formatBangkokSchedule(value: string): { date: string; time: string }` handles offset timestamps and legacy timezone-less values.
- `CalendarPlatformFilter = Platform | "all"`.
- `CalendarEvent = { id: string; content: ContentItem; platform: Platform | null; publishAt: string | null; date: string; time: string | null; status: "not-started" | "in-progress" | "published" }`.
- `buildCalendarMonth(state, { month, categoryId?, formatId?, platform? })` returns day `events` and `unscheduled` events. Scheduled items project once per enabled platform; work-only items project once by planned-work date in All mode only; events sort by instant then platform.
- `movePlatformSchedule(state, contentId, platform, date, now)` changes only that platform's date while preserving its time; `movePlannedContent(state, contentId, date, now)` changes a work-only date.

- [ ] **Step 1: Write failing tests** for different per-platform dates, multiple events sorted by time, all/single-platform filters, legacy timezone-less values, one work-only event without duplicates, and moving only the selected platform.
- [ ] **Step 2: Run `pnpm exec vitest run tests/calendar-model.test.ts`** and confirm failures are for missing projection/time behavior.
- [ ] **Step 3: Implement the Bangkok time helpers, selector projection, and focused move commands** using existing `PlatformSchedule` data; derive green only from platform-specific publication evidence, keep queued events yellow, and do not change persisted schema version.
- [ ] **Step 4: Re-run the focused test** and confirm all new cases pass.

### Task 2: Add per-platform scheduling to create/edit and calendar interactions

**Files:**
- Create: `apps/indy-content-studio/features/calendar/components/PlatformScheduleFields.tsx`
- Modify: `apps/indy-content-studio/features/calendar/components/ContentCalendarWorkspace.tsx`
- Modify: `apps/indy-content-studio/features/dashboard/components/CreateContentModal.tsx`
- Modify: `apps/indy-content-studio/features/dashboard/dashboard-model.ts`
- Modify: `apps/indy-content-studio/features/content/content-draft.ts`
- Modify: `apps/indy-content-studio/features/content/components/ContentEditorDialog.tsx`
- Modify: `apps/indy-content-studio/app/home-page-view.tsx`
- Test: `apps/indy-content-studio/tests/content-calendar.test.tsx`
- Test: `apps/indy-content-studio/tests/create-content-modal.test.tsx`
- Test: `apps/indy-content-studio/tests/dashboard-task-adapter.test.ts`
- Test: `apps/indy-content-studio/tests/full-content-editor.test.tsx`

**Interfaces:**
- `CreateContentInput` adds `platformSchedules: Record<Platform, { enabled: boolean; date: string; time: string }>` while retaining existing work-planning fields.
- `CreateContentModal` accepts optional `initialDate`; enabling a channel seeds that channel's date from the form's planned date, while date/time remain independently editable.
- `ContentCalendarWorkspace.onCreateTask(date?: string)` forwards a clicked cell's date; the app opens the existing create flow with that date.
- `DashboardTask` adapters preserve schedules rather than replacing them with an empty array.
- `CreateContentModal` receives `allowedPlatformsByFormat: Record<string, Platform[]>` keyed by its format name; `PlatformScheduleFields` edits canonical schedules in the content editor and disables platforms not supported by the selected format.

- [ ] **Step 1: Write failing tests** for independent channel dates/times, invalid enabled schedules, initial date from a clicked empty cell, schedule persistence through task/content adapters, and editing existing schedule values.
- [ ] **Step 2: Run** `pnpm exec vitest run tests/content-calendar.test.tsx tests/create-content-modal.test.tsx tests/dashboard-task-adapter.test.ts tests/full-content-editor.test.tsx`; confirm expected missing-control/persistence failures.
- [ ] **Step 3: Implement the shared schedule fields and wire date prefill through calendar → home page → create modal.** Pass the selected format's supported platform list, convert valid local entries using `createBangkokScheduleTimestamp`, and keep the LINE composer untouched.
- [ ] **Step 4: Render event platform/time and the All/Facebook/Instagram/TikTok filter.** Empty-cell click creates with a date; a platform card opens the full editor; dragging it calls `movePlatformSchedule` for that platform only.
- [ ] **Step 5: Re-run the four focused test files** and confirm each platform schedule remains independent after reload/edit.

### Task 3: Generate and create repeat copies from the content editor

**Files:**
- Create: `apps/indy-content-studio/features/content/content-recurrence.ts`
- Modify: `apps/indy-content-studio/features/content/content-commands.ts`
- Modify: `apps/indy-content-studio/features/content/components/ContentEditorDialog.tsx`
- Test: `apps/indy-content-studio/tests/content-recurrence.test.ts`
- Test: `apps/indy-content-studio/tests/content-commands.test.ts`
- Test: `apps/indy-content-studio/tests/full-content-editor.test.tsx`

**Interfaces:**
- `CopyCadence = "daily" | "every-other-day" | "weekdays"`.
- `getRecurringCopyDates(anchorDate: string, count: number, cadence: CopyCadence): string[]` returns exactly `count` new dates after the anchor; count is 1–365.
- `createRecurringCopies(state, sourceId, { count, cadence, startDate? }, now, createId): DashboardState` creates independent copies, shifts each enabled platform schedule by the same day delta as the copy anchor, preserves per-channel times, and resets production/review/publication state.

- [ ] **Step 1: Write failing tests** for daily, alternate-day, and weekday dates; 1/365 count bounds; fallback anchor/start date; preserved platform offsets/times; and reset steps, approval, LINE review, and attempts.
- [ ] **Step 2: Run `pnpm exec vitest run tests/content-recurrence.test.ts tests/content-commands.test.ts`** and confirm recurrence behavior is missing.
- [ ] **Step 3: Implement the pure date generator and copy command** by reusing the existing single-copy reset semantics without carrying publication attempts or receipts.
- [ ] **Step 4: Add repeat controls inside the content editor** for cadence, count, optional start date, preview dates, and explicit confirmation; do not add copy buttons to calendar cards.
- [ ] **Step 5: Re-run recurrence, command, and editor tests** and confirm a single repository mutation creates exactly the previewed independent copies.

### Task 4: Gate Make submission on Final and track actual per-platform outcomes

**Files:**
- Create: `apps/indy-content-studio/features/publication/publication-eligibility.ts`
- Create: `apps/indy-content-studio/features/publication/server/make-publication-handler.ts`
- Create: `apps/indy-content-studio/app/api/make/publications/result/route.ts`
- Modify: `apps/indy-content-studio/features/publication/publication-commands.ts`
- Modify: `apps/indy-content-studio/features/domain/types.ts`
- Modify: `apps/indy-content-studio/features/backup/backup-schema.ts`
- Modify: `apps/indy-content-studio/features/publication/components/MakeDeliveryWorkspace.tsx`
- Modify: `apps/indy-content-studio/features/content/components/ContentEditorDialog.tsx`
- Modify: `apps/indy-content-studio/app/api/make/publications/route.ts`
- Modify: `apps/indy-content-studio/features/calendar/calendar-selectors.ts`
- Modify: `apps/indy-content-studio/features/integrations/server/integration-health.ts`
- Modify: `apps/indy-content-studio/.env.example`
- Test: `apps/indy-content-studio/tests/publication-commands.test.ts`
- Test: `apps/indy-content-studio/tests/dashboard-backup.test.ts`
- Test: `apps/indy-content-studio/tests/make-delivery-workspace.test.tsx`
- Test: `apps/indy-content-studio/tests/full-content-editor.test.tsx`
- Test: `apps/indy-content-studio/tests/make-publication-routes.test.ts`
- Test: `apps/indy-content-studio/tests/dashboard-state-route.test.ts`
- Test: `apps/indy-content-studio/tests/integration-health-route.test.ts`

**Interfaces:**
- `getPublicationEligibility(state, contentId, platform, now): { eligible: boolean; reasons: string[] }` requires all process steps done, `productionStatus === "ready"`, local approval, future enabled schedule, supported platform/format, non-empty caption, and remote readiness for attached media.
- `buildPublicationIdempotencyKey(content, platform, schedule): string` is stable for the same `contentId|platform|publishAt|caption|ordered asset IDs` and changes when publication content changes.
- `createPublicationAttempt(...)` assigns the schedule's `latestAttemptId`, stays idempotent for that payload key, and does not mark publication complete.
- `POST /api/make/publications/result` accepts `{ attemptId, status: "publishing" | "published" | "failed" | "cancelled", providerPublicationId?, receiptUrl?, errorCode? }`; `MAKE_API_TOKEN` authenticates Make, and a valid published result requires a provider ID or receipt URL. Callbacks use monotonic/idempotent transitions; only a verified `cancelled` callback unlocks an accepted attempt's payload for editing/requeue.
- `POST /api/make/publications` reloads authoritative saved content/attempt, persists `submitting` before contacting Make, and sends the idempotency key, caption, platform/date, callback URL, and short-lived authorized media URLs to `MAKE_PUBLICATION_WEBHOOK_URL`. Make must ingest media immediately or copy it to durable storage before acknowledging a future schedule because signed URLs expire. The route returns `queued` only when Make accepts it; a timeout is treated as uncertain and retried with the same key, never as proof of failure or publication.
- Dashboard-state writes compare old and new state and reject edits to a payload that has an active `submitting`/`queued`/`publishing` attempt; callback cancellation is the only unlock. Apply the guard to the server save path, not only editor controls.

- [ ] **Step 1: Write failing eligibility/command/route tests** for pre-Final rejection, missing caption/media, past time, supported formats, queued-not-published, Make rejection/timeout, required env configuration, callback authentication, verified receipt, duplicate/out-of-order callbacks, cancellation unlock, server-side payload lock, and independent platform outcomes.
- [ ] **Step 2: Run** `pnpm exec vitest run tests/publication-commands.test.ts tests/make-publication-routes.test.ts tests/dashboard-state-route.test.ts tests/integration-health-route.test.ts`; confirm the gate/contract tests fail for missing behavior.
- [ ] **Step 3: Implement eligibility and attempt transitions.** A single content action creates/submits one attempt per eligible platform; existing accepted/successful attempts are skipped and retries target only failed attempts. Persist a `submitting` attempt before the network call; use a SHA-256 key from `contentId|platform|publishAt|caption|ordered asset IDs`; only a verified `cancelled` callback unlocks an accepted schedule for editing/requeue.
- [ ] **Step 4: Implement server-authoritative Make payload construction** from persisted content and media metadata; generate signed delivery URLs without exposing credentials or URLs in dashboard persistence, and require Make to ingest/copy media durably before accepting a future publication.
- [ ] **Step 5: Implement the authenticated callback** with Neon snapshot compare-and-save retries, strict status/receipt validation, and idempotent transitions; implement the server-side dashboard write guard for active queued publication payloads. Update integration health to require both `MAKE_PUBLICATION_WEBHOOK_URL` and `MAKE_API_TOKEN`.
- [ ] **Step 6: Make `MakeDeliveryWorkspace` a queue/status and failed-retry view, removing its second manual date planner. Add the Final-only send action in the saved content editor; keep it unavailable before Final, explain blockers, distinguish queued from published, and show per-platform failures/retry without changing sibling outcomes. Lock publication payload edits in the UI until Make reports cancellation.
- [ ] **Step 7: Re-run focused tests** and verify a callback makes only its platform green; a Make queue acknowledgement never does.

### Task 5: Verify the complete workflow and protect existing changes

**Files:**
- Test: existing `apps/indy-content-studio/tests/line-send-composer.test.tsx`, `home-page.test.tsx`, and full suite.

- [ ] **Step 1: Run all tests** with `pnpm test` from `apps/indy-content-studio`, including LINE composer regression coverage.
- [ ] **Step 2: Run `pnpm typecheck` and `pnpm build`** from `apps/indy-content-studio`; record any failures by command and file.
- [ ] **Step 3: Review the final diff against the approved spec** and manually verify the local UI flow: independent schedules, filters/order, blank-day creation, drag, repeat preview, Final gate, Make queue, callback status, and LINE non-regression.
- [ ] **Step 4: Leave production undeployed** unless the owner separately requests deployment and the Make scenario is confirmed configured for durable scheduled media and callbacks.

## Worktree safety

The current `codex/line-oa-production` worktree already contains numerous user changes in files this feature touches, plus untracked LINE handoff files. Inspect each relevant diff before editing, preserve existing work, never stage the broad worktree, and do not commit files that combine this feature with pre-existing user edits. Leave the resulting changes available for user review.
