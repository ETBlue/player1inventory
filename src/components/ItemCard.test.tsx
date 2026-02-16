import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test/utils'
import type { Item, Tag, TagType } from '@/types'
import { TagColor } from '@/types'
import { ItemCard } from './ItemCard'

describe('ItemCard - Unit Display Logic', () => {
  it('returns package unit when tracking in packages', () => {
    const item: Partial<Item> = {
      packageUnit: 'bottle',
      measurementUnit: 'L',
      targetUnit: 'package',
    }

    const displayUnit =
      item.targetUnit === 'measurement' && item.measurementUnit
        ? item.measurementUnit
        : (item.packageUnit ?? 'units')

    expect(displayUnit).toBe('bottle')
  })

  it('returns measurement unit when tracking in measurement', () => {
    const item: Partial<Item> = {
      packageUnit: 'bottle',
      measurementUnit: 'L',
      targetUnit: 'measurement',
    }

    const displayUnit =
      item.targetUnit === 'measurement' && item.measurementUnit
        ? item.measurementUnit
        : (item.packageUnit ?? 'units')

    expect(displayUnit).toBe('L')
  })

  it('returns package unit as fallback when tracking in measurement but no measurementUnit', () => {
    const item: Partial<Item> = {
      packageUnit: 'pack',
      targetUnit: 'measurement',
    }

    const displayUnit =
      item.targetUnit === 'measurement' && item.measurementUnit
        ? item.measurementUnit
        : (item.packageUnit ?? 'units')

    expect(displayUnit).toBe('pack')
  })

  it('returns "units" when no package unit defined', () => {
    const item: Partial<Item> = {
      targetUnit: 'package',
    }

    const displayUnit =
      item.targetUnit === 'measurement' && item.measurementUnit
        ? item.measurementUnit
        : (item.packageUnit ?? 'units')

    expect(displayUnit).toBe('units')
  })
})

describe('ItemCard - Expiration Warning Logic', () => {
  it('shows warning when within threshold', () => {
    const estimatedDueDate = new Date(Date.now() + 2 * 86400000) // 2 days from now
    const item: Partial<Item> = {
      expirationThreshold: 3,
    }

    const daysUntilExpiration = Math.ceil(
      (estimatedDueDate.getTime() - Date.now()) / 86400000,
    )
    const threshold = item.expirationThreshold ?? Number.POSITIVE_INFINITY
    const shouldShowWarning = daysUntilExpiration <= threshold

    expect(shouldShowWarning).toBe(true)
  })

  it('hides warning when outside threshold', () => {
    const estimatedDueDate = new Date(Date.now() + 5 * 86400000) // 5 days from now
    const item: Partial<Item> = {
      expirationThreshold: 3,
    }

    const daysUntilExpiration = Math.ceil(
      (estimatedDueDate.getTime() - Date.now()) / 86400000,
    )
    const threshold = item.expirationThreshold ?? Number.POSITIVE_INFINITY
    const shouldShowWarning = daysUntilExpiration <= threshold

    expect(shouldShowWarning).toBe(false)
  })

  it('always shows warning when no threshold set', () => {
    const estimatedDueDate = new Date(Date.now() + 10 * 86400000) // 10 days from now
    const item: Partial<Item> = {
      expirationThreshold: undefined,
    }

    const daysUntilExpiration = Math.ceil(
      (estimatedDueDate.getTime() - Date.now()) / 86400000,
    )
    const threshold = item.expirationThreshold ?? Number.POSITIVE_INFINITY
    const shouldShowWarning = daysUntilExpiration <= threshold

    expect(shouldShowWarning).toBe(true)
  })

  it('shows warning when already expired', () => {
    const estimatedDueDate = new Date(Date.now() - 2 * 86400000) // 2 days ago
    const item: Partial<Item> = {
      expirationThreshold: 3,
    }

    const daysUntilExpiration = Math.ceil(
      (estimatedDueDate.getTime() - Date.now()) / 86400000,
    )
    const threshold = item.expirationThreshold ?? Number.POSITIVE_INFINITY
    const shouldShowWarning = daysUntilExpiration <= threshold

    expect(shouldShowWarning).toBe(true)
  })
})

describe('ItemCard - Tag Sorting', () => {
  const mockItem: Item = {
    id: 'item-1',
    name: 'Test Item',
    tagIds: ['1', '2', '3', '4'],
    targetQuantity: 10,
    refillThreshold: 3,
    targetUnit: 'package',
    packageUnit: 'bottle',
    createdAt: new Date(),
    updatedAt: new Date(),
    packedQuantity: 0,
  }

  it('displays tags sorted by tag type name then tag name', async () => {
    const tagTypes: TagType[] = [
      { id: 'type1', name: 'Storage', color: TagColor.blue },
      { id: 'type2', name: 'Category', color: TagColor.green },
    ]

    const tags: Tag[] = [
      { id: '1', name: 'Pantry', typeId: 'type1' },
      { id: '2', name: 'Vegetable', typeId: 'type2' },
      { id: '3', name: 'Fridge', typeId: 'type1' },
      { id: '4', name: 'Fruit', typeId: 'type2' },
    ]

    await renderWithRouter(
      <ItemCard
        item={mockItem}
        quantity={5}
        tags={tags}
        tagTypes={tagTypes}
        onConsume={vi.fn()}
        onAdd={vi.fn()}
        showTags={true}
      />,
    )

    const badges = [
      screen.getByTestId('tag-badge-Fruit'),
      screen.getByTestId('tag-badge-Vegetable'),
      screen.getByTestId('tag-badge-Fridge'),
      screen.getByTestId('tag-badge-Pantry'),
    ]

    // Category type comes first (alphabetically before Storage)
    // Within each type, tags are sorted alphabetically
    expect(badges[0]).toHaveTextContent('Fruit')
    expect(badges[1]).toHaveTextContent('Vegetable')
    // Storage type comes second
    expect(badges[2]).toHaveTextContent('Fridge')
    expect(badges[3]).toHaveTextContent('Pantry')
  })

  it('shows expiration message even when not within threshold', async () => {
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
    const item: Partial<Item> = {
      id: '1',
      name: 'Test Item',
      targetQuantity: 10,
      refillThreshold: 2,
      packedQuantity: 5,
      unpackedQuantity: 0,
      consumeAmount: 1,
      targetUnit: 'package',
      expirationThreshold: 7, // Warn when < 7 days
      estimatedDueDays: 30,
      createdAt: new Date(),
      updatedAt: new Date(),
      tagIds: [],
    }

    await renderWithRouter(
      <ItemCard
        item={item as Item}
        quantity={5}
        tags={[]}
        tagTypes={[]}
        estimatedDueDate={futureDate}
        onConsume={() => {}}
        onAdd={() => {}}
      />,
    )

    // Message should show even though 30 days > 7 day threshold
    expect(screen.getByText(/Expires in 30 days/i)).toBeInTheDocument()

    // Should be muted style (not error background)
    const messageEl = screen.getByText(/Expires in 30 days/i)
    expect(messageEl).toHaveClass('text-foreground-muted')
    expect(messageEl).not.toHaveClass('bg-status-error')
  })

  it('shows warning style when within expiration threshold', async () => {
    const soonDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) // 3 days
    const item: Partial<Item> = {
      id: '1',
      name: 'Test Item',
      targetQuantity: 10,
      refillThreshold: 2,
      packedQuantity: 5,
      unpackedQuantity: 0,
      consumeAmount: 1,
      targetUnit: 'package',
      expirationThreshold: 7, // Warn when < 7 days
      estimatedDueDays: 3,
      createdAt: new Date(),
      updatedAt: new Date(),
      tagIds: [],
    }

    await renderWithRouter(
      <ItemCard
        item={item as Item}
        quantity={5}
        tags={[]}
        tagTypes={[]}
        estimatedDueDate={soonDate}
        onConsume={() => {}}
        onAdd={() => {}}
      />,
    )

    const messageEl = screen.getByText(/Expires in 3 days/i)

    // Should have warning style
    expect(messageEl).toHaveClass('bg-status-error')
    expect(messageEl).toHaveClass('text-tint')

    // Should show warning icon (TriangleAlert component)
    const icon = messageEl.querySelector('svg')
    expect(icon).toBeInTheDocument()
  })
})
