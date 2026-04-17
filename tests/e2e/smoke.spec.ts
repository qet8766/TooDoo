import { test, expect, dismissSignIn } from './fixtures'

test('overlay window renders', async ({ overlay }) => {
  await expect(overlay.locator('[data-testid="overlay"]')).toBeVisible()
})

test('overlay shows topbar', async ({ overlay }) => {
  await expect(overlay.locator('[data-testid="topbar"]')).toBeVisible()
})

test('sign-in modal can be skipped', async ({ overlay }) => {
  await expect(overlay.locator('[data-testid="signin-modal"]')).toBeVisible()
  await dismissSignIn(overlay)
  await expect(overlay.locator('[data-testid="signin-modal"]')).toBeHidden()
})
