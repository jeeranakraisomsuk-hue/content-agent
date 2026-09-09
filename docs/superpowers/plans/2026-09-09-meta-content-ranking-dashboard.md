# Meta Content Ranking Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Supabase-backed dashboard that securely syncs Meta content metrics and Lead Ads leads, then ranks content for selected date ranges.

**Architecture:** A TypeScript web dashboard reads organisation-scoped data from Supabase PostgreSQL. Supabase Edge Functions own the Meta OAuth callback, signed Lead Ads webhook, and scheduled metrics collection. Google Drive file URLs are metadata on content records; Google Sheets is migrated once and no longer powers dashboard queries.

**Tech Stack:** TypeScript, React/Next.js dashboard, Supabase Auth, Supabase PostgreSQL, SQL migrations, Supabase Edge Functions (Deno), Meta Graph API, Meta Webhooks, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-09-meta-content-ranking-design.md`

## Global Constraints

- Use 7, 14, and 30 day presets plus inclusive custom date ranges.
- The browser must never receive the Meta App Secret, Page access token, webhook verify token, Supabase service-role key, or a decrypted lead payload.
- Enable RLS on every application table in `public`; all dashboard reads are restricted through organisation membership.
- Store each daily metric snapshot idempotently by content ID and snapshot date.
- Sync insight metrics every 30 minutes; rate-limit manual sync to one request per social account per 15 minutes.
- Rank engagement by engagement rate and show total engagements; rank reach, views, and leads by their totals.
- Treat Google Drive as file storage and Google Sheets as an import/configuration source, not a runtime analytics database.

---

## File Structure

```text
apps/dashboard/
  app/(authenticated)/dashboard/page.tsx                 # ranking dashboard route
  app/(authenticated)/settings/meta/page.tsx             # Meta connection management
  app/api/meta/connect/route.ts                          # starts OAuth safely
  app/api/rankings/route.ts                              # validates ranking filters
  components/rankings/date-range-picker.tsx              # preset/custom range control
  components/rankings/ranking-panel.tsx                  # Top/Bottom metric panel
  components/rankings/content-ranking-row.tsx            # one ranked content item
  lib/rankings.ts                                        # typed dashboard query client
  lib/supabase/browser.ts                                # publishable-key browser client
  tests/rankings.test.ts                                 # metric/query unit tests
  e2e/dashboard-rankings.spec.ts                         # browser acceptance tests

supabase/
  migrations/<generated>_initial_content_analytics.sql   # tenant schema, RLS, indexes
  migrations/<generated>_ranking_rpc.sql                 # protected ranking RPC
  migrations/<generated>_webhook_and_sync.sql            # idempotency and sync state
  functions/meta-oauth-callback/index.ts                 # OAuth callback and account setup
  functions/meta-lead-webhook/index.ts                   # GET verification + signed POST handler
  functions/meta-sync/index.ts                           # content/insight collection job
  functions/meta-manual-sync/index.ts                    # staff-requested, rate-limited sync
  functions/_shared/meta.ts                              # Graph API client and typed errors
  functions/_shared/crypto.ts                            # HMAC validation and payload protection
  functions/_shared/metrics.ts                           # Meta metric normalisation
  functions/tests/metrics_test.ts                        # Deno metric unit tests
  functions/tests/webhook_test.ts                        # Deno signature/idempotency tests

scripts/
  import-google-sheets.ts                                # controlled one-time Sheets import
  verify-meta-env.ts                                     # required-secret validation for deployment
```

### Task 1: Bootstrap the dashboard and Supabase project contract

**Files:**
- Create: `apps/dashboard/package.json`
- Create: `apps/dashboard/.env.example`
- Create: `apps/dashboard/lib/supabase/browser.ts`
- Create: `supabase/config.toml`
- Create: `scripts/verify-meta-env.ts`
- Test: `apps/dashboard/tests/environment.test.ts`

**Interfaces:**
- Produces: `createBrowserClient(): SupabaseClient`, `assertMetaEnvironment(env: Record<string, string | undefined>): void`.
- Consumes: Supabase project URL and browser publishable key only in browser code.

- [ ] **Step 1: Write the failing environment test**

```ts
import { assertMetaEnvironment } from "../../scripts/verify-meta-env";

it("rejects deployment without the Meta webhook and app secrets", () => {
  expect(() => assertMetaEnvironment({ META_APP_ID: "123" })).toThrow(
    "Missing required environment variable: META_APP_SECRET",
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/dashboard && npm test -- environment.test.ts`

Expected: FAIL because `verify-meta-env.ts` does not exist.

- [ ] **Step 3: Create the app configuration and minimal validator**

```ts
const required = [
  "META_APP_ID", "META_APP_SECRET", "META_WEBHOOK_VERIFY_TOKEN",
  "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY",
] as const;

export function assertMetaEnvironment(env: Record<string, string | undefined>) {
  for (const key of required) {
    if (!env[key]) throw new Error(`Missing required environment variable: ${key}`);
  }
}
```

Put only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `apps/dashboard/.env.example`; document all server-only names without values.

- [ ] **Step 4: Run the focused test**

Run: `cd apps/dashboard && npm test -- environment.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard supabase/config.toml scripts/verify-meta-env.ts
git commit -m "chore: bootstrap dashboard integration contract"
```

### Task 2: Create tenant-safe analytics schema and access policies

**Files:**
- Create: `supabase/migrations/<generated>_initial_content_analytics.sql`
- Test: `supabase/tests/initial_content_analytics.sql`

**Interfaces:**
- Produces: `organizations`, `organization_members`, `social_accounts`, `contents`, `content_metrics_daily`, `leads`, and `sync_runs` tables.
- Produces: `public.is_organization_member(target_organization_id uuid) returns boolean` for RLS policies.
- Consumes: authenticated user ID from `auth.uid()`.

- [ ] **Step 1: Write schema assertions before the migration**

```sql
begin;
select has_table('public', 'content_metrics_daily');
select has_index('public', 'content_metrics_daily', 'content_metrics_daily_content_id_snapshot_date_key');
select row_security_active('public.content_metrics_daily');
rollback;
```

- [ ] **Step 2: Run the schema test to verify it fails**

Run: `supabase test db --file supabase/tests/initial_content_analytics.sql`

Expected: FAIL because the tables and policies do not exist.

- [ ] **Step 3: Generate and write the migration**

Run: `supabase migration new initial_content_analytics`

Create organisation-owned foreign keys on all business records. Add `unique(content_id, snapshot_date)` to daily metrics, `unique(provider, provider_lead_id)` to leads, and indexes on `(organization_id, published_at)` for content and `(content_id, snapshot_date)` for metrics. Enable RLS on every table. Use policies that join `organization_members` with both `organization_id` and `auth.uid()`; do not use user-editable metadata for authorisation.

- [ ] **Step 4: Apply locally and run the schema test**

Run: `supabase start && supabase db reset && supabase test db --file supabase/tests/initial_content_analytics.sql`

Expected: PASS; an organisation member can read only its own organisation rows.

- [ ] **Step 5: Run the database security advisor**

Run: `supabase db advisors --local`

Expected: no warning that an application table lacks RLS or has a permissive public policy.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations supabase/tests
git commit -m "feat: add tenant-safe content analytics schema"
```

### Task 3: Implement and test metric normalisation

**Files:**
- Create: `supabase/functions/_shared/metrics.ts`
- Create: `supabase/functions/tests/metrics_test.ts`

**Interfaces:**
- Produces: `normaliseMetrics(input: MetaMetricInput): DailyMetric`.
- `DailyMetric` has `reach`, `impressions`, `views`, `reactions`, `comments`, `shares`, `saves`, `totalEngagements`, `totalWatchTimeMs`, `averageWatchTimeMs`, and `completionRate` fields, each a non-negative number or `null` only when Meta omitted the metric.
- Consumes: raw Meta metric name/value pairs.

- [ ] **Step 1: Write failing normalisation tests**

```ts
Deno.test("calculates total engagements from all supplied interactions", () => {
  const result = normaliseMetrics({ reach: 100, reactions: 8, comments: 2, shares: 3, saves: 1 });
  assertEquals(result.totalEngagements, 14);
});

Deno.test("preserves unavailable video metrics as null", () => {
  assertEquals(normaliseMetrics({ reach: 10 }).averageWatchTimeMs, null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `deno test --allow-env supabase/functions/tests/metrics_test.ts`

Expected: FAIL because `normaliseMetrics` is undefined.

- [ ] **Step 3: Implement the normaliser**

Map provider-specific names only inside `metrics.ts`. Sum reactions, comments, shares, and saves with absent interaction counts treated as zero. Reject negative and non-finite numbers with a typed `InvalidMetaMetricError`; never silently convert them to zero.

- [ ] **Step 4: Run tests**

Run: `deno test --allow-env supabase/functions/tests/metrics_test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/metrics.ts supabase/functions/tests/metrics_test.ts
git commit -m "feat: normalise Meta content metrics"
```

### Task 4: Add Meta OAuth connection flow

**Files:**
- Create: `apps/dashboard/app/api/meta/connect/route.ts`
- Create: `apps/dashboard/app/(authenticated)/settings/meta/page.tsx`
- Create: `supabase/functions/meta-oauth-callback/index.ts`
- Create: `supabase/functions/_shared/meta.ts`
- Test: `supabase/functions/tests/meta_oauth_test.ts`

**Interfaces:**
- Produces: `GET /api/meta/connect` which redirects an authenticated owner to Meta with signed state.
- Produces: `meta-oauth-callback` Edge Function which validates state and saves `social_accounts` connection metadata.
- Consumes: `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI`, and server-side Supabase credentials.

- [ ] **Step 1: Write a failing callback test**

```ts
Deno.test("rejects an OAuth callback whose signed state has expired", async () => {
  const response = await handleOAuthCallback(new Request("https://example.test?code=x&state=expired"));
  assertEquals(response.status, 400);
});
```

- [ ] **Step 2: Run the callback test to verify it fails**

Run: `deno test --allow-env --allow-net supabase/functions/tests/meta_oauth_test.ts`

Expected: FAIL because `handleOAuthCallback` is undefined.

- [ ] **Step 3: Implement the flow**

Generate a random state value tied to the authenticated user and organisation, persist a short expiry, and use PKCE where the selected Meta OAuth flow supports it. Exchange the code only in `meta-oauth-callback`; request only the approved Page/Instagram insight and lead permissions. Fetch available Pages, require the owner to choose one, record provider IDs and token expiry metadata, and keep the token in function-only secret storage or an encrypted private table.

- [ ] **Step 4: Run focused tests and a manual sandbox connection**

Run: `deno test --allow-env --allow-net supabase/functions/tests/meta_oauth_test.ts`

Expected: PASS. In a Meta test app, an owner can connect a test Page and sees its Page ID in `social_accounts` without any token displayed in the browser.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/app/api/meta/connect/route.ts apps/dashboard/app/'(authenticated)'/settings/meta/page.tsx supabase/functions/meta-oauth-callback supabase/functions/_shared/meta.ts supabase/functions/tests/meta_oauth_test.ts
git commit -m "feat: connect Meta social accounts securely"
```

### Task 5: Receive and persist Meta Lead Ads webhooks safely

**Files:**
- Create: `supabase/functions/_shared/crypto.ts`
- Create: `supabase/functions/meta-lead-webhook/index.ts`
- Create: `supabase/functions/tests/webhook_test.ts`
- Create: `supabase/migrations/<generated>_webhook_and_sync.sql`

**Interfaces:**
- Produces: `verifyMetaSignature(rawBody: string, signature: string, appSecret: string): boolean`.
- Produces: webhook `GET` verification response and idempotent webhook `POST` handling.
- Consumes: `META_WEBHOOK_VERIFY_TOKEN`, `META_APP_SECRET`, and a connected `social_accounts` record.

- [ ] **Step 1: Write failing webhook tests**

```ts
Deno.test("returns hub.challenge only for the configured verify token", async () => {
  const response = await handleWebhook(new Request("https://x?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=42"));
  assertEquals(response.status, 403);
});

Deno.test("does not insert a duplicate provider lead", async () => {
  await processLeadEvent(testLeadEvent);
  await processLeadEvent(testLeadEvent);
  assertEquals(await countLeads(testLeadEvent.leadgen_id), 1);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `deno test --allow-env --allow-net supabase/functions/tests/webhook_test.ts`

Expected: FAIL because the webhook handler does not exist.

- [ ] **Step 3: Implement verification and idempotent persistence**

For GET, compare `hub.verify_token` using constant-time comparison and return `hub.challenge` only when it matches. For POST, read the raw body once, verify `X-Hub-Signature-256` via HMAC SHA-256, identify lead events, fetch complete lead values server-side only when required, and insert using `on conflict (provider, provider_lead_id) do nothing`. Store an audit result in `sync_runs`; redact personal field values from error logs.

- [ ] **Step 4: Run tests and send a signed local fixture**

Run: `deno test --allow-env --allow-net supabase/functions/tests/webhook_test.ts`

Expected: PASS; invalid signature returns 401 and a duplicate event creates one lead.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/crypto.ts supabase/functions/meta-lead-webhook supabase/functions/tests/webhook_test.ts supabase/migrations
git commit -m "feat: ingest Meta lead webhooks safely"
```

### Task 6: Sync Meta content and daily insights on schedule

**Files:**
- Create: `supabase/functions/meta-sync/index.ts`
- Create: `supabase/functions/meta-manual-sync/index.ts`
- Modify: `supabase/functions/_shared/meta.ts`
- Test: `supabase/functions/tests/meta_sync_test.ts`
- Modify: `supabase/config.toml`

**Interfaces:**
- Produces: `syncSocialAccount(accountId: string, asOf: Date): Promise<SyncResult>`.
- Produces: scheduled `meta-sync` invocation every 30 minutes and staff-only `meta-manual-sync` invocation.
- Consumes: `social_accounts` IDs, protected tokens, and `normaliseMetrics`.

- [ ] **Step 1: Write failing sync tests**

```ts
Deno.test("upserts one daily snapshot for the same content and date", async () => {
  await syncSocialAccount(accountId, new Date("2026-09-09T12:00:00Z"));
  await syncSocialAccount(accountId, new Date("2026-09-09T12:30:00Z"));
  assertEquals(await countSnapshots(contentId, "2026-09-09"), 1);
});

Deno.test("rejects a manual sync requested within fifteen minutes", async () => {
  assertEquals((await requestManualSync(accountId)).status, 429);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `deno test --allow-env --allow-net supabase/functions/tests/meta_sync_test.ts`

Expected: FAIL because sync functions do not exist.

- [ ] **Step 3: Implement the collector and schedule**

Page through Meta content for each connected account, upsert immutable content metadata by provider ID, request only the approved metrics appropriate to media type, normalise them, and upsert `content_metrics_daily` using `(content_id, snapshot_date)`. Record success/failure, counts, and timestamps in `sync_runs`. Configure the platform scheduler to invoke `meta-sync` every 30 minutes with a server-only bearer secret. Allow `meta-manual-sync` only for the owner organisation and return 429 before calling Meta when the last successful/manual request is less than 15 minutes old.

- [ ] **Step 4: Run unit tests and one sandbox sync**

Run: `deno test --allow-env --allow-net supabase/functions/tests/meta_sync_test.ts`

Expected: PASS. With a test Page, repeated same-day syncs leave one row per content/date and create an audit row per run.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/meta-sync supabase/functions/meta-manual-sync supabase/functions/_shared/meta.ts supabase/functions/tests/meta_sync_test.ts supabase/config.toml
git commit -m "feat: sync Meta content metrics on schedule"
```

### Task 7: Expose safe ranking queries

**Files:**
- Create: `supabase/migrations/<generated>_ranking_rpc.sql`
- Create: `apps/dashboard/lib/rankings.ts`
- Create: `apps/dashboard/app/api/rankings/route.ts`
- Test: `supabase/tests/ranking_rpc.sql`
- Test: `apps/dashboard/tests/rankings.test.ts`

**Interfaces:**
- Produces: `public.get_content_rankings(p_organization_id uuid, p_start_date date, p_end_date date, p_metric text, p_limit integer, p_order text)`.
- Produces: `RankingItem` with content identity, totals, engagement rate, share/save rate, average watch time, completion rate, and selected-range average.
- Consumes: authenticated organisation membership and daily metric rows.

- [ ] **Step 1: Write failing ranking SQL tests**

```sql
select results_eq(
  $$ select content_id from public.get_content_rankings('11111111-1111-1111-1111-111111111111', '2026-09-01', '2026-09-07', 'engagement_rate', 3, 'desc') limit 1 $$,
  $$ values ('content-high-rate') $$,
  'engagement ranking uses rate rather than raw total'
);
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `supabase test db --file supabase/tests/ranking_rpc.sql`

Expected: FAIL because the ranking function does not exist.

- [ ] **Step 3: Implement the RPC and route validation**

Aggregate only metrics whose snapshot dates are within the inclusive range. Compute `total_engagements / nullif(reach, 0) * 100` and `((shares + saves) / nullif(reach, 0)) * 100`. Permit only `engagement_rate`, `reach`, `views`, and `leads` as metric values, only `3` or `5` as limit, and only `asc` or `desc` as order. Use deterministic tie breaks: total engagements then newest publish time for engagement, newest publish time for all others. Make the function `security invoker`; grant it only to `authenticated` and enforce membership inside the query.

- [ ] **Step 4: Run database and TypeScript tests**

Run: `supabase test db --file supabase/tests/ranking_rpc.sql && cd apps/dashboard && npm test -- rankings.test.ts`

Expected: PASS; a user in another organisation receives no rows.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations supabase/tests apps/dashboard/lib/rankings.ts apps/dashboard/app/api/rankings/route.ts apps/dashboard/tests/rankings.test.ts
git commit -m "feat: add scoped content ranking queries"
```

### Task 8: Build the ranking dashboard UI

**Files:**
- Create: `apps/dashboard/components/rankings/date-range-picker.tsx`
- Create: `apps/dashboard/components/rankings/ranking-panel.tsx`
- Create: `apps/dashboard/components/rankings/content-ranking-row.tsx`
- Create: `apps/dashboard/app/(authenticated)/dashboard/page.tsx`
- Test: `apps/dashboard/e2e/dashboard-rankings.spec.ts`

**Interfaces:**
- Consumes: `GET /api/rankings?metric=<metric>&range=<preset|custom>&start=<YYYY-MM-DD>&end=<YYYY-MM-DD>&limit=<3|5>&order=<asc|desc>`.
- Produces: UI panels for Engagement, Reach, Views, and Leads with Top and Bottom controls.

- [ ] **Step 1: Write a failing browser test**

```ts
test("switches the Top Engagement panel from 7 to 30 days", async ({ page }) => {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "30 days" }).click();
  await expect(page.getByRole("heading", { name: "Top Engagement" })).toBeVisible();
  await expect(page.getByText("Updated at")).toBeVisible();
});
```

- [ ] **Step 2: Run the browser test to verify it fails**

Run: `cd apps/dashboard && npx playwright test e2e/dashboard-rankings.spec.ts`

Expected: FAIL because the dashboard route does not render the required controls.

- [ ] **Step 3: Implement the dashboard**

Provide 7, 14, and 30 day buttons and a validated custom date picker. Each ranking panel has a Top/Bottom toggle and a 3/5 toggle. Each content row renders thumbnail, title/caption preview, publish date, platform, selected metric, supporting metrics, and percentage compared with the selected-range average. Show `Updated at <timestamp>` from the latest successful `sync_runs` row, plus an explicit empty state when no eligible content exists.

- [ ] **Step 4: Run the browser acceptance test**

Run: `cd apps/dashboard && npx playwright test e2e/dashboard-rankings.spec.ts`

Expected: PASS with seeded organisation data.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/app apps/dashboard/components apps/dashboard/e2e
git commit -m "feat: display Top and Bottom content rankings"
```

### Task 9: Import Google Sheets data and preserve Drive references

**Files:**
- Create: `scripts/import-google-sheets.ts`
- Create: `scripts/import-google-sheets.test.ts`
- Create: `docs/data-migration.md`

**Interfaces:**
- Produces: `importGoogleSheets(rows: SheetContentRow[]): ImportReport`.
- Consumes: an explicitly exported CSV or authenticated Google Sheets API response, and Drive URLs contained in source rows.
- Produces: `contents` records and preserves valid `drive_asset_url` values.

- [ ] **Step 1: Write a failing import test**

```ts
it("imports a content row once and keeps its Drive URL", async () => {
  const report = await importGoogleSheets([{ providerId: "legacy-1", title: "Example", driveUrl: "https://drive.google.com/file/d/abc" }]);
  expect(report.inserted).toBe(1);
  expect(await lookupContent("legacy-1")).toMatchObject({ drive_asset_url: "https://drive.google.com/file/d/abc" });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run scripts/import-google-sheets.test.ts`

Expected: FAIL because the importer is missing.

- [ ] **Step 3: Implement a dry-run-first importer**

Require an `--organization-id` argument and a `--dry-run` flag by default. Validate provider IDs, ISO publish dates, and HTTPS Drive URLs. Upsert by provider ID; report inserted, updated, skipped, and invalid rows without printing lead data or tokens. Document an export → dry run → backup → live import sequence in `docs/data-migration.md`.

- [ ] **Step 4: Run tests and a dry-run fixture import**

Run: `npx vitest run scripts/import-google-sheets.test.ts && npx tsx scripts/import-google-sheets.ts --organization-id <test-org-id> --dry-run fixtures/content.csv`

Expected: PASS; the dry run reports changes but writes zero database rows.

- [ ] **Step 5: Commit**

```bash
git add scripts/import-google-sheets.ts scripts/import-google-sheets.test.ts docs/data-migration.md
git commit -m "feat: import legacy Sheets content into Supabase"
```

### Task 10: Deploy, configure Meta, and verify the full integration

**Files:**
- Create: `docs/meta-production-checklist.md`
- Modify: `apps/dashboard/.env.example`
- Modify: `supabase/config.toml`
- Test: `apps/dashboard/e2e/meta-connection.spec.ts`

**Interfaces:**
- Consumes: production Supabase project URL, server-only secrets, Meta app configuration, permitted callback URL, and webhook endpoint URL.
- Produces: a documented production deployment with verified OAuth, webhook, scheduled sync, and organisation isolation.

- [ ] **Step 1: Write the production acceptance test**

```ts
test("shows a connected Page and latest sync time without exposing a token", async ({ page }) => {
  await page.goto("/settings/meta");
  await expect(page.getByText("Connected")).toBeVisible();
  await expect(page.locator("body")).not.toContainText(process.env.META_TEST_TOKEN!);
});
```

- [ ] **Step 2: Run the test to verify the pre-deployment state fails**

Run: `cd apps/dashboard && npx playwright test e2e/meta-connection.spec.ts`

Expected: FAIL until a Meta sandbox Page is connected in the deployed environment.

- [ ] **Step 3: Deploy and configure**

Deploy database migrations and Edge Functions to the production Supabase project. Store the Meta App ID, App Secret, redirect URI, webhook verify token, service-role key, scheduler bearer secret, and encryption key as server-only secrets. Register the deployed OAuth callback and webhook URLs in the Meta app. Subscribe only to the Lead Ads events required for this product. Configure the 30-minute scheduler and verify its secret header. Complete Meta App Review/Advanced Access only for permissions used in the production feature.

- [ ] **Step 4: Run full end-to-end verification**

Run: `cd apps/dashboard && npx playwright test e2e/meta-connection.spec.ts e2e/dashboard-rankings.spec.ts`

Expected: PASS. Verify one test lead appears once, a manual sync is rate-limited on immediate repeat, rankings remain inaccessible to a different organisation, and the dashboard displays the latest sync timestamp.

- [ ] **Step 5: Commit deployment documentation**

```bash
git add docs/meta-production-checklist.md apps/dashboard/.env.example supabase/config.toml apps/dashboard/e2e/meta-connection.spec.ts
git commit -m "docs: add Meta production deployment checklist"
```

## Plan Self-Review

- Spec coverage: Tasks 2, 3, 6, and 7 implement the data model and every ranking rule; Task 4 implements account connection; Task 5 handles realtime Lead Ads; Task 8 covers every dashboard control; Task 9 assigns Sheets/Drive roles; Task 10 covers deployment and Meta configuration.
- Placeholder scan: no unresolved tasks, generic error-handling instructions, or unspecified implementation files remain. Migration filenames are generated with the Supabase CLI as required.
- Interface consistency: content metric fields emitted by Task 3 feed the Task 6 upsert and Task 7 aggregation; the ranking route consumed by Task 8 is defined in Task 7; all privileged token work stays in Edge Functions.
