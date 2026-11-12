import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { routeTree } from '@/routeTree.gen'
import { mockScreen } from '@/test/viewport'

// The household name in CLOUD mode (households H3a, task 3.13), through the
// real route tree: the page title, the name card, the desktop household
// sidebar heading and the mobile `/settings` accordion trigger.
//
// Every generated Apollo hook is replaced with an inert stub (this factory
// REPLACES the one in `src/test/setup.ts`), and `useGetHouseholdQuery` answers
// from `state`. It honours `skip` the way Apollo does.
//
// The name is in lower case on purpose: it must be shown as stored, never
// capitalized (root `CLAUDE.md`, *Name Display Convention*).
const { state } = vi.hoisted(() => ({
  state: {
    household: undefined as
      | { id: string; name: string; role: 'owner' | 'manager' | 'member' }
      | undefined,
  },
}))

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
  stubbed.useGetHouseholdQuery = (options?: { skip?: boolean }) => {
    const household = options?.skip ? undefined : state.household
    return {
      data: household
        ? { household: { __typename: 'Household', ...household } }
        : undefined,
      loading: !options?.skip && !household,
      error: undefined,
    }
  }
  return stubbed
})

const NAME = 'the lin home'

describe('Household name — cloud mode', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    localStorage.setItem('data-mode', 'cloud')
    // `__root.tsx` mounts the post-login copy dialog in cloud mode; this keeps
    // it closed.
    localStorage.setItem('migration-prompted', '1')
    state.household = { id: 'household-1', name: NAME, role: 'owner' }
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  afterEach(() => {
    localStorage.removeItem('data-mode')
    localStorage.removeItem('migration-prompted')
    vi.restoreAllMocks()
  })

  function renderAt(path: string) {
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: [path] }),
      context: { queryClient },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
    return router
  }

  it('user sees the household name as the household page title, as stored', async () => {
    // Given a cloud household named in lower case
    renderAt('/settings/household')

    // Then the page title is the name, not "My data"
    const title = await screen.findByRole('heading', { level: 1, name: NAME })
    expect(
      screen.queryByRole('heading', { level: 1, name: 'My data' }),
    ).not.toBeInTheDocument()

    // And nothing above it capitalizes the name
    expect(title.closest('.capitalize')).toBeNull()
  })

  it('user sees "My data" as the title while the household name loads', async () => {
    // Given the household query has not answered yet
    state.household = undefined

    renderAt('/settings/household')

    // Then the title is never empty
    expect(
      await screen.findByRole('heading', { level: 1, name: 'My data' }),
    ).toBeInTheDocument()
  })

  it('household owner sees the name field on the household page', async () => {
    renderAt('/settings/household')

    const field = await screen.findByRole('textbox', {
      name: 'Household name',
    })
    expect(field).toHaveValue(NAME)
    // The export and import cards are still there
    expect(screen.getByText('Download my data')).toBeInTheDocument()
  })

  it('household manager sees the name as text on the household page', async () => {
    state.household = { id: 'household-1', name: NAME, role: 'manager' }

    renderAt('/settings/household')

    const main = await screen.findByRole('main')
    expect(await within(main).findByText('Household name')).toBeInTheDocument()
    expect(within(main).queryByRole('textbox')).not.toBeInTheDocument()
    expect(
      within(main).getByText('Only the household owner can change the name.'),
    ).toBeInTheDocument()
  })

  it('user sees the household name as the household sidebar heading on desktop', async () => {
    mockScreen({ desktop: true })

    renderAt('/settings/household')

    const nav = await screen.findByRole('navigation', {
      name: 'Sidebar navigation',
    })
    const heading = await within(nav).findByRole('heading', { name: NAME })
    expect(heading.closest('.capitalize')).toBeNull()
  })

  it('user sees the household name on the mobile settings accordion', async () => {
    mockScreen({ desktop: false })

    renderAt('/settings')

    const trigger = await screen.findByRole('button', { name: NAME })
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(
      screen.queryByRole('button', { name: /My data/ }),
    ).not.toBeInTheDocument()
  })
})
