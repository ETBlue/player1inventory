import { gql } from '@apollo/client'
import { useAuth } from '@clerk/react'
import { render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApolloWrapper } from './ApolloWrapper'
import { cacheDb } from './cacheDb'
import { cloudCache } from './cloudCache'
import { getLastSignedInUserId, saveCache } from './persistence'

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

beforeEach(() => {
  localStorage.clear()
})

afterEach(async () => {
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
})
