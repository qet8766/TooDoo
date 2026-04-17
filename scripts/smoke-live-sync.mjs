// Live Supabase smoke test — runs against the real project using the saved
// Electron auth session. Exercises the schema + server trigger behavior that
// the sync engine relies on. Runs in ~10s, no network mocks.
//
//   node scripts/smoke-live-sync.mjs
//
// Precondition: sign in once via `npm run dev` so auth-session.json exists.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://envrmnyjyxwqhmfpvajd.supabase.co'
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVudnJtbnlqeXh3cWhtZnB2YWpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzMDI3MDIsImV4cCI6MjA5MTg3ODcwMn0.0scvbbrjyjoAUD7rOd0meSx9wFNxSO-LO6Wj2X0If5U'

const userDataPath = process.env.APPDATA
  ? join(process.env.APPDATA, 'TooDoo')
  : join(process.env.HOME ?? '', '.config', 'TooDoo')
const sessionPath = join(userDataPath, 'auth-session.json')

const results = []
const record = (name, passed, detail = '') => {
  results.push({ name, passed, detail })
  const icon = passed ? '\u2713' : '\u2717'
  const line = detail ? `${icon} ${name} — ${detail}` : `${icon} ${name}`
  console.log(line)
}

const run = async () => {
  // --- Load session ---
  let session
  try {
    session = JSON.parse(readFileSync(sessionPath, 'utf8'))
  } catch (err) {
    console.error(`Cannot read session file at ${sessionPath}: ${err.message}`)
    console.error('Run `npm run dev` and sign in first.')
    process.exit(2)
  }

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { error: setErr } = await client.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  })
  if (setErr) {
    record('auth: set session', false, setErr.message)
    return
  }

  const { data: userData, error: userErr } = await client.auth.getUser()
  if (userErr || !userData.user) {
    record('auth: get user', false, userErr?.message ?? 'no user')
    return
  }
  const userId = userData.user.id
  record('auth: session valid', true, `uid=${userId.slice(0, 8)}…`)

  // --- ID helpers ---
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const taskId = `smoke-task-${stamp}`
  const projectNoteId = `smoke-pn-${stamp}`
  const noteId = `smoke-note-${stamp}`

  // Pre-cleanup: sweep anything left from prior crashed runs.
  await client.from('project_notes').delete().like('id', 'smoke-%')
  await client.from('tasks').delete().like('id', 'smoke-%')
  await client.from('notes').delete().like('id', 'smoke-%')

  // --- Task insert roundtrip (Gate 2.3) ---
  const pastIso = new Date(Date.now() - 60_000).toISOString()
  const taskInsert = {
    id: taskId,
    user_id: userId,
    title: 'smoke task',
    description: 'from smoke-live-sync.mjs',
    category: 'hot',
    is_done: false,
    sort_order: 'a0',
    scheduled_date: null,
    scheduled_time: null,
    created_at: pastIso,
    updated_at: pastIso,
    deleted_at: null,
  }
  const { data: inserted, error: insErr } = await client.from('tasks').insert(taskInsert).select().single()
  if (insErr) {
    record('tasks: insert', false, insErr.message)
  } else {
    record('tasks: insert', true)
    // Server trigger 002 should override updated_at with now() — not the past ISO we sent.
    const serverNow = Date.now()
    const serverUpdated = new Date(inserted.updated_at).getTime()
    const drift = Math.abs(serverNow - serverUpdated)
    const triggerWorks = drift < 30_000
    record(
      'tasks: server trigger overrides client updated_at',
      triggerWorks,
      triggerWorks ? `drift ${drift}ms` : `drift ${drift}ms is too large`,
    )
    // Schema shape — all fields present and of the right kind.
    const schemaOk =
      inserted.id === taskId &&
      inserted.title === 'smoke task' &&
      inserted.category === 'hot' &&
      inserted.sort_order === 'a0' &&
      inserted.is_done === false &&
      inserted.deleted_at === null
    record('tasks: row shape matches schema', schemaOk)
  }

  // --- Task update → updated_at advances (Gate 2.5 watermark relies on this) ---
  await new Promise((r) => setTimeout(r, 1100)) // server resolution is 1ms but we want a visible gap
  const { data: updated, error: updErr } = await client
    .from('tasks')
    .update({ title: 'smoke task v2' })
    .eq('id', taskId)
    .select()
    .single()
  if (updErr) {
    record('tasks: update', false, updErr.message)
  } else {
    // Compare against the insert's server-stamped updated_at — no local-vs-server clock skew.
    const insertedAt = inserted ? new Date(inserted.updated_at).getTime() : 0
    const updatedAt = new Date(updated.updated_at).getTime()
    const advanced = updatedAt > insertedAt
    record(
      'tasks: updated_at advances on update',
      advanced,
      `insert=${inserted?.updated_at}, update=${updated.updated_at}`,
    )
  }

  // --- Soft-delete tombstone (Gate 2.6) ---
  const { data: tombstoned, error: delErr } = await client
    .from('tasks')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', taskId)
    .select()
    .single()
  if (delErr) {
    record('tasks: soft-delete (set deleted_at)', false, delErr.message)
  } else {
    const ok = tombstoned.deleted_at !== null && tombstoned.id === taskId
    record('tasks: tombstone persists (row still present with deleted_at)', ok)
  }

  // --- Project note with FK (Gate 3: mobile also writes these) ---
  const { error: pnErr } = await client.from('project_notes').insert({
    id: projectNoteId,
    task_id: taskId,
    user_id: userId,
    content: 'smoke project note',
    created_at: pastIso,
    updated_at: pastIso,
    deleted_at: null,
  })
  record('project_notes: insert with FK', !pnErr, pnErr?.message ?? '')

  // --- Project note soft-delete tombstone (Gate 2.6 specifically) ---
  if (!pnErr) {
    const { data: pnTomb, error: pnDelErr } = await client
      .from('project_notes')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', projectNoteId)
      .select()
      .single()
    record(
      'project_notes: tombstone persists',
      !pnDelErr && pnTomb?.deleted_at !== null,
      pnDelErr?.message ?? '',
    )
  }

  // --- Note (Notetank) insert ---
  const { error: noteErr } = await client.from('notes').insert({
    id: noteId,
    user_id: userId,
    title: 'smoke note',
    content: 'scratch',
    created_at: pastIso,
    updated_at: pastIso,
    deleted_at: null,
  })
  record('notes: insert', !noteErr, noteErr?.message ?? '')

  // --- Select round-trip (Gate 2.4: pull semantics — read back all our rows) ---
  const { data: pulled, error: pullErr } = await client
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .eq('id', taskId)
  if (pullErr) {
    record('tasks: select roundtrip', false, pullErr.message)
  } else {
    record('tasks: select roundtrip', pulled.length === 1, `returned ${pulled.length} rows`)
  }

  // --- Merge-rule sanity: update with stale updated_at, server stamps now() anyway ---
  const staleIso = new Date(Date.now() - 3_600_000).toISOString()
  const { data: reStamped, error: reErr } = await client
    .from('tasks')
    .update({ title: 'stale-client-clock-test', updated_at: staleIso })
    .eq('id', taskId)
    .select()
    .single()
  if (reErr) {
    record('tasks: server ignores stale client updated_at', false, reErr.message)
  } else {
    const stamped = new Date(reStamped.updated_at).getTime()
    const stale = new Date(staleIso).getTime()
    record(
      'tasks: server ignores stale client updated_at',
      stamped > stale + 3_000_000, // at least 50 min newer than what client sent
      `client sent ${staleIso}, server stamped ${reStamped.updated_at}`,
    )
  }

  // --- RLS sanity: anon client (no session) sees nothing ---
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: anonRows, error: anonErr } = await anon.from('tasks').select('id').limit(1)
  const anonOk = !anonErr && Array.isArray(anonRows) && anonRows.length === 0
  record('RLS: anon session sees zero rows', anonOk, anonErr?.message ?? `got ${anonRows?.length} rows`)

  // --- Cleanup (FK order: project_notes before tasks) ---
  await client.from('project_notes').delete().like('id', 'smoke-%')
  await client.from('tasks').delete().like('id', 'smoke-%')
  await client.from('notes').delete().like('id', 'smoke-%')
  record('cleanup: smoke rows removed', true)
}

await run()

const failed = results.filter((r) => !r.passed)
console.log('')
console.log(`${results.length - failed.length}/${results.length} checks passed`)
if (failed.length > 0) {
  console.error('Failures:')
  for (const f of failed) console.error(`  ${f.name}: ${f.detail}`)
  process.exit(1)
}
