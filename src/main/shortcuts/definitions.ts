import type { TaskCategory } from '@shared/types'

type TaskShortcutConfig = { accelerator: string; description: string; category: TaskCategory }
type NotetankShortcutConfig = { accelerator: string; description: string; category: null }
type ShortcutConfig = TaskShortcutConfig | NotetankShortcutConfig

const SHORTCUT_CONFIGS = {
  'toodoo:scorching': { accelerator: 'Alt+Shift+Q', description: 'Add scorching task', category: 'scorching' },
  'toodoo:hot': { accelerator: 'Alt+Shift+W', description: 'Add hot task', category: 'hot' },
  'toodoo:warm': { accelerator: 'Alt+Shift+E', description: 'Add warm task', category: 'warm' },
  'toodoo:cool': { accelerator: 'Alt+Shift+R', description: 'Add cool task', category: 'cool' },
  'toodoo:project': { accelerator: 'Alt+Shift+T', description: 'Add project task', category: 'project' },
  'notetank:new': { accelerator: 'Alt+Shift+N', description: 'Add new note', category: null },
} as const satisfies Record<string, ShortcutConfig>

export type ShortcutId = keyof typeof SHORTCUT_CONFIGS
export type ShortcutDefinition = ShortcutConfig & { id: ShortcutId }

// Build full definitions with id derived from key
export const SHORTCUTS = Object.fromEntries(
  Object.entries(SHORTCUT_CONFIGS).map(([id, config]) => [id, { id, ...config }]),
) as Record<ShortcutId, ShortcutDefinition>
