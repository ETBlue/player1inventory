import type { Meta, StoryObj } from '@storybook/react'
import { ShelfCard } from './ShelfCard'

const meta: Meta<typeof ShelfCard> = {
  title: 'Components/Shelf/ShelfCard',
  component: ShelfCard,
  parameters: {
    layout: 'padded',
  },
  args: {
    onClick: () => {},
  },
}

export default meta
type Story = StoryObj<typeof ShelfCard>

const baseShelf = {
  id: 'shelf-1',
  name: 'dairy',
  type: 'filter' as const,
  order: 0,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
}

export const FilterShelf: Story = {
  args: {
    shelf: {
      ...baseShelf,
      type: 'filter',
      filterConfig: {
        tagIds: ['tag-1'],
        vendorIds: ['vendor-1'],
      },
    },
    itemCount: 5,
    filterSummary: 'Dairy · Costco',
  },
}

export const SelectionShelf: Story = {
  args: {
    shelf: {
      ...baseShelf,
      id: 'shelf-2',
      name: 'favorites',
      type: 'selection',
      order: 1,
    },
    itemCount: 3,
  },
}

export const EmptyShelf: Story = {
  args: {
    shelf: {
      ...baseShelf,
      id: 'shelf-3',
      name: 'snacks',
      type: 'filter',
      order: 2,
    },
    itemCount: 0,
  },
}

export const ManyItems: Story = {
  args: {
    shelf: {
      ...baseShelf,
      id: 'shelf-4',
      name: 'beverages',
      type: 'selection',
      order: 3,
    },
    itemCount: 7,
  },
}

export const WithOutOfStock: Story = {
  args: {
    shelf: {
      ...baseShelf,
      id: 'shelf-5',
      name: 'pantry',
      type: 'filter',
      order: 4,
    },
    itemCount: 10,
    outOfStockCount: 3,
  },
}

export const WithLowStock: Story = {
  args: {
    shelf: {
      ...baseShelf,
      id: 'shelf-6',
      name: 'freezer',
      type: 'filter',
      order: 5,
    },
    itemCount: 8,
    lowStockCount: 2,
  },
}

export const WithBothStockStatuses: Story = {
  args: {
    shelf: {
      ...baseShelf,
      id: 'shelf-7',
      name: 'fridge',
      type: 'selection',
      order: 6,
    },
    itemCount: 12,
    outOfStockCount: 1,
    lowStockCount: 4,
  },
}

export const AllActiveItems: Story = {
  args: {
    shelf: {
      ...baseShelf,
      id: 'shelf-8',
      name: 'pantry staples',
      type: 'selection',
      order: 7,
    },
    itemCount: 3,
    activeCount: 3,
    inactiveCount: 0,
  },
}

export const WithInactiveItems: Story = {
  args: {
    shelf: {
      ...baseShelf,
      id: 'shelf-9',
      name: 'archived items',
      type: 'selection',
      order: 8,
    },
    itemCount: 5,
    activeCount: 3,
    inactiveCount: 2,
  },
}
