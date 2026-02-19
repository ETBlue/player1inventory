import { describe, expect, it } from 'vitest'
import { isSamePage } from './useAppNavigation'

describe('isSamePage', () => {
  it('treats item detail tabs as same page', () => {
    expect(isSamePage('/items/123', '/items/123/tags')).toBe(true)
    expect(isSamePage('/items/123/tags', '/items/123/vendors')).toBe(true)
    expect(isSamePage('/items/123/vendors', '/items/123/log')).toBe(true)
    expect(isSamePage('/items/123', '/items/123')).toBe(true)
  })

  it('treats vendor detail tabs as same page', () => {
    expect(
      isSamePage('/settings/vendors/abc', '/settings/vendors/abc/items'),
    ).toBe(true)
    expect(
      isSamePage('/settings/vendors/abc/items', '/settings/vendors/abc'),
    ).toBe(true)
    expect(isSamePage('/settings/vendors/abc', '/settings/vendors/abc')).toBe(
      true,
    )
  })

  it('treats different item IDs as different pages', () => {
    expect(isSamePage('/items/123', '/items/456')).toBe(false)
    expect(isSamePage('/items/123/tags', '/items/456/tags')).toBe(false)
  })

  it('treats different vendor IDs as different pages', () => {
    expect(isSamePage('/settings/vendors/abc', '/settings/vendors/xyz')).toBe(
      false,
    )
    expect(
      isSamePage('/settings/vendors/abc/items', '/settings/vendors/xyz/items'),
    ).toBe(false)
  })

  it('treats completely different routes as different pages', () => {
    expect(isSamePage('/', '/shopping')).toBe(false)
    expect(isSamePage('/items/123', '/shopping')).toBe(false)
    expect(isSamePage('/settings/vendors', '/settings/tags')).toBe(false)
  })
})
