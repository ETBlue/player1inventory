import { render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CloudHousehold } from '@/hooks/useHousehold'
import { HouseholdChangeGuard } from './HouseholdChangeGuard'
import { LAST_HOUSEHOLD_ID_KEY } from './householdGuard'

// What `GetHousehold` answers. `networkStatus` 7 is `NetworkStatus.ready`:
// the answer came from the server. 1 is `loading`: with
// `cache-and-network`, a cached household may already be in `data` then.
const householdState = vi.hoisted(() => ({
  value: {
    data: undefined as CloudHousehold | undefined,
    networkStatus: 7,
  },
}))

vi.mock('@/generated/graphql', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/generated/graphql')>()
  return {
    ...actual,
    useGetHouseholdQuery: () => ({
      data: householdState.value.data
        ? { household: householdState.value.data }
        : undefined,
      networkStatus: householdState.value.networkStatus,
    }),
  }
})

const clearCacheMock = vi.hoisted(() => vi.fn(async () => {}))
vi.mock('./persistence', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./persistence')>()
  return { ...actual, clearCache: clearCacheMock }
})

const ACTIVE_KEY = 'active-location-id:cloud'
const LAST_USER_ID_KEY = 'cloud-cache-user-id'
const reloadMock = vi.fn()
const originalLocation = window.location

function household(id: string): CloudHousehold {
  return {
    __typename: 'Household',
    id,
    name: `Home ${id}`,
    role: 'member',
    hasOwner: true,
    pendingTransfer: null,
  }
}

function setHousehold(next: Partial<typeof householdState.value>) {
  householdState.value = { data: undefined, networkStatus: 7, ...next }
}

beforeEach(() => {
  Object.defineProperty(window, 'location', {
    value: { ...originalLocation, reload: reloadMock },
    writable: true,
    configurable: true,
  })
  localStorage.setItem(ACTIVE_KEY, 'location-of-old-household')
  localStorage.setItem(LAST_USER_ID_KEY, 'user-1')
})

afterEach(() => {
  Object.defineProperty(window, 'location', {
    value: originalLocation,
    writable: true,
    configurable: true,
  })
  localStorage.clear()
  reloadMock.mockReset()
  clearCacheMock.mockClear()
  setHousehold({})
})

describe('HouseholdChangeGuard', () => {
  it('stores the household id when none is stored, and does not reload', async () => {
    // Given no stored household id (the first cloud load on this device)
    setHousehold({ data: household('h-1') })

    // When the guard sees the household
    render(<HouseholdChangeGuard />)

    // Then it stores the id and changes nothing else
    await waitFor(() =>
      expect(localStorage.getItem(LAST_HOUSEHOLD_ID_KEY)).toBe('h-1'),
    )
    expect(clearCacheMock).not.toHaveBeenCalled()
    expect(reloadMock).not.toHaveBeenCalled()
    expect(localStorage.getItem(ACTIVE_KEY)).toBe('location-of-old-household')
  })

  it('does nothing when the household is the stored one', async () => {
    // Given the stored id is the household the server answers
    localStorage.setItem(LAST_HOUSEHOLD_ID_KEY, 'h-1')
    setHousehold({ data: household('h-1') })

    // When the guard sees it
    render(<HouseholdChangeGuard />)

    // Then nothing is cleared and nothing reloads
    await Promise.resolve()
    expect(clearCacheMock).not.toHaveBeenCalled()
    expect(reloadMock).not.toHaveBeenCalled()
    expect(localStorage.getItem(ACTIVE_KEY)).toBe('location-of-old-household')
  })

  it('user who is moved to another household sees no row of the old one', async () => {
    // Given the device last showed household h-1, and the server now answers
    // h-2 (a join, a leave or a removal happened)
    localStorage.setItem(LAST_HOUSEHOLD_ID_KEY, 'h-1')
    setHousehold({ data: household('h-2') })

    // When the guard sees the new household
    render(<HouseholdChangeGuard />)

    // Then the cache is cleared, the old active location is forgotten, the
    // new id is stored, and the page reloads
    await waitFor(() => expect(reloadMock).toHaveBeenCalledOnce())
    expect(clearCacheMock).toHaveBeenCalledOnce()
    expect(localStorage.getItem(ACTIVE_KEY)).toBeNull()
    expect(localStorage.getItem(LAST_HOUSEHOLD_ID_KEY)).toBe('h-2')
    // And the account guard of ApolloWrapper stays armed: the account did
    // not change, only the household
    expect(localStorage.getItem(LAST_USER_ID_KEY)).toBe('user-1')
  })

  it("user's other tab also clears, after the first tab already stored the new id", async () => {
    // Given this tab showed household h-1
    localStorage.setItem(LAST_HOUSEHOLD_ID_KEY, 'h-1')
    setHousehold({ data: household('h-1') })
    const { rerender } = render(<HouseholdChangeGuard />)
    await Promise.resolve()

    // And another tab joined h-2, which stored the new id for every tab
    localStorage.setItem(LAST_HOUSEHOLD_ID_KEY, 'h-2')

    // When this tab's household refetch answers h-2
    setHousehold({ data: household('h-2') })
    rerender(<HouseholdChangeGuard />)

    // Then this tab clears its own cache and reloads too. Comparing with the
    // stored id alone would see "h-2 = h-2" and keep the old rows on screen
    await waitFor(() => expect(reloadMock).toHaveBeenCalledOnce())
    expect(clearCacheMock).toHaveBeenCalledOnce()
  })

  it('does nothing while the household is loading or failed to load', async () => {
    // Given a stored id, and no household answer yet
    localStorage.setItem(LAST_HOUSEHOLD_ID_KEY, 'h-1')
    setHousehold({ networkStatus: 1 })
    const { rerender } = render(<HouseholdChangeGuard />)

    // When the read fails with nothing cached (8 is `NetworkStatus.error`)
    setHousehold({ networkStatus: 8 })
    rerender(<HouseholdChangeGuard />)
    await Promise.resolve()

    // Then nothing changes
    expect(clearCacheMock).not.toHaveBeenCalled()
    expect(reloadMock).not.toHaveBeenCalled()
    expect(localStorage.getItem(LAST_HOUSEHOLD_ID_KEY)).toBe('h-1')
  })

  it('does not act on a household that came only from the cache', async () => {
    // Given the stored id is h-1, and the cache restored from IndexedDB
    // still holds h-2 while the server has not answered yet
    localStorage.setItem(LAST_HOUSEHOLD_ID_KEY, 'h-1')
    setHousehold({ data: household('h-2'), networkStatus: 1 })
    const { rerender } = render(<HouseholdChangeGuard />)
    await Promise.resolve()

    // Then nothing is cleared and the stored id is not changed
    expect(clearCacheMock).not.toHaveBeenCalled()
    expect(reloadMock).not.toHaveBeenCalled()
    expect(localStorage.getItem(LAST_HOUSEHOLD_ID_KEY)).toBe('h-1')

    // When the server answers h-1
    setHousehold({ data: household('h-1'), networkStatus: 7 })
    rerender(<HouseholdChangeGuard />)
    await Promise.resolve()

    // Then still nothing: the cached h-2 was never this tab's household
    expect(clearCacheMock).not.toHaveBeenCalled()
    expect(reloadMock).not.toHaveBeenCalled()
  })

  it('does not store a household that came only from the cache', async () => {
    // Given no stored id, and only a cached household so far
    setHousehold({ data: household('h-cached'), networkStatus: 1 })

    // When the guard renders
    render(<HouseholdChangeGuard />)
    await Promise.resolve()

    // Then nothing is stored until the server answers
    expect(localStorage.getItem(LAST_HOUSEHOLD_ID_KEY)).toBeNull()
  })

  it('does not reload when the cache cannot be cleared', async () => {
    // Given the stored cache cannot be deleted
    localStorage.setItem(LAST_HOUSEHOLD_ID_KEY, 'h-1')
    clearCacheMock.mockRejectedValueOnce(new Error('IndexedDB is gone'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    setHousehold({ data: household('h-2') })

    // When the guard sees a new household
    render(<HouseholdChangeGuard />)

    // Then it does not reload into the old rows, and the stored id stays,
    // so the next load tries again
    await waitFor(() => expect(consoleError).toHaveBeenCalled())
    expect(reloadMock).not.toHaveBeenCalled()
    expect(localStorage.getItem(LAST_HOUSEHOLD_ID_KEY)).toBe('h-1')
    consoleError.mockRestore()
  })
})
