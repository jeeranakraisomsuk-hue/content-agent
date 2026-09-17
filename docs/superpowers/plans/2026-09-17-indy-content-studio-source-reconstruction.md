# INDY Content Studio Source Reconstruction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a separately testable source checkout that reproduces the existing INDY Content Studio dashboard before the approved LINE OA delivery feature is added.

**Architecture:** A Next.js App Router dashboard reads the existing database only through server-side repositories and renders the current navigation, overview, content list, and content editor from sanitised view models. It is developed in a separate checkout and never deploys over the live site without a comparison and explicit approval.

**Tech Stack:** TypeScript, Next.js App Router, React, Vitest, Supabase/PostgreSQL.

**Spec:** `docs/superpowers/specs/2026-09-17-indy-content-studio-source-reconstruction-design.md`

## Global Constraints

- Do not mutate the existing dashboard database during reconstruction.
- Do not deploy or replace the live site without explicit approval.
- Preserve the current information architecture and labels visible in the live dashboard.
- Read authoritative content from the server; never expose credentials to the browser.
- Keep the send control disabled unless a stored asset and non-empty caption are both present.
- The LINE OA design in `2026-09-17-dashboard-to-line-oa-single-recipient-design.md` begins only after the reconstruction verification gate.

---

### Task 1: Establish the isolated dashboard application

**Files:**
- Create: `apps/indy-content-studio/package.json`
- Create: `apps/indy-content-studio/tsconfig.json`
- Create: `apps/indy-content-studio/next.config.ts`
- Create: `apps/indy-content-studio/app/layout.tsx`
- Create: `apps/indy-content-studio/app/page.tsx`
- Create: `apps/indy-content-studio/tests/app-shell.test.tsx`

**Interfaces:**
- Produces: `AppShell({ children }: { children: React.ReactNode })` and the root dashboard route.
- Consumes: no live credentials or database writes.

- [ ] **Step 1: Write the failing shell test**

```tsx
it('renders the INDY navigation labels', () => {
  render(<AppShell><main>content</main></AppShell>);
  expect(screen.getByRole('button', { name: 'ภาพรวมและเป้าหมาย' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'บอร์ดการผลิต' })).toBeVisible();
});
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `pnpm --dir apps/indy-content-studio vitest run tests/app-shell.test.tsx`

Expected: FAIL because the application shell does not exist.

- [ ] **Step 3: Add the minimal application shell**

```tsx
export function AppShell({ children }: { children: React.ReactNode }) {
  return <div><nav>{['ภาพรวมและเป้าหมาย', 'ปฏิทินคอนเทนต์', 'Action Plan', 'บอร์ดการผลิต', 'งานที่ต้องแก้', 'คลังสื่อ', 'Reference และไอเดีย', 'แม่แบบแคปชั่น', 'ส่งโพสต์ผ่าน Make', 'ตั้งค่าและข้อมูล'].map((label) => <button key={label}>{label}</button>)}</nav>{children}</div>;
}
```

- [ ] **Step 4: Re-run the test and production typecheck**

Run: `pnpm --dir apps/indy-content-studio vitest run tests/app-shell.test.tsx && pnpm --dir apps/indy-content-studio typecheck`

Expected: PASS.

- [ ] **Step 5: Commit the isolated shell**

Run: `git add apps/indy-content-studio && git commit -m "feat: scaffold INDY content studio source"`

### Task 2: Add read-only dashboard view models and overview

**Files:**
- Create: `apps/indy-content-studio/features/dashboard/server/dashboard-types.ts`
- Create: `apps/indy-content-studio/features/dashboard/server/dashboard-repository.ts`
- Create: `apps/indy-content-studio/features/dashboard/components/OverviewPage.tsx`
- Modify: `apps/indy-content-studio/app/page.tsx`
- Create: `apps/indy-content-studio/tests/dashboard-repository.test.ts`
- Create: `apps/indy-content-studio/tests/overview-page.test.tsx`

**Interfaces:**
- Produces: `getDashboardOverview(): Promise<DashboardOverview>` and `OverviewPage({ overview }: { overview: DashboardOverview })`.
- Consumes: the existing workspace state and content records through a read-only database client.

- [ ] **Step 1: Write failing repository and page tests**

```ts
it('maps persisted content into overview counts without issuing writes', async () => {
  const db = createReadOnlyFakeDb([sampleContent]);
  const overview = await getDashboardOverview(db);
  expect(overview.plannedCount).toBe(1);
  expect(db.writeCalls).toHaveLength(0);
});
```

```tsx
it('shows planned, completed, and published counters', () => {
  render(<OverviewPage overview={sampleOverview} />);
  expect(screen.getByText('ในแผน')).toBeVisible();
  expect(screen.getByText('ผลิตเสร็จ')).toBeVisible();
  expect(screen.getByText('เผยแพร่จริงครบช่องทาง')).toBeVisible();
});
```

- [ ] **Step 2: Run the focused tests and confirm failure**

Run: `pnpm --dir apps/indy-content-studio vitest run tests/dashboard-repository.test.ts tests/overview-page.test.tsx`

Expected: FAIL because no view models or repository exist.

- [ ] **Step 3: Implement read-only mapping**

```ts
export async function getDashboardOverview(db: DashboardReadClient): Promise<DashboardOverview> {
  const items = await db.listContent();
  return summarizeContent(items);
}
```

The repository contract exposes only `listContent()` and must not include insert, update, delete, or raw credential access.

- [ ] **Step 4: Re-run tests and verify no writes**

Run: `pnpm --dir apps/indy-content-studio vitest run tests/dashboard-repository.test.ts tests/overview-page.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit the overview**

Run: `git add apps/indy-content-studio && git commit -m "feat: render read-only INDY overview"`

### Task 3: Reconstruct content list and production status views

**Files:**
- Create: `apps/indy-content-studio/features/content/components/ContentTable.tsx`
- Create: `apps/indy-content-studio/features/content/components/ProductionBoard.tsx`
- Create: `apps/indy-content-studio/features/content/server/content-view-model.ts`
- Modify: `apps/indy-content-studio/app/page.tsx`
- Create: `apps/indy-content-studio/tests/content-table.test.tsx`
- Create: `apps/indy-content-studio/tests/production-board.test.tsx`

**Interfaces:**
- Produces: `toContentRow(item): ContentRow` and filtered content-table and production-board components.
- Consumes: read-only content rows from Task 2.

- [ ] **Step 1: Write failing UI tests**

```tsx
it('shows title, category, format, ready date, caption state, and status', () => {
  render(<ContentTable items={[sampleRow]} />);
  expect(screen.getByText(sampleRow.title)).toBeVisible();
  expect(screen.getByText(sampleRow.status)).toBeVisible();
});
```

```tsx
it('groups items by production status', () => {
  render(<ProductionBoard items={[readyRow, editingRow]} />);
  expect(screen.getByText('พร้อมโพสต์')).toBeVisible();
  expect(screen.getByText('ตัดต่อ')).toBeVisible();
});
```

- [ ] **Step 2: Run the focused tests and confirm failure**

Run: `pnpm --dir apps/indy-content-studio vitest run tests/content-table.test.tsx tests/production-board.test.tsx`

Expected: FAIL because the components do not exist.

- [ ] **Step 3: Implement deterministic view-model mapping and views**

```ts
export function toContentRow(item: PersistedContent): ContentRow {
  return { id: item.id, title: item.title, category: item.category, format: item.format, readyDate: item.readyDate, captionState: item.caption ? 'เขียนแล้ว' : 'ยังไม่เขียน', status: item.status };
}
```

- [ ] **Step 4: Re-run focused tests**

Run: `pnpm --dir apps/indy-content-studio vitest run tests/content-table.test.tsx tests/production-board.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit the content views**

Run: `git add apps/indy-content-studio && git commit -m "feat: reconstruct INDY content views"`

### Task 4: Reconstruct the guarded content send surface

**Files:**
- Create: `apps/indy-content-studio/features/content/components/ContentEditor.tsx`
- Create: `apps/indy-content-studio/features/content/send-eligibility.ts`
- Create: `apps/indy-content-studio/tests/send-eligibility.test.ts`
- Create: `apps/indy-content-studio/tests/content-editor.test.tsx`

**Interfaces:**
- Produces: `canSendToLine({ assetState, caption }): boolean` and `ContentEditor` with a disabled send control.
- Consumes: the current asset readiness and caption text; it does not call LINE or mutate the existing database in this task.

- [ ] **Step 1: Write failing eligibility and editor tests**

```ts
it.each([
  [{ assetState: 'missing', caption: 'พร้อมแล้ว' }, false],
  [{ assetState: 'ready', caption: '   ' }, false],
  [{ assetState: 'ready', caption: 'พร้อมแล้ว' }, true],
])('returns %s for the current content state', (input, expected) => {
  expect(canSendToLine(input)).toBe(expected);
});
```

```tsx
it('disables the LINE action until asset and caption are ready', () => {
  render(<ContentEditor assetState="missing" caption="ข้อความ" />);
  expect(screen.getByRole('button', { name: 'ส่งเข้า LINE OA' })).toBeDisabled();
});
```

- [ ] **Step 2: Run the focused tests and confirm failure**

Run: `pnpm --dir apps/indy-content-studio vitest run tests/send-eligibility.test.ts tests/content-editor.test.tsx`

Expected: FAIL because the guard and component do not exist.

- [ ] **Step 3: Implement the minimal guard and editor**

```ts
export function canSendToLine(input: { assetState: 'missing' | 'uploading' | 'ready'; caption: string }): boolean {
  return input.assetState === 'ready' && input.caption.trim().length > 0;
}
```

- [ ] **Step 4: Re-run tests and typecheck**

Run: `pnpm --dir apps/indy-content-studio vitest run tests/send-eligibility.test.ts tests/content-editor.test.tsx && pnpm --dir apps/indy-content-studio typecheck`

Expected: PASS.

- [ ] **Step 5: Commit the guarded send surface**

Run: `git add apps/indy-content-studio && git commit -m "feat: recreate guarded LINE send surface"`

### Task 5: Compare against the live dashboard before LINE OA work

**Files:**
- Create: `docs/indy-content-studio-reconstruction-checklist.md`
- Modify: `apps/indy-content-studio/README.md`
- Test: `apps/indy-content-studio/tests/app-shell.test.tsx`

**Interfaces:**
- Consumes: Tasks 1-4 and the live dashboard.
- Produces: a reviewed parity checklist and an explicit go/no-go boundary for the LINE OA plan.

- [ ] **Step 1: Write the failing navigation parity test**

```tsx
it('contains all ten live dashboard navigation entries', () => {
  render(<AppShell><main /></AppShell>);
  expect(screen.getAllByRole('button')).toHaveLength(10);
});
```

- [ ] **Step 2: Run it and confirm the current count**

Run: `pnpm --dir apps/indy-content-studio vitest run tests/app-shell.test.tsx`

Expected: PASS only when the ten visible navigation entries are present.

- [ ] **Step 3: Document the comparison gate**

The checklist must require: navigation parity, overview counts compared with the existing database, sample content status comparison, disabled send state comparison, and an explicit user approval before deployment.

- [ ] **Step 4: Run the reconstruction test gate**

Run: `pnpm --dir apps/indy-content-studio vitest run && pnpm --dir apps/indy-content-studio typecheck`

Expected: PASS with no database writes and no deployment.

- [ ] **Step 5: Commit the comparison gate**

Run: `git add apps/indy-content-studio docs/indy-content-studio-reconstruction-checklist.md && git commit -m "test: add INDY reconstruction comparison gate"`

## Plan self-review

- Isolated source and no deployment: Task 1 and Task 5.
- Existing data remains read-only: Task 2.
- Existing overview, content list, and production workflow: Tasks 2-3.
- Asset-and-caption send gating: Task 4.
- Verified comparison before LINE OA or deployment: Task 5.
