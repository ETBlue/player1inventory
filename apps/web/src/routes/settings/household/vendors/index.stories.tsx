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
import { createVendor } from '@/db/operations'
import { GetVendorsDocument } from '@/generated/graphql'
import { routeTree } from '@/routeTree.gen'
import { noopApolloClient } from '@/test/apolloStub'
import { CloudRolePage, cloudRoleStorySetup } from '@/test/cloudRoleStory'

const meta = {
  title: 'Pages/Settings/Vendor',
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function DefaultStory() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false } },
      }),
  )
  const [ready, setReady] = useState(false)

  useEffect(() => {
    async function setup() {
      await db.delete()
      await db.open()
      setReady(true)
    }
    setup()
  }, [])

  if (!ready) return <div>Loading...</div>

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: ['/settings/household/vendors'],
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

function WithVendorsStory() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false } },
      }),
  )
  const [ready, setReady] = useState(false)

  useEffect(() => {
    async function setup() {
      await db.delete()
      await db.open()

      await createVendor('Costco')
      await createVendor('Whole Foods')
      await createVendor("Trader Joe's")

      setReady(true)
    }
    setup()
  }, [])

  if (!ready) return <div>Loading...</div>

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: ['/settings/household/vendors'],
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

export const WithVendors: Story = {
  render: () => <WithVendorsStory />,
}

// Households H5 task F.5. A household `member` in cloud mode: the vendors
// are listed (names as stored), with no "New Vendor" and no Delete.
const memberVendorMocks = [
  {
    request: { query: GetVendorsDocument },
    maxUsageCount: Number.POSITIVE_INFINITY,
    result: {
      data: {
        vendors: [
          { __typename: 'Vendor', id: 'vendor-story-iherb', name: 'iHerb' },
          { __typename: 'Vendor', id: 'vendor-story-costco', name: 'Costco' },
        ],
      },
    },
  },
]

export const MemberReadOnly: Story = {
  beforeEach: cloudRoleStorySetup,
  render: () => (
    <CloudRolePage
      path="/settings/household/vendors"
      householdRole="member"
      mocks={memberVendorMocks}
    />
  ),
}
