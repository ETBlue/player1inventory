import { describe, expect, it } from 'vitest'
import {
  isFullscreenPage,
  isHouseholdSettingsPage,
  lastAppPage,
} from './layoutRules'

const BOTH = [true, false] as const

describe('isFullscreenPage', () => {
  describe.each(BOTH)('desktop: %s', (desktop) => {
    it.each([
      '/onboarding',
      '/items/abc',
      '/items/abc/',
      '/settings/household/tags/t1',
      '/settings/household/tags/t1/',
      '/settings/household/tags/t1/items',
      '/settings/household/vendors/v1/items',
      '/settings/household/recipes/r1',
      '/settings/household/shelves/s1/filters',
    ])('%s is full-screen', (path) => {
      expect(isFullscreenPage(path, { desktop })).toBe(true)
    })

    it.each([
      '/',
      '/shopping',
      '/cooking',
      '/settings',
      '/settings/household',
      '/settings/household/',
      '/settings/household/locations',
      '/settings/household/locations/',
    ])('%s is not full-screen', (path) => {
      expect(isFullscreenPage(path, { desktop })).toBe(false)
    })
  })

  describe('household list pages', () => {
    it.each([
      '/settings/household/tags',
      '/settings/household/tags/',
      '/settings/household/vendors',
      '/settings/household/recipes',
      '/settings/household/shelves',
      '/settings/household/shelves/',
    ])('%s shows the sidebar on desktop', (path) => {
      expect(isFullscreenPage(path, { desktop: true })).toBe(false)
    })

    it.each([
      '/settings/household/tags',
      '/settings/household/tags/',
      '/settings/household/vendors',
      '/settings/household/recipes',
      '/settings/household/shelves',
      '/settings/household/shelves/',
    ])('%s stays full-screen on mobile, as today', (path) => {
      expect(isFullscreenPage(path, { desktop: false })).toBe(true)
    })
  })
})

describe('isHouseholdSettingsPage', () => {
  it.each([
    '/settings/household',
    '/settings/household/',
    '/settings/household/locations',
    '/settings/household/tags',
    '/settings/household/tags/',
    '/settings/household/vendors',
    '/settings/household/recipes',
    '/settings/household/shelves',
  ])('%s is a household list page', (path) => {
    expect(isHouseholdSettingsPage(path)).toBe(true)
  })

  it.each([
    '/',
    '/settings',
    '/settings/',
    '/settings/householdx',
    '/settings/household/tags/t1',
    '/settings/household/tags/t1/',
    '/settings/household/vendors/v1/items',
    '/settings/household/shelves/s1/filters',
    '/items/abc',
  ])('%s is not a household list page', (path) => {
    expect(isHouseholdSettingsPage(path)).toBe(false)
  })
})

describe('lastAppPage', () => {
  it('returns the newest Pantry, Shopping or Cooking URL, with its search string', () => {
    // Given a history that ends on settings pages
    const history = [
      '/cooking',
      '/?groupBy=vendor',
      '/settings/household',
      '/settings/household/tags',
    ]

    // Then the newest app page wins, and its search string is kept
    expect(lastAppPage(history)).toBe('/?groupBy=vendor')
  })

  it.each([
    ['/', '/'],
    ['/?q=milk', '/?q=milk'],
    ['/shopping', '/shopping'],
    ['/shopping/v1?x=1', '/shopping/v1?x=1'],
    ['/cooking', '/cooking'],
    ['/cooking/', '/cooking/'],
    ['/cooking?r=1', '/cooking?r=1'],
  ])('accepts %s', (entry, expected) => {
    expect(lastAppPage(['/settings/household', entry, '/items/i1'])).toBe(
      expected,
    )
  })

  it.each([
    '/items/i1',
    '/settings',
    '/settings/household/tags',
    '/cooking/extra',
    '/onboarding',
    '/shoppingx',
  ])('skips %s', (entry) => {
    expect(lastAppPage(['/cooking?r=1', entry])).toBe('/cooking?r=1')
  })

  it('falls back to / when the history holds no app page', () => {
    expect(lastAppPage(['/settings/household', '/items/i1'])).toBe('/')
    expect(lastAppPage([])).toBe('/')
  })
})
