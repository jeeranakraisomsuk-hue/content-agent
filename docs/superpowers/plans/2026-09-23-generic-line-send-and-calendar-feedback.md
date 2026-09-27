# Generic LINE Send and Calendar Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the global LINE action send a newly uploaded image/video and caption to the single paired OA recipient, while keeping ordinary work creation separate and date-only.

**Architecture:** Add a standalone three-field LINE composer that saves a canonical content record and reuses the authenticated LINE send API. Keep ordinary work creation as planning-only, project its date into the calendar and a default Action Plan step, and remove the task-bound LINE action. Preserve existing visual style and calendar month controls.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Vitest, Testing Library, Neon-backed dashboard repository, Google Drive media upload, LINE Messaging API.

**Spec:** `docs/superpowers/specs/2026-09-23-generic-line-send-composer-design.md`

## Global Constraints

- The composer has exactly three user-entered fields: one photo/video, caption, and posting date.
- The date is calendar metadata only; a confirmed LINE delivery is immediate and never date-triggered.
- The recipient is the one encrypted LINE account paired with this OA; do not accept a browser-supplied recipient ID or display name.
- Uploading or saving never sends a message; success is shown only after LINE accepts the push.
- Preserve the current dashboard visual language and avoid unrelated restyling.

## Review Focus

- A date-only value stays the same day in the calendar and Action Plan across browser timezones.
- A local-only, failed, unsupported, or oversized file never reaches the LINE send endpoint.
- Empty caption or date is explained near the relevant composer field and prevents confirmation.
- Missing authentication or paired recipient cannot upload-and-send as if the account were ready.
- A repeated or uncertain confirmation reuses the saved content ID and revision instead of creating a second message.

---

### Task 1: Separate planning fields from LINE media and preserve Action Plan entries

**Files:**
- Modify: `apps/indy-content-studio/features/dashboard/components/CreateContentModal.tsx`
- Modify: `apps/indy-content-studio/features/dashboard/dashboard-model.ts`
- Modify: `apps/indy-content-studio/app/home-page-view.tsx`
- Test: `apps/indy-content-studio/tests/create-content-modal.test.tsx`
- Test: `apps/indy-content-studio/tests/dashboard-task-adapter.test.ts`
- Test: `apps/indy-content-studio/tests/home-page.test.tsx`

**Interfaces:**
- `CreateContentInput` carries `plannedDate: string` and no file or caption fields; the ordinary-work objective remains part of the task form.
- `DashboardTask` carries `processSteps: ProcessStep[]` so mapping a task back to content does not erase its Action Plan steps.
- A newly created ordinary task gets one `todo` step named `เตรียมงาน`, scheduled on `plannedDate` or unscheduled when the date is blank.

- [ ] **Step 1: Write failing form and adapter tests.** Update the creation-modal test:

```tsx
expect(screen.queryByLabelText("ไฟล์แนบ")).not.toBeInTheDocument();
expect(screen.queryByLabelText("แคปชัน")).not.toBeInTheDocument();
expect(screen.getByLabelText("วันที่ลงในปฏิทิน")).toHaveAttribute("type", "date");
```

Add an adapter test that asserts `dashboardTaskToContent(task, state, now).plannedWorkAt === "2026-09-23"` and preserves `task.processSteps`.
- [ ] **Step 2: Run the focused tests and confirm the intended failures.** Run `pnpm exec vitest run tests/create-content-modal.test.tsx tests/dashboard-task-adapter.test.ts`; expected failures are the still-rendered file/caption controls, datetime field, and dropped `processSteps`.
- [ ] **Step 3: Make the smallest implementation.** Map `plannedDate` to the task's existing date-only schedule value and initialize one step only for newly created ordinary work:

```ts
processSteps: [{ id: `step-${taskId}`, name: "เตรียมงาน", scheduledDate: plannedDate || null, status: "todo", order: 0 }]
```

Remove the file and caption controls from `CreateContentModal`, preserve `processSteps` in both dashboard adapters, and do not open the task drawer automatically after creation.
- [ ] **Step 4: Run the focused tests.** Re-run the two focused files plus the affected home-page test; expected result is all pass and a created date-only item is saved without media or caption.

### Task 2: Add the generic LINE composer and decouple delivery from the selected task

**Files:**
- Create: `apps/indy-content-studio/features/dashboard/components/LineSendComposer.tsx`
- Modify: `apps/indy-content-studio/app/home-page-view.tsx`
- Modify: `apps/indy-content-studio/features/dashboard/components/TaskDetailDrawer.tsx`
- Modify: `apps/indy-content-studio/features/dashboard/components/LineSendConfirmation.tsx`
- Modify: `apps/indy-content-studio/app/globals.css`
- Test: `apps/indy-content-studio/tests/line-send-composer.test.tsx`
- Test: `apps/indy-content-studio/tests/home-page.test.tsx`
- Test: `apps/indy-content-studio/tests/task-detail-drawer.test.tsx`
- Test: `apps/indy-content-studio/tests/line-send-confirmation.test.tsx`

**Interfaces:**
- `LineSendDraft = { file: File; caption: string; plannedDate: string }`.
- `LineSendComposer` receives `open`, paired-recipient/authentication status, `onCancel`, and `onSubmit(draft): Promise<void>`.
- On successful upload and save, `HomePageContent` supplies the saved generic task and its persisted `updatedAt` to the existing LINE confirmation component.
- The existing `POST /api/line/send` payload remains exactly `{ contentId, expectedUpdatedAt }`.

- [ ] **Step 1: Write failing composer and home-page tests.** Assert the global **ส่งงานใน LINE** button opens the composer with no selected task or existing content, the only entry controls are media/caption/date, missing values block submit, and a successful image draft is saved before the LINE confirmation appears:

```tsx
fireEvent.click(screen.getByRole("button", { name: "ส่งงานใน LINE" }));
expect(await screen.findByRole("dialog", { name: "ส่งงานใน LINE" })).toBeVisible();
expect(screen.getByLabelText("ไฟล์รูปหรือคลิป")).toBeVisible();
expect(screen.getByLabelText("แคปชัน")).toBeVisible();
expect(screen.getByLabelText("วันที่ลง")).toHaveAttribute("type", "date");
expect(screen.queryByLabelText("ชื่อชิ้นงาน")).not.toBeInTheDocument();
```
- [ ] **Step 2: Run the focused tests and confirm they fail for the missing generic flow.** Run `pnpm exec vitest run tests/line-send-composer.test.tsx tests/home-page.test.tsx`; expected failure is that the CTA still requires a selected task and `LineSendComposer` does not exist.
- [ ] **Step 3: Implement the composer and server-backed submission.** Use the draft boundary:

```ts
export interface LineSendDraft {
  file: File;
  caption: string;
  plannedDate: string;
}
```

Accept one JPEG/PNG/MP4 up to `MAX_MEDIA_BYTES`, require caption and date, show pairing/auth status, upload through `uploadMediaToGoogleDrive`, persist the asset and canonical content item, and open the existing confirmation only after the media is remotely ready. Preserve the draft and show a safe error on upload/save failure.
- [ ] **Step 4: Remove task-bound sending.** Remove the LINE send action and connection-only props from `TaskDetailDrawer`; make the dashboard LINE entry always open the generic composer; add the planned date and immediate-send explanation to the confirmation preview.
- [ ] **Step 5: Run focused tests.** Re-run the composer, home-page, drawer, upload, and confirmation tests; verify exactly one `/api/line/send` request with the saved ID/revision and no browser-provided media URL or recipient.

### Task 3: Finish compact Action Plan controls and verify calendar projections

**Files:**
- Modify: `apps/indy-content-studio/features/action-plan/components/ActionPlanWorkspace.tsx`
- Modify: `apps/indy-content-studio/app/globals.css`
- Test: `apps/indy-content-studio/tests/action-plan-workspace.test.tsx`
- Test: `apps/indy-content-studio/tests/content-calendar.test.tsx`

**Interfaces:**
- Action Plan view buttons are a labeled group with `aria-pressed` states; week/month selection behavior is unchanged.
- Calendar month arrows and the separate **สร้างชิ้นงานใหม่** action remain available and continue using the shared creation flow.

- [ ] **Step 1: Add failing accessibility and projection tests.** Assert the week/month controls form a labeled group and exactly one is pressed; assert an ordinary new task with a date appears on that calendar date and its default step appears in Action Plan.
- [ ] **Step 2: Run the focused tests and confirm the expected failures.** Run `pnpm exec vitest run tests/action-plan-workspace.test.tsx tests/content-calendar.test.tsx tests/home-page.test.tsx`.
- [ ] **Step 3: Add a restrained segmented-control treatment.** Add a dedicated class to the existing two buttons and style only their wrapper, pressed state, and focus-visible state:

```css
.action-plan-view-toggle button[aria-pressed="true"] {
  background: rgba(135, 156, 129, .22);
  color: var(--focus);
  font-weight: 700;
}
```

Do not alter unrelated page layout.
- [ ] **Step 4: Run the focused tests.** Re-run the three files and confirm month navigation/create buttons retain their existing behavior.

### Task 4: Verify the full flow and current dashboard states

**Files:**
- Test: `apps/indy-content-studio/tests/line-send-composer.test.tsx`
- Test: `apps/indy-content-studio/tests/home-page.test.tsx`
- Test: `apps/indy-content-studio/tests/create-content-modal.test.tsx`
- Test: `apps/indy-content-studio/tests/action-plan-workspace.test.tsx`

- [ ] **Step 1: Run all tests.** Run `pnpm test` from `apps/indy-content-studio` and fix regressions in the affected flow before proceeding.
- [ ] **Step 2: Run static checks and production build.** Run `pnpm typecheck` and `pnpm build` from `apps/indy-content-studio`.
- [ ] **Step 3: Check state coverage and the rendered dashboard.** Run the webapp UI state-coverage script and the visual smoke script against the local dashboard; manually inspect keyboard order, disabled pairing state, validation errors, upload failure, pending send, success, mobile layout, and horizontal overflow.
- [ ] **Step 4: Deploy only after local checks pass.** Use the already linked Vercel production project and verify the public page, month navigation, generic composer, and Action Plan controls. Do not send a live LINE message until there is a specific non-sensitive file and caption and the paired recipient is confirmed to be the requested PRIK GN chat.

## Worktree Safety

This worktree already contains unrelated modified and untracked files. Do not stage or commit those changes. Keep implementation edits limited to the files listed under each task; review any overlapping diff before deployment.
