import type { Meta, StoryObj } from '@storybook/react'
import { ShelfList } from './ShelfList'

const meta: Meta<typeof ShelfList> = {
  title: 'Components/Shelf/ShelfList',
  component: ShelfList,
  parameters: {
    layout: 'padded',
  },
  args: {
    onShelfClick: () => {},
    onReorder: () => {},
    getItemCount: () => 3,
  },
}

export default meta
type Story = StoryObj<typeof ShelfList>

const mockShelves = [
  {
    id: 'shelf-1',
    name: 'dairy',
    type: 'filter' as const,
    order: 0,
    filterConfig: { tagIds: ['tag-1'] },
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  },
  {
    id: 'shelf-2',
    name: 'snacks',
    type: 'filter' as const,
    order: 1,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  },
  {
    id: 'shelf-3',
    name: 'favorites',
    type: 'selection' as const,
    order: 2,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  },
]

export const ThreeShelves: Story = {
  args: {
    shelves: mockShelves,
    getItemCount: (id: string) => {
      const counts: Record<string, number> = {
        'shelf-1': 8,
        'shelf-2': 4,
        'shelf-3': 2,
      }
      return counts[id] ?? 0
    },
    getFilterSummary: (shelf) => {
      if (shelf.id === 'shelf-1') return 'Dairy'
      return undefined
    },
  },
}

export const EmptyList: Story = {
  args: {
    shelves: [],
  },
}
