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
import { createItem } from '@/db/operations'
import { routeTree } from '@/routeTree.gen'
import { noopApolloClient } from '@/test/apolloStub'

const meta = {
  title: 'Routes/Pantry',
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
    history: createMemoryHistory({ initialEntries: ['/'] }),
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

function WithItemsStory() {
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

      await createItem({
        name: 'Milk',
        tagIds: [],
        targetUnit: 'package',
        targetQuantity: 4,
        refillThreshold: 2,
        packedQuantity: 2,
        unpackedQuantity: 0,
        consumeAmount: 1,
      })

      await createItem({
        name: 'Eggs',
        tagIds: [],
        targetUnit: 'package',
        targetQuantity: 3,
        refillThreshold: 1,
        packedQuantity: 0,
        unpackedQuantity: 0,
        consumeAmount: 1,
      })

      await createItem({
        name: 'Orange Juice',
        tagIds: [],
        packageUnit: 'bottle',
        targetUnit: 'package',
        targetQuantity: 6,
        refillThreshold: 2,
        packedQuantity: 5,
        unpackedQuantity: 0,
        consumeAmount: 1,
      })

      setReady(true)
    }
    setup()
  }, [])

  if (!ready) return <div>Loading...</div>

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
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

export const WithItems: Story = {
  render: () => <WithItemsStory />,
}
