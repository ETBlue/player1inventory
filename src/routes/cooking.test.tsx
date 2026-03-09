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
  getRecipe,
  updateRecipeLastCookedAt,
} from '@/db/operations'
import { routeTree } from '@/routeTree.gen'

describe('Use (Cooking) Page', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.items.clear()
    await db.recipes.clear()
    await db.inventoryLogs.clear()
    await db.tags.clear()
    await db.tagTypes.clear()
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

    // Then Done is disabled and Cancel is not shown
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /done/i })).toBeDisabled()
      expect(
        screen.queryByRole('button', { name: /cancel/i }),
      ).not.toBeInTheDocument()
    })
  })

  it('user can expand a recipe to see its items', async () => {
    // Given a recipe with an item
    const item = await makeItem('Flour', 2)
    await createRecipe({
      name: 'Pasta',
      items: [{ itemId: item.id, defaultAmount: 4 }],
    })

    renderPage()
    const user = userEvent.setup()

    // When user expands the recipe (chevron button)
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Expand Pasta/i }),
      ).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /Expand Pasta/i }))

    // Then the item list is visible
    await waitFor(() => {
      expect(screen.getByText('Flour')).toBeInTheDocument()
    })
  })

  it('user can collapse an expanded recipe to hide its items', async () => {
    // Given a recipe with an item, expanded
    const item = await makeItem('Flour', 2)
    await createRecipe({
      name: 'Pasta',
      items: [{ itemId: item.id, defaultAmount: 4 }],
    })

    renderPage()
    const user = userEvent.setup()

    // Given expanded recipe
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Expand Pasta/i }),
      ).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /Expand Pasta/i }))

    await waitFor(() => {
      expect(screen.getByText('Flour')).toBeInTheDocument()
    })

    // And collapses
    await user.click(screen.getByRole('button', { name: /Collapse Pasta/i }))

    // Then items are hidden
    await waitFor(() => {
      expect(screen.queryByText('Flour')).not.toBeInTheDocument()
    })
  })

  it('user can check a recipe without expanding it and items remain hidden', async () => {
    // Given a recipe with an item
    const item = await makeItem('Flour', 2)
    await createRecipe({
      name: 'Pasta',
      items: [{ itemId: item.id, defaultAmount: 4 }],
    })

    renderPage()
    const user = userEvent.setup()

    // When user checks the recipe (without expanding)
    await waitFor(() => {
      expect(screen.getByLabelText('Pasta')).toBeInTheDocument()
    })
    await user.click(screen.getByLabelText('Pasta'))

    // Then items are NOT visible (not expanded)
    await waitFor(() => {
      expect(screen.queryByText('Flour')).not.toBeInTheDocument()
    })
  })

  it('Done and Cancel buttons become enabled when a recipe is checked', async () => {
    // Given a recipe with an item
    const item = await makeItem('Flour', 1)
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

    // Then Done is enabled and Cancel appears
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /done/i })).not.toBeDisabled()
      expect(
        screen.getByRole('button', { name: /cancel/i }),
      ).toBeInTheDocument()
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

    // Expand the recipe first
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Expand Pasta/i }),
      ).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /Expand Pasta/i }))

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

    // Expand the recipe first
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Expand Pasta/i }),
      ).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /Expand Pasta/i }))

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

    // Expand the recipe first
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Expand Pasta/i }),
      ).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /Expand Pasta/i }))

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
    // Given a recipe with an item
    const item = await makeItem('Flour', 1)
    await createRecipe({
      name: 'Pasta',
      items: [{ itemId: item.id, defaultAmount: 2 }],
    })

    renderPage()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByLabelText('Pasta')).toBeInTheDocument()
    })
    await user.click(screen.getByLabelText('Pasta'))

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /cancel/i }),
      ).toBeInTheDocument()
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
      expect(
        screen.queryByRole('button', { name: /cancel/i }),
      ).not.toBeInTheDocument()
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

    // Expand the recipe first
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Expand Pasta/i }),
      ).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /Expand Pasta/i }))

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

  it('user can see items with defaultAmount 0 start unchecked', async () => {
    // Given a recipe where one item has defaultAmount 2 and one has defaultAmount 0
    const flour = await makeItem('Flour', 1, 5)
    const salt = await makeItem('Salt', 1, 3)
    await createRecipe({
      name: 'Pasta',
      items: [
        { itemId: flour.id, defaultAmount: 2 },
        { itemId: salt.id, defaultAmount: 0 },
      ],
    })

    renderPage()
    const user = userEvent.setup()

    // Expand the recipe first
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Expand Pasta/i }),
      ).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /Expand Pasta/i }))

    // When user checks the recipe
    await waitFor(() => {
      expect(screen.getByLabelText('Pasta')).toBeInTheDocument()
    })
    await user.click(screen.getByLabelText('Pasta'))

    // Then the item with defaultAmount 2 starts checked
    await waitFor(() => {
      expect(
        screen.getByRole('checkbox', { name: /Remove Flour/i }),
      ).toBeChecked()
    })

    // And the item with defaultAmount 0 starts unchecked
    expect(
      screen.getByRole('checkbox', { name: /Add Salt/i }),
    ).not.toBeChecked()
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

    // Expand the recipe first
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Expand Quiche/i }),
      ).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /Expand Quiche/i }))

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

    // Expand the recipe first
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Expand Quiche/i }),
      ).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /Expand Quiche/i }))

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

  it('user sees expiration but not tag badges when cooking a recipe', async () => {
    // Given an item with a tag and a future due date
    const tagType = await createTagType({ name: 'Category', color: 'blue' })
    const tag = await createTag({ typeId: tagType.id, name: 'Dairy' })

    const futureDate = new Date()
    futureDate.setFullYear(futureDate.getFullYear() + 1)

    const item = await createItem({
      name: 'Milk',
      tagIds: [tag.id],
      dueDate: futureDate,
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 2,
      unpackedQuantity: 0,
      consumeAmount: 1,
    })

    await createRecipe({
      name: 'Smoothie',
      items: [{ itemId: item.id, defaultAmount: 1 }],
    })

    renderPage()
    const user = userEvent.setup()

    // Expand the recipe first
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Expand Smoothie/i }),
      ).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /Expand Smoothie/i }))

    // When user checks the recipe
    await waitFor(() => {
      expect(screen.getByLabelText('Smoothie')).toBeInTheDocument()
    })
    await user.click(screen.getByLabelText('Smoothie'))

    // Then the item name is visible
    await waitFor(() => {
      expect(screen.getByText('Milk')).toBeInTheDocument()
    })

    // Then the tag badge is NOT visible (tags hidden in cooking mode)
    expect(screen.queryByText('Dairy')).not.toBeInTheDocument()

    // Then expiration text IS visible (expiration shown in cooking mode)
    expect(screen.getByText(/Expires/i)).toBeInTheDocument()
  })

  it('user can see the serving stepper when a recipe is checked', async () => {
    // Given a recipe with an item
    const item = await makeItem('Flour', 1)
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

    // Then serving stepper shows
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /increase.*serving/i }),
      ).toBeInTheDocument()
    })
  })

  it('serving count starts at 1 and can be increased', async () => {
    // Given a recipe with an item
    const item = await makeItem('Flour', 1)
    await createRecipe({
      name: 'Pasta',
      items: [{ itemId: item.id, defaultAmount: 2 }],
    })

    renderPage()
    const user = userEvent.setup()

    // When user checks the recipe and clicks +
    await waitFor(() => {
      expect(screen.getByLabelText('Pasta')).toBeInTheDocument()
    })
    await user.click(screen.getByLabelText('Pasta'))

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /increase.*serving/i }),
      ).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /increase.*serving/i }))

    // Then serving count shows 2
    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument()
    })
  })

  it('serving count cannot go below 1', async () => {
    // Given a recipe with an item, checked (serving = 1)
    const item = await makeItem('Flour', 1)
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

    // Then − button is disabled at 1
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /decrease.*serving/i }),
      ).toBeDisabled()
    })
  })

  it('serving count multiplies ingredient amounts on consumption', async () => {
    // Given a recipe: Flour with defaultAmount=2, packedQuantity=10
    const item = await makeItem('Flour', 1, 10)
    await createRecipe({
      name: 'Pasta',
      items: [{ itemId: item.id, defaultAmount: 2 }],
    })

    renderPage()
    const user = userEvent.setup()

    // When user checks the recipe and sets servings to 3
    await waitFor(() => {
      expect(screen.getByLabelText('Pasta')).toBeInTheDocument()
    })
    await user.click(screen.getByLabelText('Pasta'))

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /increase.*serving/i }),
      ).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /increase.*serving/i })) // 2
    await user.click(screen.getByRole('button', { name: /increase.*serving/i })) // 3

    // And clicks Done and confirms
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

    // Then Flour is reduced by 3 × 2 = 6 (from 10 to 4)
    await waitFor(async () => {
      const updated = await db.items.get(item.id)
      const total =
        (updated?.packedQuantity ?? 0) + (updated?.unpackedQuantity ?? 0)
      expect(total).toBe(4)
    })
  })

  it('recipe checkbox shows indeterminate when only some items are checked', async () => {
    // Given a recipe with two items (both have defaultAmount > 0)
    const flour = await makeItem('Flour', 1, 5)
    const salt = await makeItem('Salt', 1, 3)
    await createRecipe({
      name: 'Pasta',
      items: [
        { itemId: flour.id, defaultAmount: 2 },
        { itemId: salt.id, defaultAmount: 1 },
      ],
    })

    renderPage()
    const user = userEvent.setup()

    // When user expands the recipe and checks all items via recipe checkbox
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Expand Pasta/i }),
      ).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /Expand Pasta/i }))
    await user.click(screen.getByLabelText('Pasta'))

    // And unchecks Salt
    await waitFor(() => {
      expect(
        screen.getByRole('checkbox', { name: /Remove Salt/i }),
      ).toBeInTheDocument()
    })
    await user.click(screen.getByRole('checkbox', { name: /Remove Salt/i }))

    // Then the recipe checkbox is indeterminate
    await waitFor(() => {
      expect(screen.getByLabelText('Pasta')).toHaveAttribute(
        'data-state',
        'indeterminate',
      )
    })
  })

  it('clicking indeterminate recipe checkbox checks all default items', async () => {
    // Given a recipe with two items, put into indeterminate state
    const flour = await makeItem('Flour', 1, 5)
    const salt = await makeItem('Salt', 1, 3)
    await createRecipe({
      name: 'Pasta',
      items: [
        { itemId: flour.id, defaultAmount: 2 },
        { itemId: salt.id, defaultAmount: 1 },
      ],
    })

    renderPage()
    const user = userEvent.setup()

    // Expand, check all, then uncheck Salt → indeterminate
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Expand Pasta/i }),
      ).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /Expand Pasta/i }))
    await user.click(screen.getByLabelText('Pasta'))
    await waitFor(() => {
      expect(
        screen.getByRole('checkbox', { name: /Remove Salt/i }),
      ).toBeInTheDocument()
    })
    await user.click(screen.getByRole('checkbox', { name: /Remove Salt/i }))

    // When user clicks the indeterminate recipe checkbox
    await waitFor(() => {
      expect(screen.getByLabelText('Pasta')).toHaveAttribute(
        'data-state',
        'indeterminate',
      )
    })
    await user.click(screen.getByLabelText('Pasta'))

    // Then both items are checked
    await waitFor(() => {
      expect(
        screen.getByRole('checkbox', { name: /Remove Flour/i }),
      ).toBeChecked()
      expect(
        screen.getByRole('checkbox', { name: /Remove Salt/i }),
      ).toBeChecked()
    })
  })

  it('expand/collapse does not affect check state', async () => {
    // Given a recipe with an item
    const item = await makeItem('Flour', 1)
    await createRecipe({
      name: 'Pasta',
      items: [{ itemId: item.id, defaultAmount: 2 }],
    })

    renderPage()
    const user = userEvent.setup()

    // When user expands and checks the recipe
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Expand Pasta/i }),
      ).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /Expand Pasta/i }))
    await user.click(screen.getByLabelText('Pasta'))

    // Then Done is enabled (items are checked)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /done/i })).not.toBeDisabled()
    })

    // When user collapses the recipe
    await user.click(screen.getByRole('button', { name: /Collapse Pasta/i }))

    // Then Done remains enabled (check state persists through collapse)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /done/i })).not.toBeDisabled()
    })
  })

  it('user can expand an unchecked recipe and items show as unchecked', async () => {
    // Given a recipe with a default item (defaultAmount > 0)
    const item = await makeItem('Flour', 1, 5)
    await createRecipe({
      name: 'Pasta',
      items: [{ itemId: item.id, defaultAmount: 2 }],
    })

    renderPage()
    const user = userEvent.setup()

    // When user expands the recipe WITHOUT clicking the recipe checkbox
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Expand Pasta/i }),
      ).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /Expand Pasta/i }))

    // Then item checkboxes are unchecked (recipe itself is unchecked)
    // When unchecked, ItemCard aria-label is "Add <name>" not "Remove <name>"
    await waitFor(() => {
      expect(
        screen.getByRole('checkbox', { name: /Add Flour/i }),
      ).not.toBeChecked()
    })

    // And the recipe checkbox is unchecked
    expect(screen.getByLabelText('Pasta')).toHaveAttribute(
      'data-state',
      'unchecked',
    )
  })

  it('user can check a recipe where all items have defaultAmount 0', async () => {
    // Given a recipe with one item that has defaultAmount 0 (optional ingredient)
    const item = await makeItem('Salt', 1)
    await createRecipe({
      name: 'Pasta',
      items: [{ itemId: item.id, defaultAmount: 0 }],
    })

    renderPage()
    const user = userEvent.setup()

    // When user clicks the recipe checkbox
    await waitFor(() => {
      expect(screen.getByLabelText('Pasta')).toBeInTheDocument()
    })
    await user.click(screen.getByLabelText('Pasta'))

    // Then the recipe checkbox should be checked (not stuck unchecked)
    await waitFor(() => {
      expect(screen.getByLabelText('Pasta')).toHaveAttribute(
        'data-state',
        'checked',
      )
    })
  })

  it('recipe subtitle shows × 1 when recipe is checked at default servings', async () => {
    // Given a recipe with 1 item (defaultAmount > 0)
    const item = await makeItem('Flour', 1)
    await createRecipe({
      name: 'Pasta',
      items: [{ itemId: item.id, defaultAmount: 2 }],
    })

    renderPage()
    const user = userEvent.setup()

    // When user clicks the recipe checkbox
    await waitFor(() => {
      expect(screen.getByLabelText('Pasta')).toBeInTheDocument()
    })
    await user.click(screen.getByLabelText('Pasta'))

    // Then subtitle text includes × 1
    await waitFor(() => {
      expect(screen.getByText(/× 1/)).toBeInTheDocument()
    })
  })

  it('recipe subtitle shows × N after increasing servings', async () => {
    // Given a recipe with 1 item (defaultAmount > 0)
    const item = await makeItem('Flour', 1)
    await createRecipe({
      name: 'Pasta',
      items: [{ itemId: item.id, defaultAmount: 2 }],
    })

    renderPage()
    const user = userEvent.setup()

    // When user clicks the recipe checkbox
    await waitFor(() => {
      expect(screen.getByLabelText('Pasta')).toBeInTheDocument()
    })
    await user.click(screen.getByLabelText('Pasta'))

    // And clicks "Increase servings" twice
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /increase.*serving/i }),
      ).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /increase.*serving/i }))
    await user.click(screen.getByRole('button', { name: /increase.*serving/i }))

    // Then subtitle text includes × 3
    await waitFor(() => {
      expect(screen.getByText(/× 3/)).toBeInTheDocument()
    })
  })

  it('recipe subtitle does not show × N when recipe is unchecked', async () => {
    // Given a recipe with 1 item (defaultAmount > 0)
    const item = await makeItem('Flour', 1)
    await createRecipe({
      name: 'Pasta',
      items: [{ itemId: item.id, defaultAmount: 2 }],
    })

    // When recipe is not checked
    renderPage()

    // Then the text × does not appear in the document
    await waitFor(() => {
      expect(screen.getByText('Pasta')).toBeInTheDocument()
    })
    expect(screen.queryByText(/×/)).not.toBeInTheDocument()
  })

  it('user sees 0 servings cooked and no cancel button when nothing is checked', async () => {
    // Given a recipe exists
    await createRecipe({ name: 'Pasta' })
    renderPage()

    // Then count text shows 0 servings and Cancel button is absent
    await waitFor(() => {
      expect(screen.getByText(/0 servings? cooked/i)).toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: /cancel/i }),
      ).not.toBeInTheDocument()
    })
  })

  it('user sees serving count update and cancel button after checking a recipe', async () => {
    // Given a recipe with one item
    const item = await makeItem('Tomato')
    await createRecipe({
      name: 'Salad',
      items: [{ itemId: item.id, defaultAmount: 1 }],
    })
    renderPage()

    // When user checks the recipe checkbox
    await waitFor(() => screen.getByLabelText('Salad'))
    await userEvent.click(screen.getByLabelText('Salad'))

    // Then count text updates to 1 serving cooked
    await waitFor(() => {
      expect(screen.getByText(/1 serving cooked/i)).toBeInTheDocument()
    })

    // Then Cancel button appears
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
  })

  it('user sees done button disabled when nothing is checked', async () => {
    // Given a recipe exists
    await createRecipe({ name: 'Pasta' })
    renderPage()

    // Then Done is disabled
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /done/i })).toBeDisabled()
    })
  })

  it('user sees search toggle button in toolbar', async () => {
    // Given cooking page renders
    renderPage()

    // Then search toggle button is present
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /toggle search/i }),
      ).toBeInTheDocument()
    })
  })

  describe('search', () => {
    it('user can toggle search input via search icon button', async () => {
      // Given cooking page with a recipe
      await createRecipe({ name: 'Pasta' })
      renderPage()

      // When user clicks the search toggle button
      await waitFor(() =>
        screen.getByRole('button', { name: /toggle search/i }),
      )
      await userEvent.click(
        screen.getByRole('button', { name: /toggle search/i }),
      )

      // Then search input is visible
      expect(screen.getByPlaceholderText(/search recipes/i)).toBeInTheDocument()

      // When user clicks the toggle again
      await userEvent.click(
        screen.getByRole('button', { name: /toggle search/i }),
      )

      // Then search input is hidden
      expect(
        screen.queryByPlaceholderText(/search recipes/i),
      ).not.toBeInTheDocument()
    })

    it('user can filter recipes by title', async () => {
      // Given two recipes
      await createRecipe({ name: 'Pasta Dinner' })
      await createRecipe({ name: 'Tomato Salad' })
      renderPage()

      // When user opens search (wait for recipes to load first)
      await waitFor(() => screen.getByText('Pasta Dinner'))
      await userEvent.click(
        screen.getByRole('button', { name: /toggle search/i }),
      )
      await userEvent.type(
        screen.getByPlaceholderText(/search recipes/i),
        'pasta',
      )

      // Then only Pasta Dinner is visible (text may be split by highlight mark element)
      await waitFor(() => {
        expect(
          screen.getByText(
            (_content, element) =>
              element?.tagName === 'BUTTON' &&
              element.textContent === 'Pasta Dinner',
          ),
        ).toBeInTheDocument()
        expect(
          screen.queryByText(
            (_content, element) =>
              element?.tagName === 'BUTTON' &&
              element.textContent === 'Tomato Salad',
          ),
        ).not.toBeInTheDocument()
      })
    })

    it('user can find a recipe by item name and see the item auto-expanded', async () => {
      // Given a recipe "Salad" with item "Tomato" and a sibling item "Lettuce"
      const tomato = await makeItem('Tomato')
      const lettuce = await makeItem('Lettuce')
      await createRecipe({
        name: 'Salad',
        items: [
          { itemId: tomato.id, defaultAmount: 1 },
          { itemId: lettuce.id, defaultAmount: 1 },
        ],
      })
      renderPage()

      // When user searches "tomato" (wait for recipe to load first)
      await waitFor(() => screen.getByText('Salad'))
      await userEvent.click(
        screen.getByRole('button', { name: /toggle search/i }),
      )
      await userEvent.type(
        screen.getByPlaceholderText(/search recipes/i),
        'tomato',
      )

      // Then Salad recipe is visible and Tomato item is shown
      // (Salad not highlighted since it doesn't contain "tomato")
      await waitFor(() => {
        expect(screen.getByText('Salad')).toBeInTheDocument()
        // Tomato item name may be highlighted — check by textContent
        expect(
          screen.getByText(
            (_content, element) =>
              (element?.tagName === 'H3' || element?.tagName === 'BUTTON') &&
              element.textContent === 'Tomato',
          ),
        ).toBeInTheDocument()
      })

      // And Lettuce (sibling) is not shown
      expect(
        screen.queryByText(
          (_content, element) => element?.textContent === 'Lettuce',
        ),
      ).not.toBeInTheDocument()
    })

    it('user sees create button when no exact recipe title match exists', async () => {
      // Given one recipe "Pasta"
      await createRecipe({ name: 'Pasta' })
      renderPage()

      // When user types "Pizza" (no exact match) — wait for recipe to load first
      await waitFor(() => screen.getByText('Pasta'))
      await userEvent.click(
        screen.getByRole('button', { name: /toggle search/i }),
      )
      await userEvent.type(
        screen.getByPlaceholderText(/search recipes/i),
        'Pizza',
      )

      // Then both Create and Clear buttons are visible
      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /create/i }),
        ).toBeInTheDocument()
        expect(
          screen.getByRole('button', { name: /clear search/i }),
        ).toBeInTheDocument()
      })
    })

    it('user sees matched items expanded when both recipe title and item name match', async () => {
      // Given a recipe "Pasta" with item "Pasta Sauce" and sibling item "Cheese"
      const sauce = await makeItem('Pasta Sauce')
      const cheese = await makeItem('Cheese')
      await createRecipe({
        name: 'Pasta',
        items: [
          { itemId: sauce.id, defaultAmount: 1 },
          { itemId: cheese.id, defaultAmount: 1 },
        ],
      })
      renderPage()

      // When user searches "pasta" (matches both recipe title and item "Pasta Sauce")
      await waitFor(() => screen.getByText('Pasta'))
      await userEvent.click(
        screen.getByRole('button', { name: /toggle search/i }),
      )
      await userEvent.type(
        screen.getByPlaceholderText(/search recipes/i),
        'pasta',
      )

      // Then Pasta Sauce item is shown (recipe auto-expanded)
      await waitFor(() => {
        expect(
          screen.getByText(
            (_content, element) =>
              element?.tagName === 'H3' &&
              !!element.textContent?.match(/pasta sauce/i),
          ),
        ).toBeInTheDocument()
      })

      // And Cheese (non-matching sibling) is not shown
      expect(screen.queryByText('Cheese')).not.toBeInTheDocument()
    })

    it('user does not see create button when exact title match exists', async () => {
      // Given one recipe "Pasta"
      await createRecipe({ name: 'Pasta' })
      renderPage()

      // When user types "pasta" (exact match, case-insensitive) — wait for recipe to load first
      await waitFor(() => screen.getByText('Pasta'))
      await userEvent.click(
        screen.getByRole('button', { name: /toggle search/i }),
      )
      await userEvent.type(
        screen.getByPlaceholderText(/search recipes/i),
        'pasta',
      )

      // Then Create button is not visible; X clear button is still shown
      await waitFor(() => {
        expect(
          screen.queryByRole('button', { name: /create/i }),
        ).not.toBeInTheDocument()
        expect(
          screen.getByRole('button', { name: /clear search/i }),
        ).toBeInTheDocument()
      })
    })
  })

  it('user can toggle a recipe with mixed defaultAmounts on and off', async () => {
    // Given a recipe with one default item and one optional item
    const flour = await makeItem('Flour', 1, 5)
    const salt = await makeItem('Salt', 1, 3)
    await createRecipe({
      name: 'Pasta',
      items: [
        { itemId: flour.id, defaultAmount: 2 },
        { itemId: salt.id, defaultAmount: 0 },
      ],
    })

    renderPage()
    const user = userEvent.setup()

    // When user clicks the recipe checkbox (Flour is default, Salt is optional)
    await waitFor(() => {
      expect(screen.getByLabelText('Pasta')).toBeInTheDocument()
    })
    await user.click(screen.getByLabelText('Pasta'))

    // Then the recipe checkbox shows as checked (all DEFAULT items are checked)
    await waitFor(() => {
      expect(screen.getByLabelText('Pasta')).toHaveAttribute(
        'data-state',
        'checked',
      )
    })

    // When user clicks again
    await user.click(screen.getByLabelText('Pasta'))

    // Then the recipe checkbox is unchecked (can toggle off)
    await waitFor(() => {
      expect(screen.getByLabelText('Pasta')).toHaveAttribute(
        'data-state',
        'unchecked',
      )
    })
  })

  it('user can sort recipes by name alphabetically by default', async () => {
    // Given two recipes created in non-alphabetical order
    await createRecipe({ name: 'Zucchini Soup' })
    await createRecipe({ name: 'Apple Tart' })

    renderPage()

    // Then recipes appear alphabetically (Apple Tart before Zucchini Soup)
    await waitFor(() => {
      const recipeNames = screen
        .getAllByRole('button')
        .map((el) => el.textContent?.trim())
        .filter((t) => t === 'Apple Tart' || t === 'Zucchini Soup')
      expect(recipeNames[0]).toBe('Apple Tart')
      expect(recipeNames[1]).toBe('Zucchini Soup')
    })
  })

  it('user can expand all recipes at once', async () => {
    // Given two recipes
    await createRecipe({ name: 'Pasta Dinner' })
    await createRecipe({ name: 'Pasta Salad' })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Pasta Dinner')).toBeInTheDocument()
    })

    // When user clicks Expand all
    await userEvent.click(screen.getByRole('button', { name: 'Expand all' }))

    // Then both chevrons change to Collapse and button becomes Collapse all
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Collapse all' }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /Collapse Pasta Dinner/i }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /Collapse Pasta Salad/i }),
      ).toBeInTheDocument()
    })
  })

  it('user can collapse all recipes at once', async () => {
    // Given a recipe, expanded via Expand all
    await createRecipe({ name: 'Pasta Dinner' })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Pasta Dinner')).toBeInTheDocument()
    })

    // First expand all
    await userEvent.click(screen.getByRole('button', { name: 'Expand all' }))
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Collapse all' }),
      ).toBeInTheDocument()
    })

    // When user clicks Collapse all
    await userEvent.click(screen.getByRole('button', { name: 'Collapse all' }))

    // Then chevron goes back to Expand and button shows Expand all again
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Expand all' }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /Expand Pasta Dinner/i }),
      ).toBeInTheDocument()
    })
  })

  it('user can have lastCookedAt recorded when done cooking', async () => {
    // Given a recipe with an item
    const item = await makeItem('Egg')
    const recipe = await createRecipe({
      name: 'Omelette',
      items: [{ itemId: item.id, defaultAmount: 1 }],
    })
    expect(recipe.lastCookedAt).toBeUndefined()

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Omelette')).toBeInTheDocument()
    })

    // When user checks the recipe and confirms Done
    const checkbox = screen.getByRole('checkbox', { name: 'Omelette' })
    await userEvent.click(checkbox)
    await userEvent.click(screen.getByRole('button', { name: /done/i }))
    await userEvent.click(screen.getByRole('button', { name: /confirm/i }))

    // Then lastCookedAt is set on the recipe
    await waitFor(async () => {
      const updated = await getRecipe(recipe.id)
      expect(updated?.lastCookedAt).toBeDefined()
    })
  })

  it('user can sort recipes by item count descending', async () => {
    // Given two recipes with different item counts
    const item1 = await makeItem('Egg')
    const item2 = await makeItem('Milk')
    await createRecipe({
      name: 'Omelette',
      items: [
        { itemId: item1.id, defaultAmount: 2 },
        { itemId: item2.id, defaultAmount: 1 },
      ],
    })
    await createRecipe({ name: 'Toast', items: [] })

    const router = renderPage()

    await waitFor(() => {
      expect(screen.getByText('Omelette')).toBeInTheDocument()
    })

    // When user navigates to sort by count descending
    await router.navigate({
      to: '/cooking',
      search: { sort: 'count', dir: 'desc', q: '' },
    })

    // Then Omelette (2 items) appears before Toast (0 items)
    await waitFor(() => {
      const buttons = screen
        .getAllByRole('button')
        .filter(
          (el) =>
            el.textContent?.trim() === 'Omelette' ||
            el.textContent?.trim() === 'Toast',
        )
      expect(buttons[0].textContent?.trim()).toBe('Omelette')
      expect(buttons[1].textContent?.trim()).toBe('Toast')
    })
  })

  it('user can sort recipes by most recently cooked, uncooked last', async () => {
    // Given two recipes: one recently cooked, one never cooked
    const _recipe1 = await createRecipe({ name: 'Alpha' })
    const recipe2 = await createRecipe({ name: 'Beta' })

    // Mark recipe2 as recently cooked
    await updateRecipeLastCookedAt(recipe2.id)

    const router = renderPage()

    await waitFor(() => {
      expect(screen.getByText('Alpha')).toBeInTheDocument()
    })

    // When user sorts by last cooked ascending (most recently cooked first, like Expiring)
    await router.navigate({
      to: '/cooking',
      search: { sort: 'recent', dir: 'asc', q: '' },
    })

    // Then Beta (recently cooked) appears before Alpha (never cooked)
    await waitFor(() => {
      const buttons = screen
        .getAllByRole('button')
        .filter(
          (el) =>
            el.textContent?.trim() === 'Alpha' ||
            el.textContent?.trim() === 'Beta',
        )
      expect(buttons[0].textContent?.trim()).toBe('Beta')
      expect(buttons[1].textContent?.trim()).toBe('Alpha')
    })
  })
})
