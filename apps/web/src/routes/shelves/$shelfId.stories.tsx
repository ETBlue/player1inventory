import { ApolloProvider } from '@apollo/client/react'
import type { Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { db } from '@/db'
import { createItem, createShelf } from '@/db/operations'
import { routeTree } from '@/routeTree.gen'
import { noopApolloClient } from '@/test/apolloStub'

const meta = {
  title: 'Pages/Shelf/Detail',
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function ShelfDetailStory({
  setup,
  initialUrl,
}: {
  setup: () => Promise<string> // returns the URL to navigate to
  initialUrl?: string
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false } },
      }),
  )
  const [url, setUrl] = useState<string | null>(initialUrl ?? null)

  useEffect(() => {
    async function init() {
      await db.delete()
      await db.open()
      const resolvedUrl = await setup()
      setUrl(resolvedUrl)
    }
    init()
  }, [setup])

  if (!url) return <div>Loading...</div>

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [url] }),
    context: { queryClient },
  })

  return (
    <ApolloProvider client={noopApolloClient}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ApolloProvider>
  )
}

// Story 1: Unsorted shelf — no shelves, a few items
function UnsortedStory() {
  return (
    <ShelfDetailStory
      setup={async () => {
        await createItem({
          name: 'milk',
          tagIds: [],
          vendorIds: [],
          targetUnit: 'package',
          targetQuantity: 2,
          refillThreshold: 1,
          packedQuantity: 1,
          unpackedQuantity: 0,
          consumeAmount: 1,
        })
        await createItem({
          name: 'eggs',
          tagIds: [],
          vendorIds: [],
          targetUnit: 'package',
          targetQuantity: 1,
          refillThreshold: 0,
          packedQuantity: 0,
          unpackedQuantity: 0,
          consumeAmount: 1,
        })
        return '/shelves/unsorted'
      }}
    />
  )
}

export const Unsorted: Story = {
  render: () => <UnsortedStory />,
}

// Story 2: Selection shelf with items
function SelectionShelfStory() {
  return (
    <ShelfDetailStory
      setup={async () => {
        const item1 = await createItem({
          name: 'butter',
          tagIds: [],
          vendorIds: [],
          targetUnit: 'package',
          targetQuantity: 2,
          refillThreshold: 1,
          packedQuantity: 1,
          unpackedQuantity: 0,
          consumeAmount: 1,
        })
        const item2 = await createItem({
          name: 'cheese',
          tagIds: [],
          vendorIds: [],
          targetUnit: 'package',
          targetQuantity: 1,
          refillThreshold: 0,
          packedQuantity: 1,
          unpackedQuantity: 0,
          consumeAmount: 1,
        })
        const shelf = await createShelf({
          name: 'dairy',
          type: 'selection',
          order: 0,
          itemIds: [item1.id, item2.id],
        })
        return `/shelves/${shelf.id}`
      }}
    />
  )
}

export const SelectionShelf: Story = {
  render: () => <SelectionShelfStory />,
}

// Story 3: Filter shelf
function FilterShelfStory() {
  return (
    <ShelfDetailStory
      setup={async () => {
        await createItem({
          name: 'yogurt',
          tagIds: [],
          vendorIds: [],
          targetUnit: 'package',
          targetQuantity: 3,
          refillThreshold: 1,
          packedQuantity: 2,
          unpackedQuantity: 0,
          consumeAmount: 1,
        })
        const shelf = await createShelf({
          name: 'low stock',
          type: 'filter',
          order: 0,
          filterConfig: {
            tagIds: [],
            vendorIds: [],
            recipeIds: [],
            sortBy: 'name',
            sortDir: 'asc',
          },
        })
        return `/shelves/${shelf.id}`
      }}
    />
  )
}

export const FilterShelf: Story = {
  render: () => <FilterShelfStory />,
}

// Story 5: Selection shelf with inactive items pushed to the bottom
function WithInactiveItemsStory() {
  return (
    <ShelfDetailStory
      setup={async () => {
        const item1 = await createItem({
          name: 'active item',
          tagIds: [],
          vendorIds: [],
          targetUnit: 'package',
          targetQuantity: 2,
          refillThreshold: 1,
          packedQuantity: 1,
          unpackedQuantity: 0,
          consumeAmount: 1,
        })
        // targetQuantity: 0 → isInactive returns true
        const item2 = await createItem({
          name: 'inactive item',
          tagIds: [],
          vendorIds: [],
          targetUnit: 'package',
          targetQuantity: 0,
          refillThreshold: 0,
          packedQuantity: 0,
          unpackedQuantity: 0,
          consumeAmount: 1,
        })
        const shelf = await createShelf({
          name: 'mixed shelf',
          type: 'selection',
          order: 0,
          itemIds: [item2.id, item1.id], // inactive first in shelf order
        })
        return `/shelves/${shelf.id}`
      }}
    />
  )
}

export const WithInactiveItems: Story = {
  render: () => <WithInactiveItemsStory />,
}

// Story 4: Empty selection shelf
function EmptySelectionStory() {
  return (
    <ShelfDetailStory
      setup={async () => {
        const shelf = await createShelf({
          name: 'favorites',
          type: 'selection',
          order: 0,
          itemIds: [],
        })
        return `/shelves/${shelf.id}`
      }}
    />
  )
}

export const EmptySelection: Story = {
  render: () => <EmptySelectionStory />,
}
