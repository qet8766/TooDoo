# TooDoo Refactor Plan

Grounded against actual files: Overlay.tsx=812 lines, desktop sync.ts=364, mobile sync=327, 12 useStates in Overlay, only `tests/main/` exists (no renderer or mobile tests).

## Progress

| Phase | Status | Commit | Tests |
|---|---|---|---|
| 0 Safety net | ✅ done | `621298a` | 212 (207 desktop + 5 mobile) |
| 1 Shared core | ✅ done | `f4d7694` | 231 (226 desktop + 5 mobile) + Playwright 13/13 |
| 2 Sync robustness | ✅ done | `92993b5` | 251 (232 desktop + 19 mobile) + Playwright 13/13 |
| 3 Overlay split | ✅ done | `67b5eb8` | 251 (232 desktop + 19 mobile) + Playwright 13/13 |
| 4 Mobile parity | ✅ done | `937d100` + Phase 4b | 260 (232 desktop + 28 mobile) + Playwright 13/13 |
| 5-lite Alias dedupe | ✅ done | Phase 5-lite | 260 + Playwright 13/13 unchanged |
| 5 Monorepo | ⏸ deferred | — | — |
| 6 Polish | ✅ done | Phase 6 | 262 (234 desktop + 28 mobile) + Playwright 13/13 |

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

## Phase 4 — Mobile prop-drilling fix + Result adoption ✅

Shipped in two commits under the Phase 4 umbrella, following "one refactor, one behavior":

- **Phase 4a (`937d100`)**: `taskInteractionStore` owns edit state + arm-for-delete sets for tasks and notes. TasksScreen's top-level state drops from 4 slots (2 useStates + 2 `useDeleteArm`) to 1 (`moveTask`). CategorySection/TaskCard prop shape unchanged — source flips from screen-local state to store selectors. `EditForm` type moves to the store (re-exported from `TaskCardEditForm` for back-compat). `armOrConfirmX` returns `boolean` so `LayoutAnimation.configureNext` + `deleteTask` stay in the screen handler. `useDeleteArm` kept intact for `NotesScreen`. Module-scope timer tables mirror the hook's `useRef<Map>` pattern. Cleanup via `useEffect(() => disarmAll)` on unmount.
- **Phase 4b**: Mobile stores match desktop `Result<T>` surface where desktop uses it (`addTask`/`updateTask`/`addProjectNote`/`updateProjectNote`/`addNote`/`updateNote`). `deleteX` / `reorderTask` keep `void`/`boolean` to preserve desktop parity. `authStore` unchanged — `doSignIn` has its own error channel via `error` state rendered inline in `SignInScreen`. New `toastStore` + `ToastHost` (40 lines, Animated fade, mounted once in `App.tsx`) + `handleResult` helper in `lib/showError.ts`. 7 mobile call sites updated to surface errors via toast; `navigation.goBack()` is gated on success so validation errors keep the user on screen.
- **Tests added**: 5 in `taskInteractionStore.test.ts` (arm/confirm, auto-disarm timer, independent sets, disarmAll, edit flow) + 4 in `taskStore.result.test.ts` (ok/fail discriminant, missing task, missing parent). Extended jest `transformIgnorePatterns` to cover `uuid` + `fractional-indexing` ESM. 19 → 28 mobile tests.

## Phase 5-lite — TS path alias dedupe ✅

Took the 80% value slice of the originally-planned Phase 5: centralize the TypeScript path aliases without moving any files or introducing npm workspaces / `sync-core`. One commit, zero blast.

- **New**: `tsconfig.base.json` holds the single copy of `{ @renderer, @main, @preload, @shared }` paths.
- `tsconfig.app.json` / `tsconfig.node.json` now `"extends": "./tsconfig.base.json"` — each sheds ~8 lines. 3 TS path blocks → 1.
- `mobile/tsconfig.json` uses TS-5 array extends: `["@react-native/typescript-config", "../tsconfig.base.json"]`. Its `baseUrl`/`paths` override deleted.
- `vite.config.ts`: extracted `const aliases` at module scope, reused via `resolve: { alias: aliases }` for the renderer and `resolve: { alias: sharedAlias }` for the main/preload electron bundles. 3 literal alias blocks → 1 const.
- **Left alone** (separate resolution mechanism, not worth the conversion risk): `vitest.config.ts` (own alias block), `mobile/metro.config.js` (custom `resolveRequest`), `mobile/babel.config.js` (module-resolver).

Verification: desktop `tsc -b` clean, 232 desktop + 28 mobile tests green, Playwright 13/13 unchanged, mobile `tsc` reports only the same 2 pre-existing test errors from before Phase 4.

## Phase 5 — Monorepo extraction ⏸ deferred

Full monorepo (`packages/shared`, `packages/sync-core`, npm workspaces) deferred. Rationale:

- Phase 4 interfaces just landed (Result adoption, toast primitive). Per the plan's own deferral clause — "Ship only once Phases 1–4 prove interfaces stable. If interfaces still churn, defer" — one commit-cycle of stability isn't enough.
- `sync-core` is a design exercise (unifying desktop `net.isOnline()` + BrowserWindow focus vs mobile NetInfo + AppState behind `createSyncEngine({ persistence, network, supabase })`), not code motion. Worth doing properly once the current shape proves stable.
- Moving `src/shared/*` changes 98 imports across 55 files + Metro + Babel + Vitest + 3 tsconfigs. Phase 5-lite captured the TS-side maintenance win (`tsconfig.base.json`) without any file moves.

Revisit after Phase 6 polish + a period of observed stability.

## Phase 6 — Polish ✅

Final cleanup pass. Four items landed cleanly:

- [x] **One `handle()` factory**: `src/main/ipc-factory.ts` collapsed from three (`handleSimple` / `handleWithBroadcast` / `handleWithNotesBroadcast`) into one `handle(channel, handler, onSuccess?)`. Mutation channels pass `broadcastTaskChange` / `broadcastNotesChange` as `onSuccess`; reads omit it. `isFailedResult` guard retained so failed `Result<T>` still skips the broadcast. 16 call sites in `src/main/index.ts` updated.
- [x] **`SWITCH_VIEW` IPC removed**: main handler did one thing — `window.location.hash = '/${view}'` — so the renderer now does it directly. Deleted `IPC.SWITCH_VIEW`, the preload sender, the main handler, and the test mock. 2 call sites migrated to hash navigation.
- [x] **Delete/reorder uniformity**: `deleteTask` / `deleteProjectNote` / `deleteNote` / `reorderTask` all return `Result<{ id: string }>`. Database facade wrappers updated; reorder no-op (same position) now returns `ok` but skips the push by comparing `updatedAt` before/after. ChannelMap responses switched to `Result<{ id: string }>` — renderer/Notetank delete handlers now branch on `result.success` and rollback optimistic UI on failure.
- [x] **`sync-logic.md`**: already deleted in working tree; no action needed.

Subscriptions already returned unsubscribe — no work required.

Tests: 234 desktop (up from 232; added a no-op reorder test and a delete-note failure test in `database-sync.test.ts`) + 28 mobile + Playwright 13/13. Build clean.

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
