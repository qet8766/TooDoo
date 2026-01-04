/**
 * Notetank Component Tests
 *
 * Tests for the Notetank overlay including notes list, search, and CRUD operations.
 */

import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import type { Note } from '../../src/shared/types'

const sampleNotes: Note[] = [
  {
    id: 'note-1',
    title: 'First Note',
    content: 'This is the content of the first note.',
    createdAt: Date.now() - 86400000,
    updatedAt: Date.now() - 3600000,
    isDeleted: false,
  },
  {
    id: 'note-2',
    title: 'Second Note with Long Content',
    content: 'This is a much longer note that contains quite a bit of text. It should be truncated in the preview mode but shown in full when expanded. The content continues here with more details about the note.',
    createdAt: Date.now() - 172800000,
    updatedAt: Date.now() - 7200000,
    isDeleted: false,
  },
  {
    id: 'note-3',
    title: 'Meeting Notes',
    content: 'Discussed project timeline, assigned tasks to team members.',
    createdAt: Date.now() - 259200000,
    updatedAt: Date.now() - 86400000,
    isDeleted: false,
  },
]

// Create mock script for notetank
const createNotetankMock = (notes: Note[]) => `
(function() {
  var mockNotes = ${JSON.stringify(notes)};
  var listeners = [];

  var notifyListeners = function() {
    listeners.forEach(function(cb) { cb(); });
  };

  var toodooMock = {
    tasks: {
      list: function() { return Promise.resolve([]); },
      add: function() { return Promise.resolve({}); },
      update: function() { return Promise.resolve({}); },
      remove: function() { return Promise.resolve({}); },
      addNote: function() { return Promise.resolve({}); },
      removeNote: function() { return Promise.resolve({}); }
    },
    onTasksChanged: function(callback) {
      return function() {};
    },
    notes: {
      list: function() {
        return Promise.resolve(mockNotes.filter(function(n) { return !n.isDeleted; }));
      },
      add: function(payload) {
        var note = {
          id: payload.id || crypto.randomUUID(),
          title: payload.title,
          content: payload.content,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          isDeleted: false
        };
        mockNotes.push(note);
        notifyListeners();
        return Promise.resolve(note);
      },
      update: function(payload) {
        var idx = mockNotes.findIndex(function(n) { return n.id === payload.id; });
        if (idx === -1) return Promise.resolve(null);
        Object.assign(mockNotes[idx], payload, { updatedAt: Date.now() });
        notifyListeners();
        return Promise.resolve(mockNotes[idx]);
      },
      remove: function(id) {
        mockNotes = mockNotes.filter(function(n) { return n.id !== id; });
        notifyListeners();
        return Promise.resolve({ id: id });
      }
    },
    onNotesChanged: function(callback) {
      listeners.push(callback);
      return function() {
        var idx = listeners.indexOf(callback);
        if (idx > -1) listeners.splice(idx, 1);
      };
    },
    noteEditor: {
      open: function(noteId) { console.log('[Mock] noteEditor.open', noteId); },
      close: function() { console.log('[Mock] noteEditor.close'); }
    },
    switchView: function(view) { console.log('[Mock] switchView', view); },
    config: {
      get: function() { return Promise.resolve({ nasPath: '\\\\\\\\mock\\\\toodoo', machineId: 'mock', lastSyncAt: Date.now() }); },
      needsSetup: function() { return Promise.resolve(false); }
    },
    sync: {
      getStatus: function() { return Promise.resolve({ isOnline: true, pendingCount: 0, lastSyncAt: Date.now(), circuitBreakerOpen: false, nextRetryAt: null }); }
    },
    setup: {
      browseFolder: function() { return Promise.resolve(null); },
      complete: function() { return Promise.resolve(); }
    },
    toggleOverlay: function() {},
    openQuickAdd: function() {}
  };

  Object.defineProperty(window, 'toodoo', {
    value: toodooMock,
    writable: false,
    configurable: true,
    enumerable: true
  });
})();
`

const injectNotetankMock = async (page: Page, notes: Note[] = sampleNotes) => {
  const mockScript = createNotetankMock(notes)

  await page.unroute('**/*')
  await page.route('**/*', async (route) => {
    const request = route.request()

    if (request.resourceType() === 'document') {
      const response = await route.fetch()
      let html = await response.text()
      html = html.replace('<head>', `<head><script>${mockScript}</script>`)

      await route.fulfill({
        response,
        body: html,
        headers: {
          ...response.headers(),
          'content-length': String(Buffer.byteLength(html)),
        },
      })
    } else {
      await route.continue()
    }
  })
}

test.describe('Notetank Overlay', () => {
  test.describe('UI Rendering', () => {
    test('displays notetank shell', async ({ page }) => {
      await injectNotetankMock(page)
      await page.goto('/#/notetank')
      await page.waitForLoadState('domcontentloaded')

      const shell = page.locator('.notetank-shell')
      await expect(shell).toBeVisible()
    })

    test('displays topbar with controls', async ({ page }) => {
      await injectNotetankMock(page)
      await page.goto('/#/notetank')
      await page.waitForLoadState('domcontentloaded')

      const topbar = page.locator('.overlay-topbar-fixed')
      await expect(topbar).toBeVisible()

      // Font size buttons
      await expect(page.locator('.font-btn:has-text("A-")')).toBeVisible()
      await expect(page.locator('.font-btn:has-text("A+")')).toBeVisible()
    })

    test('displays Tasks switch button', async ({ page }) => {
      await injectNotetankMock(page)
      await page.goto('/#/notetank')
      await page.waitForLoadState('domcontentloaded')

      await expect(page.locator('.feature-btn:has-text("Tasks")')).toBeVisible()
    })

    test('displays search bar', async ({ page }) => {
      await injectNotetankMock(page)
      await page.goto('/#/notetank')
      await page.waitForLoadState('domcontentloaded')

      const searchBar = page.locator('.search-bar')
      await expect(searchBar).toBeVisible()
      await expect(searchBar).toHaveAttribute('placeholder', /Search/)
    })

    test('displays New note button', async ({ page }) => {
      await injectNotetankMock(page)
      await page.goto('/#/notetank')
      await page.waitForLoadState('domcontentloaded')

      await expect(page.locator('.add-note-btn:has-text("New")')).toBeVisible()
    })

    test('displays note cards', async ({ page }) => {
      await injectNotetankMock(page, sampleNotes)
      await page.goto('/#/notetank')
      await page.waitForLoadState('domcontentloaded')

      const noteCards = page.locator('.note-card')
      await expect(noteCards).toHaveCount(3)
    })
  })

  test.describe('Note Cards', () => {
    test('displays note title', async ({ page }) => {
      await injectNotetankMock(page, sampleNotes)
      await page.goto('/#/notetank')
      await page.waitForLoadState('domcontentloaded')

      await expect(page.locator('.note-title:has-text("First Note")')).toBeVisible()
    })

    test('displays note date', async ({ page }) => {
      await injectNotetankMock(page, sampleNotes)
      await page.goto('/#/notetank')
      await page.waitForLoadState('domcontentloaded')

      const noteMeta = page.locator('.note-meta').first()
      await expect(noteMeta).toBeVisible()
    })

    test('displays content preview', async ({ page }) => {
      await injectNotetankMock(page, sampleNotes)
      await page.goto('/#/notetank')
      await page.waitForLoadState('domcontentloaded')

      const preview = page.locator('.note-content-preview').first()
      await expect(preview).toBeVisible()
    })

    test('truncates long content preview with ellipsis', async ({ page }) => {
      await injectNotetankMock(page, sampleNotes)
      await page.goto('/#/notetank')
      await page.waitForLoadState('domcontentloaded')

      // The second note has content longer than 100 chars
      const longPreview = page.locator('.note-card').nth(1).locator('.note-content-preview')
      const previewText = await longPreview.textContent()
      expect(previewText).toContain('...')
    })

    test('displays Edit button on each card', async ({ page }) => {
      await injectNotetankMock(page, sampleNotes)
      await page.goto('/#/notetank')
      await page.waitForLoadState('domcontentloaded')

      const editButtons = page.locator('.note-card .small-button:has-text("Edit")')
      await expect(editButtons).toHaveCount(3)
    })

    test('displays delete checkbox on each card', async ({ page }) => {
      await injectNotetankMock(page, sampleNotes)
      await page.goto('/#/notetank')
      await page.waitForLoadState('domcontentloaded')

      const deleteCheckboxes = page.locator('.note-card .delete-checkbox')
      await expect(deleteCheckboxes).toHaveCount(3)
    })
  })

  test.describe('Note Expand/Collapse', () => {
    test('expands note on title click', async ({ page }) => {
      await injectNotetankMock(page, sampleNotes)
      await page.goto('/#/notetank')
      await page.waitForLoadState('domcontentloaded')

      const noteCard = page.locator('.note-card').first()
      await noteCard.locator('.note-title-area').click()

      await expect(noteCard).toHaveClass(/expanded/)
      await expect(noteCard.locator('.note-content-expanded')).toBeVisible()
    })

    test('collapses expanded note on second click', async ({ page }) => {
      await injectNotetankMock(page, sampleNotes)
      await page.goto('/#/notetank')
      await page.waitForLoadState('domcontentloaded')

      const noteCard = page.locator('.note-card').first()
      const titleArea = noteCard.locator('.note-title-area')

      // Expand
      await titleArea.click()
      await expect(noteCard).toHaveClass(/expanded/)

      // Collapse
      await titleArea.click()
      await expect(noteCard).not.toHaveClass(/expanded/)
    })

    test('expands on preview click', async ({ page }) => {
      await injectNotetankMock(page, sampleNotes)
      await page.goto('/#/notetank')
      await page.waitForLoadState('domcontentloaded')

      const noteCard = page.locator('.note-card').first()
      await noteCard.locator('.note-content-preview').click()

      await expect(noteCard).toHaveClass(/expanded/)
    })

    test('shows full content when expanded', async ({ page }) => {
      await injectNotetankMock(page, sampleNotes)
      await page.goto('/#/notetank')
      await page.waitForLoadState('domcontentloaded')

      // Expand the second note (has long content)
      const noteCard = page.locator('.note-card').nth(1)
      await noteCard.locator('.note-title-area').click()

      const expandedContent = noteCard.locator('.note-content-expanded')
      const fullText = await expandedContent.textContent()
      expect(fullText?.length).toBeGreaterThan(100)
      expect(fullText).not.toContain('...')
    })
  })

  test.describe('Search', () => {
    test('filters notes by title', async ({ page }) => {
      await injectNotetankMock(page, sampleNotes)
      await page.goto('/#/notetank')
      await page.waitForLoadState('domcontentloaded')

      await page.fill('.search-bar', 'First')

      const noteCards = page.locator('.note-card')
      await expect(noteCards).toHaveCount(1)
      await expect(page.locator('.note-title:has-text("First Note")')).toBeVisible()
    })

    test('filters notes by content', async ({ page }) => {
      await injectNotetankMock(page, sampleNotes)
      await page.goto('/#/notetank')
      await page.waitForLoadState('domcontentloaded')

      await page.fill('.search-bar', 'timeline')

      const noteCards = page.locator('.note-card')
      await expect(noteCards).toHaveCount(1)
      await expect(page.locator('.note-title:has-text("Meeting Notes")')).toBeVisible()
    })

    test('search is case insensitive', async ({ page }) => {
      await injectNotetankMock(page, sampleNotes)
      await page.goto('/#/notetank')
      await page.waitForLoadState('domcontentloaded')

      await page.fill('.search-bar', 'MEETING')

      const noteCards = page.locator('.note-card')
      await expect(noteCards).toHaveCount(1)
    })

    test('shows no matching notes message', async ({ page }) => {
      await injectNotetankMock(page, sampleNotes)
      await page.goto('/#/notetank')
      await page.waitForLoadState('domcontentloaded')

      await page.fill('.search-bar', 'nonexistent')

      await expect(page.locator('.muted:has-text("No matching notes")')).toBeVisible()
    })

    test('clears search to show all notes', async ({ page }) => {
      await injectNotetankMock(page, sampleNotes)
      await page.goto('/#/notetank')
      await page.waitForLoadState('domcontentloaded')

      await page.fill('.search-bar', 'First')
      await expect(page.locator('.note-card')).toHaveCount(1)

      await page.fill('.search-bar', '')
      await expect(page.locator('.note-card')).toHaveCount(3)
    })
  })

  test.describe('Font Size', () => {
    test('increases font size', async ({ page }) => {
      await injectNotetankMock(page)
      await page.goto('/#/notetank')
      await page.waitForLoadState('domcontentloaded')

      const shell = page.locator('.notetank-shell')
      const initialFontSize = await shell.evaluate((el) =>
        parseInt(window.getComputedStyle(el).fontSize)
      )

      await page.click('.font-btn:has-text("A+")')

      const newFontSize = await shell.evaluate((el) =>
        parseInt(window.getComputedStyle(el).fontSize)
      )

      expect(newFontSize).toBe(initialFontSize + 1)
    })

    test('decreases font size', async ({ page }) => {
      await injectNotetankMock(page)
      await page.goto('/#/notetank')
      await page.waitForLoadState('domcontentloaded')

      const shell = page.locator('.notetank-shell')
      const initialFontSize = await shell.evaluate((el) =>
        parseInt(window.getComputedStyle(el).fontSize)
      )

      await page.click('.font-btn:has-text("A-")')

      const newFontSize = await shell.evaluate((el) =>
        parseInt(window.getComputedStyle(el).fontSize)
      )

      expect(newFontSize).toBe(initialFontSize - 1)
    })
  })

  test.describe('Empty State', () => {
    test('shows empty message when no notes', async ({ page }) => {
      await injectNotetankMock(page, [])
      await page.goto('/#/notetank')
      await page.waitForLoadState('domcontentloaded')

      await expect(page.locator('.muted:has-text("No notes yet")')).toBeVisible()
      await expect(page.locator('.muted:has-text("Alt+Shift+N")')).toBeVisible()
    })
  })

  test.describe('Delete Functionality', () => {
    test('arms delete on first click', async ({ page }) => {
      await injectNotetankMock(page, sampleNotes)
      await page.goto('/#/notetank')
      await page.waitForLoadState('domcontentloaded')

      const deleteCheckbox = page.locator('.note-card').first().locator('.delete-checkbox')
      await deleteCheckbox.click()

      await expect(deleteCheckbox).toHaveClass(/armed/)
    })

    test('deletes note on second click when armed', async ({ page }) => {
      await injectNotetankMock(page, sampleNotes)
      await page.goto('/#/notetank')
      await page.waitForLoadState('domcontentloaded')

      const noteCards = page.locator('.note-card')
      await expect(noteCards).toHaveCount(3)

      const deleteCheckbox = page.locator('.note-card').first().locator('.delete-checkbox')

      // First click arms
      await deleteCheckbox.click()

      // Second click deletes
      await deleteCheckbox.click()

      await expect(noteCards).toHaveCount(2)
    })
  })
})
