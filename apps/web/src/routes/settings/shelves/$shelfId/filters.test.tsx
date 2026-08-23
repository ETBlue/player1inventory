import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
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

describe('Shelf Detail - Filters Tab item counts', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.items.clear()
    await db.itemStocks.clear()
    await db.tags.clear()
    await db.tagTypes.clear()
    await db.vendors.clear()
    await db.recipes.clear()
    await db.shelves.clear()
    await db.shoppingCarts.clear()
    await db.cartItems.clear()
    await db.inventoryLogs.clear()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  const renderFiltersTab = (shelfId: string) => {
    const history = createMemoryHistory({
      initialEntries: [`/settings/shelves/${shelfId}/filters`],
    })
    const router = createRouter({ routeTree, history })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
  }

  const makeFilterShelf = () =>
    createShelf({
      name: 'Test Shelf',
      type: 'filter',
      order: 0,
      filterConfig: {},
    })

  const makeItem = (
    name: string,
    extra: { tagIds?: string[]; vendorIds?: string[] } = {},
  ) =>
    createItem({
      name,
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: extra.tagIds ?? [],
      vendorIds: extra.vendorIds ?? [],
    })

  it('user can see how many items a tag selects, including via child tags', async () => {
    // Given a parent tag whose only matching items carry its CHILD tag
    const tagType = await createTagType({ name: 'Category' })
    const parent = await createTag({ name: 'Food', typeId: tagType.id })
    const child = await createTag({
      name: 'Dairy',
      typeId: tagType.id,
      parentId: parent.id,
    })
    await makeItem('Milk', { tagIds: [child.id] })
    await makeItem('Cheese', { tagIds: [child.id] })
    await makeItem('Soap', { tagIds: [] })
    const shelf = await makeFilterShelf()

    // When the filters tab renders
    renderFiltersTab(shelf.id)

    // Then the parent badge reports the descendants' items, not 0
    expect(
      await screen.findByRole('button', { name: /food \(2\)/i }),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('button', { name: /dairy \(2\)/i }),
    ).toBeInTheDocument()
  })

  it('user can see a zero count on a tag no item carries', async () => {
    // Given a tag with no items assigned
    const tagType = await createTagType({ name: 'Category' })
    await createTag({ name: 'Frozen', typeId: tagType.id })
    await makeItem('Milk')
    const shelf = await makeFilterShelf()

    // When the filters tab renders
    renderFiltersTab(shelf.id)

    // Then the badge shows zero
    expect(
      await screen.findByRole('button', { name: /frozen \(0\)/i }),
    ).toBeInTheDocument()
  })

  it('user can see how many items each vendor supplies', async () => {
    // Given two vendors, one supplying two items and one supplying none
    const costco = await createVendor('Costco')
    await createVendor('Empty Mart')
    await makeItem('Milk', { vendorIds: [costco.id] })
    await makeItem('Eggs', { vendorIds: [costco.id] })
    const shelf = await makeFilterShelf()

    // When the filters tab renders
    renderFiltersTab(shelf.id)

    // Then each vendor badge carries its global count
    expect(
      await screen.findByRole('button', { name: /costco \(2\)/i }),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('button', { name: /empty mart \(0\)/i }),
    ).toBeInTheDocument()
  })

  it('user can see how many items each recipe uses', async () => {
    // Given a recipe with two items and one with none
    const milk = await makeItem('Milk')
    const eggs = await makeItem('Eggs')
    await createRecipe({
      name: 'Pancakes',
      items: [
        { itemId: milk.id, defaultAmount: 1 },
        { itemId: eggs.id, defaultAmount: 2 },
      ],
    })
    await createRecipe({ name: 'Water', items: [] })
    const shelf = await makeFilterShelf()

    // When the filters tab renders
    renderFiltersTab(shelf.id)

    // Then each recipe badge carries its membership count
    expect(
      await screen.findByRole('button', { name: /pancakes \(2\)/i }),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('button', { name: /water \(0\)/i }),
    ).toBeInTheDocument()
  })
})
