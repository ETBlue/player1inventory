import { gql, InMemoryCache } from '@apollo/client'
import { afterEach, describe, expect, it } from 'vitest'
import { cacheDb } from '@/apollo/cacheDb'
import {
  clearCache,
  getLastSignedInUserId,
  saveCache,
  setLastSignedInUserId,
} from '@/apollo/persistence'

const QUERY = gql`
  query GetItems {
    items {
      id
    }
  }
`

afterEach(async () => {
  await cacheDb.snapshots.clear()
  localStorage.clear()
})

describe('sign-out cleanup', () => {
  it('user data does not stay on the device after sign-out', async () => {
    // Given a signed-in user with a saved cache
    const cache = new InMemoryCache()
    cache.writeQuery({
      query: QUERY,
      data: { items: [{ __typename: 'Item', id: 'item-1' }] },
    })
    await saveCache(cache, 'user-a')
    setLastSignedInUserId('user-a')
    expect(await cacheDb.snapshots.count()).toBe(1)

    // When the user signs out
    await clearCache()

    // Then no cached data is left behind
    expect(await cacheDb.snapshots.count()).toBe(0)
    // But the user id stays (plan decision P7). Sign-out can happen on any
    // page, so a watch query may refill the in-memory cache before the next
    // sign-in. The kept id is what makes ApolloWrapper purge that cache when a
    // DIFFERENT account signs in next.
    expect(getLastSignedInUserId()).toBe('user-a')
  })
})
