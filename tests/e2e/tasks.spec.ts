import { test, expect, dismissSignIn, seedTasks, openQuickAdd } from './fixtures'

test.beforeEach(async ({ overlay }) => {
  await dismissSignIn(overlay)
})

test('quick-add round-trip creates a task in the overlay', async ({ app, overlay }) => {
  const quickAdd = await openQuickAdd(app, overlay, 'hot')

  await quickAdd.locator('[data-testid="qa-title"]').fill('Write the report')
  await quickAdd.locator('[data-testid="qa-submit"]').click()

  await quickAdd.waitForEvent('close', { timeout: 5_000 })

  const hotSection = overlay.locator('[data-testid="category-hot"]')
  await expect(hotSection.getByText('Write the report')).toBeVisible()
})

test('inline-edit updates a task title', async ({ overlay }) => {
  const [id] = await seedTasks(overlay, [{ title: 'Original', category: 'warm' }])

  const card = overlay.locator(`[data-testid="task-${id}"]`)
  await card.locator('[data-task-title]').dblclick()

  const editInput = card.locator('input.edit-input').first()
  await editInput.fill('Edited title')
  await card.getByRole('button', { name: 'Save' }).click()

  await expect(card.locator('[data-task-title]')).toContainText('Edited title')

  const tasks = await overlay.evaluate(() => window.toodoo.tasks.list())
  expect(tasks.find((t) => t.id === id)?.title).toBe('Edited title')
})

test('delete requires two clicks (arm + confirm)', async ({ overlay }) => {
  const [id] = await seedTasks(overlay, [{ title: 'To delete', category: 'cool' }])

  const card = overlay.locator(`[data-testid="task-${id}"]`)
  const deleteBtn = overlay.locator(`[data-testid="task-delete-${id}"]`)

  await expect(card).toBeVisible()
  await deleteBtn.click()
  await expect(deleteBtn).toHaveClass(/armed/)
  await expect(card).toBeVisible()

  await deleteBtn.click()
  await expect(card).toBeHidden()
})

test('scorching mode hides non-scorching heat categories', async ({ overlay }) => {
  await seedTasks(overlay, [
    { title: 'URGENT', category: 'scorching' },
    { title: 'less urgent', category: 'warm' },
  ])

  await expect(overlay.locator('[data-testid="overlay"]')).toHaveClass(/scorching-mode/)
  await expect(overlay.locator('[data-testid="category-scorching"]')).toBeVisible()
  await expect(overlay.locator('[data-testid="category-warm"]')).toBeHidden()
})
