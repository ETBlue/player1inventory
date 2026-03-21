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
import { createItem, createTag, createTagType } from '@/db/operations'
import { routeTree } from '@/routeTree.gen'
import { noopApolloClient } from '@/test/apolloStub'
import { TagColor } from '@/types'

const meta = {
  title: 'Routes/Settings/TagDetail/Items',
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
  const [tagId, setTagId] = useState<string | null>(null)

  useEffect(() => {
    async function setup() {
      await db.delete()
      await db.open()

      // Use a distinct tag type name to avoid conflicts with db.on('populate') defaults
      const tagType = await createTagType({
        name: 'Texture',
        color: TagColor.orange,
      })

      const tag = await createTag({ name: 'Crunchy', typeId: tagType.id })

      // 3 items with no tags assigned
      await createItem({
        name: 'Almonds',
        tagIds: [],
        targetUnit: 'package',
        targetQuantity: 2,
        refillThreshold: 1,
        packedQuantity: 1,
        unpackedQuantity: 0,
        consumeAmount: 1,
      })
      await createItem({
        name: 'Granola',
        tagIds: [],
        targetUnit: 'package',
        targetQuantity: 3,
        refillThreshold: 1,
        packedQuantity: 2,
        unpackedQuantity: 0,
        consumeAmount: 1,
      })
      await createItem({
        name: 'Crackers',
        tagIds: [],
        targetUnit: 'package',
        targetQuantity: 4,
        refillThreshold: 2,
        packedQuantity: 3,
        unpackedQuantity: 0,
        consumeAmount: 1,
      })

      setTagId(tag.id)
      setReady(true)
    }
    setup()
  }, [])

  if (!ready || !tagId) return <div>Loading...</div>

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: [`/settings/tags/${tagId}/items`],
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

function WithItemsStory() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false } },
      }),
  )
  const [ready, setReady] = useState(false)
  const [tagId, setTagId] = useState<string | null>(null)

  useEffect(() => {
    async function setup() {
      await db.delete()
      await db.open()

      // Use a distinct tag type name to avoid conflicts with db.on('populate') defaults
      const tagType = await createTagType({
        name: 'Season',
        color: TagColor.teal,
      })

      const tag = await createTag({ name: 'Winter', typeId: tagType.id })
      const storedTagId = tag.id

      // 2 items assigned to the tag
      await createItem({
        name: 'Hot Cocoa',
        tagIds: [storedTagId],
        targetUnit: 'package',
        targetQuantity: 3,
        refillThreshold: 1,
        packedQuantity: 2,
        unpackedQuantity: 0,
        consumeAmount: 1,
      })
      await createItem({
        name: 'Peppermint Tea',
        tagIds: [storedTagId],
        targetUnit: 'package',
        targetQuantity: 2,
        refillThreshold: 1,
        packedQuantity: 1,
        unpackedQuantity: 0,
        consumeAmount: 1,
      })

      // 1 item not assigned
      await createItem({
        name: 'Lemonade',
        tagIds: [],
        targetUnit: 'package',
        targetQuantity: 4,
        refillThreshold: 2,
        packedQuantity: 0,
        unpackedQuantity: 0,
        consumeAmount: 1,
      })

      setTagId(storedTagId)
      setReady(true)
    }
    setup()
  }, [])

  if (!ready || !tagId) return <div>Loading...</div>

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: [`/settings/tags/${tagId}/items`],
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

export const WithItems: Story = {
  render: () => <WithItemsStory />,
}
