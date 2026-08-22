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
  variant,
  longName,
}: {
  seedExtras: boolean
  initialActiveId?: string
  variant?: 'compact' | 'full'
  longName?: boolean
}) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  )
  const [ready, setReady] = useState(false)

  useEffect(() => {
    async function setup() {
      await db.delete()
      await db.open()
      // A fresh open seeds the default 'local' location; overwrite it so every
      // story has a deterministic name (and so `longName` can exercise the
      // full variant's truncation).
      const now = new Date()
      await db.locations.put({
        id: DEFAULT_LOCATION_ID,
        name: longName ? 'Grandparents’ Summer House' : 'My Home',
        order: 0,
        createdAt: now,
        updatedAt: now,
      })
      if (seedExtras) {
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
  }, [seedExtras, initialActiveId, longName])

  if (!ready) return <div>Loading...</div>

  const rootRoute = createRootRoute({
    component: () => (
      <ActiveLocationProvider>
        {variant === 'full' ? (
          // Mirrors the Sidebar column: w-56 with px-2 gutters.
          <div className="w-56 bg-background-surface border-r border-accessory-default px-2 py-4">
            <LocationSwitcher variant="full" />
          </div>
        ) : (
          <div className="p-4">
            <LocationSwitcher />
          </div>
        )}
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

// variant="full" — the desktop sidebar trigger: leading MapPin, the location
// name as stored, trailing chevron, full-width inside the sidebar's px-2 column.
export const FullVariant: Story = {
  render: () => <SwitcherHarness seedExtras variant="full" />,
}

export const FullVariantNonDefaultActive: Story = {
  render: () => (
    <SwitcherHarness seedExtras variant="full" initialActiveId="loc-beach" />
  ),
}

// A name longer than the sidebar column, to check it truncates rather than
// pushing the chevron out of the button.
export const FullVariantLongName: Story = {
  render: () => <SwitcherHarness seedExtras variant="full" longName />,
}
