# INDY LINE OA production runbook

This runbook deploys the Next.js app and enables manual delivery of one saved image or MP4 plus its caption to one paired LINE account. Uploading media never sends a message. Keep all credentials in the deployment provider's secret manager; do not paste secrets into chat, source control, tickets, or logs.

## Before deployment

1. Choose a host that runs the Next.js App Router server routes. Set the deployment project's root to `apps/indy-content-studio`; use `pnpm install --frozen-lockfile` and `pnpm build` there. A static export or the legacy worker-only artifact is not sufficient.
2. Create a Neon production database and a separate, empty test branch. Never use the production connection string for integration tests.
3. In the Neon SQL editor, apply [`001_indy_production.sql`](../apps/indy-content-studio/db/migrations/001_indy_production.sql) to each branch before the app uses it. The migration creates the dashboard snapshot, LINE pairing, webhook-deduplication, review, and delivery tables.
4. Create the environment variables from [`apps/indy-content-studio/.env.example`](../apps/indy-content-studio/.env.example). The example intentionally contains names only.

## Configure credentials

- `DATABASE_URL`: Neon Console → Connect. Use the pooled PostgreSQL connection string when offered and preserve `sslmode=require`.
- `LINE_CHANNEL_SECRET` and `LINE_CHANNEL_ACCESS_TOKEN`: LINE Developers Console, from the Messaging API channel linked to the intended Official Account. The channel secret validates webhooks; the access token verifies and pushes messages.
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, and `GOOGLE_DRIVE_FOLDER_ID`: Google Cloud service-account JSON and a folder in a Google Workspace Shared Drive. Enable the Drive API and grant the service account permission to add/edit files. A personal Gmail My Drive is not supported by this service-account setup. Store only the private-key field, not the downloaded JSON file.
- `APP_PUBLIC_BASE_URL`: the final public HTTPS origin, for example `https://studio.example`; no path and no trailing slash.
- `INDY_MEDIA_SIGNING_SECRET`, `INDY_MEDIA_UPLOAD_TOKEN`, `LINE_RECIPIENT_ENCRYPTION_KEY`, and `AUTH_SECRET`: generate four independent random 32-byte base64url values locally. Do not reuse provider credentials. After admin login, the app issues the upload token as a path-scoped `HttpOnly`, `Secure`, `SameSite=Strict` cookie; do not expose it to browser JavaScript.
- `INDY_ADMIN_PASSWORD_HASH`: create a password of at least 12 characters, pass it through stdin to `scripts/hash-admin-password.mjs`, and save only the resulting `scrypt$...` hash. Never put the clear-text password in a command argument or file in the repository.

For Google and LINE account setup, use the provider consoles and official setup guides: [LINE Messaging API setup](https://developers.line.biz/en/docs/messaging-api/getting-started/), [Google Drive Shared Drives](https://developers.google.com/workspace/drive/api/guides/about-shareddrives), and [Neon connection workflow](https://neon.com/docs/get-started-with-neon/workflow-primer).

## Deploy and smoke-check

1. Add all production values to the deployment secret manager, deploy the Next.js server build, and set `APP_PUBLIC_BASE_URL` to the resulting HTTPS origin.
2. Verify `GET /` serves the dashboard and `GET /api/ready` returns `{ "status": "ok" }`. Confirm the deployed build includes `/api/auth/login`, `/api/dashboard-state`, `/api/integrations/health`, `/api/line/pairing`, `/api/line/webhook`, `/api/line/send`, `/api/media/upload`, and `/api/media/provider/[fileId]`.
3. Sign in as the configured admin. In Settings, run the connection check and verify Database, Google Drive, and LINE show connected. The checks expose safe status categories only; they do not validate the recipient pairing.
4. In LINE Developers Console → Messaging API → Webhook settings, set the public webhook URL described below, enable **Use webhook**, and press **Verify**. Confirm the channel secret belongs to this same channel.
5. From the intended recipient's LINE account, add the Official Account as a friend. In the dashboard's Corrections/LINE connection area, create a pairing code. Send `เชื่อมต่อ <pairing-code>` to the OA from that account and refresh status. The app stores the recipient encrypted and displays only a masked value.

### If Vercel Authentication protects the webhook

First test `GET https://<APP_PUBLIC_BASE_URL>/api/ready`. If it redirects to Vercel SSO, LINE's webhook verifier will also be blocked unless the webhook request bypasses deployment protection. Keep dashboard/API authentication enabled; do not disable Vercel Authentication project-wide just to make the webhook work.

Vercel documents **Protection Bypass for Automation** for third-party webhooks that cannot send custom headers. After an authorized Vercel project owner enables/configures that bypass, set the LINE webhook URL to `https://<APP_PUBLIC_BASE_URL>/api/line/webhook?x-vercel-protection-bypass=<VERCEL_AUTOMATION_BYPASS_SECRET>`. Treat the bypass value as a secret: it is present in the LINE webhook configuration URL, must never appear in source control, chat, screenshots, or logs, and should be rotated if exposed. This bypass is project-level, so the app's own admin checks on dashboard mutations remain required. See [Vercel's automation bypass guide](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation).

## Controlled send

While Google Drive is not configured, the media library also accepts a direct public HTTPS URL for a JPEG/PNG or MP4 (with a public HTTPS JPEG poster URL). These external assets are eligible for LINE delivery with the saved caption; they are not uploaded or hosted by INDY. Confirm the link is a direct, publicly fetchable media file and remains valid through the delivery/retry window. Do not use a private Drive sharing page or an expiring URL. Local file uploads still require a configured durable media provider; the current Google Drive upload/proxy path is additionally subject to Vercel Functions' request/response size limit and must not be presented as production-ready for large clips.

Only perform a live send after the owner explicitly approves the specific recipient and content. Start with one non-sensitive JPEG and a short caption. Upload it, save the returned Drive metadata to the content item, then use the dashboard confirmation to send. Confirm the recipient receives exactly one image and one caption. Repeating the same content revision should return the existing delivery record and must not send again. For video, use one short MP4 with its generated JPEG preview and confirm the LINE preview and video both arrive.

Do not send to a raw or manually entered LINE user ID, do not use broadcast, and do not retry an uncertain delivery after its signed media URL window has expired. Delivery errors are categorized as configuration, recipient, quota, media fetch, timeout, or provider; avoid copying tokens, recipient IDs, captions, signed URLs, or raw provider bodies into logs or support messages.

## Automated integration flow

The opt-in test `tests/line-production-flow.test.ts` invokes the real login, dashboard, pairing, webhook, upload, and send route handlers. It uses a disposable Neon branch for persistence and mocks only the Google Drive client and LINE push HTTP boundary. The flow changes the test branch's primary dashboard snapshot, creates pairing/delivery rows, and uses a synthetic recipient. It must never point to production or a branch containing the production recipient.

Apply the migration to a fresh empty test branch first. From `apps/indy-content-studio`, set `LINE_OA_TEST_DATABASE_URL` to that branch's connection string and `LINE_OA_RUN_DATABASE_FLOW=1`, then run:

```powershell
pnpm exec vitest run tests/line-production-flow.test.ts
```

Without both opt-in settings, this one integration test is skipped and does not connect to Neon. Keep the test branch isolated; it accumulates test state and should be discarded/recreated after use.

## Recovery and rotation

- If Settings reports `configuration`, verify that the expected secret name is configured in the deployment; never reveal its value in the UI or logs. `permission`/`not_found` for Drive means check the folder ID and service-account membership; `quota` requires provider-side quota recovery.
- If a LINE token is revoked or rotated, replace it in the deployment secret manager and redeploy/restart, then rerun the health check. If the channel secret changes, update it at the same time so webhook signature verification continues to match.
- If the admin password is lost, generate a new hash locally and replace only `INDY_ADMIN_PASSWORD_HASH`.
- `LINE_RECIPIENT_ENCRYPTION_KEY` protects the stored recipient. Do not rotate it as an ordinary credential update: first arrange an approved re-encryption migration or reset and re-pair the recipient.
- If the connection is wrong, use the authenticated pairing reset/recovery UI, then pair the intended account again. Never edit or copy an unmasked recipient ID by hand.
- If a delivery returns `timeout` or `provider`, inspect the persisted delivery record before retrying. The same content revision is idempotent; do not create a new revision merely to force a retry unless the owner has checked whether the first message arrived.
