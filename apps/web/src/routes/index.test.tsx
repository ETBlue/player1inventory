// src/routes/index.test.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, ensureDefaultLocationRow } from '@/db'
import {
  createItem,
  createLocation,
  createRecipe,
  createShelf,
  createTag,
  createTagType,
  createVendor,
} from '@/db/operations'
import * as useShelvesModule from '@/hooks/useShelves'
import { routeTree } from '@/routeTree.gen'
import { DEFAULT_LOCATION_ID } from '@/types'

describe('Home page filtering integration', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.items.clear()
    await db.itemStocks.clear()
    await db.tags.clear()
    await db.tagTypes.clear()
    await db.inventoryLogs.clear()
    await db.vendors.clear()
    await db.recipes.clear()
    await db.locations.clear()
    sessionStorage.clear()
    localStorage.clear()

    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    await ensureDefaultLocationRow()
  })

  const renderApp = () => {
    const history = createMemoryHistory({ initialEntries: ['/'] })
    const router = createRouter({ routeTree, history })

    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
  }

  it('user can create an item from the pantry and it is stocked in the active location', async () => {
    // Given a pantry with one item (an empty catalog sends the app to
    // onboarding instead). Unlike the Settings assignment tabs (D3), the
    // pantry's Add flow must keep stocking the new item here — this is the
    // other half of the opt-in and the reason it is opt-in at all.
    await createItem({ name: 'Milk', tagIds: [] })
    renderApp()
    const user = userEvent.setup()

    // When user opens the Add dialog and creates "Butter"
    await user.click(await screen.findByRole('button', { name: /add item/i }))
    const dialog = await screen.findByRole('dialog')
    await user.type(
      within(dialog).getByRole('combobox', { name: /name/i }),
      'Butter',
    )
    await user.click(within(dialog).getByRole('button', { name: /create/i }))

    // Then the item is stocked in the active location
    await waitFor(async () => {
      const butter = (await db.items.toArray()).find((i) => i.name === 'Butter')
      expect(butter).toBeDefined()
      const stocks = await db.itemStocks
        .where('itemId')
        .equals(butter?.id ?? '')
        .toArray()
      expect(stocks).toHaveLength(1)
      expect(stocks[0]?.locationId).toBe(DEFAULT_LOCATION_ID)
    })
  })

  it('user can filter items by selecting tags', async () => {
    // Given items with tags
    const categoryType = await createTagType({
      name: 'Category',
      color: 'blue',
    })
    const locationtype = await createTagType({
      name: 'Location',
      color: 'green',
    })

    const vegTag = await createTag({
      typeId: categoryType.id,
      name: 'Vegetables',
    })
    const fruitTag = await createTag({
      typeId: categoryType.id,
      name: 'Fruits',
    })
    const fridgeTag = await createTag({
      typeId: locationtype.id,
      name: 'Fridge',
    })
    const pantryTag = await createTag({
      typeId: locationtype.id,
      name: 'Pantry',
    })

    await createItem({
      name: 'Tomatoes',
      tagIds: [vegTag.id, fridgeTag.id],
      targetQuantity: 5,
      refillThreshold: 2,
    })
    await createItem({
      name: 'Apples',
      tagIds: [fruitTag.id, fridgeTag.id],
      targetQuantity: 10,
      refillThreshold: 3,
    })
    await createItem({
      name: 'Pasta',
      tagIds: [pantryTag.id],
      targetQuantity: 3,
      refillThreshold: 1,
    })

    const user = userEvent.setup()
    renderApp()

    // When user enables filters visibility
    await waitFor(() => {
      expect(screen.getByText('Tomatoes')).toBeInTheDocument()
    })
    const filtersButton = screen.getByRole('button', { name: /filters/i })
    await user.click(filtersButton)

    // And opens Category dropdown
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /category/i }),
      ).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /category/i }))

    // And selects Vegetables
    await user.click(
      screen.getByRole('menuitemcheckbox', { name: /vegetables/i }),
    )

    // Then only tomatoes shown
    await waitFor(() => {
      expect(screen.getByText('Tomatoes')).toBeInTheDocument()
      expect(screen.queryByText('Apples')).not.toBeInTheDocument()
      expect(screen.queryByText('Pasta')).not.toBeInTheDocument()
    })

    // When user selects Fruits (menu stays open)
    await user.click(screen.getByRole('menuitemcheckbox', { name: /fruits/i }))

    // Then both tomatoes and apples shown (OR logic)
    await waitFor(() => {
      expect(screen.getByText('Tomatoes')).toBeInTheDocument()
      expect(screen.getByText('Apples')).toBeInTheDocument()
      expect(screen.queryByText('Pasta')).not.toBeInTheDocument()
    })

    // Close Category dropdown by pressing Escape
    await user.keyboard('{Escape}')

    // When user opens Location dropdown and selects Pantry
    // Anchor the name so it matches the "Location" tag-type filter button only,
    // not the global LocationSwitcher trigger ("Switch location …").
    await user.click(screen.getByRole('button', { name: /^location/i }))
    await user.click(screen.getByRole('menuitemcheckbox', { name: /pantry/i }))

    // Then no items shown (AND logic across types)
    await waitFor(() => {
      expect(
        screen.getByText(/no items match the current filters/i),
      ).toBeInTheDocument()
    })

    // Close Location dropdown
    await user.keyboard('{Escape}')

    // When user clicks clear filter
    await user.click(screen.getByRole('button', { name: /clear filter/i }))

    // Then all items shown again
    await waitFor(() => {
      expect(screen.getByText('Tomatoes')).toBeInTheDocument()
      expect(screen.getByText('Apples')).toBeInTheDocument()
      expect(screen.getByText('Pasta')).toBeInTheDocument()
    })
  })

  it('user can click tag badge to activate filter', async () => {
    // Given items with tags
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
      targetQuantity: 5,
      refillThreshold: 2,
    })
    await createItem({
      name: 'Apples',
      tagIds: [],
      targetQuantity: 10,
      refillThreshold: 3,
    })

    const user = userEvent.setup()
    renderApp()

    // When user enables relation visibility (shows tag/vendor/recipe badges)
    await waitFor(() => {
      expect(screen.getByText('Tomatoes')).toBeInTheDocument()
    })
    const relationsButton = screen.getByRole('button', {
      name: /toggle relations/i,
    })
    await user.click(relationsButton)

    // And clicks Vegetables tag badge on Tomatoes card
    const vegBadge = screen.getByText('Vegetables')
    await user.click(vegBadge)

    // Then only Tomatoes shown
    await waitFor(() => {
      expect(screen.getByText('Tomatoes')).toBeInTheDocument()
      expect(screen.queryByText('Apples')).not.toBeInTheDocument()
    })

    // When user enables filters visibility to see the dropdown
    const filtersButton = screen.getByRole('button', { name: /filters/i })
    await user.click(filtersButton)

    // Then Category dropdown shows active state (variant changes from outline to solid)
    const categoryButton = screen.getByRole('button', { name: /category/i })
    expect(categoryButton.className).toContain('blue')
  })

  it('user can toggle filters visibility', async () => {
    const user = userEvent.setup()

    const categoryType = await createTagType({
      name: 'Category',
      color: 'blue',
    })
    const vegTag = await createTag({
      typeId: categoryType.id,
      name: 'Vegetables',
    })
    await createItem({ name: 'Tomatoes', tagIds: [vegTag.id] })

    renderApp()

    await waitFor(() => {
      expect(screen.getByText('Tomatoes')).toBeInTheDocument()
    })

    // Initially filters hidden (default)
    expect(
      screen.queryByRole('button', { name: /category/i }),
    ).not.toBeInTheDocument()

    // Click filter button to show
    await user.click(screen.getByRole('button', { name: /toggle filters/i }))

    // Filters now visible
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /category/i }),
      ).toBeInTheDocument()
    })
  })

  it('user can toggle tag visibility', async () => {
    const user = userEvent.setup()

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
      targetQuantity: 5,
      refillThreshold: 2,
    })

    renderApp()

    await waitFor(() => {
      expect(screen.getByText('Tomatoes')).toBeInTheDocument()
    })

    // Initially tags hidden - shows count
    expect(screen.getByText('1 tag')).toBeInTheDocument()
    expect(screen.queryByText('Vegetables')).not.toBeInTheDocument()

    // Click relations toggle to show tags/vendors/recipes on cards
    await user.click(screen.getByRole('button', { name: /toggle relations/i }))

    // Now shows individual badges
    await waitFor(() => {
      expect(screen.queryByText('1 tag')).not.toBeInTheDocument()
      expect(screen.getByText('Vegetables')).toBeInTheDocument()
    })
  })

  it('user can sort items by name', async () => {
    const user = userEvent.setup()

    await createItem({
      name: 'Tomatoes',
      targetQuantity: 5,
      refillThreshold: 2,
    })
    await createItem({ name: 'Apples', targetQuantity: 10, refillThreshold: 3 })
    await createItem({ name: 'Pasta', targetQuantity: 3, refillThreshold: 1 })

    renderApp()

    await waitFor(() => {
      expect(screen.getByText('Tomatoes')).toBeInTheDocument()
    })

    // Open sort menu
    await user.click(screen.getByRole('button', { name: /sort by criteria/i }))

    // Select Name
    await user.click(screen.getByRole('menuitem', { name: /^name$/i }))

    // Items now alphabetical
    await waitFor(() => {
      const items = screen.getAllByRole('heading', { level: 3 })
      expect(items[0]).toHaveTextContent('Apples')
      expect(items[1]).toHaveTextContent('Pasta')
      expect(items[2]).toHaveTextContent('Tomatoes')
    })
  })

  it('user can toggle sort direction', async () => {
    const user = userEvent.setup()

    await createItem({ name: 'Apples', targetQuantity: 10, refillThreshold: 3 })
    await createItem({
      name: 'Zucchini',
      targetQuantity: 5,
      refillThreshold: 2,
    })

    renderApp()

    await waitFor(() => {
      expect(screen.getByText('Apples')).toBeInTheDocument()
    })

    // Sort by name ascending
    await user.click(screen.getByRole('button', { name: /sort by criteria/i }))
    await user.click(screen.getByRole('menuitem', { name: /^name$/i }))

    await waitFor(() => {
      const items = screen.getAllByRole('heading', { level: 3 })
      expect(items[0]).toHaveTextContent('Apples')
    })

    // Toggle direction
    await user.click(
      screen.getByRole('button', { name: /toggle sort direction/i }),
    )

    // Now descending
    await waitFor(() => {
      const items = screen.getAllByRole('heading', { level: 3 })
      expect(items[0]).toHaveTextContent('Zucchini')
    })
  })

  it('shows inactive items always visible with a count label', async () => {
    // Create inactive item (target = 0, current = 0)
    await createItem({
      name: 'Inactive Item',
      packageUnit: 'pack',
      targetUnit: 'package',
      targetQuantity: 0,
      refillThreshold: 0,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
    })

    // Create active item
    await createItem({
      name: 'Active Item',
      packageUnit: 'pack',
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 1,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
    })

    renderApp()

    // Both items should be visible
    await waitFor(() => {
      expect(screen.getByText('Active Item')).toBeInTheDocument()
      expect(screen.getByText('Inactive Item')).toBeInTheDocument()
    })

    // Should show static count label (not a toggle button)
    expect(screen.getByText(/1 inactive item/i)).toBeInTheDocument()
  })

  it('shows ItemFilters when toggle is on', async () => {
    const user = userEvent.setup()

    const categoryType = await createTagType({
      name: 'Category',
      color: 'blue',
    })
    const vegTag = await createTag({
      typeId: categoryType.id,
      name: 'Vegetables',
    })
    await createItem({ name: 'Tomatoes', tagIds: [vegTag.id] })

    renderApp()

    await waitFor(() => {
      expect(screen.getByText('Tomatoes')).toBeInTheDocument()
    })

    // Click filter button to show ItemFilters
    await user.click(screen.getByRole('button', { name: /toggle filters/i }))

    // ItemFilters should render with dropdowns
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /category/i }),
      ).toBeInTheDocument()
    })

    // Status bar should also be visible
    expect(screen.getByText('Showing 1 of 1 items')).toBeInTheDocument()
  })

  it('shows FilterStatus when filters active but toggle off', async () => {
    const user = userEvent.setup()

    const categoryType = await createTagType({
      name: 'Category',
      color: 'blue',
    })
    const vegTag = await createTag({
      typeId: categoryType.id,
      name: 'Vegetables',
    })
    await createItem({ name: 'Tomatoes', tagIds: [vegTag.id] })
    await createItem({ name: 'Apples', tagIds: [] })

    renderApp()

    await waitFor(() => {
      expect(screen.getByText('Tomatoes')).toBeInTheDocument()
    })

    // Enable filters and select a tag
    await user.click(screen.getByRole('button', { name: /toggle filters/i }))
    await user.click(screen.getByRole('button', { name: /category/i }))
    await user.click(
      screen.getByRole('menuitemcheckbox', { name: /vegetables/i }),
    )

    // Verify filter is active - only Tomatoes shown
    await waitFor(() => {
      expect(screen.getByText('Tomatoes')).toBeInTheDocument()
      expect(screen.queryByText('Apples')).not.toBeInTheDocument()
    })

    // Close dropdown
    await user.keyboard('{Escape}')

    // Toggle filters OFF
    await user.click(screen.getByRole('button', { name: /toggle filters/i }))

    // FilterStatus should be visible (compact view)
    await waitFor(() => {
      expect(screen.getByText('Showing 1 of 2 items')).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /clear filter/i }),
      ).toBeInTheDocument()
    })

    // Tag dropdowns should NOT be visible
    expect(
      screen.queryByRole('button', { name: /category/i }),
    ).not.toBeInTheDocument()
  })

  it('hides FilterStatus when no filters active and toggle off', async () => {
    const _user = userEvent.setup()

    const categoryType = await createTagType({
      name: 'Category',
      color: 'blue',
    })
    const vegTag = await createTag({
      typeId: categoryType.id,
      name: 'Vegetables',
    })
    await createItem({ name: 'Tomatoes', tagIds: [vegTag.id] })

    renderApp()

    await waitFor(() => {
      expect(screen.getByText('Tomatoes')).toBeInTheDocument()
    })

    // With filters toggle OFF and no active filters
    // FilterStatus should NOT be visible
    expect(screen.queryByText(/showing.*items/i)).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /clear filter/i }),
    ).not.toBeInTheDocument()
  })

  it('clears filters when clear button clicked in FilterStatus', async () => {
    const user = userEvent.setup()

    const categoryType = await createTagType({
      name: 'Category',
      color: 'blue',
    })
    const vegTag = await createTag({
      typeId: categoryType.id,
      name: 'Vegetables',
    })
    await createItem({ name: 'Tomatoes', tagIds: [vegTag.id] })
    await createItem({ name: 'Apples', tagIds: [] })

    renderApp()

    await waitFor(() => {
      expect(screen.getByText('Tomatoes')).toBeInTheDocument()
    })

    // Enable filters and select a tag
    await user.click(screen.getByRole('button', { name: /toggle filters/i }))
    await user.click(screen.getByRole('button', { name: /category/i }))
    await user.click(
      screen.getByRole('menuitemcheckbox', { name: /vegetables/i }),
    )

    await waitFor(() => {
      expect(screen.getByText('Tomatoes')).toBeInTheDocument()
      expect(screen.queryByText('Apples')).not.toBeInTheDocument()
    })

    // Close dropdown and toggle filters OFF
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: /toggle filters/i }))

    // FilterStatus should be visible
    await waitFor(() => {
      expect(screen.getByText('Showing 1 of 2 items')).toBeInTheDocument()
    })

    // Click clear button in FilterStatus
    await user.click(screen.getByRole('button', { name: /clear filter/i }))

    // Filters should be cleared - all items shown
    await waitFor(() => {
      expect(screen.getByText('Tomatoes')).toBeInTheDocument()
      expect(screen.getByText('Apples')).toBeInTheDocument()
    })

    // FilterStatus should disappear
    expect(screen.queryByText(/showing.*items/i)).not.toBeInTheDocument()
  })

  it('user can search all items even when vendor filter is active', async () => {
    // Given two items and a vendor
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

    // When user loads pantry with vendor filter active
    const history = createMemoryHistory({
      initialEntries: [`/?f_vendor=${vendor.id}`],
    })
    const router = createRouter({ routeTree, history })
    const user = userEvent.setup()
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )

    // And opens search and types "Eggs" (Eggs is not assigned to the vendor)
    await user.click(
      await screen.findByRole('button', { name: /toggle search/i }),
    )
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search items/i)).toBeInTheDocument()
    })
    await user.type(screen.getByPlaceholderText(/search items/i), 'Eggs')

    // Then Eggs appears (vendor filter is bypassed during search)
    await waitFor(() => {
      expect(screen.getByText('Eggs')).toBeInTheDocument()
    })
  })

  it('vendor badge is filled when vendor filter is active', async () => {
    // Given an item assigned to a vendor
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

    // When pantry is loaded with vendor filter active and tags visible
    const history = createMemoryHistory({
      initialEntries: [`/?f_vendor=${vendor.id}&tags=1`],
    })
    const router = createRouter({ routeTree, history })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )

    // Then the vendor badge on the item card uses the filled (neutral) style
    await waitFor(() => {
      const badge = screen.getByTestId('vendor-badge-Costco')
      expect(badge.className).toContain('bg-importance-neutral-background')
    })
  })

  it('vendor badge is outline when vendor filter is not active', async () => {
    // Given an item assigned to a vendor
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

    // When pantry is loaded with no vendor filter and tags visible
    const history = createMemoryHistory({
      initialEntries: ['/?tags=1'],
    })
    const router = createRouter({ routeTree, history })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )

    // Then the vendor badge uses the outline (neutral-outline) style
    await waitFor(() => {
      const badge = screen.getByTestId('vendor-badge-Costco')
      expect(badge.className).not.toContain('bg-importance-neutral-background')
    })
  })

  it('recipe badge is filled when recipe filter is active', async () => {
    // Given an item assigned to a recipe
    const item = await createItem({
      name: 'Milk',
      tagIds: [],
      targetUnit: 'package',
      targetQuantity: 0,
      refillThreshold: 0,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 0,
    })
    const recipe = await createRecipe({
      name: 'Cereal Bowl',
      items: [{ itemId: item.id, defaultAmount: 1 }],
    })

    // When pantry is loaded with recipe filter active and tags visible
    const history = createMemoryHistory({
      initialEntries: [`/?f_recipe=${recipe.id}&tags=1`],
    })
    const router = createRouter({ routeTree, history })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )

    // Then the recipe badge on the item card uses the filled (neutral) style
    await waitFor(() => {
      const badge = screen.getByTestId('recipe-badge-Cereal Bowl')
      expect(badge.className).toContain('bg-importance-neutral-background')
    })
  })

  it('tag badge shows bold variant when tag filter is active', async () => {
    // Given an item assigned to a tag
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
      targetUnit: 'package',
      targetQuantity: 0,
      refillThreshold: 0,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 0,
    })

    // When pantry is loaded with that tag's filter active and tags visible
    const history = createMemoryHistory({
      initialEntries: [`/?f_${categoryType.id}=${vegTag.id}&tags=1`],
    })
    const router = createRouter({ routeTree, history })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )

    // Then the tag badge uses the bold (non-inverse) variant
    await waitFor(() => {
      const badge = screen.getByTestId('tag-badge-Vegetables')
      expect(badge.className).not.toContain('bg-tag-blue-background-inverse')
      expect(badge.className).toContain('bg-tag-blue-background')
    })
  })

  it('tag badge shows tint variant when tag filter is not active', async () => {
    // Given an item assigned to a tag
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
      targetUnit: 'package',
      targetQuantity: 0,
      refillThreshold: 0,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 0,
    })

    // When pantry is loaded with no tag filter and tags visible
    const history = createMemoryHistory({ initialEntries: ['/?tags=1'] })
    const router = createRouter({ routeTree, history })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )

    // Then the tag badge uses the tint variant
    await waitFor(() => {
      const badge = screen.getByTestId('tag-badge-Vegetables')
      expect(badge.className).toContain('bg-tag-blue-background-inverse')
    })
  })

  describe('search tail (unified item search)', () => {
    // THE FIXTURE IS THE TEST. Every case below needs an item stocked ONLY at
    // a second location — with one location, "stocked here" and "exists"
    // return the same set, and every assertion here passes against an
    // implementation that ignores location entirely.
    const stockFields = {
      targetUnit: 'package' as const,
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
    }

    const openSearch = async (
      user: ReturnType<typeof userEvent.setup>,
      query: string,
    ) => {
      await user.click(
        await screen.findByRole('button', { name: /toggle search/i }),
      )
      await user.type(
        await screen.findByPlaceholderText(/search items/i),
        query,
      )
    }

    it('user can see an item stocked only at another location under "not stocked here"', async () => {
      // Given Eggs is stocked here, and Milk is stocked ONLY at the Office
      await createItem({ name: 'Eggs', tagIds: [], ...stockFields })
      const office = await createLocation('Office')
      await createItem({ name: 'Milk', tagIds: [], ...stockFields }, office.id)

      renderApp()
      const user = userEvent.setup()
      await screen.findByText('Eggs')

      // When the user searches for Milk
      await openSearch(user, 'milk')

      // Then it is offered under the not-stocked-here divider, not the main
      // list — the flat pantry has no bucket 2, so this is the only tail
      // section it ever shows
      expect(await screen.findByText('1 not stocked here')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Milk' })).toBeInTheDocument()
    })

    it('"Add to My Home" moves the item directly into the main list (no bucket-2 step on the flat pantry)', async () => {
      // Given Eggs is stocked here, and Milk is stocked ONLY at the Office
      await createItem({ name: 'Eggs', tagIds: [], ...stockFields })
      const office = await createLocation('Office')
      await createItem({ name: 'Milk', tagIds: [], ...stockFields }, office.id)

      renderApp()
      const user = userEvent.setup()
      await screen.findByText('Eggs')
      await openSearch(user, 'milk')

      // When the user presses "Add to My Home"
      const addButton = await screen.findByRole('button', {
        name: 'Add to My Home: Milk',
      })
      await user.click(addButton)

      // Then Milk moves straight into the main list — inGroupIds is every
      // stocked-here item, so bucket 1 IS bucket 2 and there is no separate
      // "not in this list" step to pass through first
      await waitFor(() => {
        expect(screen.queryByText(/not stocked here/)).not.toBeInTheDocument()
      })
      expect(screen.queryByText(/not in this list/)).not.toBeInTheDocument()
      expect(
        await screen.findByRole('heading', { name: 'Milk' }),
      ).toBeInTheDocument()
    })

    it('user is not offered Create for a name that exists globally but is not stocked here (#245)', async () => {
      // Given Eggs is stocked here, and Milk exists globally, stocked only
      // at the Office
      await createItem({ name: 'Eggs', tagIds: [], ...stockFields })
      const office = await createLocation('Office')
      await createItem({ name: 'Milk', tagIds: [], ...stockFields }, office.id)

      renderApp()
      const user = userEvent.setup()
      await screen.findByText('Eggs')

      // When the user types its exact name
      await openSearch(user, 'Milk')

      // Then Create is suppressed — pressing it would mint a second global
      // Item that then follows the user to every location
      await screen.findByText('1 not stocked here')
      expect(
        screen.queryByRole('button', { name: 'Create item' }),
      ).not.toBeInTheDocument()
    })

    it('user is still offered Create when no global item matches', async () => {
      // Given nothing in the catalog matches
      await createItem({ name: 'Eggs', tagIds: [], ...stockFields })

      renderApp()
      const user = userEvent.setup()
      await screen.findByText('Eggs')

      // When the user searches a brand-new name
      await openSearch(user, 'Zucchini')

      // Then Create is offered
      expect(
        await screen.findByRole('button', { name: 'Create item' }),
      ).toBeInTheDocument()
    })

    it('an active tag filter that excludes a stocked-here item does not push it into the tail', async () => {
      // Given a Vegetables tag, Milk stocked here WITHOUT that tag (so a
      // tag-filtered "page's own list" would wrongly exclude it), and Milk
      // Substitute stocked only at the Office — a genuine bucket-3 candidate
      // proving the tail still works correctly alongside an active filter
      const categoryType = await createTagType({
        name: 'Category',
        color: 'blue',
      })
      const vegTag = await createTag({
        typeId: categoryType.id,
        name: 'Vegetables',
      })
      await createItem({ name: 'Milk', tagIds: [], ...stockFields })
      const office = await createLocation('Office')
      await createItem(
        { name: 'Milk Substitute', tagIds: [], ...stockFields },
        office.id,
      )

      // When the user loads the pantry with the Vegetables filter active and
      // searches "milk" (search bypasses the tag filter for the main list —
      // see "user can search all items even when vendor filter is active")
      const history = createMemoryHistory({
        initialEntries: [`/?f_${categoryType.id}=${vegTag.id}`],
      })
      const router = createRouter({ routeTree, history })
      const user = userEvent.setup()
      render(
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>,
      )
      await openSearch(user, 'milk')

      // Then Milk stays visible in the main list — it is not swallowed by
      // inGroupIds excluding it due to the active filter — while Milk
      // Substitute is still correctly offered under "not stocked here"
      expect(
        await screen.findByRole('heading', { name: 'Milk' }),
      ).toBeInTheDocument()
      expect(await screen.findByText('1 not stocked here')).toBeInTheDocument()
      expect(
        screen.getByRole('heading', { name: 'Milk Substitute' }),
      ).toBeInTheDocument()
      expect(screen.queryByText(/not in this list/)).not.toBeInTheDocument()
    })
  })

  describe('shelf detail search tail (unified item search)', () => {
    // THE FIXTURE IS THE TEST — same rationale as the flat-pantry block above:
    // every case needs an item stocked ONLY at a second location.
    const stockFields = {
      targetUnit: 'package' as const,
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
    }

    const openSearch = async (
      user: ReturnType<typeof userEvent.setup>,
      query: string,
    ) => {
      await user.click(
        await screen.findByRole('button', { name: /toggle search/i }),
      )
      await user.type(
        await screen.findByPlaceholderText(/search items/i),
        query,
      )
    }

    const renderShelfDetail = (shelfId: string) => {
      const history = createMemoryHistory({
        initialEntries: [`/?groupBy=shelf&id=${shelfId}`],
      })
      const router = createRouter({ routeTree, history })

      render(
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>,
      )
    }

    it('selection shelf: an item stocked only at another location lands under "not stocked here"', async () => {
      // Given a selection shelf with no items yet, and Milk stocked ONLY at
      // the Office
      const shelf = await createShelf({
        name: 'Fridge',
        type: 'selection',
        order: 0,
        itemIds: [],
      })
      const office = await createLocation('Office')
      await createItem({ name: 'Milk', tagIds: [], ...stockFields }, office.id)

      renderShelfDetail(shelf.id)
      const user = userEvent.setup()
      await screen.findByRole('heading', { name: 'Fridge', level: 1 })

      // When the user searches for Milk
      await openSearch(user, 'milk')

      // Then it is offered under "not stocked here", not the shelf's own list
      expect(await screen.findByText('1 not stocked here')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Milk' })).toBeInTheDocument()

      // And Create is suppressed — the toolbar's hasExactMatch reads the
      // GLOBAL catalog (hasExactGlobalMatch), not the shelf's own
      // (twice-filtered) visible list, matching the #245 fix
      expect(
        screen.queryByRole('button', { name: 'Create item' }),
      ).not.toBeInTheDocument()
    })

    it('the two-step gate: "Add to {location}" does not also add the item to the shelf, a second "Add to shelf" press does', async () => {
      // Given a selection shelf with no items yet, and Milk stocked only at
      // the Office
      const shelf = await createShelf({
        name: 'Fridge',
        type: 'selection',
        order: 0,
        itemIds: [],
      })
      const office = await createLocation('Office')
      const milk = await createItem(
        { name: 'Milk', tagIds: [], ...stockFields },
        office.id,
      )

      renderShelfDetail(shelf.id)
      const user = userEvent.setup()
      await screen.findByRole('heading', { name: 'Fridge', level: 1 })
      await openSearch(user, 'milk')

      // When the user presses "Add to My Home" (bucket 3)
      const addToLocationButton = await screen.findByRole('button', {
        name: 'Add to My Home: Milk',
      })
      await user.click(addToLocationButton)

      // Then Milk moves to "not in this list" (bucket 2) — a single press did
      // NOT also add it to the shelf
      const addToShelfButton = await screen.findByRole('button', {
        name: 'Add to shelf: Milk',
      })
      expect(addToShelfButton).toBeInTheDocument()
      await waitFor(() => {
        expect(screen.queryByText(/not stocked here/)).not.toBeInTheDocument()
      })
      const shelfAfterFirstPress = await db.shelves.get(shelf.id)
      expect(shelfAfterFirstPress?.itemIds ?? []).not.toContain(milk.id)

      // When the user presses "Add to shelf" (the second, separate press)
      await user.click(addToShelfButton)

      // Then Milk joins the shelf and both tail sections clear
      await waitFor(() => {
        expect(screen.queryByText(/not in this list/)).not.toBeInTheDocument()
      })
      expect(
        await screen.findByRole('heading', { name: 'Milk' }),
      ).toBeInTheDocument()
      const shelfAfterSecondPress = await db.shelves.get(shelf.id)
      expect(shelfAfterSecondPress?.itemIds ?? []).toContain(milk.id)
    })

    it('an item already in the shelf but stocked only at another location lands under "not stocked here", and "Add to {location}" promotes it straight into the shelf', async () => {
      // Given Milk is already a member of the shelf's itemIds, but stocked
      // ONLY at the Office — no ItemStock here, so it is excluded from the
      // shelf's own (stocked-here) list despite carrying membership
      const office = await createLocation('Office')
      const milk = await createItem(
        { name: 'Milk', tagIds: [], ...stockFields },
        office.id,
      )
      const shelf = await createShelf({
        name: 'Fridge',
        type: 'selection',
        order: 0,
        itemIds: [milk.id],
      })

      renderShelfDetail(shelf.id)
      const user = userEvent.setup()
      await screen.findByRole('heading', { name: 'Fridge', level: 1 })
      await openSearch(user, 'milk')

      // Then it is offered under "not stocked here" — membership alone does
      // not put it in the shelf's own list without local stock
      expect(await screen.findByText('1 not stocked here')).toBeInTheDocument()
      const addToLocationButton = screen.getByRole('button', {
        name: 'Add to My Home: Milk',
      })

      // When the user presses "Add to My Home"
      await user.click(addToLocationButton)

      // Then Milk lands directly in the shelf's own list — there is no shelf
      // membership left to grant, so bucket 2 is skipped entirely. Both
      // dividers clear inside ONE waitFor: `useStockedItems()` (the shelf's
      // own list) and `useItems()` (the tail) are separate queries, both
      // invalidated by the mutation but not guaranteed to resettle in the
      // same render — checking them in two separate waits can catch the
      // transient render where only one has refetched.
      await waitFor(() => {
        expect(screen.queryByText(/not stocked here/)).not.toBeInTheDocument()
        expect(screen.queryByText(/not in this list/)).not.toBeInTheDocument()
      })
      expect(
        await screen.findByRole('heading', { name: 'Milk' }),
      ).toBeInTheDocument()
    })

    it('filter shelf: an item stocked here but not matching the filter renders an inert note and no button', async () => {
      // Given a filter shelf that only matches a Snacks tag, and Pretzels
      // stocked here WITHOUT that tag — so it is excluded from the shelf's
      // own list purely by the filter, not by location
      const categoryType = await createTagType({
        name: 'Category',
        color: 'blue',
      })
      const snackTag = await createTag({
        typeId: categoryType.id,
        name: 'Snacks',
      })
      const shelf = await createShelf({
        name: 'Snack Shelf',
        type: 'filter',
        order: 0,
        filterConfig: { tagIds: [snackTag.id] },
      })
      await createItem({ name: 'Pretzels', tagIds: [], ...stockFields })

      renderShelfDetail(shelf.id)
      const user = userEvent.setup()
      await screen.findByRole('heading', { name: 'Snack Shelf', level: 1 })
      await openSearch(user, 'pretzels')

      // Then Pretzels is offered under "not in this list" with the inert
      // note — filter shelves cannot be joined by a press yet (PR D)
      expect(await screen.findByText('1 not in this list')).toBeInTheDocument()
      expect(
        screen.getByText("Doesn't match this shelf's filters"),
      ).toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: /pretzels/i }),
      ).not.toBeInTheDocument()
    })

    it('filter shelf: an item not stocked here still gets "Add to {location}"', async () => {
      // Given a filter shelf, and Chips stocked ONLY at the Office
      const shelf = await createShelf({
        name: 'Snack Shelf',
        type: 'filter',
        order: 0,
        filterConfig: {},
      })
      const office = await createLocation('Office')
      await createItem({ name: 'Chips', tagIds: [], ...stockFields }, office.id)

      renderShelfDetail(shelf.id)
      const user = userEvent.setup()
      await screen.findByRole('heading', { name: 'Snack Shelf', level: 1 })
      await openSearch(user, 'chips')

      // Then bucket 3 is unaffected by the shelf's filter type — it is
      // group-agnostic
      expect(await screen.findByText('1 not stocked here')).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Add to My Home: Chips' }),
      ).toBeInTheDocument()
    })

    describe('per-row single-flight', () => {
      afterEach(() => {
        vi.restoreAllMocks()
      })

      it('pressing one row does not spin a sibling row while its mutation is in flight', async () => {
        // Given a selection shelf and two items already stocked here but not
        // yet shelf members — both land in "not in this list" (bucket 2),
        // sharing the tail's one groupAction
        const shelf = await createShelf({
          name: 'Fridge',
          type: 'selection',
          order: 0,
          itemIds: [],
        })
        await createItem({ name: 'Apple Juice', tagIds: [], ...stockFields })
        await createItem({ name: 'Apple Cider', tagIds: [], ...stockFields })

        // The real Dexie mutation resolves too fast to reliably observe a
        // mid-flight window, so control it directly — the same technique
        // `useItemSearchTailWiring.test.tsx` uses for its own pending-id test.
        let resolveMutation: () => void = () => {}
        const mutateAsync = vi.fn(
          () =>
            new Promise<void>((resolve) => {
              resolveMutation = resolve
            }),
        )
        // isPending is fixed at `true` throughout — irrelevant to the current
        // (correct) implementation, which never reads `updateShelf.isPending`
        // at all, but load-bearing for mutation check 5 below: it is what
        // lets a hypothetical `updateShelf.isPending`-driven icon prove
        // itself against this very test.
        vi.spyOn(useShelvesModule, 'useUpdateShelfMutation').mockReturnValue({
          mutateAsync,
          mutate: vi.fn(),
          isPending: true,
        } as unknown as ReturnType<
          typeof useShelvesModule.useUpdateShelfMutation
        >)

        renderShelfDetail(shelf.id)
        const user = userEvent.setup()
        await screen.findByRole('heading', { name: 'Fridge', level: 1 })
        await openSearch(user, 'apple')

        const juiceButton = await screen.findByRole('button', {
          name: 'Add to shelf: Apple Juice',
        })
        const ciderButton = await screen.findByRole('button', {
          name: 'Add to shelf: Apple Cider',
        })

        // When the user presses one row's action
        await user.click(juiceButton)

        // Then the sibling shares the tail's single in-flight slot BY DESIGN
        // (ItemSearchTail disables every button in a section while one is
        // pending — see its own "Pending disables every action button in the
        // section" test) so it also disables. What per-row tracking actually
        // fixes is the SPINNER: only the PRESSED row shows one. The old bug
        // tied the spinner to `updateShelf.isPending` directly — a single
        // page-wide flag — so it spun EVERY row indistinguishably. Assert on
        // the sibling's spinner, not the pressed row's disabled state:
        // `Button` computes `disabled={isLoading || disabled}` internally, so
        // the pressed row is disabled either way and proves nothing on its
        // own — a PR A lesson.
        expect(ciderButton).toBeDisabled()
        expect(
          ciderButton.querySelector('.animate-spin'),
        ).not.toBeInTheDocument()
        expect(juiceButton.querySelector('.animate-spin')).toBeInTheDocument()

        // Cleanup: resolve the mutation so pending state clears and no
        // dangling promise leaks into the next test
        resolveMutation()
        await waitFor(() => expect(juiceButton).not.toBeDisabled())
        expect(mutateAsync).toHaveBeenCalledTimes(1)
      })
    })
  })
})
