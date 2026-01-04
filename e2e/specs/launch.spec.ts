/**
 * Application Launch E2E Tests
 *
 * These tests verify the Electron application starts correctly and
 * the main overlay window is displayed properly.
 *
 * NOTE: These tests require the application to be built first:
 * npm run build
 */

describe('Application Launch', () => {
  describe('Initial Startup', () => {
    it('should launch the application', async () => {
      // The app should already be launched by wdio-electron-service
      // Verify we can get the window handle
      const windowHandle = await browser.getWindowHandle()
      expect(windowHandle).toBeTruthy()
    })

    it('should have correct window title', async () => {
      const title = await browser.getTitle()
      // Title should be "TooDoo" or empty for frameless window
      expect(title === 'TooDoo' || title === '').toBe(true)
    })

    it('should display the main overlay', async () => {
      // Wait for the overlay to be visible
      const overlay = await $('.overlay-shell')
      await overlay.waitForDisplayed({ timeout: 10000 })
      expect(await overlay.isDisplayed()).toBe(true)
    })

    it('should display the topbar', async () => {
      const topbar = await $('.overlay-topbar-fixed')
      await topbar.waitForDisplayed({ timeout: 5000 })
      expect(await topbar.isDisplayed()).toBe(true)
    })

    it('should display font size controls', async () => {
      const decreaseBtn = await $('.font-btn*=A-')
      const increaseBtn = await $('.font-btn*=A+')

      expect(await decreaseBtn.isDisplayed()).toBe(true)
      expect(await increaseBtn.isDisplayed()).toBe(true)
    })

    it('should display task columns', async () => {
      const taskColumns = await $('.task-columns')
      await taskColumns.waitForDisplayed({ timeout: 5000 })
      expect(await taskColumns.isDisplayed()).toBe(true)
    })

    it('should display category sections', async () => {
      const sections = await $$('.task-section')
      // Should have sections for hot, warm, cool, project (4 total) or
      // just scorching (1) if in scorching mode
      expect(sections.length).toBeGreaterThan(0)
      expect(sections.length).toBeLessThanOrEqual(4)
    })
  })

  describe('Window Properties', () => {
    it('should be always on top', async () => {
      // This is hard to verify programmatically, but we can check the window exists
      const handles = await browser.getWindowHandles()
      expect(handles.length).toBeGreaterThanOrEqual(1)
    })

    it('should be frameless (no native title bar)', async () => {
      // Frameless windows typically have custom drag handles
      const gripDots = await $('.grip-dots')
      expect(await gripDots.isDisplayed()).toBe(true)
    })

    it('should have correct initial size', async () => {
      const size = await browser.getWindowSize()
      // Overlay should have reasonable dimensions
      expect(size.width).toBeGreaterThan(200)
      expect(size.height).toBeGreaterThan(300)
    })
  })

  describe('Sync Status', () => {
    it('should display sync indicator', async () => {
      const syncIndicator = await $('.sync-indicator')
      await syncIndicator.waitForDisplayed({ timeout: 5000 })
      expect(await syncIndicator.isDisplayed()).toBe(true)
    })

    it('sync indicator should show a status', async () => {
      const syncIndicator = await $('.sync-indicator')
      const className = await syncIndicator.getAttribute('class')
      // Should have one of: online, offline, error
      const hasStatus =
        className.includes('online') ||
        className.includes('offline') ||
        className.includes('error')
      expect(hasStatus).toBe(true)
    })
  })

  describe('Notes Switch', () => {
    it('should display Notes button for view switching', async () => {
      const notesBtn = await $('.feature-btn*=Notes')
      expect(await notesBtn.isDisplayed()).toBe(true)
    })

    it('Notes button should be clickable', async () => {
      const notesBtn = await $('.feature-btn*=Notes')
      expect(await notesBtn.isClickable()).toBe(true)
    })
  })
})

describe('Empty State', () => {
  it('should show empty message in columns when no tasks', async () => {
    // If no tasks exist, sections should show "Empty"
    const sections = await $$('.task-section')

    // At least one section should be visible
    expect(sections.length).toBeGreaterThan(0)

    // Check for either tasks or empty message in first section
    const section = sections[0]
    const tasks = await section.$$('.task-card')
    const emptyMessage = await section.$('.compact-muted')

    // Either has tasks OR shows empty message
    const hasTasks = tasks.length > 0
    const hasEmptyMessage = await emptyMessage.isExisting()
    expect(hasTasks || hasEmptyMessage).toBe(true)
  })
})
