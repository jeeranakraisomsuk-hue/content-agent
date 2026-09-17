# Dashboard to LINE OA Single-Recipient Delivery — Design

## Goal

Allow an authenticated dashboard user to send one uploaded asset and its caption to the private chat between the LINE Official Account and คุณพลิก. The send button is enabled only when both the asset and caption are ready.

## Confirmed product rules

- The LINE OA currently has one intended friend and recipient: คุณพลิก.
- Delivery is manual. Uploading never sends automatically.
- The existing **ส่งเข้า LINE OA** button is enabled only when an asset and a non-empty caption are both present.
- Images and supported MP4 videos appear directly in LINE.
- Other file types appear as a caption plus a short-lived secure download link.
- A repeated click or network retry must not create duplicate LINE messages.
- This milestone ends when LINE accepts and records the delivery. Approval, rejection, Make, and social publishing remain separate follow-up milestones.

## Recommended architecture

Use LINE Messaging API push messages addressed to one stored LINE user ID. Do not use broadcast even while the OA has only one friend: broadcast would silently deliver to every future friend.

Pair the recipient once through a signed webhook flow. The dashboard generates a short-lived, one-time pairing code. คุณพลิก sends `เชื่อมต่อ <code>` to the OA. After verifying `x-line-signature`, the server stores the event's `source.userId` as the single active recipient. Replacing or removing that recipient requires an authenticated dashboard action and a new code.

The dashboard server owns all LINE calls. The browser never receives the channel access token, channel secret, LINE user ID, or raw storage credentials.

## Components

### Connection service

- Reports `not_connected | pairing | connected | disabled` without returning secret values or the raw LINE user ID.
- Creates a hashed one-time pairing code with a 10-minute expiry.
- Accepts a valid signed LINE message event and atomically claims the unused code.
- Stores the display name and a masked recipient reference for dashboard confirmation.

### Submission service

- Validates asset readiness, non-empty caption, active LINE connection, file type, size, and preview availability.
- Creates an immutable delivery snapshot containing the asset reference, caption, media metadata, and content revision.
- Uses a stable idempotency key for each snapshot.
- Calls the LINE client once and records `queued | sent | failed` plus a sanitized error category.

### Media delivery service

- Keeps original files private.
- Issues an opaque, short-lived HTTPS URL for exactly one stored object.
- Generates or verifies a JPEG/PNG preview for video.
- Streams content with the correct content type and prevents folder listing.
- Allows LINE enough time to fetch the asset, while document links shown to the user can expire sooner and be regenerated from the dashboard.

### LINE client

- Sends a one-to-one push message to the paired recipient.
- Uses an image message for JPEG/PNG up to 10 MB.
- Uses a video message for MP4 up to 200 MB plus a JPEG/PNG preview up to 1 MB.
- Uses a text or Flex message with a secure download action for all other allowed files.
- Sends the full caption as a separate text message when necessary.
- Adds `X-Line-Retry-Key` so safe retries do not duplicate a delivery.

## Data model

### `line_connections`

- `id`, fixed logical key `primary`
- `status`
- encrypted `line_user_id`
- `display_name`, `paired_at`, `disabled_at`
- `pairing_code_hash`, `pairing_expires_at`, `pairing_used_at`
- `created_by`, `updated_by`, timestamps

Only one active `primary` row is permitted.

### `line_deliveries`

- `id`, `content_id`, `content_revision`
- `asset_id`, `asset_type`, `asset_size`, `caption_snapshot`
- `idempotency_key`, unique
- `status`: `queued | sent | failed`
- `line_request_id` when available
- `error_category`, `attempt_count`, `sent_at`, timestamps

Do not store channel tokens, signed asset URLs, raw provider responses, or sensitive headers in these tables.

## End-to-end flow

1. An administrator opens LINE connection settings and generates a pairing code.
2. คุณพลิก adds the OA as a friend and sends the pairing command.
3. LINE posts the event to the webhook; the server verifies the signature and stores that user's ID as the only recipient.
4. The dashboard shows **เชื่อมต่อแล้ว: คุณพลิก** without exposing the ID.
5. The user uploads an asset and enters a caption. The send button stays disabled until both are ready.
6. Clicking the button posts the content ID and revision to the server. The server reloads authoritative data instead of trusting browser-supplied URLs or captions.
7. The server creates an immutable snapshot and secure media URLs, selects the LINE message type, and sends one push request.
8. The dashboard shows sent, failed, or retryable status and the delivery time.

## Failure handling

- Invalid webhook signatures return 401 and never mutate pairing state.
- Expired, incorrect, reused, or ambiguous pairing codes are rejected.
- A second recipient cannot overwrite the active recipient without an authenticated reset.
- Missing asset, empty caption, unsupported unsafe type, oversized media, or missing preview returns a named 422 error and sends nothing.
- Provider authentication and quota errors are shown as configuration or quota failures without leaking provider response bodies.
- Timeouts and transient 5xx failures are retryable with the same idempotency key.
- A blocked OA or invalid recipient marks the connection unhealthy and requires re-pairing.

## Security boundary

- `LINE_CHANNEL_SECRET` and `LINE_CHANNEL_ACCESS_TOKEN` exist only in deployment secrets.
- Every webhook request is verified against the raw body before JSON parsing.
- Signed asset URLs are opaque, scope to one file, expire, and never expose a storage-folder URL.
- Logs include internal delivery IDs and error categories, not tokens, raw LINE user IDs, captions, or signed URLs.
- Dashboard connection and send endpoints require the existing authenticated administrator session.

## Acceptance criteria

1. The OA can pair only one intended recipient through a valid one-time code and signed webhook.
2. The send button is disabled when either the asset or caption is missing.
3. A valid image and caption produce one direct LINE image message and caption.
4. A valid MP4 and caption produce one playable LINE video message, preview, and caption.
5. A PDF or other allowed document produces one caption with an expiring download action.
6. Duplicate clicks and retryable network failures create at most one visible LINE delivery per snapshot.
7. Invalid signatures, expired codes, unsupported media, and unauthorized dashboard requests send nothing.
8. Automated tests plus one user-approved, non-sensitive real asset verify the live OA connection.

## References

- LINE Developers: Sending messages — https://developers.line.biz/en/docs/messaging-api/sending-messages/
- LINE Developers: Message types — https://developers.line.biz/en/docs/messaging-api/message-types/
- LINE Developers: Messaging API reference — https://developers.line.biz/en/reference/messaging-api/nojs/
- LINE Developers: Retry failed API requests — https://developers.line.biz/en/docs/messaging-api/retrying-api-request/
