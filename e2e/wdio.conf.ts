/**
 * WebDriverIO configuration for Electron E2E testing
 *
 * This configuration uses wdio-electron-service to test the actual
 * packaged Electron application, providing true end-to-end testing
 * including global shortcuts, multi-window behavior, and system integration.
 *
 * REQUIREMENTS:
 * - npm run build must be run first
 * - For packaged app testing: npm run electron:build
 *
 * USAGE:
 * - Development (against source): npm run test:e2e:dev
 * - Production (against build): npm run test:e2e
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')

export const config: WebdriverIO.Config = {
  // ==================
  // Electron Service Configuration
  // ==================
  services: [
    [
      'electron',
      {
        // Path to the Electron app to test
        // For development testing (against built source):
        appBinaryPath: path.join(projectRoot, 'node_modules', '.bin', 'electron'),
        appArgs: [path.join(projectRoot, 'dist-electron', 'main.mjs')],

        // For packaged app testing (uncomment to use):
        // appBinaryPath: path.join(projectRoot, 'release', 'win-unpacked', 'TooDoo.exe'),

        // ChromeDriver options
        chromedriver: {
          // Let the service auto-download appropriate version
          autoDetect: true,
        },
      },
    ],
  ],

  // ==================
  // Test Runner Configuration
  // ==================
  runner: 'local',
  specs: ['./specs/**/*.spec.ts'],
  exclude: [],

  // Maximum instances to run in parallel
  maxInstances: 1, // Electron tests should run one at a time

  // Capabilities - Electron-specific
  capabilities: [
    {
      browserName: 'electron',
      'wdio:electronServiceOptions': {
        // App startup options
        appArgs: ['--disable-gpu', '--no-sandbox'],
      },
    },
  ],

  // ==================
  // Test Framework Configuration
  // ==================
  framework: 'mocha',
  mochaOpts: {
    ui: 'bdd',
    timeout: 60000, // Electron tests may take longer
  },

  // TypeScript configuration
  autoCompileOpts: {
    autoCompile: true,
    tsNodeOpts: {
      transpileOnly: true,
      project: path.join(projectRoot, 'tsconfig.json'),
    },
  },

  // ==================
  // Reporter Configuration
  // ==================
  reporters: [
    'spec',
    [
      'allure',
      {
        outputDir: 'e2e/allure-results',
        disableWebdriverStepsReporting: true,
        disableWebdriverScreenshotsReporting: false,
      },
    ],
  ],

  // ==================
  // Logging
  // ==================
  logLevel: 'info',
  outputDir: 'e2e/logs',

  // ==================
  // Timeouts
  // ==================
  waitforTimeout: 10000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,

  // ==================
  // Hooks
  // ==================
  beforeSession: async function () {
    // Set up test environment variables
    process.env.TOODOO_NAS_PATH = path.join(projectRoot, 'e2e', 'test-data')

    // Ensure test data directory exists
    const fs = await import('node:fs')
    const testDataPath = process.env.TOODOO_NAS_PATH
    if (!fs.existsSync(testDataPath)) {
      fs.mkdirSync(testDataPath, { recursive: true })
    }
  },

  before: async function () {
    // Wait for app to be ready
    await browser.pause(2000)
  },

  afterTest: async function (test, _context, { passed }) {
    // Take screenshot on failure
    if (!passed) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const screenshotPath = path.join(
        projectRoot,
        'e2e',
        'screenshots',
        `${test.title}-${timestamp}.png`
      )
      await browser.saveScreenshot(screenshotPath)
    }
  },

  after: async function () {
    // Cleanup test data
    const fs = await import('node:fs')
    const testDataPath = path.join(projectRoot, 'e2e', 'test-data')
    if (fs.existsSync(testDataPath)) {
      fs.rmSync(testDataPath, { recursive: true, force: true })
    }
  },
}
