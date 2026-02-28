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
  createTag,
  createTagType,
  createVendor,
} from '@/db/operations'
import { routeTree } from '@/routeTree.gen'
import { TagColor } from '@/types'

describe('Tag Detail - Items Tab', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.items.clear()
    await db.tags.clear()
    await db.tagTypes.clear()
    await db.inventoryLogs.clear()
    await db.vendors.clear()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  const renderItemsTab = (tagId: string) => {
    const history = createMemoryHistory({
      initialEntries: [`/settings/tags/${tagId}/items`],
    })
    const router = createRouter({ routeTree, history })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
  }

  const makeItem = (name: string, tagIds: string[] = []) =>
    createItem({
      name,
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds,
      vendorIds: [],
    })

  it('user can see all items in the checklist', async () => {
    // Given a tag type, tag, and two items
    const tagType = await createTagType({
      name: 'Category',
      color: TagColor.blue,
    })
    const tag = await createTag({ name: 'Dairy', typeId: tagType.id })
    await makeItem('Milk')
    await makeItem('Eggs')

    renderItemsTab(tag.id)

    // Then both items appear in the list
    await waitFor(() => {
      expect(screen.getByLabelText('Add Milk')).toBeInTheDocument()
      expect(screen.getByLabelText('Add Eggs')).toBeInTheDocument()
    })
  })

  it('user can see already-assigned items as checked', async () => {
    // Given a tag and an item already assigned to it
    const tagType = await createTagType({
      name: 'Category',
      color: TagColor.blue,
    })
    const tag = await createTag({ name: 'Dairy', typeId: tagType.id })
    await makeItem('Milk', [tag.id])
    await makeItem('Eggs')

    renderItemsTab(tag.id)

    // Then Milk's checkbox is checked and Eggs' is not
    await waitFor(() => {
      expect(screen.getByLabelText('Remove Milk')).toBeChecked()
      expect(screen.getByLabelText('Add Eggs')).not.toBeChecked()
    })
  })

  it('user can filter items by name', async () => {
    // Given a tag and two items
    const tagType = await createTagType({
      name: 'Category',
      color: TagColor.blue,
    })
    const tag = await createTag({ name: 'Dairy', typeId: tagType.id })
    await makeItem('Milk')
    await makeItem('Eggs')

    renderItemsTab(tag.id)
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

  it('user can assign this tag to an item by clicking the checkbox', async () => {
    // Given a tag and an unassigned item
    const tagType = await createTagType({
      name: 'Category',
      color: TagColor.blue,
    })
    const tag = await createTag({ name: 'Dairy', typeId: tagType.id })
    const item = await makeItem('Milk')

    renderItemsTab(tag.id)
    const user = userEvent.setup()

    // When user clicks the checkbox
    await waitFor(() => {
      expect(screen.getByLabelText('Add Milk')).toBeInTheDocument()
    })
    await user.click(screen.getByLabelText('Add Milk'))

    // Then the item now has this tag assigned in the DB
    await waitFor(async () => {
      const updated = await db.items.get(item.id)
      expect(updated?.tagIds).toContain(tag.id)
    })
  })

  it('user can remove this tag from an item by clicking the checkbox', async () => {
    // Given a tag already assigned to an item
    const tagType = await createTagType({
      name: 'Category',
      color: TagColor.blue,
    })
    const tag = await createTag({ name: 'Dairy', typeId: tagType.id })
    const item = await makeItem('Milk', [tag.id])

    renderItemsTab(tag.id)
    const user = userEvent.setup()

    // When user unchecks the item
    await waitFor(() => {
      expect(screen.getByLabelText('Remove Milk')).toBeChecked()
    })
    await user.click(screen.getByLabelText('Remove Milk'))

    // Then the tag is removed from the item in the DB
    await waitFor(async () => {
      const updated = await db.items.get(item.id)
      expect(updated?.tagIds ?? []).not.toContain(tag.id)
    })
  })

  it('user can see other tags as badges on items', async () => {
    // Given a tag and an item with other tags
    const tagType = await createTagType({
      name: 'Category',
      color: TagColor.blue,
    })
    const tag = await createTag({ name: 'Dairy', typeId: tagType.id })
    const otherTagType = await createTagType({
      name: 'Location',
      color: TagColor.green,
    })
    const otherTag = await createTag({
      name: 'Fridge',
      typeId: otherTagType.id,
    })
    await makeItem('Milk', [otherTag.id])

    renderItemsTab(tag.id)
    const user = userEvent.setup()

    // When user toggles tags visible
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /toggle tags/i }),
      ).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /toggle tags/i }))

    // Then the other tag appears as a badge
    await waitFor(() => {
      expect(screen.getByText('Fridge')).toBeInTheDocument()
    })
  })

  it('user can create an item by typing a name and pressing Enter', async () => {
    // Given a tag with no items matching "Butter"
    const tagType = await createTagType({
      name: 'Category',
      color: TagColor.blue,
    })
    const tag = await createTag({ name: 'Dairy', typeId: tagType.id })
    renderItemsTab(tag.id)
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

    // Then the new item appears in the list checked (assigned to tag)
    await waitFor(() => {
      expect(screen.getByLabelText('Remove Butter')).toBeChecked()
    })

    await waitFor(async () => {
      const items = await db.items.toArray()
      const butter = items.find((i) => i.name === 'Butter')
      expect(butter?.tagIds).toContain(tag.id)
    })
  })

  it('user sees the create button only when search has text and zero items match', async () => {
    // Given a tag with one item
    const tagType = await createTagType({
      name: 'Category',
      color: TagColor.blue,
    })
    const tag = await createTag({ name: 'Dairy', typeId: tagType.id })
    await makeItem('Milk')
    renderItemsTab(tag.id)
    const user = userEvent.setup()

    // When user opens the search panel
    await user.click(
      await screen.findByRole('button', { name: /toggle search/i }),
    )

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search items/i)).toBeInTheDocument()
    })

    // When user types text that matches no items
    await user.type(screen.getByPlaceholderText(/search items/i), 'xyz')

    // Then the create button (+ inside search input) is visible
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /create item/i }),
      ).toBeInTheDocument()
    })

    // When user clears the input and types text that matches an item
    await user.clear(screen.getByPlaceholderText(/search items/i))
    await user.type(screen.getByPlaceholderText(/search items/i), 'mil')

    // Then the create button is not shown (Milk matched) and Milk appears
    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: /create item/i }),
      ).not.toBeInTheDocument()
      expect(screen.getByLabelText('Add Milk')).toBeInTheDocument()
    })
  })

  it('user can create an item by clicking the create button in the search input', async () => {
    // Given a tag with no items matching "Butter"
    const tagType = await createTagType({
      name: 'Category',
      color: TagColor.blue,
    })
    const tag = await createTag({ name: 'Dairy', typeId: tagType.id })
    renderItemsTab(tag.id)
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

    // Then Butter appears in the list checked (assigned to tag)
    await waitFor(() => {
      expect(screen.getByLabelText('Remove Butter')).toBeChecked()
    })
  })

  it('user can clear the search by pressing Escape', async () => {
    // Given a tag and the search input has text
    const tagType = await createTagType({
      name: 'Category',
      color: TagColor.blue,
    })
    const tag = await createTag({ name: 'Dairy', typeId: tagType.id })
    renderItemsTab(tag.id)
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

    // Then the search panel is hidden
    await waitFor(() => {
      expect(
        screen.queryByPlaceholderText(/search items/i),
      ).not.toBeInTheDocument()
    })
  })

  it('user does not see the New button', async () => {
    // Given a tag
    const tagType = await createTagType({
      name: 'Category',
      color: TagColor.blue,
    })
    const tag = await createTag({ name: 'Dairy', typeId: tagType.id })
    renderItemsTab(tag.id)

    // Then no New button is present
    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: /new/i }),
      ).not.toBeInTheDocument()
    })
  })

  it('shows No items yet when there are no items', async () => {
    // Given a tag with no items
    const tagType = await createTagType({
      name: 'Category',
      color: TagColor.blue,
    })
    const tag = await createTag({ name: 'Dairy', typeId: tagType.id })
    renderItemsTab(tag.id)

    // Then shows empty state message
    await waitFor(() => {
      expect(screen.getByText(/no items yet/i)).toBeInTheDocument()
    })
  })

  it('user can see create prompt when search input has no matches', async () => {
    // Given a tag with items
    const tagType = await createTagType({
      name: 'Category',
      color: TagColor.blue,
    })
    const tag = await createTag({ name: 'Dairy', typeId: tagType.id })
    await makeItem('Milk')
    await makeItem('Eggs')

    renderItemsTab(tag.id)
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

  it('user can search all items even when vendor filter is active', async () => {
    // Given a tag, a vendor, and two items
    const tagType = await createTagType({
      name: 'Category',
      color: TagColor.blue,
    })
    const tag = await createTag({ name: 'Dairy', typeId: tagType.id })
    const vendor = await createVendor('Costco')
    await createItem({
      name: 'Milk',
      tagIds: [],
      vendorIds: [vendor.id],
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

    // When user loads tag items tab with vendor filter active
    const history = createMemoryHistory({
      initialEntries: [`/settings/tags/${tag.id}/items?f_vendor=${vendor.id}`],
    })
    const router = createRouter({ routeTree, history })
    const user = userEvent.setup()
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )

    // And searches for "Eggs" (Eggs not assigned to vendor)
    await user.click(
      await screen.findByRole('button', { name: /toggle search/i }),
    )
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search items/i)).toBeInTheDocument()
    })
    await user.type(screen.getByPlaceholderText(/search items/i), 'Eggs')

    // Then Eggs appears (vendor filter bypassed during search)
    await waitFor(() => {
      expect(screen.getByText('Eggs')).toBeInTheDocument()
    })
  })

  it('user can see sort and filter toolbar controls', async () => {
    // Given a tag exists
    const tagType = await createTagType({
      name: 'Category',
      color: TagColor.blue,
    })
    const tag = await createTag({ name: 'Dairy', typeId: tagType.id })

    // When user navigates to the items tab
    renderItemsTab(tag.id)

    // Then sort and filter toolbar controls are visible
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /toggle filters/i }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /toggle tags/i }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /sort by criteria/i }),
      ).toBeInTheDocument()
    })
  })

  it('user can sort items by name', async () => {
    // Given a tag and items created out of alphabetical order
    const tagType = await createTagType({
      name: 'Category',
      color: TagColor.blue,
    })
    const tag = await createTag({ name: 'Dairy', typeId: tagType.id })

    await makeItem('Yogurt')
    await makeItem('Butter')
    await makeItem('Milk')

    // When user navigates to items tab (default sort is name asc)
    renderItemsTab(tag.id)

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
    // Given a primary tag and a second tag type used as a filter
    const primaryTagType = await createTagType({
      name: 'Category',
      color: TagColor.blue,
    })
    const primaryTag = await createTag({
      name: 'Dairy',
      typeId: primaryTagType.id,
    })
    const filterTagType = await createTagType({
      name: 'Location',
      color: TagColor.green,
    })
    await createTag({ name: 'Fridge', typeId: filterTagType.id })
    await makeItem('Milk', [primaryTag.id])

    const user = userEvent.setup()

    // When user navigates to the items tab
    renderItemsTab(primaryTag.id)

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

  it('user sees the new item in the list after creating from search (search not cleared)', async () => {
    // Given a tag with no items matching "brand new item"
    const tagType = await createTagType({
      name: 'Category',
      color: TagColor.blue,
    })
    const tag = await createTag({ name: 'Dairy', typeId: tagType.id })
    renderItemsTab(tag.id)
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

    // Then search input still contains the query (search is not cleared)
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search items/i)).toHaveValue(
        'brand new item',
      )
    })

    // And the new item appears in the list
    await waitFor(() => {
      expect(screen.getByLabelText('Remove brand new item')).toBeInTheDocument()
    })
  })
})
