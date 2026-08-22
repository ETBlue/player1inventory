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

const meta = {
  title: 'Pages/ShoppingIndex',
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function ShoppingIndexStory({ setup }: { setup: () => Promise<void> }) {
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
    history: createMemoryHistory({ initialEntries: ['/shopping'] }),
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
  return <ShoppingIndexStory setup={async () => {}} />
}

function WithVendorsStory() {
  return (
    <ShoppingIndexStory
      setup={async () => {
        const costco = await createVendor('Costco')
        const iherb = await createVendor('iHerb')
        const familymart = await createVendor('FamilyMart')

        await createItem({
          name: 'Milk',
          tagIds: [],
          vendorIds: [costco.id],
          targetUnit: 'package',
          targetQuantity: 4,
          refillThreshold: 2,
          packedQuantity: 1,
          unpackedQuantity: 0,
          consumeAmount: 1,
        })

        await createItem({
          name: 'Vitamin C',
          tagIds: [],
          vendorIds: [iherb.id],
          targetUnit: 'package',
          targetQuantity: 2,
          refillThreshold: 1,
          packedQuantity: 0,
          unpackedQuantity: 0,
          consumeAmount: 1,
        })

        await createItem({
          name: 'Onigiri',
          tagIds: [],
          vendorIds: [familymart.id],
          targetUnit: 'package',
          targetQuantity: 3,
          refillThreshold: 1,
          packedQuantity: 0,
          unpackedQuantity: 0,
          consumeAmount: 1,
        })
      }}
    />
  )
}

function WithVendorCartsStory() {
  return (
    <ShoppingIndexStory
      setup={async () => {
        const costco = await createVendor('Costco')
        const iherb = await createVendor('iHerb')

        const milk = await createItem({
          name: 'Milk',
          tagIds: [],
          vendorIds: [costco.id],
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
          vendorIds: [costco.id],
          targetUnit: 'package',
          targetQuantity: 2,
          refillThreshold: 1,
          packedQuantity: 0,
          unpackedQuantity: 0,
          consumeAmount: 1,
        })

        const vitaminC = await createItem({
          name: 'Vitamin C',
          tagIds: [],
          vendorIds: [iherb.id],
          targetUnit: 'package',
          targetQuantity: 2,
          refillThreshold: 1,
          packedQuantity: 0,
          unpackedQuantity: 0,
          consumeAmount: 1,
        })

        await addToCart(costco.id, milk.id, 2)
        await addToCart(costco.id, eggs.id, 1)

        await addToCart(iherb.id, vitaminC.id, 3)
      }}
    />
  )
}

export const Default: Story = {
  render: () => <DefaultStory />,
}

export const WithVendors: Story = {
  render: () => <WithVendorsStory />,
}

export const WithVendorCarts: Story = {
  render: () => <WithVendorCartsStory />,
}

// The split list — a vendor stocked in the active location on top, then the
// "N not stocked here" divider, then a vendor whose only item lives in another
// location and the (here-empty) no-vendor bucket.
function WithNotStockedHereStory() {
  return (
    <ShoppingIndexStory
      setup={async () => {
        const costco = await createVendor('Costco')
        await createItem({
          name: 'Milk',
          tagIds: [],
          vendorIds: [costco.id],
          targetUnit: 'package',
          targetQuantity: 4,
          refillThreshold: 2,
          packedQuantity: 1,
          unpackedQuantity: 0,
          consumeAmount: 1,
        })

        const cabin = await createLocation('Cabin')
        const cabinSupply = await createVendor('Cabin Supply')
        await createItem(
          {
            name: 'Firewood',
            tagIds: [],
            vendorIds: [cabinSupply.id],
            targetUnit: 'package',
            targetQuantity: 6,
            refillThreshold: 2,
            packedQuantity: 4,
            unpackedQuantity: 0,
            consumeAmount: 1,
          },
          cabin.id,
        )
        await createItem(
          {
            name: 'Kindling',
            tagIds: [],
            targetUnit: 'package',
            targetQuantity: 2,
            refillThreshold: 1,
            packedQuantity: 1,
            unpackedQuantity: 0,
            consumeAmount: 1,
          },
          cabin.id,
        )
      }}
    />
  )
}

export const WithNotStockedHere: Story = {
  render: () => <WithNotStockedHereStory />,
}
