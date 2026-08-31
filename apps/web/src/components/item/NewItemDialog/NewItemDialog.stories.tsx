import { ApolloProvider } from '@apollo/client/react'
import { MockedProvider } from '@apollo/client/testing/react'
import type { Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { db } from '@/db'
import { GetLocationsDocument, PantryDataDocument } from '@/generated/graphql'
import { ActiveLocationProvider } from '@/hooks/useActiveLocation'
import { noopApolloClient } from '@/test/apolloStub'
import { DEFAULT_LOCATION_ID } from '@/types'
import { NewItemDialog } from './NewItemDialog'

const meta = {
  title: 'Components/Item/NewItemDialog',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

// Seeds a small catalog: some items stocked in the active ('local') location
// and some only existing globally (not stocked here) so the combobox shows both
// selectable and already-stocked rows.
function DialogHarness({ initialName }: { initialName?: string }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  )
  const [ready, setReady] = useState(false)

  useEffect(() => {
    async function setup() {
      await db.delete()
      await db.open()
      const now = new Date()
      const ensureItem = async (id: string, name: string) => {
        await db.items.put({
          id,
          name,
          tagIds: [],
          createdAt: now,
          updatedAt: now,
        })
      }
      const ensureStock = async (itemId: string) => {
        await db.itemStocks.put({
          id: `stock-${itemId}`,
          itemId,
          locationId: DEFAULT_LOCATION_ID,
          targetUnit: 'package',
          targetQuantity: 0,
          refillThreshold: 0,
          packedQuantity: 2,
          unpackedQuantity: 0,
          consumeAmount: 1,
          createdAt: now,
          updatedAt: now,
        })
      }
      // Stocked here (shown disabled / "already here")
      await ensureItem('item-milk', 'Milk')
      await ensureStock('item-milk')
      await ensureItem('item-eggs', 'Eggs')
      await ensureStock('item-eggs')
      // Not stocked here (selectable → copy-on-add)
      await ensureItem('item-butter', 'Butter')
      await ensureItem('item-flour', 'Flour')
      setReady(true)
    }
    setup()
  }, [])

  if (!ready) return <div>Loading…</div>

  const rootRoute = createRootRoute({
    component: () => (
      <ActiveLocationProvider>
        <NewItemDialog
          open
          onOpenChange={() => {}}
          {...(initialName ? { initialName } : {})}
          onSuccess={(item) => console.log('Added/created item:', item)}
        />
      </ActiveLocationProvider>
    ),
  })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  return (
    <ApolloProvider client={noopApolloClient}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ApolloProvider>
  )
}

// Empty query: the combobox lists the whole catalog (stockable items first,
// already-stocked items disabled).
export const Default: Story = {
  render: () => <DialogHarness />,
}

// Pre-filled query that matches an existing, not-yet-stocked item — selecting it
// stocks it here via copy-on-add.
export const MatchingExisting: Story = {
  render: () => <DialogHarness initialName="But" />,
}

// Query with no catalog match — the "Create" option + package-unit field appear.
export const CreateNew: Story = {
  render: () => <DialogHarness initialName="Sparkling Water" />,
}

// Query exactly matches an item already stocked here ("Milk") — the sole
// option renders disabled, no Create option is offered, and inline feedback
// explains why (PR D review 3.3 / Important 3 — user ruling: inline feedback
// instead of skipping non-selectable options, since there's nothing else to
// skip to in the exact-match case).
export const AlreadyStockedExactMatch: Story = {
  render: () => <DialogHarness initialName="Milk" />,
}

// Cloud mode behaves exactly as local does since PR 2 Task 9b — the dialog no
// longer branches on the data mode at all. The catalog and the active
// location's stock come from `PantryData` via `MockedProvider` rather than
// Dexie, and the fixture is deliberately TWO locations with Milk stocked in the
// Kitchen and Flour stocked nowhere here, so "already here" and "stockable" are
// both visible in one screenshot.
//
// `variables` is a matcher rather than a literal: the provider starts on the
// stored id and only settles on the Kitchen once `GetLocations` resolves, so
// `PantryData` is asked for more than one location id across the render.
function CloudDialogHarness({ initialName }: { initialName?: string }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  )

  const rootRoute = createRootRoute({
    component: () => (
      <ActiveLocationProvider>
        <NewItemDialog
          open
          onOpenChange={() => {}}
          {...(initialName ? { initialName } : {})}
          onSuccess={(item) => console.log('Added/created item:', item)}
        />
      </ActiveLocationProvider>
    ),
  })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  const cloudItem = (id: string, name: string) => ({
    id,
    name,
    tagIds: [],
    vendorIds: [],
    packageUnit: null,
    measurementUnit: null,
    amountPerPackage: null,
    targetUnit: 'package',
    targetQuantity: 10,
    refillThreshold: 2,
    packedQuantity: 5,
    unpackedQuantity: 0,
    consumeAmount: 1,
    expirationMode: null,
    dueDate: null,
    estimatedDueDays: null,
    expirationThreshold: null,
    userId: 'user-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  })
  const cloudLocation = (id: string, name: string, isDefault: boolean) => ({
    id,
    name,
    isDefault,
    order: isDefault ? 0 : 1,
    userId: 'user-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  })

  const mocks = [
    {
      request: { query: GetLocationsDocument, variables: () => true },
      maxUsageCount: Number.POSITIVE_INFINITY,
      result: {
        data: {
          locations: [
            cloudLocation('cloud-kitchen', 'Kitchen', true),
            cloudLocation('cloud-garage', 'Garage', false),
          ],
        },
      },
    },
    {
      request: { query: PantryDataDocument, variables: () => true },
      maxUsageCount: Number.POSITIVE_INFINITY,
      result: {
        data: {
          items: [
            cloudItem('item-milk', 'Milk'),
            cloudItem('item-flour', 'Flour'),
          ],
          // Milk is stocked in the Kitchen; Flour is not stocked here at all,
          // so it stays selectable and Milk renders "already here".
          itemStocks: [
            {
              __typename: 'ItemStock',
              id: 'stock-milk-kitchen',
              itemId: 'item-milk',
              locationId: 'cloud-kitchen',
              targetQuantity: 3,
              refillThreshold: 1,
              packedQuantity: 2,
              unpackedQuantity: 0,
              dueDate: null,
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
          ],
        },
      },
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
  beforeEach() {
    localStorage.setItem('data-mode', 'cloud')
    return () => localStorage.removeItem('data-mode')
  },
  render: () => <CloudDialogHarness />,
}

// Cloud mode, query exactly matching an item already stocked in the active
// location ("Milk") — Create stays suppressed (duplicate names are impossible)
// and the sole option is disabled, so the same location-naming feedback local
// mode shows appears here. Before PR 2 Task 9b cloud rendered a separate
// location-free sentence, on the premise that cloud had no locations.
export const CloudExactMatch: Story = {
  beforeEach() {
    localStorage.setItem('data-mode', 'cloud')
    return () => localStorage.removeItem('data-mode')
  },
  render: () => <CloudDialogHarness initialName="Milk" />,
}
