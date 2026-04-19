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
import { createShelf } from '@/db/operations'
import { routeTree } from '@/routeTree.gen'
import { noopApolloClient } from '@/test/apolloStub'

const meta = {
  title: 'Pages/Shelf/Settings/Info',
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function ShelfInfoTabStory({ setup }: { setup: () => Promise<string> }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false } },
      }),
  )
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      await db.delete()
      await db.open()
      const resolvedUrl = await setup()
      setUrl(resolvedUrl)
    }
    init()
  }, [setup])

  if (!url) return <div>Loading...</div>

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [url] }),
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

// Story 1: Filter shelf info tab
function FilterShelfInfoStory() {
  return (
    <ShelfInfoTabStory
      setup={async () => {
        const shelf = await createShelf({
          name: 'Fridge',
          type: 'filter',
          order: 0,
          filterConfig: { tagIds: [], vendorIds: [], recipeIds: [] },
        })
        return `/settings/shelves/${shelf.id}`
      }}
    />
  )
}

export const FilterShelfInfo: Story = {
  render: () => <FilterShelfInfoStory />,
}

// Story 2: Selection shelf info tab
function SelectionShelfInfoStory() {
  return (
    <ShelfInfoTabStory
      setup={async () => {
        const shelf = await createShelf({
          name: 'Pantry Essentials',
          type: 'selection',
          order: 0,
          itemIds: [],
        })
        return `/settings/shelves/${shelf.id}`
      }}
    />
  )
}

export const SelectionShelfInfo: Story = {
  render: () => <SelectionShelfInfoStory />,
}

// Story 3: Filter shelf with custom sort config
function FilterShelfWithSortStory() {
  return (
    <ShelfInfoTabStory
      setup={async () => {
        const shelf = await createShelf({
          name: 'Freezer',
          type: 'filter',
          order: 1,
          filterConfig: {
            tagIds: [],
            vendorIds: [],
            recipeIds: [],
            sortBy: 'expiring',
            sortDir: 'asc',
          },
        })
        return `/settings/shelves/${shelf.id}`
      }}
    />
  )
}

export const FilterShelfWithSort: Story = {
  render: () => <FilterShelfWithSortStory />,
}
