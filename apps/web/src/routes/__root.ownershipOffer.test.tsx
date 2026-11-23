import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// The root route mounts the ownership offer banner in cloud mode, and not in
// local mode (households H6b, task K.6). What the banner shows is tested in
// `components/household/OwnershipOfferBanner/OwnershipOfferBanner.test.tsx`;
// here it is a marker, so this file proves only where it is mounted.

vi.mock('@/components/household/OwnershipOfferBanner', () => ({
  OwnershipOfferBanner: () => <p>offer banner here</p>,
}))

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useRouterState: () => '/',
    Outlet: () => <p>page</p>,
  }
})

// `Layout` renders router `Link`s, which need a RouterProvider. The other
// root children are beside the point here.
vi.mock('@/components/global/Layout', () => ({
  Layout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/components/global/OfflineBanner', () => ({
  OfflineBanner: () => null,
}))
vi.mock('@/components/global/PostLoginMigrationDialog', () => ({
  PostLoginMigrationDialog: () => null,
}))
vi.mock('@/apollo/HouseholdChangeGuard', () => ({
  HouseholdChangeGuard: () => null,
}))
vi.mock('@/components/household/NoHouseholdGate', () => ({
  NoHouseholdGate: ({ children }: { children: ReactNode }) => children,
}))
vi.mock('@/components/ui/sonner', () => ({ Toaster: () => null }))
vi.mock('@/hooks/useNavigationTracker', () => ({
  useNavigationTracker: () => undefined,
}))
vi.mock('@/hooks/useLanguage', () => ({ useLanguage: () => undefined }))
vi.mock('@/hooks/useServiceWorkerUpdate', () => ({
  useServiceWorkerUpdate: () => undefined,
}))

async function renderRoot() {
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

afterEach(() => {
  localStorage.clear()
})

describe('root route: the ownership offer banner', () => {
  it('is mounted in cloud mode', async () => {
    // Given cloud mode (and no onboarding redirect)
    localStorage.setItem('data-mode', 'cloud')
    localStorage.setItem('e2e-skip-onboarding', 'true')

    // When the root route renders
    await renderRoot()

    // Then the banner is mounted
    expect(await screen.findByText('offer banner here')).toBeInTheDocument()
  })

  it('is not mounted in local mode', async () => {
    // Given local mode
    localStorage.setItem('data-mode', 'local')
    localStorage.setItem('e2e-skip-onboarding', 'true')

    // When the root route renders
    await renderRoot()

    // Then the page is there (the root has rendered) but the banner is not
    await waitFor(() => expect(screen.getByText('page')).toBeInTheDocument())
    expect(screen.queryByText('offer banner here')).not.toBeInTheDocument()
  })
})
