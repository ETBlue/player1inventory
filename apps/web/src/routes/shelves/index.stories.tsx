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
import { createItem, createShelf, updateShelf } from '@/db/operations'
import { routeTree } from '@/routeTree.gen'
import { noopApolloClient } from '@/test/apolloStub'

const meta = {
  title: 'Pages/Shelf/List',
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function ShelvesPageStory({ setup }: { setup: () => Promise<void> }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false } },
      }),
  )
  const [ready, setReady] = useState(false)

  useEffect(() => {
    async function init() {
      await db.delete()
      await db.open()
      await setup()
      setReady(true)
    }
    init()
  }, [setup])

  if (!ready) return <div>Loading...</div>

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/shelves'] }),
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

// Story 1: No shelves configured
function EmptyStory() {
  return <ShelvesPageStory setup={async () => {}} />
}

export const Empty: Story = {
  render: () => <EmptyStory />,
}

// Story 2: With filter and selection shelves
function WithShelvesStory() {
  return (
    <ShelvesPageStory
      setup={async () => {
        await createShelf({
          name: 'Fridge',
          type: 'filter',
          order: 0,
          filterConfig: { tagIds: [], vendorIds: [], recipeIds: [] },
        })
        await createShelf({
          name: 'Pantry Essentials',
          type: 'selection',
          order: 1,
          itemIds: [],
        })
        await createShelf({
          name: 'Freezer',
          type: 'filter',
          order: 2,
          filterConfig: { tagIds: [], vendorIds: [], recipeIds: [] },
        })
      }}
    />
  )
}

export const WithShelves: Story = {
  render: () => <WithShelvesStory />,
}

// Story 3: Shelves with items assigned
function WithItemsStory() {
  return (
    <ShelvesPageStory
      setup={async () => {
        const selectionShelf = await createShelf({
          name: 'Weekly Staples',
          type: 'selection',
          order: 0,
          itemIds: [],
        })

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

        // Update the selection shelf to include those items
        await updateShelf(selectionShelf.id, {
          itemIds: [item1.id, item2.id],
        })

        await createShelf({
          name: 'Fridge',
          type: 'filter',
          order: 1,
          filterConfig: { tagIds: [], vendorIds: [], recipeIds: [] },
        })
      }}
    />
  )
}

export const WithItems: Story = {
  render: () => <WithItemsStory />,
}
