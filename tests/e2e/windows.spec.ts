import { test, expect, dismissSignIn } from './fixtures'

test.beforeEach(async ({ overlay }) => {
  await dismissSignIn(overlay)
})

test('calendar toggle grows and shrinks the overlay window', async ({ overlay }) => {
  const initialWidth = await overlay.evaluate(() => window.outerWidth)

  await overlay.locator('[data-testid="btn-calendar"]').click()
  await overlay.waitForFunction(
    (start) => window.outerWidth >= start + 200,
    initialWidth,
    { timeout: 3_000 },
  )

  await overlay.locator('[data-testid="btn-calendar"]').click()
  await overlay.waitForFunction(
    (start) => window.outerWidth <= start + 10,
    initialWidth,
    { timeout: 3_000 },
  )
})

test('hash navigation swaps between overlay and notetank', async ({ overlay }) => {
  await expect(overlay.locator('[data-testid="overlay"]')).toBeVisible()

  await overlay.evaluate(() => {
    window.location.hash = '/notetank'
  })
  await expect(overlay.locator('[data-testid="notetank"]')).toBeVisible()
  await expect(overlay.locator('[data-testid="overlay"]')).toBeHidden()

  await overlay.evaluate(() => {
    window.location.hash = '/toodoo'
  })
  await expect(overlay.locator('[data-testid="overlay"]')).toBeVisible()
  await expect(overlay.locator('[data-testid="notetank"]')).toBeHidden()
})
