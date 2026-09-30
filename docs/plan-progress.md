# Plan progress and execution lifecycle

A plan tracks checked task results across chat turns. An active AI turn is a separate lifecycle. An approved plan must not display an endless build spinner just because some steps are still unconfirmed. A finished/interrupted turn also must not mark those steps complete.

## State contract

- Database plans/steps are authoritative; `.doable/plan.md` mirrors the latest snapshot for context. Every step has a stable ID, and each committed change advances the plan revision.
- `get_plan` supplies current IDs and results. Execution can report pending, in_progress, completed, skipped or failed through `mark_step_complete`; its omitted status retains the previous completed behavior. Planning does not expose progress mutation tools.
- Completion means the agent checked a result. Progress is the ratio of completed/skipped steps, not elapsed build time or a tool-call count. Skips remain distinguishable from completed results.
- `update_plan` changes order/scope without resetting surviving IDs/statuses. Repeated reports are idempotent; completed/skipped steps must be explicitly reopened to in_progress before changing a terminal result.
- Writers lock the parent plan and commit steps/status/revision atomically. Reports cannot update another project's plan or an unrelated step. HTTP reads/writes require project membership; viewers cannot approve/edit/abandon plans. Approval retries never reset progress.
- SSE updates carry whole persisted snapshots. Clients reject older revisions and snapshots for another project, and recover from the API on mount, focus, visibility/online changes and execution transitions; active runs also reconcile every eight seconds. Snapshot requests time out after ten seconds and retry transient failures with bounded backoff. Recovery never resubmits AI work.
- Without an active run, an unfinished plan displays paused/unconfirmed; failed steps need attention. Old plans with no recorded reports stay unconfirmed. No historical completion is guessed.

## Scenarios to verify

Initial approval and execution; work across multiple turns; finishing a later step first; reordering/renaming/adding/removing steps; failure and retry; repeated reports; competing writes; approval failure/retry; missed SSE/reload; stale revision; unrelated project; execution ending before all steps are checked.

Run the pure tests in `services/api/src/ai/plan-state.test.ts` and `apps/web/src/modules/editor/chat/plan/plan-state.test.ts`. `plan-store.integration.test.ts` requires a disposable PostgreSQL database and isolated project directory; never run it on the production database.

## Design references

- [Codex App Server](https://developers.openai.com/codex/app-server): turn lifecycle events are distinct from `turn/plan/updated`; pending/inProgress/completed plans can change during a turn.
- [Claude Code interactive mode](https://code.claude.com/docs/en/interactive-mode) and [tools reference](https://code.claude.com/docs/en/tools-reference): persistent task lists and explicit TaskCreate/TaskUpdate, separate from background task processes.
- [OpenClaw agent loop](https://docs.openclaw.ai/concepts/agent-loop): stable run IDs and explicit lifecycle/settled state; a wait timeout does not imply cancellation.

These references support separating result state from execution state, with recovery from durable data. They do not guarantee that every provider or transport failure can never delay progress.
