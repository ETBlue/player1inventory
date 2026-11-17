import {
  MockedProvider,
  type MockedProviderProps,
} from '@apollo/client/testing/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LAST_HOUSEHOLD_ID_KEY } from '@/apollo/householdGuard'
import {
  CreateHouseholdDocument,
  GetHouseholdDocument,
  InvitePreviewDocument,
} from '@/generated/graphql'
import { activeLocationStorageKey } from '@/hooks/useActiveLocation'
import { routeTree } from '@/routeTree.gen'

// Households H5b, task G.8: the no-household screen through the REAL root
// route. `GetHousehold` answers `NO_HOUSEHOLD`, as the server does for a
// person who left their household or was removed from it.

// The real generated hooks and Apollo React hooks, so `MockedProvider`
// answers. `setup.ts` stubs both for every other test.
vi.mock('@/generated/graphql', async (importOriginal) => await importOriginal())
vi.mock(
  '@apollo/client/react',
  async (importOriginal) => await importOriginal(),
)

// Only the parts that touch IndexedDB or load another page are stubbed.
// `forgetHousehold` is real, so the tests read the keys it removes.
const clearCacheMock = vi.hoisted(() => vi.fn(async () => {}))
vi.mock('@/apollo/persistence', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/apollo/persistence')>()
  return { ...actual, clearCache: clearCacheMock }
})
const switchToHouseholdMock = vi.hoisted(() => vi.fn(async () => {}))
vi.mock('@/apollo/householdGuard', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/apollo/householdGuard')>()
  return { ...actual, switchToHousehold: switchToHouseholdMock }
})

const TOKEN = 'tok-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_abcd'
const TITLE = 'You are not in any household.'
const ACTIVE_KEY = activeLocationStorageKey('cloud')

const NO_HOUSEHOLD = {
  request: { query: GetHouseholdDocument },
  maxUsageCount: Number.POSITIVE_INFINITY,
  result: {
    errors: [{ message: 'No household', extensions: { code: 'NO_HOUSEHOLD' } }],
  },
}

function renderAt(
  path: string,
  mocks: NonNullable<MockedProviderProps['mocks']> = [],
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
    context: { queryClient },
  })
  render(
    <MockedProvider mocks={[NO_HOUSEHOLD, ...mocks]}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </MockedProvider>,
  )
  return router
}

beforeEach(() => {
  localStorage.setItem('data-mode', 'cloud')
  localStorage.setItem('e2e-skip-onboarding', 'true')
  localStorage.setItem(LAST_HOUSEHOLD_ID_KEY, 'household-old')
  localStorage.setItem(ACTIVE_KEY, 'location-of-old-household')
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  clearCacheMock.mockClear()
  switchToHouseholdMock.mockReset()
  switchToHouseholdMock.mockImplementation(async () => {})
})

describe('no-household screen, cloud mode', () => {
  it('user who was removed sees the no-household screen on the pantry, and the old household is forgotten', async () => {
    renderAt('/')

    expect(
      await screen.findByRole('heading', { level: 1, name: TITLE }),
    ).toBeInTheDocument()
    await waitFor(() => expect(clearCacheMock).toHaveBeenCalledTimes(1))
    expect(localStorage.getItem(LAST_HOUSEHOLD_ID_KEY)).toBeNull()
    expect(localStorage.getItem(ACTIVE_KEY)).toBeNull()
  })

  it('user with no household can still open an invite link', async () => {
    renderAt(`/join/${TOKEN}`, [
      {
        request: { query: InvitePreviewDocument, variables: { token: TOKEN } },
        maxUsageCount: Number.POSITIVE_INFINITY,
        result: {
          data: {
            invitePreview: {
              __typename: 'InvitePreview',
              status: 'VALID',
              householdName: 'the Lin home',
              invitedByName: 'Mei Lin',
              householdRole: 'member',
              locationRoles: [],
            },
          },
        },
      },
    ])

    expect(
      await screen.findByRole('button', { name: 'Join' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: TITLE })).toBeNull()
    expect(clearCacheMock).not.toHaveBeenCalled()
    expect(localStorage.getItem(LAST_HOUSEHOLD_ID_KEY)).toBe('household-old')
  })

  it('user can create a household from the screen and lands on the pantry', async () => {
    renderAt('/shopping', [
      {
        request: { query: CreateHouseholdDocument, variables: { name: null } },
        result: {
          data: {
            createHousehold: {
              __typename: 'Household',
              id: 'household-created',
              name: 'My household',
              role: 'owner',
            },
          },
        },
      },
    ])
    const user = userEvent.setup()
    await screen.findByRole('heading', { level: 1, name: TITLE })

    await user.click(screen.getByRole('button', { name: 'Create a household' }))
    await user.click(screen.getByRole('button', { name: 'Create a household' }))

    await waitFor(() =>
      expect(switchToHouseholdMock).toHaveBeenCalledWith('household-created', {
        to: '/',
      }),
    )
  })
})
