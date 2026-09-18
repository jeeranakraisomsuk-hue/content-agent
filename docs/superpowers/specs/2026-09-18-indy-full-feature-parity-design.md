# INDY Content Studio Full Feature Parity Design

**Date:** 2026-09-18

**Status:** Approved for implementation planning

## Goal

Rebuild every verified function from the original INDY Content Studio inside the new soft-glass dashboard so each menu is a complete working workflow rather than a visual placeholder.

## Verified Source Workflows

The original site was inspected directly. The parity target contains:

1. Overview and monthly goals: month navigation, search, category/format/owner filters, target metrics, image/video ratios, plan-versus-actual warnings, and the monthly content table.
2. Content calendar: month navigation, filters, day placement, moving and unscheduling content, unscheduled work, and platform-specific schedule/publication states.
3. Action Plan: week/month views, date navigation, user-defined process steps, rescheduling, and `todo`/`doing`/`done` transitions.
4. Production board: seven canonical statuses, counts, filters, cards, and direct status movement.
5. Corrections: refresh LINE OA feedback, open the affected content, resolve feedback, and resubmit for review.
6. Media library: file upload, external links, preview, tags, edit, soft delete, trash, and restore.
7. References and ideas: save, edit, search, delete, and attach inspiration links to content.
8. Caption templates: placeholder variables, immutable versions, preview, and applying a version to a content caption.
9. Make publishing: one content item, one shared caption, per-platform schedules, queue states, retry, and publication receipts.
10. Settings and data: categories, formats, approval rules, backup, restore, idea import, content trash, and integration diagnostics.
11. Create/edit content: identity, media, production steps, shared caption, platform destinations and Thai schedules, references, notes, local approval, LINE review, readiness validation, save, and resubmission.

## Product Boundary

- The dashboard must remain honest when an external account is disconnected. It may save a local plan, but it must never display `sent`, `published`, or `approved` without a provider receipt or verified webhook event.
- All local workflows must remain usable without cloud credentials.
- Real LINE, Make, Google Sheets, and Google Drive operations require server-side connections. Secrets never appear in browser storage, page fields, exports, logs, or test fixtures.
- Existing data is preserved through an import path. The old live site is read-only during reconstruction.
- Thai is the primary interface language. Dates are stored as ISO values and displayed in Asia/Bangkok time with Thai labels.

## Architecture

### Single domain model

Every workspace reads and writes the same entities. No page owns a private copy of content data.

```ts
export type ProductionStatus =
  | "waiting-shoot"
  | "shot"
  | "editing"
  | "review"
  | "needs-changes"
  | "ready"
  | "published";

export type Platform = "facebook" | "instagram" | "tiktok";
export type StepStatus = "todo" | "doing" | "done";

export interface ContentItem {
  id: string;
  title: string;
  categoryId: string;
  formatId: string;
  owner: string;
  objective: "branding" | "awareness" | "lead" | "engagement" | "sales";
  priority: "urgent" | "high" | "normal" | "low";
  plannedWorkAt: string | null;
  lastWorkedAt: string | null;
  readyDate: string | null;
  productionStatus: ProductionStatus;
  assetIds: string[];
  processSteps: ProcessStep[];
  caption: string;
  captionSource: { templateId: string; versionId: string; values: Record<string, string> } | null;
  schedules: PlatformSchedule[];
  referenceIds: string[];
  notes: string;
  localApproval: "pending" | "approved";
  lineReview: LineReviewState;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface ProcessStep {
  id: string;
  name: string;
  scheduledDate: string | null;
  status: StepStatus;
  order: number;
}

export interface PlatformSchedule {
  platform: Platform;
  enabled: boolean;
  publishAt: string | null;
  latestAttemptId: string | null;
  manualEvidence: { receiptUrl: string; note: string; confirmedAt: string } | null;
}

export interface LineReviewState {
  status: "not-sent" | "queued" | "sent" | "correction-requested" | "approved" | "failed";
  activeCycleId: string | null;
  reviewCode: string | null;
  providerReceipts: string[];
  lastEventAt: string | null;
  history: Array<{
    id: string;
    cycleId: string;
    event: "queued" | "sent" | "approved" | "correction-requested" | "approval-reset" | "failed";
    comment: string | null;
    occurredAt: string;
  }>;
}

export interface MediaAsset {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  source: "upload" | "external";
  externalUrl: string | null;
  externalPreviewUrl: string | null;
  blobKey: string | null;
  remoteStatus: "local-only" | "uploading" | "ready" | "failed";
  providerFileId: string | null;
  previewProviderFileId: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface Category {
  id: string;
  name: string;
  requiresApproval: boolean;
}

export interface FormatDefinition {
  id: string;
  name: string;
  mediaKind: "video" | "image" | "other";
  allowedPlatforms: Platform[];
}

export interface ReferenceIdea {
  id: string;
  title: string;
  url: string;
  platform: string;
  tags: string[];
  notes: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface CaptionTemplateVersion {
  id: string;
  version: number;
  body: string;
  variables: string[];
  createdAt: string;
}

export interface CaptionTemplate {
  id: string;
  name: string;
  versions: CaptionTemplateVersion[];
  activeVersionId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface CorrectionRequest {
  id: string;
  contentId: string;
  cycleId: string;
  comment: string;
  status: "open" | "resolved";
  receivedAt: string;
  resolvedAt: string | null;
}

export interface MonthlyGoal {
  month: string;
  target: number;
}

export interface PublicationAttempt {
  id: string;
  idempotencyKey: string;
  contentId: string;
  platform: Platform;
  publishAt: string;
  status: "local-plan" | "submitting" | "queued" | "publishing" | "published" | "failed";
  queueId: string | null;
  providerPublicationId: string | null;
  receiptUrl: string | null;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IntegrationStatus {
  provider: "google-sheets" | "google-drive" | "line" | "make" | "tiktok" | "online-media" | "ai-caption";
  status: "connected" | "disconnected" | "error";
  checkedAt: string | null;
  message: string;
}
```

Supporting entities are `MediaAsset`, `Category`, `FormatDefinition`, `ReferenceIdea`, `CaptionTemplate`, `CaptionTemplateVersion`, `CorrectionRequest`, `MonthlyGoal`, `IntegrationStatus`, and `PublicationAttempt`.

### Repository and synchronization

`DashboardRepository` is the only mutation boundary. The first implementation uses IndexedDB for durable browser data with an in-memory implementation for tests. Durable publication attempts and LINE review history records represent provider-bound work. Server routes process those operations and return provider receipts. The UI subscribes to repository snapshots and derives all page views from them.

### State ownership

- Canonical data lives in the repository.
- URL/workspace selection, open drawers, filters, and modal visibility are ephemeral UI state.
- Derived counts, warnings, calendar cells, and board columns are pure selectors.
- Provider status is explicit: `idle`, `queued`, `sending`, `succeeded`, `failed`, or `disconnected`.
- Deletes are soft deletes until trash is permanently emptied.

### Approval invariants

- Editing caption text or changing attached media after approval resets local and LINE approval.
- LINE review can only be sent when at least one ready asset and non-empty caption exist.
- Corrections always reference a content ID and review cycle ID.
- A correction marked resolved remains in history and is not silently removed.

### Publishing invariants

- Video formats may target Facebook, Instagram, and TikTok.
- Image and album formats target Facebook unless a format setting explicitly enables another platform later.
- Every enabled platform requires a future publish time before queueing.
- One platform can fail without rewriting successful states for other platforms.
- `published` requires a real receipt URL or provider publication ID.

## Interaction and Accessibility

- Preserve the approved Apple-style soft-glass visual language.
- Reuse the existing motion variables and honor `prefers-reduced-motion`.
- Every interactive element is a semantic button, link, input, or select.
- Drawers and dialogs trap focus, close with Escape, restore focus, and expose accessible names.
- Loading, empty, error, success, disconnected, and partial-failure states are implemented for every asynchronous surface.
- Desktop is the primary dense workflow; narrow layouts remain usable without horizontal page overflow.

## Testing Strategy

- Vitest and Testing Library cover selectors, repositories, reducers, forms, dialogs, boards, and provider state transitions.
- Fake clocks make all schedule and Thai-date behavior deterministic.
- Contract tests exercise every `DashboardRepository` implementation with the same suite.
- Server route tests mock external providers and assert that no secret reaches responses.
- Final acceptance tests trace one content item from creation through production, review, correction, scheduling, publishing receipt, backup, trash, and restore.

## Definition of Done

A subsystem is complete only when:

1. Its menu opens a real workspace with no placeholder copy.
2. Create, read, update, delete/restore paths persist across reloads.
3. Empty, loading, error, disconnected, and success states are verified.
4. Keyboard and accessible-name tests pass.
5. The focused test file, full test suite, typecheck, and production build pass.
6. A human can follow the plan's acceptance checklist without inspecting source code.
