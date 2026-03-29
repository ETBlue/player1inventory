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
  title: 'Pages/Item/Detail/Tag',
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
  const [itemId, setItemId] = useState<string | null>(null)

  useEffect(() => {
    async function setup() {
      await db.delete()
      await db.open()

      const tagType = await createTagType({ name: 'Season' })
      await createTag({ name: 'Summer', typeId: tagType.id })
      await createTag({ name: 'Winter', typeId: tagType.id })

      const item = await createItem({
        name: 'Butter',
        tagIds: [],
        targetUnit: 'package',
        targetQuantity: 3,
        refillThreshold: 1,
        packedQuantity: 2,
        unpackedQuantity: 0,
        consumeAmount: 1,
      })

      setItemId(item.id)
      setReady(true)
    }
    setup()
  }, [])

  if (!ready || !itemId) return <div>Loading...</div>

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [`/items/${itemId}/tags`] }),
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

function WithAssignedTagsStory() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false } },
      }),
  )
  const [ready, setReady] = useState(false)
  const [itemId, setItemId] = useState<string | null>(null)

  useEffect(() => {
    async function setup() {
      await db.delete()
      await db.open()

      const tagType = await createTagType({ name: 'Texture' })
      const tag1 = await createTag({ name: 'Creamy', typeId: tagType.id })
      const tag2 = await createTag({ name: 'Crunchy', typeId: tagType.id })

      const item = await createItem({
        name: 'Cheese',
        tagIds: [tag1.id, tag2.id],
        targetUnit: 'package',
        targetQuantity: 2,
        refillThreshold: 1,
        packedQuantity: 1,
        unpackedQuantity: 0,
        consumeAmount: 1,
      })

      setItemId(item.id)
      setReady(true)
    }
    setup()
  }, [])

  if (!ready || !itemId) return <div>Loading...</div>

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [`/items/${itemId}/tags`] }),
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

function EmptyTagTypesStory() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false } },
      }),
  )
  const [ready, setReady] = useState(false)
  const [itemId, setItemId] = useState<string | null>(null)

  useEffect(() => {
    async function setup() {
      await db.delete()
      await db.open()

      const item = await createItem({
        name: 'Yogurt',
        tagIds: [],
        targetUnit: 'container',
        targetQuantity: 4,
        refillThreshold: 1,
        packedQuantity: 2,
        unpackedQuantity: 0,
        consumeAmount: 1,
      })

      setItemId(item.id)
      setReady(true)
    }
    setup()
  }, [])

  if (!ready || !itemId) return <div>Loading...</div>

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [`/items/${itemId}/tags`] }),
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

function WithNestedTagsStory() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false } },
      }),
  )
  const [ready, setReady] = useState(false)
  const [itemId, setItemId] = useState<string | null>(null)

  useEffect(() => {
    async function setup() {
      await db.delete()
      await db.open()

      const tagType = await createTagType({
        name: 'Diet',
        color: TagColor.green,
      })
      // Top-level tags
      const vegan = await createTag({ name: 'Vegan', typeId: tagType.id })
      const vegetarian = await createTag({
        name: 'Vegetarian',
        typeId: tagType.id,
      })
      // Child tags nested under Vegan
      const rawVegan = await createTag({
        name: 'Raw Vegan',
        typeId: tagType.id,
        parentId: vegan.id,
      })
      // Child tag nested under Vegetarian
      await createTag({
        name: 'Lacto-Ovo',
        typeId: tagType.id,
        parentId: vegetarian.id,
      })

      const item = await createItem({
        name: 'Almond Milk',
        tagIds: [vegan.id, rawVegan.id],
        targetUnit: 'carton',
        targetQuantity: 4,
        refillThreshold: 1,
        packedQuantity: 2,
        unpackedQuantity: 0,
        consumeAmount: 1,
      })

      setItemId(item.id)
      setReady(true)
    }
    setup()
  }, [])

  if (!ready || !itemId) return <div>Loading...</div>

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [`/items/${itemId}/tags`] }),
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

export const WithAssignedTags: Story = {
  render: () => <WithAssignedTagsStory />,
}

export const EmptyTagTypes: Story = {
  render: () => <EmptyTagTypesStory />,
}

export const WithNestedTags: Story = {
  render: () => <WithNestedTagsStory />,
}
