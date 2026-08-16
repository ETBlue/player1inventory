import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db'
import { cartIdFor, DEFAULT_LOCATION_ID } from '@/types'
import {
  ACTIVE_LOCATION_STORAGE_KEY,
  ActiveLocationProvider,
  useActiveLocation,
} from './useActiveLocation'

// Covers the cart-bootstrap `useEffect` in `ActiveLocationProvider`
// (PR D review, Important 1) — it had zero test coverage: deleting the whole
// effect left every other shopping/cart/operations test green. These tests
// assert the effect's actual, observable contract: mounting the provider (or
// switching the active location) must cause `bootstrapCarts` to write the
// no-vendor + per-vendor cart rows for that location into Dexie.

function Consumer() {
  const { activeLocationId, setActiveLocationId } = useActiveLocation()
  return (
    <div>
      <span data-testid="active-location-id">{activeLocationId}</span>
      <button type="button" onClick={() => setActiveLocationId('loc-2')}>
        switch
      </button>
    </div>
  )
}

function renderProvider() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ActiveLocationProvider>
        <Consumer />
      </ActiveLocationProvider>
    </QueryClientProvider>,
  )
}

describe('ActiveLocationProvider — cart bootstrap effect', () => {
  beforeEach(async () => {
    localStorage.removeItem('data-mode') // defaults to 'local'
    localStorage.removeItem(ACTIVE_LOCATION_STORAGE_KEY)
    await db.vendors.clear()
    await db.shoppingCarts.clear()
    await db.locations.clear()
    // The default location row is normally seeded by Dexie's `populate` hook
    // on first open; re-add it here since we just cleared the table (the
    // provider's stale-id fallback effect resets to DEFAULT_LOCATION_ID
    // whenever the active id doesn't match a known location).
    await db.locations.put({
      id: DEFAULT_LOCATION_ID,
      name: 'My Home',
      order: 0,
      createdAt: new Date(),
    })
  })

  afterEach(() => {
    localStorage.removeItem('data-mode')
    localStorage.removeItem(ACTIVE_LOCATION_STORAGE_KEY)
  })

  it('user opens the app — no-vendor and per-vendor carts are bootstrapped for the active location', async () => {
    // Given a vendor exists but no cart rows do yet
    await db.vendors.add({
      id: 'vendor-1',
      name: 'Costco',
      createdAt: new Date(),
    })
    expect(await db.shoppingCarts.toArray()).toHaveLength(0)

    // When the provider mounts (default active location)
    renderProvider()
    await screen.findByTestId('active-location-id')

    // Then the no-vendor cart and the vendor's cart both exist for that location
    await waitFor(async () => {
      const carts = await db.shoppingCarts.toArray()
      const ids = carts.map((c) => c.id)
      expect(ids).toContain(cartIdFor(DEFAULT_LOCATION_ID, null))
      expect(ids).toContain(cartIdFor(DEFAULT_LOCATION_ID, 'vendor-1'))
    })
  })

  it('user switches the active location — carts are bootstrapped for the new location too', async () => {
    // Given a vendor, a second location, and the provider mounted at the default location
    await db.vendors.add({
      id: 'vendor-1',
      name: 'Costco',
      createdAt: new Date(),
    })
    await db.locations.put({
      id: 'loc-2',
      name: 'Cabin',
      order: 1,
      createdAt: new Date(),
    })
    const user = userEvent.setup()
    renderProvider()
    await waitFor(async () => {
      const ids = (await db.shoppingCarts.toArray()).map((c) => c.id)
      expect(ids).toContain(cartIdFor(DEFAULT_LOCATION_ID, null))
    })

    // When the user switches the active location
    await user.click(screen.getByRole('button', { name: 'switch' }))
    await screen.findByText('loc-2')

    // Then carts are bootstrapped for the new location too
    await waitFor(async () => {
      const ids = (await db.shoppingCarts.toArray()).map((c) => c.id)
      expect(ids).toContain(cartIdFor('loc-2', null))
      expect(ids).toContain(cartIdFor('loc-2', 'vendor-1'))
    })
  })
})
