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
import { createLocation } from '@/db/operations'
import { routeTree } from '@/routeTree.gen'
import { noopApolloClient } from '@/test/apolloStub'
import { DEFAULT_LOCATION_ID } from '@/types'

const meta = {
  title: 'Pages/Settings/Locations',
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function DefaultOnlyStory() {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  )
  const [ready, setReady] = useState(false)

  useEffect(() => {
    async function setup() {
      await db.delete()
      await db.open()
      // The default location is seeded by the populate hook on fresh open.
      setReady(true)
    }
    setup()
  }, [])

  if (!ready) return <div>Loading...</div>

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/settings/locations'] }),
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

function WithLocationsStory() {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  )
  const [ready, setReady] = useState(false)

  useEffect(() => {
    async function setup() {
      await db.delete()
      await db.open()
      // Ensure the default exists (fresh open seeds it), then add extras.
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
      await createLocation('Office')
      await createLocation('Beach House')
      setReady(true)
    }
    setup()
  }, [])

  if (!ready) return <div>Loading...</div>

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/settings/locations'] }),
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

export const DefaultOnly: Story = {
  render: () => <DefaultOnlyStory />,
}

export const WithLocations: Story = {
  render: () => <WithLocationsStory />,
}
