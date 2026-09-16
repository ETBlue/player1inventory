import { gql, InMemoryCache } from '@apollo/client'
import { afterEach, describe, expect, it } from 'vitest'
import { cacheDb } from './cacheDb'
import { cloudCache } from './cloudCache'
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
  await cloudCache.reset()
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

  // This file cannot test the restore-before-first-query ordering. There is no
  // ordering inside `persistence.ts`; the order lives in `bootstrapCloudMode`
  // and is pinned by `src/bootstrap.test.ts` with a restore the test releases
  // by hand. What this test checks is a different, real property of
  // `restoreCache`: it REPLACES the cache contents instead of merging into
  // them.
  it('restoring replaces whatever the cache already held', async () => {
    // Given user A saved a cache holding Milk
    await saveCache(cacheWithOneItem(), 'user-a')

    // And a cache that already holds a different item
    const fresh = new InMemoryCache()
    fresh.writeQuery({
      query: QUERY,
      data: { items: [{ __typename: 'Item', id: 'item-2', name: 'Eggs' }] },
    })

    // When the stored copy is restored into it
    await restoreCache(fresh, 'user-a')

    // Then only the stored copy is left. Eggs is gone from the store, not
    // merely hidden behind the new `items` field value.
    expect(fresh.readQuery({ query: QUERY })).toEqual({
      items: [{ __typename: 'Item', id: 'item-1', name: 'Milk' }],
    })
    expect(fresh.extract()).not.toHaveProperty('Item:item-2')
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

  it('sign-out also empties the cache held in memory', async () => {
    // Given the live cloud cache holds user A's item
    cloudCache.writeQuery({
      query: QUERY,
      data: { items: [{ __typename: 'Item', id: 'item-1', name: 'Milk' }] },
    })
    expect(cloudCache.extract()).toHaveProperty('Item:item-1')

    // When the user signs out
    await clearCache()

    // Then the rows are gone from memory too. `cloudCache` is a module-level
    // singleton that survives sign-out, so clearing only IndexedDB would let
    // the next account read these rows through the default cache-first policy.
    expect(cloudCache.extract()).not.toHaveProperty('Item:item-1')
    expect(cloudCache.readQuery({ query: QUERY })).toBeNull()
  })
})
