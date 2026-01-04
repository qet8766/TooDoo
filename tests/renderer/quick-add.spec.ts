/**
 * Quick-Add Popup Component Tests
 *
 * Tests for the quick-add popup functionality including form validation,
 * submission, and category handling.
 */

import { test, expect } from '@playwright/test'
import { injectToodooMock, type Task } from '../mocks'

test.describe('Quick-Add Popup', () => {
  test.describe('UI Rendering', () => {
    test('displays quick-add shell', async ({ page }) => {
      await injectToodooMock(page, [])
      await page.goto('/#/quick-add?category=hot')
      await page.waitForLoadState('domcontentloaded')

      const shell = page.locator('.quick-add-shell')
      await expect(shell).toBeVisible()
    })

    test('displays correct header for category', async ({ page }) => {
      await injectToodooMock(page, [])
      await page.goto('/#/quick-add?category=hot')
      await page.waitForLoadState('domcontentloaded')

      await expect(page.locator('h3:has-text("Hot task")')).toBeVisible()
    })

    test('displays title input field', async ({ page }) => {
      await injectToodooMock(page, [])
      await page.goto('/#/quick-add?category=warm')
      await page.waitForLoadState('domcontentloaded')

      const titleInput = page.locator('input[placeholder="Title"]')
      await expect(titleInput).toBeVisible()
      await expect(titleInput).toBeFocused()
    })

    test('displays description textarea', async ({ page }) => {
      await injectToodooMock(page, [])
      await page.goto('/#/quick-add?category=cool')
      await page.waitForLoadState('domcontentloaded')

      const descArea = page.locator('textarea[placeholder*="Description"]')
      await expect(descArea).toBeVisible()
    })

    test('displays submit button with category name', async ({ page }) => {
      await injectToodooMock(page, [])
      await page.goto('/#/quick-add?category=project')
      await page.waitForLoadState('domcontentloaded')

      await expect(page.locator('button.button:has-text("Add Project")')).toBeVisible()
    })

    test('displays close button', async ({ page }) => {
      await injectToodooMock(page, [])
      await page.goto('/#/quick-add?category=hot')
      await page.waitForLoadState('domcontentloaded')

      await expect(page.locator('button:has-text("Close")')).toBeVisible()
    })
  })

  test.describe('Category Handling', () => {
    test.each([
      ['scorching', 'Scorching'],
      ['hot', 'Hot'],
      ['warm', 'Warm'],
      ['cool', 'Cool'],
      ['project', 'Project'],
    ])('displays correct header for %s category', async ({ page }, category, expectedTitle) => {
      await injectToodooMock(page, [])
      await page.goto(`/#/quick-add?category=${category}`)
      await page.waitForLoadState('domcontentloaded')

      await expect(page.locator(`h3:has-text("${expectedTitle} task")`)).toBeVisible()
    })

    test('defaults to hot category when none specified', async ({ page }) => {
      await injectToodooMock(page, [])
      await page.goto('/#/quick-add')
      await page.waitForLoadState('domcontentloaded')

      await expect(page.locator('h3:has-text("Hot task")')).toBeVisible()
    })

    test('defaults to hot category for invalid category', async ({ page }) => {
      await injectToodooMock(page, [])
      await page.goto('/#/quick-add?category=invalid')
      await page.waitForLoadState('domcontentloaded')

      await expect(page.locator('h3:has-text("Hot task")')).toBeVisible()
    })
  })

  test.describe('Form Validation', () => {
    test('shows error for empty title', async ({ page }) => {
      await injectToodooMock(page, [])
      await page.goto('/#/quick-add?category=hot')
      await page.waitForLoadState('domcontentloaded')

      await page.click('button.button')

      await expect(page.locator('.status-text:has-text("Title is required")')).toBeVisible()
    })

    test('shows error for whitespace-only title', async ({ page }) => {
      await injectToodooMock(page, [])
      await page.goto('/#/quick-add?category=hot')
      await page.waitForLoadState('domcontentloaded')

      await page.fill('input[placeholder="Title"]', '   ')
      await page.click('button.button')

      await expect(page.locator('.status-text:has-text("Title is required")')).toBeVisible()
    })

    test('shows error for title exceeding 500 characters', async ({ page }) => {
      await injectToodooMock(page, [])
      await page.goto('/#/quick-add?category=hot')
      await page.waitForLoadState('domcontentloaded')

      await page.fill('input[placeholder="Title"]', 'X'.repeat(501))
      await page.click('button.button')

      await expect(page.locator('.status-text:has-text("Title too long")')).toBeVisible()
    })

    test('shows error for description exceeding 5000 characters', async ({ page }) => {
      await injectToodooMock(page, [])
      await page.goto('/#/quick-add?category=hot')
      await page.waitForLoadState('domcontentloaded')

      await page.fill('input[placeholder="Title"]', 'Test Task')
      await page.fill('textarea', 'Y'.repeat(5001))
      await page.click('button.button')

      await expect(page.locator('.status-text:has-text("Description too long")')).toBeVisible()
    })
  })

  test.describe('Form Submission', () => {
    test('shows Adding... status during submission', async ({ page }) => {
      await injectToodooMock(page, [])
      await page.goto('/#/quick-add?category=hot')
      await page.waitForLoadState('domcontentloaded')

      await page.fill('input[placeholder="Title"]', 'New Task')
      await page.click('button.button')

      // Status should show "Adding..." briefly
      await expect(page.locator('.status-text')).toHaveText(/Adding|Added/)
    })

    test('shows Added! status on success', async ({ page }) => {
      await injectToodooMock(page, [])
      await page.goto('/#/quick-add?category=hot')
      await page.waitForLoadState('domcontentloaded')

      await page.fill('input[placeholder="Title"]', 'New Task')
      await page.click('button.button')

      await expect(page.locator('.status-text:has-text("Added!")')).toBeVisible()
    })

    test('submits task with title only', async ({ page }) => {
      await injectToodooMock(page, [])
      await page.goto('/#/quick-add?category=warm')
      await page.waitForLoadState('domcontentloaded')

      await page.fill('input[placeholder="Title"]', 'Task Without Description')
      await page.click('button.button')

      await expect(page.locator('.status-text:has-text("Added!")')).toBeVisible()
    })

    test('submits task with title and description', async ({ page }) => {
      await injectToodooMock(page, [])
      await page.goto('/#/quick-add?category=cool')
      await page.waitForLoadState('domcontentloaded')

      await page.fill('input[placeholder="Title"]', 'Task With Description')
      await page.fill('textarea', 'This is the description')
      await page.click('button.button')

      await expect(page.locator('.status-text:has-text("Added!")')).toBeVisible()
    })
  })

  test.describe('Keyboard Navigation', () => {
    test('Enter key submits form from title field', async ({ page }) => {
      await injectToodooMock(page, [])
      await page.goto('/#/quick-add?category=hot')
      await page.waitForLoadState('domcontentloaded')

      await page.fill('input[placeholder="Title"]', 'Quick Task')
      await page.press('input[placeholder="Title"]', 'Enter')

      await expect(page.locator('.status-text')).toHaveText(/Adding|Added/)
    })

    test('Enter key submits form from description field', async ({ page }) => {
      await injectToodooMock(page, [])
      await page.goto('/#/quick-add?category=hot')
      await page.waitForLoadState('domcontentloaded')

      await page.fill('input[placeholder="Title"]', 'Task With Enter')
      await page.click('textarea')
      await page.fill('textarea', 'Description')
      await page.press('textarea', 'Enter')

      await expect(page.locator('.status-text')).toHaveText(/Adding|Added/)
    })

    test('Shift+Enter adds newline in description', async ({ page }) => {
      await injectToodooMock(page, [])
      await page.goto('/#/quick-add?category=hot')
      await page.waitForLoadState('domcontentloaded')

      await page.fill('input[placeholder="Title"]', 'Task')
      await page.click('textarea')
      await page.type('textarea', 'Line 1')
      await page.press('textarea', 'Shift+Enter')
      await page.type('textarea', 'Line 2')

      const textareaValue = await page.locator('textarea').inputValue()
      expect(textareaValue).toContain('Line 1')
      expect(textareaValue).toContain('Line 2')
    })

    test('Tab moves focus between fields', async ({ page }) => {
      await injectToodooMock(page, [])
      await page.goto('/#/quick-add?category=hot')
      await page.waitForLoadState('domcontentloaded')

      const titleInput = page.locator('input[placeholder="Title"]')
      const descArea = page.locator('textarea')

      await expect(titleInput).toBeFocused()
      await page.keyboard.press('Tab')
      await expect(descArea).toBeFocused()
    })
  })

  test.describe('Special Characters', () => {
    test('handles special characters in title', async ({ page }) => {
      await injectToodooMock(page, [])
      await page.goto('/#/quick-add?category=hot')
      await page.waitForLoadState('domcontentloaded')

      await page.fill('input[placeholder="Title"]', '<script>alert("test")</script>')
      await page.click('button.button')

      await expect(page.locator('.status-text:has-text("Added!")')).toBeVisible()
    })

    test('handles unicode characters in title', async ({ page }) => {
      await injectToodooMock(page, [])
      await page.goto('/#/quick-add?category=hot')
      await page.waitForLoadState('domcontentloaded')

      await page.fill('input[placeholder="Title"]', 'Task with emoji: test and unicode: cafe')
      await page.click('button.button')

      await expect(page.locator('.status-text:has-text("Added!")')).toBeVisible()
    })

    test('handles quotation marks in description', async ({ page }) => {
      await injectToodooMock(page, [])
      await page.goto('/#/quick-add?category=hot')
      await page.waitForLoadState('domcontentloaded')

      await page.fill('input[placeholder="Title"]', 'Quote Test')
      await page.fill('textarea', 'He said "hello" and she said \'hi\'')
      await page.click('button.button')

      await expect(page.locator('.status-text:has-text("Added!")')).toBeVisible()
    })
  })
})
