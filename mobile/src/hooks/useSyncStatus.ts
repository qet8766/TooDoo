import { useEffect, useState } from 'react'
import type { SyncReason } from '@shared/ipc'
import { getSyncStatus, getSyncReason, getDirtyCount, onSyncStatusChanged } from '../data/sync'

export type SyncStatus = 'synced' | 'syncing' | 'offline' | 'error' | 'auth-expired'

export type SyncSnapshot = {
  status: SyncStatus
  reason?: SyncReason
  dirtyCount: number
}

export function useSyncStatus(): SyncSnapshot {
  const [snapshot, setSnapshot] = useState<SyncSnapshot>(() => ({
    status: getSyncStatus(),
    reason: getSyncReason(),
    dirtyCount: getDirtyCount(),
  }))

  useEffect(() => {
    const unsub = onSyncStatusChanged((status, reason) => {
      setSnapshot({ status, reason, dirtyCount: getDirtyCount() })
    })
    return unsub
  }, [])

  return snapshot
}
