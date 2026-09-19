import { gql } from '@apollo/client'
import { useAuth } from '@clerk/react'
import { act, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApolloWrapper } from './ApolloWrapper'
import { cacheDb } from './cacheDb'
import { cloudCache } from './cloudCache'
import {
  getLastSignedInUserId,
  getLastSyncedAt,
  saveCache,
  setLastSyncedAt,
} from './persistence'

vi.mock('@clerk/react', () => ({
  useAuth: vi.fn(),
  ClerkProvider: ({ children }: { children: React.ReactNode }) => children,
}))

const QUERY = gql`
  query GetItems {
    items {
      id
      name
    }
  }
`

function signedInAs(userId: string | null) {
  vi.mocked(useAuth).mockReturnValue({
    userId,
    isLoaded: true,
    isSignedIn: userId !== null,
    getToken: async () => null,
  } as unknown as ReturnType<typeof useAuth>)
}

function fillCloudCache() {
  cloudCache.writeQuery({
    query: QUERY,
    data: { items: [{ __typename: 'Item', id: 'item-1', name: 'Milk' }] },
  })
}

/** Dexie writes are async. Give any in-flight write time to land. */
async function letWritesLand() {
  await new Promise((resolve) => setTimeout(resolve, 50))
}

function setOnLine(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    get: () => value,
  })
}

function setHidden() {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => 'hidden',
  })
}

beforeEach(() => {
  localStorage.clear()
  setOnLine(true)
})

afterEach(async () => {
  setOnLine(true)
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => 'visible',
  })
  await cacheDb.snapshots.clear()
  await cloudCache.reset()
  vi.clearAllMocks()
})

describe('ApolloWrapper cache ownership', () => {
  it('user who signs out leaves no cached cloud data on the device', async () => {
    // Given user A is signed in with a cache saved on the device
    signedInAs('user-a')
    fillCloudCache()
    const { rerender, unmount } = render(
      <ApolloWrapper>
        <div>app</div>
      </ApolloWrapper>,
    )
    await waitFor(() => expect(getLastSignedInUserId()).toBe('user-a'))
    await saveCache(cloudCache, 'user-a')
    expect(await cacheDb.snapshots.count()).toBe(1)

    // When sign-out clears the cache and Clerk reports nobody is signed in
    const { clearCache } = await import('./persistence')
    await clearCache()
    signedInAs(null)
    rerender(
      <ApolloWrapper>
        <div>app</div>
      </ApolloWrapper>,
    )
    unmount()
    await letWritesLand()

    // Then nothing is left behind. The effect cleanup must not save: its
    // closure still holds user A's id and would write the cache straight back.
    expect(await cacheDb.snapshots.count()).toBe(0)
  })

  it('user B signing in on the same device deletes user A data first', async () => {
    // Given user A's cache is on the device and in memory
    localStorage.setItem('cloud-cache-user-id', 'user-a')
    fillCloudCache()
    await saveCache(cloudCache, 'user-a')
    expect(await cacheDb.snapshots.count()).toBe(1)

    // When user B signs in without a page reload
    signedInAs('user-b')
    render(
      <ApolloWrapper>
        <div>app</div>
      </ApolloWrapper>,
    )

    // Then user A's snapshot is deleted, their rows are gone from memory,
    // and the device now belongs to user B
    await waitFor(async () => expect(await cacheDb.snapshots.count()).toBe(0))
    expect(cloudCache.extract()).not.toHaveProperty('Item:item-1')
    await waitFor(() => expect(getLastSignedInUserId()).toBe('user-b'))
  })

  it('a normal cold start for the same user keeps the cached cloud data', async () => {
    // Given user A's cache is already on the device and in memory. This is a
    // normal cold start: the app was closed and reopened by the SAME user,
    // not a different account signing in.
    localStorage.setItem('cloud-cache-user-id', 'user-a')
    fillCloudCache()
    await saveCache(cloudCache, 'user-a')
    expect(await cacheDb.snapshots.count()).toBe(1)

    // When the same user's session starts again
    signedInAs('user-a')
    render(
      <ApolloWrapper>
        <div>app</div>
      </ApolloWrapper>,
    )
    await waitFor(() => expect(getLastSignedInUserId()).toBe('user-a'))

    // Then the cache is kept. A stored id that matches the signed-in user
    // must not purge anything — only a DIFFERENT stored id should.
    expect(await cacheDb.snapshots.count()).toBe(1)
    expect(cloudCache.extract()).toHaveProperty('Item:item-1')
  })
})

describe('ApolloWrapper last-synced stamp', () => {
  it('offline saving does not move the last-synced time forward', async () => {
    // Given the last successful sync was 3 hours ago, and the device is offline
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000)
    await setLastSyncedAt(threeHoursAgo)
    setOnLine(false)
    signedInAs('user-a')
    // This is also a first sign-in on this device: no user id is stored
    // before this render (beforeEach clears localStorage). A purge must not
    // run just because nothing was stored yet — only a DIFFERENT stored id
    // should trigger one. Spy on the real clearCache so a wrong purge here
    // is caught directly, not as a side effect on the lastSyncedAt check
    // below.
    const clearCacheSpy = vi.spyOn(await import('./persistence'), 'clearCache')
    render(
      <ApolloWrapper>
        <div>app</div>
      </ApolloWrapper>,
    )
    await waitFor(() => expect(getLastSignedInUserId()).toBe('user-a'))
    expect(clearCacheSpy).not.toHaveBeenCalled()

    // When the app saves the cache because the tab was hidden
    setHidden()
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await letWritesLand()

    // Then the stored time still points at the last real sync. Stamping it
    // here would make the banner say the data is fresh when it is 3 hours old.
    const stored = await getLastSyncedAt()
    expect(stored?.getTime()).toBe(threeHoursAgo.getTime())
  })
})
