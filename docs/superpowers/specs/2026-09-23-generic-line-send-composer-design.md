# Generic LINE Send Composer — Design

## Goal

Let an administrator create a LINE delivery without opening or selecting a particular work item. The dashboard provides one focused composer for a photo or video, its caption, and a calendar date, then sends the saved content through the existing LINE OA delivery path to the one paired recipient.

The intended destination described by the owner is the one-to-one chat shown as **PRIK GN** under the Official Account **INDY OS Alerts**. A display name is not a delivery identifier; the account that owns that chat must be paired through the existing signed LINE webhook flow before the system can send to it.

## Confirmed product rules

- The action is generic and is not attached to the currently selected task, calendar cell, or task detail drawer.
- The composer has exactly three user-entered fields: (1) upload one photo or video, (2) caption, and (3) posting date. The date input has no time component.
- The posting date is planning metadata for the content calendar. It does not schedule a LINE message. Delivery occurs immediately only after the administrator explicitly confirms **ส่ง LINE ตอนนี้**.
- The message is sent to the one encrypted LINE recipient paired with this OA. The dashboard must not accept a LINE user ID or choose recipients by display name.
- Uploading or saving never sends a message. No broadcast and no multi-recipient delivery are in scope.
- Preserve the current dashboard visual language; make only the focused composer and existing task-form changes needed for this flow. Do not redesign unrelated dashboard areas.
- The existing create-work flow remains for planning production work. Its duplicate media-upload and caption controls are removed as previously requested; they are not repurposed as the LINE composer.

## Recommended architecture

Add a global **ส่งงานใน LINE** entry point in the dashboard, separate from **สร้างชิ้นงานใหม่** and available without selecting a task. It opens a compact modal or drawer using the existing dashboard surface and form patterns. The task detail drawer remains about the selected task and is not the entry point for generic LINE delivery.

On submit, the server-backed dashboard creates one canonical content record using existing content defaults and a generated internal title such as `ส่ง LINE · YYYY-MM-DD`. The selected media is uploaded through the existing authenticated media flow and attached to this record; the caption and date are saved with it. Persist the date as the date-only `YYYY-MM-DD` value in the existing planned-work field so calendar selection does not acquire an unintended time or timezone shift. This keeps the item visible in the calendar without requiring additional task details from the user.

After the record is saved, show a concise confirmation preview containing the media, caption, planned date, and paired OA recipient status. The confirmation must state that LINE delivery happens immediately; the date is only for planning. On explicit confirmation, call the existing authenticated `POST /api/line/send` with the saved `contentId` and `expectedUpdatedAt`. The server remains authoritative for media, caption, revision, and paired recipient, and continues to persist the delivery audit record. A stable content ID/revision is reused on retry so a duplicate click or uncertain network result cannot silently create a second delivery.

## User flow

1. From the dashboard, the administrator opens **ส่งงานใน LINE** without selecting a work item.
2. They enter a photo/video, caption, and date only. There is no time picker and no task-specific form field.
3. The app validates the file against the configured upload provider and LINE-compatible media requirements. A video must have a valid image preview. Upload or validation failure prevents sending and preserves a safe, actionable error.
4. The app saves a canonical content record and shows a confirmation that names the OA/paired-recipient status and says the send is immediate.
5. The administrator explicitly confirms. The server reloads the saved record and the single paired recipient, then makes the push request.
6. The UI reports success only after LINE accepts the request. It shows a safe failure state otherwise; the saved content remains available for inspection, and uncertain delivery is not automatically retried with a new revision.

## Data and service boundaries

- Reuse the existing dashboard content store and date-only calendar model; do not add a separate transient-only draft store for LINE submissions.
- Reuse the authenticated media upload/provider flow and attach its durable asset metadata to the content record. Do not expose Drive credentials, LINE secrets, raw user IDs, or signed media URLs to the browser.
- Reuse `POST /api/line/send` and the server-side delivery service. Browser input contains only the persisted content ID and expected revision, not message payloads, storage URLs, or recipient IDs.
- Keep the existing one-recipient pairing as the recipient authority. Pairing must happen from the intended LINE account by sending the one-time code to **INDY OS Alerts** in the target chat. If the active paired account is not the intended account, require the authenticated reset/re-pair flow before sending.
- Keep the LINE delivery record as the source for sent/failed status and safe error category. Never show success before provider acceptance.

## Validation and failure behavior

- Require a supported image or MP4, a non-empty caption, and a valid date-only value before enabling the send flow.
- If the upload provider is not configured, the paired LINE recipient is missing, or LINE credentials are unavailable, block delivery with a safe setup message and do not claim that the item was sent.
- Reject unsupported or oversized files and videos without a valid preview before calling LINE.
- Disable the confirmation action while a request is pending. For a timeout or other uncertain result, display the recorded delivery state and do not create a fresh content revision or send a second message automatically.
- Continue to sanitize provider errors; never show tokens, raw recipient identifiers, private storage URLs, signed URLs, or raw LINE response bodies.

## Scope exclusions

- No automatic send at the selected date; date-based delivery would require a separately designed durable scheduler and explicit timezone/time behavior.
- No recipient picker, broadcast, group-chat delivery, review/approval workflow, social publishing, or changes to unrelated dashboard navigation and styling.
- No live send during implementation without a separate explicit confirmation of the actual media, caption, and paired recipient.

## Acceptance criteria

1. A global LINE action opens the composer when no task is selected; it is distinct from creating a production task.
2. The composer exposes exactly the three requested fields and no time control or task-specific data requirement.
3. A saved submission appears as a generic content item on its chosen calendar date.
4. Saving or uploading alone causes no LINE request; explicit confirmation sends immediately, regardless of the planned date.
5. The push targets only the active paired LINE account. A browser-supplied recipient ID or display name cannot alter the target.
6. Valid images and supported MP4 files with previews are delivered with the saved caption; missing or invalid media/caption/date prevents sending.
7. Duplicate clicks/retries for the same content revision do not produce duplicate LINE messages, and status is shown from the persisted delivery result.
8. UI/API tests cover validation, pending state, errors, target isolation, persistence, and the exact send payload. Live verification uses one owner-approved non-sensitive asset and caption only after the intended account has been paired.
