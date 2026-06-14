import { ApolloProvider } from '@apollo/client/react'
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
