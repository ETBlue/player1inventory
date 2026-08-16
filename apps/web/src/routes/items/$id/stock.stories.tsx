import { ApolloProvider } from '@apollo/client/react'
import { MockedProvider } from '@apollo/client/testing/react'
import type { Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { expect, screen, userEvent, waitFor, within } from 'storybook/test'
import { db } from '@/db'
import {
  addItemToLocation,
  createItem,
  createLocation,
  upsertItemStock,
} from '@/db/operations'
import { GetItemDocument } from '@/generated/graphql'
import { routeTree } from '@/routeTree.gen'
import { noopApolloClient } from '@/test/apolloStub'

const meta = {
  title: 'Pages/Item/Stock',
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

// Local-mode harness: wipes the DB, runs `seed` (which returns the item id to
// open the Stock tab on), then mounts the real route.
function LocalStockHarness({ seed }: { seed: () => Promise<string> }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false } },
      }),
  )
  const [itemId, setItemId] = useState<string | null>(null)

  useEffect(() => {
    async function setup() {
      await db.delete()
      await db.open()
      setItemId(await seed())
    }
    setup()
  }, [seed])

  if (!itemId) return <div>Loading...</div>

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: [`/items/${itemId}/stock`],
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

// One location only — the pager renders no chrome at all (a lone dot between
// two dead chevrons would read as a broken carousel).
const seedSingleLocation = async () => {
  const item = await createItem({
    name: 'Milk',
    tagIds: [],
    packageUnit: 'bottle',
    targetUnit: 'package',
    targetQuantity: 4,
    refillThreshold: 2,
    packedQuantity: 2,
    unpackedQuantity: 0,
    consumeAmount: 1,
  })
  return item.id
}

const seedMeasurementItem = async () => {
  const item = await createItem({
    name: 'Flour',
    tagIds: [],
    packageUnit: 'pack',
    measurementUnit: 'g',
    amountPerPackage: 500,
    targetUnit: 'measurement',
    targetQuantity: 2000,
    refillThreshold: 500,
    packedQuantity: 2,
    unpackedQuantity: 250,
    consumeAmount: 100,
  })
  return item.id
}

// Three locations, stocked in all of them with different quantities.
const seedStockedEverywhere = async () => {
  const cabin = await createLocation('Cabin')
  const office = await createLocation('Office')
  const item = await createItem({
    name: 'Milk',
    tagIds: [],
    packageUnit: 'bottle',
    targetUnit: 'package',
    targetQuantity: 4,
    refillThreshold: 2,
    packedQuantity: 2,
    unpackedQuantity: 0,
    consumeAmount: 1,
  })
  await addItemToLocation(item.id, cabin.id)
  await upsertItemStock(item.id, cabin.id, { packedQuantity: 7 })
  await addItemToLocation(item.id, office.id)
  return item.id
}

// Three locations, stocked only in the active one — the other pages show the
// not-stocked empty state and its "Add to location" call to action.
const seedStockedHereOnly = async () => {
  await createLocation('Cabin')
  await createLocation('Office')
  const item = await createItem({
    name: 'Butter',
    tagIds: [],
    packageUnit: 'block',
    targetUnit: 'package',
    targetQuantity: 4,
    refillThreshold: 2,
    packedQuantity: 2,
    unpackedQuantity: 0,
    consumeAmount: 1,
  })
  return item.id
}

export const PackageItem: Story = {
  name: 'Single location — no pager chrome',
  render: () => <LocalStockHarness seed={seedSingleLocation} />,
}

export const MeasurementItem: Story = {
  render: () => <LocalStockHarness seed={seedMeasurementItem} />,
}

export const MultipleLocations: Story = {
  name: 'Pager — viewing the active location',
  render: () => <LocalStockHarness seed={seedStockedEverywhere} />,
}

export const ViewingAnotherLocation: Story = {
  name: 'Pager — active location stays marked while viewing another',
  render: () => <LocalStockHarness seed={seedStockedEverywhere} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const user = userEvent.setup()

    await canvas.findByLabelText(/^packed/i)
    await user.click(await canvas.findByRole('tab', { name: 'Cabin' }))

    await waitFor(async () => {
      expect(await canvas.findByLabelText(/^packed/i)).toHaveValue(7)
    })
  },
}

export const NotStockedHere: Story = {
  name: 'Pager — a location the item is not stocked in',
  render: () => <LocalStockHarness seed={seedStockedHereOnly} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const user = userEvent.setup()

    await canvas.findByLabelText(/^packed/i)
    await user.click(await canvas.findByRole('tab', { name: 'Cabin' }))

    expect(
      await canvas.findByRole('button', { name: /add to location/i }),
    ).toBeInTheDocument()
  },
}

export const RemoveFromLocationConfirmation: Story = {
  name: 'Pager — remove-from-location confirmation',
  render: () => <LocalStockHarness seed={seedStockedEverywhere} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const user = userEvent.setup()

    await canvas.findByLabelText(/^packed/i)
    await user.click(await canvas.findByRole('tab', { name: 'Cabin' }))
    await user.click(
      await canvas.findByRole('button', { name: /remove from location/i }),
    )

    await waitFor(() => {
      expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    })
  },
}

// Cloud mode has no locations and no ItemStock (deferred in PR D): the tab
// renders the bare stock form — no dots, no chevrons, no add/remove. The item
// comes from GraphQL, so this mocks GetItem rather than seeding Dexie.
export const CLOUD_ITEM = {
  id: 'item-cloud-1',
  name: 'Cloud Milk',
  tagIds: [],
  vendorIds: [],
  packageUnit: 'bottle',
  measurementUnit: null,
  amountPerPackage: null,
  targetUnit: 'package',
  targetQuantity: 4,
  refillThreshold: 2,
  packedQuantity: 2,
  unpackedQuantity: 0,
  consumeAmount: 1,
  expirationMode: null,
  dueDate: null,
  estimatedDueDays: null,
  expirationThreshold: null,
  wikidataUrl: null,
  note: null,
  userId: 'user-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

function CloudStockHarness() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false } },
      }),
  )

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: [`/items/${CLOUD_ITEM.id}/stock`],
    }),
    context: { queryClient },
  })

  const mocks = [
    {
      request: { query: GetItemDocument, variables: { id: CLOUD_ITEM.id } },
      result: { data: { item: CLOUD_ITEM } },
      maxUsageCount: Number.POSITIVE_INFINITY,
    },
  ]

  return (
    <MockedProvider mocks={mocks} addTypename={false}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </MockedProvider>
  )
}

export const CloudMode: Story = {
  name: 'Cloud mode — single page, no pager',
  beforeEach() {
    localStorage.setItem('data-mode', 'cloud')
    return () => localStorage.removeItem('data-mode')
  },
  render: () => <CloudStockHarness />,
}
