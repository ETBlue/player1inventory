import type { ApolloClient } from '@apollo/client'
import { CombinedGraphQLErrors } from '@apollo/client/errors'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  GetHouseholdDocument,
  type GetHouseholdQuery,
} from '@/generated/graphql'
import {
  clearHouseholdChangedNotice,
  forgetHousehold,
  getShownHouseholdId,
  HOUSEHOLD_CHANGED_NOTICE_KEY,
  LAST_HOUSEHOLD_ID_KEY,
  readHouseholdChangedNotice,
  recoverFromHouseholdChange,
  resetHouseholdGuardForTests,
  switchToHousehold,
} from './householdGuard'

const clearCacheMock = vi.hoisted(() => vi.fn(async () => {}))
vi.mock('./persistence', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./persistence')>()
  return { ...actual, clearCache: clearCacheMock }
})

const ACTIVE_KEY = 'active-location-id:cloud'
const reloadMock = vi.fn()
const replaceMock = vi.fn()
const originalLocation = window.location

beforeEach(() => {
  Object.defineProperty(window, 'location', {
    value: { ...originalLocation, reload: reloadMock, replace: replaceMock },
    writable: true,
    configurable: true,
  })
  localStorage.setItem(ACTIVE_KEY, 'location-of-old-household')
  localStorage.setItem(LAST_HOUSEHOLD_ID_KEY, 'h-old')
  resetHouseholdGuardForTests()
})

afterEach(() => {
  Object.defineProperty(window, 'location', {
    value: originalLocation,
    writable: true,
    configurable: true,
  })
  localStorage.clear()
  reloadMock.mockReset()
  replaceMock.mockReset()
  clearCacheMock.mockClear()
})

describe('switchToHousehold', () => {
  it('clears, stores the new id and reloads the same page', async () => {
    // When the household changes with no target page
    await switchToHousehold('h-new')

    // Then the old data is gone and the page reloads in place
    expect(clearCacheMock).toHaveBeenCalledOnce()
    expect(localStorage.getItem(ACTIVE_KEY)).toBeNull()
    expect(localStorage.getItem(LAST_HOUSEHOLD_ID_KEY)).toBe('h-new')
    expect(reloadMock).toHaveBeenCalledOnce()
    expect(replaceMock).not.toHaveBeenCalled()
  })

  it('loads the target page instead of reloading, when one is given', async () => {
    // When the household changes with a target page (the join page passes
    // `/`: reloading `/join/<token>` would show the used invite as invalid)
    await switchToHousehold('h-new', { to: '/' })

    // Then the browser goes to the target, and does not reload in place
    expect(clearCacheMock).toHaveBeenCalledOnce()
    expect(localStorage.getItem(LAST_HOUSEHOLD_ID_KEY)).toBe('h-new')
    expect(replaceMock).toHaveBeenCalledWith('/')
    expect(reloadMock).not.toHaveBeenCalled()
  })
})

describe('forgetHousehold (households H5b, task G.8)', () => {
  it('clears the cache and both keys, and stays on the page', async () => {
    // When the person is in no household any more
    await forgetHousehold()

    // Then the old household's data is gone, no id is stored, and the page
    // does not change: the no-household screen is what they should see
    expect(clearCacheMock).toHaveBeenCalledOnce()
    expect(localStorage.getItem(ACTIVE_KEY)).toBeNull()
    expect(localStorage.getItem(LAST_HOUSEHOLD_ID_KEY)).toBeNull()
    expect(reloadMock).not.toHaveBeenCalled()
    expect(replaceMock).not.toHaveBeenCalled()
  })
})

describe('getShownHouseholdId (households H7 task L.3)', () => {
  it('reads the stored id once, and forgets it with the household', async () => {
    // Given a page that loaded with h-old stored
    expect(getShownHouseholdId()).toBe('h-old')

    // When another tab stores another id, this page still shows h-old
    localStorage.setItem(LAST_HOUSEHOLD_ID_KEY, 'h-other-tab')
    expect(getShownHouseholdId()).toBe('h-old')

    // And when this page is moved to no household, it shows none
    await forgetHousehold()
    expect(getShownHouseholdId()).toBeNull()
  })
})

function household(id: string, name: string): GetHouseholdQuery['household'] {
  return {
    __typename: 'Household',
    id,
    name,
    role: 'member',
    hasOwner: true,
    pendingTransfer: null,
  }
}

const noHouseholdError = new CombinedGraphQLErrors({
  errors: [{ message: 'none', extensions: { code: 'NO_HOUSEHOLD' } }],
})

/**
 * A client with only the two calls the recovery makes. `cached` is what this
 * page's cache holds; `answer` is what the server says now.
 */
function fakeClient(options: {
  cached?: GetHouseholdQuery['household']
  answer: () => Promise<GetHouseholdQuery['household']>
}) {
  const query = vi.fn(async () => ({
    data: { household: await options.answer() },
  }))
  const readQuery = vi.fn(() =>
    options.cached ? { household: options.cached } : null,
  )
  return {
    client: { query, readQuery } as unknown as ApolloClient,
    query,
  }
}

describe('recoverFromHouseholdChange (households H7 task L.3, decision T72)', () => {
  it('asks the server, stores the message with both names, and switches', async () => {
    // Given a page showing h-old ("Old home"), and the person now in h-new
    const { client, query } = fakeClient({
      cached: household('h-old', 'Old home'),
      answer: async () => household('h-new', 'New home'),
    })

    // When the server refuses a request with HOUSEHOLD_CHANGED
    await recoverFromHouseholdChange(client)

    // Then it asked the server, not the cache, and did not write the answer
    // into the cache (that would start a second switch in the guard)
    expect(query).toHaveBeenCalledWith({
      query: GetHouseholdDocument,
      fetchPolicy: 'no-cache',
    })
    // And the message for after the reload names both households
    expect(readHouseholdChangedNotice()).toEqual({
      household: 'New home',
      oldHousehold: 'Old home',
    })
    // And the page moved to h-new: cache cleared, id stored, reloaded
    expect(clearCacheMock).toHaveBeenCalledOnce()
    expect(localStorage.getItem(LAST_HOUSEHOLD_ID_KEY)).toBe('h-new')
    expect(localStorage.getItem(ACTIVE_KEY)).toBeNull()
    expect(reloadMock).toHaveBeenCalledOnce()
  })

  it('stores no old name when the cache holds another household', async () => {
    // Given a cached household that is not the one this page shows
    const { client } = fakeClient({
      cached: household('h-elsewhere', 'Elsewhere'),
      answer: async () => household('h-new', 'New home'),
    })

    await recoverFromHouseholdChange(client)

    // Then the message says "another household" instead of a wrong name
    expect(readHouseholdChangedNotice()).toEqual({
      household: 'New home',
      oldHousehold: null,
    })
  })

  it('with NO_HOUSEHOLD forgets the household and reloads, with no message', async () => {
    const { client } = fakeClient({
      cached: household('h-old', 'Old home'),
      answer: async () => {
        throw noHouseholdError
      },
    })

    await recoverFromHouseholdChange(client)

    // Then the device keeps nothing of h-old, and the reload shows the
    // no-household screen
    expect(clearCacheMock).toHaveBeenCalledOnce()
    expect(localStorage.getItem(LAST_HOUSEHOLD_ID_KEY)).toBeNull()
    expect(localStorage.getItem(HOUSEHOLD_CHANGED_NOTICE_KEY)).toBeNull()
    expect(reloadMock).toHaveBeenCalledOnce()
  })

  it('a second call in the same page load does nothing', async () => {
    const { client, query } = fakeClient({
      cached: household('h-old', 'Old home'),
      answer: async () => household('h-new', 'New home'),
    })

    // When two refusals arrive, one after the other
    await recoverFromHouseholdChange(client)
    await recoverFromHouseholdChange(client)

    // Then the page asked and reloaded once
    expect(query).toHaveBeenCalledTimes(1)
    expect(clearCacheMock).toHaveBeenCalledTimes(1)
    expect(reloadMock).toHaveBeenCalledTimes(1)
  })

  it('a burst of refusals at the same moment causes one reload', async () => {
    // Given an answer that is still on its way when more refusals arrive
    let release: () => void = () => {}
    const { client, query } = fakeClient({
      answer: () =>
        new Promise((resolve) => {
          release = () => resolve(household('h-new', 'New home'))
        }),
    })

    // When five refusals arrive before the answer
    const runs = Array.from({ length: 5 }, () =>
      recoverFromHouseholdChange(client),
    )
    release()
    await Promise.all(runs)

    // Then there was one question and one reload
    expect(query).toHaveBeenCalledTimes(1)
    expect(reloadMock).toHaveBeenCalledTimes(1)
  })

  it('does nothing when the server still answers the household this page shows', async () => {
    const { client } = fakeClient({
      answer: async () => household('h-old', 'Old home'),
    })

    await recoverFromHouseholdChange(client)

    // Then there is nothing to move: no clear, no reload, no message
    expect(clearCacheMock).not.toHaveBeenCalled()
    expect(reloadMock).not.toHaveBeenCalled()
    expect(localStorage.getItem(HOUSEHOLD_CHANGED_NOTICE_KEY)).toBeNull()
  })

  it('tries again on a later refusal when the question failed', async () => {
    // Given the first question fails (offline, a server error)
    let fail = true
    const { client, query } = fakeClient({
      answer: async () => {
        if (fail) throw new Error('network down')
        return household('h-new', 'New home')
      },
    })
    await recoverFromHouseholdChange(client)
    expect(reloadMock).not.toHaveBeenCalled()

    // When a later refusal arrives and the server answers
    fail = false
    await recoverFromHouseholdChange(client)

    // Then that one moves the page
    expect(query).toHaveBeenCalledTimes(2)
    expect(reloadMock).toHaveBeenCalledOnce()
  })

  it('does not reload, and drops the message, when the cache cannot be cleared', async () => {
    clearCacheMock.mockRejectedValueOnce(new Error('IndexedDB blocked'))
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client } = fakeClient({
      cached: household('h-old', 'Old home'),
      answer: async () => household('h-new', 'New home'),
    })

    await recoverFromHouseholdChange(client)

    // A reload would bring the old saved copy back
    expect(reloadMock).not.toHaveBeenCalled()
    expect(localStorage.getItem(HOUSEHOLD_CHANGED_NOTICE_KEY)).toBeNull()
    error.mockRestore()
  })
})

describe('the household changed message (households H7 task L.3)', () => {
  it('reads both names, and null for a missing old name', () => {
    localStorage.setItem(
      HOUSEHOLD_CHANGED_NOTICE_KEY,
      JSON.stringify({ household: 'New home', oldHousehold: null }),
    )
    expect(readHouseholdChangedNotice()).toEqual({
      household: 'New home',
      oldHousehold: null,
    })
    clearHouseholdChangedNotice()
    expect(readHouseholdChangedNotice()).toBeNull()
  })

  it('reads a broken value as no message', () => {
    localStorage.setItem(HOUSEHOLD_CHANGED_NOTICE_KEY, '1')
    expect(readHouseholdChangedNotice()).toBeNull()
    localStorage.setItem(HOUSEHOLD_CHANGED_NOTICE_KEY, '{not json')
    expect(readHouseholdChangedNotice()).toBeNull()
  })

  it('never throws when storage throws', () => {
    const get = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('SecurityError')
      })
    const remove = vi
      .spyOn(Storage.prototype, 'removeItem')
      .mockImplementation(() => {
        throw new Error('SecurityError')
      })
    try {
      expect(readHouseholdChangedNotice()).toBeNull()
      expect(() => clearHouseholdChangedNotice()).not.toThrow()
      resetHouseholdGuardForTests()
      expect(getShownHouseholdId()).toBeNull()
    } finally {
      get.mockRestore()
      remove.mockRestore()
    }
  })
})
