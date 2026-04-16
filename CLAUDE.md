# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TooDoo is an always-on-top Electron desktop overlay for task management with global hotkey quick-add popups. It uses a heat-based priority system (scorching > hot > warm > cool) for manual prioritization, plus a separate "Timed" category for deadline-based tasks with D-day markers. Includes a secondary "Notetank" notes feature.

**Single-user app.** This app is built for personal use by a single person. There is only one Supabase auth account, no registration flow, no multi-tenancy, and no account-switching. Do not design for multi-user scenarios, cross-account data isolation, or user management. Auth exists solely to authenticate with Supabase for cross-device sync.

## Commands

```bash
npm run dev              # Start Vite dev server + Electron
npm run build            # TypeScript check + Vite build
npm run electron:build   # Full production build (tsc + vite + electron-builder)
npm run lint             # ESLint
npm run format           # Prettier (write)
npm run format:check     # Prettier (check only)
npm run test             # Vitest run (all tests)
npx vitest run tests/main/categories.test.ts  # Single test file
```

## Architecture

**Electron three-process model** with a shared module:

- `src/main/` - Main process: window lifecycle, IPC handlers, global shortcuts, JSON persistence
- `src/preload/` - Context bridge: exposes typed `window.toodoo` API to renderer
- `src/renderer/` - React UI: HashRouter with routes for `/toodoo`, `/quick-add`, `/notetank`, `/note-editor`
- `src/shared/` - Cross-boundary code: types, IPC channel constants, category definitions, category-calculator

**Path aliases** (available in all three processes via Vite config):
`@shared`, `@main`, `@preload`, `@renderer`

### IPC Pattern

All IPC channel names are defined as constants in `src/shared/ipc.ts` (single source of truth). The main process registers handlers using three factory functions from `src/main/ipc-factory.ts`:

- `handleSimple` - Read-only queries (e.g., list tasks)
- `handleWithBroadcast` - Mutating task operations (auto-broadcasts `tasks:changed` to all windows)
- `handleWithNotesBroadcast` - Mutating note operations (auto-broadcasts `notes:changed`)

The preload layer (`src/preload/index.ts`) maps these to a typed API object exposed as `window.toodoo`. Renderer components call `window.toodoo.tasks.*` / `window.toodoo.notes.*` and subscribe to change events via `window.toodoo.onTasksChanged()`.

### Window Management

Two window types defined in `src/main/windows/base.ts`:

- **overlay** - Frameless, transparent, always-on-top, resizable (main TooDoo view, Notetank)
- **popup** - Frameless, transparent, always-on-top, appears at cursor (QuickAdd, NoteEditor)

Each window type uses a singleton manager (`createSingletonWindowManager()`) ensuring only one instance exists. The overlay and notetank share the same BrowserWindow via hash routing; quick-add and note-editor are separate popup windows.

### Data Persistence

Local JSON files stored in `app.getPath('userData')/data/` (`tasks.json`, `notes.json`). The database layer is split into focused modules under `src/main/db/`:

- `store.ts` - JSON file I/O with error handling (atomic write via tmp + rename)
- `tasks.ts` - Task + ProjectNote domain logic and in-memory cache
- `notes.ts` - Note domain logic and in-memory cache
- `queue.ts` - Async operation serializer (ensures no concurrent mutations)
- `database.ts` - Thin facade: init orchestration, queue-wrapped re-exports, sync push after each mutation

All mutating operations return `Result<T>` (from `src/shared/result.ts`) -- a discriminated union `{ success: true, data: T } | { success: false, error: string }`. Renderers check `result.success` to narrow the type. Validation rules live in `src/shared/validation.ts` for reuse across processes. Data loaded from disk is sanitized via `sanitizeTasks()`/`sanitizeNotes()` to handle schema drift and corruption.

### Soft Delete

All entities (Task, ProjectNote, Note) use soft delete via a `deletedAt?: number` timestamp field. Deletion sets `deletedAt = Date.now()` instead of removing the record. `getTasks()` and `getNotes()` filter out deleted items so the UI is unchanged, but tombstones remain in the JSON file for future sync. Mutating functions (`updateTask`, `addProjectNote`, `reorderTask`) guard against operating on soft-deleted records.

### Sort Order

Tasks use fractional string-based sort ordering via the `fractional-indexing` library. `sortOrder` is a `string` (not a number). Adding or reordering a task only modifies that single task's `sortOrder` -- no other tasks in the category are touched. Keys compare correctly with raw `<`/`>` string comparison (do NOT use `localeCompare`). Legacy numeric `sortOrder` values are auto-migrated to fractional keys on first load via `sanitizeTasks()`.

### Supabase Sync

Supabase project: `envrmnyjyxwqhmfpvajd`. Schema in `supabase/migrations/`. Three tables (`tasks`, `project_notes`, `notes`) with RLS policies filtering by `auth.uid() = user_id`. Timezone set to `Asia/Seoul`. Single auth user (`qet8766@naver.com`).

**Sync modules** under `src/main/db/sync/`:

- `supabase.ts` - Client singleton, email/password auth, session persistence to `{userData}/auth-session.json`
- `sync.ts` - Push-on-mutate (serialized promise chain), pull-on-focus (merge by `updatedAt`), dirty-push-on-reconnect with watermark tracking (`sync-meta.json`)

**Sync behavior:**

- Every local mutation in `database.ts` calls `pushEntity()` which serializes upserts through a promise chain -- local operations never block on network
- Window focus triggers `pull()` which fetches all remote data, merges (newer `updatedAt` wins, ties go to remote), and replaces the local cache inside the mutation queue
- On reconnect (offline→online), `syncDirtyAndPull()` pushes entities where `updatedAt > lastSyncedAt`, then pulls. Watermark only advances if all pushes succeed -- failed entities stay dirty for retry
- Server-side `BEFORE INSERT OR UPDATE` trigger (`002_server_timestamps.sql`) overrides `updated_at` with `now()`, making merge resolution clock-independent across devices
- Connectivity detected via `net.isOnline()` polling every 30s

**Auth/sync IPC:** `auth:sign-in`, `auth:sign-out`, `auth:status`, `auth:status-changed`, `sync:status`, `sync:status-changed` -- exposed via `window.toodoo.auth.*` / `window.toodoo.sync.*`

**Type mappers** in `src/shared/supabase-types.ts`:

- Postgres row types (snake_case) + bidirectional mapper functions (`toTaskRow`/`fromTaskRow`, etc.)
- Mappers handle: camelCase/snake_case, Unix ms/ISO timestamps, undefined/null conversion
- `scheduledDate` uses local (KST) midnight -- mappers use local date methods, not UTC

### Timed Tasks

The "Timed" category (violet, formerly "Project") holds deadline-based tasks. Tasks created from the calendar go here automatically. Timed tasks are sorted by deadline (soonest first) and display D-day markers (D-7, D-1, D-Day, D+1...). The D-day calculation lives in `src/shared/category-calculator.ts`. Timed tasks never mix into heat categories -- they always stay in their own section. The quick-add for timed tasks (Alt+Shift+T) includes a date picker.

### Scorching Mode

When any scorching tasks exist, the overlay hides heat categories and shows only scorching + timed tasks. This also prevents the focus-mode minimize feature and auto-expands if minimized.

## Global Hotkeys

Alt+Shift+Q/W/E/R/T open quick-add for scorching/hot/warm/cool/timed. Alt+Shift+N opens note editor.

## Testing

Vitest with node environment. Tests live in `tests/main/` (main process unit tests only). Global Electron/fs/crypto mocks are set up in `tests/setup.ts`. `mockReset: true` runs between tests. Console output is silenced unless `DEBUG` env var is set.

## Code Style

- Prettier: no semicolons, single quotes, trailing commas, 120 char width
- ESLint: TypeScript + React Hooks + React Refresh rules, with eslint-config-prettier
- Vite builds main process as ESM (`main.mjs`), preload as CJS (`preload.cjs`)
- Korean public holidays are hardcoded in `src/shared/holidays.ts` for the calendar feature
