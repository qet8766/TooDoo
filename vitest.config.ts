import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    // Enable globals (describe, it, expect, etc.) without imports
    globals: true,

    // Environment for renderer tests - use jsdom for DOM testing
    environment: 'node',

    // Include patterns - only main process unit tests
    include: [
      'tests/main/**/*.test.ts',
    ],

    // Exclude patterns
    exclude: [
      'node_modules',
      'dist',
      'dist-electron',
      'release',
      // Exclude all spec files (Playwright tests)
      '**/*.spec.ts',
      '**/*.spec.tsx',
      // Exclude renderer tests (use Playwright)
      'tests/renderer/**',
    ],

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules',
        'dist',
        'dist-electron',
        'tests',
        '**/*.d.ts',
        '**/*.config.*',
      ],
    },

    // Setup files
    setupFiles: ['./tests/setup.ts'],

    // Timeout for tests
    testTimeout: 10000,

    // Mock reset between tests
    mockReset: true,
  },

  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@main': path.resolve(__dirname, 'src/main'),
      '@preload': path.resolve(__dirname, 'src/preload'),
      '@renderer': path.resolve(__dirname, 'src/renderer'),
    },
  },
})
