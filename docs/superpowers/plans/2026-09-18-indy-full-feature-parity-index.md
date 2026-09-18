# INDY Full Feature Parity Execution Index

> **For agentic workers:** Execute exactly one linked plan at a time. Use the model assignment in the table below. The worker must read the shared spec and the selected plan before changing code.

**Goal:** Provide a deterministic sequence of independently reviewable jobs that takes the soft-glass dashboard from a partial mock to full verified parity with the original INDY Content Studio.

**Shared Spec:** `docs/superpowers/specs/2026-09-18-indy-full-feature-parity-design.md`

## Execution Rules

1. Start from the latest accepted commit on `codex/indy-source-reconstruction`.
2. Run `pnpm test`, `pnpm typecheck`, and `pnpm build` before each job; stop if the baseline is red. Job 01 has one recorded exception: `pnpm typecheck` currently reports only TS7016 for the root `worker.js`; Job 01 Task 0 removes that exception before domain work begins.
3. Execute only one plan per task/thread. Do not begin the next plan automatically.
4. Follow TDD: failing focused test, minimal implementation, focused pass, full verification.
5. Preserve unrelated user changes. Never reset or overwrite the worktree.
6. End each job with its own commit and the plan's human acceptance checklist.
7. Do not report an external send or publication as successful unless a provider receipt was returned.
8. Before every commit, run `git status --short`, stage only paths named in that job's `Files` blocks, and inspect `git diff --cached --check`; never use a repository-wide `git add -A`.

## Model Allocation

- Use `gpt-5.6-sol` with `high` reasoning for architecture, cross-system invariants, credentials, webhooks, publishing, migration, and final review.
- Use `gpt-5.6-terra` with `high` reasoning for bounded UI work whose domain interfaces were fixed by an earlier accepted job.
- Do not move a Sol-assigned job to Luna merely to save quota. If Sol quota is unavailable, pause that job and continue only with an independent Terra-assigned job.

## Ordered Jobs

| Order | Job | Model | Plan | Finished outcome |
|---|---|---|---|---|
| 01 | Domain and persistence | Sol · high | `2026-09-18-indy-01-domain-persistence.md` | One durable repository and shared workspace state |
| 02 | Settings and taxonomy | Terra · high | `2026-09-18-indy-02-settings-taxonomy.md` | Working categories, formats, goals, and connection diagnostics |
| 03 | Media library | Sol · high | `2026-09-18-indy-03-media-library.md` | Upload/link/tag/preview/trash/restore plus provider URLs |
| 04 | References and templates | Terra · high | `2026-09-18-indy-04-references-caption-templates.md` | Working idea library and versioned caption templates |
| 05 | Content editor | Sol · high | `2026-09-18-indy-05-content-editor.md` | Full create/edit workflow connected to repository |
| 06 | Overview | Terra · high | `2026-09-18-indy-06-overview.md` | Real goals, metrics, search, filters, and table |
| 07 | Content calendar | Terra · high | `2026-09-18-indy-07-content-calendar.md` | Working month plan, move, unschedule, and platform states |
| 08 | Action Plan | Terra · high | `2026-09-18-indy-08-action-plan.md` | Working week/month process-step planner |
| 09 | Production board | Terra · high | `2026-09-18-indy-09-production-board.md` | Seven-column board with persistent transitions |
| 10 | LINE review and corrections | Sol · high | `2026-09-18-indy-10-line-review-corrections.md` | Send, webhook, review state, correction, and resubmit loop |
| 11 | Make publishing | Sol · high | `2026-09-18-indy-11-make-publishing.md` | Per-platform queue, retry, partial failure, and receipts |
| 12 | Backup, migration, and acceptance | Sol · high | `2026-09-18-indy-12-backup-migration-acceptance.md` | Old-data import, backup/restore, trash, and full parity gate |

## Completion Gate

The project is complete only after Job 12 passes and all ten navigation workspaces contain a working, persistent user flow. A green test suite without the human acceptance run is insufficient.
