# Sync Logic

> Single-user, offline-first sync between local JSON files and Supabase.
> One auth account, one Supabase project (`envrmnyjyxwqhmfpvajd`), three tables.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Startup Sequence](#startup-sequence)
- [Push-on-Mutate](#push-on-mutate)
- [Pull-on-Focus](#pull-on-focus)
- [Dirty-Push-on-Reconnect](#dirty-push-on-reconnect)
- [Merge Strategy](#merge-strategy)
- [Queue Serialization](#queue-serialization)
- [Connectivity Detection](#connectivity-detection)
- [Auth & Session Persistence](#auth--session-persistence)
- [Type Mappers](#type-mappers)
- [Server Schema](#server-schema)
- [Guarantees](#guarantees)
- [Known Limitations](#known-limitations)
- [File Map](#file-map)

---

## Architecture Overview

```
User Action
  │
  ▼
database.ts ── queue.enqueue() ──► local cache + JSON persist
  │                                      │
  │                                      ▼
  │                               pushEntity() ──► Supabase (fire-and-forget)
  │
  │  (on window focus)
  ▼
pull() ── fetch all from Supabase ──► queue.enqueue() ──► merge + replaceCache
```

Three sync triggers:

| Trigger | Function | When |
|---------|----------|------|
| **Push-on-mutate** | `pushEntity()` | After every local mutation |
| **Pull-on-focus** | `pull()` | Window receives focus |
| **Dirty-push-on-reconnect** | `syncDirtyAndPull()` | Offline → online transition, app startup |

All three are gated: they no-op if offline or not signed in.

---

## Startup Sequence

`src/main/index.ts:91` — `bootstrap()`:

```
1. initDatabase()          — load tasks.json + notes.json into in-memory caches
2. initSupabase()          — create Supabase client, set session file path
3. restoreSession()        — read auth-session.json, validate tokens via getUser()
4. initSync()              — load sync-meta.json, wire focus listener, start connectivity poll
5. if session restored → syncDirtyAndPull()   — push anything dirty, then pull
6. createTooDooOverlay()   — show main window
```

The UI is shown after sync initialization but does NOT wait for `syncDirtyAndPull()` to finish.
The user sees local data immediately; remote data merges in the background.

---

## Push-on-Mutate

**Source:** `sync.ts:92` — `pushEntity()`
**Called from:** `database.ts` after every successful mutation

### Flow

1. Mutation runs inside `queue.enqueue()` — updates in-memory cache, persists to JSON
2. On success, calls `pushEntity(type, entity)` with the mutated entity
3. `pushEntity` is **fire-and-forget** — the mutation returns immediately, push happens async
4. Push goes through a serialized **promise chain** (see [Queue Serialization](#queue-serialization))

### What gets pushed

| Mutation | Entities Pushed |
|----------|----------------|
| `addTask` | task |
| `updateTask` | task |
| `reorderTask` | task |
| `deleteTask` | task (with `deletedAt` set) |
| `addProjectNote` | projectNote + parent task |
| `updateProjectNote` | projectNote + parent task |
| `deleteProjectNote` | parent task + deleted projectNote |
| `addNote` | note |
| `updateNote` | note |
| `deleteNote` | note (with `deletedAt` set) |

### Offline behavior

`pushEntity` returns immediately (no-op) when `net.isOnline()` is false or user is not signed in.
The mutation is only in local storage. Recovery relies on [Dirty-Push-on-Reconnect](#dirty-push-on-reconnect).

---

## Pull-on-Focus

**Source:** `sync.ts:101` — `pull()`
**Triggered by:** `browser-window-focus` event (wired in `initSync`)

### Flow

1. Guard: return if offline or not signed in
2. Set sync status → `'syncing'`
3. Fetch all three tables in parallel:
   ```
   Promise.all([
     client.from('tasks').select('*'),
     client.from('project_notes').select('*'),
     client.from('notes').select('*'),
   ])
   ```
4. Convert rows from Postgres format → app format (snake_case → camelCase, ISO → Unix ms)
5. Group remote project notes by `taskId`
6. **Enqueue merge into the mutation queue** — this ensures the merge is serialized with any pending mutations
7. Inside the queue:
   - Read local caches (`getAllTasksRaw()`, `getAllNotesRaw()`)
   - Merge each entity by `updatedAt` (see [Merge Strategy](#merge-strategy))
   - `replaceCache()` — overwrite in-memory cache + persist to JSON
8. Broadcast `tasks:changed` and `notes:changed` to all renderer windows
9. Set sync status → `'synced'`

### Why the merge is safe

The merge runs **inside** `queue.enqueue()` — the same queue that serializes all mutations.
This means a mutation that arrives mid-pull either:
- Ran before the merge → merge sees the updated local cache
- Queued behind the merge → runs after `replaceCache`, modifying the merged cache

No concurrent cache access is possible.

---

## Dirty-Push-on-Reconnect

**Source:** `sync.ts:205` — `syncDirtyAndPull()`
**Triggered by:** offline → online transition (connectivity poll), app startup with restored session

### Flow

1. Guard: return if offline or not signed in
2. Set sync status → `'syncing'`
3. Read all raw entities (including soft-deleted) from in-memory cache
4. For each entity where `updatedAt > lastSyncedAt`:
   - Call `doUpsert()` directly (not through the push chain)
   - Track failures: `hadFailures = true` if any upsert fails
5. Push dirty project notes nested inside dirty tasks
6. Call `pull()` — merge remote state regardless of push success
7. **Only if all pushes succeeded:**
   - `lastSyncedAt = Date.now()`
   - Persist to `sync-meta.json`

### Watermark semantics

- `lastSyncedAt` is the unix ms timestamp of the last **fully successful** dirty sync
- Stored in `{userData}/sync-meta.json`
- Only advances when **every** dirty push succeeds — conservative by design
- If any push fails, the watermark stays, so next sync retries everything since then
- Redundant re-pushes are safe because Supabase `upsert` is idempotent

---

## Merge Strategy

**Rule:** `remote.updatedAt >= local.updatedAt` → remote wins. Otherwise local wins.

```
for each local entity:
  find matching remote by id
  if remote exists AND remote.updatedAt >= local.updatedAt:
    use remote version
  else:
    use local version

for each remote entity not in local:
  add to merged result (new from another device)
```

### Tie-breaking

The `>=` means **ties go to remote** (server-authoritative). This is intentional — the server's
`updated_at` is set by a Postgres trigger (`set_updated_at()`), so it's the canonical clock.

### Project note merge

Project notes are merged independently within their parent task. Even if the task itself is
kept as local (local-newer), its project notes are still merged with remote project notes.
This handles the case where a project note was edited on another device without touching the
parent task.

### Soft-deleted entities

Soft-deleted entities participate in merge normally. A remote deletion (`deletedAt` set, newer
`updatedAt`) overwrites a local active version. The deleted entity stays in the cache as a
tombstone — `getTasks()`/`getNotes()` filter it out for the UI.

---

## Queue Serialization

Two separate serialization mechanisms:

### 1. Mutation Queue (`queue.ts`)

```typescript
const queue = createQueue()  // used in database.ts
```

- Serializes ALL local operations: reads, writes, and pull merges
- FIFO ordering — operations execute one at a time
- Errors don't break the chain (caught internally)
- The pull merge runs inside this queue via `enqueueSync`

### 2. Push Chain (`sync.ts:27`)

```typescript
let pushChain: Promise<void> = Promise.resolve()
```

- Serializes all outbound pushes to Supabase
- Prevents out-of-order writes from network latency
- Separate from the mutation queue — pushes don't block local operations
- **Global chain** — all entity types share one chain (tasks, notes, project notes)

### Why two queues

The mutation queue protects local state consistency. The push chain protects remote write ordering.
They're decoupled so local operations are never blocked by network latency.

```
mutation queue:   [addTask] → [updateTask] → [pull merge] → [deleteTask]
push chain:              [push task A] → [push task A v2] → [push task B]
                         ↑ runs in parallel, doesn't block mutation queue
```

---

## Connectivity Detection

**Source:** `sync.ts:275` — `pollConnectivity()`

- Polls `net.isOnline()` every **30 seconds** (`CONNECTIVITY_POLL_MS`)
- On offline → online transition (with active auth): triggers `syncDirtyAndPull()`
- On any transition to offline: sets sync status → `'offline'`
- Uses Electron's `net.isOnline()` (delegates to OS network stack)

---

## Auth & Session Persistence

**Source:** `supabase.ts`

### Sign-in

1. `signInWithPassword(email, password)` via Supabase client
2. Store `userId` in memory
3. Persist `{ access_token, refresh_token }` to `{userData}/auth-session.json`
4. Broadcast `auth:status-changed`

### Session restore (app startup)

1. Read `auth-session.json`
2. `setSession()` with stored tokens
3. Validate via `getUser()` — confirms tokens are still valid
4. If valid: persist refreshed tokens, set `userId`
5. If invalid: clear session file, return false

### Sign-out

1. Call `supabase.auth.signOut()` (errors are non-fatal)
2. Clear session file (write `null`)
3. Clear `userId`

### Configuration

```typescript
createClient(url, anonKey, {
  auth: {
    persistSession: false,    // we handle persistence ourselves
    autoRefreshToken: true,   // Supabase SDK auto-refreshes before expiry
  },
})
```

---

## Type Mappers

**Source:** `src/shared/supabase-types.ts`

Bidirectional conversion between app types (camelCase, Unix ms) and Postgres rows (snake_case, ISO 8601).

| App Field | Postgres Column | Conversion |
|-----------|----------------|------------|
| `createdAt` (number) | `created_at` (timestamptz) | `new Date(ms).toISOString()` ↔ `new Date(iso).getTime()` |
| `updatedAt` (number) | `updated_at` (timestamptz) | same |
| `deletedAt` (number?) | `deleted_at` (timestamptz?) | same, with null ↔ undefined |
| `scheduledDate` (number?) | `scheduled_date` (date?) | Local midnight: `YYYY-MM-DD` ↔ `new Date(y, m-1, d).getTime()` |
| `isDone` | `is_done` | direct |
| `sortOrder` | `sort_order` | direct (string) |
| `taskId` | `task_id` | direct |

**Important:** `scheduledDate` uses **local (KST) date methods**, not UTC. This matches how the
app creates dates via `date.setHours(0, 0, 0, 0)` in the calendar UI.

---

## Server Schema

### Tables

Three tables with RLS policies: `tasks`, `project_notes`, `notes`.
All policies: `auth.uid() = user_id` for select/insert/update/delete.

### Server-authoritative timestamps (migration 002)

```sql
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;
```

Applied as `BEFORE INSERT OR UPDATE` trigger on all three tables.

**Effect:** Client's `updated_at` value is **always overridden** by the server's `now()`.
This makes merge resolution clock-independent — no matter what the client's clock says,
the server provides the canonical ordering.

**Consequence for merge:** After a push, the server's `updated_at` may differ from the client's
`updatedAt`. The next `pull()` will see the server's timestamp and (if newer) adopt the server
version. Since the content is identical, this is a no-op merge that keeps the data consistent.

---

## Guarantees

**What the sync system guarantees:**

1. **No local operation blocks on network** — pushes are fire-and-forget
2. **Local state is always persisted** — JSON write happens before push
3. **Merge is serialized** — pull merge runs in the same queue as mutations, preventing concurrent cache access
4. **Write ordering is preserved** — push chain ensures sequential upserts
5. **Offline mutations survive** — dirty-push on reconnect catches up using watermark
6. **Idempotent pushes** — upsert means duplicate pushes are harmless
7. **Server is the clock** — `updated_at` trigger eliminates client clock skew
8. **Push failures are visible** — failed pushes turn the sync dot red (dirty ID tracking)
9. **No concurrent syncs** — `syncLock` boolean prevents overlapping pull/dirty-sync operations
10. **Auth expiry is detected** — push failures trigger an auth health check (with 30s cooldown)
11. **Persist failures don't corrupt state** — `replaceCache` rolls back in-memory cache if disk write fails

---

## Known Limitations

### Global push chain

All entity types share one promise chain. A slow or failed push to one entity delays pushes
to all others. For a single-user app with low write volume, this is acceptable.

### No pull pagination

`pull()` fetches all rows from all three tables with `select('*')`. If the dataset grows to
thousands of entities, this could be slow. Not a current concern for personal use.

### 30-second connectivity lag

Network changes are detected via polling, not events. Offline → online transition may take
up to 30 seconds to trigger a sync.

### Watermark is all-or-nothing

If 99 pushes succeed and 1 fails during dirty sync, the watermark doesn't advance.
Next sync re-pushes all 99 again. This is safe (idempotent) but wasteful.

### No conflict UI

When remote wins a merge, the local version is silently overwritten. There's no conflict
resolution UI or undo. For a single-user app, conflicts only arise from the same person
editing on two devices before syncing — rare and usually recoverable.

### Soft-delete tombstones accumulate

Deleted entities stay in the JSON file and Supabase indefinitely. No cleanup/purge mechanism.

---

## File Map

| File | Role |
|------|------|
| `src/main/db/sync/sync.ts` | Push, pull, merge, dirty sync, connectivity polling |
| `src/main/db/sync/supabase.ts` | Supabase client, auth (sign-in/out, session persist/restore) |
| `src/main/db/database.ts` | Queue-wrapped mutations, pushEntity calls after each mutation |
| `src/main/db/queue.ts` | Async operation serializer (FIFO promise chain) |
| `src/main/db/store.ts` | JSON file I/O (atomic write via tmp + rename) |
| `src/main/db/tasks.ts` | Task + ProjectNote in-memory cache, CRUD, replaceCache |
| `src/main/db/notes.ts` | Note in-memory cache, CRUD, replaceCache |
| `src/shared/supabase-types.ts` | Row types + bidirectional mappers (camelCase ↔ snake_case) |
| `src/shared/ipc.ts` | IPC channel constants (auth/sync status events) |
| `supabase/migrations/001_initial_schema.sql` | Tables, indexes, RLS policies |
| `supabase/migrations/002_server_timestamps.sql` | Server-authoritative `updated_at` trigger |
| `tests/main/sync-engine.test.ts` | Push, pull, merge, watermark, guard, auth expiry, connectivity tests |
| `tests/main/sync-supabase.test.ts` | Auth sign-in/out, session restore tests |
| `tests/main/database-sync.test.ts` | database.ts → pushEntity integration tests |
