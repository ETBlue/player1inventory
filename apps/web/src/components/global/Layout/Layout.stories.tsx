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

const meta = {
  title: 'Components/Global/Layout',
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function LayoutStory({ path }: { path: string }) {
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
    history: createMemoryHistory({ initialEntries: [path] }),
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

// Story 1: Regular page — nav visible, pb-20 bottom padding applied
export const Default: Story = {
  render: () => <LayoutStory path="/" />,
}

// Story 2: Fullscreen page — nav hidden, no bottom padding
// (/settings/vendors triggers fullscreen mode)
export const FullscreenPage: Story = {
  render: () => <LayoutStory path="/settings/vendors" />,
}
