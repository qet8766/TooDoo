# TooDoo Refactor Plan

Grounded against actual files: Overlay.tsx=812 lines, desktop sync.ts=364, mobile sync=327, 12 useStates in Overlay, only `tests/main/` exists (no renderer or mobile tests).

## Progress

| Phase | Status | Commit | Tests |
|---|---|---|---|
| 0 Safety net | ✅ done | `621298a` | 212 (207 desktop + 5 mobile) |
| 1 Shared core | ✅ done | `f4d7694` | 231 (226 desktop + 5 mobile) + Playwright 13/13 |
| 2 Sync robustness | ✅ done | `92993b5` | 251 (232 desktop + 19 mobile) + Playwright 13/13 |
| 3 Overlay split | ✅ done | `67b5eb8` | 251 (232 desktop + 19 mobile) + Playwright 13/13 |
| 4 Mobile parity | ⬜ next | — | — |
| 5 Monorepo | ⬜ | — | — |
| 6 Polish | ⬜ | — | — |

Tag `refactor-baseline` at `621298a` for quick revert.

## Guiding principles

- **Parity first, then extraction.** Fix mobile gaps so both apps behave identically, *then* promote shared code — extracting divergent behavior just codifies drift.
- **One refactor, one behavior.** Each phase changes structure OR behavior, not both. Keeps blame-bisectable.
- **Tests lead risky phases.** Renderer state and sync rewrites land *after* characterization tests cover current behavior.
- **Nothing ships half-done.** Every phase must leave the app green and releasable — no long-lived branches.

---

## Phase 0 — Safety net ✅

- [x] Playwright 13/13 green on baseline (`b6ebde8`).
- [x] Vitest gains jsdom env for `tests/renderer/**`, keeps node for `tests/main/**`.
- [x] 5 characterization tests in `tests/renderer/Overlay.test.tsx` (fetch-on-mount, edit flow, minimize toggle, scorching disables minimize, onTasksChanged re-renders).
- [x] Jest + RTL-native in `mobile/`; 5 tests on `useTaskSections` (tripwire for `@shared/*` import resolution — lighter target than full `TasksScreen` given its native-module deps).
- [x] Tag `refactor-baseline`.

## Phase 1 — Shared core hardening ✅

Fix the actual bugs that a refactor would otherwise paper over.

- [x] **Merge combinator**: `src/shared/merge.ts` exports `mergeByUpdatedAt<T extends HasIdUpdatedAt>(local, remote)` — no id/ts function args needed once `HasIdUpdatedAt` became the type bound. Replaces 3 copies in desktop `sync.ts` + 1 in mobile `sync.ts`. 9 unit tests in `tests/main/merge.test.ts`.
- [x] **Legacy-category migration**: extracted to `normalizeCategory()` in `src/shared/categories.ts`. Called from **both** `fromTaskRow` (remote pulls) and `sanitizeTask` (disk loads) — two boundaries, one helper. 10 tests in `tests/main/supabase-types.test.ts`.
- [x] **Validators return `Result<null>`**: `validateTaskFields` / `validateProjectNoteFields` / `validateNoteFields`. `validateId` kept as `string | null` (internal helper). Desktop `tasks.ts` / `notes.ts` + mobile stores adapted.
- [x] **Typed IPC bridge**: `ChannelMap` in `ipc.ts` maps each invoke channel to `{payload, response}`; preload's `invoke<K>()` helper derives return type. ~15 `as Promise<T>` casts removed. Send-style channels (QUICK_ADD_OPEN, WINDOW_RESIZE, etc.) intentionally excluded — no response to type.

Exit met: no new features, all 226 desktop + 5 mobile tests green, tsc clean, Playwright 13/13.

## Phase 2 — Sync robustness ✅

Desktop and mobile now share the same error classification pipeline.

- [x] **Typed error reasons**: `doUpsert` returns `UpsertResult = {ok:true} | {ok:false; reason}`. Classifier uses PostgREST code (PGRST301), Postgres SQLSTATE (42501 → auth, 23xxx → validation) and message heuristics (JWT/unauthorized/fetch).
- [x] **`SyncReason` + extended `SyncStatusPayload`** in `shared/ipc.ts`; `getSyncReason()` exposed alongside `getSyncStatus()`; main-process `SYNC_STATUS` handler propagates it.
- [x] **Auth health check on mobile**: `checkAuthHealth` + `maybeCheckAuth` ported from desktop; calls `markAuthExpired` (new export in mobile `supabase.ts`) to flip auth state without going through `signOut`.
- [x] **Dirty ID tracking on mobile**: `dirtyIds` Set + `getDirtyCount()` export. `useSyncStatus` hook returns `{ status, reason, dirtyCount }`. `SyncDot` shows a count badge when pushes are pending.
- [x] **Connectivity race fix (mobile)**: `NetInfo.fetch()` moved inside the push chain; mutations made while online still mark dirty if the connection drops before the chain runs, and get retried on the next online/foreground transition.
- [x] **Targeted auth check**: only auth-classified failures call `maybeCheckAuth()` now. Generic failures no longer waste a `getUser()` round-trip on every push.
- [ ] **Watermark**: all-or-nothing left as-is; per-entity retry deferred until actual waste is observed.

Exit met: 6 new reason tests in `sync-engine.test.ts` (41 total in that file); new mobile `sync.test.ts` with 14 tests covering classification, dirty tracking, connectivity race, auth cooldown, pull merging, and listener propagation. Playwright 13/13.

## Phase 3 — Overlay decomposition ✅

Three highest-churn concerns in `Overlay.tsx` now live in isolated hooks.

- [x] **`useTaskList()`**: task cache (fetch, onTasksChanged subscription, optimistic `setTasks`) + derived views (`tasksByCategory` with fractional sort for heat and deadline sort for timed, `isScorchingMode`, `visibleCategories`).
- [x] **`useMinimizeTimer(isScorchingMode)`**: hour-long auto-expand + scorching-forced expand; pushes state to main via `window.toodoo.setMinimized`.
- [x] **`useTaskEditing({ onSaved })`**: `useReducer` over edit state (start / change / cancel) plus a save action that calls `window.toodoo.tasks.update` and invokes `onSaved` for the parent's optimistic patch. JSX handlers call `updateEdit()` / `cancelEdit()` directly.
- [x] DnD, project-note editing, sign-in modal, sync-status wiring, resize grip: left inline — same coupling risk, no reuse pressure.

Overlay.tsx went from **812 → 640 lines** (not the aspirational `<300` — that would require extracting DnD and modals, which wasn't in scope for this pass). Three new hooks total 242 lines; net renderer code grew slightly, but top-level state dropped from 12 useStates to 4. Exit met: Phase 0 characterization tests pass, Playwright 13/13.

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
