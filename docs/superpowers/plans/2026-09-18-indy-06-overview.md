# INDY Overview and Monthly Goals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace sample overview cards with live monthly goals, filters, ratios, plan-versus-actual warnings, and a clickable content table.

**Architecture:** Pure selectors accept state, month, filters, and clock; the UI renders a deterministic view model. Month and filters are URL-search state so refresh and sharing preserve the current view.

**Tech Stack:** React, TypeScript, URLSearchParams, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-18-indy-full-feature-parity-design.md`

## Global Constraints

- Requires Jobs 01, 02, and 05.
- Metrics exclude soft-deleted content.
- Filtered ratios use the filtered result count as denominator.
- Published means every enabled platform has a verified receipt.

---

### Task 1: Implement overview selectors

**Files:**
- Create: `apps/indy-content-studio/features/overview/overview-selectors.ts`
- Test: `apps/indy-content-studio/tests/overview-selectors.test.ts`

**Interfaces:**
- Produces: `selectMonthlyOverview(state, { month, query, categoryId, formatId, owner, now }): MonthlyOverviewViewModel`.

- [ ] **Step 1: Write table-driven tests for counts and warnings**

```ts
expect(view.metrics).toEqual({ target: 12, planned: 4, completed: 2, fullyPublished: 1 });
expect(view.ratios).toEqual({ video: { count: 3, percent: 75 }, image: { count: 1, percent: 25 } });
expect(view.warnings).toMatchObject({ missingPlan: 1, missingActual: 1, partiallyPublished: 1, unverifiedReceipts: 1 });
```

Cover empty denominator, Thai search, all filters together, previous/next month boundaries, partial receipts, and deleted content.

- [ ] **Step 2: Run the selector test and verify failure**

Run: `pnpm test -- tests/overview-selectors.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement selectors without React dependencies**

Derive status from production and publication records. Clamp percentages to 0-100 and return `0` for an empty filtered result. Sort rows by ready date and then title.

- [ ] **Step 4: Run selector tests**

Run: `pnpm test -- tests/overview-selectors.test.ts`

Expected: PASS.

### Task 2: Build the complete overview workspace

**Files:**
- Create: `apps/indy-content-studio/features/overview/components/OverviewWorkspace.tsx`
- Create: `apps/indy-content-studio/features/overview/components/MonthlyMetrics.tsx`
- Create: `apps/indy-content-studio/features/overview/components/PlanActualPanel.tsx`
- Create: `apps/indy-content-studio/features/overview/components/MonthlyContentTable.tsx`
- Test: `apps/indy-content-studio/tests/overview-workspace.test.tsx`
- Modify: `apps/indy-content-studio/app/page.tsx`
- Modify: `apps/indy-content-studio/app/globals.css`
- Remove: `apps/indy-content-studio/features/dashboard/components/DashboardPreview.tsx`
- Remove: `apps/indy-content-studio/features/dashboard/components/OverviewPage.tsx`
- Remove: `apps/indy-content-studio/features/content/components/ContentTable.tsx`
- Remove: `apps/indy-content-studio/features/content/components/ContentEditor.tsx`
- Remove: `apps/indy-content-studio/tests/dashboard-preview.test.tsx`
- Remove: `apps/indy-content-studio/tests/overview-page.test.tsx`
- Remove: `apps/indy-content-studio/tests/content-table.test.tsx`
- Remove: `apps/indy-content-studio/tests/content-editor.test.tsx`

**Interfaces:**
- Consumes: Task 1 selector, `useDashboardData`, content editor entry point.
- Produces: working `overview` workspace.

- [ ] **Step 1: Write UI tests for month navigation, search, filters, metric cards, warnings, and row opening**

```tsx
await user.type(screen.getByRole("searchbox", { name: "ค้นหาคอนเทนต์" }), "กรรไกร");
expect(screen.getByRole("row", { name: /เลือกกรรไกร/ })).toBeVisible();
expect(screen.queryByRole("row", { name: /บรรยากาศ/ })).not.toBeInTheDocument();
```

- [ ] **Step 2: Run the UI test and verify failure**

Run: `pnpm test -- tests/overview-workspace.test.tsx`

Expected: FAIL.

- [ ] **Step 3: Implement the workspace in four sections**

Header: month navigation, search, filters, create action. Metrics: target/planned/completed/fully published. Ratio panel: image/video counts and progress. Plan/actual panel: five warnings with buttons that apply the relevant table filter. Table: title, category, format, ready date, caption, production, and publication status.

- [ ] **Step 4: Preserve URL state and implement all states**

Use `month`, `q`, `category`, `format`, and `owner` search parameters. Invalid values fall back safely. Render loading skeleton, empty month, empty filter result, and repository error with retry.

- [ ] **Step 5: Replace sample `DashboardPreview` on overview**

Delete the sample-only `DashboardPreview`, `OverviewPage`, `ContentTable`, and `ContentEditor` components plus their obsolete tests. Keep the approved Today priority section above the monthly overview and make it repository-driven: use `plannedWorkAt`, sort by priority and time, resume the latest unfinished item by `lastWorkedAt`, show the real current mini-calendar date, derive waiting-approval and LINE-ready counts, and make both summary cards open their filtered work lists.

- [ ] **Step 6: Run verification and commit**

Run: `pnpm test && pnpm typecheck && pnpm build`

Expected: all commands exit 0.

```bash
git add -- apps/indy-content-studio/features/overview apps/indy-content-studio/features/dashboard/components/DashboardPreview.tsx apps/indy-content-studio/features/dashboard/components/OverviewPage.tsx apps/indy-content-studio/features/dashboard/components/TodayOverview.tsx apps/indy-content-studio/features/content/components/ContentTable.tsx apps/indy-content-studio/features/content/components/ContentEditor.tsx apps/indy-content-studio/app/page.tsx apps/indy-content-studio/app/globals.css apps/indy-content-studio/tests/overview-selectors.test.ts apps/indy-content-studio/tests/overview-workspace.test.tsx apps/indy-content-studio/tests/today-overview.test.tsx apps/indy-content-studio/tests/dashboard-preview.test.tsx apps/indy-content-studio/tests/overview-page.test.tsx apps/indy-content-studio/tests/content-table.test.tsx apps/indy-content-studio/tests/content-editor.test.tsx
git commit -m "feat: add live monthly overview and goals"
```

### Task 3: Make global search and notifications functional

**Files:**
- Create: `apps/indy-content-studio/features/search/global-search.ts`
- Create: `apps/indy-content-studio/features/search/components/GlobalSearchDialog.tsx`
- Create: `apps/indy-content-studio/features/notifications/notification-selectors.ts`
- Create: `apps/indy-content-studio/features/notifications/components/NotificationCenter.tsx`
- Test: `apps/indy-content-studio/tests/global-search.test.tsx`
- Test: `apps/indy-content-studio/tests/notification-center.test.tsx`
- Modify: `apps/indy-content-studio/app/AppShell.tsx`
- Modify: `apps/indy-content-studio/app/page.tsx`

**Interfaces:**
- Produces: `searchDashboard(state, query)`, `selectNotifications(state, now)`, a working command-bar search, and a working notification button.

- [ ] **Step 1: Write search tests before implementation**

Search Thai and English text across content title/caption, media name/tags, reference title/URL, and template name/body. Assert grouped results, empty query, no results, Arrow key movement, Enter open, Escape close, focus restoration, and Ctrl/Cmd+K.

- [ ] **Step 2: Write notification tests before implementation**

Derive pending LINE corrections, failed publication attempts, overdue platform schedules without receipts, and content waiting for local approval. Clicking a notification must navigate to the owning workspace and open the referenced item.

- [ ] **Step 3: Run tests and verify failure**

Run: `pnpm test -- tests/global-search.test.tsx tests/notification-center.test.tsx`

Expected: FAIL.

- [ ] **Step 4: Implement search and notification selectors as pure functions**

Normalize with `toLocaleLowerCase("th-TH")`, trim whitespace, cap each result group at 8, and sort exact title matches before substring matches. Notifications use stable IDs derived from entity and event IDs; do not create random IDs during render.

- [ ] **Step 5: Connect the visible AppShell controls**

The search field opens the search dialog and retains its accessible label. The notification button shows unread count and opens a labeled panel. Marking read is local persistent state; it does not remove the underlying warning. Opening a result or notification routes to the correct workspace and item.

- [ ] **Step 6: Run the final Overview/Shell verification and commit**

Run: `pnpm test && pnpm typecheck && pnpm build`

Expected: all commands exit 0.

```bash
git add apps/indy-content-studio/features/search apps/indy-content-studio/features/notifications apps/indy-content-studio/features/overview apps/indy-content-studio/features/dashboard apps/indy-content-studio/app apps/indy-content-studio/tests
git commit -m "feat: add dashboard search and notifications"
```

### Human acceptance

1. Set a monthly target in Settings and confirm it appears on Overview.
2. Navigate previous and next month and reload; confirm month is preserved.
3. Combine search, category, format, and owner filters; verify metrics and table use the same result set.
4. Click a warning and confirm the table narrows to affected content.
5. Open a row, edit it, save, and confirm metrics update without a page reload.
6. Use the global search to open one content item, one media item, one reference, and one caption template.
7. Open the notification panel, follow an overdue schedule warning, mark it read, and confirm the underlying warning remains until the schedule is fixed.
