# CLAUDE.md

Guidance for Claude Code working in this repo.

## Project

TooDoo is an always-on-top Electron desktop overlay for task management with global hotkey quick-add popups. Heat-based priority (scorching > hot > warm > cool) plus a "Timed" category for deadline tasks with D-day markers. Includes a "Notetank" notes feature.

**Single-user app.** One person, one Supabase account. No registration, multi-tenancy, or account-switching. Don't design for multi-user scenarios — auth exists only for cross-device sync.

## Commands

```bash
npm run dev              # Vite + Electron
npm run build            # tsc + vite build
npm run electron:build   # full production build
npm run lint             # ESLint
npm run format           # Prettier write
npm run test             # Vitest
npx vitest run tests/main/categories.test.ts  # single test
```

## Architecture

Electron three-process model with path aliases `@main`, `@preload`, `@renderer`, `@shared`:

- `src/main/` — window lifecycle, IPC handlers, global shortcuts, JSON persistence
- `src/preload/` — context bridge exposing typed `window.toodoo` API
- `src/renderer/` — React UI, HashRouter: `/toodoo`, `/quick-add`, `/notetank`, `/note-editor`
- `src/shared/` — types, IPC channel constants, category definitions

**IPC.** Channel names in `src/shared/ipc.ts`. Main registers via a single `handle(channel, handler, onSuccess?)` in `src/main/ipc-factory.ts` — pass `broadcastTaskChange` / `broadcastNotesChange` as `onSuccess` for mutation channels, omit for reads. `onSuccess` is skipped when the handler returns a failed `Result<T>`. Renderers subscribe via `window.toodoo.onTasksChanged()`.

**Windows.** Two types (`src/main/windows/base.ts`): `overlay` (frameless, transparent, always-on-top, resizable) and `popup` (appears at cursor). Singleton per type. Overlay + notetank share one window via hash routing; quick-add and note-editor are separate popups.

**Data.** Local JSON in `app.getPath('userData')/data/`. Modules under `src/main/db/`: `store.ts` (atomic tmp+rename write), `tasks.ts`/`notes.ts` (in-memory caches + CRUD), `queue.ts` (FIFO mutation serializer), `database.ts` (facade, calls `pushEntity` after each mutation). Mutations return `Result<T>` from `src/shared/result.ts`. Validation rules in `src/shared/validation.ts`. Disk data is sanitized via `sanitizeTasks()`/`sanitizeNotes()` for schema drift.

**Soft delete.** All entities use `deletedAt?: number`. `getTasks()`/`getNotes()` filter tombstones; mutating fns guard against operating on deleted records.

**Sort order.** Tasks use `fractional-indexing` — `sortOrder` is a **string**, compared with raw `<`/`>` (NOT `localeCompare`). Add/reorder mutates only the one task. Legacy numeric values auto-migrate via `sanitizeTasks()`.

## Sync (`src/main/db/sync/`)

Supabase project `envrmnyjyxwqhmfpvajd`. Tables: `tasks`, `project_notes`, `notes`. RLS by `auth.uid() = user_id`. Timezone `Asia/Seoul`. Auth user `qet8766@naver.com`.

- **Push-on-mutate:** `pushEntity()` after every mutation, fire-and-forget, serialized in a global push chain. No-op when offline or signed out.
- **Pull-on-focus:** `browser-window-focus` → fetch all rows, merge inside the mutation queue, `replaceCache`, broadcast.
- **Dirty-push-on-reconnect:** on offline→online (30s poll) and startup, push entities where `updatedAt > lastSyncedAt` (watermark in `sync-meta.json`), then pull. Watermark advances only if **all** pushes succeed.
- **Merge rule:** `remote.updatedAt >= local.updatedAt` → remote wins (ties go to remote). Server trigger `set_updated_at()` in migration 002 overrides client `updated_at` with `now()` — server is the canonical clock.
- **Project notes** merge independently from their parent task.
- **Type mappers** in `src/shared/supabase-types.ts` handle camelCase↔snake_case and Unix ms↔ISO. `scheduledDate` uses **local (KST) midnight**, not UTC.
- **Auth:** email/password, session persisted to `{userData}/auth-session.json`. IPC: `auth:*`, `sync:*` exposed via `window.toodoo.auth.*` / `window.toodoo.sync.*`.

## Timed tasks & scorching mode

Timed tasks (violet) are deadline-based, sorted soonest-first with D-day markers (see `src/shared/category-calculator.ts`). They never mix into heat categories. Alt+Shift+T quick-add includes a date picker.

When any scorching task exists, the overlay hides heat categories (shows scorching + timed only), disables focus-mode minimize, and auto-expands if minimized.

## Hotkeys

Alt+Shift+ `Q`/`W`/`E`/`R`/`T` → quick-add scorching/hot/warm/cool/timed. Alt+Shift+`N` → note editor.

## Testing

Vitest, node env. Tests in `tests/main/`. Global Electron/fs/crypto mocks in `tests/setup.ts`. `mockReset: true` between tests. Console silenced unless `DEBUG` is set.

## Style

- Prettier: no semicolons, single quotes, trailing commas, 120 cols
- Vite: main as ESM (`main.mjs`), preload as CJS (`preload.cjs`)
- Korean public holidays hardcoded in `src/shared/holidays.ts`
