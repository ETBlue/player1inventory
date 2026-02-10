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

    // When user opens Category dropdown
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

    // When user clicks Clear all
    await user.click(screen.getByRole('button', { name: /clear all/i }))

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

    // When user clicks Vegetables tag badge on Tomatoes card
    await waitFor(() => {
      expect(screen.getByText('Tomatoes')).toBeInTheDocument()
    })
    const vegBadge = screen.getByText('Vegetables')
    await user.click(vegBadge)

    // Then only Tomatoes shown
    await waitFor(() => {
      expect(screen.getByText('Tomatoes')).toBeInTheDocument()
      expect(screen.queryByText('Apples')).not.toBeInTheDocument()
    })

    // And Category dropdown shows active state
    const categoryButton = screen.getByRole('button', { name: /category/i })
    expect(categoryButton.textContent).toContain('•')
  })
})
