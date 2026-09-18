# INDY Content Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the monthly content calendar with scheduling, moving, unscheduling, unscheduled work, and per-platform publication states.

**Architecture:** A pure calendar selector builds month cells and schedule chips from canonical content. Explicit commands perform date changes; drag-and-drop and accessible move controls call the same command.

**Tech Stack:** React, native HTML drag events, TypeScript, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-18-indy-full-feature-parity-design.md`

## Global Constraints

- Requires Jobs 01, 02, and 05.
- A drag action must always have an equivalent keyboard-accessible move action.
- Moving a calendar item changes platform dates while retaining their times.
- Unscheduling clears selected platform dates but does not delete content.

---

### Task 1: Implement calendar selectors and scheduling commands

**Files:**
- Create: `apps/indy-content-studio/features/calendar/calendar-selectors.ts`
- Create: `apps/indy-content-studio/features/calendar/calendar-commands.ts`
- Test: `apps/indy-content-studio/tests/calendar-model.test.ts`

**Interfaces:**
- Produces: `buildCalendarMonth`, `getPlatformScheduleState`, `moveContentSchedules`, and `unscheduleContent`.

- [ ] **Step 1: Write failing selector tests**

```ts
expect(getPlatformScheduleState(pastWithoutReceipt, now)).toBe("overdue");
expect(getPlatformScheduleState(futureSchedule, now)).toBe("scheduled");
expect(getPlatformScheduleState(withReceipt, now)).toBe("published");
expect(buildCalendarMonth(state, filters).unscheduled.map((item) => item.id)).toContain("content-without-date");
```

Cover month leading/trailing days, timezone boundary, disabled platforms, partial receipts, filters, and deleted content.

- [ ] **Step 2: Write command tests for move and unschedule**

Moving from September 2 to September 5 must preserve `09:00` for every selected enabled platform. Unscheduling one platform must leave the others unchanged.

- [ ] **Step 3: Run tests and verify failure**

Run: `pnpm test -- tests/calendar-model.test.ts`

Expected: FAIL.

- [ ] **Step 4: Implement selectors and commands, then rerun tests**

Run: `pnpm test -- tests/calendar-model.test.ts`

Expected: PASS.

### Task 2: Build the interactive calendar workspace

**Files:**
- Create: `apps/indy-content-studio/features/calendar/components/ContentCalendarWorkspace.tsx`
- Create: `apps/indy-content-studio/features/calendar/components/CalendarMonthGrid.tsx`
- Create: `apps/indy-content-studio/features/calendar/components/MoveScheduleDialog.tsx`
- Test: `apps/indy-content-studio/tests/content-calendar.test.tsx`
- Modify: `apps/indy-content-studio/app/page.tsx`
- Modify: `apps/indy-content-studio/app/globals.css`

**Interfaces:**
- Consumes: Task 1, content editor, repository provider.
- Produces: working `calendar` workspace.

- [ ] **Step 1: Write UI tests for month navigation, filters, drag, explicit move, unschedule, and open-editor actions**

```tsx
await user.click(screen.getByRole("button", { name: "ย้ายวัน 3 จุดที่ทำให้ไล่เฟดไม่เนียน" }));
await user.clear(screen.getByLabelText("วันที่ใหม่"));
await user.type(screen.getByLabelText("วันที่ใหม่"), "2026-09-05");
await user.click(screen.getByRole("button", { name: "ยืนยันการย้าย" }));
expect(screen.getByLabelText("5 กันยายน 2026")).toHaveTextContent("3 จุดที่ทำให้ไล่เฟดไม่เนียน");
```

- [ ] **Step 2: Run the UI test and verify failure**

Run: `pnpm test -- tests/content-calendar.test.tsx`

Expected: FAIL.

- [ ] **Step 3: Implement the calendar header and grid**

Provide previous/next month, category/format/owner filters, create action, seven-column grid, visible today marker, and readable out-of-month cells. Each content card shows title plus Facebook, Instagram, and TikTok chips in neutral/scheduled/overdue/published states.

- [ ] **Step 4: Implement drag and accessible menu actions**

Dragging a card to a date invokes `moveContentSchedules`. The card menu exposes `เปิดชิ้นงาน`, `ย้ายวัน`, and `ลบจากแผน`. The move dialog lets the user choose affected platforms and validates the destination date.

- [ ] **Step 5: Implement the unscheduled area and all async states**

Cards with no enabled scheduled date appear under `ยังไม่กำหนดวัน`. They can be assigned through the same move dialog. Render empty calendar, empty filter results, save error with retry, and a live success announcement.

- [ ] **Step 6: Replace the placeholder, verify, and commit**

Run: `pnpm test && pnpm typecheck && pnpm build`

Expected: all commands exit 0.

```bash
git add apps/indy-content-studio/features/calendar apps/indy-content-studio/app apps/indy-content-studio/tests
git commit -m "feat: add interactive content calendar"
```

### Human acceptance

1. Create one scheduled and one unscheduled item.
2. Move the scheduled item by drag and then by the move dialog; confirm times remain unchanged.
3. Unschedule only TikTok and confirm Facebook and Instagram stay on the calendar.
4. Assign the unscheduled item to a day.
5. Reload and confirm every calendar change persists.
