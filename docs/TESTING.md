# TooDoo Testing Guide

This document describes the comprehensive E2E testing infrastructure for the TooDoo Electron application.

## Testing Architecture

TooDoo uses a **hybrid testing strategy** with three layers:

| Layer | Tool | Purpose |
|-------|------|---------|
| Unit Tests | Vitest | Main process logic (database, IPC, sync) |
| Component Tests | Playwright | Renderer UI with mocked `window.toodoo` API |
| E2E Tests | WebDriverIO + wdio-electron-service | Full application testing |

## Quick Start

```bash
# Install dependencies
npm install

# Run all unit tests
npm run test

# Run unit tests in watch mode
npm run test:watch

# Run component tests (Playwright)
npm run test:playwright

# Run E2E tests (requires build)
npm run test:e2e

# Run all tests
npm run test:all
```

## Test Structure

```
tests/
  setup.ts                    # Vitest global setup (mocks Electron)
  mocks.ts                    # Playwright window.toodoo mock factory
  fixtures/
    tasks.ts                  # Task test data
    notes.ts                  # Note test data
    config.ts                 # Configuration test data
  main/
    database.test.ts          # Database CRUD and validation
    config.test.ts            # NAS configuration logic
    file-lock.test.ts         # File locking mechanism
    shortcuts.test.ts         # Global shortcut registration
    sync.test.ts              # NAS sync and circuit breaker
  renderer/
    quick-add.spec.ts         # Quick-add popup tests (Playwright)
    setup.spec.ts             # Setup wizard tests (Playwright)
    notetank.spec.ts          # Notetank overlay tests (Playwright)
    overlay.spec.ts           # Main overlay tests (Playwright)

e2e/
  wdio.conf.ts               # WebDriverIO configuration
  specs/
    launch.spec.ts           # Application launch tests
    task-crud.spec.ts        # Task CRUD via real UI
    shortcuts.spec.ts        # Global shortcut tests
```

## Unit Tests (Vitest)

Unit tests run in Node.js with mocked Electron modules.

### Running Unit Tests

```bash
# Run once
npm run test

# Watch mode
npm run test:watch

# With coverage
npm run test:coverage

# With UI
npm run test:ui
```

### Configuration

`vitest.config.ts` configures:
- Path aliases (`@shared`, `@main`, etc.)
- Setup file for Electron mocks
- Coverage with v8

### Writing Unit Tests

```typescript
import { describe, it, expect, vi } from 'vitest'

describe('MyModule', () => {
  it('should do something', () => {
    // Arrange
    const input = 'test'

    // Act
    const result = myFunction(input)

    // Assert
    expect(result).toBe('expected')
  })
})
```

## Component Tests (Playwright)

Component tests run the React UI in a real browser with `window.toodoo` mocked.

### Running Component Tests

```bash
# Run tests
npm run test:playwright

# With UI
npm run test:playwright:ui

# Headed mode
npm run test:playwright:headed
```

### The Mock System

`tests/mocks.ts` provides `injectToodooMock()`:

```typescript
import { injectToodooMock, sampleTasks } from './mocks'

test.beforeEach(async ({ page }) => {
  await injectToodooMock(page, sampleTasks)
  await page.goto('/#/toodoo')
})

test('displays tasks', async ({ page }) => {
  await expect(page.locator('.task-card')).toHaveCount(4)
})
```

The mock:
- Intercepts HTML requests and injects script before `<head>`
- Provides full `window.toodoo` API implementation
- Maintains in-memory state for CRUD operations
- Notifies listeners when data changes

## E2E Tests (WebDriverIO)

E2E tests run against the actual Electron application.

### Prerequisites

1. Build the application:
   ```bash
   npm run build
   ```

2. For packaged app testing:
   ```bash
   npm run electron:build
   ```

### Running E2E Tests

```bash
# Against built source
npm run test:e2e:dev

# Full build + test
npm run test:e2e
```

### Configuration

`e2e/wdio.conf.ts` configures:
- `wdio-electron-service` for Electron automation
- Mocha test framework
- Spec and Allure reporters
- Test data isolation via `TOODOO_NAS_PATH` env var

### Writing E2E Tests

```typescript
describe('Feature', () => {
  it('should work', async () => {
    // WebDriverIO globals: browser, $, $$
    const element = await $('.my-class')
    await element.waitForDisplayed()
    expect(await element.getText()).toBe('Expected')
  })
})
```

### Multi-Window Testing

```typescript
it('opens quick-add', async () => {
  await $('.section-dot-btn').click()
  await browser.pause(500)

  const handles = await browser.getWindowHandles()
  if (handles.length > 1) {
    await browser.switchToWindow(handles[1])
    // ... interact with popup
    await browser.switchToWindow(handles[0])
  }
})
```

### Global Shortcut Testing

Global shortcuts are challenging to test programmatically. Most shortcut tests are skipped by default to prevent interference with the user's system.

## Test Fixtures

### Task Fixtures

```typescript
import { createTask, sampleTasks, edgeCaseTasks } from '../fixtures/tasks'

// Create custom task
const task = createTask({ title: 'Custom', category: 'hot' })

// Use samples
const hotTask = sampleTasks.hot
const projectWithNotes = sampleTasks.project

// Edge cases for validation testing
const emptyTitle = edgeCaseTasks.emptyTitle
```

### Note Fixtures

```typescript
import { createNote, sampleNotes, searchTestNotes } from '../fixtures/notes'

const note = createNote({ title: 'Test', content: 'Content' })
```

### Config Fixtures

```typescript
import { sampleConfig, sampleSyncStatus, sampleCache } from '../fixtures/config'

const onlineStatus = sampleSyncStatus.online
const circuitBreakerStatus = sampleSyncStatus.circuitBreakerOpen
```

## Best Practices

### 1. Isolate Test Data

Each test should use isolated data to prevent interference:

```typescript
beforeEach(() => {
  vi.clearAllMocks()
  // Reset any shared state
})
```

### 2. Use Appropriate Test Level

- **Unit tests**: Business logic, validation, algorithms
- **Component tests**: UI rendering, user interactions, state management
- **E2E tests**: Critical user flows, integration points, shortcuts

### 3. Mock External Dependencies

Unit tests mock:
- Electron APIs (`app`, `BrowserWindow`, `ipcMain`)
- File system (`fs`)
- External services

Component tests mock:
- `window.toodoo` API
- Not the actual DOM or React

### 4. Test Error Cases

```typescript
it('should handle error', async () => {
  vi.mocked(fs.readFileSync).mockImplementation(() => {
    throw new Error('ENOENT')
  })

  expect(() => loadData()).toThrow()
})
```

### 5. Use Descriptive Test Names

```typescript
describe('Task Validation', () => {
  describe('title validation', () => {
    it('should reject empty title')
    it('should reject title exceeding 500 characters')
    it('should trim whitespace from title')
  })
})
```

## Coverage Goals

| Category | Target |
|----------|--------|
| Critical Path (P0) | 100% |
| Core Features (P1) | 90% |
| Integration (P2) | 80% |
| Edge Cases (P3) | 70% |

## CI/CD Integration

Add to your CI pipeline:

```yaml
test:
  runs-on: windows-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: '20'
    - run: npm ci
    - run: npm run test
    - run: npm run test:playwright
    # E2E tests require display
    # - run: npm run test:e2e
```

## Troubleshooting

### Tests hang or timeout

- Check if Electron app is already running
- Increase timeout in config
- Check for unhandled promises

### Mock not applied

- Ensure mock is defined before import
- Use `vi.resetModules()` for fresh imports
- Check mock path matches actual module path

### E2E tests fail to find elements

- Add `waitForDisplayed()` before assertions
- Check selector specificity
- Add delays for animations: `await browser.pause(500)`

### Global shortcuts interfere with system

- Skip shortcut tests in regular runs
- Use dedicated test environment
- Run in VM or CI environment
