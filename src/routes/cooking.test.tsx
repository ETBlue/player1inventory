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
import { createItem, createRecipe } from '@/db/operations'
import { routeTree } from '@/routeTree.gen'

describe('Use (Cooking) Page', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.items.clear()
    await db.recipes.clear()
    await db.inventoryLogs.clear()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    sessionStorage.clear()
  })

  const renderPage = () => {
    const history = createMemoryHistory({ initialEntries: ['/cooking'] })
    const router = createRouter({ routeTree, history })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
    return router
  }

  const makeItem = (name: string, consumeAmount = 1, packedQuantity = 5) =>
    createItem({
      name,
      targetUnit: 'package',
      targetQuantity: 10,
      refillThreshold: 2,
      packedQuantity,
      unpackedQuantity: 0,
      consumeAmount,
      tagIds: [],
    })

  it('user can see the empty state when no recipes exist', async () => {
    // Given no recipes
    renderPage()

    // Then the empty state is shown
    await waitFor(() => {
      expect(screen.getByText(/no recipes yet/i)).toBeInTheDocument()
    })
  })

  it('user can see the recipe list', async () => {
    // Given two recipes exist
    await createRecipe({ name: 'Pasta Dinner' })
    await createRecipe({ name: 'Omelette' })

    renderPage()

    // Then both recipes appear
    await waitFor(() => {
      expect(screen.getByText('Pasta Dinner')).toBeInTheDocument()
      expect(screen.getByText('Omelette')).toBeInTheDocument()
    })
  })

  it('Done and Cancel buttons are disabled when no recipes are checked', async () => {
    // Given a recipe exists
    await createRecipe({ name: 'Pasta' })

    renderPage()

    // Then Done and Cancel are disabled
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /done/i })).toBeDisabled()
      expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled()
    })
  })

  it('user can check a recipe and see item amounts expanded', async () => {
    // Given a recipe with an item
    const item = await makeItem('Flour', 2)
    await createRecipe({
      name: 'Pasta',
      items: [{ itemId: item.id, defaultAmount: 4 }],
    })

    renderPage()
    const user = userEvent.setup()

    // When user checks the recipe
    await waitFor(() => {
      expect(screen.getByLabelText('Pasta')).toBeInTheDocument()
    })
    await user.click(screen.getByLabelText('Pasta'))

    // Then the item list is expanded with its default amount
    await waitFor(() => {
      expect(screen.getByText('Flour')).toBeInTheDocument()
      expect(screen.getByText(/4/)).toBeInTheDocument()
    })
  })

  it('Done and Cancel buttons become enabled when a recipe is checked', async () => {
    // Given a recipe exists
    await createRecipe({ name: 'Pasta' })

    renderPage()
    const user = userEvent.setup()

    // When user checks the recipe
    await waitFor(() => {
      expect(screen.getByLabelText('Pasta')).toBeInTheDocument()
    })
    await user.click(screen.getByLabelText('Pasta'))

    // Then Done and Cancel are enabled
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /done/i })).not.toBeDisabled()
      expect(screen.getByRole('button', { name: /cancel/i })).not.toBeDisabled()
    })
  })

  it('user can adjust item amount with + button', async () => {
    // Given a recipe with an item (consumeAmount = 2, defaultAmount = 4)
    const item = await makeItem('Flour', 2)
    await createRecipe({
      name: 'Pasta',
      items: [{ itemId: item.id, defaultAmount: 4 }],
    })

    renderPage()
    const user = userEvent.setup()

    // When user checks the recipe
    await waitFor(() => {
      expect(screen.getByLabelText('Pasta')).toBeInTheDocument()
    })
    await user.click(screen.getByLabelText('Pasta'))

    // And clicks the + button for Flour
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Increase quantity of Flour/i }),
      ).toBeInTheDocument()
    })
    await user.click(
      screen.getByRole('button', { name: /Increase quantity of Flour/i }),
    )

    // Then the amount increases by consumeAmount (4 + 2 = 6)
    await waitFor(() => {
      expect(screen.getByText(/6/)).toBeInTheDocument()
    })
  })

  it('user can adjust item amount down to 0 with - button', async () => {
    // Given a recipe with an item (consumeAmount = 2, defaultAmount = 2)
    const item = await makeItem('Flour', 2)
    await createRecipe({
      name: 'Pasta',
      items: [{ itemId: item.id, defaultAmount: 2 }],
    })

    renderPage()
    const user = userEvent.setup()

    // When user checks the recipe
    await waitFor(() => {
      expect(screen.getByLabelText('Pasta')).toBeInTheDocument()
    })
    await user.click(screen.getByLabelText('Pasta'))

    // And clicks the - button
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Decrease quantity of Flour/i }),
      ).toBeInTheDocument()
    })
    await user.click(
      screen.getByRole('button', { name: /Decrease quantity of Flour/i }),
    )

    // Then the amount is 0 (not negative)
    await waitFor(() => {
      expect(screen.getByText(/^0/)).toBeInTheDocument()
    })
  })

  it('user can confirm consumption and inventory is reduced', async () => {
    // Given a recipe with an item (packedQuantity = 5)
    const item = await makeItem('Flour', 1, 5)
    await createRecipe({
      name: 'Pasta',
      items: [{ itemId: item.id, defaultAmount: 2 }],
    })

    renderPage()
    const user = userEvent.setup()

    // When user checks the recipe
    await waitFor(() => {
      expect(screen.getByLabelText('Pasta')).toBeInTheDocument()
    })
    await user.click(screen.getByLabelText('Pasta'))

    // And clicks Done
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /done/i })).not.toBeDisabled()
    })
    await user.click(screen.getByRole('button', { name: /done/i }))

    // Then the confirmation dialog appears
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /consume from 1 recipe/i }),
      ).toBeInTheDocument()
    })

    // When user confirms
    await user.click(screen.getByRole('button', { name: /confirm/i }))

    // Then the item's quantity is reduced in the database
    await waitFor(async () => {
      const updated = await db.items.get(item.id)
      expect(updated).toBeDefined()
      const total =
        (updated?.packedQuantity ?? 0) + (updated?.unpackedQuantity ?? 0)
      expect(total).toBeLessThan(5) // Some quantity was consumed
    })

    // And a log entry is created
    await waitFor(async () => {
      const logs = await db.inventoryLogs
        .filter((l) => l.itemId === item.id)
        .toArray()
      expect(logs.length).toBeGreaterThan(0)
      expect(logs[0].note).toBe('consumed via recipe')
      expect(logs[0].delta).toBeLessThan(0)
    })

    // And the recipes are deselected (Done/Cancel disabled again)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /done/i })).toBeDisabled()
    })
  })

  it('user can cancel and selections are cleared', async () => {
    // Given a recipe that is checked
    await createRecipe({ name: 'Pasta' })

    renderPage()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByLabelText('Pasta')).toBeInTheDocument()
    })
    await user.click(screen.getByLabelText('Pasta'))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /cancel/i })).not.toBeDisabled()
    })

    // When user clicks Cancel
    await user.click(screen.getByRole('button', { name: /cancel/i }))

    // Then the confirmation dialog appears
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /discard all selections/i }),
      ).toBeInTheDocument()
    })

    // When user confirms
    await user.click(screen.getByRole('button', { name: /discard/i }))

    // Then all recipes are deselected
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /done/i })).toBeDisabled()
      expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled()
    })
  })

  it('items with amount=0 are skipped on consumption', async () => {
    // Given a recipe with one item, defaultAmount = 2
    const item = await makeItem('Flour', 2, 5)
    await createRecipe({
      name: 'Pasta',
      items: [{ itemId: item.id, defaultAmount: 2 }],
    })

    renderPage()
    const user = userEvent.setup()

    // When user checks the recipe
    await waitFor(() => {
      expect(screen.getByLabelText('Pasta')).toBeInTheDocument()
    })
    await user.click(screen.getByLabelText('Pasta'))

    // And decrements the amount to 0
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Decrease quantity of Flour/i }),
      ).toBeInTheDocument()
    })
    await user.click(
      screen.getByRole('button', { name: /Decrease quantity of Flour/i }),
    )

    // And confirms Done
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /done/i })).not.toBeDisabled()
    })
    await user.click(screen.getByRole('button', { name: /done/i }))
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /confirm/i }),
      ).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /confirm/i }))

    // Then the item's quantity is NOT reduced (amount was 0)
    await waitFor(async () => {
      const updated = await db.items.get(item.id)
      expect(updated?.packedQuantity).toBe(5) // unchanged
    })

    // And no log entry is created
    const logs = await db.inventoryLogs
      .filter((l) => l.itemId === item.id)
      .toArray()
    expect(logs).toHaveLength(0)
  })

  it('user can uncheck an optional item in an expanded recipe', async () => {
    // Given a recipe with two items
    const flour = await makeItem('Flour', 1, 5)
    const bacon = await makeItem('Bacon', 1, 3)
    await createRecipe({
      name: 'Quiche',
      items: [
        { itemId: flour.id, defaultAmount: 2 },
        { itemId: bacon.id, defaultAmount: 1 },
      ],
    })

    renderPage()
    const user = userEvent.setup()

    // When user checks the recipe
    await waitFor(() => {
      expect(screen.getByLabelText('Quiche')).toBeInTheDocument()
    })
    await user.click(screen.getByLabelText('Quiche'))

    // Then both items appear as checked
    await waitFor(() => {
      expect(
        screen.getByRole('checkbox', { name: /Remove Flour/i }),
      ).toBeChecked()
      expect(
        screen.getByRole('checkbox', { name: /Remove Bacon/i }),
      ).toBeChecked()
    })

    // When user unchecks Bacon (optional ingredient)
    await user.click(screen.getByRole('checkbox', { name: /Remove Bacon/i }))

    // Then Bacon is unchecked
    await waitFor(() => {
      expect(
        screen.getByRole('checkbox', { name: /Add Bacon/i }),
      ).not.toBeChecked()
    })
  })

  it('unchecked items are excluded from consumption', async () => {
    // Given a recipe with two items
    const flour = await makeItem('Flour', 1, 5)
    const bacon = await makeItem('Bacon', 1, 3)
    await createRecipe({
      name: 'Quiche',
      items: [
        { itemId: flour.id, defaultAmount: 2 },
        { itemId: bacon.id, defaultAmount: 1 },
      ],
    })

    renderPage()
    const user = userEvent.setup()

    // When user checks the recipe
    await waitFor(() => {
      expect(screen.getByLabelText('Quiche')).toBeInTheDocument()
    })
    await user.click(screen.getByLabelText('Quiche'))

    // And unchecks Bacon
    await waitFor(() => {
      expect(
        screen.getByRole('checkbox', { name: /Remove Bacon/i }),
      ).toBeInTheDocument()
    })
    await user.click(screen.getByRole('checkbox', { name: /Remove Bacon/i }))

    // And confirms Done
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /done/i })).not.toBeDisabled()
    })
    await user.click(screen.getByRole('button', { name: /done/i }))
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /confirm/i }),
      ).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /confirm/i }))

    // Then Flour's quantity is reduced
    await waitFor(async () => {
      const updatedFlour = await db.items.get(flour.id)
      const total =
        (updatedFlour?.packedQuantity ?? 0) +
        (updatedFlour?.unpackedQuantity ?? 0)
      expect(total).toBeLessThan(5)
    })

    // But Bacon's quantity is unchanged
    await waitFor(async () => {
      const updatedBacon = await db.items.get(bacon.id)
      expect(updatedBacon?.packedQuantity).toBe(3)
    })
  })
})
