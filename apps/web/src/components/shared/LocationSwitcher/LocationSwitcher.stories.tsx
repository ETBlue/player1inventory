import { ApolloProvider } from '@apollo/client/react'
import {
  MockedProvider,
  type MockedProviderProps,
} from '@apollo/client/testing/react'
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
  BootstrapCartsDocument,
  GetHouseholdDocument,
  GetLocationsDocument,
} from '@/generated/graphql'
import {
  ACTIVE_LOCATION_STORAGE_KEY,
  ActiveLocationProvider,
  activeLocationStorageKey,
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
        isDefault: true,
        createdAt: now,
        updatedAt: now,
      })
      if (seedExtras) {
        await db.locations.put({
          id: 'loc-office',
          name: 'Office',
          order: 1,
          isDefault: false,
          createdAt: now,
          updatedAt: now,
        })
        await db.locations.put({
          id: 'loc-beach',
          name: 'Beach House',
          order: 2,
          isDefault: false,
          createdAt: now,
          updatedAt: now,
        })
      }
      // Stories always run in local mode, so the active id lives in the
      // 'local' slot. Clear the legacy bare key too: it is migrated into that
      // slot on mount, and a leftover would outlive this story's own choice.
      localStorage.removeItem(ACTIVE_LOCATION_STORAGE_KEY)
      if (initialActiveId) {
        localStorage.setItem(activeLocationStorageKey('local'), initialActiveId)
      } else {
        localStorage.removeItem(activeLocationStorageKey('local'))
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

// ── Cloud: the View only badge (households H5 task F.4) ──
//
// A household member who is a VIEWER of the Kitchen (the active location),
// organizes the Garage and helps in the Pantry. The Kitchen carries "View
// only" on the trigger and in the menu; the other two do not. Module-local:
// CSF turns every named export into a story.
const CLOUD_KITCHEN = 'clw3story0a000s9f8h7g6d5e4'
const cloudRow = (
  id: string,
  name: string,
  order: number,
  myRole: 'organizer' | 'participant' | 'viewer',
) => ({
  __typename: 'Location' as const,
  id,
  name,
  order,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
  myRole,
})
const viewOnlyMocks: NonNullable<MockedProviderProps['mocks']> = [
  {
    request: { query: GetLocationsDocument },
    maxUsageCount: Number.POSITIVE_INFINITY,
    result: {
      data: {
        locations: [
          cloudRow(CLOUD_KITCHEN, 'Kitchen', 0, 'viewer'),
          cloudRow('clw3story0b001s9f8h7g6d5e5', 'Garage', 1, 'organizer'),
          cloudRow('clw3story0c002s9f8h7g6d5e6', 'Pantry', 2, 'participant'),
        ],
      },
    },
  },
  {
    request: { query: GetHouseholdDocument },
    maxUsageCount: Number.POSITIVE_INFINITY,
    result: {
      data: {
        household: {
          __typename: 'Household',
          id: 'household-1',
          name: 'Home',
          role: 'member',
        },
      },
    },
  },
  {
    request: {
      query: BootstrapCartsDocument,
      variables: { locationId: CLOUD_KITCHEN },
    },
    maxUsageCount: Number.POSITIVE_INFINITY,
    result: { data: { bootstrapCarts: [] } },
  },
]

function CloudViewOnlyHarness({ variant }: { variant: 'compact' | 'full' }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  )
  const [router] = useState(() =>
    createRouter({
      routeTree: createRootRoute({
        component: () => (
          <ActiveLocationProvider>
            {variant === 'full' ? (
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
      }),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    }),
  )
  return (
    <MockedProvider mocks={viewOnlyMocks}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </MockedProvider>
  )
}

function cloudViewerSetup() {
  localStorage.setItem('data-mode', 'cloud')
  localStorage.setItem(activeLocationStorageKey('cloud'), CLOUD_KITCHEN)
  return () => {
    localStorage.removeItem('data-mode')
    localStorage.removeItem(activeLocationStorageKey('cloud'))
  }
}

// The sidebar trigger of a viewer: the name, then the "View only" badge.
// Open it: only the Kitchen row has the badge.
export const CloudViewOnly: Story = {
  beforeEach: cloudViewerSetup,
  render: () => <CloudViewOnlyHarness variant="full" />,
}

// The toolbar trigger of a viewer has no room for the badge: a small eye
// mark sits on its corner, and its accessible name says "view only".
export const CloudViewOnlyCompact: Story = {
  beforeEach: cloudViewerSetup,
  render: () => <CloudViewOnlyHarness variant="compact" />,
}
