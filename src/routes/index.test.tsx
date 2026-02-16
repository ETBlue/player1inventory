// src/routes/index.test.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db'
import { createItem, createTag, createTagType } from '@/db/operations'
import { routeTree } from '@/routeTree.gen'

describe('Home page filtering integration', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.items.clear()
    await db.tags.clear()
    await db.tagTypes.clear()
    await db.inventoryLogs.clear()
    sessionStorage.clear()
    localStorage.clear()

    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
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
    await user.click(screen.getByRole('button', { name: /location/i }))
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

    // When user enables tag visibility
    await waitFor(() => {
      expect(screen.getByText('Tomatoes')).toBeInTheDocument()
    })
    const tagsButton = screen.getByRole('button', { name: /tags/i })
    await user.click(tagsButton)

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

    // Click tags button to show
    await user.click(screen.getByRole('button', { name: /toggle tags/i }))

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

  it('shows inactive items when toggle clicked', async () => {
    const user = userEvent.setup()

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

    // Inactive item should not be visible initially
    await waitFor(() => {
      expect(screen.getByText('Active Item')).toBeInTheDocument()
    })
    expect(screen.queryByText('Inactive Item')).not.toBeInTheDocument()

    // Should show toggle button
    const toggleButton = screen.getByRole('button', { name: /show.*inactive/i })
    expect(toggleButton).toBeInTheDocument()

    // Click to show inactive
    await user.click(toggleButton)

    // Now inactive item should be visible
    await waitFor(() => {
      expect(screen.getByText('Inactive Item')).toBeInTheDocument()
    })

    // Button text should change to "Hide"
    expect(
      screen.getByRole('button', { name: /hide.*inactive/i }),
    ).toBeInTheDocument()
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

  it('consume button does not create inventory log', async () => {
    const user = userEvent.setup()

    // Given an item with quantity 5
    const item = await createItem({
      name: 'Test Item',
      targetQuantity: 10,
      refillThreshold: 2,
      packedQuantity: 5,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
    })

    renderApp()

    await waitFor(() => {
      expect(screen.getByText('Test Item')).toBeInTheDocument()
    })

    // When user clicks consume button
    const consumeButton = screen.getByLabelText('Consume Test Item')
    await user.click(consumeButton)

    // Then no inventory log is created
    await waitFor(async () => {
      const logs = await db.inventoryLogs
        .where('itemId')
        .equals(item.id)
        .toArray()
      expect(logs).toHaveLength(0)
    })

    // And item quantity is updated
    const updatedItem = await db.items.get(item.id)
    expect(updatedItem?.packedQuantity).toBe(4)
  })

  it('add button does not create inventory log', async () => {
    const user = userEvent.setup()

    // Given an item with quantity 5
    const item = await createItem({
      name: 'Test Item',
      targetQuantity: 10,
      refillThreshold: 2,
      packedQuantity: 5,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
    })

    renderApp()

    await waitFor(() => {
      expect(screen.getByText('Test Item')).toBeInTheDocument()
    })

    // When user clicks add button
    const addButton = screen.getByLabelText('Add Test Item')
    await user.click(addButton)

    // Then no inventory log is created
    await waitFor(async () => {
      const logs = await db.inventoryLogs
        .where('itemId')
        .equals(item.id)
        .toArray()
      expect(logs).toHaveLength(0)
    })

    // And item quantity is updated
    const updatedItem = await db.items.get(item.id)
    expect(updatedItem?.packedQuantity).toBe(6)
  })
})
