# TooDoo Refactor Plan

Grounded against actual files: Overlay.tsx=812 lines, desktop sync.ts=364, mobile sync=327, 12 useStates in Overlay, only `tests/main/` exists (no renderer or mobile tests).

## Progress

| Phase | Status | Commit | Tests |
|---|---|---|---|
| 0 Safety net | ✅ done | `621298a` | 212 (207 desktop + 5 mobile) |
| 1 Shared core | ✅ done | `f4d7694` | 231 (226 desktop + 5 mobile) + Playwright 13/13 |
| 2 Sync robustness | ⬜ next | — | — |
| 3 Overlay split | ⬜ | — | — |
| 4 Mobile parity | ⬜ | — | — |
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

## Phase 2 — Sync robustness ⬜ (next)

Desktop + mobile lockstep.

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
