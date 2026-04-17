# TooDoo Refactor Plan

Grounded against actual files: Overlay.tsx=812 lines, desktop sync.ts=364, mobile sync=327, 12 useStates in Overlay, only `tests/main/` exists (no renderer or mobile tests).

## Guiding principles

- **Parity first, then extraction.** Fix mobile gaps so both apps behave identically, *then* promote shared code — extracting divergent behavior just codifies drift.
- **One refactor, one behavior.** Each phase changes structure OR behavior, not both. Keeps blame-bisectable.
- **Tests lead risky phases.** Renderer state and sync rewrites land *after* characterization tests cover current behavior.
- **Nothing ships half-done.** Every phase must leave the app green and releasable — no long-lived branches.

---

## Phase 0 — Safety net (½ day)

- Confirm desktop Playwright suite green on `b6ebde8`.
- Add Vitest + jsdom for renderer; write characterization tests on `Overlay.tsx` (add → broadcast, edit → save, minimize timer). Not for coverage — for regression detection.
- Add Jest + RTL in `mobile/`; one smoke test on `TasksScreen`.
- Tag `refactor-baseline`.

## Phase 1 — Shared core hardening (2–3 days)

Fix the actual bugs that a refactor would otherwise paper over.

- **`src/shared/supabase-types.ts`**: move legacy-category (`project` → `timed`) migration out of `sanitizeTasks` and into `fromTaskRow` so desktop and mobile both pick it up at the mapper. One place, not two.
- **`src/shared/validation.ts`**: change `validateTaskFields` to return `Result<null>` instead of `string | null`. Ripple through `tasks.ts`, mobile `taskStore.ts`.
- **`src/shared/ipc.ts` + `src/preload/index.ts`**: replace `as Promise<T>` casts with a typed `invoke<TChannel>()` helper keyed to a `ChannelMap` type. Compile-time check on main↔renderer shapes.
- **Merge combinator**: extract `mergeCacheByUpdatedAt<T>(local, remote, idFn, tsFn)` into `src/shared/merge.ts`. Replace the three copies in `sync.ts:179–323` and the mobile copy.

Exit: no new features, only signatures changed, all tests green.

## Phase 2 — Sync robustness (3 days, desktop + mobile lockstep)

- **Typed error reasons**: `doUpsert` returns `{ ok: true } | { ok: false; reason: 'network' | 'auth' | 'validation' | 'unknown' }`. Propagate through `syncStatus` as a discriminated union.
- **Auth health check on 401/403** in mobile `sync.ts:63–95` (port desktop's `maybeCheckAuth`).
- **Dirty ID tracking in mobile**: mirror desktop's `dirtyIds` + `getDirtyCount()`. Add mobile SyncDot.
- **Connectivity race (mobile sync.ts:101)**: check online state *inside* the push chain, not before enqueuing.
- **Watermark**: leave all-or-nothing for now; TODO with per-entity retry design, don't build yet.

Exit: `sync-engine.test.ts` extended for error reasons; new mobile `sync.test.ts`.

## Phase 3 — Overlay decomposition (2–3 days)

`Overlay.tsx` at 812 lines with 12 useStates is the biggest risk area. Split, don't rewrite.

- `useTaskList()` hook: fetch + `onTasksChanged` subscription + sorting.
- `useMinimizeTimer()` hook: focus-mode timer + scorching override.
- `useTaskEditing()` hook: reducer (`start`, `change`, `save`, `cancel`).
- Overlay.tsx becomes a thin composition shell (<300 lines).
- No Zustand on desktop yet — reassess only if cross-component sharing appears.

Exit: Phase 0 characterization tests pass; Playwright unchanged.

## Phase 4 — Mobile prop-drilling fix + Result adoption (2 days)

- `TasksScreen → CategorySection → TaskCard` passes ~19 props. Extract a Zustand slice `taskInteractionStore` for `{ editingTaskId, editForm, armedForDelete, noteArmedForDelete }`.
- Adopt `Result<T>` across mobile stores (parity with Phase 1). Screens show specific error toasts instead of silent null.

## Phase 5 — Monorepo extraction (3–4 days, only after 1–4)

```
packages/
  shared/          # src/shared/* moves here verbatim
  sync-core/       # platform-agnostic pull/push/merge/dirty-tracking
apps/
  desktop/
  mobile/
```

- `sync-core` exposes `createSyncEngine({ persistence, network, supabase })`. Desktop injects fs + `net.isOnline()`; mobile injects AsyncStorage + NetInfo.
- Root `tsconfig.base.json` centralizes `@shared/*`; remove duplicated alias blocks in `vite.config.ts` (4 copies → 1) and `mobile/metro.config.js`.
- Ship only once Phases 1–4 prove interfaces stable. If interfaces still churn, defer.

## Phase 6 — Polish (1 day)

- Collapse `ipc-factory.ts`'s three factories into one with optional `onSuccess`.
- Remove `switchView` and any dead IPC constants (grep first).
- Preload uniformity: all mutations return `Result<T>`, all subscriptions return unsubscribe.
- Delete `sync-logic.md` (already removed in working tree); don't resurrect.

---

## Out of scope

- Multi-user / account-switching (CLAUDE.md forbids).
- Server-side schema changes.
- Swapping Electron/Tauri, adopting tRPC, full rewrites.
- Per-entity retry/backoff for watermark — design in Phase 2, build later if waste is observed.

## Sequencing

| Phase | Days | Blocked by | Reversible? |
|---|---|---|---|
| 0 Safety net | 0.5 | — | trivial |
| 1 Shared core | 2–3 | 0 | yes |
| 2 Sync robustness | 3 | 1 | yes |
| 3 Overlay split | 2–3 | 0 (parallel to 1/2) | yes |
| 4 Mobile parity | 2 | 1, 2 | yes |
| 5 Monorepo | 3–4 | 1–4 | painful — commit only if stable |
| 6 Polish | 1 | all | yes |

**~13–16 working days total.** Phases 1+3 and 2+4 can run in parallel.
