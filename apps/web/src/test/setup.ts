import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { vi } from 'vitest'
import '../i18n'

// Mock generated Apollo hooks so tests don't require an ApolloProvider.
// All tests run in local mode (Dexie); cloud hooks are never exercised.
vi.mock('@/generated/graphql', () => ({
  useGetItemsQuery: () => ({
    data: undefined,
    loading: false,
    error: undefined,
  }),
  useCreateItemMutation: () => [
    vi.fn().mockResolvedValue({ data: undefined }),
    {},
  ],
}))

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
