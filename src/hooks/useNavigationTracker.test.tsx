import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { loadNavigationHistory } from '@/lib/sessionStorage'
import { useNavigationTracker } from './useNavigationTracker'

// Root component that uses the global tracker
function RootLayout() {
  useNavigationTracker()
  return <Outlet />
}

// Simple test components that DON'T use useAppNavigation
function PantryPage() {
  return <div>Pantry Page</div>
}

function ShoppingPage() {
  return <div>Shopping Page</div>
}

function ItemPage() {
  return <div>Item Page</div>
}

describe('Global Navigation Tracking', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('tracks navigation to pages that do NOT use useAppNavigation hook', async () => {
    // Given: Router with pages that don't use useAppNavigation
    const rootRoute = createRootRoute({
      component: RootLayout,
    })
    const pantryRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: PantryPage,
    })
    const shoppingRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/shopping',
      component: ShoppingPage,
    })
    const itemRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/items/$id',
      component: ItemPage,
    })

    const routeTree = rootRoute.addChildren([
      pantryRoute,
      shoppingRoute,
      itemRoute,
    ])
    const history = createMemoryHistory({ initialEntries: ['/'] })
    const router = createRouter({ routeTree, history })

    // When: Rendering the router
    render(<RouterProvider router={router} />)

    // Then: Pantry page should be tracked
    await waitFor(() => {
      const navHistory = loadNavigationHistory()
      expect(navHistory).toContain('/')
    })

    // When: Navigate to shopping page
    await router.navigate({ to: '/shopping' })
    await waitFor(() => screen.getByText('Shopping Page'))

    // Then: Shopping page should be tracked
    await waitFor(() => {
      const navHistory = loadNavigationHistory()
      expect(navHistory).toContain('/shopping')
      expect(navHistory).toEqual(['/', '/shopping'])
    })

    // When: Navigate to item page
    await router.navigate({ to: '/items/123' })
    await waitFor(() => screen.getByText('Item Page'))

    // Then: Item page should be tracked
    await waitFor(() => {
      const navHistory = loadNavigationHistory()
      expect(navHistory).toContain('/items/123')
      expect(navHistory).toEqual(['/', '/shopping', '/items/123'])
    })
  })

  it('tracks navigation in correct order: vendors -> pantry -> item', async () => {
    // This reproduces the bug scenario from user testing
    const rootRoute = createRootRoute({
      component: RootLayout,
    })
    const vendorsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/settings/vendors',
      component: () => <div>Vendors</div>,
    })
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

    const routeTree = rootRoute.addChildren([
      vendorsRoute,
      pantryRoute,
      itemRoute,
    ])
    const history = createMemoryHistory({
      initialEntries: ['/settings/vendors'],
    })
    const router = createRouter({ routeTree, history })

    render(<RouterProvider router={router} />)

    // Initial: on vendors page
    await waitFor(() => {
      const navHistory = loadNavigationHistory()
      expect(navHistory).toEqual(['/settings/vendors'])
    })

    // Navigate to pantry
    await router.navigate({ to: '/' })
    await waitFor(() => screen.getByText('Pantry Page'))
    await waitFor(() => {
      const navHistory = loadNavigationHistory()
      expect(navHistory).toEqual(['/settings/vendors', '/'])
    })

    // Navigate to item
    await router.navigate({ to: '/items/123' })
    await waitFor(() => screen.getByText('Item Page'))
    await waitFor(() => {
      const navHistory = loadNavigationHistory()
      expect(navHistory).toEqual(['/settings/vendors', '/', '/items/123'])
    })
  })
})
