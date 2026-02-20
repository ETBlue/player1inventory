import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAppNavigation } from './useAppNavigation'

// Test components
function PantryPage() {
  return <div>Pantry Page</div>
}

function ItemPage() {
  const { goBack } = useAppNavigation('/')
  return (
    <div>
      <div>Item Page</div>
      <button type="button" onClick={goBack}>
        Back
      </button>
    </div>
  )
}

describe('Bug Reproduction: Navigation going to /settings/vendors', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('Bug #1: pantry -> item -> back should go to pantry, not /settings/vendors', async () => {
    // Setup router
    const rootRoute = createRootRoute()
    const pantryRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: PantryPage,
    })
    const itemRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/items/$id',
      component: ItemPage,
    })

    const routeTree = rootRoute.addChildren([pantryRoute, itemRoute])
    const history = createMemoryHistory({ initialEntries: ['/'] })
    const router = createRouter({ routeTree, history })

    // Given: User is on pantry page
    render(<RouterProvider router={router} />)
    await waitFor(() => screen.getByText('Pantry Page'))

    // When: User navigates to item page
    await router.navigate({ to: '/items/123' })
    await waitFor(() => screen.getByText('Item Page'))

    // When: User clicks back button
    const backButton = screen.getByRole('button', { name: /back/i })
    backButton.click()

    // Then: User should be back on pantry page
    await waitFor(() => screen.getByText('Pantry Page'))

    // Verify we're at pantry, NOT at /settings/vendors
    expect(router.state.location.pathname).toBe('/')
    expect(router.state.location.pathname).not.toBe('/settings/vendors')
  })
})
