import { describe, expect, it } from 'vitest'
import { isFullscreenPage } from './layoutRules'

describe('isFullscreenPage', () => {
  it.each([
    '/onboarding',
    '/items/abc',
    '/settings/household/tags',
    '/settings/household/tags/t1/items',
    '/settings/household/vendors/',
    '/settings/household/recipes/r1',
    '/settings/household/shelves/s1/filters',
  ])('%s is full-screen', (path) => {
    expect(isFullscreenPage(path)).toBe(true)
  })

  it.each([
    '/',
    '/shopping',
    '/cooking',
    '/settings',
    '/settings/household/locations',
  ])('%s is not full-screen', (path) => {
    expect(isFullscreenPage(path)).toBe(false)
  })
})
