import { describe, expect, it } from 'vitest'
import { isFullscreenPage } from './layoutRules'

describe('isFullscreenPage', () => {
  it.each([
    '/onboarding',
    '/items/abc',
    '/settings/tags',
    '/settings/tags/t1/items',
    '/settings/vendors/',
    '/settings/recipes/r1',
    '/settings/shelves/s1/filters',
  ])('%s is full-screen', (path) => {
    expect(isFullscreenPage(path)).toBe(true)
  })

  it.each([
    '/',
    '/shopping',
    '/cooking',
    '/settings',
    '/settings/locations',
  ])('%s is not full-screen', (path) => {
    expect(isFullscreenPage(path)).toBe(false)
  })
})
