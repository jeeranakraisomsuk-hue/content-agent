# INDY Soft-Glass Dashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the INDY Content Studio reconstructed dashboard as a desktop-first, iPhone-inspired soft-glass content workspace while retaining its content and guarded LINE-delivery behavior.

**Architecture:** Keep the Next.js app as a client-led workspace with small presentational components and explicit view state. Put visual tokens in global CSS, isolate task interaction state in a dashboard hook, and retain the existing LINE eligibility and transport boundaries. The deployed orange site and LINE channel configuration remain out of scope.

**Tech Stack:** Next.js 15, React 19, TypeScript, Vitest, Testing Library, CSS custom properties.

**Spec:** `docs/superpowers/specs/2026-09-17-indy-soft-glass-dashboard-design.md`

## Global Constraints

- Work only in the isolated reconstructed-source worktree.
- Preserve the current dashboard destinations and functional scope.
- Desktop is the primary experience; mobile remains readable.
- Use the approved warm soft-glass system; do not make a smart-home clone or a generic SaaS grid.
- Rail labels appear on hover and keyboard focus.
- The primary overview action is `ทำงานล่าสุดต่อ`.
- LINE remains disabled without an eligible asset and caption, then requires confirmation before delivery to `PRIK GN`.
- Do not deploy, push GitHub, or alter LINE Developers settings.

---

## File structure

| File | Responsibility |
| --- | --- |
| `app/globals.css` | Warm canvas, glass tokens, responsive shell, focus and reduced-motion rules. |
| `app/AppShell.tsx` | Icon rail, hover labels, command capsule, desktop frame. |
| `features/dashboard/dashboard-model.ts` | Task types and deterministic priority-first ordering. |
| `features/dashboard/useDashboardWorkspace.ts` | Selected task, creation modal, confirmation dialog, resume-task state. |
| `features/dashboard/components/TodayOverview.tsx` | Priority-first schedule, mini calendar, approvals, LINE readiness. |
| `features/dashboard/components/TaskDetailDrawer.tsx` | Right-side task workflow drawer. |
| `features/dashboard/components/CreateContentModal.tsx` | Focused centered creation dialog. |
| `features/dashboard/components/LineSendConfirmation.tsx` | Guarded delivery confirmation and receipt/error feedback. |
| `app/page.tsx` | Workspace composition and sample-state wiring. |

All paths in this table are relative to `apps/indy-content-studio/`.

## Task 1: Model priority-first work and build the visual shell

**Files:**
- Create: `apps/indy-content-studio/features/dashboard/dashboard-model.ts`
- Create: `apps/indy-content-studio/tests/dashboard-model.test.ts`
- Modify: `apps/indy-content-studio/app/AppShell.tsx`
- Modify: `apps/indy-content-studio/app/globals.css`
- Modify: `apps/indy-content-studio/tests/app-shell.test.tsx`

**Interfaces:**
- Produce `DashboardTask`, `TaskPriority`, and `sortTasksForToday(tasks: DashboardTask[]): DashboardTask[]`.
- Produce a navigation control with accessible names and `data-tooltip` labels.

- [ ] **Step 1: Write failing model and shell tests**

```tsx
expect(sortTasksForToday(tasks).map((task) => task.id)).toEqual(["urgent", "early", "later"]);
expect(screen.getByRole("button", { name: "ภาพรวมและเป้าหมาย" }))
  .toHaveAttribute("data-tooltip", "ภาพรวมและเป้าหมาย");
expect(screen.getByPlaceholderText("ค้นหาไฟล์ งาน หรือไอเดีย")).toBeVisible();
```

- [ ] **Step 2: Run the tests to confirm failure**

Run: `pnpm --dir apps/indy-content-studio vitest run tests/dashboard-model.test.ts tests/app-shell.test.tsx`

Expected: FAIL because the dashboard model, tooltip rail, and command capsule do not exist.

- [ ] **Step 3: Implement model and shell**

Define priorities `urgent | high | normal | low`; sort by priority then `scheduledTime`. Replace text-only navigation with icon-backed buttons that retain accessible labels. Add the top profile/search/notification capsule. Define canvas, glass, ink, sage, coral, border, and focus tokens; add a reduced-motion media rule.

- [ ] **Step 4: Verify and commit**

Run: `pnpm --dir apps/indy-content-studio vitest run tests/dashboard-model.test.ts tests/app-shell.test.tsx && pnpm --dir apps/indy-content-studio typecheck`

Expected: PASS.

```bash
git add apps/indy-content-studio/features/dashboard/dashboard-model.ts apps/indy-content-studio/tests/dashboard-model.test.ts apps/indy-content-studio/app/AppShell.tsx apps/indy-content-studio/app/globals.css apps/indy-content-studio/tests/app-shell.test.tsx
git commit -m "feat: add soft glass dashboard shell"
```

## Task 2: Build the Today overview and resume workflow

**Files:**
- Create: `apps/indy-content-studio/features/dashboard/components/TodayOverview.tsx`
- Create: `apps/indy-content-studio/features/dashboard/useDashboardWorkspace.ts`
- Modify: `apps/indy-content-studio/app/page.tsx`
- Create: `apps/indy-content-studio/tests/today-overview.test.tsx`

**Interfaces:**
- `TodayOverview` consumes `{ tasks, onOpenTask, onResumeLatest, state }`.
- `useDashboardWorkspace(tasks)` produces `selectedTaskId`, `openTask`, `closeTask`, `resumeLatest`, `isCreateOpen`, and `setCreateOpen`.

- [ ] **Step 1: Write failing overview tests**

```tsx
render(<TodayOverview tasks={tasks} state="ready" onOpenTask={vi.fn()} onResumeLatest={vi.fn()} />);
expect(screen.getByRole("heading", { name: "กำหนดการวันนี้" })).toBeVisible();
expect(screen.getByRole("button", { name: "ทำงานล่าสุดต่อ" })).toBeVisible();
expect(screen.getAllByTestId("today-task").map((node) => node.dataset.taskId))
  .toEqual(["urgent", "early"]);
```

- [ ] **Step 2: Run the test to confirm failure**

Run: `pnpm --dir apps/indy-content-studio vitest run tests/today-overview.test.tsx`

Expected: FAIL because the priority-first overview does not exist.

- [ ] **Step 3: Implement the overview**

Render sorted clickable cards with thumbnail label, title, time, status, and urgency. Put the resume button next to the heading. Add the compact calendar, pending-approval count, and LINE readiness panel as lower-emphasis right-column panels. Implement `loading`, `empty`, `error`, and `ready` states; empty state says `ยังไม่มีงานสำหรับวันนี้`, error state includes `ลองใหม่`.

- [ ] **Step 4: Verify and commit**

Run: `pnpm --dir apps/indy-content-studio vitest run tests/today-overview.test.tsx tests/dashboard-preview.test.tsx && pnpm --dir apps/indy-content-studio typecheck`

Expected: PASS.

```bash
git add apps/indy-content-studio/features/dashboard/components/TodayOverview.tsx apps/indy-content-studio/features/dashboard/useDashboardWorkspace.ts apps/indy-content-studio/app/page.tsx apps/indy-content-studio/tests/today-overview.test.tsx
git commit -m "feat: add priority-first today overview"
```

## Task 3: Add task drawer and centered creation modal

**Files:**
- Create: `apps/indy-content-studio/features/dashboard/components/TaskDetailDrawer.tsx`
- Create: `apps/indy-content-studio/features/dashboard/components/CreateContentModal.tsx`
- Modify: `apps/indy-content-studio/app/page.tsx`
- Create: `apps/indy-content-studio/tests/task-detail-drawer.test.tsx`
- Create: `apps/indy-content-studio/tests/create-content-modal.test.tsx`

**Interfaces:**
- `TaskDetailDrawer` consumes `{ task: DashboardTask | null; onClose(); onRequestSend() }`.
- `CreateContentModal` consumes `{ open; onClose(); onCreate(input) }`, where input contains title, category, format, owner, objective, caption, scheduledTime, and notes.

- [ ] **Step 1: Write failing drawer and modal tests**

```tsx
render(<TaskDetailDrawer task={task} onClose={close} onRequestSend={vi.fn()} />);
expect(screen.getByRole("dialog", { name: "รายละเอียด ตัดต่อคลิป Reels" })).toBeVisible();
await user.click(screen.getByRole("button", { name: "ปิดรายละเอียดงาน" }));
expect(close).toHaveBeenCalledOnce();

render(<CreateContentModal open onClose={vi.fn()} onCreate={create} />);
await user.type(screen.getByLabelText("ชื่อชิ้นงาน"), "รีวิวสินค้า");
await user.click(screen.getByRole("button", { name: "สร้างงาน" }));
expect(create).toHaveBeenCalledWith(expect.objectContaining({ title: "รีวิวสินค้า" }));
```

- [ ] **Step 2: Run tests to confirm failure**

Run: `pnpm --dir apps/indy-content-studio vitest run tests/task-detail-drawer.test.tsx tests/create-content-modal.test.tsx`

Expected: FAIL because neither interaction surface exists.

- [ ] **Step 3: Implement the interaction surfaces**

Drawer: render only for a selected task, use `role="dialog"`, preserve the overview behind it, and expose stage, assets, caption, schedule, review, and delivery action. Modal: use a centered glass dialog and progressive sections for identity, production, delivery, and notes. Require title and show an inline validation message on an empty submission.

- [ ] **Step 4: Verify and commit**

Run: `pnpm --dir apps/indy-content-studio vitest run tests/task-detail-drawer.test.tsx tests/create-content-modal.test.tsx && pnpm --dir apps/indy-content-studio test`

Expected: PASS.

```bash
git add apps/indy-content-studio/features/dashboard/components/TaskDetailDrawer.tsx apps/indy-content-studio/features/dashboard/components/CreateContentModal.tsx apps/indy-content-studio/app/page.tsx apps/indy-content-studio/tests/task-detail-drawer.test.tsx apps/indy-content-studio/tests/create-content-modal.test.tsx
git commit -m "feat: add dashboard task workflow surfaces"
```

## Task 4: Add LINE confirmation, verify states, and perform visual audit

**Files:**
- Create: `apps/indy-content-studio/features/dashboard/components/LineSendConfirmation.tsx`
- Modify: `apps/indy-content-studio/features/content/components/ContentEditor.tsx`
- Modify: `apps/indy-content-studio/features/dashboard/components/TaskDetailDrawer.tsx`
- Modify: `apps/indy-content-studio/tests/dashboard-preview.test.tsx`
- Create: `apps/indy-content-studio/tests/line-send-confirmation.test.tsx`
- Create: `apps/indy-content-studio/tests/dashboard-state-coverage.test.tsx`

**Interfaces:**
- `LineSendConfirmation` consumes `{ task, open, onCancel, onConfirm: () => Promise<void> }`.
- It uses existing `canSendToLine({ assetState, caption })` and never embeds credentials.

- [ ] **Step 1: Write failing confirmation and state tests**

```tsx
render(<LineSendConfirmation task={readyTask} open onCancel={vi.fn()} onConfirm={confirm} />);
expect(screen.getByText("PRIK GN")).toBeVisible();
expect(screen.getByText("แคปชันตัวอย่าง")).toBeVisible();
await user.click(screen.getByRole("button", { name: "ยืนยันส่ง" }));
expect(confirm).toHaveBeenCalledOnce();

render(<TodayOverview tasks={[]} state="empty" onOpenTask={vi.fn()} onResumeLatest={vi.fn()} />);
expect(screen.getByText("ยังไม่มีงานสำหรับวันนี้")).toBeVisible();
```

- [ ] **Step 2: Run tests to confirm failure**

Run: `pnpm --dir apps/indy-content-studio vitest run tests/line-send-confirmation.test.tsx tests/dashboard-state-coverage.test.tsx`

Expected: FAIL because confirmation and full state coverage do not exist.

- [ ] **Step 3: Implement guarded delivery and all states**

Do not open confirmation for an ineligible task. For eligible tasks show file preview/label, caption preview, recipient `PRIK GN`, cancel, and `ยืนยันส่ง`. While confirmation is pending, disable double-submit; show receipt after success and actionable retry after failure. Keep existing disabled-send tests passing. Ensure all prior destinations remain available from the rail.

- [ ] **Step 4: Complete verification**

Run: `pnpm --dir apps/indy-content-studio test && pnpm --dir apps/indy-content-studio typecheck && pnpm --dir apps/indy-content-studio build`

Expected: PASS.

Manual visual checklist: desktop composition; hover/focus rail label; reduced motion; contrast; empty/loading/error states; drawer; create modal; disabled LINE action; confirmation; success receipt; failure retry.

- [ ] **Step 5: Commit**

```bash
git add apps/indy-content-studio/features/dashboard/components/LineSendConfirmation.tsx apps/indy-content-studio/features/content/components/ContentEditor.tsx apps/indy-content-studio/features/dashboard/components/TaskDetailDrawer.tsx apps/indy-content-studio/tests/line-send-confirmation.test.tsx apps/indy-content-studio/tests/dashboard-state-coverage.test.tsx apps/indy-content-studio/tests/dashboard-preview.test.tsx
git commit -m "feat: confirm guarded LINE delivery"
```

## Plan self-review

- Spec coverage: Task 1 implements the approved shell; Task 2 the priority-first overview; Task 3 the drawer and centered creation flow; Task 4 the LINE confirmation, all states, and final quality checks.
- Placeholder scan: no incomplete tasks, placeholder markers, or undefined interfaces.
- Type consistency: later components consume `DashboardTask` and the workspace interfaces introduced in Tasks 1 and 2.

