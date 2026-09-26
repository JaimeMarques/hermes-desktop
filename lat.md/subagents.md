# Subagent roster

Delegated children report their activity into the conversation that spawned them, so a subagent runs _inside_ the chat that asked for it instead of appearing as another sidebar session.

## Why it exists

A `delegate_task` fan-out creates a child session per worker, and those children are session rows in `state.db` with a `parent_session_id`. A sidebar that lists every session row shows them as separate conversations.

The gateway already relays the child's live activity to the PARENT session as `subagent.*` events (`tui_gateway/tool_progress.py::_progress_subagent` in hermes-agent), keyed by the parent's runtime session id. Child activity therefore belongs to the parent's view of the conversation: it is application state for the chat surface, not transcript content, and not a session of its own.

## Event projection and store

[[src/renderer/src/screens/Chat/subagents.ts]] projects gateway payloads into display rows: `applySubagentEvent` folds the live events into one row per `subagent_id`, and `reconcileSubagentSnapshot` merges the `subagent.list` roster for windows opened mid-run.

Rows are stored per session and exposed through `useSubagents`, a `useSyncExternalStore` subscription whose snapshot only changes identity when the rows change — a growing stream would otherwise re-render the composer on every chunk.

Two rules keep the model honest:

- **A completion event is terminal.** An unrecognized or still-`running` status on `subagent.complete` renders as `failed`, never as a row that spins forever (`timeout`/`error` → failed, `cancelled`/`canceled` → interrupted).
- **Absence is weak evidence.** `subagent.start` is relayed before the child registers in the roster registry, so an empty `subagent.list` snapshot must not retire the row a live event just created; the roster only retires a live row when it is answering about other children, and a row whose id was derived (no `subagent_id` on the wire) is never retired by absence at all.

`subagent.text` (the child's per-token reply) is deliberately not relayed to the parent, so the parent-side stream is built from tool, progress and thinking lines.

## Rendering above the composer

[[src/renderer/src/screens/Chat/SubagentSection.tsx]] renders the roster in the composer's input area, above the queued-message indicator. It shows only live rows: finished children are retired at the next turn boundary, while children that outlived their turn stay.

Expanding a row reveals the child's own stream, its live output tail (`subagent.tail`, polled only while the row is expanded and the window is visible) and controls that steer or stop it. A rejected request surfaces to the user instead of pretending it landed.

## Transport wiring

[[src/renderer/src/screens/Chat/hooks/useDashboardChatTransport.ts]] intercepts `subagent.*` events before they reach the message-stream adapter (they never append to the transcript) and keys the roster by the durable session id the chat is showing.

The roster RPCs (`subagent.list`, `subagent.steer`, `subagent.interrupt`, `subagent.tail`) are bound to this conversation's runtime session, so a control can never address whichever session happens to be active. `list` answers empty before the first turn rather than erroring, because a conversation without a runtime session cannot have a child.

## Verification

Tests cover the projection, the reconciliation guards and the section behaviour: `subagents.test.ts`, `SubagentSection.test.tsx`, and the roster cases in `useDashboardChatTransport.test.tsx`, including live-captured payloads.
