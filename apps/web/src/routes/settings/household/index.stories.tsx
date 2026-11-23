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
import { routeTree } from '@/routeTree.gen'
import { noopApolloClient } from '@/test/apolloStub'
import { CloudRolePage, cloudRoleStorySetup } from '@/test/cloudRoleStory'

const meta = {
  title: 'Pages/Settings/Household',
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function HouseholdConfigStory() {
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
      setReady(true)
    }
    init()
  }, [])

  if (!ready) return <div>Loading...</div>

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/settings/household'] }),
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

// Language variants (EN/TW) are exercised via the Storybook toolbar (withI18n decorator in preview.tsx).
// This page looks the same on every screen width, so no viewport is fixed.
export const Default: Story = {
  render: () => <HouseholdConfigStory />,
}

/**
 * Cloud mode, for the household OWNER: the name field and, last, the danger
 * zone (households H6, task J.7). The purges are not answered here; try the
 * typed-name confirm with "The Lin home".
 */
export const CloudOwner: Story = {
  beforeEach: cloudRoleStorySetup,
  render: () => (
    <CloudRolePage
      path="/settings/household"
      householdRole="owner"
      mocks={[]}
    />
  ),
}
