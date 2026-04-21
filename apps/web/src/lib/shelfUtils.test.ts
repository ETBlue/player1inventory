import { describe, expect, it } from 'vitest'
import type { Item, Tag } from '@/types'
import { matchesFilterConfig } from './shelfUtils'

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: 'item-1',
    name: 'Test Item',
    tagIds: [],
    targetUnit: 'package' as const,
    targetQuantity: 1,
    refillThreshold: 0,
    packedQuantity: 0,
    unpackedQuantity: 0,
    consumeAmount: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

describe('matchesFilterConfig', () => {
  const noRecipes: { id: string; items: { itemId: string }[] }[] = []
  const noTags: Tag[] = []

  it('returns true when filterConfig is empty', () => {
    const item = makeItem()
    expect(matchesFilterConfig(item, {}, noRecipes, noTags)).toBe(true)
  })

  it('returns true for item with matching vendorId', () => {
    const item = makeItem({ vendorIds: ['vendor-1'] })
    expect(
      matchesFilterConfig(item, { vendorIds: ['vendor-1'] }, noRecipes, noTags),
    ).toBe(true)
  })

  it('returns false for item with non-matching vendorId', () => {
    const item = makeItem({ vendorIds: ['vendor-2'] })
    expect(
      matchesFilterConfig(item, { vendorIds: ['vendor-1'] }, noRecipes, noTags),
    ).toBe(false)
  })

  it('does not throw and returns false when item.vendorIds is null', () => {
    // Given an item whose vendorIds is null (imported from a backup JSON with null)
    const item = makeItem({
      vendorIds: null as unknown as string[] | undefined,
    })

    // When matching against a vendor filter
    // Then it should not throw and return false (item has no vendors)
    expect(() =>
      matchesFilterConfig(item, { vendorIds: ['vendor-1'] }, noRecipes, noTags),
    ).not.toThrow()
    expect(
      matchesFilterConfig(item, { vendorIds: ['vendor-1'] }, noRecipes, noTags),
    ).toBe(false)
  })

  it('does not throw and returns false when item.vendorIds is undefined', () => {
    // Given an item with no vendorIds at all
    const item = makeItem({ vendorIds: undefined })

    // When matching against a vendor filter
    // Then it should not throw and return false
    expect(() =>
      matchesFilterConfig(item, { vendorIds: ['vendor-1'] }, noRecipes, noTags),
    ).not.toThrow()
    expect(
      matchesFilterConfig(item, { vendorIds: ['vendor-1'] }, noRecipes, noTags),
    ).toBe(false)
  })

  it('does not throw when filterConfig.vendorIds is null (imported backup shelf)', () => {
    // Given a shelf filterConfig where vendorIds is null (from a backed-up JSON)
    // The default destructuring `const { vendorIds = [] } = filterConfig` does NOT
    // default null to [] — only undefined defaults. So null passes through and
    // vendorIds.length throws at runtime.
    const item = makeItem({ vendorIds: ['vendor-1'] })
    const filterConfigWithNull = {
      vendorIds: null as unknown as string[] | undefined,
    }

    // When matching against the filterConfig
    // Then it should not throw
    expect(() =>
      matchesFilterConfig(item, filterConfigWithNull, noRecipes, noTags),
    ).not.toThrow()
  })
})
