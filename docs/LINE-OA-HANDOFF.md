# INDY → LINE OA: Handoff Plan

## Goal

From the INDY dashboard, send one selected image or MP4 plus its authoritative caption to one paired LINE OA user. The delivery must survive restarts, never expose secrets, and never claim success until LINE accepts the push.

## Completed

- Full Next.js application build with `/api/ready`.
- Neon client, migration, versioned `dashboard_snapshots`, and `/api/dashboard-state`.
- Browser dashboard uses the server API rather than IndexedDB as its authority.
- Google Drive service-account client keeps files private, streams signed URLs, cleans up failed video-preview uploads, and can probe Shared Drive access.
- Automated checks previously passed: 61 test files / 169 tests, TypeScript typecheck, production build.

## Known incomplete work

1. Replace in-memory LINE review and recipient state with Neon.
2. Implement one-time recipient pairing through a valid LINE-signed webhook.
3. Encrypt the paired LINE user ID at rest.
4. Build an idempotent server-owned LINE push delivery service.
5. Connect the dashboard button to the real delivery API; remove its current client-side false success.
6. Make health checks perform real Neon, Drive, and LINE-token probes.
7. Deploy the completed Next.js app and perform a controlled live image and MP4 delivery test.

## Required implementation order

### 1. Persistent recipient pairing

- Use migration tables: `line_connections`, `line_pairing_codes`, and `line_webhook_events`.
- Create a 10-minute one-time pairing code. Store only a SHA-256 hash.
- On the public `/api/line/webhook`, verify `x-line-signature` against the raw request body before any database write.
- Accept `เชื่อมต่อ <code>` only from a `source.type === "user"` event.
- Deduplicate `webhookEventId` in Neon.
- Encrypt `source.userId` with AES-256-GCM using `LINE_RECIPIENT_ENCRYPTION_KEY` before storing.
- Do not allow browser-supplied LINE IDs. Return only a masked recipient status.

### 2. Server-owned LINE delivery

- Create `POST /api/line/send` accepting only `{ contentId, expectedUpdatedAt }`.
- Reload state from Neon, select the first ready asset, and reload the paired recipient.
- Build message payloads only on the server:
  - image: signed HTTPS original + preview URL, then caption text if non-empty;
  - MP4: signed MP4 original, signed JPEG preview, then caption text if non-empty.
- Generate short-lived URLs immediately before LINE push.
- Build an idempotency key from content ID, revision, asset ID, and caption digest.
- Insert/read `line_deliveries`; reuse one UUID-formatted `X-Line-Retry-Key`.
- Record `sent` only after LINE responds successfully. Map provider failures to safe categories: `configuration`, `recipient`, `quota`, `media_fetch`, `timeout`, or `provider`.

### 3. Dashboard integration

- Change `app/home-page-view.tsx`: confirmation must call `/api/line/send`.
- Disable duplicate clicks while pending.
- Never locally set `lineDeliveryStatus: "sent"` before the server success response.
- Show server delivery status, sent time, and safe failure category.
- Remove manual recipient fields and client-built LINE messages.

### 4. Health checks

- Neon: parameterized `SELECT 1` with timeout.
- Drive: invoke `probeStorage()` and surface `connected`, `auth`, `folder_not_found`, `storage_permission`, or `quota` safely.
- LINE: require both secret and access token, then call LINE token verification endpoint.

### 5. Deployment and live verification

- Deploy from `apps/indy-content-studio` as a Next.js server-capable application.
- Apply `db/migrations/001_indy_production.sql` to the production Neon branch.
- Set deployment secrets only; never commit them:
  - `DATABASE_URL`
  - `LINE_CHANNEL_SECRET`
  - `LINE_CHANNEL_ACCESS_TOKEN`
  - `GOOGLE_SERVICE_ACCOUNT_EMAIL`
  - `GOOGLE_PRIVATE_KEY`
  - `GOOGLE_DRIVE_FOLDER_ID`
  - `APP_PUBLIC_BASE_URL`
  - `INDY_MEDIA_SIGNING_SECRET`
  - `INDY_MEDIA_UPLOAD_TOKEN`
  - `LINE_RECIPIENT_ENCRYPTION_KEY`
- Google Drive must be a Workspace Shared Drive with the service account given add/edit permission.
- Configure LINE webhook URL as `https://<public-origin>/api/line/webhook` and enable it.
- Pair the intended recipient by adding the OA and sending the issued pairing code.
- Run one owner-approved image delivery and one MP4-with-JPEG-preview delivery. Repeat each request with the same revision and verify no duplicate LINE message.

## Critical files

- `apps/indy-content-studio/app/api/line/webhook/route.ts`
- `apps/indy-content-studio/features/line-oa/server/line-review-store.ts` (must be replaced)
- `apps/indy-content-studio/features/line-oa/server/line-pairing-event.ts`
- `apps/indy-content-studio/features/line-oa/server/line-push-client.ts`
- `apps/indy-content-studio/app/home-page-view.tsx`
- `apps/indy-content-studio/db/migrations/001_indy_production.sql`
- `apps/indy-content-studio/features/data/server/neon-dashboard-repository.ts`
- `apps/indy-content-studio/features/media/server/google-drive-media-client.ts`

## Guardrails

- Manual send only; uploads never auto-send.
- One paired recipient only; never call LINE broadcast.
- Never log secrets, raw recipient IDs, captions, database URLs, or signed media URLs.
- Do not make Drive files or folders public.
- Use parameterized SQL exclusively.
