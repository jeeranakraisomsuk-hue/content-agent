# LINE OA Production Activation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing INDY dashboard reliably send one stored image or MP4 plus its caption to one paired LINE OA user, persist state in Neon, and deploy the real Next.js application instead of the signature-test worker.

**Architecture:** Keep the existing Next.js App Router application as the only production application. Persist the existing `DashboardState` snapshot plus LINE connection, pairing, webhook-deduplication, and delivery records in Neon. Store media in a Google Workspace Shared Drive, stream it through short-lived signed application URLs, and call LINE only from authenticated server routes.

**Tech Stack:** Next.js 15, React 19, TypeScript, Neon PostgreSQL via `@neondatabase/serverless`, Google Drive API with service-account JWT, LINE Messaging API, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-17-dashboard-to-line-oa-single-recipient-design.md`

## Global Constraints

- This plan replaces the worker-only production artifact; production must run the full Next.js application and all App Router API routes.
- Manual send only. Uploading a file never sends it to LINE automatically.
- Push to one paired LINE user ID. Never use LINE broadcast.
- The browser submits IDs and expected revisions only; it never supplies authoritative captions, recipient IDs, media URLs, or LINE message payloads.
- Store secrets only in deployment secret settings. Never commit `.env`, downloaded Google JSON keys, LINE tokens, or Neon connection strings.
- Google Drive service-account mode requires a Google Workspace Shared Drive. A personal `@gmail.com` My Drive is not compatible with this mode because service accounts have no storage quota and cannot own files.
- Images must be HTTPS-accessible JPEG/PNG. Videos must be MP4 with a JPEG preview. Media URLs must be signed and short-lived.
- Every delivery snapshot is idempotent. Duplicate clicks and retries must produce at most one visible LINE delivery.
- Do not log captions, raw LINE user IDs, access tokens, private keys, database URLs, or signed media URLs.

## Review Focus

- A deployment that serves the dashboard but omits App Router API routes must fail the smoke test before release.
- A Google service account that can authenticate but cannot write to the selected Shared Drive must report `storage_permission`, not generic success.
- Two simultaneous sends of the same content revision must reuse one delivery and one LINE retry key.
- A LINE webhook with a valid body but invalid signature must make no database changes.
- A video whose original upload succeeds but preview upload fails must clean up the original and remain unsendable.

---

## Owner Setup Checklist: Where Every Key Comes From

Complete this section before Luna runs the live integration tasks. Luna must never ask you to paste secret values into chat or commit them to Git.

### A. LINE Official Account

1. Open [LINE Official Account Manager](https://manager.line.biz/) and confirm the intended OA exists and Messaging API is enabled.
2. Open [LINE Developers Console](https://developers.line.biz/console/), select the provider, then select the Messaging API channel linked to that OA.
3. Open **Basic settings** and copy **Channel secret** into deployment secret `LINE_CHANNEL_SECRET`.
4. Open **Messaging API** and issue/copy a channel access token into `LINE_CHANNEL_ACCESS_TOKEN`.
5. In **Messaging API → Webhook settings**, set the final URL to `https://<APP_PUBLIC_BASE_URL>/api/line/webhook`, enable **Use webhook**, then press **Verify** after deployment.
6. Add the OA as a friend from the intended recipient's LINE account. Do not manually copy a LINE user ID; the pairing flow implemented below captures it from the signed webhook.

Official references: [Get started with Messaging API](https://developers.line.biz/en/docs/messaging-api/getting-started/), [Channel access tokens](https://developers.line.biz/en/docs/basics/channel-access-token/), and [Messaging API reference](https://developers.line.biz/en/reference/messaging-api/).

### B. Google Cloud and Google Drive

1. Confirm you have a paid Google Workspace edition with Shared Drives. If you only have personal Gmail, stop here and tell Luna to replace Task 4 with human-user OAuth or object storage.
2. Open [Google Cloud project selector](https://console.cloud.google.com/projectselector2/home/dashboard) and create or select one project for INDY.
3. Open [Google Drive API](https://console.cloud.google.com/apis/library/drive.googleapis.com) and click **Enable**.
4. Open [Service Accounts](https://console.cloud.google.com/iam-admin/serviceaccounts), create a service account such as `indy-drive-media`, and copy its email into `GOOGLE_SERVICE_ACCOUNT_EMAIL`.
5. Open that service account → **Keys** → **Add key** → **Create new key** → **JSON**. Download once. Copy only the JSON field `private_key` into `GOOGLE_PRIVATE_KEY`. Preserve the `BEGIN PRIVATE KEY`, line breaks, and `END PRIVATE KEY` content. Delete the downloaded JSON from ordinary Downloads after the deployment secret is saved securely.
6. Open [Google Drive Shared Drives](https://drive.google.com/drive/shared-drives), create/open the intended Shared Drive, create a folder such as `INDY Media`, and add the service-account email as a member with permission to add and edit files.
7. Open the folder. From `https://drive.google.com/drive/folders/<FOLDER_ID>`, copy only `<FOLDER_ID>` into `GOOGLE_DRIVE_FOLDER_ID`.

Official references: [Enable Drive API](https://developers.google.com/workspace/drive/api/guides/enable-sdk), [create a service account and credentials](https://developers.google.com/identity/protocols/oauth2/service-account), [create/delete service-account keys](https://docs.cloud.google.com/iam/docs/keys-create-delete), [Shared Drive requirements](https://developers.google.com/workspace/drive/api/guides/about-shareddrives), and [Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).

### C. Neon PostgreSQL

1. Open [Neon Console](https://console.neon.tech/), open the existing project and production branch.
2. Click **Connect**, select the production database/role, enable the pooled connection if offered, and copy the full PostgreSQL connection string into `DATABASE_URL`.
3. The value must retain `sslmode=require`. Do not store a Neon API key in the app; the application needs only `DATABASE_URL`.
4. Create a separate Neon branch/connection string for local or automated tests. Never run destructive migration tests against production.

Official reference: [Neon connection workflow](https://neon.com/docs/get-started-with-neon/workflow-primer).

### D. Secrets Generated by the Owner

Run this command separately for each secret and save each output directly into deployment settings:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Generate distinct values for:

- `INDY_MEDIA_SIGNING_SECRET`: signs temporary media URLs.
- `INDY_MEDIA_UPLOAD_TOKEN`: authorizes media uploads until full multi-user authentication exists.
- `LINE_RECIPIENT_ENCRYPTION_KEY`: encrypts the stored LINE user ID.
- `AUTH_SECRET`: signs the single-admin session cookie.

Do not reuse a LINE token, Neon password, or Google private key for any of these values.

### E. Values Obtained from the Deployment

- `APP_PUBLIC_BASE_URL`: the final public HTTPS origin, for example `https://example.com`; no trailing path.
- `INDY_ADMIN_PASSWORD_HASH`: Luna creates the hash-generation script in Task 3. Store only the resulting hash, never the clear-text password.

### Final Environment Matrix

| Environment variable | Source | Required for |
|---|---|---|
| `DATABASE_URL` | Neon Console → Connect | Server persistence |
| `LINE_CHANNEL_SECRET` | LINE Developers → Basic settings | Webhook signature verification |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Developers → Messaging API | Push messages |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Google service-account JSON `client_email` | Drive authentication |
| `GOOGLE_PRIVATE_KEY` | Google service-account JSON `private_key` | Drive authentication |
| `GOOGLE_DRIVE_FOLDER_ID` | Shared Drive folder URL | Upload destination |
| `APP_PUBLIC_BASE_URL` | Production deployment URL | Absolute LINE media URLs and origin checks |
| `INDY_MEDIA_SIGNING_SECRET` | Locally generated random value | Signed download URLs |
| `INDY_MEDIA_UPLOAD_TOKEN` | Locally generated random value | Upload authorization |
| `LINE_RECIPIENT_ENCRYPTION_KEY` | Locally generated random value | Encrypted recipient ID |
| `AUTH_SECRET` | Locally generated random value | Admin session cookie |
| `INDY_ADMIN_PASSWORD_HASH` | Task 3 generation script | Admin login |

---

### Task 1: Replace the Worker-Only Deployment with the Full Next.js App

**Files:**
- Modify: `package.json`
- Modify: `scripts/build-site.mjs`
- Modify: `apps/indy-content-studio/package.json`
- Modify or replace: `worker.js`
- Create: `apps/indy-content-studio/app/api/ready/route.ts`
- Test: `apps/indy-content-studio/tests/deployment-contract.test.ts`

**Interfaces:**
- Consumes: deployment platform build/start contract.
- Produces: a production origin that serves `/`, `/api/ready`, `/api/line/webhook`, `/api/line/send`, `/api/media/upload`, and `/api/media/provider/[fileId]` from one Next.js deployment.

- [ ] **Step 1: Write a failing deployment-contract test**

  Assert the root build no longer copies only `worker.js`, and assert `GET /api/ready` returns `{ status: "ok" }`.

- [ ] **Step 2: Run the focused test**

  Run: `pnpm --dir apps/indy-content-studio vitest run tests/deployment-contract.test.ts`

  Expected: FAIL because the current root artifact contains only `.openai/hosting.json` and `server/index.js` copied from the webhook test worker.

- [ ] **Step 3: Configure a Next-capable production deployment**

  Set the deployment project root to `apps/indy-content-studio`, install with `pnpm install --frozen-lockfile`, build with `pnpm build`, and run the platform's supported Next.js server output. If the current host cannot run Next.js App Router server routes, create a Next-capable deployment rather than emulating the dashboard in `worker.js`.

- [ ] **Step 4: Add the readiness route**

  ```ts
  export async function GET(): Promise<Response> {
    return Response.json({ status: "ok" });
  }
  ```

- [ ] **Step 5: Verify the artifact and commit**

  Run: `pnpm --dir apps/indy-content-studio test && pnpm --dir apps/indy-content-studio typecheck && pnpm --dir apps/indy-content-studio build`

  Commit: `fix: deploy the full INDY Next application`

### Task 2: Persist Dashboard and LINE State in Neon

**Files:**
- Modify: `apps/indy-content-studio/package.json`
- Create: `apps/indy-content-studio/db/migrations/001_indy_production.sql`
- Create: `apps/indy-content-studio/features/data/server/neon-client.ts`
- Create: `apps/indy-content-studio/features/data/server/neon-dashboard-repository.ts`
- Create: `apps/indy-content-studio/app/api/dashboard-state/route.ts`
- Create: `apps/indy-content-studio/features/data/api-dashboard-repository.ts`
- Modify: `apps/indy-content-studio/features/data/DashboardDataProvider.tsx`
- Test: `apps/indy-content-studio/tests/neon-dashboard-repository.test.ts`

**Interfaces:**
- Produces: `loadDashboardState(): Promise<DashboardState>` and `saveDashboardState(state, expectedVersion): Promise<{ version: number }>`.
- Consumes: `DATABASE_URL` and the existing `DashboardRepository` contract.

- [ ] **Step 1: Add `@neondatabase/serverless` and write failing repository tests**

  Test initialization, versioned updates, stale-write rejection, reload persistence, invalid schema rejection, and absent `DATABASE_URL`.

- [ ] **Step 2: Add the migration**

  ```sql
  create table dashboard_snapshots (
    workspace_key text primary key,
    version bigint not null default 1,
    state jsonb not null,
    updated_at timestamptz not null default now()
  );

  create table line_connections (
    connection_key text primary key check (connection_key = 'primary'),
    status text not null check (status in ('not_connected','pairing','connected','disabled')),
    encrypted_user_id text,
    display_name text,
    paired_at timestamptz,
    updated_at timestamptz not null default now()
  );

  create table line_pairing_codes (
    id uuid primary key,
    code_hash text not null unique,
    expires_at timestamptz not null,
    used_at timestamptz,
    created_at timestamptz not null default now()
  );

  create table line_webhook_events (
    webhook_event_id text primary key,
    received_at timestamptz not null default now()
  );

  create table line_deliveries (
    id uuid primary key,
    idempotency_key text not null unique,
    content_id text not null,
    content_revision text not null,
    asset_id text not null,
    caption_snapshot text not null,
    status text not null check (status in ('queued','sent','failed')),
    attempt_count integer not null default 0,
    error_category text,
    sent_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  ```

- [ ] **Step 3: Implement Neon persistence and optimistic concurrency**

  Never interpolate SQL values. Use parameterized calls. Validate loaded JSON with the existing backup/domain validation before returning it.

- [ ] **Step 4: Replace browser-only IndexedDB as the production source of truth**

  `ApiDashboardRepository` calls `/api/dashboard-state`. IndexedDB may remain only as a temporary offline cache, never as the server-authoritative source used for LINE delivery.

- [ ] **Step 5: Run tests and commit**

  Commit: `feat: persist INDY state and LINE deliveries in Neon`

### Task 3: Add a Single-Admin Auth Boundary

**Files:**
- Create: `apps/indy-content-studio/scripts/hash-admin-password.mjs`
- Create: `apps/indy-content-studio/features/auth/server/admin-session.ts`
- Create: `apps/indy-content-studio/app/api/auth/login/route.ts`
- Create: `apps/indy-content-studio/app/api/auth/logout/route.ts`
- Create: `apps/indy-content-studio/app/login/page.tsx`
- Create: `apps/indy-content-studio/middleware.ts`
- Test: `apps/indy-content-studio/tests/admin-auth.test.ts`

**Interfaces:**
- Produces: `requireAdmin(request): Promise<{ actorId: "primary-admin" }>` and an HTTP-only signed session cookie.
- Consumes: `AUTH_SECRET` and `INDY_ADMIN_PASSWORD_HASH`.

- [ ] **Step 1: Write failing tests**

  Cover correct login, wrong password, tampered/expired cookie, logout, protected mutation routes, and preservation of public `/api/line/webhook` and signed media GET access.

- [ ] **Step 2: Implement password hashing and session signing with Node crypto**

  Use `scrypt` for the stored password hash and HMAC-SHA-256 for an HTTP-only, `Secure`, `SameSite=Lax` cookie. Never place the admin password or auth secret in client JavaScript.

- [ ] **Step 3: Protect dashboard state mutations, upload, pairing, and send routes**

  Keep the LINE webhook public but signature-verified. Keep media delivery public only when its scoped signature is valid.

- [ ] **Step 4: Run tests and commit**

  Commit: `feat: protect INDY with a single-admin session`

### Task 4: Make Google Drive Storage Production-Safe

**Files:**
- Modify: `apps/indy-content-studio/features/media/server/google-drive-media-client.ts`
- Modify: `apps/indy-content-studio/features/media/server/media-upload-handler.ts`
- Modify: `apps/indy-content-studio/features/media/server/media-provider-handler.ts`
- Modify: `apps/indy-content-studio/app/api/media/upload/route.ts`
- Test: `apps/indy-content-studio/tests/media-upload-route.test.ts`
- Create: `apps/indy-content-studio/tests/google-drive-live-contract.test.ts`

**Interfaces:**
- Produces: private Drive uploads, cleanup, byte-range streaming, and a configuration probe.
- Consumes: Google service-account variables, Shared Drive folder ID, admin session, and signed delivery URLs.

- [ ] **Step 1: Add failing tests for Shared Drive permission and uploads above 5 MB**

  The current multipart path is retained only for files at or below 5 MB. Larger allowed files must use resumable upload.

- [ ] **Step 2: Add a Drive configuration probe**

  Authenticate, request the target folder metadata, and confirm the service account can add files. Return safe categories: `auth`, `folder_not_found`, `storage_permission`, `quota`, or `connected`.

- [ ] **Step 3: Implement resumable upload and cleanup**

  Preserve `supportsAllDrives=true`. If preview upload fails, delete the original. Do not make Drive files or folders public.

- [ ] **Step 4: Verify signed streaming**

  Confirm `Content-Type`, `Content-Length`, `Accept-Ranges`, `Content-Range`, expiry, tamper rejection, and Google error sanitization.

- [ ] **Step 5: Run tests and commit**

  Commit: `feat: harden Google Drive media storage`

### Task 5: Persist One Recipient Through the Signed LINE Webhook

**Files:**
- Modify: `apps/indy-content-studio/app/api/line/webhook/route.ts`
- Modify: `apps/indy-content-studio/features/line-oa/server/line-pairing-event.ts`
- Replace: `apps/indy-content-studio/features/line-oa/server/line-review-store.ts`
- Create: `apps/indy-content-studio/features/line-oa/server/line-connection-repository.ts`
- Create: `apps/indy-content-studio/features/line-oa/server/line-user-encryption.ts`
- Create: `apps/indy-content-studio/app/api/line/pairing/route.ts`
- Test: `apps/indy-content-studio/tests/line-pairing-persistence.test.ts`

**Interfaces:**
- Produces: `createPairingCode()`, `claimPairingCode()`, `getActiveRecipient()`, and webhook-event deduplication.
- Consumes: verified raw webhook body, Neon, `LINE_CHANNEL_SECRET`, and `LINE_RECIPIENT_ENCRYPTION_KEY`.

- [ ] **Step 1: Write failing tests**

  Cover invalid signature, expired/reused code, missing user ID, duplicate webhook event, concurrent claim, and refusal to replace an active recipient without an authenticated reset.

- [ ] **Step 2: Implement one-time pairing**

  Store only a SHA-256 pairing-code hash with a ten-minute expiry. Encrypt `source.userId` with AES-256-GCM before storing it. Return only a masked connection description to the browser.

- [ ] **Step 3: Replace the in-memory `Map`**

  All review and webhook state needed across requests must use Neon transactions and uniqueness constraints.

- [ ] **Step 4: Run tests and commit**

  Commit: `feat: persist the paired LINE recipient`

### Task 6: Build Server-Owned LINE Messages and Push Delivery

**Files:**
- Modify: `apps/indy-content-studio/features/line-oa/server/line-message-builder.ts`
- Modify: `apps/indy-content-studio/features/line-oa/server/line-push-client.ts`
- Create: `apps/indy-content-studio/features/line-oa/server/line-delivery-service.ts`
- Create: `apps/indy-content-studio/app/api/line/send/route.ts`
- Test: `apps/indy-content-studio/tests/line-delivery-service.test.ts`

**Interfaces:**
- Produces: `sendContentToLine({ contentId, expectedUpdatedAt, actorId }): Promise<DeliveryView>`.
- Consumes: authoritative Neon state, paired recipient, Google provider IDs, signed media URLs, and `LINE_CHANNEL_ACCESS_TOKEN`.

- [ ] **Step 1: Write failing orchestration tests**

  Cover image plus caption, MP4 plus JPEG preview plus caption, blank caption, missing/unready asset, invalid recipient, provider 401/403/429/5xx, timeout, duplicate click, and concurrent duplicate requests.

- [ ] **Step 2: Make the request body minimal**

  ```ts
  type SendLineRequest = {
    contentId: string;
    expectedUpdatedAt: string;
  };
  ```

  Reject browser-supplied recipient IDs, message arrays, captions, and media URLs.

- [ ] **Step 3: Build messages from authoritative data**

  Reload the content and first ready media asset from Neon. Generate short-lived URLs immediately before calling LINE. For an image use the same signed file for original and preview; for MP4 use the stored JPEG poster.

- [ ] **Step 4: Add idempotency**

  Derive a stable idempotency key from content ID, content timestamp/revision, asset ID, and caption digest. Insert-or-read one `line_deliveries` row and use the same UUID-formatted `X-Line-Retry-Key` on retries.

- [ ] **Step 5: Map safe errors and record state**

  Record `sent` only after LINE success. Map errors to `configuration`, `recipient`, `quota`, `media_fetch`, `timeout`, or `provider` without returning raw provider bodies.

- [ ] **Step 6: Run tests and commit**

  Commit: `feat: send authoritative media and captions to LINE`

### Task 7: Connect the Real Dashboard Button and Remove False Success

**Files:**
- Modify: `apps/indy-content-studio/app/home-page-view.tsx`
- Modify: `apps/indy-content-studio/features/dashboard/components/LineSendConfirmation.tsx`
- Modify: `apps/indy-content-studio/features/line-oa/components/CorrectionsWorkspace.tsx`
- Modify: `apps/indy-content-studio/features/content/send-eligibility.ts`
- Test: `apps/indy-content-studio/tests/line-send-confirmation.test.tsx`
- Test: `apps/indy-content-studio/tests/corrections-workspace.test.tsx`

**Interfaces:**
- Consumes: `/api/line/send`, `/api/line/pairing`, and safe connection/delivery status.
- Produces: honest pending, sent, failed, and retry UI.

- [ ] **Step 1: Write a regression test for the current false-success path**

  Clicking confirm must call `/api/line/send`; it must not set `lineDeliveryStatus: "sent"` locally before a successful response.

- [ ] **Step 2: Send only content ID and expected timestamp**

  Lock duplicate clicks while pending. Display the server delivery ID and sent timestamp after success. Show the safe error category after failure.

- [ ] **Step 3: Remove manual `Uxxxxxxxx` entry and client-built message arrays**

  Replace them with pairing status and the server-owned delivery endpoint.

- [ ] **Step 4: Tighten send eligibility**

  Require a non-empty caption, one remote-ready asset, an MP4 preview when needed, authenticated admin, connected LINE recipient, and no current send.

- [ ] **Step 5: Run tests and commit**

  Commit: `fix: connect the dashboard to real LINE delivery`

### Task 8: Replace Presence-Only Health Checks with Real Probes

**Files:**
- Modify: `apps/indy-content-studio/features/integrations/server/integration-health.ts`
- Modify: `apps/indy-content-studio/app/api/integrations/health/route.ts`
- Test: `apps/indy-content-studio/tests/integration-health-route.test.ts`

**Interfaces:**
- Produces safe statuses for `database`, `google-drive`, and `line`.
- Consumes provider credentials without returning them.

- [ ] **Step 1: Write failing probe tests**

  LINE requires both channel secret and access token and verifies the token through LINE's verify endpoint. Drive verifies target-folder access. Neon performs `select 1`.

- [ ] **Step 2: Implement timeout-bounded, sanitized probes**

  Cache successful probes briefly to avoid checking external providers on every render. Return only `connected`, `disconnected`, or `error` plus a safe category.

- [ ] **Step 3: Run tests and commit**

  Commit: `fix: report real integration health`

### Task 9: End-to-End and Controlled Live Verification

**Files:**
- Create: `apps/indy-content-studio/tests/line-production-flow.test.ts`
- Create: `docs/line-oa-production-runbook.md`
- Create: `apps/indy-content-studio/.env.example`

**Interfaces:**
- Consumes: all completed tasks.
- Produces: repeatable deployment, pairing, sending, rotation, and recovery instructions.

- [ ] **Step 1: Add an application-level integration test**

  Exercise login → Neon state save → pairing webhook → image upload metadata → send → duplicate retry using real routes and a test database branch. Mock only Google and LINE external HTTP boundaries.

- [ ] **Step 2: Add `.env.example` with names only**

  Include every variable in the Environment Matrix with empty values and comments pointing to the owner setup section. Never include examples shaped like real tokens or keys.

- [ ] **Step 3: Run the complete automated gate**

  ```powershell
  pnpm test
  pnpm typecheck
  pnpm build
  ```

  Expected: all tests pass, production build succeeds, and no test output contains a secret value.

- [ ] **Step 4: Deploy and run public smoke checks**

  Verify `/`, `/api/ready`, admin login, Neon probe, Drive probe, and LINE token probe. Configure the final LINE webhook URL and press LINE's **Verify** button.

- [ ] **Step 5: Perform one owner-approved live send**

  Pair the intended LINE account, upload one non-sensitive JPEG, enter a short caption, and send once. Confirm exactly one image and one caption arrive. Repeat the button/request with the same revision and confirm no duplicate appears. Repeat with a short MP4 and its generated JPEG preview.

- [ ] **Step 6: Commit**

  Commit: `test: verify the production LINE OA flow`

## Definition of Done

- The public deployment serves the real dashboard and all required Next.js API routes.
- Dashboard state, pairing state, webhook deduplication, and delivery state survive restart/cold start through Neon.
- The intended recipient is paired through a valid LINE-signed webhook; no manual user ID field remains.
- One click sends one Google Drive-hosted image or MP4 plus caption to that recipient.
- The UI never reports success until LINE accepts the push request.
- Duplicate clicks and retries do not create duplicate messages.
- Invalid signatures, unauthorized requests, expired URLs, missing previews, and provider failures send nothing and expose no secrets.
- Automated tests, production build, provider probes, and one controlled live image/video test all pass.

