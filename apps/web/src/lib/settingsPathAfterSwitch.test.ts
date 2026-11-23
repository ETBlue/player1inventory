import { describe, expect, it } from 'vitest'
import { settingsPathAfterSwitch } from './settingsPathAfterSwitch'

describe('settingsPathAfterSwitch', () => {
  it('returns null for a page outside settings', () => {
    expect(settingsPathAfterSwitch('/')).toBeNull()
    expect(settingsPathAfterSwitch('/shopping/no-vendor')).toBeNull()
    expect(settingsPathAfterSwitch('/items/item-1')).toBeNull()
    expect(settingsPathAfterSwitch('/cooking')).toBeNull()
    // A path that only starts with the same letters is not settings
    expect(settingsPathAfterSwitch('/settingsx')).toBeNull()
  })

  it('keeps /settings and the household page', () => {
    expect(settingsPathAfterSwitch('/settings')).toBe('/settings')
    expect(settingsPathAfterSwitch('/settings/')).toBe('/settings')
    expect(settingsPathAfterSwitch('/settings/household')).toBe(
      '/settings/household',
    )
    expect(settingsPathAfterSwitch('/settings/household/')).toBe(
      '/settings/household',
    )
  })

  it('keeps the members and activity pages', () => {
    expect(settingsPathAfterSwitch('/settings/household/members')).toBe(
      '/settings/household/members',
    )
    expect(settingsPathAfterSwitch('/settings/household/activity')).toBe(
      '/settings/household/activity',
    )
  })

  it.each([
    'locations',
    'recipes',
    'shelves',
    'tags',
    'vendors',
  ])('keeps the %s list page', (section) => {
    expect(settingsPathAfterSwitch(`/settings/household/${section}`)).toBe(
      `/settings/household/${section}`,
    )
    expect(settingsPathAfterSwitch(`/settings/household/${section}/`)).toBe(
      `/settings/household/${section}`,
    )
  })

  it.each([
    ['/settings/household/locations/loc-1', '/settings/household/locations'],
    ['/settings/household/recipes/rec-1', '/settings/household/recipes'],
    ['/settings/household/recipes/rec-1/items', '/settings/household/recipes'],
    ['/settings/household/shelves/shelf-1', '/settings/household/shelves'],
    [
      '/settings/household/shelves/shelf-1/filters',
      '/settings/household/shelves',
    ],
    [
      '/settings/household/shelves/shelf-1/items',
      '/settings/household/shelves',
    ],
    ['/settings/household/tags/tag-1', '/settings/household/tags'],
    ['/settings/household/tags/tag-1/items', '/settings/household/tags'],
    ['/settings/household/vendors/ven-1', '/settings/household/vendors'],
    ['/settings/household/vendors/ven-1/items', '/settings/household/vendors'],
  ])('sends the row page %s to its list page', (pathname, expected) => {
    expect(settingsPathAfterSwitch(pathname)).toBe(expected)
  })
})
