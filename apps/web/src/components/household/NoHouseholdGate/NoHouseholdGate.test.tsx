import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { act, render, screen, waitFor } from '@testing-library/react'
import { useSyncExternalStore } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GetHouseholdDocument } from '@/generated/graphql'
import type { CloudHousehold } from '@/hooks/useHousehold'
import { NoHouseholdGate } from './NoHouseholdGate'

// The gate over a stubbed `useHousehold`, inside a small router so the path
// is real. The screen itself is tested in `NoHouseholdScreen.test.tsx` and
// through the real routes in `routes/noHousehold.cloud.test.tsx`; here it is
// a marker, so these tests are only about WHEN it shows.

type HouseholdResult = {
  data: CloudHousehold | undefined
  isLoading: boolean
  isError: boolean
  errorCode: string | undefined
}

// A tiny store, so a test can change the answer while the gate stays
// mounted, the way a refetch changes Apollo's answer.
const store = vi.hoisted(() => {
  let current: unknown
  const listeners = new Set<() => void>()
  return {
    get: () => current,
    set: (value: unknown) => {
      current = value
      for (const l of listeners) l()
    },
    subscribe: (l: () => void) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
  }
})
vi.mock('@/hooks/useHousehold', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useHousehold')>()
  return {
    ...actual,
    useHousehold: () => useSyncExternalStore(store.subscribe, store.get),
  }
})

function answer(value: HouseholdResult) {
  act(() => store.set(value))
}

// The signed-in Clerk account, changeable while the gate stays mounted.
const account = vi.hoisted(() => {
  let current: string | null = 'user-a'
  const listeners = new Set<() => void>()
  return {
    get: () => current,
    set: (value: string | null) => {
      current = value
      for (const l of listeners) l()
    },
    subscribe: (l: () => void) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
  }
})
vi.mock('@clerk/react', () => ({
  useAuth: () => ({
    userId: useSyncExternalStore(account.subscribe, account.get),
  }),
}))

function deferred() {
  let resolve: () => void = () => {}
  const promise = new Promise<never[]>((r) => {
    resolve = () => r([])
  })
  return { promise, resolve }
}

function signInAs(userId: string | null) {
  act(() => account.set(userId))
}

// `refetchQueries` is the only client method the gate calls.
const refetchQueriesMock = vi.hoisted(() => vi.fn(async () => []))
vi.mock('@apollo/client/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@apollo/client/react')>()
  return {
    ...actual,
    useApolloClient: () => ({ refetchQueries: refetchQueriesMock }),
  }
})

vi.mock('@/components/household/NoHouseholdScreen', () => ({
  NoHouseholdScreen: () => <p>no-household-screen</p>,
}))

// Only the cache clear is stubbed (it touches IndexedDB). `forgetHousehold`
// itself is real, so the tests read the two localStorage keys it removes.
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

const LAST_KEY = 'last-household-id'
const ACTIVE_KEY = 'active-location-id:cloud'

const OLD_HOUSEHOLD: CloudHousehold = {
  __typename: 'Household',
  id: 'household-old',
  name: 'Old home',
  role: 'member',
}

function noHousehold(data?: CloudHousehold): HouseholdResult {
  return {
    data,
    isLoading: false,
    isError: !data,
    errorCode: 'NO_HOUSEHOLD',
  }
}

function inHousehold(id: string): HouseholdResult {
  return {
    data: { ...OLD_HOUSEHOLD, id },
    isLoading: false,
    isError: false,
    errorCode: undefined,
  }
}

function renderAt(path: string) {
  const root = createRootRoute({
    component: () => (
      <NoHouseholdGate>
        <Outlet />
      </NoHouseholdGate>
    ),
  })
  const page = createRoute({
    getParentRoute: () => root,
    path: '$',
    component: () => <p>the-page</p>,
  })
  const router = createRouter({
    routeTree: root.addChildren([page]),
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  return render(<RouterProvider router={router} />)
}

beforeEach(() => {
  // Nothing is mounted yet, so no `act` is needed
  account.set('user-a')
  store.set({
    data: undefined,
    isLoading: true,
    isError: false,
    errorCode: undefined,
  })
  localStorage.setItem('data-mode', 'cloud')
  localStorage.setItem(LAST_KEY, 'household-old')
  localStorage.setItem(ACTIVE_KEY, 'location-of-old-household')
})

afterEach(() => {
  localStorage.clear()
  vi.resetAllMocks()
  clearCacheMock.mockImplementation(async () => {})
  switchToHouseholdMock.mockImplementation(async () => {})
  refetchQueriesMock.mockImplementation(async () => [])
})

describe('NoHouseholdGate', () => {
  it('user sees the no-household screen instead of the page on NO_HOUSEHOLD', async () => {
    answer(noHousehold())

    renderAt('/')

    expect(await screen.findByText('no-household-screen')).toBeInTheDocument()
    expect(screen.queryByText('the-page')).toBeNull()
  })

  it('user sees the page in local mode, even after a NO_HOUSEHOLD answer', async () => {
    // Given the person pressed "Switch to offline mode" on the screen (owner
    // decision O19): the page loads again with `data-mode` set to local, and
    // Apollo may still hold the cloud answer
    localStorage.setItem('data-mode', 'local')
    answer(noHousehold(OLD_HOUSEHOLD))

    renderAt('/settings')

    // Then the local page shows, and nothing of the cloud data is touched
    expect(await screen.findByText('the-page')).toBeInTheDocument()
    expect(screen.queryByText('no-household-screen')).toBeNull()
    expect(clearCacheMock).not.toHaveBeenCalled()
  })

  it('shows the screen also when the old household is still cached', async () => {
    // Apollo keeps the cached household in `data` next to the error
    answer(noHousehold(OLD_HOUSEHOLD))

    renderAt('/shopping')

    expect(await screen.findByText('no-household-screen')).toBeInTheDocument()
  })

  it('clears the old household from the device once, with no reload', async () => {
    answer(noHousehold(OLD_HOUSEHOLD))

    renderAt('/')
    await screen.findByText('no-household-screen')

    await waitFor(() => expect(clearCacheMock).toHaveBeenCalledTimes(1))
    expect(localStorage.getItem(LAST_KEY)).toBeNull()
    expect(localStorage.getItem(ACTIVE_KEY)).toBeNull()
    expect(switchToHouseholdMock).not.toHaveBeenCalled()
  })

  it('clears only once while the answer stays NO_HOUSEHOLD', async () => {
    answer(noHousehold(OLD_HOUSEHOLD))
    renderAt('/')
    await waitFor(() => expect(clearCacheMock).toHaveBeenCalledTimes(1))

    // When refetches answer NO_HOUSEHOLD again, with a loading step between
    answer({
      data: undefined,
      isLoading: true,
      isError: false,
      errorCode: undefined,
    })
    answer(noHousehold())
    answer(noHousehold())

    expect(screen.getByText('no-household-screen')).toBeInTheDocument()
    expect(clearCacheMock).toHaveBeenCalledTimes(1)
  })

  it('shows the page for another error, and clears nothing', async () => {
    // A network error must never tell someone they have no household
    answer({
      data: undefined,
      isLoading: false,
      isError: true,
      errorCode: undefined,
    })

    renderAt('/')

    expect(await screen.findByText('the-page')).toBeInTheDocument()
    expect(screen.queryByText('no-household-screen')).toBeNull()
    expect(clearCacheMock).not.toHaveBeenCalled()
    expect(localStorage.getItem(LAST_KEY)).toBe('household-old')
  })

  it('shows the page for a server error with another code', async () => {
    answer({
      data: undefined,
      isLoading: false,
      isError: true,
      errorCode: 'UNAUTHENTICATED',
    })

    renderAt('/')

    expect(await screen.findByText('the-page')).toBeInTheDocument()
    expect(clearCacheMock).not.toHaveBeenCalled()
  })

  it('shows the page while the household is loading', async () => {
    answer({
      data: undefined,
      isLoading: true,
      isError: false,
      errorCode: undefined,
    })

    renderAt('/')

    expect(await screen.findByText('the-page')).toBeInTheDocument()
  })

  it.each([
    '/join/tok-abc',
    '/sign-in',
  ])('shows the page on %s, and clears nothing', async (path) => {
    // A person with no household must still be able to open an invite link
    answer(noHousehold())

    renderAt(path)

    expect(await screen.findByText('the-page')).toBeInTheDocument()
    expect(screen.queryByText('no-household-screen')).toBeNull()
    expect(clearCacheMock).not.toHaveBeenCalled()
    expect(localStorage.getItem(LAST_KEY)).toBe('household-old')
  })

  it('does nothing in local mode', async () => {
    localStorage.setItem('data-mode', 'local')
    // A stub that WOULD say NO_HOUSEHOLD; local mode never asks the server
    answer(noHousehold())

    renderAt('/')

    expect(await screen.findByText('the-page')).toBeInTheDocument()
    expect(clearCacheMock).not.toHaveBeenCalled()
  })

  it('user lands on the pantry of a household made in another tab', async () => {
    // Given the screen shows
    answer(noHousehold())
    renderAt('/shopping')
    await screen.findByText('no-household-screen')
    await waitFor(() => expect(clearCacheMock).toHaveBeenCalledTimes(1))

    // When a refetch is in flight, the screen stays (no flash of the page)
    answer({
      data: undefined,
      isLoading: true,
      isError: false,
      errorCode: undefined,
    })
    expect(screen.getByText('no-household-screen')).toBeInTheDocument()
    expect(screen.queryByText('the-page')).toBeNull()
    expect(switchToHouseholdMock).not.toHaveBeenCalled()

    // When the refetch (after the other tab's LOCATION event) answers a
    // household
    answer(inHousehold('household-new'))

    // Then the device moves there, on the pantry
    await waitFor(() =>
      expect(switchToHouseholdMock).toHaveBeenCalledWith('household-new', {
        to: '/',
      }),
    )
    expect(switchToHouseholdMock).toHaveBeenCalledTimes(1)
  })

  it('a household answer with no screen shown before changes nothing', async () => {
    answer(inHousehold('household-old'))

    renderAt('/')

    expect(await screen.findByText('the-page')).toBeInTheDocument()
    expect(switchToHouseholdMock).not.toHaveBeenCalled()
    expect(clearCacheMock).not.toHaveBeenCalled()
  })

  it('refetches every active query after the clear, so old names leave the screen', async () => {
    // Emptying the cache does not change what a mounted query shows; only a
    // refetch moves the sidebar name and the switcher to "loading"
    const order: string[] = []
    clearCacheMock.mockImplementation(async () => {
      order.push('clear')
    })
    refetchQueriesMock.mockImplementation(async () => {
      order.push('refetch')
      return []
    })
    answer(noHousehold(OLD_HOUSEHOLD))

    renderAt('/')

    await waitFor(() =>
      expect(refetchQueriesMock).toHaveBeenCalledWith({ include: 'active' }),
    )
    expect(order).toEqual(['clear', 'refetch'])
    expect(refetchQueriesMock).toHaveBeenCalledTimes(1)
  })

  it('does not move to the household that was just lost', async () => {
    // Given the screen shows, with the lost household still cached
    answer(noHousehold(OLD_HOUSEHOLD))
    renderAt('/')
    await waitFor(() => expect(clearCacheMock).toHaveBeenCalledTimes(1))

    // When that same cached household comes back with no error
    answer(inHousehold('household-old'))

    // Then the device does not move there (it would answer NO_HOUSEHOLD
    // again on the next load, on every load), and the screen stays
    await new Promise((r) => setTimeout(r, 20))
    expect(switchToHouseholdMock).not.toHaveBeenCalled()
    expect(screen.getByText('no-household-screen')).toBeInTheDocument()
  })

  it('user who signs in as another account in the same tab sees their page, not the old screen', async () => {
    // Given account A has no household and the screen shows
    answer(noHousehold(OLD_HOUSEHOLD))
    renderAt('/')
    await waitFor(() => expect(clearCacheMock).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(refetchQueriesMock).toHaveBeenCalled())
    refetchQueriesMock.mockClear()
    // The refetch for B stays in flight until the test answers it
    const refetch = deferred()
    refetchQueriesMock.mockImplementation(() => refetch.promise)

    // When A signs out and B signs in. Apollo still holds A's NO_HOUSEHOLD
    // answer, because nothing has refetched it yet
    signInAs(null)
    signInAs('user-b')

    // Then B sees the page at once, and GetHousehold is asked again for B
    expect(screen.getByText('the-page')).toBeInTheDocument()
    expect(screen.queryByText('no-household-screen')).toBeNull()
    expect(refetchQueriesMock).toHaveBeenCalledWith({
      include: [GetHouseholdDocument],
    })

    // When B's answer arrives: a household. Nothing moves: B was never
    // shown the screen
    answer(inHousehold('household-b'))
    await act(async () => refetch.resolve())
    expect(screen.getByText('the-page')).toBeInTheDocument()
    expect(switchToHouseholdMock).not.toHaveBeenCalled()
  })

  it('shows the screen for the new account when its own answer is NO_HOUSEHOLD', async () => {
    // Given the screen showed for A
    answer(noHousehold())
    renderAt('/')
    await waitFor(() => expect(clearCacheMock).toHaveBeenCalledTimes(1))
    const refetch = deferred()
    refetchQueriesMock.mockImplementation(() => refetch.promise)

    // When B signs in, and B's fresh answer is NO_HOUSEHOLD too
    signInAs('user-b')
    expect(screen.getByText('the-page')).toBeInTheDocument()
    answer(noHousehold())
    await act(async () => refetch.resolve())

    // Then B gets the screen, and the device data is cleared for B too
    expect(await screen.findByText('no-household-screen')).toBeInTheDocument()
    await waitFor(() => expect(clearCacheMock).toHaveBeenCalledTimes(2))
  })

  it('the same account signing in again is not a new account', async () => {
    answer(noHousehold())
    renderAt('/')
    await screen.findByText('no-household-screen')
    refetchQueriesMock.mockClear()

    signInAs(null)
    signInAs('user-a')

    expect(screen.getByText('no-household-screen')).toBeInTheDocument()
    expect(refetchQueriesMock).not.toHaveBeenCalledWith({
      include: [GetHouseholdDocument],
    })
  })
})
