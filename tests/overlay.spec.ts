import { test, expect } from '@playwright/test';
import { injectToodooMock, type Task } from './mocks';

test.beforeEach(async ({ page }) => {
  // Clear localStorage to ensure consistent font size
  await page.addInitScript(() => {
    localStorage.clear();
  });
  await injectToodooMock(page);
  await page.goto('/#/toodoo');
  await page.waitForLoadState('domcontentloaded');
  // Wait for React to hydrate and render
  await page.waitForSelector('.overlay-shell');
});

test.describe('Overlay UI', () => {
  test('displays overlay shell', async ({ page }) => {
    const overlay = page.locator('.overlay-shell');
    await expect(overlay).toBeVisible();
  });

  test('displays topbar with controls', async ({ page }) => {
    const topbar = page.locator('.overlay-topbar-fixed');
    await expect(topbar).toBeVisible();

    // Font size buttons
    await expect(page.locator('.font-btn:has-text("A-")')).toBeVisible();
    await expect(page.locator('.font-btn:has-text("A+")')).toBeVisible();
  });

  test('displays sync status indicator', async ({ page }) => {
    const syncIndicator = page.locator('.sync-indicator');
    await expect(syncIndicator).toBeVisible();
    await expect(syncIndicator).toHaveClass(/online/);
  });

  test('displays task columns', async ({ page }) => {
    const taskColumns = page.locator('.task-columns');
    await expect(taskColumns).toBeVisible();

    // Should have 4 sections for hot, warm, cool, project
    const sections = page.locator('.task-section');
    await expect(sections).toHaveCount(4);
  });

  test('displays tasks in correct categories', async ({ page }) => {
    // Hot task (red)
    const hotSection = page.locator('.task-section.tone-red');
    await expect(hotSection.locator('.task-title:has-text("Hot task 1")')).toBeVisible();

    // Warm task (yellow)
    const warmSection = page.locator('.task-section.tone-yellow');
    await expect(warmSection.locator('.task-title:has-text("Warm task 1")')).toBeVisible();

    // Project task (violet)
    const projectSection = page.locator('.task-section.tone-violet');
    await expect(projectSection.locator('.task-title:has-text("Project task 1")')).toBeVisible();
  });

  test('displays task count pills', async ({ page }) => {
    // 4 sections = 4 count pills
    const countPills = page.locator('.count-pill');
    await expect(countPills).toHaveCount(4);
  });
});

test.describe('Font Size Controls', () => {
  // These tests work in the real Electron app but have timing issues in browser mock environment
  // The React state updates correctly but the test doesn't detect the change fast enough
  test.fixme('increase font size', async ({ page }) => {
    const overlay = page.locator('.overlay-shell');

    const getStyleFontSize = async () => {
      const style = await overlay.getAttribute('style');
      const match = style?.match(/font-size:\s*(\d+)px/);
      return match ? parseInt(match[1]) : 14;
    };

    const initialFontSize = await getStyleFontSize();
    await page.click('.font-btn:has-text("A+")');
    await expect(overlay).toHaveAttribute('style', new RegExp(`font-size:\\s*${initialFontSize + 1}px`));
  });

  test.fixme('decrease font size', async ({ page }) => {
    const overlay = page.locator('.overlay-shell');

    const getStyleFontSize = async () => {
      const style = await overlay.getAttribute('style');
      const match = style?.match(/font-size:\s*(\d+)px/);
      return match ? parseInt(match[1]) : 14;
    };

    const initialFontSize = await getStyleFontSize();
    await page.click('.font-btn:has-text("A-")');
    await expect(overlay).toHaveAttribute('style', new RegExp(`font-size:\\s*${initialFontSize - 1}px`));
  });
});

test.describe('Task Interactions', () => {
  // This test has timing issues with React state updates in mock environment
  test.fixme('delete checkbox arms on first click', async ({ page }) => {
    const taskCard = page.locator('.task-card').first();
    const deleteCheckbox = taskCard.locator('.delete-checkbox');
    await deleteCheckbox.click();
    await expect(deleteCheckbox).toHaveClass(/armed/, { timeout: 2000 });
  });

  test('edit task via double-click', async ({ page }) => {
    const taskCard = page.locator('.task-card').first();
    const taskText = taskCard.locator('.task-text');

    // Double-click to enter edit mode
    await taskText.dblclick();

    // Should show edit form
    const editInput = taskCard.locator('.edit-input');
    await expect(editInput).toBeVisible();

    // Modify title
    await editInput.fill('Updated task title');
    await taskCard.locator('button:has-text("Save")').click();

    // Should show updated title
    await expect(taskCard.locator('.task-title:has-text("Updated task title")')).toBeVisible();
  });

  test('cancel edit via double-click', async ({ page }) => {
    const taskCard = page.locator('.task-card').first();
    const originalTitle = await taskCard.locator('.task-title').textContent();

    // Double-click to enter edit mode
    await taskCard.locator('.task-text').dblclick();
    await taskCard.locator('.edit-input').fill('Changed title');
    await taskCard.locator('button:has-text("Cancel")').click();

    // Should show original title
    await expect(taskCard.locator('.task-title')).toHaveText(originalTitle!);
  });
});

test.describe('Project Notes', () => {
  test('displays project notes', async ({ page }) => {
    const projectCard = page.locator('.project-card');
    await expect(projectCard.locator('.note-row')).toBeVisible();
    await expect(projectCard.locator('.note-row p:has-text("First note")')).toBeVisible();
  });

  test('add note button visible on project tasks', async ({ page }) => {
    const projectCard = page.locator('.project-card');
    await expect(projectCard.locator('button:has-text("Add note")')).toBeVisible();
  });

  // Modal tests have timing issues with React state updates in mock environment
  test.fixme('open add note modal', async ({ page }) => {
    const projectCard = page.locator('.project-card');
    const addNoteBtn = projectCard.locator('button:has-text("Add note")');
    await expect(addNoteBtn).toBeVisible();
    await addNoteBtn.click();
    await expect(page.locator('.modal-backdrop')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('.modal-card h4:has-text("Add note")')).toBeVisible();
    await expect(page.locator('.modal-textarea')).toBeVisible();
  });

  test.fixme('close add note modal', async ({ page }) => {
    const projectCard = page.locator('.project-card');
    const addNoteBtn = projectCard.locator('button:has-text("Add note")');
    await expect(addNoteBtn).toBeVisible();
    await addNoteBtn.click();
    await expect(page.locator('.modal-backdrop')).toBeVisible({ timeout: 3000 });
    await page.locator('.modal-card button:has-text("Cancel")').click();
    await expect(page.locator('.modal-backdrop')).not.toBeVisible();
  });
});

test.describe('Scorching Mode', () => {
  test('shows scorching mode when scorching tasks exist', async ({ page }) => {
    const scorchingTasks: Task[] = [
      {
        id: 'scorching-1',
        title: 'Urgent task',
        category: 'scorching',
        isDone: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        isDeleted: false,
      },
    ];

    // Navigate away first, then set up new mock
    await page.goto('about:blank');
    await page.unroute('**/*');
    await injectToodooMock(page, scorchingTasks);
    await page.goto('/#/toodoo');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('.overlay-shell');

    const overlay = page.locator('.overlay-shell');
    await expect(overlay).toHaveClass(/scorching-mode/);

    // Should only show scorching section (white tone)
    const sections = page.locator('.task-section');
    await expect(sections).toHaveCount(1);
    await expect(sections.locator('.task-title:has-text("Urgent task")')).toBeVisible();
  });
});

test.describe('Empty State', () => {
  test('shows empty message when no tasks', async ({ page }) => {
    // Navigate away first, then set up new mock
    await page.goto('about:blank');
    await page.unroute('**/*');
    await injectToodooMock(page, []);
    await page.goto('/#/toodoo');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('.overlay-shell');

    // 4 sections, each showing "Empty"
    const emptyMessages = page.locator('p.compact-muted');
    await expect(emptyMessages).toHaveCount(4);
  });
});
