# Meta Content Ranking Dashboard — Design

## Goal

Create a secure dashboard that imports Facebook Page and Instagram Professional content performance from Meta, stores historical measurements in Supabase PostgreSQL, receives Meta Lead Ads leads through webhooks, and ranks content for selectable 7-, 14-, 30-day and custom date ranges.

## Scope

The dashboard must show Top 3 or Top 5 and Bottom 3 or Bottom 5 content for these objectives:

1. Engagement: rank by engagement rate; show total engagements beside it.
2. Reach: rank by unique reached accounts.
3. Views: rank by video views; show average watch time and completion rate beside it when Meta provides them.
4. Leads: rank by captured leads.

The six headline indicators are Reach, Engagement Rate, Share + Save Rate, Video Views, Average Watch Time / Completion Rate, and Leads / Conversion Rate.

## Non-goals for the first release

- Publishing or editing Meta content.
- Inbox or Messenger management.
- A universal metric model for TikTok, YouTube, or other platforms.
- Treating Meta-delayed insights as second-by-second realtime analytics.

## Architecture

The web dashboard uses Supabase Auth for staff sessions and reads organisation-scoped ranking data from Supabase PostgreSQL. Supabase Edge Functions run privileged integrations: Meta OAuth callback, Meta webhook verification and ingestion, and a scheduled metrics sync. Meta secrets and long-lived tokens never reach the browser.

Google Drive remains the source of media files and documents. Google Sheets may remain as a manual planning/configuration tool and is imported once into PostgreSQL; it is not queried by the ranking dashboard in normal operation.

```text
Meta Graph API ──scheduled sync──> Edge Function ──> PostgreSQL ──> Dashboard
Meta Lead Ads ──────webhook──────> Edge Function ──> PostgreSQL ──> Dashboard
Google Drive ──file URLs──────────> PostgreSQL ────> Dashboard
Google Sheets ──one-time import───> PostgreSQL
```

## Data ownership and security

- Every organisation owns its social accounts, content, metrics, and leads.
- All public-schema application tables enable Row Level Security (RLS).
- Staff can read only rows belonging to organisations in which they are active members.
- The browser uses only the Supabase publishable key; the service-role key, Meta App Secret, Page access tokens, and webhook verify token exist only in Edge Function secrets.
- Lead field values are personal data. Store only fields required by the business, encrypt sensitive raw payloads at rest if retained, and prevent them from appearing in application logs.
- The Meta webhook verifies the GET challenge with a private verify token and verifies every POST with `X-Hub-Signature-256` using the Meta App Secret.

## Data model

- `organizations`: customer/business tenant.
- `organization_members`: organisation membership and `owner` or `analyst` role.
- `social_accounts`: Meta Page and linked Instagram Professional identifiers, token expiry metadata, and connection state. Access tokens live in a protected secrets store or encrypted private schema, never in a dashboard-readable table.
- `contents`: one record per Meta post, reel, or video. Includes immutable provider ID, platform, permalink, media type, publish time, title/caption preview, thumbnail URL, and Drive asset URL when available.
- `content_metrics_daily`: one daily snapshot per content item. Includes reach, impressions, views, reactions, comments, shares, saves, total engagements, total watch time, average watch time, completion rate, and leads attributed to that content when attribution is known.
- `leads`: de-duplicated Meta lead ID, form ID, social account, received timestamp, optional attributed content ID, and a minimal protected payload.
- `sync_runs`: audit record of every API sync and webhook processing result.

## Ranking rules

- Date range is inclusive and supports preset 7, 14, and 30 days plus a custom start/end date.
- Aggregated metric totals use daily snapshots in the selected range.
- `engagement_rate = total_engagements / reach * 100`; return `NULL` when reach is zero.
- `share_save_rate = (shares + saves) / reach * 100`; return `NULL` when reach is zero.
- Engagement ranking orders by engagement rate descending; use total engagements then newest publish time as deterministic ties.
- Reach, views, and leads rank by their total descending; newest publish time is the deterministic tie-breaker.
- Bottom rankings use ascending order, excluding content with no usable denominator for rate-based ranking and excluding unpublished/draft records.
- The dashboard displays raw values plus comparison with the selected-range average. It must label the latest completed sync time.

## Meta integration behaviour

- A staff owner initiates OAuth and grants only the Meta permissions necessary for connected Facebook Pages and Instagram Professional Accounts.
- The OAuth callback exchanges the authorisation response server-side and records selected Page/Instagram IDs.
- A scheduled job syncs content and metric snapshots every 30 minutes. The UI can request a manual sync, limited to one request per account every 15 minutes.
- The webhook receives Lead Ads events close to realtime. It fetches complete lead details server-side when Meta supplies only an identifier, writes one idempotent lead record, and requests a ranking refresh.
- Reach, views, and engagement are eventually consistent because Meta calculates those insight values asynchronously.

## Delivery boundary

The first release is complete when an authenticated owner can connect one Meta Page with an optional linked Instagram Professional account, wait for a successful sync, and view correctly scoped Top/Bottom rankings and lead counts for 7, 14, 30, or custom days.
