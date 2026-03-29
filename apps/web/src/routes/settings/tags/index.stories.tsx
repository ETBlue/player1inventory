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
import { createTag, createTagType } from '@/db/operations'
import { routeTree } from '@/routeTree.gen'
import { noopApolloClient } from '@/test/apolloStub'
import { TagColor } from '@/types'

const meta = {
  title: 'Pages/Settings/Tag',
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function TagsListStory() {
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

      // Create sample tag types and tags
      const category = await createTagType({
        name: 'Category',
        color: TagColor.blue,
      })
      const location = await createTagType({
        name: 'Location',
        color: TagColor.green,
      })
      const diet = await createTagType({ name: 'Diet', color: TagColor.purple })

      await createTag({ name: 'Organic', typeId: category.id })
      await createTag({ name: 'Fresh', typeId: category.id })
      await createTag({ name: 'Frozen', typeId: category.id })
      await createTag({ name: 'Fridge', typeId: location.id })
      await createTag({ name: 'Pantry', typeId: location.id })
      await createTag({ name: 'Vegan', typeId: diet.id })

      setReady(true)
    }
    setup()
  }, [])

  if (!ready) return <div>Loading...</div>

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/settings/tags'] }),
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

  useEffect(() => {
    async function setup() {
      await db.delete()
      await db.open()

      // Create a tag type with nested tags to demonstrate visual hierarchy
      const category = await createTagType({
        name: 'Category',
        color: TagColor.blue,
      })

      // Top-level parent tags
      const produce = await createTag({ name: 'Produce', typeId: category.id })
      const dairy = await createTag({ name: 'Dairy', typeId: category.id })

      // Child tags nested under Produce
      await createTag({
        name: 'Vegetables',
        typeId: category.id,
        parentId: produce.id,
      })
      await createTag({
        name: 'Fruits',
        typeId: category.id,
        parentId: produce.id,
      })

      // Child tag nested under Dairy
      await createTag({
        name: 'Cheese',
        typeId: category.id,
        parentId: dairy.id,
      })

      setReady(true)
    }
    setup()
  }, [])

  if (!ready) return <div>Loading...</div>

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/settings/tags'] }),
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

function WithParentSelectorStory() {
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

      // Create a tag type with existing tags that can serve as parents
      const category = await createTagType({
        name: 'Category',
        color: TagColor.blue,
      })

      // Existing sibling tags — these appear in the parent dropdown when adding
      const produce = await createTag({ name: 'Produce', typeId: category.id })
      await createTag({ name: 'Dairy', typeId: category.id })
      await createTag({
        name: 'Vegetables',
        typeId: category.id,
        parentId: produce.id,
      })

      setReady(true)
    }
    setup()
  }, [])

  if (!ready) return <div>Loading...</div>

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/settings/tags'] }),
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

function WithNewTagTypeDialogStory() {
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

      await createTagType({ name: 'Category', color: TagColor.blue })

      setReady(true)
    }
    setup()
  }, [])

  if (!ready) return <div>Loading...</div>

  // Navigate with a hash that opens the dialog via a click after render
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/settings/tags'] }),
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
  render: () => <TagsListStory />,
}

export const WithNestedTags: Story = {
  render: () => <WithNestedTagsStory />,
}

export const WithParentSelector: Story = {
  render: () => <WithParentSelectorStory />,
}

export const WithNewTagTypeDialog: Story = {
  render: () => <WithNewTagTypeDialogStory />,
}
