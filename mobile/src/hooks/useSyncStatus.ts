import { useEffect, useState } from 'react'
import { getSyncStatus, onSyncStatusChanged } from '../data/sync'

export type SyncStatus = 'synced' | 'syncing' | 'offline' | 'error'

export function useSyncStatus() {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(getSyncStatus)

  useEffect(() => {
    const unsub = onSyncStatusChanged((status) => setSyncStatus(status as SyncStatus))
    return unsub
  }, [])

  return syncStatus
}
