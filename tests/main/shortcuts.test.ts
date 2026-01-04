/**
 * Global Shortcuts Unit Tests
 *
 * Tests for shortcut registration, definitions, and manager functionality.
 */

import { describe, it, expect } from 'vitest'
import { SHORTCUTS, type ShortcutId, type ShortcutDefinition } from '@main/shortcuts/definitions'

describe('Shortcut Definitions', () => {
  describe('SHORTCUTS constant', () => {
    it('should define all expected shortcuts', () => {
      const expectedIds: ShortcutId[] = [
        'toodoo:scorching',
        'toodoo:hot',
        'toodoo:warm',
        'toodoo:cool',
        'toodoo:project',
        'notetank:new',
      ]

      for (const id of expectedIds) {
        expect(SHORTCUTS[id]).toBeDefined()
      }
    })

    it('should have correct structure for each shortcut', () => {
      for (const [id, shortcut] of Object.entries(SHORTCUTS)) {
        expect(shortcut).toHaveProperty('id')
        expect(shortcut).toHaveProperty('accelerator')
        expect(shortcut).toHaveProperty('description')
        expect(shortcut).toHaveProperty('category')
        expect(shortcut.id).toBe(id)
      }
    })

    it('should have unique accelerators', () => {
      const accelerators = Object.values(SHORTCUTS).map(s => s.accelerator)
      const uniqueAccelerators = new Set(accelerators)
      expect(uniqueAccelerators.size).toBe(accelerators.length)
    })
  })

  describe('Task shortcuts', () => {
    it('should have CapsLock for scorching tasks', () => {
      expect(SHORTCUTS['toodoo:scorching'].accelerator).toBe('CapsLock')
      expect(SHORTCUTS['toodoo:scorching'].category).toBe('scorching')
    })

    it('should have Alt+Shift+H for hot tasks', () => {
      expect(SHORTCUTS['toodoo:hot'].accelerator).toBe('Alt+Shift+H')
      expect(SHORTCUTS['toodoo:hot'].category).toBe('hot')
    })

    it('should have Alt+Shift+W for warm tasks', () => {
      expect(SHORTCUTS['toodoo:warm'].accelerator).toBe('Alt+Shift+W')
      expect(SHORTCUTS['toodoo:warm'].category).toBe('warm')
    })

    it('should have Alt+Shift+C for cool tasks', () => {
      expect(SHORTCUTS['toodoo:cool'].accelerator).toBe('Alt+Shift+C')
      expect(SHORTCUTS['toodoo:cool'].category).toBe('cool')
    })

    it('should have Alt+Shift+P for project tasks', () => {
      expect(SHORTCUTS['toodoo:project'].accelerator).toBe('Alt+Shift+P')
      expect(SHORTCUTS['toodoo:project'].category).toBe('project')
    })
  })

  describe('Notetank shortcuts', () => {
    it('should have Alt+Shift+N for new note', () => {
      expect(SHORTCUTS['notetank:new'].accelerator).toBe('Alt+Shift+N')
      expect(SHORTCUTS['notetank:new'].category).toBeNull()
    })
  })

  describe('Category mapping', () => {
    it('all task shortcuts should have valid categories', () => {
      const validCategories = ['scorching', 'hot', 'warm', 'cool', 'project']
      const taskShortcuts = Object.values(SHORTCUTS).filter(s => s.category !== null)

      for (const shortcut of taskShortcuts) {
        expect(validCategories).toContain(shortcut.category)
      }
    })

    it('notetank shortcuts should have null category', () => {
      const notetankShortcuts = Object.values(SHORTCUTS).filter(s =>
        s.id.startsWith('notetank:')
      )

      for (const shortcut of notetankShortcuts) {
        expect(shortcut.category).toBeNull()
      }
    })
  })
})

// Note: Shortcut Manager tests are skipped because they require complex
// Electron globalShortcut mocking that doesn't work reliably with vi.resetModules().
// The manager is tested via E2E tests in the real Electron environment.

describe('Accelerator Format', () => {
  it('all accelerators should be valid Electron format', () => {
    const validModifiers = ['Alt', 'Shift', 'Control', 'Ctrl', 'Command', 'Cmd', 'Super', 'Meta']
    const validKeys = [
      // Letters
      ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),
      // Function keys
      ...Array.from({ length: 24 }, (_, i) => `F${i + 1}`),
      // Special keys
      'Space', 'Tab', 'Enter', 'Return', 'Escape', 'Esc',
      'Backspace', 'Delete', 'Insert', 'Home', 'End',
      'PageUp', 'PageDown', 'Left', 'Right', 'Up', 'Down',
      'CapsLock', 'NumLock', 'ScrollLock', 'PrintScreen',
      // Numbers
      ...'0123456789'.split(''),
      // Numpad
      ...Array.from({ length: 10 }, (_, i) => `num${i}`),
      'numadd', 'numsub', 'nummult', 'numdiv', 'numdec',
    ]

    for (const shortcut of Object.values(SHORTCUTS)) {
      const parts = shortcut.accelerator.split('+')

      // Each part should be either a modifier or a key
      for (const part of parts) {
        const isModifier = validModifiers.includes(part)
        const isKey = validKeys.includes(part)
        expect(isModifier || isKey).toBe(true)
      }
    }
  })

  it('CapsLock should be a standalone key (no modifiers)', () => {
    const scorching = SHORTCUTS['toodoo:scorching']
    expect(scorching.accelerator).toBe('CapsLock')
    expect(scorching.accelerator.includes('+')).toBe(false)
  })

  it('task shortcuts (except scorching) should use Alt+Shift modifier', () => {
    const taskShortcuts = ['toodoo:hot', 'toodoo:warm', 'toodoo:cool', 'toodoo:project'] as const

    for (const id of taskShortcuts) {
      expect(SHORTCUTS[id].accelerator).toMatch(/^Alt\+Shift\+[A-Z]$/)
    }
  })
})
