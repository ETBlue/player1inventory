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
  title: 'Pages/Shelf/Settings/Items',
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function ShelfItemsTabStory({ setup }: { setup: () => Promise<string> }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false } },
      }),
  )
  const [url, setUrl] = useState<string | null>(null)

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

// Story 1: Filter shelf (not applicable for items tab)
function FilterShelfItemsStory() {
  return (
    <ShelfItemsTabStory
      setup={async () => {
        const shelf = await createShelf({
          name: 'Fridge',
          type: 'filter',
          order: 0,
          filterConfig: { tagIds: [], vendorIds: [], recipeIds: [] },
        })
        return `/settings/shelves/${shelf.id}/items`
      }}
    />
  )
}

export const FilterShelf: Story = {
  render: () => <FilterShelfItemsStory />,
}

// Story 2: Selection shelf with no items
function EmptySelectionShelfItemsStory() {
  return (
    <ShelfItemsTabStory
      setup={async () => {
        const shelf = await createShelf({
          name: 'Pantry Essentials',
          type: 'selection',
          order: 0,
          itemIds: [],
        })
        return `/settings/shelves/${shelf.id}/items`
      }}
    />
  )
}

export const EmptySelectionShelf: Story = {
  render: () => <EmptySelectionShelfItemsStory />,
}

// Story 3: Selection shelf with items (some assigned, some not)
function SelectionShelfWithItemsStory() {
  return (
    <ShelfItemsTabStory
      setup={async () => {
        const item1 = await createItem({
          name: 'Milk',
          tagIds: [],
          vendorIds: [],
          targetUnit: 'bottle',
          targetQuantity: 2,
          refillThreshold: 1,
          packedQuantity: 1,
          unpackedQuantity: 0,
          consumeAmount: 1,
        })
        const item2 = await createItem({
          name: 'Eggs',
          tagIds: [],
          vendorIds: [],
          targetUnit: 'box',
          targetQuantity: 1,
          refillThreshold: 0,
          packedQuantity: 1,
          unpackedQuantity: 0,
          consumeAmount: 1,
        })
        await createItem({
          name: 'Butter',
          tagIds: [],
          vendorIds: [],
          targetUnit: 'package',
          targetQuantity: 1,
          refillThreshold: 0,
          packedQuantity: 0,
          unpackedQuantity: 0,
          consumeAmount: 1,
        })

        const shelf = await createShelf({
          name: 'Weekly Staples',
          type: 'selection',
          order: 0,
          itemIds: [item1.id, item2.id],
        })

        return `/settings/shelves/${shelf.id}/items`
      }}
    />
  )
}

export const SelectionShelfWithItems: Story = {
  render: () => <SelectionShelfWithItemsStory />,
}
