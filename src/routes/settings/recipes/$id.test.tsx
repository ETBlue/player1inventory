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
import { createRecipe } from '@/db/operations'
import { routeTree } from '@/routeTree.gen'

describe('Recipe Detail - Info Tab', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.recipes.clear()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    sessionStorage.clear()
  })

  const renderInfoTab = (recipeId: string) => {
    const history = createMemoryHistory({
      initialEntries: [`/settings/recipes/${recipeId}`],
    })
    const router = createRouter({ routeTree, history })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
  }

  it('user can see the recipe name in the heading', async () => {
    const recipe = await createRecipe({ name: 'Pasta Dinner' })
    renderInfoTab(recipe.id)
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Pasta Dinner' }),
      ).toBeInTheDocument()
    })
  })

  it('user can edit the recipe name and save', async () => {
    const recipe = await createRecipe({ name: 'Pasta Dinner' })
    renderInfoTab(recipe.id)
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByLabelText('Name')).toBeInTheDocument()
    })
    const nameInput = screen.getByLabelText('Name')
    await user.clear(nameInput)
    await user.type(nameInput, 'Pasta Carbonara')
    await user.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(async () => {
      const updated = await db.recipes.get(recipe.id)
      expect(updated?.name).toBe('Pasta Carbonara')
    })
  })

  it('save button is disabled when name has not changed', async () => {
    const recipe = await createRecipe({ name: 'Pasta Dinner' })
    renderInfoTab(recipe.id)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
    })
  })
})
