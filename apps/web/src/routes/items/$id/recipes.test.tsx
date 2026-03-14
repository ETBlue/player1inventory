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

describe('Recipes Tab', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.items.clear()
    await db.recipes.clear()

    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  const renderRecipesTab = (itemId: string) => {
    const history = createMemoryHistory({
      initialEntries: [`/items/${itemId}/recipes`],
    })
    const router = createRouter({ routeTree, history })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
  }

  it('user can see all recipes on the recipes tab', async () => {
    // Given an item and two recipes (neither contains the item)
    const item = await createItem({
      name: 'Test Item',
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
    })
    await createRecipe({ name: 'Pasta Sauce' })
    await createRecipe({ name: 'Smoothie' })

    renderRecipesTab(item.id)

    // Then both recipe names appear as badges
    await waitFor(() => {
      expect(screen.getByText('Pasta Sauce')).toBeInTheDocument()
      expect(screen.getByText('Smoothie')).toBeInTheDocument()
    })
  })

  it('user can see assigned recipes highlighted', async () => {
    // Given a recipe that already contains the item
    const item = await createItem({
      name: 'Test Item',
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
    })
    await createRecipe({
      name: 'Pasta Sauce',
      items: [{ itemId: item.id, defaultAmount: 0 }],
    })

    renderRecipesTab(item.id)

    // Then the recipe badge is visible (assigned recipes appear in list)
    await waitFor(() => {
      expect(screen.getByText('Pasta Sauce')).toBeInTheDocument()
    })
  })

  it('recipe badge has aria-pressed reflecting assigned state', async () => {
    // Given a recipe not assigned to the item
    const item = await createItem({
      name: 'Test Item',
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
    })
    await createRecipe({ name: 'Pasta Sauce' })

    renderRecipesTab(item.id)
    const user = userEvent.setup()

    // Then the unassigned badge has aria-pressed="false"
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Pasta Sauce', pressed: false }),
      ).toBeInTheDocument()
    })

    // When user clicks to assign
    await user.click(
      screen.getByRole('button', { name: 'Pasta Sauce', pressed: false }),
    )

    // Then the badge has aria-pressed="true"
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /pasta sauce/i, pressed: true }),
      ).toBeInTheDocument()
    })
  })

  it('user can assign a recipe to an item', async () => {
    // Given an item and a recipe that does not contain the item
    const item = await createItem({
      name: 'Test Item',
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
    })
    const recipe = await createRecipe({ name: 'Pasta Sauce' })

    renderRecipesTab(item.id)
    const user = userEvent.setup()

    // When user clicks the recipe badge
    await waitFor(() => {
      expect(screen.getByText('Pasta Sauce')).toBeInTheDocument()
    })
    await user.click(screen.getByText('Pasta Sauce'))

    // Then the recipe's items array includes the item with defaultAmount 0
    await waitFor(async () => {
      const updatedRecipe = await db.recipes.get(recipe.id)
      expect(updatedRecipe?.items).toContainEqual({
        itemId: item.id,
        defaultAmount: 0,
      })
    })
  })

  it('user can unassign a recipe from an item', async () => {
    // Given a recipe that contains the item
    const item = await createItem({
      name: 'Test Item',
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
    })
    const recipe = await createRecipe({
      name: 'Pasta Sauce',
      items: [{ itemId: item.id, defaultAmount: 0 }],
    })

    renderRecipesTab(item.id)
    const user = userEvent.setup()

    // When user clicks the assigned recipe badge
    await waitFor(() => {
      expect(screen.getByText('Pasta Sauce')).toBeInTheDocument()
    })
    await user.click(screen.getByText('Pasta Sauce'))

    // Then the item is removed from the recipe's items array
    await waitFor(async () => {
      const updatedRecipe = await db.recipes.get(recipe.id)
      expect(updatedRecipe?.items.some((ri) => ri.itemId === item.id)).toBe(
        false,
      )
    })
  })

  it('user can create a new recipe from the recipes tab', async () => {
    // Given an item and no recipes
    const item = await createItem({
      name: 'Test Item',
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
    })

    renderRecipesTab(item.id)
    const user = userEvent.setup()

    // When user clicks "New Recipe" button and types a name
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /new recipe/i }),
      ).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /new recipe/i }))

    // Then the dialog opens
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })
    await user.type(screen.getByLabelText(/name/i), 'My New Recipe')
    await user.click(screen.getByRole('button', { name: /add recipe/i }))

    // Then a recipe is created and assigned to this item
    await waitFor(async () => {
      const recipes = await db.recipes.toArray()
      const newRecipe = recipes.find((r) => r.name === 'My New Recipe')
      expect(newRecipe).toBeDefined()
      expect(newRecipe?.items.some((ri) => ri.itemId === item.id)).toBe(true)
    })
  })
})
