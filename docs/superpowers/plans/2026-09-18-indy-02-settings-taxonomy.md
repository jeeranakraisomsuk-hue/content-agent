# INDY Settings and Taxonomy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Settings a complete workspace for categories, formats, approval rules, monthly goals, and truthful connection diagnostics.

**Architecture:** Pure commands enforce usage-aware deletion and immutable updates. Integration health is fetched from a server route that returns status and safe messages only; credentials remain in environment-backed adapters.

**Tech Stack:** Next.js route handlers, React 19, TypeScript, repository provider from Job 01, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-18-indy-full-feature-parity-design.md`

## Global Constraints

- Requires Job 01.
- Used categories and formats cannot be deleted.
- Names are trimmed and compared case-insensitively for duplicates.
- Integration responses must not contain secret values or environment variable names.

---

### Task 1: Add taxonomy and monthly-goal commands

**Files:**
- Create: `apps/indy-content-studio/features/settings/settings-commands.ts`
- Test: `apps/indy-content-studio/tests/settings-commands.test.ts`

**Interfaces:**
- Produces: `addCategory`, `renameCategory`, `setCategoryApprovalRequired`, `deleteCategory`, `addFormat`, `renameFormat`, `deleteFormat`, and `setMonthlyGoal`.

- [ ] **Step 1: Write command tests for every allowed and blocked mutation**

```ts
expect(() => addCategory(state, " รีวิว ")).toThrow("มีหมวดนี้อยู่แล้ว");
expect(() => deleteCategory(stateWithUsedCategory, usedId)).toThrow("หมวดนี้มีชิ้นงานใช้อยู่");
expect(setCategoryApprovalRequired(state, categoryId, true).categories.find((item) => item.id === categoryId)?.requiresApproval).toBe(true);
expect(setMonthlyGoal(state, "2026-09", 20).monthlyGoals[0]).toMatchObject({ month: "2026-09", target: 20 });
```

- [ ] **Step 2: Run the focused test and verify missing exports**

Run: `pnpm test -- tests/settings-commands.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement pure commands with stable IDs injected by caller**

Each add function receives `{ id, now }`; tests use fixed values. Return a new `DashboardState`. Reject blank names, duplicates, goal values below zero, and deletion of an ID referenced by non-deleted content.

- [ ] **Step 4: Run the command test**

Run: `pnpm test -- tests/settings-commands.test.ts`

Expected: PASS.

### Task 2: Implement safe integration health checks

**Files:**
- Create: `apps/indy-content-studio/features/integrations/server/integration-health.ts`
- Create: `apps/indy-content-studio/app/api/integrations/health/route.ts`
- Test: `apps/indy-content-studio/tests/integration-health-route.test.ts`

**Interfaces:**
- Produces: `GET /api/integrations/health` returning `{ integrations: Array<{ provider, status, checkedAt, message }> }`.

- [ ] **Step 1: Write route tests for connected, disconnected, and provider failure states**

```ts
const payload = await response.json();
expect(payload.integrations).toContainEqual(expect.objectContaining({ provider: "google-sheets", status: "disconnected" }));
expect(JSON.stringify(payload)).not.toContain("secret-value");
```

- [ ] **Step 2: Run the route test and verify failure**

Run: `pnpm test -- tests/integration-health-route.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement adapter injection and sanitized responses**

Check Google Sheets, Google Drive, LINE, Make, TikTok, online media, and AI caption providers. Map exceptions to `status: "error"` with the fixed Thai message `ตรวจการเชื่อมต่อไม่สำเร็จ` and never pass exception text to the client.

- [ ] **Step 4: Run the route test**

Run: `pnpm test -- tests/integration-health-route.test.ts`

Expected: PASS.

### Task 3: Build the complete Settings workspace

**Files:**
- Create: `apps/indy-content-studio/features/settings/components/SettingsWorkspace.tsx`
- Create: `apps/indy-content-studio/tests/settings-workspace.test.tsx`
- Modify: `apps/indy-content-studio/app/page.tsx`
- Modify: `apps/indy-content-studio/app/globals.css`

**Interfaces:**
- Consumes: Job 01 `useDashboardData`, Task 1 commands, Task 2 route.
- Produces: working `settings` navigation workspace.

- [ ] **Step 1: Write UI tests for add, rename, approval toggle, blocked delete, format media kind, monthly goal, and health refresh**

```tsx
await user.click(screen.getByRole("button", { name: "เพิ่มหมวด" }));
await user.type(screen.getByLabelText("ชื่อหมวด"), "เบื้องหลัง");
await user.click(screen.getByRole("button", { name: "บันทึกหมวด" }));
expect(await screen.findByText("เบื้องหลัง")).toBeVisible();
```

Add keyboard assertions for dialog focus, Escape, and focus restoration.

- [ ] **Step 2: Run the UI test and verify failure**

Run: `pnpm test -- tests/settings-workspace.test.tsx`

Expected: FAIL.

- [ ] **Step 3: Implement Settings in four visible sections**

Sections: `หมวดคอนเทนต์`, `รูปแบบ`, `เป้าหมายรายเดือน`, and `การเชื่อมต่อ`. Use inline status text after every mutation. Disable deletion with an accessible explanation when an item is in use. The diagnostics button must expose loading, success, error, and disconnected states.

- [ ] **Step 4: Replace the settings placeholder and style it with existing material tokens**

Do not introduce a second design system. At 1280px show two columns; below 760px use one column with no horizontal page overflow.

- [ ] **Step 5: Run the job verification gate**

Run: `pnpm test && pnpm typecheck && pnpm build`

Expected: all commands exit 0.

- [ ] **Step 6: Commit the finished Settings workspace**

```bash
git add apps/indy-content-studio/features/settings apps/indy-content-studio/features/integrations apps/indy-content-studio/app apps/indy-content-studio/tests
git commit -m "feat: add working settings and taxonomy"
```

### Human acceptance

1. Add and rename a category, toggle its approval rule, reload, and confirm all values persist.
2. Attempt to delete a category used by content and confirm the UI explains why it is blocked.
3. Add a format and select its media kind.
4. Save a goal for the current month and confirm it survives reload.
5. Run connection diagnostics and confirm disconnected providers are reported without displaying any credential field.
