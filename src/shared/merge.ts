/**
 * Pure merge combinator for sync pull. Used by both the desktop
 * main process and the mobile data layer to resolve local/remote
 * divergence on `updatedAt`.
 *
 * Rules:
 *   - For each id present on both sides, take the one with the
 *     larger updatedAt. On tie, remote wins (the server is the
 *     source of truth; the 002_server_timestamps trigger stamps
 *     `now()` on every upsert, making ties meaningful).
 *   - Items only on one side pass through unchanged.
 *   - Output preserves local order first, then appends remote-only
 *     items in their received order. This keeps UI-visible ordering
 *     stable when a pull brings only minor changes.
 */

export interface HasIdUpdatedAt {
  id: string
  updatedAt: number
}

export const mergeByUpdatedAt = <T extends HasIdUpdatedAt>(local: T[], remote: T[]): T[] => {
  const merged: T[] = []
  const seen = new Set<string>()
  const remoteById = new Map<string, T>()
  for (const r of remote) remoteById.set(r.id, r)

  for (const l of local) {
    seen.add(l.id)
    const r = remoteById.get(l.id)
    merged.push(r && r.updatedAt >= l.updatedAt ? r : l)
  }

  for (const r of remote) {
    if (!seen.has(r.id)) merged.push(r)
  }

  return merged
}
