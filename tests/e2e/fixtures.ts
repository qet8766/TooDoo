/* eslint-disable react-hooks/rules-of-hooks */
import {
  test as base,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

type ToodooFixtures = {
  userDataDir: string
  app: ElectronApplication
  overlay: Page
}

export const launchApp = async (userDataDir: string): Promise<ElectronApplication> => {
  return electron.launch({
    args: [process.cwd(), `--user-data-dir=${userDataDir}`],
    env: {
      ...process.env,
      TOODOO_DISABLE_SYNC: '1',
      NODE_ENV: 'test',
      VITE_DEV_SERVER_URL: '',
    },
  })
}

export const test = base.extend<ToodooFixtures>({
  // eslint-disable-next-line no-empty-pattern
  userDataDir: async ({}, use) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'toodoo-e2e-'))
    await use(dir)
    fs.rmSync(dir, { recursive: true, force: true })
  },
  app: async ({ userDataDir }, use) => {
    const app = await launchApp(userDataDir)
    await use(app)
    await app.close().catch(() => {})
  },
  overlay: async ({ app }, use) => {
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForSelector('[data-testid="overlay"]', { timeout: 10_000 })
    await use(page)
  },
})

export const expect = test.expect

export const dismissSignIn = async (page: Page): Promise<void> => {
  const skip = page.locator('[data-testid="btn-signin-skip"]')
  if (await skip.isVisible().catch(() => false)) {
    await skip.click()
    await page.locator('[data-testid="signin-modal"]').waitFor({ state: 'hidden', timeout: 2_000 })
  }
}

type SeedTaskInput = {
  id?: string
  title: string
  description?: string
  category: 'scorching' | 'hot' | 'warm' | 'cool' | 'timed'
  isDone?: boolean
  scheduledDate?: number
  scheduledTime?: string
}

export const seedTasks = async (page: Page, tasks: SeedTaskInput[]): Promise<string[]> => {
  const ids: string[] = []
  for (const task of tasks) {
    const id = task.id ?? `seed-${Math.random().toString(36).slice(2, 10)}`
    const payload = { ...task, id, isDone: task.isDone ?? false }
    const result = await page.evaluate(async (p) => window.toodoo.tasks.add(p), payload)
    if (!('success' in result) || !result.success) {
      throw new Error(`seedTasks failed: ${JSON.stringify(result)}`)
    }
    ids.push(id)
  }
  return ids
}

type SeedNoteInput = { id?: string; title: string; content: string }

export const seedNotes = async (page: Page, notes: SeedNoteInput[]): Promise<string[]> => {
  const ids: string[] = []
  for (const note of notes) {
    const id = note.id ?? `seed-${Math.random().toString(36).slice(2, 10)}`
    const payload = { id, title: note.title, content: note.content }
    const result = await page.evaluate(async (p) => window.toodoo.notes.add(p), payload)
    if (!('success' in result) || !result.success) {
      throw new Error(`seedNotes failed: ${JSON.stringify(result)}`)
    }
    ids.push(id)
  }
  return ids
}

export const openQuickAdd = async (
  app: ElectronApplication,
  overlay: Page,
  category: SeedTaskInput['category'],
): Promise<Page> => {
  const pagePromise = app.waitForEvent('window')
  await overlay.evaluate((c) => window.toodoo.openQuickAdd(c), category)
  const quickAdd = await pagePromise
  await quickAdd.waitForLoadState('domcontentloaded')
  await quickAdd.waitForSelector('[data-testid="quick-add"]', { timeout: 5_000 })
  return quickAdd
}

export const openNoteEditor = async (
  app: ElectronApplication,
  overlay: Page,
  noteId?: string,
): Promise<Page> => {
  const pagePromise = app.waitForEvent('window')
  await overlay.evaluate((id) => window.toodoo.noteEditor.open(id), noteId)
  const editor = await pagePromise
  await editor.waitForLoadState('domcontentloaded')
  await editor.waitForSelector('[data-testid="note-editor"]', { timeout: 5_000 })
  return editor
}
