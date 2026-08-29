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
import {
  createItem,
  createRecipe,
  createShelf,
  createTag,
  createTagType,
  createVendor,
} from '@/db/operations'
import { routeTree } from '@/routeTree.gen'
import { noopApolloClient } from '@/test/apolloStub'

const meta = {
  title: 'Pages/Settings/Shelf',
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function EmptyStory() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false } },
      }),
  )
  const [ready, setReady] = useState(false)

  useEffect(() => {
    async function setup() {
      await db.delete()
      await db.open()
      setReady(true)
    }
    setup()
  }, [])

  if (!ready) return <div>Loading...</div>

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/settings/shelves'] }),
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

function WithShelvesStory() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false } },
      }),
  )
  const [ready, setReady] = useState(false)

  useEffect(() => {
    async function setup() {
      await db.delete()
      await db.open()

      // Seed real filter targets so the filter shelf below shows a non-zero
      // filter count. Dairy and Frozen share one tag type on purpose: the row
      // counts selected OPTIONS (4 here), not filter axes (3).
      const storage = await createTagType({ name: 'Storage' })
      const dairy = await createTag({ name: 'Dairy', typeId: storage.id })
      const frozen = await createTag({ name: 'Frozen', typeId: storage.id })
      const costco = await createVendor('Costco')
      const pancakes = await createRecipe({ name: 'Pancakes' })

      const milk = await createItem({
        name: 'Milk',
        tagIds: [dairy.id],
        vendorIds: [costco.id],
        targetUnit: 'package',
        targetQuantity: 2,
        refillThreshold: 1,
        packedQuantity: 1,
        unpackedQuantity: 0,
        consumeAmount: 1,
      })
      const peas = await createItem({
        name: 'Frozen Peas',
        tagIds: [frozen.id],
        vendorIds: [costco.id],
        targetUnit: 'package',
        targetQuantity: 3,
        refillThreshold: 1,
        packedQuantity: 2,
        unpackedQuantity: 0,
        consumeAmount: 1,
      })

      await createShelf({
        name: 'Fridge',
        type: 'filter',
        order: 0,
        filterConfig: {
          tagIds: [dairy.id, frozen.id],
          vendorIds: [costco.id],
          recipeIds: [pancakes.id],
        },
      })
      await createShelf({
        name: 'Snacks',
        type: 'filter',
        order: 1,
        filterConfig: { vendorIds: [costco.id] },
      })
      // Contrast case: a selection shelf shows no filter count at all.
      await createShelf({
        name: 'Pantry Essentials',
        type: 'selection',
        order: 2,
        itemIds: [milk.id, peas.id],
      })

      setReady(true)
    }
    setup()
  }, [])

  if (!ready) return <div>Loading...</div>

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/settings/shelves'] }),
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

export const Empty: Story = {
  render: () => <EmptyStory />,
}

export const WithShelves: Story = {
  render: () => <WithShelvesStory />,
}
