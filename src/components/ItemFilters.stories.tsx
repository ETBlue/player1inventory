import type { Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { useState } from 'react'
import type { Item } from '@/types'
import { ItemFilters } from './ItemFilters'

const queryClient = new QueryClient()

const createStoryRouter = (storyComponent: React.ComponentType) => {
  const rootRoute = createRootRoute({
    component: storyComponent as () => React.ReactNode,
  })

  return createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
}

function RouterWrapper({ children }: { children: React.ReactNode }) {
  const [router] = useState(() => createStoryRouter(() => <>{children}</>))
  return <RouterProvider router={router} />
}

const meta: Meta<typeof ItemFilters> = {
  title: 'Components/ItemFilters',
  component: ItemFilters,
  decorators: [
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <RouterWrapper>
          <Story />
        </RouterWrapper>
      </QueryClientProvider>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof ItemFilters>

const mockItems: Item[] = [
  {
    id: 'item-1',
    name: 'Milk',
    tagIds: ['tag-1', 'tag-4', 'tag-6'],
    vendorIds: [],
    targetUnit: 'package',
    targetQuantity: 2,
    refillThreshold: 1,
    packedQuantity: 1,
    unpackedQuantity: 0,
    consumeAmount: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'item-2',
    name: 'Cheese',
    tagIds: ['tag-1', 'tag-5'],
    vendorIds: [],
    targetUnit: 'package',
    targetQuantity: 1,
    refillThreshold: 0,
    packedQuantity: 0,
    unpackedQuantity: 0,
    consumeAmount: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'item-3',
    name: 'Apples',
    tagIds: ['tag-2', 'tag-4'],
    vendorIds: [],
    targetUnit: 'package',
    targetQuantity: 5,
    refillThreshold: 2,
    packedQuantity: 3,
    unpackedQuantity: 0,
    consumeAmount: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
]

// Note: ItemFilters fetches its own tag data via hooks.
// In Storybook, tags/tagTypes will be empty (no real database),
// so the component renders null (no tag types with tags).
// Use integration tests or the full app for filter interaction testing.

export const Default: Story = {
  render: () => <ItemFilters items={mockItems} />,
}

export const EmptyItems: Story = {
  render: () => <ItemFilters items={[]} />,
}

export const Disabled: Story = {
  render: () => <ItemFilters items={mockItems} disabled />,
}
