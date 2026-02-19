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

describe('New Vendor page', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.vendors.clear()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  const renderPage = () => {
    const history = createMemoryHistory({
      initialEntries: ['/settings/vendors/new'],
    })
    const router = createRouter({ routeTree, history })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
    return router
  }

  it('user can create a vendor and is redirected to its detail page', async () => {
    // Given the new vendor page
    const router = renderPage()
    const user = userEvent.setup()

    // When user types a name and saves
    await waitFor(() => {
      expect(screen.getByLabelText('Name')).toBeInTheDocument()
    })
    await user.type(screen.getByLabelText('Name'), 'Whole Foods')
    await user.click(screen.getByRole('button', { name: /save/i }))

    // Then the vendor is created in the database
    await waitFor(async () => {
      const vendors = await db.vendors.toArray()
      expect(vendors).toHaveLength(1)
      expect(vendors[0].name).toBe('Whole Foods')
    })

    // And user is redirected to vendor detail page
    await waitFor(() => {
      expect(router.state.location.pathname).toMatch(/^\/settings\/vendors\//)
      expect(router.state.location.pathname).not.toBe('/settings/vendors/new')
    })
  })

  it('save button is disabled when name is empty', async () => {
    // Given the new vendor page
    renderPage()

    // Then the Save button is disabled
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
    })
  })
})
