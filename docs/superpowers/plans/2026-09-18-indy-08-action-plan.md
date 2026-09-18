# INDY Action Plan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the week/month Action Plan with user-defined production steps, rescheduling, and persistent status transitions.

**Architecture:** Process steps remain embedded in their content item so content editing and Action Plan cannot diverge. Selectors flatten those steps into dated task cards; commands update the referenced step immutably.

**Tech Stack:** React, TypeScript, shared repository, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-18-indy-full-feature-parity-design.md`

## Global Constraints

- Requires Jobs 01 and 05.
- Canonical statuses are `todo`, `doing`, and `done`.
- Undated steps remain visible in an unscheduled section.
- Updating a step from Action Plan must immediately appear in the content editor.

---

### Task 1: Implement Action Plan selectors and commands

**Files:**
- Create: `apps/indy-content-studio/features/action-plan/action-plan-selectors.ts`
- Create: `apps/indy-content-studio/features/action-plan/action-plan-commands.ts`
- Test: `apps/indy-content-studio/tests/action-plan-model.test.ts`

**Interfaces:**
- Produces: `selectActionPlan(state, { mode, anchorDate, filters })`, `setProcessStepStatus`, and `rescheduleProcessStep`.

- [ ] **Step 1: Write failing view-model tests**

```ts
expect(selectActionPlan(state, { mode: "week", anchorDate: "2026-09-18", filters }).days).toHaveLength(7);
expect(view.unscheduled.map((step) => step.stepId)).toContain("step-without-date");
expect(view.summary).toEqual({ todo: 2, doing: 1, done: 3 });
```

Cover Sunday/Monday boundaries using Monday as week start, month boundaries, owner filters, deleted content, and stable sorting.

- [ ] **Step 2: Write failing command tests**

Assert status transition, date change, missing content ID, missing step ID, and immutability of untouched content.

- [ ] **Step 3: Run and verify failure**

Run: `pnpm test -- tests/action-plan-model.test.ts`

Expected: FAIL.

- [ ] **Step 4: Implement and rerun the model tests**

Run: `pnpm test -- tests/action-plan-model.test.ts`

Expected: PASS.

### Task 2: Build the complete Action Plan workspace

**Files:**
- Create: `apps/indy-content-studio/features/action-plan/components/ActionPlanWorkspace.tsx`
- Create: `apps/indy-content-studio/features/action-plan/components/ProcessStepCard.tsx`
- Create: `apps/indy-content-studio/features/action-plan/components/RescheduleStepDialog.tsx`
- Test: `apps/indy-content-studio/tests/action-plan-workspace.test.tsx`
- Modify: `apps/indy-content-studio/app/page.tsx`
- Modify: `apps/indy-content-studio/app/globals.css`

**Interfaces:**
- Consumes: Task 1, repository provider, content editor.
- Produces: working `action-plan` workspace.

- [ ] **Step 1: Write UI tests for week/month switch, navigation, filters, status movement, reschedule, unscheduled steps, and editor opening**

```tsx
await user.click(screen.getByRole("button", { name: "เริ่มทำ ตัดต่อ" }));
expect(screen.getByRole("button", { name: "ทำเสร็จ ตัดต่อ" })).toBeEnabled();
await user.click(screen.getByRole("button", { name: "ทำเสร็จ ตัดต่อ" }));
expect(screen.getByText("เสร็จแล้ว")).toBeVisible();
```

- [ ] **Step 2: Run the UI test and verify failure**

Run: `pnpm test -- tests/action-plan-workspace.test.tsx`

Expected: FAIL.

- [ ] **Step 3: Implement header, summary, and views**

Provide segmented week/month controls, previous/today/next navigation, owner/status filters, summary counts, dated columns, and unscheduled section. Each card shows content title, step name, owner, date, and status.

- [ ] **Step 4: Implement complete interactions**

Expose `เริ่มทำ`, `ทำเสร็จ`, `กลับไปรอทำ`, `เลื่อนวัน`, and `เปิดชิ้นงาน`. Confirm before moving a completed step to another date. Persist every action and announce save result.

- [ ] **Step 5: Implement empty/loading/error/narrow states**

The month view may horizontally scroll inside its panel, but the overall page must not overflow. Reduced-motion mode removes card movement animation.

- [ ] **Step 6: Replace the placeholder, verify, and commit**

Run: `pnpm test && pnpm typecheck && pnpm build`

Expected: all commands exit 0.

```bash
git add apps/indy-content-studio/features/action-plan apps/indy-content-studio/app apps/indy-content-studio/tests
git commit -m "feat: add working action plan"
```

### Human acceptance

1. Add three custom steps to one content item, leaving one undated.
2. Verify week and month views place the dated steps correctly and show the undated step separately.
3. Move a step through all three statuses.
4. Reschedule it and confirm the content editor shows the same date and status.
5. Reload and confirm the plan remains unchanged.
