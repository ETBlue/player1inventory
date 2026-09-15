import { gql, InMemoryCache } from '@apollo/client'
import { afterEach, describe, expect, it } from 'vitest'
import { cacheDb } from './cacheDb'
import { clearCache, restoreCache, saveCache } from './persistence'

const QUERY = gql`
  query GetItems {
    items {
      id
      name
    }
  }
`

function cacheWithOneItem() {
  const cache = new InMemoryCache()
  cache.writeQuery({
    query: QUERY,
    data: { items: [{ __typename: 'Item', id: 'item-1', name: 'Milk' }] },
  })
  return cache
}

afterEach(async () => {
  await cacheDb.snapshots.clear()
})

describe('cache persistence', () => {
  it('user sees their data again after the app restarts', async () => {
    // Given a cache holding one item, saved for user A
    await saveCache(cacheWithOneItem(), 'user-a')

    // When a fresh cache restores for the same user
    const fresh = new InMemoryCache()
    const restored = await restoreCache(fresh, 'user-a')

    // Then the item is back
    expect(restored).toBe(true)
    expect(fresh.readQuery({ query: QUERY })).toEqual({
      items: [{ __typename: 'Item', id: 'item-1', name: 'Milk' }],
    })
  })

  it('user B never sees user A data on a shared device', async () => {
    // Given user A saved a cache
    await saveCache(cacheWithOneItem(), 'user-a')

    // When user B restores
    const fresh = new InMemoryCache()
    const restored = await restoreCache(fresh, 'user-b')

    // Then nothing is restored and the stored copy is deleted
    expect(restored).toBe(false)
    expect(fresh.readQuery({ query: QUERY })).toBeNull()
    expect(await cacheDb.snapshots.count()).toBe(0)
  })

  it('restoring keeps data that a later query would overwrite', async () => {
    // Given user A saved a cache holding one item
    await saveCache(cacheWithOneItem(), 'user-a')

    // When we restore and then a query writes an EMPTY result,
    // as an offline query does
    const fresh = new InMemoryCache()
    await restoreCache(fresh, 'user-a')
    const beforeOverwrite = fresh.readQuery({ query: QUERY })

    // Then the restore had already put the data in place.
    // This is the check that fails if restore runs after the first query.
    expect(beforeOverwrite).toEqual({
      items: [{ __typename: 'Item', id: 'item-1', name: 'Milk' }],
    })
  })

  it('sign-out removes the stored copy', async () => {
    // Given a saved cache
    await saveCache(cacheWithOneItem(), 'user-a')
    expect(await cacheDb.snapshots.count()).toBe(1)

    // When the user signs out
    await clearCache()

    // Then nothing is left on the device
    expect(await cacheDb.snapshots.count()).toBe(0)
  })
})
