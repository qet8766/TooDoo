/**
 * Test fixtures for configuration-related tests
 */

/**
 * Sample NAS paths for testing
 */
export const samplePaths = {
  valid: {
    uncPath: '\\\\server\\share\\toodoo',
    mappedDrive: 'Z:\\toodoo',
    localPath: 'C:\\Users\\Test\\TooDoo',
  },
  invalid: {
    empty: '',
    whitespace: '   ',
    nonExistent: '\\\\nonexistent\\share\\path',
    malformed: '\\\\\\\\bad\\\\path',
  },
}

/**
 * Sample configuration objects
 */
export const sampleConfig = {
  complete: {
    nasPath: '\\\\server\\share\\toodoo',
    machineId: 'test-machine-001',
    lastSyncAt: Date.now(),
  },
  noNasPath: {
    nasPath: null,
    machineId: 'test-machine-002',
    lastSyncAt: 0,
  },
  staleSync: {
    nasPath: '\\\\server\\share\\toodoo',
    machineId: 'test-machine-003',
    lastSyncAt: Date.now() - 86400000 * 7, // 7 days ago
  },
}

/**
 * Sample sync status objects
 */
export const sampleSyncStatus = {
  online: {
    isOnline: true,
    pendingCount: 0,
    lastSyncAt: Date.now(),
    circuitBreakerOpen: false,
    nextRetryAt: null,
  },
  offline: {
    isOnline: false,
    pendingCount: 3,
    lastSyncAt: Date.now() - 60000,
    circuitBreakerOpen: false,
    nextRetryAt: null,
  },
  circuitBreakerOpen: {
    isOnline: false,
    pendingCount: 5,
    lastSyncAt: Date.now() - 300000,
    circuitBreakerOpen: true,
    nextRetryAt: Date.now() + 30000,
  },
  pendingChanges: {
    isOnline: true,
    pendingCount: 2,
    lastSyncAt: Date.now() - 10000,
    circuitBreakerOpen: false,
    nextRetryAt: null,
  },
}

/**
 * Sample local cache structures
 */
export const sampleCache = {
  empty: {
    tasks: [],
    notes: [],
    pendingChanges: [],
    lastNasSyncAt: 0,
  },
  withTasks: {
    tasks: [
      { id: 'cache-task-1', title: 'Cached Task 1', category: 'hot', isDone: false, createdAt: Date.now(), updatedAt: Date.now(), isDeleted: false },
      { id: 'cache-task-2', title: 'Cached Task 2', category: 'warm', isDone: false, createdAt: Date.now(), updatedAt: Date.now(), isDeleted: false },
    ],
    notes: [],
    pendingChanges: [],
    lastNasSyncAt: Date.now(),
  },
  withPendingChanges: {
    tasks: [
      { id: 'pending-task-1', title: 'Pending Task', category: 'hot', isDone: false, createdAt: Date.now(), updatedAt: Date.now(), isDeleted: false },
    ],
    notes: [],
    pendingChanges: [
      { id: 'change-1', table: 'tasks' as const, recordId: 'pending-task-1', operation: 'create' as const, timestamp: Date.now() },
    ],
    lastNasSyncAt: Date.now() - 60000,
  },
}

/**
 * Sample NAS store structures (for sync testing)
 */
export const sampleNasStore = {
  empty: {
    tasks: [],
    notes: [],
    lastModifiedAt: 0,
    lastModifiedBy: '',
  },
  withData: {
    tasks: [
      { id: 'nas-task-1', title: 'NAS Task 1', category: 'hot', isDone: false, createdAt: Date.now() - 1000, updatedAt: Date.now() - 1000, isDeleted: false },
    ],
    notes: [
      { id: 'nas-note-1', title: 'NAS Note 1', content: 'Content', createdAt: Date.now() - 1000, updatedAt: Date.now() - 1000, isDeleted: false },
    ],
    lastModifiedAt: Date.now() - 1000,
    lastModifiedBy: 'other-machine',
  },
  conflicting: {
    tasks: [
      // Same ID as local task but different content and older timestamp
      { id: 'conflict-task-1', title: 'NAS Version', category: 'warm', isDone: false, createdAt: Date.now() - 2000, updatedAt: Date.now() - 500, isDeleted: false },
    ],
    notes: [],
    lastModifiedAt: Date.now() - 500,
    lastModifiedBy: 'other-machine',
  },
}

/**
 * Pending change types for testing
 */
export const samplePendingChanges = [
  { id: 'pc-1', table: 'tasks' as const, recordId: 'task-1', operation: 'create' as const, timestamp: Date.now() - 5000 },
  { id: 'pc-2', table: 'tasks' as const, recordId: 'task-2', operation: 'update' as const, timestamp: Date.now() - 3000 },
  { id: 'pc-3', table: 'tasks' as const, recordId: 'task-3', operation: 'delete' as const, timestamp: Date.now() - 1000 },
  { id: 'pc-4', table: 'notes' as const, recordId: 'note-1', operation: 'create' as const, timestamp: Date.now() },
  { id: 'pc-5', table: 'project_notes' as const, recordId: 'pn-1', operation: 'update' as const, timestamp: Date.now() },
]
