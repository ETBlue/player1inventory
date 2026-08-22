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
import { createItem, createLocation, upsertItemStock } from '@/db/operations'
import { routeTree } from '@/routeTree.gen'
import { noopApolloClient } from '@/test/apolloStub'

const meta = {
  title: 'Pages/Item/Info',
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function DefaultStory() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false } },
      }),
  )
  const [ready, setReady] = useState(false)
  const [itemId, setItemId] = useState<string | null>(null)

  useEffect(() => {
    async function setup() {
      await db.delete()
      await db.open()

      const item = await createItem({
        name: 'Milk',
        tagIds: [],
        targetUnit: 'package',
        targetQuantity: 4,
        refillThreshold: 2,
        packedQuantity: 2,
        unpackedQuantity: 0,
        consumeAmount: 1,
      })

      setItemId(item.id)
      setReady(true)
    }
    setup()
  }, [])

  if (!ready || !itemId) return <div>Loading...</div>

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [`/items/${itemId}`] }),
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

function WithInfoFieldsStory() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false } },
      }),
  )
  const [ready, setReady] = useState(false)
  const [itemId, setItemId] = useState<string | null>(null)

  useEffect(() => {
    async function setup() {
      await db.delete()
      await db.open()

      const item = await createItem({
        name: 'Organic Whole Milk',
        tagIds: [],
        wikidataUrl: 'https://www.wikidata.org/wiki/Q8495',
        note: 'Buy the lactose-free variant for guests.',
        targetUnit: 'package',
        targetQuantity: 4,
        refillThreshold: 2,
        packedQuantity: 3,
        unpackedQuantity: 0,
        consumeAmount: 1,
      })

      setItemId(item.id)
      setReady(true)
    }
    setup()
  }, [])

  if (!ready || !itemId) return <div>Loading...</div>

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [`/items/${itemId}`] }),
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

// The eight stock CONFIGURATION fields are global to the item and live on this
// tab since v16 — measurement mode is the state that shows all of them at once.
function WithGlobalStockSettingsStory() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false } },
      }),
  )
  const [ready, setReady] = useState(false)
  const [itemId, setItemId] = useState<string | null>(null)

  useEffect(() => {
    async function setup() {
      await db.delete()
      await db.open()

      const item = await createItem({
        name: 'Olive Oil',
        tagIds: [],
        packageUnit: 'bottle',
        measurementUnit: 'ml',
        amountPerPackage: 750,
        targetUnit: 'measurement',
        consumeAmount: 15,
        expirationMode: 'days from purchase',
        estimatedDueDays: 180,
        expirationThreshold: 14,
        targetQuantity: 1500,
        refillThreshold: 250,
        packedQuantity: 1,
        unpackedQuantity: 300,
      })

      setItemId(item.id)
      setReady(true)
    }
    setup()
  }, [])

  if (!ready || !itemId) return <div>Loading...</div>

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [`/items/${itemId}`] }),
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

// Stocked in three locations with three different sets of numbers. Toggling
// "Track in measurement" and saving opens the unit-switch confirmation, which
// previews the conversion of unpacked / target / refill-when-below for every
// location at once (packed packages are left alone).
function StockedInThreeLocationsStory() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false } },
      }),
  )
  const [ready, setReady] = useState(false)
  const [itemId, setItemId] = useState<string | null>(null)

  useEffect(() => {
    async function setup() {
      await db.delete()
      await db.open()

      const cabin = await createLocation('Cabin')
      const office = await createLocation('Office')
      const item = await createItem({
        name: 'Flour',
        tagIds: [],
        packageUnit: 'pack',
        measurementUnit: 'g',
        amountPerPackage: 500,
        targetUnit: 'measurement',
        consumeAmount: 100,
        targetQuantity: 1000,
        refillThreshold: 200,
        packedQuantity: 2,
        unpackedQuantity: 250,
      })
      await upsertItemStock(item.id, cabin.id, {
        targetQuantity: 2000,
        refillThreshold: 500,
        packedQuantity: 1,
        unpackedQuantity: 100,
      })
      await upsertItemStock(item.id, office.id, {
        targetQuantity: 500,
        refillThreshold: 250,
        packedQuantity: 3,
        unpackedQuantity: 50,
      })

      setItemId(item.id)
      setReady(true)
    }
    setup()
  }, [])

  if (!ready || !itemId) return <div>Loading...</div>

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [`/items/${itemId}`] }),
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

export const Default: Story = {
  render: () => <DefaultStory />,
}

export const WithInfoFields: Story = {
  render: () => <WithInfoFieldsStory />,
}

export const WithGlobalStockSettings: Story = {
  render: () => <WithGlobalStockSettingsStory />,
}

export const StockedInThreeLocations: Story = {
  render: () => <StockedInThreeLocationsStory />,
}
