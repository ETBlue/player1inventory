import {
  MockedProvider,
  type MockedProviderProps,
} from '@apollo/client/testing/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createCache } from '@/apollo/client'
import {
  AllCartsDocument,
  BootstrapCartsDocument,
  CreateVendorDocument,
  VendorCartDocument,
} from '@/generated/graphql'
import { getLocationsMock, LOC_A, LOC_B } from '@/test/cloudFixtures'
import { cartIdFor, DEFAULT_LOCATION_ID } from '@/types'
import {
  ActiveLocationProvider,
  activeLocationStorageKey,
  useActiveLocation,
} from './useActiveLocation'
import * as dataModeHooks from './useDataMode'
import {
  useAllActiveCarts,
  useLastPurchasedByVendor,
  useVendorCart,
} from './useShoppingCart'
import { useCreateVendor } from './useVendors'

// The CLOUD cart hooks, after PR 3b re-keyed `Cart.id` to
// `${locationId}:${vendorId | 'no-vendor'}`.
//
// The REAL generated hooks, driven through `MockedProvider` with the real
// documents. `src/test/setup.ts` stubs every generated hook, and a stubbed
// `useVendorCartQuery` would swallow the variables — so "a cart came back"
// could pass against a hook that sent no `locationId` at all, which is exactly
// what this task fixes. `useShoppingCart.test.ts` keeps the stubbed tests; it
// can only pin shapes, never which location a request named.
vi.mock('@/generated/graphql', async (importOriginal) => await importOriginal())

// `@apollo/client/react` is unmocked too: `useCreateVendor`'s cloud branch
// resolves its location through `useApolloClient()` (`useCloudLocationId`), and
// setup.ts's stub returns `{ data: {} }` from `query`, which would take the
// degraded fall-through branch and make the fresh-session test below unable to
// fail.
vi.mock(
  '@apollo/client/react',
  async (importOriginal) => await importOriginal(),
)

vi.mock('./useDataMode', () => ({ useDataMode: vi.fn() }))

const VENDOR_COSTCO = 'vendor-costco'

type ServerCart = {
  __typename: 'Cart'
  id: string
  lastPurchasedAt: string | null
}

const cart = (
  locationId: string,
  vendorId: string | null,
  lastPurchasedAt: string | null = null,
): ServerCart => ({
  __typename: 'Cart',
  id: cartIdFor(locationId, vendorId),
  lastPurchasedAt,
})

// THE FIXTURE IS THE TEST. The SAME vendor has a cart at BOTH locations, with
// DIFFERENT `lastPurchasedAt` values. With one location, "the cart at the
// location I am viewing" and "this vendor's only cart" are the same row, so
// every assertion below would pass against a hook that ignored the location.
//
// The dates are crossed on purpose: LOC_B's cart is the OLDER one, so a hook
// that took "the last cart in the list" or "the newest date" would still get
// LOC_A's and fail the LOC_B assertions.
const CART_A = cart(LOC_A, VENDOR_COSTCO, '2026-06-01T00:00:00.000Z')
const CART_B = cart(LOC_B, VENDOR_COSTCO, '2026-01-01T00:00:00.000Z')
const NO_VENDOR_A = cart(LOC_A, null, '2026-05-01T00:00:00.000Z')

// The server's state. Every mock below reads it and the write mocks append to
// it, so the assertions are on what the server ended up holding rather than on
// the arguments a spy recorded.
let carts: ServerCart[] = []

// One mock PER LOCATION, both wired to the same state. Registering only the
// expected location would make the test pass for the wrong reason: an
// unmatched mock is a link error, indistinguishable from a hundred other
// failures. With both registered, a read that went to the wrong location
// resolves happily — and is caught by the id assertions instead.
const vendorCartMock = (locationId: string) => ({
  request: {
    query: VendorCartDocument,
    // A function `variables` is Apollo 4's variable matcher.
    variables: (vars: Record<string, unknown>) =>
      vars.locationId === locationId,
  },
  maxUsageCount: Number.POSITIVE_INFINITY,
  result: (vars: Record<string, unknown>) => {
    const id = cartIdFor(locationId, (vars.vendorId as string | null) ?? null)
    const found = carts.find((c) => c.id === id)
    if (found) return { data: { vendorCart: found } }
    // The resolver CREATES a missing cart, so the fake must too.
    const created = { __typename: 'Cart' as const, id, lastPurchasedAt: null }
    carts = [...carts, created]
    return { data: { vendorCart: created } }
  },
})

// Whole-account on purpose, exactly like the real `allCarts`: every location's
// carts in one list. The hooks are what narrow it to the active location, so a
// filter that stopped working would show up here.
const allCartsMock = {
  request: { query: AllCartsDocument },
  maxUsageCount: Number.POSITIVE_INFINITY,
  result: () => ({ data: { allCarts: carts } }),
}

// Models the server: create the no-vendor cart and one per vendor at the named
// location, skipping the ones already there, then return that location's carts.
const recordedBootstraps: string[] = []
const bootstrapMock = (locationId: string) => ({
  request: {
    query: BootstrapCartsDocument,
    variables: (vars: Record<string, unknown>) =>
      vars.locationId === locationId,
  },
  maxUsageCount: Number.POSITIVE_INFINITY,
  result: () => {
    recordedBootstraps.push(locationId)
    for (const vendorId of [null, VENDOR_COSTCO]) {
      const id = cartIdFor(locationId, vendorId)
      if (!carts.some((c) => c.id === id)) {
        carts = [...carts, { __typename: 'Cart', id, lastPurchasedAt: null }]
      }
    }
    return {
      data: {
        allCarts: undefined,
        bootstrapCarts: carts.filter((c) => c.id.startsWith(`${locationId}:`)),
      },
    }
  },
})

// `createVendor` pre-creates ONE cart, at the location it is given.
const createVendorMock = (locationId: string) => ({
  request: {
    query: CreateVendorDocument,
    variables: (vars: Record<string, unknown>) =>
      vars.locationId === locationId,
  },
  maxUsageCount: Number.POSITIVE_INFINITY,
  result: (vars: Record<string, unknown>) => {
    const id = 'vendor-new'
    carts = [
      ...carts,
      {
        __typename: 'Cart',
        id: cartIdFor(locationId, id),
        lastPurchasedAt: null,
      },
    ]
    return {
      data: {
        createVendor: {
          __typename: 'Vendor',
          id,
          name: vars.name as string,
          userId: 'user-1',
        },
      },
    }
  },
})

const MOCKS = [
  getLocationsMock,
  vendorCartMock(LOC_A),
  vendorCartMock(LOC_B),
  allCartsMock,
  bootstrapMock(LOC_A),
  bootstrapMock(LOC_B),
  createVendorMock(LOC_A),
  createVendorMock(LOC_B),
  // The `'local'` sentinel is registered TOO, and that is the point. Register
  // only the real locations and a write sent with the sentinel fails as "No
  // more mocked responses" — a link error indistinguishable from a hundred
  // other failures. With these present the bad write resolves happily and is
  // caught by the assertion that says nothing landed under `'local'`. The real
  // server refuses it with FORBIDDEN instead.
  bootstrapMock(DEFAULT_LOCATION_ID),
  createVendorMock(DEFAULT_LOCATION_ID),
  vendorCartMock(DEFAULT_LOCATION_ID),
]

function makeWrapper(mocks: MockedProviderProps['mocks'] = MOCKS) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: ReactNode }) => (
    // The app's OWN cache configuration, not `MockedProvider`'s default
    // `InMemoryCache`. A `keyArgs` policy applied only in production would make
    // these tests prove nothing about the real client.
    <MockedProvider
      mocks={mocks}
      cache={createCache()}
      mockLinkDefaultOptions={{ delay: 0 }}
    >
      <QueryClientProvider client={queryClient}>
        <ActiveLocationProvider>{children}</ActiveLocationProvider>
      </QueryClientProvider>
    </MockedProvider>
  )
}

beforeEach(() => {
  vi.mocked(dataModeHooks.useDataMode).mockReturnValue({
    mode: 'cloud',
    setMode: vi.fn(),
  })
  localStorage.clear()
  carts = [CART_A, CART_B, NO_VENDOR_A]
  recordedBootstraps.length = 0
})

describe('cloud cart reads are scoped to the active location', () => {
  it("user viewing a NON-DEFAULT location gets that location's cart", async () => {
    // Given Cloud Garage — which is not the default — is active
    localStorage.setItem(activeLocationStorageKey('cloud'), LOC_B)

    // When the vendor's cart is read
    const { result } = renderHook(() => useVendorCart(VENDOR_COSTCO), {
      wrapper: makeWrapper(),
    })

    // Then it is the Garage's cart, under the composite id. A hook that sent
    // the bare vendor id gets no `locationId` variable at all and matches no
    // mock; one that sent the default location gets `${LOC_A}:...` here.
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data?.id).toBe(cartIdFor(LOC_B, VENDOR_COSTCO))
    expect(result.current.data?.lastPurchasedAt?.toISOString()).toBe(
      '2026-01-01T00:00:00.000Z',
    )
  })

  it('user viewing the DEFAULT location gets that location cart instead', async () => {
    // Given Cloud Kitchen — the default — is active
    localStorage.setItem(activeLocationStorageKey('cloud'), LOC_A)

    // When the same vendor's cart is read
    const { result } = renderHook(() => useVendorCart(VENDOR_COSTCO), {
      wrapper: makeWrapper(),
    })

    // Then it is the Kitchen's row, with the Kitchen's own date
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data?.id).toBe(cartIdFor(LOC_A, VENDOR_COSTCO))
    expect(result.current.data?.lastPurchasedAt?.toISOString()).toBe(
      '2026-06-01T00:00:00.000Z',
    )
  })

  it('user in a NON-DEFAULT location sees only that location carts in the list', async () => {
    // Given the Garage is active, and `allCarts` returns EVERY location's carts
    localStorage.setItem(activeLocationStorageKey('cloud'), LOC_B)

    // When the active-location cart list is read
    const { result } = renderHook(() => useAllActiveCarts(), {
      wrapper: makeWrapper(),
    })

    // Then only the Garage's rows come back: its Costco cart from the fixture
    // plus the no-vendor cart the active-location effect bootstraps. The
    // Kitchen's two rows are filtered out — without the filter there would be
    // four.
    await waitFor(() => expect(result.current.data).toHaveLength(2))
    expect(result.current.data.map((c) => c.id).sort()).toEqual(
      [cartIdFor(LOC_B, VENDOR_COSTCO), cartIdFor(LOC_B, null)].sort(),
    )
    expect(result.current.data.map((c) => c.id)).not.toContain(
      cartIdFor(LOC_A, VENDOR_COSTCO),
    )
  })

  it('user in a NON-DEFAULT location gets that location last-purchased dates', async () => {
    // Given the Garage is active. Costco was last bought 2026-06-01 in the
    // Kitchen and 2026-01-01 in the Garage.
    localStorage.setItem(activeLocationStorageKey('cloud'), LOC_B)

    // When the sort map is read
    const { result } = renderHook(() => useLastPurchasedByVendor(), {
      wrapper: makeWrapper(),
    })

    // Then the key is the PARSED vendor id — not the whole cart id — and the
    // date is the Garage's, not the Kitchen's
    await waitFor(() => expect(result.current.data?.size).toBe(2))
    const map = result.current.data as Map<string | null, Date | null>
    expect(map.get(VENDOR_COSTCO)?.toISOString()).toBe(
      '2026-01-01T00:00:00.000Z',
    )
    // And the `null` key is the Garage's own no-vendor cart, bootstrapped and
    // never purchased — NOT the Kitchen's, which carries 2026-05-01. Keying on
    // the whole cart id, or skipping the location filter, puts that date here.
    expect(map.get(null)).toBeNull()
  })
})

describe('the active-location effect bootstraps that location carts', () => {
  it('user switching to a location with no carts gets them created there', async () => {
    // Given the Kitchen is active and the Garage has NO carts at all
    localStorage.setItem(activeLocationStorageKey('cloud'), LOC_A)
    carts = [CART_A, NO_VENDOR_A]

    const { result } = renderHook(
      () => ({ carts: useAllActiveCarts(), active: useActiveLocation() }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.carts.data).toHaveLength(2))

    // When the user switches to the Garage
    await act(async () => {
      result.current.active.setActiveLocationId(LOC_B)
    })

    // Then the Garage's carts exist and are listed — the no-vendor cart and
    // Costco's. Without the `bootstrapCarts` call this list stays empty.
    await waitFor(() => expect(result.current.carts.data).toHaveLength(2))
    expect(result.current.carts.data.map((c) => c.id).sort()).toEqual(
      [cartIdFor(LOC_B, null), cartIdFor(LOC_B, VENDOR_COSTCO)].sort(),
    )
    expect(recordedBootstraps).toContain(LOC_B)
  })

  it('the bootstrap runs ONCE per location, not on every render', async () => {
    // Given the Kitchen is active
    localStorage.setItem(activeLocationStorageKey('cloud'), LOC_A)

    const { result } = renderHook(
      () => ({ carts: useAllActiveCarts(), active: useActiveLocation() }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(recordedBootstraps).toContain(LOC_A))

    // When the tree settles and several more render passes go by
    await waitFor(() =>
      expect(result.current.carts.data.length).toBeGreaterThan(0),
    )
    await new Promise((resolve) => setTimeout(resolve, 50))

    // Then the mutation ran exactly once.
    //
    // This is the real regression. `useLocations()` maps its cloud result, so
    // `locations` is a NEW ARRAY every render; with it in the effect's
    // dependency list the sequence is mutation -> `AllCarts` refetch -> render
    // -> new identity -> mutation, forever. It is invisible in an assertion
    // that only checks the mutation happened, and cloud E2E caught it as
    // `/shopping` never reaching `networkidle`.
    expect(recordedBootstraps.filter((id) => id === LOC_A)).toHaveLength(1)

    // And switching location bootstraps the NEW one, exactly once
    await act(async () => {
      result.current.active.setActiveLocationId(LOC_B)
    })
    await waitFor(() => expect(recordedBootstraps).toContain(LOC_B))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(recordedBootstraps.filter((id) => id === LOC_B)).toHaveLength(1)
  })

  it('the bootstrap names the location, never the local sentinel', async () => {
    // Given a FRESH cloud session — no `active-location-id:cloud` slot, so the
    // active id is the `'local'` sentinel until `GetLocations` resolves
    renderHook(() => useAllActiveCarts(), { wrapper: makeWrapper() })

    // Then the bootstrap runs for the DEFAULT location's real cuid and never
    // for the sentinel. The sentinel's mock is registered, so a bad call would
    // resolve rather than error — this assertion is what catches it.
    await waitFor(() => expect(recordedBootstraps).toContain(LOC_A))
    expect(recordedBootstraps).not.toContain(DEFAULT_LOCATION_ID)
  })
})

describe('cloud cart writes resolve the location at call time', () => {
  it('a vendor created on a FRESH session gets its cart at the real default location', async () => {
    // Given a fresh cloud session: NO `active-location-id:cloud` slot, so
    // `readStoredLocationId('cloud')` hands back the `'local'` sentinel, which
    // names no cloud `Location`. Every other test in this file seeds the slot
    // with a real cuid and therefore pre-resolves the very thing that breaks.
    expect(localStorage.getItem(activeLocationStorageKey('cloud'))).toBeNull()

    const { result } = renderHook(() => useCreateVendor(), {
      wrapper: makeWrapper(),
    })

    // When a vendor is created immediately, before anything corrects the id
    await act(async () => {
      await result.current.mutateAsync('Costco')
    })

    // Then its cart landed at the account's real default location, not under
    // the `'local'` sentinel. Resolving the location at RENDER time sends the
    // sentinel here and the real server answers FORBIDDEN, losing the write.
    await waitFor(() =>
      expect(carts.map((c) => c.id)).toContain(cartIdFor(LOC_A, 'vendor-new')),
    )
    expect(carts.map((c) => c.id)).not.toContain(
      cartIdFor(DEFAULT_LOCATION_ID, 'vendor-new'),
    )
  })
})
