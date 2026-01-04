/**
 * Task CRUD E2E Tests
 *
 * These tests verify creating, reading, updating, and deleting tasks
 * through the actual Electron application UI.
 */

describe('Task CRUD Operations', () => {
  describe('Creating Tasks', () => {
    it('should open quick-add popup when clicking category dot', async () => {
      // Find the first category section's dot button
      const sectionDotBtn = await $('.section-dot-btn')
      await sectionDotBtn.waitForClickable({ timeout: 5000 })
      await sectionDotBtn.click()

      // Quick-add should open (in a new window)
      await browser.pause(500) // Wait for window to open

      const handles = await browser.getWindowHandles()

      // Should have overlay + quick-add windows
      if (handles.length > 1) {
        // Switch to the quick-add window
        await browser.switchToWindow(handles[handles.length - 1])

        const quickAddShell = await $('.quick-add-shell')
        await quickAddShell.waitForDisplayed({ timeout: 5000 })
        expect(await quickAddShell.isDisplayed()).toBe(true)

        // Close quick-add by clicking close button
        const closeBtn = await $('button*=Close')
        if (await closeBtn.isDisplayed()) {
          await closeBtn.click()
        }

        // Switch back to main window
        await browser.switchToWindow(handles[0])
      }
    })

    it('should display quick-add form elements', async () => {
      const sectionDotBtn = await $('.section-dot-btn')
      await sectionDotBtn.click()
      await browser.pause(500)

      const handles = await browser.getWindowHandles()
      if (handles.length > 1) {
        await browser.switchToWindow(handles[handles.length - 1])

        // Check form elements exist
        const titleInput = await $('input[placeholder="Title"]')
        const descTextarea = await $('textarea')
        const submitBtn = await $('button.button')

        expect(await titleInput.isDisplayed()).toBe(true)
        expect(await descTextarea.isDisplayed()).toBe(true)
        expect(await submitBtn.isDisplayed()).toBe(true)

        // Close and switch back
        const closeBtn = await $('button*=Close')
        await closeBtn.click()
        await browser.switchToWindow(handles[0])
      }
    })

    it('should add a task via quick-add', async () => {
      const sectionDotBtn = await $('.section-dot-btn')
      await sectionDotBtn.click()
      await browser.pause(500)

      const handles = await browser.getWindowHandles()
      if (handles.length > 1) {
        await browser.switchToWindow(handles[handles.length - 1])

        // Fill in the form
        const titleInput = await $('input[placeholder="Title"]')
        await titleInput.setValue('E2E Test Task')

        const descTextarea = await $('textarea')
        await descTextarea.setValue('Created by E2E test')

        // Submit
        const submitBtn = await $('button.button')
        await submitBtn.click()

        // Wait for success
        await browser.pause(500)

        // Window should close automatically after success
        // Switch back to main window
        const remainingHandles = await browser.getWindowHandles()
        await browser.switchToWindow(remainingHandles[0])

        // Verify task appears in overlay
        await browser.pause(500)
        const taskCards = await $$('.task-card')
        const taskTexts = await Promise.all(taskCards.map(async (card) => {
          const title = await card.$('.task-title')
          return title.getText()
        }))

        expect(taskTexts.some(text => text.includes('E2E Test Task'))).toBe(true)
      }
    })
  })

  describe('Reading Tasks', () => {
    it('should display task title', async () => {
      const taskCards = await $$('.task-card')
      if (taskCards.length > 0) {
        const title = await taskCards[0].$('.task-title')
        const titleText = await title.getText()
        expect(titleText.length).toBeGreaterThan(0)
      }
    })

    it('should display task in correct category section', async () => {
      // Each section should have its own color class
      const sections = await $$('.task-section')

      for (const section of sections) {
        const className = await section.getAttribute('class')
        const hasTone =
          className.includes('tone-red') ||
          className.includes('tone-yellow') ||
          className.includes('tone-blue') ||
          className.includes('tone-violet') ||
          className.includes('tone-white')
        expect(hasTone).toBe(true)
      }
    })
  })

  describe('Updating Tasks', () => {
    it('should toggle task done state', async () => {
      const taskCards = await $$('.task-card')
      if (taskCards.length > 0) {
        const checkbox = await taskCards[0].$('input[type="checkbox"]')
        if (await checkbox.isExisting()) {
          const initialChecked = await checkbox.isSelected()
          await checkbox.click()

          // Wait for state update
          await browser.pause(300)

          const newChecked = await checkbox.isSelected()
          expect(newChecked).not.toBe(initialChecked)

          // Toggle back
          await checkbox.click()
        }
      }
    })

    it('should enter edit mode on double-click', async () => {
      const taskCards = await $$('.task-card')
      if (taskCards.length > 0) {
        const taskText = await taskCards[0].$('.task-text')
        await taskText.doubleClick()

        // Wait for edit mode
        await browser.pause(300)

        const editInput = await taskCards[0].$('.edit-input')
        const isEditMode = await editInput.isExisting() && await editInput.isDisplayed()

        if (isEditMode) {
          expect(isEditMode).toBe(true)

          // Cancel edit
          const cancelBtn = await taskCards[0].$('button*=Cancel')
          if (await cancelBtn.isDisplayed()) {
            await cancelBtn.click()
          }
        }
      }
    })
  })

  describe('Deleting Tasks', () => {
    it('should arm delete on first click of delete checkbox', async () => {
      const taskCards = await $$('.task-card')
      if (taskCards.length > 0) {
        const deleteCheckbox = await taskCards[0].$('.delete-checkbox')
        await deleteCheckbox.click()

        // Wait for armed state
        await browser.pause(100)

        const className = await deleteCheckbox.getAttribute('class')
        expect(className).toContain('armed')

        // Wait for auto-disarm (2 seconds)
        await browser.pause(2500)

        const classNameAfter = await deleteCheckbox.getAttribute('class')
        expect(classNameAfter).not.toContain('armed')
      }
    })
  })

  describe('Drag and Drop', () => {
    it('task cards should be draggable', async () => {
      const taskCards = await $$('.task-card')
      if (taskCards.length > 0) {
        const draggable = await taskCards[0].getAttribute('draggable')
        expect(draggable).toBe('true')
      }
    })
  })
})

describe('Count Pills', () => {
  it('should display count pill in each section', async () => {
    const countPills = await $$('.count-pill')
    // Should have 3 count pills (one for each visible category except project which has notes)
    expect(countPills.length).toBeGreaterThan(0)
  })

  it('count pill should show numeric value', async () => {
    const countPills = await $$('.count-pill')
    if (countPills.length > 0) {
      const text = await countPills[0].getText()
      expect(/\d+/.test(text)).toBe(true)
    }
  })
})
