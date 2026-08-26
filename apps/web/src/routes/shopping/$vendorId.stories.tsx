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
  addToCart,
  createItem,
  createLocation,
  createVendor,
} from '@/db/operations'
import { routeTree } from '@/routeTree.gen'
import { noopApolloClient } from '@/test/apolloStub'
import { cartIdFor, DEFAULT_LOCATION_ID } from '@/types'

const meta = {
  title: 'Pages/ShoppingVendorCart',
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function VendorCartStory({
  setup,
  vendorId,
}: {
  setup: () => Promise<void>
  vendorId: string
}) {
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
    history: createMemoryHistory({
      initialEntries: [`/shopping/${vendorId}`],
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

function DefaultStory() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false } },
      }),
  )
  const [vendorId, setVendorId] = useState<string | null>(null)

  useEffect(() => {
    async function setup() {
      await db.delete()
      await db.open()
      const vendor = await createVendor('Costco')
      setVendorId(vendor.id)
    }
    setup()
  }, [])

  if (!vendorId) return <div>Loading...</div>

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: [`/shopping/${vendorId}`],
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

function WithCartItemsStory() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false } },
      }),
  )
  const [vendorId, setVendorId] = useState<string | null>(null)

  useEffect(() => {
    async function setup() {
      await db.delete()
      await db.open()
      const vendor = await createVendor('Costco')

      const milk = await createItem({
        name: 'Milk',
        tagIds: [],
        vendorIds: [vendor.id],
        targetUnit: 'package',
        targetQuantity: 4,
        refillThreshold: 2,
        packedQuantity: 1,
        unpackedQuantity: 0,
        consumeAmount: 1,
      })

      const eggs = await createItem({
        name: 'Eggs',
        tagIds: [],
        vendorIds: [vendor.id],
        targetUnit: 'package',
        targetQuantity: 2,
        refillThreshold: 1,
        packedQuantity: 0,
        unpackedQuantity: 0,
        consumeAmount: 1,
      })

      await addToCart(vendor.id, milk.id, 2)
      await addToCart(vendor.id, eggs.id, 1)

      setVendorId(vendor.id)
    }
    setup()
  }, [])

  if (!vendorId) return <div>Loading...</div>

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: [`/shopping/${vendorId}`],
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

function WithMultipleLocationsStory() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false } },
      }),
  )
  const [vendorId, setVendorId] = useState<string | null>(null)

  useEffect(() => {
    async function setup() {
      await db.delete()
      await db.open()
      // A second location exists alongside the default one, so the toolbar's
      // LocationSwitcher has something to switch between (demonstrates the
      // toolbar state introduced by mounting the switcher on the cart page).
      await createLocation('Office')
      const vendor = await createVendor('Costco')

      const milk = await createItem({
        name: 'Milk',
        tagIds: [],
        vendorIds: [vendor.id],
        targetUnit: 'package',
        targetQuantity: 4,
        refillThreshold: 2,
        packedQuantity: 1,
        unpackedQuantity: 0,
        consumeAmount: 1,
      })

      await addToCart(cartIdFor(DEFAULT_LOCATION_ID, vendor.id), milk.id, 2)

      setVendorId(vendor.id)
    }
    setup()
  }, [])

  if (!vendorId) return <div>Loading...</div>

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: [`/shopping/${vendorId}`],
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

function WithNoVendorCartStory() {
  return (
    <VendorCartStory
      vendorId="no-vendor"
      setup={async () => {
        await db.shoppingCarts.put({ id: 'no-vendor' })
        await createItem({
          name: 'Unassigned Item',
          tagIds: [],
          targetUnit: 'package',
          targetQuantity: 1,
          refillThreshold: 1,
          packedQuantity: 0,
          unpackedQuantity: 0,
          consumeAmount: 1,
        })
      }}
    />
  )
}

function WithSearchTailStory() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false } },
      }),
  )
  const [vendorId, setVendorId] = useState<string | null>(null)

  useEffect(() => {
    async function setup() {
      await db.delete()
      await db.open()
      const vendor = await createVendor('Costco')
      // A second location — this is what makes "not stocked here" possible:
      // Milk Powder below is stocked ONLY there, never at DEFAULT_LOCATION_ID.
      const office = await createLocation('Office')

      const stock = {
        targetUnit: 'package' as const,
        targetQuantity: 4,
        refillThreshold: 2,
        packedQuantity: 1,
        unpackedQuantity: 0,
        consumeAmount: 1,
      }

      // Carries the vendor AND is stocked here → the cart's own list
      // (section 1 of the page).
      await createItem(
        { name: 'Milk', tagIds: [], vendorIds: [vendor.id], ...stock },
        DEFAULT_LOCATION_ID,
      )

      // Stocked here but carries no vendor → "not in this list", with an
      // Apply Costco button.
      await createItem(
        { name: 'Milk Chocolate', tagIds: [], vendorIds: [], ...stock },
        DEFAULT_LOCATION_ID,
      )

      // Exists globally but stocked ONLY at the Office → "not stocked
      // here", with an Add to My Home button.
      await createItem(
        { name: 'Milk Powder', tagIds: [], vendorIds: [], ...stock },
        office.id,
      )

      setVendorId(vendor.id)
    }
    setup()
  }, [])

  if (!vendorId) return <div>Loading...</div>

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: [`/shopping/${vendorId}?q=milk`],
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

export const WithCartItems: Story = {
  render: () => <WithCartItemsStory />,
}

export const WithNoVendorCart: Story = {
  render: () => <WithNoVendorCartStory />,
}

export const WithMultipleLocations: Story = {
  render: () => <WithMultipleLocationsStory />,
}

export const WithSearchTail: Story = {
  render: () => <WithSearchTailStory />,
}
