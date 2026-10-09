import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { importCloudData } from '@/lib/importData'

// WHY THIS FILE EXISTS
//
// `PostLoginMigrationDialog` is the only mount site of
// `usePostLoginMigration`, and it used to sit behind `!isE2ETestMode` in
// `__root.tsx`. With that gate in place the whole sign-in-then-copy path —
// including the destructive `clear` strategy — was unreachable from any E2E
// run: `DataModeCard` wrote `migration-strategy` and nothing read it. Issue
// #334 needed that path driven, so the gate was removed from the dialog and
// kept on `CloudAuthGuard`.
//
// These two tests pin both halves of that. Put `!isE2ETestMode` back on the
// dialog and the first one goes red.

const navigateMock = vi.fn()

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useRouterState: () => '/',
    Outlet: () => null,
  }
})

// The E2E cloud tree in `main.tsx` renders NO `ClerkProvider`, so every Clerk
// hook throws there. Reproducing that is the point: it is what proves
// `CloudAuthGuard` did not mount and that the dialog took its E2E branch.
vi.mock('@clerk/react', () => {
  const refuse = (name: string) => () => {
    throw new Error(`${name} called with no ClerkProvider in the tree`)
  }
  return {
    useAuth: refuse('useAuth'),
    useUser: refuse('useUser'),
    useClerk: refuse('useClerk'),
    ClerkProvider: ({ children }: { children: ReactNode }) => children,
  }
})

// `Layout` renders router `Link`s, which need a RouterProvider this test has
// no use for. The banner and the toaster are equally beside the point.
vi.mock('@/components/global/Layout', () => ({
  Layout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/components/global/OfflineBanner', () => ({
  OfflineBanner: () => null,
}))
vi.mock('@/components/ui/sonner', () => ({ Toaster: () => null }))

vi.mock('@/hooks/useNavigationTracker', () => ({
  useNavigationTracker: () => undefined,
}))
vi.mock('@/hooks/useLanguage', () => ({ useLanguage: () => undefined }))
vi.mock('@/hooks/useServiceWorkerUpdate', () => ({
  useServiceWorkerUpdate: () => undefined,
}))

// The auto-import waits for the location list to resolve once. In cloud mode
// that list comes from `useGetLocationsQuery`, which `src/test/setup.ts` stubs
// as永 unresolved. Overriding `useLocations` is narrower than replacing the
// whole generated-graphql factory, which would silently drop every other stub
// that file sets.
vi.mock('@/hooks/useLocations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useLocations')>()
  return { ...actual, useLocations: () => ({ data: [] }) }
})

vi.mock('@/lib/exportData', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/exportData')>()
  return {
    ...actual,
    fetchLocalPayload: vi.fn().mockResolvedValue({
      version: 1,
      exportedAt: '2026-10-08T00:00:00.000Z',
    }),
  }
})

vi.mock('@/lib/importData', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/importData')>()
  return { ...actual, importCloudData: vi.fn().mockResolvedValue(undefined) }
})

// `__root.tsx` reads `VITE_E2E_TEST_USER_ID` once, at module evaluation, so the
// flag must be stubbed before the first import of it — hence the dynamic
// import. No `vi.resetModules()`: it would re-run the factories above and give
// the re-imported module fresh spies, leaving the ones asserted on here at zero
// calls and the test passing for the wrong reason.
async function renderRootInE2ECloudMode() {
  const { Route } = await import('./__root')
  const RootComponent = Route.options.component as () => ReactNode
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <RootComponent />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.stubEnv('VITE_E2E_TEST_USER_ID', 'e2e-user-id')
  localStorage.clear()
  localStorage.setItem('data-mode', 'cloud')
  // What an E2E run sets so an empty account is not bounced to /onboarding.
  localStorage.setItem('e2e-skip-onboarding', 'true')
})

afterEach(() => {
  vi.unstubAllEnvs()
  localStorage.clear()
  navigateMock.mockClear()
  vi.mocked(importCloudData).mockClear()
})

describe('root route in E2E test mode', () => {
  it('user who chose a strategy before signing in has the copy run in E2E mode', async () => {
    // Given cloud mode, E2E test mode, and a strategy stored by DataModeCard
    localStorage.setItem('migration-strategy', 'clear')

    // When the root route renders
    await renderRootInE2ECloudMode()

    // Then PostLoginMigrationDialog is mounted and runs the copy
    await waitFor(() => expect(importCloudData).toHaveBeenCalledTimes(1))
    expect(vi.mocked(importCloudData).mock.calls[0][1]).toBe('clear')
  })

  it('CloudAuthGuard stays unmounted in E2E test mode', async () => {
    // Given cloud mode and E2E test mode, with no strategy stored
    // When the root route renders
    await renderRootInE2ECloudMode()

    // Then nothing was sent to /sign-in. CloudAuthGuard calls useAuth(), which
    // throws under the mock above, so mounting it would fail the render
    // outright — this assertion is the second line of defence, not the first.
    await waitFor(() => expect(navigateMock).not.toHaveBeenCalled())
  })
})
