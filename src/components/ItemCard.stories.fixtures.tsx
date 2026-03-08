// src/components/ItemCard.stories.fixtures.tsx
import type { Decorator } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { useState } from 'react'
import type { Item, Recipe, Vendor } from '@/types'
import { TagColor } from '@/types'

// Shared mock data and Storybook decorator for ItemCard story files.

const createStoryRouter = (storyComponent: React.ComponentType) => {
  const rootRoute = createRootRoute({
    component: storyComponent as () => React.ReactNode,
  })
  return createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
}

const queryClient = new QueryClient()

export function RouterWrapper({ children }: { children: React.ReactNode }) {
  const [router] = useState(() => createStoryRouter(() => <>{children}</>))
  return <RouterProvider router={router} />
}

export const sharedDecorator: Decorator = (Story) => (
  <QueryClientProvider client={queryClient}>
    <RouterWrapper>
      <div className="max-w-md">
        <Story />
      </div>
    </RouterWrapper>
  </QueryClientProvider>
)

export const mockItem: Item = {
  id: '1',
  name: 'Yogurt (plain)',
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

export const mockDualUnitItem: Item = {
  id: '2',
  name: 'Purple grapes',
  packageUnit: 'bottle',
  measurementUnit: 'L',
  amountPerPackage: 1,
  targetUnit: 'measurement' as const,
  targetQuantity: 2,
  refillThreshold: 0.5,
  packedQuantity: 1,
  unpackedQuantity: 0.7,
  consumeAmount: 0.25,
  tagIds: [],
  createdAt: new Date(),
  updatedAt: new Date(),
}

export const mockTags = [{ id: 'tag-1', name: 'Dairy', typeId: 'type-1' }]

export const mockTagTypes = [
  { id: 'type-1', name: 'Category', color: TagColor.blue },
]

export const mockMultipleTags = [
  { id: 'tag-1', name: 'Dairy', typeId: 'type-1' },
  { id: 'tag-2', name: 'Organic', typeId: 'type-2' },
  { id: 'tag-3', name: 'Local', typeId: 'type-3' },
  { id: 'tag-4', name: 'Sale', typeId: 'type-4' },
]

export const mockMultipleTagTypes = [
  { id: 'type-1', name: 'Category', color: TagColor.blue },
  { id: 'type-2', name: 'Quality', color: TagColor.green },
  { id: 'type-3', name: 'Source', color: TagColor.amber },
  { id: 'type-4', name: 'Price', color: TagColor.red },
]

export const mockVendors: Vendor[] = [
  { id: 'v1', name: 'Costco', createdAt: new Date() },
  { id: 'v2', name: 'Safeway', createdAt: new Date() },
]

export const mockRecipes: Recipe[] = [
  {
    id: 'r1',
    name: 'Pancakes',
    items: [{ itemId: '1', defaultAmount: 2 }],
    createdAt: new Date(),
    updatedAt: new Date(),
  },
]
