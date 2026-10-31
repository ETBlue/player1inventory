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
  title: 'Pages/Settings/Tag/Detail',
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function TagDetailStory() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false } },
      }),
  )
  const [ready, setReady] = useState(false)
  const [tagId, setTagId] = useState('')

  useEffect(() => {
    async function setup() {
      await db.delete()
      await db.open()

      // Create sample tag types and a tag
      const category = await createTagType({
        name: 'Category',
        color: TagColor.blue,
      })
      // Only the rows matter here, not the returned objects, which nothing
      // read. `tags/$id/index.tsx:39` reads every tag type and `:96` passes
      // the list to `TagInfoForm`, which renders one option per type
      // (`TagInfoForm.tsx:109`). So these two give the story's type dropdown
      // more than one option for a human to look at in Storybook. The
      // matching smoke test asserts only the heading, so it stays green
      // without them — measured 2026-10-30.
      await createTagType({ name: 'Location', color: TagColor.green })
      await createTagType({ name: 'Diet', color: TagColor.purple })

      const tag = await createTag({ name: 'Organic', typeId: category.id })
      setTagId(tag.id)
      setReady(true)
    }
    setup()
  }, [])

  if (!ready) return <div>Loading...</div>

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: [`/settings/household/tags/${tagId}`],
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

function WithParentSelectorStory() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false } },
      }),
  )
  const [ready, setReady] = useState(false)
  const [tagId, setTagId] = useState('')

  useEffect(() => {
    async function setup() {
      await db.delete()
      await db.open()

      // Create a tag type with sibling tags — one is a child of another
      const category = await createTagType({
        name: 'Category',
        color: TagColor.blue,
      })

      // Top-level sibling tags
      const produce = await createTag({ name: 'Produce', typeId: category.id })
      await createTag({ name: 'Dairy', typeId: category.id })

      // Child under Produce — this is the tag whose edit form we show
      const vegetables = await createTag({
        name: 'Vegetables',
        typeId: category.id,
        parentId: produce.id,
      })

      // Another sibling child under Produce
      await createTag({
        name: 'Fruits',
        typeId: category.id,
        parentId: produce.id,
      })

      setTagId(vegetables.id)
      setReady(true)
    }
    setup()
  }, [])

  if (!ready) return <div>Loading...</div>

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: [`/settings/household/tags/${tagId}`],
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

function WithChildTagsDeleteDialogStory() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false } },
      }),
  )
  const [ready, setReady] = useState(false)
  const [tagId, setTagId] = useState('')

  useEffect(() => {
    async function setup() {
      await db.delete()
      await db.open()

      // Create a tag type with a parent tag that has children
      const category = await createTagType({
        name: 'Category',
        color: TagColor.blue,
      })

      // Top-level parent tag — this is the tag whose edit form we show
      const produce = await createTag({ name: 'Produce', typeId: category.id })

      // Child tags under Produce
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

      setTagId(produce.id)
      setReady(true)
    }
    setup()
  }, [])

  if (!ready) return <div>Loading...</div>

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: [`/settings/household/tags/${tagId}`],
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
  render: () => <TagDetailStory />,
}

export const WithParentSelector: Story = {
  render: () => <WithParentSelectorStory />,
}

export const WithChildTagsDeleteDialog: Story = {
  render: () => <WithChildTagsDeleteDialogStory />,
}
