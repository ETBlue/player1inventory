import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { beforeEach, vi } from 'vitest'
import '../i18n'

// The service worker registration module is a virtual module supplied by
// vite-plugin-pwa at build time. It does not exist under Vitest, so every
// test that (directly or indirectly, e.g. via __root.tsx) loads
// useServiceWorkerUpdate needs this stub or the import fails to resolve.
vi.mock('virtual:pwa-register', () => ({
  registerSW: () => () => Promise.resolve(),
}))

// Prevent the empty-DB redirect to /onboarding from firing in unit and story
// tests. E2E tests set this flag via addInitScript; here we set it globally so
// route-level stories and integration tests that start with an empty DB keep
// rendering their intended route instead of being redirected.
//
// `localStorage` below is jsdom's, repointed by ./nodeWebStorage.ts, which
// vitest.config.ts runs before this file. Read that file if this line ever
// throws "setItem is not a function".
beforeEach(() => {
  localStorage.setItem('e2e-skip-onboarding', 'true')
})

// Mock useApolloClient so tests don't require an ApolloProvider.
// All tests run in local mode; useApolloClient is only used in the cloud
// path of useCheckout and importCloudData, so a no-op stub is sufficient.
vi.mock('@apollo/client/react', async (importOriginal) => {
  const original = await importOriginal<typeof import('@apollo/client/react')>()
  return {
    ...original,
    useApolloClient: vi.fn(() => ({
      cache: {
        evict: vi.fn(),
        gc: vi.fn(),
      },
      query: vi.fn().mockResolvedValue({ data: {} }),
      mutate: vi.fn().mockResolvedValue({ data: {} }),
      // `refetchAfterWrite` (`apollo/refetchAfterWrite.ts`) calls it after a
      // cloud write in tests that stub the mutation hooks. Apollo's answer is
      // a promise that ALSO carries `queries` and `results` (one promise per
      // read), and the helper waits for each of `results` (since the review
      // of households H5c task H.4), so the stub carries both, empty.
      refetchQueries: vi.fn(() =>
        Object.assign(Promise.resolve([]), { queries: [], results: [] }),
      ),
      resetStore: vi.fn().mockResolvedValue(null),
    })),
  }
})

// Mock @clerk/react so tests don't require ClerkProvider.
// Per-file vi.mock('@clerk/react', ...) overrides this for tests that need
// specific user IDs (DataModeCard.test.tsx).
vi.mock('@clerk/react', () => ({
  useUser: vi.fn(() => ({
    user: {
      id: 'test-user-id',
      primaryEmailAddress: { emailAddress: 'test@example.com' },
    },
    isSignedIn: true,
    isLoaded: true,
  })),
  useAuth: vi.fn(() => ({
    isSignedIn: true,
    isLoaded: true,
    userId: 'test-user-id',
  })),
  useClerk: vi.fn(() => ({ signOut: vi.fn() })),
  ClerkProvider: ({ children }: { children: unknown }) => children,
}))

// Mock generated Apollo hook functions so tests don't require an ApolloProvider.
// Uses importOriginal so non-hook exports (DocumentNode constants) pass through
// — stories need them for MockedProvider.
// All tests run in local mode (Dexie); cloud hooks are never exercised.
vi.mock('@/generated/graphql', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/generated/graphql')>()
  return {
    ...original,
    // The ownership offer banner (households H6b, task K.6) is mounted in
    // `__root.tsx` in cloud mode, so every cloud test that renders the root
    // route reaches `useMyOwnershipOffersQuery` (the real one needs an
    // ApolloProvider). It returns no offers, so the banner renders no row, and
    // the three mutation stubs below are reached by NO test today: an offer
    // row calls them. Measured in the K.6 review by making each one throw.
    // They are here for a future test that returns an offer. A test file with
    // its OWN `@/generated/graphql` factory replaces this one and must stub
    // them too.
    useMyOwnershipOffersQuery: () => ({
      data: undefined,
      loading: false,
      error: undefined,
      refetch: () => Promise.resolve(),
    }),
    useAcceptOwnershipOfferMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
    useDeclineOwnershipOfferMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
    useDismissOwnershipOfferMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
    useGetItemQuery: () => ({
      data: undefined,
      loading: false,
      error: undefined,
    }),
    useGetItemsQuery: () => ({
      data: undefined,
      loading: false,
      error: undefined,
    }),
    usePantryDataQuery: () => ({
      data: undefined,
      loading: false,
      error: undefined,
      networkStatus: 7,
      refetch: vi.fn(),
    }),
    useItemStocksForItemQuery: () => ({
      data: undefined,
      loading: false,
      error: undefined,
    }),
    useAddItemToLocationMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
    // Called UNCONDITIONALLY by `useCreateItem` and `useUpdateItem` — a hook
    // cannot sit behind the `mode === 'cloud'` branch — so a local-mode test
    // rendering either one reaches the real Apollo hook without an
    // ApolloProvider and dies with "Could not find client in the context".
    // That is what a missing entry here looks like: 270 failures across 19
    // files, none of them cloud tests.
    useUpsertItemStockMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
    useRemoveItemFromLocationMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
    // Called UNCONDITIONALLY by `useApplyUnitSwitch` since PR 3c made it
    // dual-mode — a hook cannot sit behind the `mode === 'cloud'` branch.
    useApplyUnitSwitchMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
    useCreateItemMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
    useUpdateItemMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
    useDeleteItemMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
    useGetTagTypesQuery: () => ({
      data: undefined,
      loading: false,
      error: undefined,
    }),
    useGetTagsQuery: () => ({
      data: undefined,
      loading: false,
      error: undefined,
    }),
    useGetTagsByTypeQuery: () => ({
      data: undefined,
      loading: false,
      error: undefined,
    }),
    useCreateTagTypeMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
    useUpdateTagTypeMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
    useDeleteTagTypeMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
    useCreateTagMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
    useUpdateTagMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
    useDeleteTagMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
    useItemCountByTagQuery: () => ({
      data: undefined,
      loading: false,
      error: undefined,
    }),
    useTagCountByTypeQuery: () => ({
      data: undefined,
      loading: false,
      error: undefined,
    }),
    useGetVendorsQuery: () => ({
      data: undefined,
      loading: false,
      error: undefined,
    }),
    useCreateVendorMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
    useUpdateVendorMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
    useDeleteVendorMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
    useItemCountByVendorQuery: () => ({
      data: undefined,
      loading: false,
      error: undefined,
    }),
    useGetRecipesQuery: () => ({
      data: undefined,
      loading: false,
      error: undefined,
    }),
    useGetRecipeQuery: () => ({
      data: undefined,
      loading: false,
      error: undefined,
    }),
    useCreateRecipeMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
    useUpdateRecipeMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
    useDeleteRecipeMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
    useUpdateRecipeLastCookedAtMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
    useConsumeRecipesMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
    useItemCountByRecipeQuery: () => ({
      data: undefined,
      loading: false,
      error: undefined,
    }),
    useCartItemsQuery: () => ({
      data: undefined,
      loading: false,
      error: undefined,
    }),
    useAddToCartMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
    useUpdateCartItemMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
    useRemoveFromCartMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
    useCheckoutMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
    useAbandonCartMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
    // Called by `ActiveLocationProvider` on every render, in both data modes
    // (Rules of Hooks). Without this stub the provider throws and every test
    // that mounts it fails.
    useBootstrapCartsMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
    useVendorCartQuery: () => ({
      data: undefined,
      loading: false,
      error: undefined,
    }),
    useAllCartsQuery: () => ({
      data: undefined,
      loading: false,
      error: undefined,
    }),
    useAllCartItemsQuery: () => ({
      data: undefined,
      loading: false,
      error: undefined,
    }),
    useItemLogsQuery: () => ({
      data: undefined,
      loading: false,
      error: undefined,
    }),
    useInventoryLogCountByItemQuery: () => ({
      data: undefined,
      loading: false,
      error: undefined,
    }),
    useCartItemCountByItemQuery: () => ({
      data: undefined,
      loading: false,
      error: undefined,
    }),
    useLastPurchaseDatesQuery: () => ({
      data: undefined,
      loading: false,
      error: undefined,
    }),
    useAddInventoryLogMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
    useGetShelvesQuery: () => ({
      data: undefined,
      loading: false,
      error: undefined,
    }),
    useGetShelfQuery: () => ({
      data: undefined,
      loading: false,
      error: undefined,
    }),
    useCreateShelfMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
    useUpdateShelfMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
    useDeleteShelfMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
    useReorderShelvesMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
    useReorderShelfItemsMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
    useApplyShelfFilterPicksMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
    useGetLocationsQuery: () => ({
      data: undefined,
      loading: false,
      error: undefined,
    }),
    useGetHouseholdLocationsQuery: () => ({
      data: undefined,
      loading: false,
      error: undefined,
    }),
    useCreateLocationMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
    useUpdateLocationMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
    useDeleteLocationMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
    useReorderLocationsMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
    // Households H7b task M.4. `useLocationSort` (the switcher and Settings ›
    // Locations) calls the first two on every render, and
    // `ActiveLocationProvider` calls the third on every render, in both data
    // modes (Rules of Hooks).
    useMyLocationSortQuery: () => ({
      data: undefined,
      loading: false,
      error: undefined,
    }),
    useSetLocationSortMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
    useMarkLocationVisitedMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
    useGetHouseholdQuery: () => ({
      data: undefined,
      loading: false,
      error: undefined,
    }),
    useRenameHouseholdMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
    // **Switch to…** (households H7 task L.4) is in the household sidebar and
    // the mobile /settings accordion in cloud mode, so a cloud test that
    // renders either reaches these. No households, and writes that answer
    // nothing. The switcher's own tests use real Apollo.
    useMyHouseholdsQuery: () => ({
      data: undefined,
      loading: false,
      error: undefined,
    }),
    useSetActiveHouseholdMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
    useCreateHouseholdMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
  }
})

// Mock ResizeObserver for Radix UI components
globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// Mock pointer and scroll APIs for Radix UI components in jsdom
window.HTMLElement.prototype.hasPointerCapture = vi.fn()
window.HTMLElement.prototype.setPointerCapture = vi.fn()
window.HTMLElement.prototype.releasePointerCapture = vi.fn()
window.HTMLElement.prototype.scrollIntoView = vi.fn()

// Mock matchMedia for theme detection
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})
