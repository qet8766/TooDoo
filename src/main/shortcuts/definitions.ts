import type { TaskCategory } from '@shared/types'

export type ShortcutId =
  | 'toodoo:short_term'
  | 'toodoo:long_term'
  | 'toodoo:project'
  | 'toodoo:immediate'

export type ShortcutDefinition = {
  id: ShortcutId
  accelerator: string
  description: string
}

export const SHORTCUTS: Record<ShortcutId, ShortcutDefinition> = {
  'toodoo:short_term': {
    id: 'toodoo:short_term',
    accelerator: 'Alt+Shift+S',
    description: 'Add short-term task',
  },
  'toodoo:long_term': {
    id: 'toodoo:long_term',
    accelerator: 'Alt+Shift+L',
    description: 'Add long-term task',
  },
  'toodoo:project': {
    id: 'toodoo:project',
    accelerator: 'Alt+Shift+P',
    description: 'Add project task',
  },
  'toodoo:immediate': {
    id: 'toodoo:immediate',
    accelerator: 'Alt+Shift+I',
    description: 'Add immediate task',
  },
}

export const TOODOO_CATEGORY_SHORTCUTS: Record<string, TaskCategory> = {
  'Alt+Shift+S': 'short_term',
  'Alt+Shift+L': 'long_term',
  'Alt+Shift+P': 'project',
  'Alt+Shift+I': 'immediate',
}
