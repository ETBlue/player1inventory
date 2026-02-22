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
import { TagColor } from '@/types'

const meta = {
  title: 'Routes/Settings/Tags',
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
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

export const Default: Story = {
  render: () => <TagsListStory />,
}
