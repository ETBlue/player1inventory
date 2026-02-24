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

describe('Vendor Detail - Items Tab', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.items.clear()
    await db.tags.clear()
    await db.tagTypes.clear()
    await db.vendors.clear()
    await db.inventoryLogs.clear()
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

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText(/search or create/i),
      ).toBeInTheDocument()
    })

    // When user types "mil"
    await user.type(screen.getByPlaceholderText(/search or create/i), 'mil')

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
        screen.getByRole('button', { name: /toggle tags/i }),
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

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText(/search or create/i),
      ).toBeInTheDocument()
    })

    // When user searches for non-existent item
    await user.type(screen.getByPlaceholderText(/search or create/i), 'xyz')

    // Then the create row appears (zero-match state), not a "no results" message
    await waitFor(() => {
      expect(screen.getByText(/create "xyz"/i)).toBeInTheDocument()
    })
  })

  it('user can create an item by typing a name and pressing Enter', async () => {
    // Given a vendor with no items matching "Butter"
    const vendor = await createVendor('Costco')
    renderItemsTab(vendor.id)
    const user = userEvent.setup()

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText(/search or create/i),
      ).toBeInTheDocument()
    })

    // When user types "Butter" into the search input (zero matches) and presses Enter
    await user.type(screen.getByPlaceholderText(/search or create/i), 'Butter')
    await user.keyboard('{Enter}')

    // Then the new item appears in the list checked (assigned to the vendor)
    await waitFor(() => {
      expect(screen.getByLabelText('Remove Butter')).toBeChecked()
    })

    await waitFor(async () => {
      const items = await db.items.toArray()
      const butter = items.find((i) => i.name === 'Butter')
      expect(butter?.vendorIds).toContain(vendor.id)
    })
  })

  it('user sees a create row only when search has text and zero items match', async () => {
    // Given a vendor with one item
    const vendor = await createVendor('Costco')
    await makeItem('Milk')
    renderItemsTab(vendor.id)
    const user = userEvent.setup()

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText(/search or create/i),
      ).toBeInTheDocument()
    })

    // When user types text that matches no items
    await user.type(screen.getByPlaceholderText(/search or create/i), 'xyz')

    // Then the create row is visible
    await waitFor(() => {
      expect(screen.getByText(/create "xyz"/i)).toBeInTheDocument()
    })

    // When user clears the input and types text that matches an item
    await user.clear(screen.getByPlaceholderText(/search or create/i))
    await user.type(screen.getByPlaceholderText(/search or create/i), 'mil')

    // Then the create row is not shown (Milk matched)
    await waitFor(() => {
      expect(screen.queryByText(/create/i)).not.toBeInTheDocument()
      expect(screen.getByLabelText('Add Milk')).toBeInTheDocument()
    })
  })

  it('user can create an item by clicking the create row', async () => {
    // Given a vendor with no items matching "Butter"
    const vendor = await createVendor('Costco')
    renderItemsTab(vendor.id)
    const user = userEvent.setup()

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText(/search or create/i),
      ).toBeInTheDocument()
    })

    // When user types "Butter" and clicks the create row
    await user.type(screen.getByPlaceholderText(/search or create/i), 'Butter')
    await waitFor(() => {
      expect(screen.getByText(/create "Butter"/i)).toBeInTheDocument()
    })
    await user.click(screen.getByText(/create "Butter"/i))

    // Then Butter appears in the list checked and the input is cleared
    await waitFor(() => {
      expect(screen.getByLabelText('Remove Butter')).toBeChecked()
      expect(screen.getByPlaceholderText(/search or create/i)).toHaveValue('')
    })
  })

  it('user can clear the search by pressing Escape', async () => {
    // Given a vendor and the search input has text
    const vendor = await createVendor('Costco')
    renderItemsTab(vendor.id)
    const user = userEvent.setup()

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText(/search or create/i),
      ).toBeInTheDocument()
    })
    await user.type(screen.getByPlaceholderText(/search or create/i), 'xyz')

    // When user presses Escape
    await user.keyboard('{Escape}')

    // Then the input is cleared
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search or create/i)).toHaveValue('')
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

  it('user can see other tags as badges on items', async () => {
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
    const user = userEvent.setup()

    // When user toggles tags visible
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /toggle tags/i }),
      ).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /toggle tags/i }))

    // Then the tag appears as a badge on Butter
    await waitFor(() => {
      expect(screen.getByText('Fridge')).toBeInTheDocument()
    })
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
})
