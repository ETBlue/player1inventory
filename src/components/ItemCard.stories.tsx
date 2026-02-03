import type { Meta, StoryObj } from '@storybook/react'
import { ItemCard } from './ItemCard'

// Simple wrapper that mocks Link behavior for Storybook
// The Link in ItemCard will still work (navigates nowhere in Storybook)
const meta: Meta<typeof ItemCard> = {
  title: 'Components/ItemCard',
  component: ItemCard,
  decorators: [
    (Story) => (
      <div className="max-w-md">
        <Story />
      </div>
    ),
  ],
  // Provide default args that satisfy required props
  args: {
    onConsume: () => console.log('Consume'),
    onAdd: () => console.log('Add'),
  },
}

export default meta
type Story = StoryObj<typeof ItemCard>

const mockItem = {
  id: '1',
  name: 'Milk',
  unit: 'gallons',
  tagIds: ['tag-1'],
  targetQuantity: 2,
  refillThreshold: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
}

export const Default: Story = {
  render: (args) => <ItemCard {...args} />,
  args: {
    item: mockItem,
    quantity: 2,
    tags: [{ id: 'tag-1', name: 'Dairy', typeId: 'type-1' }],
    tagTypes: [{ id: 'type-1', name: 'Category', color: '#3b82f6' }],
  },
}

export const LowStock: Story = {
  render: (args) => <ItemCard {...args} />,
  args: {
    item: mockItem,
    quantity: 0,
    tags: [{ id: 'tag-1', name: 'Dairy', typeId: 'type-1' }],
    tagTypes: [{ id: 'type-1', name: 'Category', color: '#3b82f6' }],
  },
}

export const ExpiringSoon: Story = {
  render: (args) => <ItemCard {...args} />,
  args: {
    item: mockItem,
    quantity: 1,
    tags: [],
    tagTypes: [],
    estimatedDueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
  },
}

export const MultipleTags: Story = {
  render: (args) => <ItemCard {...args} />,
  args: {
    item: { ...mockItem, tagIds: ['tag-1', 'tag-2', 'tag-3', 'tag-4'] },
    quantity: 2,
    tags: [
      { id: 'tag-1', name: 'Dairy', typeId: 'type-1' },
      { id: 'tag-2', name: 'Organic', typeId: 'type-2' },
      { id: 'tag-3', name: 'Local', typeId: 'type-3' },
      { id: 'tag-4', name: 'Sale', typeId: 'type-4' },
    ],
    tagTypes: [
      { id: 'type-1', name: 'Category', color: '#3b82f6' },
      { id: 'type-2', name: 'Quality', color: '#22c55e' },
      { id: 'type-3', name: 'Source', color: '#f59e0b' },
      { id: 'type-4', name: 'Price', color: '#ef4444' },
    ],
  },
}
