import type { Page } from '@playwright/test';
import type { Task, ProjectNote } from '../src/shared/types'

export type { Task, ProjectNote }

export const sampleTasks: Task[] = [
  {
    id: '1',
    title: 'Hot task 1',
    category: 'hot',
    isDone: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    isDeleted: false,
  },
  {
    id: '2',
    title: 'Warm task 1',
    description: 'A longer description',
    category: 'warm',
    isDone: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    isDeleted: false,
  },
  {
    id: '3',
    title: 'Cool task 1',
    category: 'cool',
    isDone: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    isDeleted: false,
  },
  {
    id: '4',
    title: 'Project task 1',
    category: 'project',
    isDone: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    isDeleted: false,
    projectNotes: [
      {
        id: 'note-1',
        taskId: '3',
        content: 'First note',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        isDeleted: false,
      },
    ],
  },
];

// Script to inject as string - must be self-contained
const createMockScript = (tasks: Task[]) => `
(function() {
  console.log('[Mock] Script starting, window.toodoo before =', typeof window.toodoo);

  var mockTasks = ${JSON.stringify(tasks)};
  var listeners = [];

  var notifyListeners = function() {
    listeners.forEach(function(cb) { cb(); });
  };

  var toodooMock = {
    tasks: {
      list: function() {
        return Promise.resolve(mockTasks.filter(function(t) { return !t.isDeleted; }));
      },
      add: function(payload) {
        var task = {
          id: crypto.randomUUID(),
          title: payload.title,
          description: payload.description,
          category: payload.category,
          isDone: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          isDeleted: false
        };
        mockTasks.push(task);
        notifyListeners();
        return Promise.resolve(task);
      },
      update: function(payload) {
        var idx = mockTasks.findIndex(function(t) { return t.id === payload.id; });
        if (idx === -1) return Promise.resolve(null);
        Object.assign(mockTasks[idx], payload, { updatedAt: Date.now() });
        notifyListeners();
        return Promise.resolve(mockTasks[idx]);
      },
      remove: function(id) {
        mockTasks = mockTasks.filter(function(t) { return t.id !== id; });
        notifyListeners();
        return Promise.resolve({ id: id });
      },
      addNote: function(payload) {
        var task = mockTasks.find(function(t) { return t.id === payload.taskId; });
        if (!task) return Promise.resolve({ error: 'Task not found' });
        var note = {
          id: payload.id,
          taskId: payload.taskId,
          content: payload.content,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          isDeleted: false
        };
        task.projectNotes = (task.projectNotes || []).concat([note]);
        notifyListeners();
        return Promise.resolve(note);
      },
      removeNote: function(id) {
        mockTasks.forEach(function(task) {
          if (task.projectNotes) {
            task.projectNotes = task.projectNotes.filter(function(n) { return n.id !== id; });
          }
        });
        notifyListeners();
        return Promise.resolve({ id: id });
      },
      updateNote: function(payload) {
        for (var i = 0; i < mockTasks.length; i++) {
          var task = mockTasks[i];
          if (task.projectNotes) {
            for (var j = 0; j < task.projectNotes.length; j++) {
              if (task.projectNotes[j].id === payload.id) {
                Object.assign(task.projectNotes[j], payload, { updatedAt: Date.now() });
                notifyListeners();
                return Promise.resolve(task.projectNotes[j]);
              }
            }
          }
        }
        return Promise.resolve(null);
      }
    },
    onTasksChanged: function(callback) {
      listeners.push(callback);
      return function() {
        var idx = listeners.indexOf(callback);
        if (idx > -1) listeners.splice(idx, 1);
      };
    },
    config: {
      get: function() { return Promise.resolve({ nasPath: '\\\\\\\\mock\\\\toodoo', machineId: 'mock-machine', lastSyncAt: Date.now() }); },
      setNasPath: function() { return Promise.resolve({ success: true }); },
      validatePath: function() { return Promise.resolve({ valid: true }); },
      needsSetup: function() { return Promise.resolve(false); }
    },
    sync: {
      getStatus: function() { return Promise.resolve({ isOnline: true, pendingCount: 0, lastSyncAt: Date.now(), circuitBreakerOpen: false, nextRetryAt: null }); },
      trigger: function() { return Promise.resolve(); },
      resetCircuitBreaker: function() { return Promise.resolve(); }
    },
    setup: {
      browseFolder: function() { return Promise.resolve(null); },
      complete: function() { return Promise.resolve(); }
    },
    toggleOverlay: function() {},
    openQuickAdd: function() {},
    switchView: function() {}
  };

  // Use Object.defineProperty for more robust assignment
  Object.defineProperty(window, 'toodoo', {
    value: toodooMock,
    writable: false,
    configurable: true,
    enumerable: true
  });

  console.log('[Mock] window.toodoo injected via defineProperty');
  console.log('[Mock] window.toodoo =', window.toodoo);
  console.log('[Mock] "toodoo" in window =', 'toodoo' in window);
})();
`;

/**
 * Inject window.toodoo mock into the page before it loads.
 * Uses route interception to inject the mock script into HTML.
 */
export async function injectToodooMock(page: Page, initialTasks: Task[] = sampleTasks) {
  const mockScript = createMockScript(initialTasks);

  // Clear any existing routes first (for tests that call this multiple times)
  await page.unroute('**/*');

  // Intercept HTML and inject the mock script
  await page.route('**/*', async (route) => {
    const request = route.request();

    if (request.resourceType() === 'document') {
      const response = await route.fetch();
      let html = await response.text();

      // Inject mock script BEFORE any other scripts, right after <head>
      html = html.replace('<head>', `<head><script>${mockScript}</script>`);

      await route.fulfill({
        response,
        body: html,
        headers: {
          ...response.headers(),
          'content-length': String(Buffer.byteLength(html)),
        },
      });
    } else {
      await route.continue();
    }
  });
}
