# TooDoo E2E Testing Plan

## Executive Summary

This document outlines a comprehensive E2E testing strategy for the TooDoo Electron application (Electron 39.2.7 + React 19 + TypeScript + Vite).

## Testing Approach Recommendation

### Primary Recommendation: Hybrid Testing Strategy

After researching available options for Electron 39+, I recommend a **hybrid approach** combining:

1. **Component/Integration Tests** - Using Vitest with browser mocks (existing approach extended)
2. **Main Process Unit Tests** - Using Vitest for IPC handlers, database logic, window management
3. **WebDriverIO with wdio-electron-service** - For true E2E testing of the packaged app

### Why Not Pure Playwright?

- Playwright's Electron support is experimental and often breaks with new Electron versions
- Electron 39 uses Chromium 134+, which may not be fully supported by Playwright's Electron mode
- The existing Playwright tests mock `window.toodoo`, making them essentially component tests, not true E2E

### Why This Hybrid Approach?

| Layer | Tool | Coverage |
|-------|------|----------|
| Renderer Components | Vitest + jsdom/happy-dom | UI logic, React components, state management |
| Main Process | Vitest | IPC handlers, database operations, window management |
| Full E2E | wdio-electron-service | Real app behavior, hotkeys, multi-window, tray |

---

## Test Coverage Matrix

### P0 - Critical Path Tests (Must Pass)

| Test ID | Description | Type |
|---------|-------------|------|
| P0-001 | Application launches without errors | E2E |
| P0-002 | Main overlay window renders | E2E |
| P0-003 | Tasks can be listed from cache | Integration |
| P0-004 | Task can be created via IPC | Integration |
| P0-005 | Task appears in correct category column | Component |
| P0-006 | Global shortcuts register on startup | E2E |

### P1 - Core Feature Tests

#### Task Management
| Test ID | Description | Type |
|---------|-------------|------|
| P1-T001 | Create task via quick-add popup | E2E |
| P1-T002 | Edit task title in overlay | Component |
| P1-T003 | Edit task description | Component |
| P1-T004 | Mark task as done (toggle checkbox) | Component |
| P1-T005 | Delete task (two-click safety) | Component |
| P1-T006 | Drag task to change category | Component |
| P1-T007 | Project notes: add note | Component |
| P1-T008 | Project notes: edit note | Component |
| P1-T009 | Project notes: delete note | Component |
| P1-T010 | Scorching mode activation (when scorching tasks exist) | Component |

#### Quick-Add Popup
| Test ID | Description | Type |
|---------|-------------|------|
| P1-Q001 | Popup opens at cursor position | E2E |
| P1-Q002 | Category is pre-selected from shortcut | E2E |
| P1-Q003 | Form validation (empty title) | Component |
| P1-Q004 | Successful submission closes popup | Component |
| P1-Q005 | Enter key submits form | Component |
| P1-Q006 | Escape key closes popup | E2E |

#### Window Management
| Test ID | Description | Type |
|---------|-------------|------|
| P1-W001 | Overlay singleton pattern (only one instance) | E2E |
| P1-W002 | Quick-add closes after submission | E2E |
| P1-W003 | Windows are always-on-top | E2E |
| P1-W004 | Windows are frameless/transparent | E2E |
| P1-W005 | View switching (TooDoo <-> Notetank) | E2E |

### P2 - Integration Tests

#### IPC Communication
| Test ID | Description | Type |
|---------|-------------|------|
| P2-I001 | tasks:list returns cached tasks | Unit |
| P2-I002 | tasks:add creates task with correct structure | Unit |
| P2-I003 | tasks:update modifies existing task | Unit |
| P2-I004 | tasks:delete removes task | Unit |
| P2-I005 | tasks:changed broadcasts to all windows | E2E |
| P2-I006 | Validation rejects invalid payloads | Unit |

#### NAS Sync
| Test ID | Description | Type |
|---------|-------------|------|
| P2-S001 | Sync status reports online/offline correctly | Integration |
| P2-S002 | Pending changes tracked in cache | Unit |
| P2-S003 | Circuit breaker opens after 5 failures | Unit |
| P2-S004 | Circuit breaker resets after backoff | Unit |
| P2-S005 | File lock prevents concurrent writes | Unit |
| P2-S006 | LWW merge resolves conflicts | Unit |
| P2-S007 | Manual sync trigger works | Integration |

#### Configuration
| Test ID | Description | Type |
|---------|-------------|------|
| P2-C001 | needsSetup returns true when no NAS path | Unit |
| P2-C002 | validatePath checks path accessibility | Unit |
| P2-C003 | setNasPath persists configuration | Unit |
| P2-C004 | Machine ID is stable across restarts | Unit |

### P3 - Edge Cases

| Test ID | Description | Type |
|---------|-------------|------|
| P3-001 | Empty state displays correctly | Component |
| P3-002 | Long task title truncation | Component |
| P3-003 | Special characters in task title | Component |
| P3-004 | Category migration (legacy -> new) | Unit |
| P3-005 | Font size persistence | Component |
| P3-006 | Task count pills accurate | Component |

### P4 - Setup Wizard

| Test ID | Description | Type |
|---------|-------------|------|
| P4-001 | Setup window shows when no NAS configured | E2E |
| P4-002 | Browse folder dialog opens | E2E |
| P4-003 | Path validation feedback | Component |
| P4-004 | Save & Continue completes setup | E2E |
| P4-005 | Setup completion triggers overlay launch | E2E |

### P5 - Notetank Feature

| Test ID | Description | Type |
|---------|-------------|------|
| P5-001 | Notetank overlay renders | Component |
| P5-002 | Create note via Alt+Shift+N | E2E |
| P5-003 | Note editor opens correctly | E2E |
| P5-004 | Notes persist and display | Integration |
| P5-005 | Note search functionality | Component |
| P5-006 | notes:changed broadcasts correctly | E2E |

---

## Test Infrastructure Setup

### Phase 1: Enhanced Component/Integration Testing (Recommended First)

Extend the existing Playwright-based tests with more comprehensive mocks:

```
tests/
  mocks.ts                    # Enhanced API mocks (existing)
  fixtures/                   # Test data fixtures
    tasks.ts
    notes.ts
    config.ts
  renderer/
    overlay.spec.ts           # Enhanced overlay tests
    quick-add.spec.ts         # Quick-add popup tests
    setup.spec.ts             # Setup wizard tests
    notetank/
      overlay.spec.ts
      note-editor.spec.ts
  main/
    database.spec.ts          # Database logic unit tests
    ipc-handlers.spec.ts      # IPC handler tests
    window-management.spec.ts # Window lifecycle tests
    shortcuts.spec.ts         # Shortcut registration tests
    sync/
      nas-sync.spec.ts
      file-lock.spec.ts
      circuit-breaker.spec.ts
```

### Phase 2: True E2E Testing with WebDriverIO

For tests requiring the actual Electron app running:

```
e2e/
  wdio.conf.ts               # WebDriverIO configuration
  specs/
    launch.spec.ts           # App launch tests
    shortcuts.spec.ts        # Global hotkey tests
    multi-window.spec.ts     # Window coordination tests
    full-workflow.spec.ts    # End-to-end user flows
```

---

## Implementation Priority

### Week 1: Foundation
1. Set up Vitest for main process unit tests
2. Add database and IPC handler tests
3. Enhance existing component test mocks

### Week 2: Component Tests
1. Complete overlay component tests
2. Add quick-add popup tests
3. Add setup wizard tests
4. Add notetank tests

### Week 3: E2E Infrastructure
1. Set up wdio-electron-service
2. Create app launch and basic E2E tests
3. Add global shortcut tests

### Week 4: Full Coverage
1. Multi-window E2E tests
2. NAS sync integration tests
3. Edge case coverage
4. CI/CD integration

---

## Dependencies to Add

```json
{
  "devDependencies": {
    "@wdio/cli": "^9.0.0",
    "@wdio/local-runner": "^9.0.0",
    "@wdio/mocha-framework": "^9.0.0",
    "@wdio/spec-reporter": "^9.0.0",
    "wdio-electron-service": "^7.0.0",
    "vitest": "^2.0.0",
    "@vitest/coverage-v8": "^2.0.0"
  }
}
```

---

## Notes on Electron 39 Compatibility

- Electron 39 uses Chromium 134, which is very recent
- wdio-electron-service supports automatic Chromedriver download for Electron 26+
- If compatibility issues arise, manual Chromedriver configuration may be needed
- Monitor https://github.com/webdriverio-community/wdio-electron-service for updates

---

## Success Criteria

- All P0 tests pass: Application is deployable
- All P1 tests pass: Core features work correctly
- 80%+ P2 test coverage: Integration layer is solid
- P3 edge cases covered: User experience is polished
- P4/P5 features tested: Complete feature coverage
