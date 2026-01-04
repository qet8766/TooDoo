/**
 * Categories Unit Tests
 *
 * Tests for task category definitions. These are pure data tests
 * with no mocking required.
 */

import { describe, it, expect } from 'vitest'
import { CATEGORIES, NORMAL_CATEGORIES, ALL_CATEGORIES } from '@shared/categories'

describe('Category Definitions', () => {
  describe('CATEGORIES object', () => {
    it('should have all expected categories', () => {
      expect(CATEGORIES).toHaveProperty('scorching')
      expect(CATEGORIES).toHaveProperty('hot')
      expect(CATEGORIES).toHaveProperty('warm')
      expect(CATEGORIES).toHaveProperty('cool')
      expect(CATEGORIES).toHaveProperty('project')
    })

    it('should have correct keys matching category names', () => {
      for (const [key, category] of Object.entries(CATEGORIES)) {
        expect(category.key).toBe(key)
      }
    })

    it('should have titles for each category', () => {
      for (const category of Object.values(CATEGORIES)) {
        expect(category.title).toBeTruthy()
        expect(typeof category.title).toBe('string')
      }
    })

    it('should have tones for each category', () => {
      for (const category of Object.values(CATEGORIES)) {
        expect(category.tone).toBeTruthy()
        expect(typeof category.tone).toBe('string')
      }
    })
  })

  describe('Category tones', () => {
    it('should have white tone for scorching', () => {
      expect(CATEGORIES.scorching.tone).toBe('white')
    })

    it('should have red tone for hot', () => {
      expect(CATEGORIES.hot.tone).toBe('red')
    })

    it('should have yellow tone for warm', () => {
      expect(CATEGORIES.warm.tone).toBe('yellow')
    })

    it('should have blue tone for cool', () => {
      expect(CATEGORIES.cool.tone).toBe('blue')
    })

    it('should have violet tone for project', () => {
      expect(CATEGORIES.project.tone).toBe('violet')
    })
  })

  describe('Category titles', () => {
    it('should have proper capitalized titles', () => {
      expect(CATEGORIES.scorching.title).toBe('Scorching')
      expect(CATEGORIES.hot.title).toBe('Hot')
      expect(CATEGORIES.warm.title).toBe('Warm')
      expect(CATEGORIES.cool.title).toBe('Cool')
      expect(CATEGORIES.project.title).toBe('Project')
    })
  })
})

describe('Category Arrays', () => {
  describe('NORMAL_CATEGORIES', () => {
    it('should contain hot, warm, cool, project', () => {
      expect(NORMAL_CATEGORIES).toContain('hot')
      expect(NORMAL_CATEGORIES).toContain('warm')
      expect(NORMAL_CATEGORIES).toContain('cool')
      expect(NORMAL_CATEGORIES).toContain('project')
    })

    it('should NOT contain scorching', () => {
      expect(NORMAL_CATEGORIES).not.toContain('scorching')
    })

    it('should have exactly 4 categories', () => {
      expect(NORMAL_CATEGORIES).toHaveLength(4)
    })

    it('should be in priority order', () => {
      expect(NORMAL_CATEGORIES).toEqual(['hot', 'warm', 'cool', 'project'])
    })
  })

  describe('ALL_CATEGORIES', () => {
    it('should contain all categories including scorching', () => {
      expect(ALL_CATEGORIES).toContain('scorching')
      expect(ALL_CATEGORIES).toContain('hot')
      expect(ALL_CATEGORIES).toContain('warm')
      expect(ALL_CATEGORIES).toContain('cool')
      expect(ALL_CATEGORIES).toContain('project')
    })

    it('should have exactly 5 categories', () => {
      expect(ALL_CATEGORIES).toHaveLength(5)
    })

    it('should have scorching first (highest priority)', () => {
      expect(ALL_CATEGORIES[0]).toBe('scorching')
    })
  })
})

describe('Category Priority', () => {
  it('scorching should be most urgent (panic button)', () => {
    // Scorching is only in ALL_CATEGORIES, first position
    expect(ALL_CATEGORIES.indexOf('scorching')).toBe(0)
    expect(NORMAL_CATEGORIES.includes('scorching' as never)).toBe(false)
  })

  it('hot should be second priority', () => {
    expect(ALL_CATEGORIES.indexOf('hot')).toBe(1)
    expect(NORMAL_CATEGORIES.indexOf('hot')).toBe(0)
  })

  it('project should be last in normal categories', () => {
    expect(NORMAL_CATEGORIES[NORMAL_CATEGORIES.length - 1]).toBe('project')
  })
})
