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
import {
  createItem,
  createRecipe,
  createShelf,
  createTag,
  createTagType,
  createVendor,
} from '@/db/operations'
import { routeTree } from '@/routeTree.gen'
import { noopApolloClient } from '@/test/apolloStub'

const meta = {
  title: 'Pages/Shelf/Settings/Filters',
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function ShelfFiltersTabStory({ setup }: { setup: () => Promise<string> }) {
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

// Story 1: Filter shelf with no tags/vendors (empty state)
function EmptyFiltersStory() {
  return (
    <ShelfFiltersTabStory
      setup={async () => {
        const shelf = await createShelf({
          name: 'Fridge',
          type: 'filter',
          order: 0,
          filterConfig: { tagIds: [], vendorIds: [], recipeIds: [] },
        })
        return `/settings/shelves/${shelf.id}/filters`
      }}
    />
  )
}

export const EmptyFilters: Story = {
  render: () => <EmptyFiltersStory />,
}

// Story 2: Filter shelf with tags and vendors available
function WithTagsAndVendorsStory() {
  return (
    <ShelfFiltersTabStory
      setup={async () => {
        const tagType = await createTagType({ name: 'Category' })
        await createTag({ name: 'Dairy', typeId: tagType.id })
        await createTag({ name: 'Frozen', typeId: tagType.id })
        await createVendor('Costco')
        await createVendor('Whole Foods')
        const shelf = await createShelf({
          name: 'Fridge',
          type: 'filter',
          order: 0,
          filterConfig: { tagIds: [], vendorIds: [], recipeIds: [] },
        })
        return `/settings/shelves/${shelf.id}/filters`
      }}
    />
  )
}

export const WithTagsAndVendors: Story = {
  render: () => <WithTagsAndVendorsStory />,
}

// Story 3: Selection shelf (shows "not applicable" empty state)
function SelectionShelfFiltersStory() {
  return (
    <ShelfFiltersTabStory
      setup={async () => {
        const shelf = await createShelf({
          name: 'Pantry Essentials',
          type: 'selection',
          order: 0,
          itemIds: [],
        })
        return `/settings/shelves/${shelf.id}/filters`
      }}
    />
  )
}

export const SelectionShelf: Story = {
  render: () => <SelectionShelfFiltersStory />,
}

// Story 4: Badges carry global item counts. The parent tag ("Food") has no
// items assigned directly — its count comes entirely from descendants, which
// is what the shelf tag filter actually selects.
function WithItemCountsStory() {
  return (
    <ShelfFiltersTabStory
      setup={async () => {
        const tagType = await createTagType({ name: 'Category' })
        const food = await createTag({ name: 'Food', typeId: tagType.id })
        const dairy = await createTag({
          name: 'Dairy',
          typeId: tagType.id,
          parentId: food.id,
        })
        const costco = await createVendor('Costco')
        await createVendor('Whole Foods')
        const milk = await createItem({
          name: 'Milk',
          targetUnit: 'package',
          targetQuantity: 2,
          refillThreshold: 1,
          packedQuantity: 1,
          unpackedQuantity: 0,
          consumeAmount: 1,
          tagIds: [dairy.id],
          vendorIds: [costco.id],
        })
        const eggs = await createItem({
          name: 'Eggs',
          targetUnit: 'package',
          targetQuantity: 2,
          refillThreshold: 1,
          packedQuantity: 1,
          unpackedQuantity: 0,
          consumeAmount: 1,
          tagIds: [dairy.id],
          vendorIds: [costco.id],
        })
        await createRecipe({
          name: 'Pancakes',
          items: [
            { itemId: milk.id, defaultAmount: 1 },
            { itemId: eggs.id, defaultAmount: 2 },
          ],
        })
        const shelf = await createShelf({
          name: 'Fridge',
          type: 'filter',
          order: 0,
          filterConfig: { tagIds: [], vendorIds: [], recipeIds: [] },
        })
        return `/settings/shelves/${shelf.id}/filters`
      }}
    />
  )
}

export const WithItemCounts: Story = {
  render: () => <WithItemCountsStory />,
}
