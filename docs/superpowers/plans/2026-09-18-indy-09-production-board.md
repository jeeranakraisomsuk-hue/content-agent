# INDY Production Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the read-only grouping with a complete seven-column production board whose transitions persist and remain synchronized with every other workspace.

**Architecture:** A selector groups canonical content by the seven production statuses. Drag, keyboard movement, and status menus invoke the same guarded command and persist through the shared repository.

**Tech Stack:** React, native drag events, TypeScript, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-18-indy-full-feature-parity-design.md`

## Global Constraints

- Requires Jobs 01, 02, and 05.
- Columns are `รอถ่าย`, `ถ่ายแล้ว`, `ตัดต่อ`, `รอตรวจ`, `ต้องแก้`, `พร้อมโพสต์`, and `เผยแพร่แล้ว` in that order.
- Dragging must have an equivalent keyboard-accessible status menu.
- `เผยแพร่แล้ว` requires verified receipts for every enabled platform.

---

### Task 1: Implement board selectors and guarded transitions

**Files:**
- Create: `apps/indy-content-studio/features/production/production-board-model.ts`
- Test: `apps/indy-content-studio/tests/production-board-model.test.ts`

**Interfaces:**
- Produces: `selectProductionBoard(state, filters)`, `canMoveContentToStatus(content, status)`, and `moveContentToStatus(state, contentId, status, now)`.

- [ ] **Step 1: Write failing grouping and transition tests**

```ts
expect(board.columns.map((column) => column.status)).toEqual([
  "waiting-shoot", "shot", "editing", "review", "needs-changes", "ready", "published",
]);
expect(() => moveContentToStatus(state, draftId, "published", now)).toThrow("ยังไม่มีหลักฐานเผยแพร่ครบทุกช่องทาง");
expect(moveContentToStatus(state, readyId, "editing", now).contents.find((item) => item.id === readyId)?.productionStatus).toBe("editing");
```

Cover combined filters, deleted content, stable card ordering, partial publication, and missing content ID.

- [ ] **Step 2: Run the model test and verify failure**

Run: `pnpm test -- tests/production-board-model.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement pure board functions**

Cards expose ID, title, category, format, owner, ready date, caption readiness, correction count, and enabled-platform receipt summary. A status move updates `updatedAt` but does not rewrite schedules, steps, or approvals.

- [ ] **Step 4: Run model tests**

Run: `pnpm test -- tests/production-board-model.test.ts`

Expected: PASS.

### Task 2: Build the complete production board

**Files:**
- Replace: `apps/indy-content-studio/features/content/components/ProductionBoard.tsx`
- Create: `apps/indy-content-studio/features/production/components/ProductionBoardWorkspace.tsx`
- Create: `apps/indy-content-studio/features/production/components/ProductionCard.tsx`
- Test: `apps/indy-content-studio/tests/production-board-workspace.test.tsx`
- Modify: `apps/indy-content-studio/app/page.tsx`
- Modify: `apps/indy-content-studio/app/globals.css`

**Interfaces:**
- Consumes: Task 1, repository provider, content editor.
- Produces: working `production-board` workspace.

- [ ] **Step 1: Write UI tests for filters, counts, drag, menu transition, blocked publication, editor open, and save error**

```tsx
await user.click(screen.getByRole("button", { name: "เปลี่ยนสถานะ รีวิวผลงานนักเรียน" }));
await user.click(screen.getByRole("menuitem", { name: "ตัดต่อ" }));
expect(screen.getByRole("region", { name: "ตัดต่อ" })).toHaveTextContent("รีวิวผลงานนักเรียน");
```

- [ ] **Step 2: Run the UI test and verify failure**

Run: `pnpm test -- tests/production-board-workspace.test.tsx`

Expected: FAIL.

- [ ] **Step 3: Implement header and seven columns**

Provide month, category, format, owner filters and a create action. Each column shows status name and count. Each card shows verified metadata and has a single clear primary action to open the content editor.

- [ ] **Step 4: Implement drag and accessible movement**

Use drop targets with visible focus and drag-over states. The status menu lists all seven statuses, disables the current state, and explains why `เผยแพร่แล้ว` is blocked when receipts are incomplete.

- [ ] **Step 5: Implement responsive and repository states**

Desktop columns scroll inside the board. Narrow layouts switch to a status selector plus one visible column. Render loading, empty, filtered-empty, save error, and live success states.

- [ ] **Step 6: Remove the sample board, verify, and commit**

Run: `pnpm test && pnpm typecheck && pnpm build`

Expected: all commands exit 0.

```bash
git add -- apps/indy-content-studio/features/content/components/ProductionBoard.tsx apps/indy-content-studio/features/production apps/indy-content-studio/app/page.tsx apps/indy-content-studio/app/globals.css apps/indy-content-studio/tests/production-board-model.test.ts apps/indy-content-studio/tests/production-board-workspace.test.tsx
git commit -m "feat: add persistent production board transitions"
```

### Human acceptance

1. Move one item through the first six statuses using both drag and the status menu.
2. Try to mark it published without receipts and confirm the move is blocked with a reason.
3. Filter by owner and verify all seven counts update.
4. Open the card, edit its ready date, and confirm the board card updates immediately.
5. Reload and confirm the selected status persists.
