# INDY Full Content Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the simplified create modal and task drawer with the complete original create/edit workflow backed by shared persistent data.

**Architecture:** One `ContentDraft` model powers create and edit. Pure validation and conversion functions protect the domain; the editor composes reusable identity, media, process, caption, schedule, reference, notes, and approval sections.

**Tech Stack:** React, TypeScript, shared repository, Testing Library, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-18-indy-full-feature-parity-design.md`

## Global Constraints

- Requires Jobs 01 through 04.
- A maximum of 10 media assets can be attached.
- Video supports Facebook, Instagram, and TikTok; image and album support Facebook only.
- Editing caption or asset IDs after approval resets local and LINE approval.
- Closing a dirty editor requires explicit discard confirmation.

---

### Task 1: Implement draft validation and approval-reset rules

**Files:**
- Create: `apps/indy-content-studio/features/content/content-draft.ts`
- Create: `apps/indy-content-studio/features/content/content-commands.ts`
- Test: `apps/indy-content-studio/tests/content-draft.test.ts`
- Test: `apps/indy-content-studio/tests/content-commands.test.ts`

**Interfaces:**
- Produces: `ContentDraft`, `contentToDraft`, `validateContentDraft`, `saveContentDraft`, `getAllowedPlatforms`, and `hasApprovalSensitiveChanges`.

- [ ] **Step 1: Write failing validation tests**

```ts
expect(validateContentDraft(validVideoDraft, now)).toEqual({ valid: true, errors: {} });
expect(validateContentDraft({ ...validVideoDraft, title: "" }, now).errors.title).toBe("กรุณาระบุชื่อคอนเทนต์");
expect(validateContentDraft({ ...validImageDraft, schedules: [tiktokSchedule] }, now).errors.schedules).toBe("รูปแบบนี้ส่งได้เฉพาะ Facebook");
expect(validateContentDraft({ ...validVideoDraft, assetIds: elevenIds }, now).errors.assetIds).toBe("เลือกสื่อได้สูงสุด 10 รายการ");
```

- [ ] **Step 2: Write failing approval-reset tests**

```ts
const saved = saveContentDraft(approvedItem, { ...contentToDraft(approvedItem), caption: "แก้แคปชั่น" }, fixtureClock);
expect(saved.localApproval).toBe("pending");
expect(saved.lineReview.status).toBe("not-sent");
expect(saved.lineReview.history.at(-1)?.event).toBe("approval-reset");
```

- [ ] **Step 3: Run focused tests and verify failure**

Run: `pnpm test -- tests/content-draft.test.ts tests/content-commands.test.ts`

Expected: FAIL.

- [ ] **Step 4: Implement the exact draft shape**

```ts
export interface ContentDraft {
  title: string;
  categoryId: string;
  formatId: string;
  owner: string;
  objective: ContentItem["objective"];
  priority: ContentItem["priority"];
  plannedWorkAt: string;
  readyDate: string;
  productionStatus: ProductionStatus;
  assetIds: string[];
  processSteps: ProcessStep[];
  caption: string;
  schedules: PlatformSchedule[];
  referenceIds: string[];
  notes: string;
  localApproval: "pending" | "approved";
}
```

Return field-specific Thai errors. Schedule validation requires a date/time only for enabled platforms; past schedule is an error only when the user requests queueing, not when saving a draft.

- [ ] **Step 5: Implement immutable save rules and run tests**

Run: `pnpm test -- tests/content-draft.test.ts tests/content-commands.test.ts`

Expected: PASS.

### Task 2: Build the reusable full editor

**Files:**
- Create: `apps/indy-content-studio/features/content/components/ContentEditorDialog.tsx`
- Create: `apps/indy-content-studio/features/content/components/ContentIdentitySection.tsx`
- Create: `apps/indy-content-studio/features/content/components/ContentMediaSection.tsx`
- Create: `apps/indy-content-studio/features/content/components/ProcessStepsEditor.tsx`
- Create: `apps/indy-content-studio/features/content/components/CaptionEditorSection.tsx`
- Create: `apps/indy-content-studio/features/content/components/PlatformScheduleSection.tsx`
- Create: `apps/indy-content-studio/features/content/components/ContentApprovalSection.tsx`
- Test: `apps/indy-content-studio/tests/full-content-editor.test.tsx`
- Modify: `apps/indy-content-studio/app/page.tsx`
- Modify: `apps/indy-content-studio/app/globals.css`
- Remove: `apps/indy-content-studio/features/dashboard/components/CreateContentModal.tsx`
- Remove: `apps/indy-content-studio/features/dashboard/components/TaskDetailDrawer.tsx`

**Interfaces:**
- Consumes: Jobs 01-04 state and commands.
- Produces: `ContentEditorDialog({ mode, contentId, open, onClose })`.

- [ ] **Step 1: Write a create-flow test covering every editor section**

Fill identity, attach two library assets, add and date a process step, apply a caption template with values, enable three platforms, enter Thai schedules, attach a reference, add notes, save, and assert the repository contains the complete item.

- [ ] **Step 2: Write edit-flow tests**

Assert prefilled data, asset removal, step reorder, schedule disable, local approval, sensitive-change reset, dirty-close confirmation, Escape, focus trap, and focus restoration.

- [ ] **Step 3: Run the UI test and verify failure**

Run: `pnpm test -- tests/full-content-editor.test.tsx`

Expected: FAIL.

- [ ] **Step 4: Implement identity and production sections**

Use taxonomy options from repository state. Provide title, category, format, owner, objective, priority, planned work date/time, ready date, and all seven production statuses. Process steps support add, rename, date, status, move up/down, and delete with accessible controls.

- [ ] **Step 5: Implement media, caption-template, and reference pickers**

The media picker uses non-deleted library assets, previews selected order, and blocks the eleventh selection. The caption section displays character count and template render values. The reference picker supports multi-select and opens source links without leaving the editor.

- [ ] **Step 6: Implement platform schedules and readiness summary**

Display one row per allowed platform with enabled checkbox, Thai date, time, derived state, and current receipt if one exists. The readiness summary separately reports missing media, caption, approval, and enabled schedules.

- [ ] **Step 7: Replace create and task-detail edit entry points**

`สร้างคอนเทนต์` opens create mode. Clicking an item opens edit mode. Keep LINE send controls visible only as a real integration state: disconnected, not ready, or eligible; do not fake a send.

- [ ] **Step 8: Run focused regression tests**

Run: `pnpm test -- tests/full-content-editor.test.tsx tests/home-page.test.tsx tests/task-detail-drawer.test.tsx tests/create-content-modal.test.tsx`

Expected: PASS after replacing obsolete assertions with full-editor behavior. Delete obsolete components only after no import remains.

- [ ] **Step 9: Run the job verification gate**

Run: `pnpm test && pnpm typecheck && pnpm build`

Expected: all commands exit 0.

- [ ] **Step 10: Commit the finished content lifecycle**

```bash
git add -- apps/indy-content-studio/features/content apps/indy-content-studio/features/dashboard/components/CreateContentModal.tsx apps/indy-content-studio/features/dashboard/components/TaskDetailDrawer.tsx apps/indy-content-studio/app/page.tsx apps/indy-content-studio/app/globals.css apps/indy-content-studio/tests/content-draft.test.ts apps/indy-content-studio/tests/content-commands.test.ts apps/indy-content-studio/tests/full-content-editor.test.tsx apps/indy-content-studio/tests/home-page.test.tsx apps/indy-content-studio/tests/task-detail-drawer.test.tsx apps/indy-content-studio/tests/create-content-modal.test.tsx
git commit -m "feat: add complete content create and edit workflow"
```

### Human acceptance

1. Create a video with two assets, two process steps, a template caption, three platform schedules, a reference, and notes.
2. Reload and reopen it; verify every field and media order.
3. Approve locally, save, then edit the caption; verify approval resets with an explanation.
4. Create an album and verify Instagram and TikTok are unavailable.
5. Make an unsaved change, close, and verify discard confirmation and keyboard behavior.
