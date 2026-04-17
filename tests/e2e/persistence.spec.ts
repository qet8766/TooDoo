import { test, expect } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { launchApp, dismissSignIn, seedTasks } from './fixtures'

test('tasks survive a restart with the same userData directory', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'toodoo-e2e-persist-'))

  try {
    // First launch: seed two tasks, then close.
    const app1 = await launchApp(userDataDir)
    const overlay1 = await app1.firstWindow()
    await overlay1.waitForLoadState('domcontentloaded')
    await overlay1.waitForSelector('[data-testid="overlay"]')
    await dismissSignIn(overlay1)
    await seedTasks(overlay1, [
      { id: 'persist-1', title: 'First survivor', category: 'hot' },
      { id: 'persist-2', title: 'Second survivor', category: 'cool' },
    ])

    // Confirm data was written to disk before closing.
    const tasksPath = path.join(userDataDir, 'data', 'tasks.json')
    await expect
      .poll(() => fs.existsSync(tasksPath), { timeout: 3_000 })
      .toBe(true)

    await app1.close()

    // Second launch: same userData, assert both tasks reappear.
    const app2 = await launchApp(userDataDir)
    const overlay2 = await app2.firstWindow()
    await overlay2.waitForLoadState('domcontentloaded')
    await overlay2.waitForSelector('[data-testid="overlay"]')
    await dismissSignIn(overlay2)

    await expect(overlay2.locator('[data-testid="task-persist-1"]')).toBeVisible()
    await expect(overlay2.locator('[data-testid="task-persist-2"]')).toBeVisible()

    const tasks = await overlay2.evaluate(() => window.toodoo.tasks.list())
    const titles = tasks.map((t) => t.title)
    expect(titles).toContain('First survivor')
    expect(titles).toContain('Second survivor')

    await app2.close()
  } finally {
    fs.rmSync(userDataDir, { recursive: true, force: true })
  }
})
