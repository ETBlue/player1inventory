import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db'
import {
  createItem,
  createRecipe,
  createTag,
  createTagType,
  createVendor,
} from '@/db/operations'
import { routeTree } from '@/routeTree.gen'
import { TagColor } from '@/types'

describe('Vendor Detail - Items Tab', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.items.clear()
    await db.itemStocks.clear()
    await db.tags.clear()
    await db.tagTypes.clear()
    await db.vendors.clear()
    await db.inventoryLogs.clear()
    await db.recipes.clear()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  const renderItemsTab = (vendorId: string) => {
    const history = createMemoryHistory({
      initialEntries: [`/settings/vendors/${vendorId}/items`],
    })
    const router = createRouter({ routeTree, history })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
  }

  const makeItem = (name: string, vendorIds: string[] = []) =>
    createItem({
      name,
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
      vendorIds,
    })

  it('user can see all items in the checklist', async () => {
    // Given a vendor and two items
    const vendor = await createVendor('Costco')
    await makeItem('Milk')
    await makeItem('Eggs')

    renderItemsTab(vendor.id)

    // Then both items appear in the list
    await waitFor(() => {
      expect(screen.getByLabelText('Add Milk')).toBeInTheDocument()
      expect(screen.getByLabelText('Add Eggs')).toBeInTheDocument()
    })
  })

  it('user can see already-assigned items as checked', async () => {
    // Given a vendor and an item already assigned to it
    const vendor = await createVendor('Costco')
    await makeItem('Milk', [vendor.id])
    await makeItem('Eggs')

    renderItemsTab(vendor.id)

    // Then Milk's checkbox is checked and Eggs' is not
    await waitFor(() => {
      expect(screen.getByLabelText('Remove Milk')).toBeChecked()
      expect(screen.getByLabelText('Add Eggs')).not.toBeChecked()
    })
  })

  it('user can filter items by name using the search input', async () => {
    // Given a vendor and two items
    const vendor = await createVendor('Costco')
    await makeItem('Milk')
    await makeItem('Eggs')

    renderItemsTab(vendor.id)
    const user = userEvent.setup()

    // When user opens the search panel
    await user.click(
      await screen.findByRole('button', { name: /toggle search/i }),
    )

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search items/i)).toBeInTheDocument()
    })

    // When user types "mil"
    await user.type(screen.getByPlaceholderText(/search items/i), 'mil')

    // Then only Milk is visible
    await waitFor(() => {
      expect(screen.getByLabelText('Add Milk')).toBeInTheDocument()
      expect(screen.queryByLabelText('Add Eggs')).not.toBeInTheDocument()
    })
  })

  it('user can assign this vendor to an item by clicking the checkbox', async () => {
    // Given a vendor and an unassigned item
    const vendor = await createVendor('Costco')
    const item = await makeItem('Milk')

    renderItemsTab(vendor.id)
    const user = userEvent.setup()

    // When user clicks the checkbox
    await waitFor(() => {
      expect(screen.getByLabelText('Add Milk')).toBeInTheDocument()
    })
    await user.click(screen.getByLabelText('Add Milk'))

    // Then the item now has this vendor assigned in the DB
    await waitFor(async () => {
      const updated = await db.items.get(item.id)
      expect(updated?.vendorIds).toContain(vendor.id)
    })
  })

  it('user can remove this vendor from an item by clicking the checkbox', async () => {
    // Given a vendor already assigned to an item
    const vendor = await createVendor('Costco')
    const item = await makeItem('Milk', [vendor.id])

    renderItemsTab(vendor.id)
    const user = userEvent.setup()

    // When user unchecks the item
    await waitFor(() => {
      expect(screen.getByLabelText('Remove Milk')).toBeChecked()
    })
    await user.click(screen.getByLabelText('Remove Milk'))

    // Then the vendor is removed from the item in the DB
    await waitFor(async () => {
      const updated = await db.items.get(item.id)
      expect(updated?.vendorIds ?? []).not.toContain(vendor.id)
    })
  })

  it('user can see sort and filter toolbar controls', async () => {
    // Given a vendor exists
    const vendor = await createVendor('Costco')

    // When user navigates to the items tab
    renderItemsTab(vendor.id)

    // Then sort and filter toolbar controls are visible
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /toggle filters/i }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /sort by criteria/i }),
      ).toBeInTheDocument()
    })
  })

  it('user can see create prompt when search input has no matches', async () => {
    // Given a vendor with items
    const vendor = await createVendor('Costco')
    await makeItem('Milk')
    await makeItem('Eggs')

    renderItemsTab(vendor.id)
    const user = userEvent.setup()

    // When user opens the search panel
    await user.click(
      await screen.findByRole('button', { name: /toggle search/i }),
    )

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search items/i)).toBeInTheDocument()
    })

    // When user searches for non-existent item
    await user.type(screen.getByPlaceholderText(/search items/i), 'xyz')

    // Then the create button (+ inside search input) appears for zero-match state
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /create item/i }),
      ).toBeInTheDocument()
    })
  })

  it('user can create an item by typing a name and pressing Enter', async () => {
    // Given a vendor with no items matching "Butter"
    const vendor = await createVendor('Costco')
    renderItemsTab(vendor.id)
    const user = userEvent.setup()

    // When user opens the search panel
    await user.click(
      await screen.findByRole('button', { name: /toggle search/i }),
    )

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search items/i)).toBeInTheDocument()
    })

    // When user types "Butter" into the search input (zero matches) and presses Enter
    await user.type(screen.getByPlaceholderText(/search items/i), 'Butter')
    await user.keyboard('{Enter}')

    // Then the item is created and assigned to the vendor, with no
    // intermediate dialog — this tab creates inline, like the shelves tab
    await waitFor(async () => {
      const items = await db.items.toArray()
      const butter = items.find((i) => i.name === 'Butter')
      expect(butter?.vendorIds).toContain(vendor.id)
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('user can create an item globally without stocking it in any location', async () => {
    // Given a vendor with no items. This tab edits a global item↔vendor
    // relation, so creating from search must not touch location-scoped
    // stock (D3).
    const vendor = await createVendor('Costco')
    renderItemsTab(vendor.id)
    const user = userEvent.setup()

    // When user creates "Butter" from the search box
    await user.click(
      await screen.findByRole('button', { name: /toggle search/i }),
    )
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search items/i)).toBeInTheDocument()
    })
    await user.type(screen.getByPlaceholderText(/search items/i), 'Butter')
    await user.keyboard('{Enter}')

    // Then the global Item exists and carries the vendor
    await waitFor(async () => {
      const items = await db.items.toArray()
      const butter = items.find((i) => i.name === 'Butter')
      expect(butter?.vendorIds).toContain(vendor.id)
    })

    // And no ItemStock row was written, in the active location or any other
    expect(await db.itemStocks.count()).toBe(0)
  })

  it('user sees create button when search has text and no exact item match', async () => {
    // Given a vendor with one item named "Milk"
    const vendor = await createVendor('Costco')
    await makeItem('Milk')
    renderItemsTab(vendor.id)
    const user = userEvent.setup()

    // When user opens the search panel
    await user.click(
      await screen.findByRole('button', { name: /toggle search/i }),
    )
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search items/i)).toBeInTheDocument()
    })

    // When user types text that partially matches "Milk" but is not an exact match
    await user.type(screen.getByPlaceholderText(/search items/i), 'mil')

    // Then the create button is visible (partial match ≠ exact match)
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /create item/i }),
      ).toBeInTheDocument()
      expect(screen.getByLabelText('Add Milk')).toBeInTheDocument()
    })

    // When user types an exact match (case-insensitive)
    await user.clear(screen.getByPlaceholderText(/search items/i))
    await user.type(screen.getByPlaceholderText(/search items/i), 'Milk')

    // Then the create button is gone (exact match exists)
    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: /create item/i }),
      ).not.toBeInTheDocument()
      expect(screen.getByLabelText('Add Milk')).toBeInTheDocument()
    })
  })

  it('user can create an item by clicking the create button in the search input', async () => {
    // Given a vendor with no items matching "Butter"
    const vendor = await createVendor('Costco')
    renderItemsTab(vendor.id)
    const user = userEvent.setup()

    // When user opens the search panel
    await user.click(
      await screen.findByRole('button', { name: /toggle search/i }),
    )

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search items/i)).toBeInTheDocument()
    })

    // When user types "Butter" and clicks the + create button inside the search input
    await user.type(screen.getByPlaceholderText(/search items/i), 'Butter')
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /create item/i }),
      ).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /create item/i }))

    // Then Butter is created and assigned to the vendor, with no dialog
    await waitFor(async () => {
      const items = await db.items.toArray()
      const butter = items.find((i) => i.name === 'Butter')
      expect(butter?.vendorIds).toContain(vendor.id)
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('user can clear the search by pressing Escape', async () => {
    // Given a vendor and the search input has text
    const vendor = await createVendor('Costco')
    renderItemsTab(vendor.id)
    const user = userEvent.setup()

    // When user opens the search panel
    await user.click(
      await screen.findByRole('button', { name: /toggle search/i }),
    )

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search items/i)).toBeInTheDocument()
    })
    await user.type(screen.getByPlaceholderText(/search items/i), 'xyz')

    // When user presses Escape
    await user.keyboard('{Escape}')

    // Then the search input is still visible but its value is cleared
    await waitFor(() => {
      const input = screen.getByPlaceholderText(/search items/i)
      expect(input).toBeInTheDocument()
      expect(input).toHaveValue('')
    })
  })

  it('user does not see the New button', async () => {
    // Given a vendor
    const vendor = await createVendor('Costco')
    renderItemsTab(vendor.id)

    // Then no New button is present
    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: /new/i }),
      ).not.toBeInTheDocument()
    })
  })

  it('user cannot see tag badges on items', async () => {
    // Given a vendor and an item with tags
    const vendor = await createVendor('Costco')
    const tagType = await createTagType({
      name: 'Location',
      color: TagColor.green,
    })
    const tag = await createTag({ name: 'Fridge', typeId: tagType.id })
    await makeItem('Milk')
    await createItem({
      name: 'Butter',
      targetUnit: 'package',
      targetQuantity: 1,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [tag.id],
      vendorIds: [],
    })

    renderItemsTab(vendor.id)

    // Then the item appears but its tag badges are not shown
    await waitFor(() => {
      expect(screen.getByLabelText('Add Butter')).toBeInTheDocument()
    })
    expect(screen.queryByText('Fridge')).not.toBeInTheDocument()
  })

  it('user can see assigned items listed before unassigned items regardless of sort', async () => {
    // Given: a vendor with two items — Milk is assigned (sorts after Apple alphabetically)
    const vendor = await createVendor('Supermart')
    await makeItem('Milk', [vendor.id]) // assigned — M comes after A
    await makeItem('Apple') // unassigned — A comes before M

    // When: user views the items tab (default sort: name asc)
    renderItemsTab(vendor.id)

    // Then: Milk (assigned) appears before Apple (unassigned)
    await waitFor(() => {
      const links = screen.getAllByRole('link', { name: /milk|apple/i })
      const names = links.map((el) => el.textContent?.trim() ?? '')
      expect(names[0]).toMatch(/milk/i)
      expect(names[1]).toMatch(/apple/i)
    })
  })

  it('user sees assigned items name-sorted regardless of the active location stock', async () => {
    // Given: a vendor with two assigned items — Zucchini stocked here, and
    // Apple stocked ONLY at another location. useItems() joins the active
    // location, so Apple arrives as ZERO_STOCK with no stockId: the documented
    // stockId trap (lib/quantityUtils.ts). Under the old four-bucket sort a
    // bare isInactive() therefore sank Apple below Zucchini.
    const vendor = await createVendor('Supermart')
    await makeItem('Zucchini', [vendor.id])
    await createItem(
      {
        name: 'Apple',
        targetUnit: 'package',
        targetQuantity: 2,
        refillThreshold: 1,
        packedQuantity: 0,
        unpackedQuantity: 0,
        consumeAmount: 1,
        tagIds: [],
        vendorIds: [vendor.id],
      },
      'loc-other',
    )
    // And an unassigned item that sorts first alphabetically
    await makeItem('Almond')

    // When: user views the items tab (default sort: name asc)
    renderItemsTab(vendor.id)

    // Then: both assigned items come first, name-sorted — Apple is a normal
    // row despite not being stocked here — and the unassigned item follows
    await waitFor(() => {
      expect(screen.getByLabelText('Remove Apple')).toBeInTheDocument()
    })
    const links = screen.getAllByRole('link', {
      name: /zucchini|apple|almond/i,
    })
    const names = links.map((el) => el.textContent?.trim() ?? '')
    expect(names[0]).toMatch(/apple/i)
    expect(names[1]).toMatch(/zucchini/i)
    expect(names[2]).toMatch(/almond/i)
  })

  it('user can sort items by name', async () => {
    // Given a vendor and items created out of alphabetical order
    const vendor = await createVendor('Costco')
    await makeItem('Yogurt')
    await makeItem('Butter')
    await makeItem('Milk')

    // When user navigates to items tab (default sort is name asc)
    renderItemsTab(vendor.id)

    // Then items are rendered in alphabetical order by name
    await waitFor(() => {
      const itemLinks = screen.getAllByRole('link', {
        name: /butter|milk|yogurt/i,
      })
      const names = itemLinks.map((el) => el.textContent?.trim() ?? '')
      expect(names[0]).toMatch(/butter/i)
      expect(names[1]).toMatch(/milk/i)
      expect(names[2]).toMatch(/yogurt/i)
    })
  })

  it('user can filter items using the tag filter', async () => {
    // Given a vendor and a tag type used as a filter
    const vendor = await createVendor('Costco')
    const filterTagType = await createTagType({
      name: 'Location',
      color: TagColor.green,
    })
    await createTag({ name: 'Fridge', typeId: filterTagType.id })
    await makeItem('Milk')

    const user = userEvent.setup()

    // When user navigates to the items tab
    renderItemsTab(vendor.id)

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /toggle filters/i }),
      ).toBeInTheDocument()
    })

    // When user clicks the Filter button to show filters
    await user.click(screen.getByRole('button', { name: /toggle filters/i }))

    // Then the ItemFilters component renders with filter dropdowns for tag types that have tags
    await waitFor(() => {
      expect(screen.getByText(/location/i)).toBeInTheDocument()
    })
  })

  it('user can search all items even when recipe filter is active', async () => {
    // Given a vendor, a recipe, and two items
    const vendor = await createVendor('Costco')
    const recipe = await createRecipe({ name: 'Pasta', items: [] })
    const milkItem = await createItem({
      name: 'Milk',
      tagIds: [],
      vendorIds: [],
      targetUnit: 'package',
      targetQuantity: 0,
      refillThreshold: 0,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 0,
    })
    await createItem({
      name: 'Eggs',
      tagIds: [],
      vendorIds: [],
      targetUnit: 'package',
      targetQuantity: 0,
      refillThreshold: 0,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 0,
    })
    // Add Milk to recipe but not Eggs
    await db.recipes.update(recipe.id, {
      items: [{ itemId: milkItem.id, defaultAmount: 1 }],
    })

    // When user loads vendor items tab with recipe filter active
    const history = createMemoryHistory({
      initialEntries: [
        `/settings/vendors/${vendor.id}/items?f_recipe=${recipe.id}`,
      ],
    })
    const router = createRouter({ routeTree, history })
    const user = userEvent.setup()
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )

    // And searches for "Eggs" (Eggs not in the recipe)
    await user.click(
      await screen.findByRole('button', { name: /toggle search/i }),
    )
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search items/i)).toBeInTheDocument()
    })
    await user.type(screen.getByPlaceholderText(/search items/i), 'Eggs')

    // Then Eggs appears (recipe filter bypassed during search)
    await waitFor(() => {
      expect(screen.getByText('Eggs')).toBeInTheDocument()
    })
  })

  it('user sees the new item in the list after creating from search', async () => {
    // Given a vendor with no items matching "brand new item"
    const vendor = await createVendor('Costco')
    renderItemsTab(vendor.id)
    const user = userEvent.setup()

    // When user opens the search panel
    await user.click(
      await screen.findByRole('button', { name: /toggle search/i }),
    )

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search items/i)).toBeInTheDocument()
    })

    // When user types a name that has zero matches
    await user.type(
      screen.getByPlaceholderText(/search items/i),
      'brand new item',
    )
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /create item/i }),
      ).toBeInTheDocument()
    })

    // When user clicks the create button
    await user.click(screen.getByRole('button', { name: /create item/i }))

    // Then the item is created and assigned to the vendor
    await waitFor(async () => {
      const items = await db.items.toArray()
      const newItem = items.find((i) => i.name === 'brand new item')
      expect(newItem?.vendorIds).toContain(vendor.id)
    })

    // And the search input still holds the query, so the row is visible
    expect(screen.getByPlaceholderText(/search items/i)).toHaveValue(
      'brand new item',
    )
    await waitFor(() => {
      expect(screen.getByLabelText('Remove brand new item')).toBeInTheDocument()
    })
  })

  it('user cannot see tag badges even when tags=1 param is set', async () => {
    // Given a vendor and an item with a tag
    const vendor = await createVendor('Costco')
    const categoryType = await createTagType({
      name: 'Category',
      color: 'blue',
    })
    const vegTag = await createTag({
      typeId: categoryType.id,
      name: 'Vegetables',
    })
    await createItem({
      name: 'Tomatoes',
      tagIds: [vegTag.id],
      vendorIds: [vendor.id],
      targetUnit: 'package',
      targetQuantity: 0,
      refillThreshold: 0,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 0,
    })

    // When the vendor items page is loaded with that tag filter active and tags=1 in the URL
    const history = createMemoryHistory({
      initialEntries: [
        `/settings/vendors/${vendor.id}/items?f_${categoryType.id}=${vegTag.id}&tags=1`,
      ],
    })
    const router = createRouter({ routeTree, history })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )

    // Then the item appears but tag badges are not shown (tags always hidden on this page)
    await waitFor(() => {
      expect(screen.getByLabelText('Remove Tomatoes')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('tag-badge-Vegetables')).not.toBeInTheDocument()
  })

  it('user cannot create a duplicate of an assigned item that is stocked elsewhere', async () => {
    // Given a vendor and an item already assigned to it but stocked ONLY at
    // another location. useItems() surfaces it anyway (zeroed, no stockId),
    // so the exact-name check must see it — otherwise create-from-search
    // would mint a second "Butter". Replaces the old select-existing
    // duplication guard, which lost its subject when the dialog was removed.
    const vendor = await createVendor('Costco')
    const item = await createItem(
      { name: 'Butter', tagIds: [], vendorIds: [vendor.id] },
      'loc-other',
    )
    await db.itemStocks.where('locationId').equals('local').delete()

    renderItemsTab(vendor.id)
    const user = userEvent.setup()

    // When user types the existing name and presses Enter
    await user.click(
      await screen.findByRole('button', { name: /toggle search/i }),
    )
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search items/i)).toBeInTheDocument()
    })
    await user.type(screen.getByPlaceholderText(/search items/i), 'Butter')
    await waitFor(() => {
      expect(screen.getByLabelText('Remove Butter')).toBeInTheDocument()
    })
    await user.keyboard('{Enter}')

    // Then no create affordance is offered and nothing is written
    expect(
      screen.queryByRole('button', { name: /create item/i }),
    ).not.toBeInTheDocument()
    expect(await db.items.count()).toBe(1)
    const updated = await db.items.get(item.id)
    expect(updated?.vendorIds?.filter((id) => id === vendor.id)).toHaveLength(1)
  })
})
