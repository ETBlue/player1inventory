import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { vi } from 'vitest'
import '../i18n'

// Mock @clerk/react so tests don't require ClerkProvider.
// Per-file vi.mock('@clerk/react', ...) overrides this for tests that need
// specific user IDs (DataModeCard.test.tsx, FamilyGroupCard.test.tsx).
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
// Uses importOriginal so non-hook exports (DocumentNode constants like
// MyFamilyGroupDocument) pass through — stories need them for MockedProvider.
// All tests run in local mode (Dexie); cloud hooks are never exercised.
vi.mock('@/generated/graphql', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/generated/graphql')>()
  return {
    ...original,
    useGetItemsQuery: () => ({
      data: undefined,
      loading: false,
      error: undefined,
    }),
    useCreateItemMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
    useMyFamilyGroupQuery: () => ({
      data: undefined,
      loading: false,
      error: undefined,
      refetch: vi.fn(),
    }),
    useCreateFamilyGroupMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
    useJoinFamilyGroupMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
    useLeaveFamilyGroupMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
    useDisbandFamilyGroupMutation: () => [
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
