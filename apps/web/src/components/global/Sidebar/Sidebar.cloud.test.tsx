import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ActiveLocationProvider } from '@/hooks/useActiveLocation'
import { mockScreen } from '@/test/viewport'
import { Sidebar } from './Sidebar'

// The main sidebar's 🏠 link in CLOUD mode (households H3a, task 3.13). Local
// mode is covered by `Sidebar.test.tsx`, which still expects "My data".
//
// Every generated Apollo hook is an inert stub (this factory REPLACES the one
// in `src/test/setup.ts`). `useGetHouseholdQuery` answers with a household
// whose name is in lower case, and honours `skip` the way Apollo does.
vi.mock('@/generated/graphql', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/generated/graphql')>()
  const queryStub = () => ({
    data: undefined,
    loading: false,
    error: undefined,
  })
  const mutationStub = () => [
    vi.fn().mockResolvedValue({ data: undefined }),
    { loading: false },
  ]
  const stubbed: Record<string, unknown> = { ...original }
  for (const key of Object.keys(stubbed)) {
    if (!key.startsWith('use')) continue
    if (key.endsWith('Mutation')) stubbed[key] = mutationStub
    else if (key.endsWith('Query')) stubbed[key] = queryStub
  }
  stubbed.useGetHouseholdQuery = (options?: { skip?: boolean }) => ({
    data: options?.skip
      ? undefined
      : {
          household: {
            __typename: 'Household',
            id: 'household-1',
            name: 'the lin home',
            role: 'member',
          },
        },
    loading: false,
    error: undefined,
  })
  return stubbed
})

function renderSidebar(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => (
        <ActiveLocationProvider>
          <Sidebar />
        </ActiveLocationProvider>
      ),
    }),
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

describe('Sidebar — cloud mode', () => {
  beforeEach(() => {
    localStorage.setItem('data-mode', 'cloud')
    mockScreen({ desktop: true })
  })

  afterEach(() => {
    localStorage.removeItem('data-mode')
    vi.restoreAllMocks()
  })

  it('user sees the household name on the pinned household link, as stored', async () => {
    // Given a cloud household named "the lin home"
    renderSidebar('/')

    // Then the pinned link is labelled with the name and goes to the
    // household page
    const nav = await screen.findByRole('navigation', {
      name: 'Sidebar navigation',
    })
    const link = await within(nav).findByRole('link', { name: 'the lin home' })
    expect(link).toHaveAttribute('href', '/settings/household')
    expect(
      within(nav).queryByRole('link', { name: 'My data' }),
    ).not.toBeInTheDocument()

    // And the name is not capitalized, and truncates instead of wrapping
    const label = within(link).getByText('the lin home')
    expect(label.closest('.capitalize')).toBeNull()
    expect(label).toHaveClass('truncate')
  })
})
