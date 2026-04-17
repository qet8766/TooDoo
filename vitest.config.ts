import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,

    // Default env is node (main process tests). Renderer tests under
    // tests/renderer/** override to jsdom via environmentMatchGlobs.
    environment: 'node',
    environmentMatchGlobs: [['tests/renderer/**', 'jsdom']],

    include: ['tests/main/**/*.test.ts', 'tests/renderer/**/*.test.{ts,tsx}'],

    exclude: ['node_modules', 'dist', 'dist-electron', 'release'],

    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules', 'dist', 'dist-electron', 'tests', '**/*.d.ts', '**/*.config.*'],
    },

    setupFiles: ['./tests/setup.ts', './tests/renderer-setup.ts'],

    testTimeout: 10000,
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
