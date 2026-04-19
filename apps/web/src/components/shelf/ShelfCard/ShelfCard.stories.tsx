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
