/**
 * Renderer-only setup. Runs in jsdom env for tests/renderer/**.
 * The node-env main-process tests still load this file but the
 * import is side-effect-safe there because the matchers only attach
 * to a vitest `expect` that exists in both environments.
 */
import '@testing-library/jest-dom/vitest'
