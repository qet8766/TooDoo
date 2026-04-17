import { describe, expect, it } from 'vitest'
import { mergeByUpdatedAt } from '@shared/merge'

type Item = { id: string; updatedAt: number; label?: string }

describe('mergeByUpdatedAt', () => {
  it('returns empty array when both sides empty', () => {
    expect(mergeByUpdatedAt<Item>([], [])).toEqual([])
  })

  it('passes through local-only items', () => {
    const local: Item[] = [{ id: 'a', updatedAt: 1 }]
    expect(mergeByUpdatedAt(local, [])).toEqual(local)
  })

  it('passes through remote-only items (appended at end)', () => {
    const remote: Item[] = [{ id: 'r', updatedAt: 1 }]
    expect(mergeByUpdatedAt([], remote)).toEqual(remote)
  })

  it('takes newer remote when remote.updatedAt > local.updatedAt', () => {
    const local: Item[] = [{ id: 'a', updatedAt: 1, label: 'old' }]
    const remote: Item[] = [{ id: 'a', updatedAt: 2, label: 'new' }]
    expect(mergeByUpdatedAt(local, remote)).toEqual([{ id: 'a', updatedAt: 2, label: 'new' }])
  })

  it('takes newer local when local.updatedAt > remote.updatedAt', () => {
    const local: Item[] = [{ id: 'a', updatedAt: 5, label: 'local-wins' }]
    const remote: Item[] = [{ id: 'a', updatedAt: 3, label: 'remote-stale' }]
    expect(mergeByUpdatedAt(local, remote)).toEqual([{ id: 'a', updatedAt: 5, label: 'local-wins' }])
  })

  it('ties go to remote (server as source of truth)', () => {
    const local: Item[] = [{ id: 'a', updatedAt: 5, label: 'local' }]
    const remote: Item[] = [{ id: 'a', updatedAt: 5, label: 'remote' }]
    expect(mergeByUpdatedAt(local, remote)).toEqual([{ id: 'a', updatedAt: 5, label: 'remote' }])
  })

  it('preserves local order then appends remote-only items in order', () => {
    const local: Item[] = [
      { id: 'l1', updatedAt: 1 },
      { id: 'shared', updatedAt: 1 },
      { id: 'l2', updatedAt: 1 },
    ]
    const remote: Item[] = [
      { id: 'r1', updatedAt: 1 },
      { id: 'shared', updatedAt: 2 },
      { id: 'r2', updatedAt: 1 },
    ]
    expect(mergeByUpdatedAt(local, remote).map((i) => i.id)).toEqual(['l1', 'shared', 'l2', 'r1', 'r2'])
  })

  it('handles multiple shared + non-shared combos', () => {
    const local: Item[] = [
      { id: 'a', updatedAt: 10 }, // local wins
      { id: 'b', updatedAt: 1 }, // remote wins
      { id: 'local-only', updatedAt: 5 },
    ]
    const remote: Item[] = [
      { id: 'a', updatedAt: 5 },
      { id: 'b', updatedAt: 9 },
      { id: 'remote-only', updatedAt: 7 },
    ]
    const result = mergeByUpdatedAt(local, remote)
    expect(result.find((i) => i.id === 'a')?.updatedAt).toBe(10)
    expect(result.find((i) => i.id === 'b')?.updatedAt).toBe(9)
    expect(result.map((i) => i.id)).toEqual(['a', 'b', 'local-only', 'remote-only'])
  })

  it('does not mutate inputs', () => {
    const local: Item[] = [{ id: 'a', updatedAt: 1 }]
    const remote: Item[] = [{ id: 'a', updatedAt: 2 }]
    const localCopy = structuredClone(local)
    const remoteCopy = structuredClone(remote)
    mergeByUpdatedAt(local, remote)
    expect(local).toEqual(localCopy)
    expect(remote).toEqual(remoteCopy)
  })
})
