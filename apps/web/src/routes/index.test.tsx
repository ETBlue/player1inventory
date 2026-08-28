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
    await db.shelves.clear()
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

  // Shared by all four search-tail blocks below.
  //
  // THE FIXTURE IS THE TEST: with a single location, "stocked here" and
  // "exists at all" return the same set, so every search-tail case must stock
  // its probe item ONLY at a second location — otherwise the assertion passes
  // just as happily against an implementation that ignores location entirely.
  //
  // The name is deliberately not stock-specific: post-v16 only
  // `targetQuantity`, `refillThreshold`, `packedQuantity` and
  // `unpackedQuantity` are per-location `ItemStock` state — `targetUnit` and
  // `consumeAmount` are global `Item` configuration. These are simply the
  // field defaults `createItem` is handed.
  const itemDefaults = {
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
    await user.type(await screen.findByPlaceholderText(/search items/i), query)
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
    it('user can see an item stocked only at another location under "not stocked here"', async () => {
      // Given Eggs is stocked here, and Milk is stocked ONLY at the Office
      await createItem({ name: 'Eggs', tagIds: [], ...itemDefaults })
      const office = await createLocation('Office')
      await createItem({ name: 'Milk', tagIds: [], ...itemDefaults }, office.id)

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
      await createItem({ name: 'Eggs', tagIds: [], ...itemDefaults })
      const office = await createLocation('Office')
      await createItem({ name: 'Milk', tagIds: [], ...itemDefaults }, office.id)

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
      await createItem({ name: 'Eggs', tagIds: [], ...itemDefaults })
      const office = await createLocation('Office')
      await createItem({ name: 'Milk', tagIds: [], ...itemDefaults }, office.id)

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
      await createItem({ name: 'Eggs', tagIds: [], ...itemDefaults })

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

    it('user can see bucket 3 on a location with nothing stocked here yet (the empty-pantry CTA does not eat the tail)', async () => {
      // Given NOTHING is stocked at the active location — a brand-new
      // location — and Milk is stocked ONLY at the Office. This is the
      // fixture shape no other pantry test in this file uses: every other
      // one seeds a stocked-here item first, which is exactly how the
      // `items.length === 0` empty-pantry branch short-circuiting ahead of
      // `!hasTail` survived four reviews.
      const office = await createLocation('Office')
      await createItem({ name: 'Milk', tagIds: [], ...itemDefaults }, office.id)

      renderApp()
      const user = userEvent.setup()

      // When the user searches for Milk
      await openSearch(user, 'milk')

      // Then bucket 3 still renders — the empty-pantry CTA must not win
      // ahead of the tail just because nothing is stocked here
      expect(await screen.findByText('1 not stocked here')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Milk' })).toBeInTheDocument()
      expect(
        screen.queryByText(/your pantry is empty/i),
      ).not.toBeInTheDocument()
    })

    it('the empty-pantry CTA still renders on a location with nothing stocked when the search box is empty', async () => {
      // Given NOTHING is stocked at the active location, and Milk is stocked
      // ONLY at the Office — same fixture as above, but the search box stays
      // blank, so the tail must be empty and the CTA must NOT regress
      const office = await createLocation('Office')
      await createItem({ name: 'Milk', tagIds: [], ...itemDefaults }, office.id)

      renderApp()

      // Then the original "create your first item" CTA still shows — this is
      // the behaviour the `items.length === 0` branch exists for, and the
      // fix must not disturb it
      expect(
        await screen.findByText(/your pantry is empty/i),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Create item' }),
      ).toBeInTheDocument()
      expect(screen.queryByText('Milk')).not.toBeInTheDocument()
    })

    it('an active tag filter that excludes a stocked-here item does not push it into the tail', async () => {
      // NEGATIVE CONTROL, not a pinned dimension of `inGroupIds`: on the flat
      // pantry `inGroupIds` sourced from the tag/vendor-filtered list instead
      // of the full stocked-here `items` set is an EQUIVALENT MUTANT here —
      // this page passes neither `groupAction` nor `groupNote`, so bucket 2
      // never renders regardless of `inGroupIds` membership, and this test
      // stays green either way (see task-2-report.md, "equivalent mutant"
      // analysis). What this test actually guards is that Milk stays visible
      // in the MAIN list under an active filter (the `searchedItems` bypass
      // below) — a real, currently-passing assertion, just not proof that
      // `inGroupIds` reads the right variable.
      //
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
      await createItem({ name: 'Milk', tagIds: [], ...itemDefaults })
      const office = await createLocation('Office')
      await createItem(
        { name: 'Milk Substitute', tagIds: [], ...itemDefaults },
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

    it("user sees bucket-3 tail rows in the shelf's chosen sort order, not name order", async () => {
      // Given the shelf's sort preference is name/DESCENDING, and two items
      // that both match "milk" but are stocked ONLY at the Office — so both
      // land in bucket 3.
      //
      // THE FIXTURE IS THE TEST, part two. Name order and sort order must
      // DIFFER or the assertion cannot tell `sortTail` from its absence:
      // `useItemSearchTail` already hands both buckets to the caller in
      // name-ASCENDING order, so Almond-before-Zucchini is what renders with
      // no `sortTail` at all. Only a `sortTail` that actually applies this
      // page's sort flips them.
      //
      // `name` is also the ONE field that can discriminate two bucket-3 rows,
      // which is why the fixture drives the direction rather than the field.
      // A bucket-3 row is not stocked here, so `joinItemStock` hands it
      // ZERO_STOCK and it has no entry in any of the three sort maps (all
      // keyed over stocked-here `allItems`): under `stock` both rows resolve
      // to quantity 0 / target 0 / threshold 0 and tie, and under `purchased`
      // and `expiring` `sortItems` returns 0 outright for a pair of missing
      // dates. A fixture built on those three would be vacuous. Bucket 2 IS
      // in the maps and sorts by every field — see the call-site comment in
      // `ShelfDetailView.tsx`.
      localStorage.setItem(
        'shelf-detail-sort-prefs',
        JSON.stringify({ sortBy: 'name', sortDirection: 'desc' }),
      )
      const shelf = await createShelf({
        name: 'Fridge',
        type: 'selection',
        order: 0,
        itemIds: [],
      })
      const office = await createLocation('Office')
      await createItem(
        { name: 'Almond Milk', tagIds: [], ...itemDefaults },
        office.id,
      )
      await createItem(
        { name: 'Zucchini Milk', tagIds: [], ...itemDefaults },
        office.id,
      )

      renderShelfDetail(shelf.id)
      const user = userEvent.setup()
      await screen.findByRole('heading', { name: 'Fridge', level: 1 })

      // When the user searches for milk
      await openSearch(user, 'milk')
      expect(await screen.findByText('2 not stocked here')).toBeInTheDocument()

      // Then the two bucket-3 rows render in the chosen DESCENDING order —
      // asserted as a SEQUENCE, not as presence
      const rows = await screen.findAllByRole('button', {
        name: /^Add to My Home:/,
      })
      expect(rows.map((b) => b.getAttribute('aria-label'))).toEqual([
        'Add to My Home: Zucchini Milk',
        'Add to My Home: Almond Milk',
      ])
    })

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
      await createItem({ name: 'Milk', tagIds: [], ...itemDefaults }, office.id)

      renderShelfDetail(shelf.id)
      const user = userEvent.setup()
      await screen.findByRole('heading', { name: 'Fridge', level: 1 })

      // When the user searches for Milk
      await openSearch(user, 'milk')

      // Then it is offered under "not stocked here", not the shelf's own list
      expect(await screen.findByText('1 not stocked here')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Milk' })).toBeInTheDocument()

      // And the empty state is gone — the shelf holds no items, so its count
      // is 0 and the block is reached; only the `!hasTail` guard suppresses
      // it. Without that guard "No items / Search to add items to this shelf"
      // renders directly beneath the tail row offering exactly such an item —
      // PR B's original defect. This assertion is what pins the guard: the
      // sibling vendor and recipe tail tests carry the same one.
      expect(screen.queryByText('No items')).not.toBeInTheDocument()

      // And Create is suppressed — the toolbar's hasExactMatch reads the
      // GLOBAL catalog (hasExactGlobalMatch), not the shelf's own
      // (twice-filtered) visible list, matching the #245 fix
      expect(
        screen.queryByRole('button', { name: 'Create item' }),
      ).not.toBeInTheDocument()
    })

    it('user sees the empty state, not a blank pane, when a search matches nothing and the tail is empty', async () => {
      // Given a selection shelf with no items and NOTHING stocked at the
      // active location — the entire catalog lives at the Office. Both
      // halves matter: an empty shelf AND an empty active location are what
      // make `sortedInShelfItems` empty while a search is live.
      const shelf = await createShelf({
        name: 'Fridge',
        type: 'selection',
        order: 0,
        itemIds: [],
      })
      const office = await createLocation('Office')
      await createItem({ name: 'Milk', tagIds: [], ...itemDefaults }, office.id)

      renderShelfDetail(shelf.id)
      const user = userEvent.setup()
      await screen.findByRole('heading', { name: 'Fridge', level: 1 })

      // When the user searches for a string NO item matches, anywhere
      await openSearch(user, 'zzz')
      expect(screen.getByPlaceholderText(/search items/i)).toHaveValue('zzz')

      // Then the tail is empty...
      expect(screen.queryByText(/not stocked here/)).not.toBeInTheDocument()
      expect(screen.queryByText(/not in this list/)).not.toBeInTheDocument()

      // ...and the content pane is NOT blank: with no tail to suppress it,
      // the empty state renders. This view carried the same `!trimmedSearch`
      // shape as the two PR C views, so it blanked identically.
      expect(await screen.findByText('No items')).toBeInTheDocument()
      expect(
        screen.getByText('Search to add items to this shelf'),
      ).toBeInTheDocument()
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
        { name: 'Milk', tagIds: [], ...itemDefaults },
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
        { name: 'Milk', tagIds: [], ...itemDefaults },
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

    it('filter shelf: a searched item stocked here but not matching the filter joins after confirming the pre-selected pick', async () => {
      // Given a filter shelf that only matches a Snacks tag, and Pretzels
      // stocked here WITHOUT that tag — so it is excluded from the shelf's
      // own list purely by the filter, not by location. One tag axis with
      // exactly one option needs no choice from the user (its radio is
      // pre-selected), but the dialog still opens — per the designer's
      // double-confirm ruling (2026-08-28) it always opens, regardless of
      // option count.
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
      const pretzels = await createItem({
        name: 'Pretzels',
        tagIds: [],
        ...itemDefaults,
      })

      renderShelfDetail(shelf.id)
      const user = userEvent.setup()
      await screen.findByRole('heading', { name: 'Snack Shelf', level: 1 })
      await openSearch(user, 'pretzels')

      // When the user presses Add to shelf
      await user.click(
        await screen.findByRole('button', { name: 'Add to shelf: Pretzels' }),
      )

      // Then the dialog opens with the single tag option already selected
      const dialog = await screen.findByRole('dialog')
      expect(
        within(dialog).getByRole('radio', { name: 'Snacks' }),
      ).toBeChecked()

      // When the user confirms
      await user.click(within(dialog).getByRole('button', { name: 'Add' }))

      // Then the item gains the tag and lands directly in the shelf's own
      // list — no more tail row
      await waitFor(() => {
        expect(screen.queryByText(/not in this list/)).not.toBeInTheDocument()
      })
      expect(
        await screen.findByRole('heading', { name: 'Pretzels' }),
      ).toBeInTheDocument()
      expect((await db.items.get(pretzels.id))?.tagIds).toEqual([snackTag.id])
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
      await createItem(
        { name: 'Chips', tagIds: [], ...itemDefaults },
        office.id,
      )

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

    it('system shelf: renders no bucket-2 section (no "Add to shelf" button, no filter note), while bucket 3 still renders "Add to {location}"', async () => {
      // Given a system shelf (no add path exists for these — the ternary
      // chain in ShelfDetailView falls through both `groupAction`'s
      // `type === 'selection'` guard and `groupNote`'s `type === 'filter'`
      // guard, landing on neither): Frozen Peas stocked ONLY at the Office
      // (a bucket-3 candidate) and Frozen Corn stocked HERE but NOT a member
      // of the shelf (a bucket-2 candidate — if this were a selection shelf
      // it would render under "not in this list" with an "Add to shelf"
      // button; if a filter shelf, under the inert note instead)
      const shelf = await createShelf({
        name: 'System Shelf',
        type: 'system',
        order: 0,
        itemIds: [],
      })
      const office = await createLocation('Office')
      await createItem(
        { name: 'Frozen Peas', tagIds: [], ...itemDefaults },
        office.id,
      )
      await createItem({ name: 'Frozen Corn', tagIds: [], ...itemDefaults })

      renderShelfDetail(shelf.id)
      const user = userEvent.setup()
      await screen.findByRole('heading', { name: 'System Shelf', level: 1 })
      await openSearch(user, 'frozen')

      // Then bucket 3 still renders — Add to {location} is group-agnostic
      expect(await screen.findByText('1 not stocked here')).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Add to My Home: Frozen Peas' }),
      ).toBeInTheDocument()

      // And bucket 2 is fully suppressed — Frozen Corn (the bucket-2
      // candidate) renders NOWHERE at all, not even inertly: no "not in
      // this list" divider, no "Add to shelf" button, no filter note, and
      // no heading for it anywhere on the page
      expect(screen.queryByText(/not in this list/)).not.toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: /add to shelf/i }),
      ).not.toBeInTheDocument()
      expect(
        screen.queryByText("Doesn't match this shelf's filters"),
      ).not.toBeInTheDocument()
      expect(
        screen.queryByRole('heading', { name: 'Frozen Corn' }),
      ).not.toBeInTheDocument()
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
        await createItem({ name: 'Apple Juice', tagIds: [], ...itemDefaults })
        await createItem({ name: 'Apple Cider', tagIds: [], ...itemDefaults })

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

  describe('vendor detail search tail (unified item search)', () => {
    // NOT covered here, and deliberately so: sourcing `inGroupIds` from
    // `displayedItems` instead of `inScopeItems` is an EQUIVALENT MUTANT on
    // this view (see the comment at that call site in `VendorDetailView.tsx`)
    // — this page's only narrowing is the same name match the tail already
    // applies, so the two sets agree on every id the tail can consult. No
    // fixture can distinguish them; adding one would be a vacuous test.
    const renderVendorDetail = (vendorId: string, extraParams = '') => {
      const history = createMemoryHistory({
        initialEntries: [`/?groupBy=vendor&id=${vendorId}${extraParams}`],
      })
      const router = createRouter({ routeTree, history })

      render(
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>,
      )
    }

    it("user sees bucket-3 tail rows in the vendor page's chosen sort order, not name order", async () => {
      // Given the vendor page's sort preference is name/DESCENDING, and two
      // items that both match "milk" but are stocked ONLY at the Office — so
      // both land in bucket 3, whose default order is name-ASCENDING. The
      // fixture's two orders therefore disagree, which is the only way the
      // assertion can distinguish `sortTail` from its absence. See the shelf
      // sibling of this test for why `name` is the one field that can
      // discriminate two bucket-3 rows.
      localStorage.setItem(
        'vendor-detail-sort-prefs',
        JSON.stringify({ sortBy: 'name', sortDirection: 'desc' }),
      )
      const vendor = await createVendor('Costco')
      const office = await createLocation('Office')
      await createItem(
        { name: 'Almond Milk', tagIds: [], ...itemDefaults },
        office.id,
      )
      await createItem(
        { name: 'Zucchini Milk', tagIds: [], ...itemDefaults },
        office.id,
      )

      renderVendorDetail(vendor.id)
      const user = userEvent.setup()
      await screen.findByRole('heading', { name: 'Costco', level: 1 })

      // When the user searches for milk
      await openSearch(user, 'milk')
      expect(await screen.findByText('2 not stocked here')).toBeInTheDocument()

      // Then the two bucket-3 rows render in the chosen DESCENDING order
      const rows = await screen.findAllByRole('button', {
        name: /^Add to My Home:/,
      })
      expect(rows.map((b) => b.getAttribute('aria-label'))).toEqual([
        'Add to My Home: Zucchini Milk',
        'Add to My Home: Almond Milk',
      ])
    })

    it('user can see recipe badges on both a list row and a bucket-3 tail row', async () => {
      // Given the vendor Costco and two items that both match "milk":
      //   Milk Powder     — stocked HERE, carries Costco, held by Pasta
      //                     → the page's own list
      //   Milk Substitute — held by Soup but stocked ONLY at the Office, so
      //                     it is absent from this location-scoped page and
      //                     lands in bucket 3
      // Each recipe holds exactly one of them, so each badge testid is unique
      // to one row and no `within()` scoping is needed to tell them apart.
      const vendor = await createVendor('Costco')
      const office = await createLocation('Office')
      const powder = await createItem({
        name: 'Milk Powder',
        tagIds: [],
        vendorIds: [vendor.id],
        ...itemDefaults,
      })
      const substitute = await createItem(
        { name: 'Milk Substitute', tagIds: [], ...itemDefaults },
        office.id,
      )
      await createRecipe({
        name: 'Pasta',
        items: [{ itemId: powder.id, defaultAmount: 1 }],
      })
      await createRecipe({
        name: 'Soup',
        items: [{ itemId: substitute.id, defaultAmount: 1 }],
      })

      // `&tags=1` so `isTagsVisible` is on and badges actually render
      // (`ItemCard` gates them on `showTags`)
      renderVendorDetail(vendor.id, '&tags=1')
      const user = userEvent.setup()
      await screen.findByRole('heading', { name: 'Costco', level: 1 })

      // When the user searches for "milk" on this vendor's page
      await openSearch(user, 'milk')

      // Then Milk Substitute is offered as a bucket-3 row
      expect(await screen.findByText('1 not stocked here')).toBeInTheDocument()
      expect(
        screen.getByRole('button', {
          name: 'Add to My Home: Milk Substitute',
        }),
      ).toBeInTheDocument()

      // And the page's own LIST row carries its recipe badge — this view's
      // `recipeMap` used to be a permanently empty map, so no row here could
      // show one at all
      expect(
        await screen.findByTestId('recipe-badge-Pasta'),
      ).toBeInTheDocument()

      // And so does the bucket-3 TAIL row. This is the assertion that pins
      // the map being keyed over the global `recipes` list: Milk Substitute
      // is by construction absent from `allItems` (it is not stocked here),
      // so a map keyed over `allItems` would leave this row badge-less while
      // the list row above kept its badge.
      expect(screen.getByTestId('recipe-badge-Soup')).toBeInTheDocument()
    })

    it('user can see a globally-existing item that is not stocked here under "not stocked here"', async () => {
      // Given a vendor with no items, and Milk stocked ONLY at the Office —
      // nothing at all is stocked at the active location, PR B's bug class
      const vendor = await createVendor('Costco')
      const office = await createLocation('Office')
      await createItem({ name: 'Milk', tagIds: [], ...itemDefaults }, office.id)

      renderVendorDetail(vendor.id)
      const user = userEvent.setup()
      await screen.findByRole('heading', { name: 'Costco', level: 1 })

      // When the user searches for Milk
      await openSearch(user, 'milk')

      // Then it is offered under "not stocked here", with the location action
      expect(await screen.findByText('1 not stocked here')).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Add to My Home: Milk' }),
      ).toBeInTheDocument()

      // And the empty state is gone — it is gated on `!hasTail`, so a tail
      // with rows suppresses it while the two remain sibling `&&` blocks,
      // not a ternary
      expect(screen.queryByText('No items')).not.toBeInTheDocument()

      // And the bucket-3 row shows NO stock figures: `useShowStock` gates
      // them off for an item with no ItemStock here, because
      // `joinItemStock()` hands such a row zeroed quantities and rendering
      // those as if they were real stock is a lie. The literal is "0/0", not
      // "0/2": the ROW's quantities are zeroed, not just its on-hand count —
      // `joinItemStock()` falls back to ZERO_STOCK (`db/operations.ts`),
      // whose `targetQuantity` is 0, so the denominator an ungated row would
      // print is 0 too. `itemDefaults`' target of 2 lives on the Office
      // ItemStock and never reaches this row.
      expect(screen.queryByText('0/0')).not.toBeInTheDocument()
      expect(document.querySelectorAll('[data-unit-badge]')).toHaveLength(0)
    })

    it('user sees the empty state, not a blank pane, when a search matches nothing and the tail is empty', async () => {
      // Given a vendor with no items and NOTHING stocked at the active
      // location — the entire catalog lives at the Office. Both halves
      // matter: an empty group AND an empty active location are what make
      // `sortedItems` empty while a search is live.
      const vendor = await createVendor('Costco')
      const office = await createLocation('Office')
      await createItem({ name: 'Milk', tagIds: [], ...itemDefaults }, office.id)

      renderVendorDetail(vendor.id)
      const user = userEvent.setup()
      await screen.findByRole('heading', { name: 'Costco', level: 1 })

      // When the user searches for a string NO item matches, anywhere
      await openSearch(user, 'zzz')
      expect(screen.getByPlaceholderText(/search items/i)).toHaveValue('zzz')

      // Then the tail is empty...
      expect(screen.queryByText(/not stocked here/)).not.toBeInTheDocument()
      expect(screen.queryByText(/not in this list/)).not.toBeInTheDocument()

      // ...and the content pane is NOT blank: with no tail to suppress it,
      // the empty state renders. Gating this on `!trimmedSearch` instead of
      // `!hasTail` regressed the merge base, which rendered "No items" here.
      expect(await screen.findByText('No items')).toBeInTheDocument()
      expect(
        screen.getByText('No items are assigned to this vendor'),
      ).toBeInTheDocument()
    })

    it('the two-step gate: "Add to {location}" stocks the item without applying the vendor, and a second "Apply {vendor}" press applies it', async () => {
      // Given a vendor with no items, and Milk stocked ONLY at the Office and
      // carrying NO vendor
      const vendor = await createVendor('Costco')
      const office = await createLocation('Office')
      const milk = await createItem(
        { name: 'Milk', tagIds: [], ...itemDefaults },
        office.id,
      )

      renderVendorDetail(vendor.id)
      const user = userEvent.setup()
      await screen.findByRole('heading', { name: 'Costco', level: 1 })
      await openSearch(user, 'milk')

      // When the user presses "Add to My Home" (bucket 3)
      await user.click(
        await screen.findByRole('button', { name: 'Add to My Home: Milk' }),
      )

      // Then the row moves to bucket 2 — and, read straight off the DATABASE
      // rather than off where the row now sits, Milk is stocked HERE but has
      // NOT been given the vendor. Row position cannot prove this: a row that
      // relocates says nothing about which mutations ran.
      const applyButton = await screen.findByRole('button', {
        name: 'Apply Costco: Milk',
      })
      const stocksAfterFirstPress = await db.itemStocks
        .where('itemId')
        .equals(milk.id)
        .toArray()
      expect(stocksAfterFirstPress.map((s) => s.locationId)).toContain(
        DEFAULT_LOCATION_ID,
      )
      const milkAfterFirstPress = await db.items.get(milk.id)
      expect(milkAfterFirstPress?.vendorIds ?? []).not.toContain(vendor.id)

      // When the user presses "Apply Costco" (the second, separate press)
      await user.click(applyButton)

      // Then the vendor is applied and both tail sections clear
      await waitFor(async () => {
        const milkAfterSecondPress = await db.items.get(milk.id)
        expect(milkAfterSecondPress?.vendorIds ?? []).toContain(vendor.id)
      })
      await waitFor(() => {
        expect(screen.queryByText(/not stocked here/)).not.toBeInTheDocument()
        expect(screen.queryByText(/not in this list/)).not.toBeInTheDocument()
      })
      expect(
        await screen.findByRole('heading', { name: 'Milk' }),
      ).toBeInTheDocument()
    })

    it('user can see a stocked-here item that lacks the vendor under "not in this list", while the page\'s own items stay out of the tail', async () => {
      // Given Costco and three items that all match "milk":
      //   Milk Powder     — stocked HERE, carries Costco → the page's own list
      //   Milk            — stocked HERE, no vendor      → bucket 2
      //   Milk Substitute — carries Costco but stocked ONLY at the Office, so
      //                     it is absent from this location-scoped page and
      //                     belongs in bucket 3, NOT bucket 2 (there is no
      //                     vendor left to grant it)
      const vendor = await createVendor('Costco')
      const office = await createLocation('Office')
      await createItem({
        name: 'Milk Powder',
        tagIds: [],
        vendorIds: [vendor.id],
        ...itemDefaults,
      })
      await createItem({ name: 'Milk', tagIds: [], ...itemDefaults })
      await createItem(
        {
          name: 'Milk Substitute',
          tagIds: [],
          vendorIds: [vendor.id],
          ...itemDefaults,
        },
        office.id,
      )

      renderVendorDetail(vendor.id)
      const user = userEvent.setup()
      await screen.findByRole('heading', { name: 'Costco', level: 1 })

      // When the user searches for "milk" on this vendor's page
      await openSearch(user, 'milk')

      // Then exactly ONE row sits in each tail bucket — Milk Powder, which
      // the page already renders, is subtracted from both
      expect(await screen.findByText('1 not in this list')).toBeInTheDocument()
      expect(screen.getByText('1 not stocked here')).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Apply Costco: Milk' }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Add to My Home: Milk Substitute' }),
      ).toBeInTheDocument()

      // And neither tail row offers the other bucket's action
      expect(
        screen.queryByRole('button', { name: 'Add to My Home: Milk' }),
      ).not.toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: 'Apply Costco: Milk Substitute' }),
      ).not.toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: /apply costco: milk powder/i }),
      ).not.toBeInTheDocument()
    })

    it('the "No vendor" page renders an inert note naming the vendors that hold the item, and no button', async () => {
      // Given the unsorted ("No vendor") page: Milk stocked HERE carrying
      // Costco — so it is excluded from this group by MEMBERSHIP, not by
      // location — plus Milk Water stocked ONLY at the Office, the
      // location-scoping probe
      const vendor = await createVendor('Costco')
      const office = await createLocation('Office')
      await createItem({
        name: 'Milk',
        tagIds: [],
        vendorIds: [vendor.id],
        ...itemDefaults,
      })
      await createItem(
        { name: 'Milk Water', tagIds: [], ...itemDefaults },
        office.id,
      )

      renderVendorDetail('unsorted')
      const user = userEvent.setup()
      await screen.findByRole('heading', { name: 'No vendor', level: 1 })

      // When the user searches for "milk" on the "No vendor" page
      await openSearch(user, 'milk')

      // Then bucket 2 renders the inert note — joining "items with NO vendor"
      // would mean STRIPPING every vendor, so there is deliberately no button
      expect(await screen.findByText('1 not in this list')).toBeInTheDocument()
      expect(screen.getByText('In Costco')).toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: /apply/i }),
      ).not.toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: /: Milk$/ }),
      ).not.toBeInTheDocument()

      // And bucket 3 is unaffected — "Add to {location}" is group-agnostic
      expect(screen.getByText('1 not stocked here')).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Add to My Home: Milk Water' }),
      ).toBeInTheDocument()
    })

    it('the unresolved-vendor window renders neither a group action nor a note', async () => {
      // Given a vendorId that NO vendor carries. It need not have been
      // deleted — `validateSearch` in `routes/index.tsx` passes `?id=`
      // through as an arbitrary string with no existence check, so a stale
      // bookmark or a hand-typed id lands in exactly the same window (the id
      // below never existed). A still-loading `useVendors()` is the one case
      // that CANNOT reach here: the spinner returns before any tail renders.
      // Fixture: Milk stocked HERE without the vendor (a bucket-2 candidate)
      // and Milk Water stocked ONLY at the Office (a bucket-3 candidate)
      const office = await createLocation('Office')
      await createItem({ name: 'Milk', tagIds: [], ...itemDefaults })
      await createItem(
        { name: 'Milk Water', tagIds: [], ...itemDefaults },
        office.id,
      )

      renderVendorDetail('deleted-vendor-id')
      const user = userEvent.setup()
      await screen.findByRole('heading', { name: 'Vendor', level: 1 })

      // When the user searches for "milk" on the unresolved vendor's page
      await openSearch(user, 'milk')

      // Then bucket 3 still renders — it does not depend on the vendor
      expect(await screen.findByText('1 not stocked here')).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Add to My Home: Milk Water' }),
      ).toBeInTheDocument()

      // And bucket 2 is fully suppressed: no divider, no apply button, no
      // note, and no row for Milk anywhere — its label would name a vendor
      // that does not exist and pressing it would append a nonexistent id
      expect(screen.queryByText(/not in this list/)).not.toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: /^apply/i }),
      ).not.toBeInTheDocument()
      expect(screen.queryByText(/^In /)).not.toBeInTheDocument()
      expect(
        screen.queryByRole('heading', { name: 'Milk' }),
      ).not.toBeInTheDocument()
    })
  })

  describe('recipe detail search tail (unified item search)', () => {
    // NOT covered here, and deliberately so: sourcing `inGroupIds` from
    // `displayedItems` instead of `inScopeItems` is an EQUIVALENT MUTANT on
    // this view, exactly as it is on `VendorDetailView` (see the comment at
    // that call site in `RecipeDetailView.tsx`) — this page's only narrowing
    // of `inScopeItems` is the same name match the tail already applies, so
    // the two sets agree on every id the tail can consult. No fixture can
    // distinguish them; adding one would be a vacuous test.
    // `extraParams` is appended verbatim to the query string (e.g.
    // `'&tags=1'`) — `useUrlSearchAndFilters` reads the raw search string, so
    // params the route's own `validateSearch` does not model still reach it.
    const renderRecipeDetail = (recipeId: string, extraParams = '') => {
      const history = createMemoryHistory({
        initialEntries: [`/?groupBy=recipe&id=${recipeId}${extraParams}`],
      })
      const router = createRouter({ routeTree, history })

      render(
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>,
      )
    }

    it("user sees bucket-3 tail rows in the recipe page's chosen sort order, not name order", async () => {
      // Given the recipe page's sort preference is name/DESCENDING, and two
      // items that both match "milk" but are stocked ONLY at the Office — so
      // both land in bucket 3, whose default order is name-ASCENDING. The
      // fixture's two orders therefore disagree, which is the only way the
      // assertion can distinguish `sortTail` from its absence. See the shelf
      // sibling of this test for why `name` is the one field that can
      // discriminate two bucket-3 rows.
      localStorage.setItem(
        'recipe-detail-sort-prefs',
        JSON.stringify({ sortBy: 'name', sortDirection: 'desc' }),
      )
      const recipe = await createRecipe({ name: 'Pasta' })
      const office = await createLocation('Office')
      await createItem(
        { name: 'Almond Milk', tagIds: [], ...itemDefaults },
        office.id,
      )
      await createItem(
        { name: 'Zucchini Milk', tagIds: [], ...itemDefaults },
        office.id,
      )

      renderRecipeDetail(recipe.id)
      const user = userEvent.setup()
      await screen.findByRole('heading', { name: 'Pasta', level: 1 })

      // When the user searches for milk
      await openSearch(user, 'milk')
      expect(await screen.findByText('2 not stocked here')).toBeInTheDocument()

      // Then the two bucket-3 rows render in the chosen DESCENDING order
      const rows = await screen.findAllByRole('button', {
        name: /^Add to My Home:/,
      })
      expect(rows.map((b) => b.getAttribute('aria-label'))).toEqual([
        'Add to My Home: Zucchini Milk',
        'Add to My Home: Almond Milk',
      ])
    })

    it('user can see a globally-existing item that is not stocked here under "not stocked here"', async () => {
      // Given a recipe with no items, and Milk stocked ONLY at the Office —
      // nothing at all is stocked at the active location, PR B's bug class
      const recipe = await createRecipe({ name: 'Pasta' })
      const office = await createLocation('Office')
      await createItem({ name: 'Milk', tagIds: [], ...itemDefaults }, office.id)

      renderRecipeDetail(recipe.id)
      const user = userEvent.setup()
      await screen.findByRole('heading', { name: 'Pasta', level: 1 })

      // When the user searches for Milk
      await openSearch(user, 'milk')

      // Then it is offered under "not stocked here", with the location action
      expect(await screen.findByText('1 not stocked here')).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Add to My Home: Milk' }),
      ).toBeInTheDocument()

      // And the empty state is gone — it is gated on `!hasTail`, so a tail
      // with rows suppresses it while the two remain sibling `&&` blocks,
      // not a ternary
      expect(screen.queryByText('No items')).not.toBeInTheDocument()

      // And the bucket-3 row shows NO stock figures: `useShowStock` gates
      // them off for an item with no ItemStock here, because
      // `joinItemStock()` hands such a row zeroed quantities and rendering
      // those as if they were real stock is a lie. The literal is "0/0", not
      // "0/2": the ROW's quantities are zeroed, not just its on-hand count —
      // `joinItemStock()` falls back to ZERO_STOCK (`db/operations.ts`),
      // whose `targetQuantity` is 0, so the denominator an ungated row would
      // print is 0 too. `itemDefaults`' target of 2 lives on the Office
      // ItemStock and never reaches this row.
      expect(screen.queryByText('0/0')).not.toBeInTheDocument()
      expect(document.querySelectorAll('[data-unit-badge]')).toHaveLength(0)
    })

    it('user sees the empty state, not a blank pane, when a search matches nothing and the tail is empty', async () => {
      // Given a recipe with no items and NOTHING stocked at the active
      // location — the entire catalog lives at the Office. Both halves
      // matter: an empty group AND an empty active location are what make
      // `sortedItems` empty while a search is live.
      const recipe = await createRecipe({ name: 'Pasta' })
      const office = await createLocation('Office')
      await createItem({ name: 'Milk', tagIds: [], ...itemDefaults }, office.id)

      renderRecipeDetail(recipe.id)
      const user = userEvent.setup()
      await screen.findByRole('heading', { name: 'Pasta', level: 1 })

      // When the user searches for a string NO item matches, anywhere
      await openSearch(user, 'zzz')
      expect(screen.getByPlaceholderText(/search items/i)).toHaveValue('zzz')

      // Then the tail is empty...
      expect(screen.queryByText(/not stocked here/)).not.toBeInTheDocument()
      expect(screen.queryByText(/not in this list/)).not.toBeInTheDocument()

      // ...and the content pane is NOT blank: with no tail to suppress it,
      // the empty state renders. Gating this on `!trimmedSearch` instead of
      // `!hasTail` regressed the merge base, which rendered "No items" here.
      expect(await screen.findByText('No items')).toBeInTheDocument()
      expect(
        screen.getByText('No items are assigned to this recipe'),
      ).toBeInTheDocument()
    })

    it('the two-step gate: "Add to {location}" stocks the item without adding it to the recipe, and a second "Add to recipe" press adds it', async () => {
      // Given a recipe with no items, and Milk stocked ONLY at the Office.
      // Milk carries `consumeAmount: 0` — an explicitly-set 0 survives
      // `createItem`'s `?? 1` default — because THAT is the fixture that can
      // tell `defaultAmount: item.consumeAmount || 1` apart from `?? 1`: on a
      // `consumeAmount: 1` item the two operators are indistinguishable, and
      // a test built on one would be vacuous.
      const recipe = await createRecipe({ name: 'Pasta' })
      const office = await createLocation('Office')
      const milk = await createItem(
        { name: 'Milk', tagIds: [], ...itemDefaults, consumeAmount: 0 },
        office.id,
      )

      renderRecipeDetail(recipe.id)
      const user = userEvent.setup()
      await screen.findByRole('heading', { name: 'Pasta', level: 1 })
      await openSearch(user, 'milk')

      // When the user presses "Add to My Home" (bucket 3)
      await user.click(
        await screen.findByRole('button', { name: 'Add to My Home: Milk' }),
      )

      // Then the row moves to bucket 2 — and, read straight off the DATABASE
      // rather than off where the row now sits, Milk is stocked HERE but has
      // NOT been added to the recipe. Row position cannot prove this: a row
      // that relocates says nothing about which mutations ran.
      const addToRecipeButton = await screen.findByRole('button', {
        name: 'Add to recipe: Milk',
      })
      const stocksAfterFirstPress = await db.itemStocks
        .where('itemId')
        .equals(milk.id)
        .toArray()
      expect(stocksAfterFirstPress.map((s) => s.locationId)).toContain(
        DEFAULT_LOCATION_ID,
      )
      const recipeAfterFirstPress = await db.recipes.get(recipe.id)
      expect(recipeAfterFirstPress?.items ?? []).toHaveLength(0)

      // When the user presses "Add to recipe" (the second, separate press)
      await user.click(addToRecipeButton)

      // Then the item joins the recipe with `defaultAmount: 1`, NOT the 0 it
      // carries — `defaultAmount: 0` means "optional, unchecked" in cooking,
      // so a `?? 1` here would add an ingredient that silently does nothing
      await waitFor(async () => {
        const recipeAfterSecondPress = await db.recipes.get(recipe.id)
        expect(recipeAfterSecondPress?.items).toEqual([
          { itemId: milk.id, defaultAmount: 1 },
        ])
      })

      // And both tail sections clear — Milk is now stocked here AND in the
      // recipe, so the page's own list renders it
      await waitFor(() => {
        expect(screen.queryByText(/not stocked here/)).not.toBeInTheDocument()
        expect(screen.queryByText(/not in this list/)).not.toBeInTheDocument()
      })
      expect(
        await screen.findByRole('heading', { name: 'Milk' }),
      ).toBeInTheDocument()
    })

    it('user can see a stocked-here item that is absent from the recipe under "not in this list", while the page\'s own items stay out of the tail and tail rows keep their recipe badges', async () => {
      // Given the recipe Pasta and three items that all match "milk":
      //   Milk Powder     — stocked HERE, in Pasta   → the page's own list
      //   Milk            — stocked HERE, no recipe  → bucket 2
      //   Milk Substitute — in Pasta but stocked ONLY at the Office, so it is
      //                     absent from this location-scoped page and belongs
      //                     in bucket 3, NOT bucket 2 (there is no membership
      //                     left to grant it)
      const office = await createLocation('Office')
      const powder = await createItem({
        name: 'Milk Powder',
        tagIds: [],
        ...itemDefaults,
      })
      await createItem({ name: 'Milk', tagIds: [], ...itemDefaults })
      const substitute = await createItem(
        { name: 'Milk Substitute', tagIds: [], ...itemDefaults },
        office.id,
      )
      const recipe = await createRecipe({
        name: 'Pasta',
        items: [
          { itemId: powder.id, defaultAmount: 1 },
          { itemId: substitute.id, defaultAmount: 1 },
        ],
      })
      // A SECOND recipe also holding Milk Substitute — the badge probe below
      // needs a recipe other than the one being viewed
      await createRecipe({
        name: 'Soup',
        items: [{ itemId: substitute.id, defaultAmount: 1 }],
      })

      // `&tags=1` so `isTagsVisible` is on and badges actually render
      renderRecipeDetail(recipe.id, '&tags=1')
      const user = userEvent.setup()
      await screen.findByRole('heading', { name: 'Pasta', level: 1 })

      // When the user searches for "milk" on this recipe's page
      await openSearch(user, 'milk')

      // Then exactly ONE row sits in each tail bucket — Milk Powder, which
      // the page already renders, is subtracted from both
      expect(await screen.findByText('1 not in this list')).toBeInTheDocument()
      expect(screen.getByText('1 not stocked here')).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Add to recipe: Milk' }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Add to My Home: Milk Substitute' }),
      ).toBeInTheDocument()

      // And neither tail row offers the other bucket's action
      expect(
        screen.queryByRole('button', { name: 'Add to My Home: Milk' }),
      ).not.toBeInTheDocument()
      expect(
        screen.queryByRole('button', {
          name: 'Add to recipe: Milk Substitute',
        }),
      ).not.toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: /add to recipe: milk powder/i }),
      ).not.toBeInTheDocument()

      // And the bucket-3 row carries the recipe badges of whatever holds it —
      // here Soup, a DIFFERENT recipe from the one being viewed. `recipeMap`
      // is built by walking the global `recipes` list, so it resolves a row
      // that is NOT stocked here. A map keyed over `allItems` would leave
      // Milk Substitute badge-less, since it is absent from `allItems` by
      // construction. Soup holds only Milk Substitute, so the badge is
      // unique to that tail row.
      expect(screen.getByTestId('recipe-badge-Soup')).toBeInTheDocument()
    })

    it('the "Not added to recipe" page renders an inert note naming the recipes that hold the item, and no button', async () => {
      // Given the unsorted ("Not added to recipe") page: Milk stocked HERE
      // and held by Pasta — so it is excluded from this group by MEMBERSHIP,
      // not by location — plus Milk Water stocked ONLY at the Office and in
      // no recipe, the location-scoping probe
      const office = await createLocation('Office')
      const milk = await createItem({
        name: 'Milk',
        tagIds: [],
        ...itemDefaults,
      })
      await createItem(
        { name: 'Milk Water', tagIds: [], ...itemDefaults },
        office.id,
      )
      await createRecipe({
        name: 'Pasta',
        items: [{ itemId: milk.id, defaultAmount: 1 }],
      })

      renderRecipeDetail('unsorted')
      const user = userEvent.setup()
      await screen.findByRole('heading', {
        name: 'Not added to recipe',
        level: 1,
      })

      // When the user searches for "milk" on the "Not added to recipe" page
      await openSearch(user, 'milk')

      // Then bucket 2 renders the inert note — joining "items in NO recipe"
      // would mean REMOVING the item from every recipe, so there is
      // deliberately no button
      expect(await screen.findByText('1 not in this list')).toBeInTheDocument()
      expect(screen.getByText('In Pasta')).toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: /add to recipe/i }),
      ).not.toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: /: Milk$/ }),
      ).not.toBeInTheDocument()

      // And bucket 3 is unaffected — "Add to {location}" is group-agnostic
      expect(screen.getByText('1 not stocked here')).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Add to My Home: Milk Water' }),
      ).toBeInTheDocument()
    })

    it('the unresolved-recipe window renders neither a group action nor a note', async () => {
      // Given a recipeId that NO recipe carries. It need not have been
      // deleted — `validateSearch` in `routes/index.tsx` passes `?id=`
      // through as an arbitrary string with no existence check, so a stale
      // bookmark or a hand-typed id lands in exactly the same window (the id
      // below never existed). A still-loading `useRecipes()` is the one case
      // that CANNOT reach here: the spinner returns before any tail renders.
      // Fixture: Milk stocked HERE in no recipe (a bucket-2 candidate) and
      // Milk Water stocked ONLY at the Office (a bucket-3 candidate)
      const office = await createLocation('Office')
      await createItem({ name: 'Milk', tagIds: [], ...itemDefaults })
      await createItem(
        { name: 'Milk Water', tagIds: [], ...itemDefaults },
        office.id,
      )

      renderRecipeDetail('deleted-recipe-id')
      const user = userEvent.setup()
      await screen.findByRole('heading', { name: 'Recipe', level: 1 })

      // When the user searches for "milk" on the unresolved recipe's page
      await openSearch(user, 'milk')

      // Then bucket 3 still renders — it does not depend on the recipe
      expect(await screen.findByText('1 not stocked here')).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Add to My Home: Milk Water' }),
      ).toBeInTheDocument()

      // And bucket 2 is fully suppressed: no divider, no add button, no note,
      // and no row for Milk anywhere — there is no `recipe.items` to append
      // to, so pressing an action could write nothing
      expect(screen.queryByText(/not in this list/)).not.toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: /^add to recipe/i }),
      ).not.toBeInTheDocument()
      expect(screen.queryByText(/^In /)).not.toBeInTheDocument()
      expect(
        screen.queryByRole('heading', { name: 'Milk' }),
      ).not.toBeInTheDocument()
    })
  })
})
