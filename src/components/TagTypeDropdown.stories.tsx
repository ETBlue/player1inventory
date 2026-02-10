import type { Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TagColor } from '@/types'
import { TagTypeDropdown } from './TagTypeDropdown'

const queryClient = new QueryClient()

const meta: Meta<typeof TagTypeDropdown> = {
  title: 'Components/TagTypeDropdown',
  component: TagTypeDropdown,
  decorators: [
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <Story />
      </QueryClientProvider>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof TagTypeDropdown>

export const Default: Story = {
  args: {
    tagType: { id: 'type-1', name: 'Category', color: TagColor.teal },
    tags: [
      { id: 'tag-1', name: 'Dairy', typeId: 'type-1' },
      { id: 'tag-2', name: 'Produce', typeId: 'type-1' },
      { id: 'tag-3', name: 'Meat', typeId: 'type-1' },
    ],
    selectedTagIds: [],
    tagCounts: [5, 3, 2],
    onToggleTag: (tagId) => console.log('Toggle tag:', tagId),
    onClear: () => console.log('Clear selections'),
  },
}

export const WithSelections: Story = {
  args: {
    tagType: { id: 'type-1', name: 'Category', color: TagColor.blue },
    tags: [
      { id: 'tag-1', name: 'Dairy', typeId: 'type-1' },
      { id: 'tag-2', name: 'Produce', typeId: 'type-1' },
      { id: 'tag-3', name: 'Meat', typeId: 'type-1' },
      { id: 'tag-4', name: 'Bakery', typeId: 'type-1' },
    ],
    selectedTagIds: ['tag-1', 'tag-3'],
    tagCounts: [5, 3, 2, 4],
    onToggleTag: (tagId) => console.log('Toggle tag:', tagId),
    onClear: () => console.log('Clear selections'),
  },
}

export const MultipleTagsWithCounts: Story = {
  args: {
    tagType: { id: 'type-2', name: 'Store', color: TagColor.purple },
    tags: [
      { id: 'tag-5', name: 'Whole Foods', typeId: 'type-2' },
      { id: 'tag-6', name: "Trader Joe's", typeId: 'type-2' },
      { id: 'tag-7', name: 'Costco', typeId: 'type-2' },
      { id: 'tag-8', name: 'Local Market', typeId: 'type-2' },
      { id: 'tag-9', name: 'Online', typeId: 'type-2' },
    ],
    selectedTagIds: ['tag-6'],
    tagCounts: [12, 8, 15, 3, 5],
    onToggleTag: (tagId) => console.log('Toggle tag:', tagId),
    onClear: () => console.log('Clear selections'),
  },
}

export const EmptyState: Story = {
  args: {
    tagType: { id: 'type-3', name: 'Brand', color: TagColor.orange },
    tags: [
      { id: 'tag-10', name: 'Organic Valley', typeId: 'type-3' },
      { id: 'tag-11', name: 'Horizon', typeId: 'type-3' },
    ],
    selectedTagIds: [],
    tagCounts: [0, 0],
    onToggleTag: (tagId) => console.log('Toggle tag:', tagId),
    onClear: () => console.log('Clear selections'),
  },
}
