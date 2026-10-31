import { vi } from 'vitest'
import { DESKTOP_MEDIA_QUERY } from '@/hooks/useIsDesktop'

/**
 * Makes `useIsDesktop()` return `desktop` for the rest of the test.
 *
 * `setup.ts` mocks `matchMedia` as always `matches: false`, so without this
 * every component renders its mobile layout. Only the desktop query matches;
 * every other query (for example the theme's `prefers-color-scheme`) still
 * reports `false`, as in `setup.ts`.
 *
 * Call `vi.restoreAllMocks()` in `afterEach` to undo it.
 */
export function mockScreen({ desktop }: { desktop: boolean }) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: desktop && query === DESKTOP_MEDIA_QUERY,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }) as unknown as MediaQueryList,
  )
}
