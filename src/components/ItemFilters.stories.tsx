import type { Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TagColor } from '@/types'
import { ItemFilters } from './ItemFilters'

const queryClient = new QueryClient()

const meta: Meta<typeof ItemFilters> = {
  title: 'Components/ItemFilters',
  component: ItemFilters,
  decorators: [
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <Story />
      </QueryClientProvider>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof ItemFilters>

// Mock data
const mockTagTypes = [
  { id: 'type-1', name: 'Category', color: TagColor.teal },
  { id: 'type-2', name: 'Store', color: TagColor.purple },
  { id: 'type-3', name: 'Brand', color: TagColor.orange },
]

const mockTags = [
  { id: 'tag-1', name: 'Dairy', typeId: 'type-1' },
  { id: 'tag-2', name: 'Produce', typeId: 'type-1' },
  { id: 'tag-3', name: 'Meat', typeId: 'type-1' },
  { id: 'tag-4', name: 'Whole Foods', typeId: 'type-2' },
  { id: 'tag-5', name: "Trader Joe's", typeId: 'type-2' },
  { id: 'tag-6', name: 'Organic Valley', typeId: 'type-3' },
  { id: 'tag-7', name: 'Horizon', typeId: 'type-3' },
]

const mockItems = [
  {
    id: 'item-1',
    name: 'Milk',
    tagIds: ['tag-1', 'tag-4', 'tag-6'],
    targetQuantity: 2,
    refillThreshold: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'item-2',
    name: 'Cheese',
    tagIds: ['tag-1', 'tag-5'],
    targetQuantity: 1,
    refillThreshold: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'item-3',
    name: 'Apples',
    tagIds: ['tag-2', 'tag-4'],
    targetQuantity: 5,
    refillThreshold: 2,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'item-4',
    name: 'Chicken',
    tagIds: ['tag-3', 'tag-4'],
    targetQuantity: 3,
    refillThreshold: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'item-5',
    name: 'Yogurt',
    tagIds: ['tag-1', 'tag-5', 'tag-7'],
    targetQuantity: 4,
    refillThreshold: 2,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
]

export const Default: Story = {
  args: {
    tagTypes: mockTagTypes,
    tags: mockTags,
    items: mockItems,
    filterState: {},
    filteredCount: 5,
    totalCount: 5,
    onFilterChange: (newState) => console.log('Filter changed:', newState),
  },
}

export const WithActiveFilters: Story = {
  args: {
    tagTypes: mockTagTypes,
    tags: mockTags,
    items: mockItems,
    filterState: {
      'type-1': ['tag-1'], // Dairy selected
      'type-2': ['tag-4'], // Whole Foods selected
    },
    filteredCount: 2,
    totalCount: 5,
    onFilterChange: (newState) => console.log('Filter changed:', newState),
  },
}

export const NoTagTypes: Story = {
  args: {
    tagTypes: [],
    tags: [],
    items: mockItems,
    filterState: {},
    filteredCount: 5,
    totalCount: 5,
    onFilterChange: (newState) => console.log('Filter changed:', newState),
  },
}

export const MultipleTagTypes: Story = {
  args: {
    tagTypes: [
      { id: 'type-1', name: 'Category', color: TagColor.teal },
      { id: 'type-2', name: 'Store', color: TagColor.purple },
      { id: 'type-3', name: 'Brand', color: TagColor.orange },
      { id: 'type-4', name: 'Dietary', color: TagColor.green },
    ],
    tags: [
      ...mockTags,
      { id: 'tag-8', name: 'Organic', typeId: 'type-4' },
      { id: 'tag-9', name: 'Gluten-Free', typeId: 'type-4' },
      { id: 'tag-10', name: 'Vegan', typeId: 'type-4' },
    ],
    items: mockItems,
    filterState: {
      'type-1': ['tag-1', 'tag-2'], // Dairy and Produce selected
    },
    filteredCount: 3,
    totalCount: 5,
    onFilterChange: (newState) => console.log('Filter changed:', newState),
  },
}
