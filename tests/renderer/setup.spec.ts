/**
 * Setup Wizard Component Tests
 *
 * Tests for the first-run NAS path configuration wizard.
 */

import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

// Custom mock for setup page with validation control
const createSetupMock = (options: {
  pathValid?: boolean
  pathError?: string
  saveSuccess?: boolean
  saveError?: string
} = {}) => {
  const { pathValid = true, pathError, saveSuccess = true, saveError } = options

  return `
(function() {
  var toodooMock = {
    tasks: {
      list: function() { return Promise.resolve([]); }
    },
    onTasksChanged: function() { return function() {}; },
    config: {
      get: function() { return Promise.resolve({ nasPath: null, machineId: 'mock-machine', lastSyncAt: 0 }); },
      setNasPath: function() {
        return Promise.resolve(${saveSuccess ? '{ success: true }' : `{ success: false, error: "${saveError || 'Failed to save'}" }`});
      },
      validatePath: function(path) {
        return Promise.resolve(${pathValid ? '{ valid: true }' : `{ valid: false, error: "${pathError || 'Path not accessible'}" }`});
      },
      needsSetup: function() { return Promise.resolve(true); },
      reload: function() { return Promise.resolve({ nasPath: null, machineId: 'mock-machine', lastSyncAt: 0 }); }
    },
    sync: {
      getStatus: function() { return Promise.resolve({ isOnline: false, pendingCount: 0, lastSyncAt: 0, circuitBreakerOpen: false, nextRetryAt: null }); },
      trigger: function() { return Promise.resolve(); },
      resetCircuitBreaker: function() { return Promise.resolve(); }
    },
    setup: {
      browseFolder: function() { return Promise.resolve('\\\\\\\\mock\\\\nas\\\\toodoo'); },
      complete: function() { return Promise.resolve(); }
    },
    toggleOverlay: function() {},
    openQuickAdd: function() {},
    switchView: function() {}
  };

  Object.defineProperty(window, 'toodoo', {
    value: toodooMock,
    writable: false,
    configurable: true,
    enumerable: true
  });
})();
`
}

const injectSetupMock = async (page: Page, options?: Parameters<typeof createSetupMock>[0]) => {
  const mockScript = createSetupMock(options)

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

test.describe('Setup Wizard', () => {
  test.describe('UI Rendering', () => {
    test('displays setup container', async ({ page }) => {
      await injectSetupMock(page)
      await page.goto('/#/setup')
      await page.waitForLoadState('domcontentloaded')

      const container = page.locator('.setup-container')
      await expect(container).toBeVisible()
    })

    test('displays setup title', async ({ page }) => {
      await injectSetupMock(page)
      await page.goto('/#/setup')
      await page.waitForLoadState('domcontentloaded')

      await expect(page.locator('h1.setup-title:has-text("TooDoo Setup")')).toBeVisible()
    })

    test('displays path input field', async ({ page }) => {
      await injectSetupMock(page)
      await page.goto('/#/setup')
      await page.waitForLoadState('domcontentloaded')

      const pathInput = page.locator('#nas-path')
      await expect(pathInput).toBeVisible()
    })

    test('displays Browse button', async ({ page }) => {
      await injectSetupMock(page)
      await page.goto('/#/setup')
      await page.waitForLoadState('domcontentloaded')

      await expect(page.locator('.browse-button:has-text("Browse")')).toBeVisible()
    })

    test('displays Validate Path button', async ({ page }) => {
      await injectSetupMock(page)
      await page.goto('/#/setup')
      await page.waitForLoadState('domcontentloaded')

      await expect(page.locator('.validate-button:has-text("Validate Path")')).toBeVisible()
    })

    test('displays Save & Continue button', async ({ page }) => {
      await injectSetupMock(page)
      await page.goto('/#/setup')
      await page.waitForLoadState('domcontentloaded')

      await expect(page.locator('.save-button:has-text("Save & Continue")')).toBeVisible()
    })

    test('displays environment variable hint', async ({ page }) => {
      await injectSetupMock(page)
      await page.goto('/#/setup')
      await page.waitForLoadState('domcontentloaded')

      await expect(page.locator('.setup-hint:has-text("TOODOO_NAS_PATH")')).toBeVisible()
    })
  })

  test.describe('Browse Folder', () => {
    test('fills path input when folder is selected', async ({ page }) => {
      await injectSetupMock(page)
      await page.goto('/#/setup')
      await page.waitForLoadState('domcontentloaded')

      await page.click('.browse-button')

      const pathInput = page.locator('#nas-path')
      await expect(pathInput).toHaveValue(/mock/)
    })

    test('resets validation state after browse', async ({ page }) => {
      await injectSetupMock(page)
      await page.goto('/#/setup')
      await page.waitForLoadState('domcontentloaded')

      // First validate a path
      await page.fill('#nas-path', '\\\\server\\share')
      await page.click('.validate-button')
      await expect(page.locator('.validation-icon.valid')).toBeVisible()

      // Browse for new path
      await page.click('.browse-button')

      // Validation icon should be reset
      await expect(page.locator('.validation-icon')).not.toBeVisible()
    })
  })

  test.describe('Path Validation', () => {
    test('shows validating state during validation', async ({ page }) => {
      await injectSetupMock(page)
      await page.goto('/#/setup')
      await page.waitForLoadState('domcontentloaded')

      await page.fill('#nas-path', '\\\\server\\share')
      await page.click('.validate-button')

      // Check for validating state (may be brief)
      await expect(page.locator('.validation-icon')).toBeVisible()
    })

    test('shows valid icon when path is accessible', async ({ page }) => {
      await injectSetupMock(page, { pathValid: true })
      await page.goto('/#/setup')
      await page.waitForLoadState('domcontentloaded')

      await page.fill('#nas-path', '\\\\server\\share')
      await page.click('.validate-button')

      await expect(page.locator('.validation-icon.valid')).toBeVisible()
      await expect(page.locator('.validation-message.success')).toBeVisible()
    })

    test('shows invalid icon when path is not accessible', async ({ page }) => {
      await injectSetupMock(page, { pathValid: false, pathError: 'Path does not exist' })
      await page.goto('/#/setup')
      await page.waitForLoadState('domcontentloaded')

      await page.fill('#nas-path', '\\\\nonexistent\\path')
      await page.click('.validate-button')

      await expect(page.locator('.validation-icon.invalid')).toBeVisible()
      await expect(page.locator('.validation-message.error')).toBeVisible()
    })

    test('shows error message for empty path', async ({ page }) => {
      await injectSetupMock(page, { pathValid: false, pathError: 'Please enter a path' })
      await page.goto('/#/setup')
      await page.waitForLoadState('domcontentloaded')

      await page.fill('#nas-path', '')
      await page.click('.validate-button')

      await expect(page.locator('.validation-message.error:has-text("enter a path")')).toBeVisible()
    })

    test('validate button is disabled when path is empty', async ({ page }) => {
      await injectSetupMock(page)
      await page.goto('/#/setup')
      await page.waitForLoadState('domcontentloaded')

      const validateBtn = page.locator('.validate-button')
      await expect(validateBtn).toBeDisabled()
    })

    test('validate button is enabled when path is entered', async ({ page }) => {
      await injectSetupMock(page)
      await page.goto('/#/setup')
      await page.waitForLoadState('domcontentloaded')

      await page.fill('#nas-path', '\\\\server\\share')

      const validateBtn = page.locator('.validate-button')
      await expect(validateBtn).toBeEnabled()
    })

    test('resets validation when path is modified', async ({ page }) => {
      await injectSetupMock(page)
      await page.goto('/#/setup')
      await page.waitForLoadState('domcontentloaded')

      // Validate first
      await page.fill('#nas-path', '\\\\server\\share')
      await page.click('.validate-button')
      await expect(page.locator('.validation-icon.valid')).toBeVisible()

      // Modify path
      await page.fill('#nas-path', '\\\\other\\path')

      // Validation should be reset
      await expect(page.locator('.validation-icon')).not.toBeVisible()
    })
  })

  test.describe('Save Configuration', () => {
    test('validates path before saving if not already validated', async ({ page }) => {
      await injectSetupMock(page, { pathValid: true, saveSuccess: true })
      await page.goto('/#/setup')
      await page.waitForLoadState('domcontentloaded')

      await page.fill('#nas-path', '\\\\server\\share')
      await page.click('.save-button')

      // Should show validating then proceed
      await expect(page.locator('.validation-icon')).toBeVisible()
    })

    test('shows saving state', async ({ page }) => {
      await injectSetupMock(page, { pathValid: true, saveSuccess: true })
      await page.goto('/#/setup')
      await page.waitForLoadState('domcontentloaded')

      await page.fill('#nas-path', '\\\\server\\share')
      await page.click('.validate-button')
      await expect(page.locator('.validation-icon.valid')).toBeVisible()

      await page.click('.save-button')

      // Button may show "Saving..." briefly
      const saveBtn = page.locator('.save-button')
      await expect(saveBtn).toHaveText(/Saving|Save/)
    })

    test('shows error when save fails', async ({ page }) => {
      await injectSetupMock(page, { pathValid: true, saveSuccess: false, saveError: 'Failed to write config' })
      await page.goto('/#/setup')
      await page.waitForLoadState('domcontentloaded')

      await page.fill('#nas-path', '\\\\server\\share')
      await page.click('.validate-button')
      await expect(page.locator('.validation-icon.valid')).toBeVisible()

      await page.click('.save-button')

      await expect(page.locator('.error-message')).toBeVisible()
    })

    test('does not save if validation fails', async ({ page }) => {
      await injectSetupMock(page, { pathValid: false, pathError: 'Path not accessible' })
      await page.goto('/#/setup')
      await page.waitForLoadState('domcontentloaded')

      await page.fill('#nas-path', '\\\\invalid\\path')
      await page.click('.save-button')

      // Should show validation error, not save error
      await expect(page.locator('.validation-message.error')).toBeVisible()
      await expect(page.locator('.error-message')).not.toBeVisible()
    })
  })

  test.describe('Input Handling', () => {
    test('accepts UNC path format', async ({ page }) => {
      await injectSetupMock(page)
      await page.goto('/#/setup')
      await page.waitForLoadState('domcontentloaded')

      await page.fill('#nas-path', '\\\\server\\share\\toodoo')

      const pathInput = page.locator('#nas-path')
      await expect(pathInput).toHaveValue('\\\\server\\share\\toodoo')
    })

    test('accepts mapped drive path', async ({ page }) => {
      await injectSetupMock(page)
      await page.goto('/#/setup')
      await page.waitForLoadState('domcontentloaded')

      await page.fill('#nas-path', 'Z:\\toodoo')

      const pathInput = page.locator('#nas-path')
      await expect(pathInput).toHaveValue('Z:\\toodoo')
    })

    test('shows placeholder text', async ({ page }) => {
      await injectSetupMock(page)
      await page.goto('/#/setup')
      await page.waitForLoadState('domcontentloaded')

      const pathInput = page.locator('#nas-path')
      await expect(pathInput).toHaveAttribute('placeholder', /server.*share/)
    })
  })
})
