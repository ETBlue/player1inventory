import { ApolloProvider } from '@apollo/client/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db'
import { createShelf, createTag, createTagType } from '@/db/operations'
import { routeTree } from '@/routeTree.gen'
import { noopApolloClient } from '@/test/apolloStub'

describe('Shelf settings page — filter count', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.items.clear()
    await db.tags.clear()
    await db.tagTypes.clear()
    await db.vendors.clear()
    await db.recipes.clear()
    await db.shelves.clear()
    sessionStorage.clear()

    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  const renderShelfSettingsPage = () => {
    const history = createMemoryHistory({
      initialEntries: ['/settings/shelves'],
    })
    const router = createRouter({ routeTree, history })

    render(
      <ApolloProvider client={noopApolloClient}>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </ApolloProvider>,
    )
  }

  it('user can see how many filter options a filter shelf selects', async () => {
    // Given a filter shelf selecting TWO tags of the SAME tag type plus one
    // vendor — 3 selected options, but only 2 filter axes. The fixture is built
    // this way on purpose so a count of axes cannot pass for a count of options.
    const tagType = await createTagType({ name: 'Storage' })
    const dairy = await createTag({ name: 'Dairy', typeId: tagType.id })
    const frozen = await createTag({ name: 'Frozen', typeId: tagType.id })
    await createShelf({
      name: 'Fridge',
      type: 'filter',
      order: 0,
      filterConfig: {
        tagIds: [dairy.id, frozen.id],
        vendorIds: ['vendor-1'],
        recipeIds: [],
      },
    })

    // When the shelf settings page is rendered
    renderShelfSettingsPage()

    // Then the row reports the number of selected options, not of axes
    expect(await screen.findByText('3 filters')).toBeInTheDocument()
    expect(screen.queryByText('2 filters')).not.toBeInTheDocument()
  })

  it('user sees the singular "1 filter" when exactly one option is selected', async () => {
    // Given a filter shelf selecting a single vendor
    await createShelf({
      name: 'Snacks',
      type: 'filter',
      order: 0,
      filterConfig: { vendorIds: ['vendor-1'] },
    })

    // When the shelf settings page is rendered
    renderShelfSettingsPage()

    // Then the count is singular
    expect(await screen.findByText('1 filter')).toBeInTheDocument()
  })

  it('user sees "0 filters" on a filter shelf that selects nothing', async () => {
    // Given a filter shelf whose filterConfig is absent entirely
    await createShelf({ name: 'Everything', type: 'filter', order: 0 })

    // When the shelf settings page is rendered
    renderShelfSettingsPage()

    // Then it still reports a filter count — it is still a filter shelf
    expect(await screen.findByText('0 filters')).toBeInTheDocument()
  })

  it('user sees no filter count on a selection shelf', async () => {
    // Given only a selection shelf — membership is manual, there are no filters
    await createShelf({
      name: 'Pantry Essentials',
      type: 'selection',
      order: 0,
      itemIds: [],
    })

    // When the shelf settings page is rendered
    renderShelfSettingsPage()

    // Then the row renders with no filter count at all
    expect(
      await screen.findByRole('link', { name: 'Pantry Essentials' }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/^\d+ filters?$/)).not.toBeInTheDocument()
  })
})
