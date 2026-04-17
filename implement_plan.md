# TooDoo: React Native Android + Supabase Sync — Implementation Plan

## Overview

Port TooDoo to React Native Android and add Supabase as a shared backend for cross-platform sync. Monorepo structure with `mobile/` directory. Single-user app — one Supabase account created via dashboard, no in-app registration. Both Electron and RN sync with Supabase via pull-on-focus (no realtime subscriptions).

---

## Gate 1: Foundation

**Goal:** Supabase schema deployed, Electron app internals updated to soft delete + fractional sort + sync-ready types. App behavior unchanged from the user's perspective.

### Steps

**Supabase setup:**

1. Install Supabase CLI globally (`npm install -g supabase`)
2. Run `supabase init` in project root (creates `supabase/` directory)
3. Create Supabase project on dashboard (create your single account here), run `supabase link`
4. Write migration `supabase/migrations/001_initial_schema.sql`:
   - `tasks` table (id, user_id, title, description, category, is_done, sort_order TEXT, scheduled_date, scheduled_time, created_at, updated_at, deleted_at)
   - `project_notes` table (id, task_id, user_id, content, created_at, updated_at, deleted_at) — simple FK `task_id REFERENCES tasks(id)`
   - `notes` table (id, user_id, title, content, created_at, updated_at, deleted_at)
   - RLS policies: each table filtered by `auth.uid() = user_id`
5. Run `supabase db push` to deploy

**Shared module updates:** 6. Create `src/shared/supabase-types.ts` — Postgres row types (snake_case) + `toTaskRow()`/`fromTaskRow()` mappers for all entities 7. Update `src/shared/types.ts`:

- Add `deletedAt?: number` to `Task`, `ProjectNote`, `Note`
- Change `sortOrder: number` → `sortOrder: string`
- Add `SyncStatus = 'synced' | 'pending' | 'offline'`

8. Update `src/shared/validation.ts`:
   - `sanitizeTask()` handles `deletedAt` field and string `sortOrder`
   - Default `sortOrder` from `0` → `'a0'`

**Electron DB layer — soft delete + fractional sort:** 9. `npm install fractional-indexing` 10. Modify `src/main/db/tasks.ts`: - `deleteTask()` → sets `deletedAt = Date.now()` instead of filtering out - `getTasks()` → returns only tasks where `deletedAt` is undefined/null - `addTask()` → generates fractional `sortOrder` via `generateKeyBetween()` - `reorderTask()` → computes new fractional key between adjacent tasks (only 1 row changes) - `deleteProjectNote()` → sets `deletedAt = Date.now()` instead of physically removing (tombstone for sync) - `getProjectNotes()` / task loading → filters out project notes where `deletedAt` is set 11. Modify `src/main/db/notes.ts`: - Same soft-delete pattern 12. Update tests for new behavior (including project-note soft-delete) 13. Run `npm run test`, `npm run build`, `npm run lint` — fix any breakage

### Files Created

- `supabase/migrations/001_initial_schema.sql`
- `src/shared/supabase-types.ts`

### Files Modified

- `src/shared/types.ts`
- `src/shared/validation.ts`
- `src/main/db/tasks.ts`
- `src/main/db/notes.ts`
- `tests/main/` (test fixtures)

### Verification

- [x] `supabase status` shows running/linked project
- [x] Tables visible in Supabase dashboard with correct columns and constraints
- [ ] RLS active: anonymous queries return empty results
- [x] `npm run dev` — app works identically to before
- [x] Create, edit, reorder, delete tasks — all work
- [x] Inspect `tasks.json` — deleted tasks have `deletedAt` field, `sortOrder` is a string
- [x] Delete a project note → inspect `tasks.json` → note has `deletedAt` (not physically removed)
- [x] Deleted project notes are hidden from the UI but remain in storage as tombstones
- [x] `npm run test` — all tests pass (136/136)
- [x] `npm run build` succeeds
- [x] `npm run lint` — no new errors

---

## Gate 2: Electron Sync

**Goal:** Electron app syncs with Supabase. Auth works, data pushes on mutation, pulls on window focus.

### Steps

1. `npm install @supabase/supabase-js`
2. Create `src/main/db/sync/` module:
   - `supabase.ts` — init client (URL + anon key from env or embedded config) + signIn/signOut + persist session to `auth-session.json` in userData
   - `sync.ts` — push-on-mutate, pull-on-focus, push-dirty-on-reconnect; tracks `lastSyncedAt` timestamp; on reconnect pushes entities where `updatedAt > lastSyncedAt` then pulls all and merges (newer `updatedAt` wins); connectivity detection via `net` module
3. Modify `src/main/db/database.ts` — after each mutation, push to sync
4. Add IPC channels to `src/shared/ipc.ts`:
   - `AUTH_SIGN_IN`, `AUTH_SIGN_OUT`, `AUTH_STATUS`, `AUTH_STATUS_CHANGED`
   - `SYNC_STATUS`, `SYNC_STATUS_CHANGED`
5. Expose auth/sync API in `src/preload/index.ts`
6. Register IPC handlers in `src/main/index.ts`
7. Add minimal auth UI to renderer: one-time sign-in prompt on first launch (email + password), sync dot in topbar

### Files Created

- `src/main/db/sync/supabase.ts`
- `src/main/db/sync/sync.ts`

### Files Modified

- `src/main/db/database.ts`
- `src/shared/ipc.ts`
- `src/shared/supabase-types.ts` (mappers used by sync)
- `src/preload/index.ts`
- `src/main/index.ts`
- `src/renderer/pages/Overlay.tsx` (sync indicator + first-launch sign-in prompt)

### Verification

- [ ] `npm run dev` — app starts, works offline as before
- [ ] Sign in with email/password → session persists across restarts
- [ ] Tasks/notes upload to Supabase (check dashboard)
- [ ] Switch focus away and back → pulls latest from Supabase
- [ ] Disconnect network → make changes → reconnect → dirty entities push, then pull
- [ ] Offline project-note delete → reconnect → deletion syncs to Supabase (tombstone sent)
- [x] `npm run test` — all tests pass (165/165)
- [x] `npm run build` succeeds
- [x] `npm run lint` — no errors

---

## Gate 3: Mobile Foundation

**Goal:** RN project initialized, shared code linked, data layer working end-to-end. Sign in on Android, CRUD a task, see it in Supabase.

### Steps

**Scaffold:**

1. `npx @react-native-community/cli init TooDooMobile --directory mobile --skip-git`
2. Install dependencies:
   - Navigation: `@react-navigation/native`, `@react-navigation/bottom-tabs`, `@react-navigation/stack`
   - Gesture/animation: `react-native-gesture-handler`, `react-native-reanimated`, `react-native-safe-area-context`, `react-native-screens`
   - Data: `@supabase/supabase-js`, `@react-native-async-storage/async-storage`, `zustand`
   - UI: `react-native-draggable-flatlist`, `@react-native-community/datetimepicker`, `react-native-linear-gradient`, `react-native-vector-icons`
   - Utils: `fractional-indexing`, `uuid`, `@react-native-community/netinfo`
3. Set up shared code: symlink `src/shared/` → `mobile/src/shared/`, configure `tsconfig.json` path alias
4. Bundle Space Grotesk font in `mobile/assets/fonts/`
5. Create theme files: `colors.ts`, `spacing.ts`, `typography.ts`, `tones.ts`
6. Build navigation skeleton:
   - `App.tsx` — NavigationContainer with dark theme
   - `RootNavigator.tsx` — Stack (auth check → SignIn or MainTabs)
   - `MainTabs.tsx` — Bottom tabs (Tasks, Notes)
   - Placeholder screens for all routes
7. Build `SignInScreen.tsx` — email/password sign-in only (no registration)

**Data layer:** 8. Create `mobile/src/data/supabase.ts` — Supabase client init with AsyncStorage session adapter 9. Create `mobile/src/data/persistence.ts` — AsyncStorage read/write adapter 10. Create `mobile/src/data/queue.ts` — port of async operation serializer 11. Create `mobile/src/data/sync.ts` — sync engine: push-on-mutate, pull-on-app-foreground, push-dirty-on-reconnect (same pattern as Electron, using `@react-native-community/netinfo` + AppState for focus) 12. Create `mobile/src/stores/authStore.ts` — auth state + signIn/signOut/restoreSession 13. Create `mobile/src/stores/taskStore.ts` — tasks CRUD, persists to AsyncStorage, syncs to Supabase 14. Create `mobile/src/stores/noteStore.ts` — notes CRUD, same pattern 15. Create `mobile/src/stores/uiStore.ts` — font size, condensed mode 16. Port `mobile/src/hooks/useDeleteArm.ts` (direct copy, platform-agnostic) 17. Port `mobile/src/hooks/useFontSize.ts` (AsyncStorage instead of localStorage)

### Files Created

- `mobile/` (entire project scaffold)
- `mobile/src/app/{App,RootNavigator,MainTabs}.tsx`
- `mobile/src/screens/auth/SignInScreen.tsx`
- `mobile/src/theme/{colors,spacing,typography,tones}.ts`
- `mobile/src/data/{supabase,persistence,queue,sync}.ts`
- `mobile/src/stores/{authStore,taskStore,noteStore,uiStore}.ts`
- `mobile/src/hooks/{useDeleteArm,useFontSize}.ts`
- Placeholder screens for all routes

### Verification

- [x] `cd mobile && ./gradlew assembleDebug` — APK builds successfully (176 MB debug)
- [ ] Navigation works: tabs switch, placeholder screens show
- [ ] Dark theme applied, Space Grotesk font renders
- [x] Shared types import without errors
- [ ] Sign in on mobile → data pulled from Supabase
- [ ] Create task on mobile → appears in Supabase dashboard
- [ ] Create task on Electron → switch to mobile → appears after focus pull
- [ ] Kill app → reopen → data persisted locally
- [ ] Airplane mode → create task → re-enable → syncs
- [x] `npx tsc --noEmit` — zero TypeScript errors in mobile project
- [x] `npm run test` in root — all Electron tests pass (165/165)
- [x] `npm run build` in root — Electron build succeeds

---

## Gate 4: Mobile Screens

**Goal:** Full mobile UI — tasks, calendar, notes. Animations and polish built into components. Both platforms feature-complete and synced.

### Steps

**Task screens:**

1. Build `TasksScreen.tsx` — main list with `SectionList` grouped by category
2. Build `CategorySection.tsx` — section header with dot, title, count pill
3. Build `TaskCard.tsx` — task card with title, description, D-day badge, edit/delete actions
4. Build `DDayBadge.tsx` — D-day marker using `calculateDDay()` from shared
5. Build `DeleteCheckbox.tsx` — two-stage delete with `useDeleteArm`
6. Build `TaskEditForm.tsx` — inline editing (title, description, date, time)
7. Build `QuickAddScreen.tsx` — modal with category selector, title, description, date/time picker
8. Build `FAB.tsx` — floating action button that opens QuickAddScreen
9. Add drag-and-drop reorder within categories using `react-native-draggable-flatlist`
10. Add cross-category move via long-press → bottom sheet category picker
11. Implement scorching mode logic (hide heat categories when scorching tasks exist)
12. Build `FontSizeControls.tsx` — A+/A- in header
13. Build `SyncIndicator.tsx` — colored dot in header

**Calendar + notes screens:** 14. Build `CalendarScreen.tsx` — monthly grid with task dots and holiday markers 15. Build `CalendarGrid.tsx` — 7-column FlatList 16. Build `CalendarDay.tsx` — day cell with task count dots 17. Build `HolidayBadge.tsx` — holiday indicator 18. Build `CalendarDayScreen.tsx` — day detail with task list + add form 19. Build `NotesScreen.tsx` — notes list with search, expandable cards 20. Build `NoteCard.tsx` — expandable note card with preview/full toggle 21. Build `NoteEditorScreen.tsx` — create/edit note form

**Polish (built into the above, not a separate pass):** 22. Animations: armed-pulse (Reanimated), press feedback, list transitions 23. Status bar + navigation bar theming (dark, matching background) 24. Haptic feedback on drag, delete arm (react-native-haptic-feedback) 25. Edge cases: empty states, loading states, error handling

### Files Created

- `mobile/src/screens/tasks/TasksScreen.tsx`
- `mobile/src/screens/QuickAddScreen.tsx`
- `mobile/src/components/tasks/{CategorySection,TaskCard,TaskEditForm,ProjectNoteRow,DDayBadge,DeleteCheckbox}.tsx`
- `mobile/src/components/common/{FAB,CategoryDot,FontSizeControls,SyncIndicator}.tsx`
- `mobile/src/screens/tasks/{CalendarScreen,CalendarDayScreen}.tsx`
- `mobile/src/components/calendar/{CalendarGrid,CalendarDay,HolidayBadge,TaskDots}.tsx`
- `mobile/src/screens/notes/{NotesScreen,NoteEditorScreen}.tsx`
- `mobile/src/components/notes/NoteCard.tsx`

### Verification

**Tasks:**

- [ ] Task list renders with correct category grouping and colors
- [ ] Scorching mode activates/deactivates correctly
- [ ] Create task via QuickAdd → appears in list
- [ ] Long-press task → edit inline → save
- [ ] Two-stage delete works (arm → confirm)
- [ ] Drag to reorder within category
- [ ] Long-press → "Move to..." changes category
- [ ] D-day badges show correct values for timed tasks
- [ ] Timed tasks show project notes underneath
- [ ] Font size A+/A- works and persists

**Calendar + notes:**

- [ ] Calendar shows correct month grid with Korean weekday labels
- [ ] Task dots appear on correct dates
- [ ] Holiday markers display for Korean holidays
- [ ] Tap day → CalendarDayScreen shows tasks + add form
- [ ] Add timed task from calendar → appears in task list
- [ ] Notes list renders with search filtering
- [ ] Expand/collapse note cards works
- [ ] Create/edit notes via NoteEditorScreen
- [ ] Two-stage delete for notes works

**Cross-platform sync:**

- [ ] Create task on Electron → focus Android app → task appears
- [ ] Create task on Android → focus Electron → task appears
- [ ] Edit/delete on one platform → focus the other → reflected
- [ ] Both offline → both make changes → both reconnect → newer `updatedAt` wins

**Quality:**

- [ ] All animations feel smooth (60fps)
- [ ] App handles large task lists (50+ tasks) smoothly
- [ ] `npm run test` in root → all Electron tests pass
- [ ] `npm run build` in root → Electron builds successfully

---

## Current Progress

- [x] **Gate 1** — Foundation (Supabase + shared types + soft delete + fractional sort)
- [x] **Gate 2** — Electron Sync (auth, push-on-mutate, pull-on-focus, server timestamps)
- [~] **Gate 3** — Mobile Foundation (scaffold + data layer) — code complete, needs Android SDK for device testing
- [~] **Gate 4** — Mobile Screens (tasks + calendar + notes + polish) — code complete, needs Android SDK for device testing
