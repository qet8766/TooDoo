import type { TaskCategory } from '@shared/types'

type ShortcutConfig = { accelerator: string; description: string; category: TaskCategory }

const SHORTCUT_CONFIGS = {
  'toodoo:short_term': { accelerator: 'Alt+Shift+S', description: 'Add short-term task', category: 'short_term' },
  'toodoo:long_term': { accelerator: 'Alt+Shift+L', description: 'Add long-term task', category: 'long_term' },
  'toodoo:project': { accelerator: 'Alt+Shift+P', description: 'Add project task', category: 'project' },
  'toodoo:immediate': { accelerator: 'Alt+Shift+I', description: 'Add immediate task', category: 'immediate' },
} as const satisfies Record<string, ShortcutConfig>

export type ShortcutId = keyof typeof SHORTCUT_CONFIGS
export type ShortcutDefinition = ShortcutConfig & { id: ShortcutId }

// Build full definitions with id derived from key
export const SHORTCUTS = Object.fromEntries(
  Object.entries(SHORTCUT_CONFIGS).map(([id, config]) => [id, { id, ...config }]),
) as Record<ShortcutId, ShortcutDefinition>
