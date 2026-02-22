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
import { routeTree } from '@/routeTree.gen'

describe('New Recipe page', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.recipes.clear()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  const renderPage = () => {
    const history = createMemoryHistory({
      initialEntries: ['/settings/recipes/new'],
    })
    const router = createRouter({ routeTree, history })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
    return router
  }

  it('user can create a recipe and is redirected to its detail page', async () => {
    const router = renderPage()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByLabelText('Name')).toBeInTheDocument()
    })
    await user.type(screen.getByLabelText('Name'), 'Pasta Dinner')
    await user.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(async () => {
      const recipes = await db.recipes.toArray()
      expect(recipes).toHaveLength(1)
      expect(recipes[0].name).toBe('Pasta Dinner')
    })

    await waitFor(() => {
      expect(router.state.location.pathname).toMatch(/^\/settings\/recipes\//)
      expect(router.state.location.pathname).not.toBe('/settings/recipes/new')
    })
  })

  it('save button is disabled when name is empty', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
    })
  })
})
