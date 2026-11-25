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
  addInventoryLog,
  createItem,
  createRecipe,
  createVendor,
  updateItem,
} from '@/db/operations'
import { routeTree } from '@/routeTree.gen'
import { noopApolloClient } from '@/test/apolloStub'

const meta = {
  title: 'Pages/Item/Detail/Log',
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
    history: createMemoryHistory({ initialEntries: [`/items/${itemId}/log`] }),
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

function WithPurchaseLogsStory() {
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
        name: 'Orange Juice',
        tagIds: [],
        packageUnit: 'bottle',
        targetUnit: 'package',
        targetQuantity: 6,
        refillThreshold: 2,
        packedQuantity: 5,
        unpackedQuantity: 0,
        consumeAmount: 1,
      })

      const firstDate = new Date('2026-03-10T09:00:00')
      const secondDate = new Date('2026-03-15T14:30:00')

      await addInventoryLog({
        itemId: item.id,
        delta: 3,
        quantity: 3,
        occurredAt: firstDate,
        note: 'Bought at Costco',
      })

      await addInventoryLog({
        itemId: item.id,
        delta: 2,
        quantity: 5,
        occurredAt: secondDate,
        note: 'Restocked at local store',
      })

      setItemId(item.id)
      setReady(true)
    }
    setup()
  }, [])

  if (!ready || !itemId) return <div>Loading...</div>

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [`/items/${itemId}/log`] }),
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

function WithConsumptionLogsStory() {
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
        name: 'Pasta',
        tagIds: [],
        packageUnit: 'pack',
        targetUnit: 'package',
        targetQuantity: 5,
        refillThreshold: 2,
        packedQuantity: 3,
        unpackedQuantity: 0,
        consumeAmount: 1,
      })

      await addInventoryLog({
        itemId: item.id,
        delta: 5,
        quantity: 5,
        occurredAt: new Date('2026-03-01T10:00:00'),
        note: 'Initial stock',
      })

      await addInventoryLog({
        itemId: item.id,
        delta: -1,
        quantity: 4,
        occurredAt: new Date('2026-03-08T18:00:00'),
        note: 'Cooked pasta bolognese',
      })

      await addInventoryLog({
        itemId: item.id,
        delta: -1,
        quantity: 3,
        occurredAt: new Date('2026-03-14T19:30:00'),
        note: 'Cooked pasta arrabiata',
      })

      setItemId(item.id)
      setReady(true)
    }
    setup()
  }, [])

  if (!ready || !itemId) return <div>Loading...</div>

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [`/items/${itemId}/log`] }),
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

function MixedLogsStory() {
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
        name: 'Eggs',
        tagIds: [],
        packageUnit: 'dozen',
        targetUnit: 'package',
        targetQuantity: 2,
        refillThreshold: 1,
        packedQuantity: 1,
        unpackedQuantity: 0,
        consumeAmount: 1,
      })

      await addInventoryLog({
        itemId: item.id,
        delta: 2,
        quantity: 2,
        occurredAt: new Date('2026-03-01T09:00:00'),
        note: 'Bought at market',
      })

      await addInventoryLog({
        itemId: item.id,
        delta: -1,
        quantity: 1,
        occurredAt: new Date('2026-03-05T08:00:00'),
        note: 'Cooked omelette',
      })

      await addInventoryLog({
        itemId: item.id,
        delta: 2,
        quantity: 3,
        occurredAt: new Date('2026-03-10T10:30:00'),
        note: 'Restocked',
      })

      await addInventoryLog({
        itemId: item.id,
        delta: -1,
        quantity: 2,
        occurredAt: new Date('2026-03-15T07:45:00'),
        note: 'Baked a cake',
      })

      await addInventoryLog({
        itemId: item.id,
        delta: -1,
        quantity: 1,
        occurredAt: new Date('2026-03-17T19:00:00'),
        note: 'Scrambled eggs',
      })

      setItemId(item.id)
      setReady(true)
    }
    setup()
  }, [])

  if (!ready || !itemId) return <div>Loading...</div>

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [`/items/${itemId}/log`] }),
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

function WithI18nKeyLogsStory() {
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
        name: 'Orange Juice',
        tagIds: [],
        packageUnit: 'bottle',
        targetUnit: 'package',
        targetQuantity: 6,
        refillThreshold: 2,
        packedQuantity: 2,
        unpackedQuantity: 0,
        consumeAmount: 1,
      })

      await addInventoryLog({
        itemId: item.id,
        delta: 3,
        quantity: 3,
        occurredAt: new Date('2026-06-01T09:00:00'),
        logKey: 'shopping.log.purchasedAt',
        logParams: { vendor: 'Costco' },
      })

      await addInventoryLog({
        itemId: item.id,
        delta: -1,
        quantity: 2,
        occurredAt: new Date('2026-06-03T18:00:00'),
        logKey: 'cooking.log.consumedVia',
        logParams: { recipes: 'Pasta Bolognese' },
      })

      setItemId(item.id)
      setReady(true)
    }
    setup()
  }, [])

  if (!ready || !itemId) return <div>Loading...</div>

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [`/items/${itemId}/log`] }),
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

// The three new row shapes (design 2026-11-25, inventory log layout), for an
// item that tracks in grams (500 g per pack), so every number is converted
// from packs to grams:
//
// | Row | Stored | Shown |
// |---|---|---|
// | purchase at a vendor renamed since | +2 packs, 2 after, `{ vendorId, vendorName: 'Costco' }` | `+1000 g · Bought at Costco Wholesale`, `1000 g` |
// | purchase at a deleted vendor | +1 pack, 3 after, snapshot `Old Market` | `+500 g · Bought at Old Market`, `1500 g` |
// | cook, one recipe kept and one deleted | −200 g (tracking unit), 2.6 after | `−200 g · Used in Bread, Pizza`, `1300 g` |
// | stock count, written by a real `updateItem` save | −0.06 packs, 2.54 after | `−30 g · Stock count`, `1270 g` |
function NewLogShapesStory() {
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
        name: 'Flour',
        tagIds: [],
        packageUnit: 'bag',
        measurementUnit: 'g',
        amountPerPackage: 500,
        targetUnit: 'measurement',
        targetQuantity: 2000,
        refillThreshold: 500,
        packedQuantity: 2,
        unpackedQuantity: 300,
        consumeAmount: 100,
      })
      // Bought at "Costco", which has been renamed since.
      const costco = await createVendor('Costco Wholesale')
      const bread = await createRecipe({ name: 'Bread', items: [] })

      await addInventoryLog({
        itemId: item.id,
        delta: 2,
        quantity: 2,
        occurredAt: new Date('2026-11-20T09:15:00'),
        logKey: 'purchase',
        logParams: { vendorId: costco.id, vendorName: 'Costco' },
      })
      await addInventoryLog({
        itemId: item.id,
        delta: 1,
        quantity: 3,
        occurredAt: new Date('2026-11-21T10:00:00'),
        logKey: 'purchase',
        logParams: { vendorId: 'vendor-deleted', vendorName: 'Old Market' },
      })
      await addInventoryLog({
        itemId: item.id,
        delta: -200,
        quantity: 2.6,
        occurredAt: new Date('2026-11-23T18:45:00'),
        logKey: 'cooking',
        logParams: {
          recipes: [
            { id: bread.id, name: 'Bread' },
            { id: 'recipe-deleted', name: 'Pizza' },
          ],
        },
      })
      // A real stock count: 2 bags + 300 g is 2.6 bags; 2 bags + 270 g is
      // 2.54. `updateItem` writes the row itself.
      await updateItem(item.id, { unpackedQuantity: 270 })

      setItemId(item.id)
      setReady(true)
    }
    setup()
  }, [])

  if (!ready || !itemId) return <div>Loading...</div>

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [`/items/${itemId}/log`] }),
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

export const WithPurchaseLogs: Story = {
  render: () => <WithPurchaseLogsStory />,
}

export const WithConsumptionLogs: Story = {
  render: () => <WithConsumptionLogsStory />,
}

export const MixedLogs: Story = {
  render: () => <MixedLogsStory />,
}

export const WithI18nKeyLogs: Story = {
  render: () => <WithI18nKeyLogsStory />,
}

export const NewLogShapes: Story = {
  render: () => <NewLogShapesStory />,
}
