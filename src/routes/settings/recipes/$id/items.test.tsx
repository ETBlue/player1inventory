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

describe('Recipe Detail - Items Tab', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.items.clear()
    await db.recipes.clear()
    await db.inventoryLogs.clear()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  const renderItemsTab = (recipeId: string) => {
    const history = createMemoryHistory({
      initialEntries: [`/settings/recipes/${recipeId}/items`],
    })
    const router = createRouter({ routeTree, history })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
  }

  const makeItem = (name: string, consumeAmount = 1) =>
    createItem({
      name,
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount,
      tagIds: [],
      vendorIds: [],
    })

  const makeRecipe = (
    name: string,
    items: { itemId: string; defaultAmount: number }[] = [],
  ) => createRecipe({ name, items })

  it('user can see all items in the recipe items checklist', async () => {
    // Given a recipe and two items
    const recipe = await makeRecipe('Pasta')
    await makeItem('Noodles')
    await makeItem('Tomato Sauce')

    renderItemsTab(recipe.id)

    // Then both items appear in the list
    await waitFor(() => {
      expect(screen.getByLabelText('Noodles')).toBeInTheDocument()
      expect(screen.getByLabelText('Tomato Sauce')).toBeInTheDocument()
    })
  })

  it('user can see already-assigned items as checked', async () => {
    // Given an item and a recipe that includes it
    const item = await makeItem('Noodles')
    const recipe = await makeRecipe('Pasta', [
      { itemId: item.id, defaultAmount: 2 },
    ])
    await makeItem('Tomato Sauce')

    renderItemsTab(recipe.id)

    // Then Noodles is checked and Tomato Sauce is not
    await waitFor(() => {
      expect(screen.getByLabelText('Noodles')).toBeChecked()
      expect(screen.getByLabelText('Tomato Sauce')).not.toBeChecked()
    })
  })

  it('user can filter items by name', async () => {
    // Given a recipe and two items
    const recipe = await makeRecipe('Pasta')
    await makeItem('Noodles')
    await makeItem('Tomato Sauce')

    renderItemsTab(recipe.id)
    const user = userEvent.setup()

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText(/search or create/i),
      ).toBeInTheDocument()
    })

    // When user types "nood"
    await user.type(screen.getByPlaceholderText(/search or create/i), 'nood')

    // Then only Noodles is visible
    await waitFor(() => {
      expect(screen.getByLabelText('Noodles')).toBeInTheDocument()
      expect(screen.queryByLabelText('Tomato Sauce')).not.toBeInTheDocument()
    })
  })

  it('user can add an item to a recipe by checking it', async () => {
    // Given a recipe and an unassigned item
    const recipe = await makeRecipe('Pasta')
    const item = await makeItem('Noodles', 2)

    renderItemsTab(recipe.id)
    const user = userEvent.setup()

    // When user clicks the checkbox
    await waitFor(() => {
      expect(screen.getByLabelText('Noodles')).toBeInTheDocument()
    })
    await user.click(screen.getByLabelText('Noodles'))

    // Then the item is added to the recipe in the DB with defaultAmount from consumeAmount
    await waitFor(async () => {
      const updated = await db.recipes.get(recipe.id)
      const recipeItem = updated?.items.find((ri) => ri.itemId === item.id)
      expect(recipeItem).toBeDefined()
      expect(recipeItem?.defaultAmount).toBe(2)
    })
  })

  it('user can remove an item from a recipe by unchecking it', async () => {
    // Given a recipe that already includes an item
    const item = await makeItem('Noodles')
    const recipe = await makeRecipe('Pasta', [
      { itemId: item.id, defaultAmount: 1 },
    ])

    renderItemsTab(recipe.id)
    const user = userEvent.setup()

    // When user unchecks the item
    await waitFor(() => {
      expect(screen.getByLabelText('Noodles')).toBeChecked()
    })
    await user.click(screen.getByLabelText('Noodles'))

    // Then the item is removed from the recipe in the DB
    await waitFor(async () => {
      const updated = await db.recipes.get(recipe.id)
      const recipeItem = updated?.items.find((ri) => ri.itemId === item.id)
      expect(recipeItem).toBeUndefined()
    })
  })

  it('user can change the default amount for a recipe item', async () => {
    // Given a recipe with an item
    const item = await makeItem('Noodles')
    const recipe = await makeRecipe('Pasta', [
      { itemId: item.id, defaultAmount: 1 },
    ])

    renderItemsTab(recipe.id)
    const user = userEvent.setup()

    // When user clicks + twice to increase the amount (step = consumeAmount = 1, so 1 → 2 → 3)
    await waitFor(() => {
      expect(screen.getByLabelText('Increase Noodles')).toBeInTheDocument()
    })
    await user.click(screen.getByLabelText('Increase Noodles'))
    // Wait for first mutation to commit before second click (avoids stale closure race)
    await waitFor(async () => {
      const updated = await db.recipes.get(recipe.id)
      const recipeItem = updated?.items.find((ri) => ri.itemId === item.id)
      expect(recipeItem?.defaultAmount).toBe(2)
    })
    await user.click(screen.getByLabelText('Increase Noodles'))

    // Then the default amount is saved to the DB
    await waitFor(async () => {
      const updated = await db.recipes.get(recipe.id)
      const recipeItem = updated?.items.find((ri) => ri.itemId === item.id)
      expect(recipeItem?.defaultAmount).toBe(3)
    })
  })

  it('user can create a new item from the recipe items tab and it is added to the recipe', async () => {
    // Given a recipe with no items matching "Butter"
    const recipe = await makeRecipe('Baking')
    renderItemsTab(recipe.id)
    const user = userEvent.setup()

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText(/search or create/i),
      ).toBeInTheDocument()
    })

    // When user types "Butter" into the search input (zero matches) and presses Enter
    await user.type(screen.getByPlaceholderText(/search or create/i), 'Butter')
    await user.keyboard('{Enter}')

    // Then the new item appears in the list checked (assigned to the recipe)
    await waitFor(() => {
      expect(screen.getByLabelText('Butter')).toBeChecked()
    })

    await waitFor(async () => {
      const items = await db.items.toArray()
      const butter = items.find((i) => i.name === 'Butter')
      expect(butter).toBeDefined()
      const updatedRecipe = await db.recipes.get(recipe.id)
      const recipeItem = updatedRecipe?.items.find(
        (ri) => ri.itemId === butter?.id,
      )
      expect(recipeItem).toBeDefined()
    })
  })

  it('user sees a create row only when search has text and zero items match', async () => {
    // Given a recipe with one item
    const recipe = await makeRecipe('Pasta')
    await makeItem('Noodles')
    renderItemsTab(recipe.id)
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
    await user.type(screen.getByPlaceholderText(/search or create/i), 'nood')

    // Then the create row is not shown (Noodles matched)
    await waitFor(() => {
      expect(screen.queryByText(/create/i)).not.toBeInTheDocument()
      expect(screen.getByLabelText('Noodles')).toBeInTheDocument()
    })
  })

  it('user can create an item by clicking the create row', async () => {
    // Given a recipe with no items matching "Butter"
    const recipe = await makeRecipe('Baking')
    renderItemsTab(recipe.id)
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
      expect(screen.getByLabelText('Butter')).toBeChecked()
      expect(screen.getByPlaceholderText(/search or create/i)).toHaveValue('')
    })
  })

  it('user can clear the search by pressing Escape', async () => {
    // Given a recipe and the search input has text
    const recipe = await makeRecipe('Pasta')
    renderItemsTab(recipe.id)
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
    // Given a recipe
    const recipe = await makeRecipe('Pasta')
    renderItemsTab(recipe.id)

    // Then no New button is present
    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: /new/i }),
      ).not.toBeInTheDocument()
    })
  })
})
