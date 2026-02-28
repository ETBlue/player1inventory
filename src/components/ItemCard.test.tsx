import { screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test/utils'
import type { Item, Recipe, Tag, TagType, Vendor } from '@/types'
import { DEFAULT_PACKAGE_UNIT, TagColor } from '@/types'
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
        : (item.packageUnit ?? DEFAULT_PACKAGE_UNIT)

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
        : (item.packageUnit ?? DEFAULT_PACKAGE_UNIT)

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
        : (item.packageUnit ?? DEFAULT_PACKAGE_UNIT)

    expect(displayUnit).toBe('pack')
  })

  it('returns default unit when no package unit defined', () => {
    const item: Partial<Item> = {
      targetUnit: 'package',
    }

    const displayUnit =
      item.targetUnit === 'measurement' && item.measurementUnit
        ? item.measurementUnit
        : (item.packageUnit ?? DEFAULT_PACKAGE_UNIT)

    expect(displayUnit).toBe('pack')
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
        tags={tags}
        tagTypes={tagTypes}
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
      estimatedDueDays: 30, // triggers "Expires in X days" display format
      dueDate: futureDate, // fallback used when no last purchase date in test env
      createdAt: new Date(),
      updatedAt: new Date(),
      tagIds: [],
    }

    await renderWithRouter(
      <ItemCard item={item as Item} tags={[]} tagTypes={[]} />,
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
      estimatedDueDays: 3, // triggers "Expires in X days" display format
      dueDate: soonDate, // fallback used when no last purchase date in test env
      createdAt: new Date(),
      updatedAt: new Date(),
      tagIds: [],
    }

    await renderWithRouter(
      <ItemCard item={item as Item} tags={[]} tagTypes={[]} />,
    )

    const messageEl = screen.getByText(/Expires in 3 days/i)

    // Should have warning style
    expect(messageEl).toHaveClass('bg-status-error')
    expect(messageEl).toHaveClass('text-tint')

    // Should show warning icon (TriangleAlert component)
    const icon = messageEl.querySelector('svg')
    expect(icon).toBeInTheDocument()
  })

  it('converts packed quantity to measurement units for display when tracking in measurement', async () => {
    const item: Partial<Item> = {
      id: '1',
      name: 'Olive Oil',
      targetQuantity: 2000, // 2000g target
      refillThreshold: 500,
      packedQuantity: 3, // 3 bottles
      unpackedQuantity: 100, // 100g unpacked
      consumeAmount: 50,
      targetUnit: 'measurement',
      measurementUnit: 'g',
      packageUnit: 'bottle',
      amountPerPackage: 500, // 500g per bottle
      createdAt: new Date(),
      updatedAt: new Date(),
      tagIds: [],
    }

    await renderWithRouter(
      <ItemCard item={item as Item} tags={[]} tagTypes={[]} />,
    )

    // Should show converted packed quantity: 3 bottles × 500g = 1500g
    expect(screen.getByText('1500 (+100)/2000')).toBeInTheDocument()
  })

  it('shows packed quantity as-is when tracking in packages', async () => {
    const item: Partial<Item> = {
      id: '1',
      name: 'Cookies',
      targetQuantity: 10, // 10 packs target
      refillThreshold: 2,
      packedQuantity: 5, // 5 packs
      unpackedQuantity: 0.5, // 0.5 packs unpacked
      consumeAmount: 1,
      targetUnit: 'package',
      packageUnit: 'pack',
      createdAt: new Date(),
      updatedAt: new Date(),
      tagIds: [],
    }

    await renderWithRouter(
      <ItemCard item={item as Item} tags={[]} tagTypes={[]} />,
    )

    // Should show packed quantity without conversion: 5 packs
    expect(screen.getByText('5 (+0.5)/10')).toBeInTheDocument()
  })

  it('shows simple count when unpacked is 0 with measurement tracking', async () => {
    const item: Partial<Item> = {
      id: '1',
      name: 'Milk',
      targetQuantity: 2000, // 2000mL target
      refillThreshold: 500,
      packedQuantity: 2, // 2 bottles
      unpackedQuantity: 0, // No unpacked
      consumeAmount: 250,
      targetUnit: 'measurement',
      measurementUnit: 'mL',
      packageUnit: 'bottle',
      amountPerPackage: 1000, // 1000mL per bottle
      createdAt: new Date(),
      updatedAt: new Date(),
      tagIds: [],
    }

    await renderWithRouter(
      <ItemCard item={item as Item} tags={[]} tagTypes={[]} />,
    )

    // Should show simple count with converted packed: 2000/2000
    expect(screen.getByText('2000/2000')).toBeInTheDocument()
  })
})

describe('ItemCard - Shopping mode', () => {
  const mockItem: Item = {
    id: 'item-1',
    name: 'Milk',
    packageUnit: 'gallon',
    targetUnit: 'package',
    tagIds: [],
    targetQuantity: 4,
    refillThreshold: 1,
    packedQuantity: 1,
    unpackedQuantity: 0,
    consumeAmount: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  it('shows unchecked checkbox when not in cart (shopping mode)', async () => {
    await renderWithRouter(
      <ItemCard
        item={mockItem}
        tags={[]}
        tagTypes={[]}
        mode="shopping"
        isChecked={false}
        onCheckboxToggle={vi.fn()}
      />,
    )

    const checkbox = screen.getByRole('checkbox', {
      name: /Add Milk/i,
    })
    expect(checkbox).not.toBeChecked()
  })

  it('shows checked checkbox when item is in cart (shopping mode)', async () => {
    await renderWithRouter(
      <ItemCard
        item={mockItem}
        tags={[]}
        tagTypes={[]}
        mode="shopping"
        isChecked={true}
        onCheckboxToggle={vi.fn()}
        controlAmount={2}
        onAmountChange={vi.fn()}
      />,
    )

    const checkbox = screen.getByRole('checkbox', {
      name: /Remove Milk/i,
    })
    expect(checkbox).toBeChecked()
  })

  it('shows stepper with quantity when item is in cart (shopping mode)', async () => {
    await renderWithRouter(
      <ItemCard
        item={mockItem}
        tags={[]}
        tagTypes={[]}
        mode="shopping"
        isChecked={true}
        onCheckboxToggle={vi.fn()}
        controlAmount={2}
        onAmountChange={vi.fn()}
      />,
    )

    expect(screen.getByText('2')).toBeInTheDocument() // cart quantity
    expect(
      screen.getByRole('button', { name: /Decrease quantity of Milk/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Increase quantity of Milk/i }),
    ).toBeInTheDocument()
  })

  it('calls onCheckboxToggle when checkbox is clicked', async () => {
    const user = userEvent.setup()
    const onCheckboxToggle = vi.fn()

    await renderWithRouter(
      <ItemCard
        item={mockItem}
        tags={[]}
        tagTypes={[]}
        mode="shopping"
        isChecked={false}
        onCheckboxToggle={onCheckboxToggle}
      />,
    )

    await user.click(screen.getByRole('checkbox'))
    expect(onCheckboxToggle).toHaveBeenCalledOnce()
  })

  it('calls onAmountChange with +1 when + clicked', async () => {
    const user = userEvent.setup()
    const onAmountChange = vi.fn()

    await renderWithRouter(
      <ItemCard
        item={mockItem}
        tags={[]}
        tagTypes={[]}
        mode="shopping"
        isChecked={true}
        onCheckboxToggle={vi.fn()}
        controlAmount={2}
        onAmountChange={onAmountChange}
      />,
    )

    await user.click(
      screen.getByRole('button', { name: /Increase quantity of Milk/i }),
    )
    expect(onAmountChange).toHaveBeenCalledWith(1)
  })

  it('- button is disabled at quantity 1 when minControlAmount=1 (shopping mode)', async () => {
    await renderWithRouter(
      <ItemCard
        item={mockItem}
        tags={[]}
        tagTypes={[]}
        mode="shopping"
        isChecked={true}
        onCheckboxToggle={vi.fn()}
        controlAmount={1}
        minControlAmount={1}
        onAmountChange={vi.fn()}
      />,
    )

    const minusBtn = screen.getByRole('button', {
      name: /Decrease quantity of Milk/i,
    })
    expect(minusBtn).toBeDisabled()
  })

  it('does not show checkbox in pantry mode (default)', async () => {
    await renderWithRouter(<ItemCard item={mockItem} tags={[]} tagTypes={[]} />)

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })
})

describe('ItemCard - vendor and recipe display', () => {
  const mockItem: Item = {
    id: 'item-1',
    name: 'Milk',
    tagIds: ['t1'],
    vendorIds: ['v1'],
    targetUnit: 'package',
    packageUnit: 'gallon',
    targetQuantity: 4,
    refillThreshold: 1,
    packedQuantity: 2,
    unpackedQuantity: 0,
    consumeAmount: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const mockTags: Tag[] = [{ id: 't1', name: 'Dairy', typeId: 'type1' }]
  const mockTagTypes: TagType[] = [
    { id: 'type1', name: 'Category', color: TagColor.blue },
  ]
  const mockVendors: Vendor[] = [
    { id: 'v1', name: 'Costco', createdAt: new Date() },
  ]
  const mockRecipes: Recipe[] = [
    {
      id: 'r1',
      name: 'Pancakes',
      items: [{ itemId: 'item-1', defaultAmount: 1 }],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]

  it('shows vendor and recipe counts alongside tag count when collapsed', async () => {
    await renderWithRouter(
      <ItemCard
        item={mockItem}
        tags={mockTags}
        tagTypes={mockTagTypes}
        showTags={false}
        vendors={mockVendors}
        recipes={mockRecipes}
      />,
    )
    expect(screen.getByText('1 tag · 1 vendor · 1 recipe')).toBeInTheDocument()
  })

  it('omits zero-count entries in collapsed state', async () => {
    await renderWithRouter(
      <ItemCard
        item={mockItem}
        tags={mockTags}
        tagTypes={mockTagTypes}
        showTags={false}
        vendors={[]}
        recipes={mockRecipes}
      />,
    )
    expect(screen.queryByText(/vendor/i)).not.toBeInTheDocument()
    expect(screen.getByText('1 tag · 1 recipe')).toBeInTheDocument()
  })

  it('shows vendor badges when expanded', async () => {
    await renderWithRouter(
      <ItemCard
        item={mockItem}
        tags={mockTags}
        tagTypes={mockTagTypes}
        showTags={true}
        vendors={mockVendors}
        recipes={[]}
      />,
    )
    expect(screen.getByTestId('vendor-badge-Costco')).toBeInTheDocument()
  })

  it('shows recipe badges when expanded', async () => {
    await renderWithRouter(
      <ItemCard
        item={mockItem}
        tags={mockTags}
        tagTypes={mockTagTypes}
        showTags={true}
        vendors={[]}
        recipes={mockRecipes}
      />,
    )
    expect(screen.getByTestId('recipe-badge-Pancakes')).toBeInTheDocument()
  })

  it('calls onVendorClick with vendorId when vendor badge is clicked', async () => {
    const user = userEvent.setup()
    const onVendorClick = vi.fn()

    await renderWithRouter(
      <ItemCard
        item={mockItem}
        tags={mockTags}
        tagTypes={mockTagTypes}
        showTags={true}
        vendors={mockVendors}
        onVendorClick={onVendorClick}
      />,
    )

    await user.click(screen.getByTestId('vendor-badge-Costco'))
    expect(onVendorClick).toHaveBeenCalledWith('v1')
  })

  it('calls onRecipeClick with recipeId when recipe badge is clicked', async () => {
    const user = userEvent.setup()
    const onRecipeClick = vi.fn()

    await renderWithRouter(
      <ItemCard
        item={mockItem}
        tags={mockTags}
        tagTypes={mockTagTypes}
        showTags={true}
        recipes={mockRecipes}
        onRecipeClick={onRecipeClick}
      />,
    )

    await user.click(screen.getByTestId('recipe-badge-Pancakes'))
    expect(onRecipeClick).toHaveBeenCalledWith('r1')
  })

  it('hides vendor and recipe badges in shopping mode', async () => {
    const mockVendors: Vendor[] = [
      { id: 'v1', name: 'Costco', createdAt: new Date() },
    ]
    const mockRecipes: Recipe[] = [
      {
        id: 'r1',
        name: 'Pancakes',
        items: [{ itemId: 'item-1', defaultAmount: 1 }],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]

    await renderWithRouter(
      <ItemCard
        item={{
          id: 'item-1',
          name: 'Milk',
          tagIds: [],
          targetUnit: 'package',
          targetQuantity: 4,
          refillThreshold: 1,
          packedQuantity: 2,
          unpackedQuantity: 0,
          consumeAmount: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        }}
        tags={[]}
        tagTypes={[]}
        showTags={true}
        mode="shopping"
        vendors={mockVendors}
        recipes={mockRecipes}
      />,
    )
    expect(screen.queryByTestId('vendor-badge-Costco')).not.toBeInTheDocument()
    expect(
      screen.queryByTestId('recipe-badge-Pancakes'),
    ).not.toBeInTheDocument()
  })
})

describe('ItemCard - Cooking mode', () => {
  const mockItem: Item = {
    id: 'item-1',
    name: 'Flour',
    packageUnit: 'kg',
    targetUnit: 'package',
    tagIds: ['t1'],
    targetQuantity: 5,
    refillThreshold: 1,
    packedQuantity: 3,
    unpackedQuantity: 0,
    consumeAmount: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const mockTags: Tag[] = [{ id: 't1', name: 'Baking', typeId: 'type1' }]
  const mockTagTypes: TagType[] = [
    { id: 'type1', name: 'Category', color: TagColor.blue },
  ]

  it('hides tags in cooking mode', async () => {
    await renderWithRouter(
      <ItemCard
        item={mockItem}
        tags={mockTags}
        tagTypes={mockTagTypes}
        mode="cooking"
        isChecked={true}
        onCheckboxToggle={vi.fn()}
        controlAmount={2}
        onAmountChange={vi.fn()}
      />,
    )
    expect(screen.queryByTestId('tag-badge-Baking')).not.toBeInTheDocument()
  })

  it('shows checkbox when onCheckboxToggle is provided in cooking mode', async () => {
    await renderWithRouter(
      <ItemCard
        item={mockItem}
        tags={[]}
        tagTypes={[]}
        mode="cooking"
        isChecked={false}
        onCheckboxToggle={vi.fn()}
        controlAmount={2}
        onAmountChange={vi.fn()}
      />,
    )
    expect(
      screen.getByRole('checkbox', { name: /Add Flour/i }),
    ).toBeInTheDocument()
  })

  it('shows amount stepper when checked in cooking mode', async () => {
    await renderWithRouter(
      <ItemCard
        item={mockItem}
        tags={[]}
        tagTypes={[]}
        mode="cooking"
        isChecked={true}
        onCheckboxToggle={vi.fn()}
        controlAmount={4}
        onAmountChange={vi.fn()}
      />,
    )
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Increase quantity of Flour/i }),
    ).toBeInTheDocument()
  })

  it('minus button is disabled at amount 0 (default minControlAmount=0)', async () => {
    await renderWithRouter(
      <ItemCard
        item={mockItem}
        tags={[]}
        tagTypes={[]}
        mode="cooking"
        isChecked={true}
        onCheckboxToggle={vi.fn()}
        controlAmount={0}
        onAmountChange={vi.fn()}
      />,
    )
    const minusBtn = screen.getByRole('button', {
      name: /Decrease quantity of Flour/i,
    })
    expect(minusBtn).toBeDisabled()
  })

  it('minus button is enabled at amount 1 with default minControlAmount=0', async () => {
    await renderWithRouter(
      <ItemCard
        item={mockItem}
        tags={[]}
        tagTypes={[]}
        mode="cooking"
        isChecked={true}
        onCheckboxToggle={vi.fn()}
        controlAmount={1}
        onAmountChange={vi.fn()}
      />,
    )
    const minusBtn = screen.getByRole('button', {
      name: /Decrease quantity of Flour/i,
    })
    expect(minusBtn).not.toBeDisabled()
  })
})
