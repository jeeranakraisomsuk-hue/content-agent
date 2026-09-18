# INDY Backup, Migration, and Full Acceptance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Recommended model:** Use `gpt-5.6-sol` with `high` reasoning. This job validates cross-feature invariants and is the final parity gate.

**Goal:** Finish versioned backup/restore, legacy import, content trash, and a full browser acceptance path proving every original workflow is operational in the new dashboard.

**Architecture:** Export a versioned JSON envelope without binary blobs or secrets. Import validates into a preview model before merge or replace. Playwright drives the real app through one end-to-end lifecycle and captures reviewable screenshots.

**Tech Stack:** TypeScript, React, native JSON/Blob download, Vitest, Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-18-indy-full-feature-parity-design.md`

## Global Constraints

- Requires Jobs 01 through 11.
- Restore never writes until validation and user confirmation succeed.
- Backup never contains media blobs, service-account values, access tokens, webhook URLs, or reviewer user IDs.
- Replace mode creates an automatic pre-restore backup first.
- No navigation workspace may render placeholder copy after this job.

---

### Task 1: Implement versioned backup, validation, and restore

**Files:**
- Create: `apps/indy-content-studio/features/backup/backup-schema.ts`
- Create: `apps/indy-content-studio/features/backup/export-dashboard.ts`
- Create: `apps/indy-content-studio/features/backup/import-dashboard.ts`
- Test: `apps/indy-content-studio/tests/dashboard-backup.test.ts`

**Interfaces:**
- Produces: `exportDashboardState`, `parseDashboardBackup`, `previewDashboardImport`, and `applyDashboardImport`.

- [ ] **Step 1: Write failing export tests**

```ts
const backup = exportDashboardState(state, fixtureClock);
expect(backup).toMatchObject({ product: "INDY Content Studio", schemaVersion: 1 });
expect(JSON.stringify(backup)).not.toContain("channel-secret");
expect(JSON.stringify(backup)).not.toContain("data:video");
```

- [ ] **Step 2: Write failing import tests**

Cover valid round-trip, invalid JSON, unsupported future version, missing IDs, duplicate IDs, broken references, merge ID collision, replace mode, and pre-restore backup creation.

- [ ] **Step 3: Run and verify failure**

Run: `pnpm test -- tests/dashboard-backup.test.ts`

Expected: FAIL.

- [ ] **Step 4: Implement the exact backup envelope**

```ts
export interface DashboardBackupV1 {
  product: "INDY Content Studio";
  schemaVersion: 1;
  exportedAt: string;
  data: Omit<DashboardState, "integrations"> & {
    integrations: Array<Pick<IntegrationStatus, "provider" | "status" | "checkedAt">>;
  };
  omittedMediaFiles: Array<{ mediaId: string; name: string; size: number }>;
}
```

Validate all IDs and cross-references before preview. Merge keeps current records on ID collision and reports each skipped record. Replace writes only after the caller saves the pre-restore backup.

- [ ] **Step 5: Run backup tests**

Run: `pnpm test -- tests/dashboard-backup.test.ts`

Expected: PASS.

### Task 2: Implement legacy INDY JSON and ideas import

**Files:**
- Create: `apps/indy-content-studio/features/backup/legacy-indy-import.ts`
- Create: `apps/indy-content-studio/features/backup/ideas-import.ts`
- Test: `apps/indy-content-studio/tests/legacy-import.test.ts`

**Interfaces:**
- Produces: `parseLegacyIndyExport(input)`, `parseIdeasImport(input)`, and an import report with mapped, skipped, and warning counts.

- [ ] **Step 1: Write fixture-based tests for accepted legacy aliases**

Accept top-level `contents` or `contentItems`, `media` or `assets`, `references` or `ideas`, and `captionTemplates` or `templates`. Map Thai status labels to canonical production statuses. Preserve unrecognized legacy values in `notes` under `ข้อมูลจากระบบเดิม` and report a warning.

- [ ] **Step 2: Write idea-import tests**

Accept an array of `{ title, url, platform?, tags? }`, require HTTPS URL, trim/deduplicate tags, skip exact duplicate URLs, and report row-specific validation errors.

- [ ] **Step 3: Run and verify failure**

Run: `pnpm test -- tests/legacy-import.test.ts`

Expected: FAIL.

- [ ] **Step 4: Implement pure parsers with no writes**

Return `{ previewState, report }`; do not mutate the repository. Reject files above 10 MB and nesting deeper than 20 levels before mapping.

- [ ] **Step 5: Run import tests**

Run: `pnpm test -- tests/legacy-import.test.ts`

Expected: PASS.

### Task 3: Finish Settings data tools and content trash

**Files:**
- Create: `apps/indy-content-studio/features/backup/components/DataManagementPanel.tsx`
- Create: `apps/indy-content-studio/features/content/components/ContentTrashPanel.tsx`
- Test: `apps/indy-content-studio/tests/data-management-panel.test.tsx`
- Test: `apps/indy-content-studio/tests/content-trash.test.tsx`
- Modify: `apps/indy-content-studio/features/settings/components/SettingsWorkspace.tsx`

**Interfaces:**
- Consumes: Tasks 1-2, repository provider, media blob store.
- Produces: backup download, restore preview, merge/replace, ideas import, content trash, restore, and permanent removal.

- [ ] **Step 1: Write UI tests for export, invalid file, preview, merge, replace confirmation, ideas report, trash, restore, and permanent delete**

```tsx
await user.upload(screen.getByLabelText("เลือกไฟล์สำรอง"), backupFile);
expect(screen.getByText("จะเพิ่มชิ้นงาน 4 รายการ")).toBeVisible();
await user.click(screen.getByRole("button", { name: "รวมข้อมูล" }));
expect(await screen.findByRole("status")).toHaveTextContent("นำเข้าสำเร็จ");
```

- [ ] **Step 2: Run UI tests and verify failure**

Run: `pnpm test -- tests/data-management-panel.test.tsx tests/content-trash.test.tsx`

Expected: FAIL.

- [ ] **Step 3: Implement data-management actions**

Download filename is `indy-content-studio-backup-YYYY-MM-DD.json`. Restore dialog shows counts, warnings, omitted media, and merge/replace differences. Replace requires typing `แทนที่ข้อมูล` and creates a downloadable pre-restore backup first.

- [ ] **Step 4: Implement content trash**

Deleting content sets `deletedAt`, removes it from active pages, and keeps referenced media. Trash shows deletion time, restore, and permanent delete. Permanent delete requires confirmation and removes orphaned process/publication records but never removes shared media automatically.

- [ ] **Step 5: Run the data tests**

Run: `pnpm test -- tests/data-management-panel.test.tsx tests/content-trash.test.tsx`

Expected: PASS.

### Task 4: Add browser acceptance and remove the final placeholders

**Files:**
- Create: `apps/indy-content-studio/playwright.config.ts`
- Create: `apps/indy-content-studio/e2e/full-content-lifecycle.spec.ts`
- Create: `apps/indy-content-studio/e2e/all-workspaces.spec.ts`
- Modify: `apps/indy-content-studio/package.json`
- Modify: `apps/indy-content-studio/pnpm-lock.yaml`
- Modify: `apps/indy-content-studio/app/page.tsx`
- Test: `apps/indy-content-studio/tests/dashboard-state-coverage.test.tsx`

**Interfaces:**
- Produces: `pnpm test:e2e` and the final cross-feature acceptance gate.

- [ ] **Step 1: Add pinned Playwright test dependency and script**

Run: `pnpm add -D @playwright/test@1.55.0`

Add script: `"test:e2e": "playwright test"`.

- [ ] **Step 2: Write an all-workspaces test that fails on placeholder copy**

Visit every navigation item, assert its unique primary heading and primary action, and assert the page never contains `กำลังจัดเตรียมพื้นที่งานนี้` or `จะแสดงข้อมูลเมื่อฟีเจอร์ส่วนนั้นพร้อมใช้งาน`.

- [ ] **Step 3: Write the full lifecycle test**

The scenario must: configure taxonomy and goal; upload media; add a reference and caption template; create content with process steps and schedules; verify Overview, Calendar, Action Plan, and Board; simulate LINE correction then approval through test adapters; simulate Make partial failure and retry; verify receipts; export backup; trash content; restore content; reload; and verify final state.

- [ ] **Step 4: Run E2E tests and verify the first meaningful failure**

Run: `pnpm test:e2e`

Expected before cleanup: FAIL on the first remaining integration or placeholder gap. Fix the product behavior, not the assertion, unless the assertion contradicts the shared spec.

- [ ] **Step 5: Remove obsolete sample and placeholder code**

Delete `DeferredWorkspace`, `DashboardPreview`, sample content arrays, and unused simplified editor components. Run `rg -n "กำลังจัดเตรียม|จะแสดงข้อมูลเมื่อ|const initialTasks|const content =" apps/indy-content-studio`; expected output is empty.

- [ ] **Step 6: Run accessibility and narrow-layout acceptance**

At 1440x900 and 390x844, navigate every workspace by keyboard, open/close every dialog with Escape, verify focus restoration, enable reduced motion, and confirm no page-level horizontal overflow. Capture screenshots for Overview, Calendar, Editor, Board, Corrections, Make, and Settings.

- [ ] **Step 7: Run the final verification gate**

Run: `pnpm test && pnpm typecheck && pnpm build && pnpm test:e2e`

Expected: all commands exit 0.

- [ ] **Step 8: Commit the final parity gate**

```bash
git add -- apps/indy-content-studio/features/backup apps/indy-content-studio/features/content/components/ContentTrashPanel.tsx apps/indy-content-studio/features/settings/components/SettingsWorkspace.tsx apps/indy-content-studio/app/page.tsx apps/indy-content-studio/tests/dashboard-backup.test.ts apps/indy-content-studio/tests/legacy-import.test.ts apps/indy-content-studio/tests/data-management-panel.test.tsx apps/indy-content-studio/tests/content-trash.test.tsx apps/indy-content-studio/tests/dashboard-state-coverage.test.tsx apps/indy-content-studio/playwright.config.ts apps/indy-content-studio/e2e apps/indy-content-studio/package.json apps/indy-content-studio/pnpm-lock.yaml
git commit -m "feat: complete INDY dashboard feature parity"
```

### Human acceptance

1. Follow the full lifecycle once with test integrations and once with all integrations disconnected.
2. Confirm every menu performs a persistent action and contains no placeholder workspace.
3. Restore a backup into a clean browser and verify all metadata returns while omitted media files are clearly listed.
4. Confirm a LINE correction and a Make partial failure remain attached to the correct content and platform after reload.
5. Compare the seven captured key screens against the approved soft-glass mockup and fix any interaction-blocking visual defect before sign-off.
