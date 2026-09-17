# INDY Content Studio Source Reconstruction — Design

## Goal

Recreate an editable source checkout for the existing INDY Content Studio site without replacing its live site or overwriting its existing data. The recreated source will reproduce the visible dashboard information architecture and connect to the existing database before the approved LINE OA delivery work is added.

## Scope

- Preserve the existing dashboard areas: overview and goals, content calendar, action plan, production board, corrections, media library, references, caption templates, Make publishing, and settings.
- Preserve the existing site database as the source of truth. No seed data may overwrite live records.
- Build a separate local source checkout first. The live site remains unchanged until an explicit deployment approval.
- Use the existing action flow: an asset and non-empty caption are required before the existing send action can be enabled.
- Add LINE OA only after the reconstructed dashboard can read and display the existing content workflow reliably.

## Architecture

The replacement source is a Next.js dashboard with an authenticated server boundary. It reads the existing `workspace_state`, review, publication, and integration tables through server-side repositories. Each visible section is a focused route or component, and client components receive only sanitized view models.

The content-detail editor owns the send controls. It keeps the action disabled while an upload is incomplete or a caption is blank. Its eventual LINE OA request contains only a content identifier and revision; the server reloads authoritative data before sending.

## Data safety

- Existing database rows are read-only during the reconstruction phase.
- Migrations are reserved for new LINE OA tables and never alter content rows without a separate reviewed migration.
- Secrets, recipient identifiers, and storage credentials stay server-only.
- Deployment is a later, explicit step; local work and tests cannot replace the live dashboard.

## Verification

1. The reconstructed dashboard renders the existing navigation and overview from the current database.
2. It can show existing content items and their statuses without modifying them.
3. A content editor shows upload and caption state and keeps the send control disabled until both are ready.
4. Automated tests cover view-model mapping, read-only repository behavior, and send-button gating.
5. Before any deployment, compare the reconstructed dashboard with the live site in the browser and request approval.

## Deferred work

- LINE OA credential entry, recipient pairing, webhook verification, and live delivery use the existing approved LINE OA design and begin only after the source reconstruction passes its verification gate.
- Publishing through Make continues to use the existing live configuration; it is not changed during reconstruction.
