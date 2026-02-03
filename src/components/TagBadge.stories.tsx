import type { Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TagBadge } from './TagBadge'

const queryClient = new QueryClient()

const meta: Meta<typeof TagBadge> = {
  title: 'Components/TagBadge',
  component: TagBadge,
  decorators: [
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <Story />
      </QueryClientProvider>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof TagBadge>

export const Default: Story = {
  args: {
    tag: { id: '1', name: 'Dairy', typeId: 'type-1' },
    tagType: { id: 'type-1', name: 'Category', color: '#3b82f6' },
    onClick: () => console.log('Clicked!'),
  },
}

export const DifferentColors: Story = {
  render: () => (
    <div className="flex gap-2">
      <TagBadge
        tag={{ id: '1', name: 'Frozen', typeId: 'type-1' }}
        tagType={{ id: 'type-1', name: 'Storage', color: '#22c55e' }}
        onClick={() => {}}
      />
      <TagBadge
        tag={{ id: '2', name: 'Produce', typeId: 'type-2' }}
        tagType={{ id: 'type-2', name: 'Category', color: '#f59e0b' }}
        onClick={() => {}}
      />
      <TagBadge
        tag={{ id: '3', name: 'Organic', typeId: 'type-3' }}
        tagType={{ id: 'type-3', name: 'Quality', color: '#8b5cf6' }}
        onClick={() => {}}
      />
    </div>
  ),
}
