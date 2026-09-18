# Task 3 — Task drawer and creation modal

## Delivered

- Added `TaskDetailDrawer`, a right-side, non-blocking glass dialog for the selected task. It presents the current production stage, asset/caption/review placeholders, schedule, draft control, and a future delivery-action boundary through `onRequestSend`.
- Added `CreateContentModal`, a centered glass dialog with progressive identity, production, publishing, and notes sections. It collects the required title, category, format, owner, objective, caption, scheduled time, and notes fields.
- Title is validated inline. A valid submit invokes only `onCreate(input)`; the modal does not import, render, open, or invoke a LINE confirmation.
- Wired both surfaces into `app/page.tsx`. The page now owns a mutable today-task list: submitting a new task creates and selects it, then closes the creation modal. Existing selection and the continuation panel remain available.
- Added focused component tests for drawer visibility/close/delivery callback and modal closed state, validation, and create payload.

## TDD evidence

1. Added the component test files before their production components existed.
2. Verified the red state: both test suites failed because `TaskDetailDrawer` and `CreateContentModal` imports could not be resolved.
3. Implemented the smallest components and page wiring required by those behaviors.
4. Verified green: the two targeted suites pass with 5 tests.

## Verification

- `vitest run tests/task-detail-drawer.test.tsx tests/create-content-modal.test.tsx`: 2 files / 5 tests passed.
- Full `vitest run`: 19 files / 37 tests passed.
- `tsc --noEmit`: blocked by pre-existing `tests/line-webhook-worker.test.ts(3,20)` missing declaration for the repository-root `worker.js`; Task 3 introduces no TypeScript diagnostic in its files.
- `git diff --check`: no whitespace errors.

## Scope and follow-up

No LINE configuration or confirmation implementation was changed. The drawer's `onRequestSend` callback is intentionally a no-op at page level until Task 4 supplies the guarded confirmation flow. Task creation remains isolated from that flow by construction.
