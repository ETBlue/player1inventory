import type { Meta, StoryObj } from '@storybook/react'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { useState } from 'react'
import { ItemCard } from './ItemCard'

// Create a router that renders an Outlet (which will render our story)
const createStoryRouter = (storyComponent: React.ComponentType) => {
  const rootRoute = createRootRoute({
    component: storyComponent as () => React.ReactNode,
  })

  return createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
}

// Wrapper component that sets up router context
function RouterWrapper({ children }: { children: React.ReactNode }) {
  const [router] = useState(() => createStoryRouter(() => <>{children}</>))

  return <RouterProvider router={router} />
}

const meta: Meta<typeof ItemCard> = {
  title: 'Components/ItemCard',
  component: ItemCard,
  decorators: [
    (Story) => (
      <RouterWrapper>
        <div className="max-w-md">
          <Story />
        </div>
      </RouterWrapper>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof ItemCard>

const mockItem = {
  id: '1',
  name: 'Milk',
  packageUnit: 'gallon',
  targetUnit: 'package' as const,
  tagIds: ['tag-1'],
  targetQuantity: 2,
  refillThreshold: 1,
  packedQuantity: 0,
  unpackedQuantity: 0,
  consumeAmount: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
}

export const Default: Story = {
  args: {
    item: mockItem,
    quantity: 2,
    tags: [{ id: 'tag-1', name: 'Dairy', typeId: 'type-1' }],
    tagTypes: [{ id: 'type-1', name: 'Category', color: '#3b82f6' }],
  },
}

export const LowStock: Story = {
  args: {
    item: mockItem,
    quantity: 0,
    tags: [{ id: 'tag-1', name: 'Dairy', typeId: 'type-1' }],
    tagTypes: [{ id: 'type-1', name: 'Category', color: '#3b82f6' }],
  },
}

export const ExpiringSoon: Story = {
  args: {
    item: mockItem,
    quantity: 1,
    tags: [],
    tagTypes: [],
    estimatedDueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
  },
}

export const MultipleTags: Story = {
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
      { id: 'type-1', name: 'Category', color: 'blue' },
      { id: 'type-2', name: 'Quality', color: 'green' },
      { id: 'type-3', name: 'Source', color: 'amber' },
      { id: 'type-4', name: 'Price', color: 'red' },
    ],
  },
}

export const StatusOK: Story = {
  args: {
    item: mockItem,
    quantity: 2,
    tags: [{ id: 'tag-1', name: 'Dairy', typeId: 'type-1' }],
    tagTypes: [{ id: 'type-1', name: 'Category', color: 'teal' }],
  },
}

export const StatusWarning: Story = {
  args: {
    item: mockItem,
    quantity: 1, // equals refillThreshold
    tags: [{ id: 'tag-1', name: 'Dairy', typeId: 'type-1' }],
    tagTypes: [{ id: 'type-1', name: 'Category', color: 'teal' }],
  },
}

export const StatusError: Story = {
  args: {
    item: mockItem,
    quantity: 0, // below refillThreshold
    tags: [{ id: 'tag-1', name: 'Dairy', typeId: 'type-1' }],
    tagTypes: [{ id: 'type-1', name: 'Category', color: 'teal' }],
  },
}

export const TagsHidden: Story = {
  args: {
    ...Default.args,
    showTags: false,
  },
}

export const DualUnitWithPartial: Story = {
  args: {
    item: {
      id: '1',
      name: 'Milk',
      packageUnit: 'bottle',
      measurementUnit: 'L',
      amountPerPackage: 1,
      targetUnit: 'measurement',
      targetQuantity: 2,
      refillThreshold: 0.5,
      packedQuantity: 1,
      unpackedQuantity: 0.7,
      consumeAmount: 0.25,
      tagIds: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    quantity: 1.7,
    tags: [],
    tagTypes: [],
  },
}

export const ExpiringRelativeMode: Story = {
  args: {
    item: {
      ...mockItem,
      packageUnit: 'bottle',
      measurementUnit: 'L',
      amountPerPackage: 1,
      packedQuantity: 1,
      unpackedQuantity: 0.5,
      estimatedDueDays: 2,
    },
    quantity: 1.5,
    tags: [],
    tagTypes: [],
    estimatedDueDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000), // 1 day from now
  },
}

export const InactiveItem: Story = {
  args: {
    item: {
      ...mockItem,
      targetQuantity: 0,
      refillThreshold: 0,
      packedQuantity: 0,
      unpackedQuantity: 0,
    },
    quantity: 0,
    tags: [],
    tagTypes: [],
  },
}

const mockTags = [{ id: 'tag-1', name: 'Dairy', typeId: 'type-1' }]
const mockTagTypes = [{ id: 'type-1', name: 'Category', color: '#3b82f6' }]

export const ShoppingModeNotInCart: Story = {
  name: 'Shopping Mode — Not in cart',
  args: {
    item: mockItem,
    quantity: 1,
    tags: mockTags,
    tagTypes: mockTagTypes,
    mode: 'shopping',
    isChecked: false,
    onCheckboxToggle: () => console.log('Toggle cart'),
  },
}

export const ShoppingModeInCart: Story = {
  name: 'Shopping Mode — In cart',
  args: {
    item: mockItem,
    quantity: 1,
    tags: mockTags,
    tagTypes: mockTagTypes,
    mode: 'shopping',
    isChecked: true,
    controlAmount: 3,
    onCheckboxToggle: () => console.log('Toggle cart'),
    onAmountChange: (delta) => console.log('Amount change:', delta),
  },
}

export const TagAssignment: Story = {
  name: 'Tag Assignment — Checked',
  args: {
    ...Default.args,
    mode: 'tag-assignment',
    isChecked: true,
    onCheckboxToggle: () => console.log('Toggle assignment'),
  },
}

export const TagAssignmentUnchecked: Story = {
  name: 'Tag Assignment — Unchecked',
  args: {
    ...Default.args,
    mode: 'tag-assignment',
    isChecked: false,
    onCheckboxToggle: () => console.log('Toggle assignment'),
  },
}

export const RecipeAssignment: Story = {
  name: 'Recipe Assignment — Assigned',
  args: {
    ...Default.args,
    mode: 'recipe-assignment',
    isChecked: true,
    controlAmount: 2,
    onCheckboxToggle: () => console.log('Toggle assignment'),
    onAmountChange: (delta) => console.log('Amount change:', delta),
  },
}

export const RecipeAssignmentUnchecked: Story = {
  name: 'Recipe Assignment — Unassigned',
  args: {
    ...Default.args,
    mode: 'recipe-assignment',
    isChecked: false,
    onCheckboxToggle: () => console.log('Toggle assignment'),
  },
}
