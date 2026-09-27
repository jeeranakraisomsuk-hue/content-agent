# Multi-channel Calendar Scheduling and Make Publishing — Design

**Date:** 2026-09-27
**Status:** Awaiting owner review

## Goal

Let the content team schedule one content item on Facebook, Instagram, and/or TikTok at independent dates and times, complete the existing production and Action Plan workflow, then explicitly send its finalized schedules to Make for publication. The calendar must make those schedules easy to filter, inspect, move, and repeat in batches.

This change extends the social-publishing flow only. The separate LINE composer remains date-only and sends immediately only after its existing explicit confirmation.

## Confirmed product rules

- Creating or editing a content item only saves a plan; it never sends anything to Make or a social network.
- Each selected social platform has its own enabled schedule and date/time. The same content can therefore appear on different calendar dates for different platforms.
- The calendar filter offers Facebook, Instagram, TikTok, and all platforms. All-platform mode aggregates every enabled platform schedule; one event is shown per content/platform schedule and events within a day are ordered by scheduled time.
- Clicking an empty calendar day opens the existing create-content flow with that day prefilled. Clicking a scheduled event opens its content editor. Dragging one platform event changes only that platform's schedule; a work-only item changes its planned work date.
- Before publication success, all platform events share the content's production color: not started is red; in production or finalized/waiting to publish is yellow. Only the platform with a real success receipt or authenticated Make success callback turns green. Other platform events keep the shared pre-publication color, even if a sibling has already posted.
- A single explicit action on a finalized content item sends its eligible, enabled platform schedules to Make. Already queued or published platforms are not submitted again. Partial success is retained per platform, and a retry targets only failed platforms.
- Finalized means all Action Plan process steps are done (an item with no steps is complete), `productionStatus` is `ready`, and local approval is `approved`. Required media must be remotely available, caption must be non-empty, each enabled platform must be supported by the content format, and each schedule must be in the future before it is eligible for Make.
- Copy/repeat controls belong in the content detail/editor flow, not as extra buttons on calendar cards. Copy count is the number of new copies, excluding the source, from 1 to 365. Supported cadence is every day (advance one day), every other day (advance two days), or Monday–Friday (skip Saturday and Sunday). The source planned-work date is the recurrence anchor; if it is unset, use the earliest enabled platform date, and if neither exists ask for a start date. Show the generated dates before the user confirms.
- A repeated copy is a new, independently editable work item. It carries the source's content details, media references, caption, and selected platform schedule pattern, shifted to the generated date while preserving each platform's time and relative day offset. It resets production steps to `todo`, production to `waiting-shoot`, local approval to pending, LINE review history, and all publication attempts/receipts. Creating copies never queues or posts them.
- Date/time entry and display use Asia/Bangkok. Persist new schedule instants with an explicit UTC offset; existing records with timezone-less schedule strings remain readable as Asia/Bangkok wall time.

## Recommended architecture

Keep `DashboardState` and its `ContentItem.schedules` as the canonical source of truth. The calendar selector projects schedule events (content ID + platform + scheduled instant) instead of placing the whole content object on every matching date. A platform filter is applied to that projection, then events are sorted by scheduled instant. An item without any enabled platform schedule remains visible once on its planned work date or in the unscheduled area.

Extend the existing content create/edit flow to persist independently enabled `PlatformSchedule` values. A day-cell create action passes its date into the form and initializes selected platform dates from that date; users may then change each platform date/time independently. Keep legacy work-date metadata separate from publication dates, and preserve current records and adapters without a destructive schema reset.

Reuse the existing publication-attempt model and `POST /api/make/publications` boundary, extending the payload with the finalized content's caption and server-authorized, remotely retrievable media details needed by the configured Make scenario. Create one idempotent attempt per platform. Make acceptance means `queued`, not `published`. Add `POST /api/make/publications/result`, authenticated with the configured Make bearer credential, to accept `{ attemptId, status, providerPublicationId?, receiptUrl?, errorCode? }`; only a validated success receipt changes that platform to green. The callback updates the canonical dashboard snapshot with optimistic-version protection and is idempotent. Retries and duplicate clicks must not create duplicate posts. The configured Make scenario must ingest/download expiring media URLs while valid or otherwise retain media durably before the scheduled post time.

The existing Make workspace remains the place to inspect queue state and errors. The content editor exposes the send-to-Make action only once the item is finalized and eligible. If one platform is rejected, show that platform's error without rolling back accepted sibling schedules.

## Validation and failure behavior

- Reject an enabled schedule with a missing/invalid date or time, a past time, or an unsupported platform for the selected format.
- Do not submit if a content process step is incomplete, `productionStatus` is not `ready`, local approval is not approved, caption/media availability is missing, a target platform is unsupported, or Make configuration is missing. Explain the blocker without losing the user's saved work.
- Validate the platform, content ID, attempt ID, and timestamp on the server. Keep Make secrets server-side. Authenticate Make result callbacks and make duplicate/out-of-order callbacks idempotent.
- A Make webhook timeout or rejection is a failed/uncertain attempt, never a published state. Preserve queued or published results for other platforms and provide a safe retry path.
- A user edit to caption, media, platform, or scheduled time invalidates approval as required by existing approval rules and must not silently alter an already queued attempt. Require an explicit cancel/reschedule or new attempt path for schedules already accepted by Make.
- Do not claim end-to-end social publishing is connected merely because the local schedule was saved or Make accepted a queue request. Show published only from a verified success callback/receipt.

## Scope boundaries

- No automatic Make submission on save, on reaching Final, or merely when a scheduled time arrives. The administrator explicitly presses the send-to-Make action after Final.
- No direct Facebook, Instagram, or TikTok API integration in the browser. Make performs the configured platform-side scheduling/publication.
- This code change does not create or authorize a Make scenario or grant social-account permissions. Real publishing depends on `MAKE_PUBLICATION_WEBHOOK_URL` and `MAKE_API_TOKEN`, the Make scenario's channel modules and durable scheduling behavior, and a configured callback to `POST /api/make/publications/result`. Missing configuration must remain visible and must not be reported as success; the Make integration health check must verify both required settings.
- Do not change the existing immediate LINE send flow or its one-recipient behavior.

## Acceptance criteria

1. A new content item can enable any subset of Facebook, Instagram, and TikTok and save a distinct date/time for each.
2. On a day containing multiple events, the calendar shows the correct platform and time in ascending order. The all-platform filter aggregates all three, and each individual filter excludes the other two.
3. Clicking an empty date opens create with that date prefilled; saving places each enabled platform event on its own selected date. Moving one event changes only its platform schedule.
4. A finalized item can create a configurable number of daily, alternate-day, or weekday copies after previewing dates. Copies are independent and have no inherited approval, LINE review, or publication history.
5. Before Final, no send-to-Make action is offered. After Final, eligible enabled schedules can be queued with their platform, scheduled time, caption, and authorized media details.
6. Repeated submission is idempotent. Queue acceptance is visibly distinct from publication success; a verified callback turns only the successful platform event green, and a failure can be retried without resubmitting successful platforms.
7. Existing date-only LINE composer behavior and existing saved content remain unchanged.
8. Tests cover selector projection/filter/order, timezone and legacy dates, create/edit validation, empty-cell date prefill, single-platform drag, repeat date generation and state reset, finalization gates, Make payload/partial failure/idempotency/callback authentication, and LINE-flow non-regression.
