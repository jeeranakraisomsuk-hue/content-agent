# Task 4 — Guarded LINE delivery confirmation

## Delivered

- Added `LineSendConfirmation`, a centered warm soft-glass modal reachable only through a selected saved task's `TaskDetailDrawer` action.
- The confirmation presents the selected file label/preview treatment, caption preview, recipient `PRIK GN`, cancel, and explicit confirmation controls.
- Reused `canSendToLine` at both boundaries: the drawer disables the delivery action for a task without an asset and non-empty caption, and the confirmation refuses to render for an ineligible task.
- Prevented duplicate sends by disabling confirmation and cancellation while the submission promise is pending.
- Added post-submission receipt UI, persistent saved-task delivery receipt/status, and a safe retry control after a rejected submission.
- Kept `CreateContentModal` and `ContentEditor` outside the confirmation workflow. No LINE server/configuration/credential files were changed.

## Test coverage

- `line-send-confirmation.test.tsx`: preview/recipient and confirmation, pending duplicate prevention, success receipt, failure/retry, and ineligible guard.
- `task-detail-drawer.test.tsx`: disabled ineligible action and persisted delivery receipt.
- `dashboard-state-coverage.test.tsx`: loading, empty, and error dashboard states.
- `dashboard-preview.test.tsx`: the existing preview send surface remains disabled and never opens the confirmation.

## Verification

- `pnpm test` passed: 21 test files, 48 tests.
- `pnpm build` passed.
- `pnpm typecheck` remains blocked by a pre-existing missing declaration for the root `worker.js` imported by `tests/line-webhook-worker.test.ts` (`TS7016`). This task did not modify that worker or its tests.

## Scope and concerns

- Delivery remains an interface-level guarded workflow; it does not add a real LINE push or change credentials/configuration.
- The production build emits existing CSS autoprefixer warnings for `start`/`end` flex alignment values. The build completes successfully.

## Follow-up review fix

- Reset the confirmation's transient `ready`/`pending`/`success`/`error` state whenever it closes or receives a different task ID.
- Added a regression test covering both a successful and failed first submission, then closing and reopening for another eligible task. Each reopened delivery presents an enabled `ยืนยันส่ง` action again.
- Re-ran the full Vitest suite after the change: 21 test files and 50 tests passed.
