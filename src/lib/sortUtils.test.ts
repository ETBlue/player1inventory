import { describe, expect, it } from 'vitest'
import type { Item } from '@/types'
import { sortItems } from './sortUtils'

describe('sortItems', () => {
  const items: Item[] = [
    {
      id: '1',
      name: 'Tomatoes',
      tagIds: [],
      targetQuantity: 5,
      refillThreshold: 2,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-02-10'),
    },
    {
      id: '2',
      name: 'Apples',
      tagIds: [],
      targetQuantity: 10,
      refillThreshold: 3,
      createdAt: new Date('2026-01-02'),
      updatedAt: new Date('2026-02-12'),
    },
    {
      id: '3',
      name: 'Pasta',
      tagIds: [],
      targetQuantity: 3,
      refillThreshold: 1,
      createdAt: new Date('2026-01-03'),
      updatedAt: new Date('2026-02-11'),
    },
  ]

  const quantities = new Map([
    ['1', 1], // Below threshold (error)
    ['2', 10], // At target (ok)
    ['3', 1], // At threshold (warning)
  ])

  const expiryDates = new Map([
    ['1', new Date('2026-02-15')], // 2 days away
    ['2', new Date('2026-02-20')], // 7 days away
    ['3', undefined], // No expiry
  ])

  it('sorts by name ascending', () => {
    const sorted = sortItems(items, quantities, expiryDates, 'name', 'asc')
    expect(sorted.map((i) => i.name)).toEqual(['Apples', 'Pasta', 'Tomatoes'])
  })

  it('sorts by name descending', () => {
    const sorted = sortItems(items, quantities, expiryDates, 'name', 'desc')
    expect(sorted.map((i) => i.name)).toEqual(['Tomatoes', 'Pasta', 'Apples'])
  })

  it('sorts by updatedAt ascending', () => {
    const sorted = sortItems(items, quantities, expiryDates, 'updatedAt', 'asc')
    expect(sorted.map((i) => i.id)).toEqual(['1', '3', '2'])
  })

  it('sorts by updatedAt descending', () => {
    const sorted = sortItems(
      items,
      quantities,
      expiryDates,
      'updatedAt',
      'desc',
    )
    expect(sorted.map((i) => i.id)).toEqual(['2', '3', '1'])
  })

  it('sorts by expiring ascending (soonest first)', () => {
    const sorted = sortItems(items, quantities, expiryDates, 'expiring', 'asc')
    expect(sorted.map((i) => i.id)).toEqual(['1', '2', '3'])
  })

  it('sorts by expiring descending (latest first, undefined last)', () => {
    const sorted = sortItems(items, quantities, expiryDates, 'expiring', 'desc')
    expect(sorted.map((i) => i.id)).toEqual(['2', '1', '3'])
  })

  it('handles missing quantity data gracefully', () => {
    const emptyQuantities = new Map<string, number>()
    const sorted = sortItems(
      items,
      emptyQuantities,
      expiryDates,
      'stock',
      'asc',
    )
    expect(sorted).toHaveLength(3)
  })

  it('handles missing expiry data gracefully', () => {
    const emptyDates = new Map<string, Date | undefined>()
    const sorted = sortItems(items, quantities, emptyDates, 'expiring', 'asc')
    expect(sorted).toHaveLength(3)
  })
})

describe('sortItems - stock by progress', () => {
  const createMockItem = (
    id: string,
    name: string,
    overrides: Partial<Item> = {},
  ): Item => ({
    id,
    name,
    tagIds: [],
    targetQuantity: 10,
    refillThreshold: 2,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  })

  it('sorts by progress percentage ascending', () => {
    const items: Item[] = [
      createMockItem('1', 'Item A', { targetQuantity: 10 }), // 5/10 = 50%
      createMockItem('2', 'Item B', { targetQuantity: 5 }), // 2/5 = 40%
      createMockItem('3', 'Item C', { targetQuantity: 10 }), // 8/10 = 80%
    ]
    const quantities = new Map([
      ['1', 5],
      ['2', 2],
      ['3', 8],
    ])

    const sorted = sortItems(items, quantities, new Map(), 'stock', 'asc')

    // Should sort by percentage: 40%, 50%, 80%
    expect(sorted[0].id).toBe('2') // 40%
    expect(sorted[1].id).toBe('1') // 50%
    expect(sorted[2].id).toBe('3') // 80%
  })

  it('sorts by progress percentage descending', () => {
    const items: Item[] = [
      createMockItem('1', 'Item A', { targetQuantity: 10 }), // 5/10 = 50%
      createMockItem('2', 'Item B', { targetQuantity: 5 }), // 2/5 = 40%
      createMockItem('3', 'Item C', { targetQuantity: 10 }), // 8/10 = 80%
    ]
    const quantities = new Map([
      ['1', 5],
      ['2', 2],
      ['3', 8],
    ])

    const sorted = sortItems(items, quantities, new Map(), 'stock', 'desc')

    // Should sort by percentage: 80%, 50%, 40%
    expect(sorted[0].id).toBe('3') // 80%
    expect(sorted[1].id).toBe('1') // 50%
    expect(sorted[2].id).toBe('2') // 40%
  })

  it('handles zero targetQuantity gracefully', () => {
    const items: Item[] = [
      createMockItem('1', 'Item A', { targetQuantity: 0 }), // 5/0 = Infinity
      createMockItem('2', 'Item B', { targetQuantity: 10 }), // 5/10 = 50%
    ]
    const quantities = new Map([
      ['1', 5],
      ['2', 5],
    ])

    const sorted = sortItems(items, quantities, new Map(), 'stock', 'asc')

    // Items with 0 target should sort as if 100% full
    expect(sorted[0].id).toBe('2') // 50%
    expect(sorted[1].id).toBe('1') // Treated as 1 (100%)
  })
})
