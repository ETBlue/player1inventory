import type { Decorator, Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { useState } from 'react'
import type { Item, Shelf } from '@/types'
import { PantryShelfCard } from './PantryShelfCard'

function RouterWrapper({ children }: { children: React.ReactNode }) {
  const rootRoute = createRootRoute({
    component: () => <>{children}</>,
  })
  const [router] = useState(() =>
    createRouter({
      routeTree: rootRoute,
      history: createMemoryHistory({ initialEntries: ['/'] }),
    }),
  )
  return <RouterProvider router={router} />
}

const queryClient = new QueryClient()

const sharedDecorator: Decorator = (Story) => (
  <QueryClientProvider client={queryClient}>
    <RouterWrapper>
      <div className="max-w-md p-4">
        <Story />
      </div>
    </RouterWrapper>
  </QueryClientProvider>
)

const meta: Meta<typeof PantryShelfCard> = {
  title: 'Components/Pantry/PantryShelfCard',
  component: PantryShelfCard,
  parameters: {
    layout: 'padded',
  },
  decorators: [sharedDecorator],
  args: {
    onToggle: () => {},
  },
}

export default meta
type Story = StoryObj<typeof PantryShelfCard>

const baseShelf: Shelf = {
  id: 'shelf-1',
  name: 'dairy',
  type: 'filter',
  order: 0,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
}

const makeItem = (
  overrides: Partial<Item> & { id: string; name: string },
): Item => ({
  tagIds: [],
  targetUnit: 'package',
  targetQuantity: 4,
  refillThreshold: 1,
  packedQuantity: 3,
  unpackedQuantity: 0,
  consumeAmount: 1,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
})

const wellStockedItems: Item[] = [
  makeItem({ id: 'item-1', name: 'yogurt', packedQuantity: 3 }),
  makeItem({ id: 'item-2', name: 'butter', packedQuantity: 2 }),
  makeItem({ id: 'item-3', name: 'cheese', packedQuantity: 4 }),
]

const lowStockItem = makeItem({
  id: 'item-low',
  name: 'milk',
  packedQuantity: 1,
  refillThreshold: 1,
})

const outOfStockItem = makeItem({
  id: 'item-out',
  name: 'cream',
  packedQuantity: 0,
  unpackedQuantity: 0,
})

export const Collapsed: Story = {
  args: {
    shelf: baseShelf,
    items: wellStockedItems,
    isExpanded: false,
  },
}

export const CollapsedWithLowStock: Story = {
  args: {
    shelf: baseShelf,
    items: [...wellStockedItems, lowStockItem],
    isExpanded: false,
  },
}

export const CollapsedWithOutOfStock: Story = {
  args: {
    shelf: baseShelf,
    items: [...wellStockedItems, outOfStockItem],
    isExpanded: false,
  },
}

export const CollapsedWithBoth: Story = {
  args: {
    shelf: baseShelf,
    items: [...wellStockedItems, lowStockItem, outOfStockItem],
    isExpanded: false,
  },
}

export const Expanded: Story = {
  args: {
    shelf: baseShelf,
    items: wellStockedItems,
    isExpanded: true,
  },
}

export const SystemShelf: Story = {
  args: {
    shelf: {
      ...baseShelf,
      id: 'shelf-system',
      name: 'unsorted',
      type: 'system',
    },
    items: wellStockedItems,
    isExpanded: false,
  },
}
