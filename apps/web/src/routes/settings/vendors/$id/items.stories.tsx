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
import { createItem, createVendor } from '@/db/operations'
import { routeTree } from '@/routeTree.gen'
import { noopApolloClient } from '@/test/apolloStub'

const meta = {
  title: 'Pages/Settings/Vendor/Detail/Item',
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
  const [vendorId, setVendorId] = useState<string | null>(null)

  useEffect(() => {
    async function setup() {
      await db.delete()
      await db.open()

      const vendor = await createVendor('Costco')
      const storedVendorId = vendor.id

      // 2 items with no vendor assigned
      await createItem({
        name: 'Olive Oil',
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
        name: 'Rice',
        tagIds: [],
        vendorIds: [],
        targetUnit: 'package',
        targetQuantity: 3,
        refillThreshold: 1,
        packedQuantity: 2,
        unpackedQuantity: 0,
        consumeAmount: 1,
      })

      setVendorId(storedVendorId)
      setReady(true)
    }
    setup()
  }, [])

  if (!ready || !vendorId) return <div>Loading...</div>

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: [`/settings/vendors/${vendorId}/items`],
    }),
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

function WithItemsStory() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false } },
      }),
  )
  const [ready, setReady] = useState(false)
  const [vendorId, setVendorId] = useState<string | null>(null)

  useEffect(() => {
    async function setup() {
      await db.delete()
      await db.open()

      const vendor = await createVendor("Trader Joe's")
      const storedVendorId = vendor.id

      // 2 items assigned to this vendor
      await createItem({
        name: 'Almond Butter',
        tagIds: [],
        vendorIds: [storedVendorId],
        targetUnit: 'package',
        targetQuantity: 2,
        refillThreshold: 1,
        packedQuantity: 1,
        unpackedQuantity: 0,
        consumeAmount: 1,
      })
      await createItem({
        name: 'Frozen Waffles',
        tagIds: [],
        vendorIds: [storedVendorId],
        targetUnit: 'package',
        targetQuantity: 3,
        refillThreshold: 1,
        packedQuantity: 2,
        unpackedQuantity: 0,
        consumeAmount: 1,
      })

      setVendorId(storedVendorId)
      setReady(true)
    }
    setup()
  }, [])

  if (!ready || !vendorId) return <div>Loading...</div>

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: [`/settings/vendors/${vendorId}/items`],
    }),
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

export const WithItems: Story = {
  render: () => <WithItemsStory />,
}
