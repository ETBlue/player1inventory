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
import {
  ACTIVE_LOCATION_STORAGE_KEY,
  ActiveLocationProvider,
} from '@/hooks/useActiveLocation'
import { noopApolloClient } from '@/test/apolloStub'
import { DEFAULT_LOCATION_ID } from '@/types'
import { LocationSwitcher } from './LocationSwitcher'

const meta = {
  title: 'Components/Shared/LocationSwitcher',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function SwitcherHarness({
  seedExtras,
  initialActiveId,
}: {
  seedExtras: boolean
  initialActiveId?: string
}) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  )
  const [ready, setReady] = useState(false)

  useEffect(() => {
    async function setup() {
      await db.delete()
      await db.open()
      // Fresh open seeds the default 'local' location; ensure it exists.
      const existing = await db.locations.get(DEFAULT_LOCATION_ID)
      if (!existing) {
        const now = new Date()
        await db.locations.put({
          id: DEFAULT_LOCATION_ID,
          name: 'My Home',
          order: 0,
          createdAt: now,
          updatedAt: now,
        })
      }
      if (seedExtras) {
        const now = new Date()
        await db.locations.put({
          id: 'loc-office',
          name: 'Office',
          order: 1,
          createdAt: now,
          updatedAt: now,
        })
        await db.locations.put({
          id: 'loc-beach',
          name: 'Beach House',
          order: 2,
          createdAt: now,
          updatedAt: now,
        })
      }
      if (initialActiveId) {
        localStorage.setItem(ACTIVE_LOCATION_STORAGE_KEY, initialActiveId)
      } else {
        localStorage.removeItem(ACTIVE_LOCATION_STORAGE_KEY)
      }
      setReady(true)
    }
    setup()
  }, [seedExtras, initialActiveId])

  if (!ready) return <div>Loading...</div>

  const rootRoute = createRootRoute({
    component: () => (
      <ActiveLocationProvider>
        <div className="p-4">
          <LocationSwitcher />
        </div>
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

export const DefaultOnly: Story = {
  render: () => <SwitcherHarness seedExtras={false} />,
}

export const MultipleLocations: Story = {
  render: () => <SwitcherHarness seedExtras />,
}

export const NonDefaultActive: Story = {
  render: () => <SwitcherHarness seedExtras initialActiveId="loc-office" />,
}
