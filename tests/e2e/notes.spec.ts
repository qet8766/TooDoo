import { test, expect, dismissSignIn, seedNotes, openNoteEditor } from './fixtures'

test.beforeEach(async ({ overlay }) => {
  await dismissSignIn(overlay)
  await overlay.evaluate(() => {
    window.location.hash = '/notetank'
  })
  await expect(overlay.locator('[data-testid="notetank"]')).toBeVisible()
})

test('create note via "+ New" opens editor and saves to notetank list', async ({ app, overlay }) => {
  const pagePromise = app.waitForEvent('window')
  await overlay.locator('[data-testid="btn-new-note"]').click()
  const editor = await pagePromise
  await editor.waitForLoadState('domcontentloaded')
  await editor.waitForSelector('[data-testid="note-editor"]')

  await editor.locator('[data-testid="ne-title"]').fill('Grocery list')
  await editor.locator('[data-testid="ne-content"]').fill('Milk, eggs, bread')
  await editor.locator('[data-testid="ne-save"]').click()

  await editor.waitForEvent('close', { timeout: 5_000 })

  await expect(overlay.getByText('Grocery list')).toBeVisible()
})

test('edit existing note updates its content', async ({ app, overlay }) => {
  const [id] = await seedNotes(overlay, [{ title: 'Meeting', content: 'old content' }])

  const editor = await openNoteEditor(app, overlay, id)
  await expect(editor.locator('[data-testid="ne-title"]')).toHaveValue('Meeting')
  await editor.locator('[data-testid="ne-content"]').fill('new content after edit')
  await editor.locator('[data-testid="ne-save"]').click()

  await editor.waitForEvent('close', { timeout: 5_000 })

  const card = overlay.locator(`[data-testid="note-${id}"]`)
  await card.locator('.note-title-area').click()
  await expect(card.locator('.note-content-expanded')).toContainText('new content after edit')
})

test('delete note requires two clicks', async ({ overlay }) => {
  const [id] = await seedNotes(overlay, [{ title: 'Trash me', content: 'bye' }])

  const card = overlay.locator(`[data-testid="note-${id}"]`)
  const deleteBtn = overlay.locator(`[data-testid="note-delete-${id}"]`)

  await expect(card).toBeVisible()
  await deleteBtn.click()
  await expect(deleteBtn).toHaveClass(/armed/)
  await deleteBtn.click()
  await expect(card).toBeHidden()
})
