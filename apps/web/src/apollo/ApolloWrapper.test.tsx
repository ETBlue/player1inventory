import { ApolloClient, ApolloLink, gql, Observable } from '@apollo/client'
import { ApolloProvider, useQuery } from '@apollo/client/react'
import { useAuth } from '@clerk/react'
import { act, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ItemCard } from '@/components/item/ItemCard'
import { LastPurchaseDatesDocument } from '@/generated/graphql'
import { renderWithRouter } from '@/test/utils'
import type { PantryItem } from '@/types'
import { ApolloWrapper, RESUME_REFETCH_MIN_GAP_MS } from './ApolloWrapper'
import { cacheDb } from './cacheDb'
import { cloudCache, createCache } from './cloudCache'
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

// Restore the REAL generated Apollo hooks. `src/test/setup.ts` stubs every one
// of them, and a stub sends no request — so `ApolloWrapper resume refetch cost`
// below would count 0 requests from `ItemCard` whether the card queried or not,
// and could not fail. With the real hooks, a card that runs its own
// `LastPurchaseDates` query shows up in the counts.
vi.mock('@/generated/graphql', async (importOriginal) => await importOriginal())

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

function setVisible() {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => 'visible',
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

// ─── refetch when the app comes back ────────────────────────────────────────
//
// A home-screen PWA on iOS has no reload button and no pull-to-refresh, so
// returning to the app is the only way the user can ask for fresh data.
// `fetchPolicy: 'cache-and-network'` only refreshes a query when its component
// MOUNTS, and resuming a backgrounded app mounts nothing.
//
// The clock is controlled with a `Date.now` spy rather than fake timers: the
// wrapper's 5-second save interval and Dexie's writes both run on real timers
// here, and freezing those would change what the rest of the effect does.
describe('ApolloWrapper refetch on resume', () => {
  let refetchSpy: ReturnType<typeof vi.spyOn>
  let nowSpy: ReturnType<typeof vi.spyOn>
  let now = 0

  function advance(ms: number) {
    now += ms
  }

  /** Fire the event the browser fires when the app comes back to the front. */
  function resume() {
    setVisible()
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
  }

  async function mountSignedIn() {
    signedInAs('user-a')
    render(
      <ApolloWrapper>
        <div>app</div>
      </ApolloWrapper>,
    )
    // The listener is registered inside an async `start()`, so waiting for
    // the stored user id is what proves it is attached.
    await waitFor(() => expect(getLastSignedInUserId()).toBe('user-a'))
  }

  beforeEach(() => {
    now = 1_700_000_000_000
    nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now)
    refetchSpy = vi
      .spyOn(ApolloClient.prototype, 'refetchQueries')
      .mockReturnValue(
        Promise.resolve([]) as unknown as ReturnType<
          ApolloClient['refetchQueries']
        >,
      )
  })

  afterEach(() => {
    refetchSpy.mockRestore()
    nowSpy.mockRestore()
  })

  it('user returning to the app after a while gets fresh data', async () => {
    // Given the app is open and signed in
    await mountSignedIn()

    // When the user leaves it long enough for the data to have moved on, and
    // comes back
    advance(RESUME_REFETCH_MIN_GAP_MS + 1)
    resume()

    // Then every query on screen is refetched, with no opt-out.
    // `include: 'active'` is what makes this reach the mounted components;
    // anything narrower would leave the pantry showing what the device last
    // saw. What it COSTS is measured in "ApolloWrapper resume refetch cost"
    // below — this assertion only pins the shape of the call.
    //
    // The exact object matters. `toHaveBeenCalledWith` on a plain object is a
    // deep-equality check, so a reintroduced `onQueryUpdated` fails here.
    expect(refetchSpy).toHaveBeenCalledTimes(1)
    expect(refetchSpy).toHaveBeenCalledWith({ include: 'active' })
  })

  it('user returning while offline sends no requests', async () => {
    // Given the app is open and the device has no connection
    await mountSignedIn()
    setOnLine(false)

    // When the user comes back after a long gap
    advance(RESUME_REFETCH_MIN_GAP_MS + 1)
    resume()

    // Then nothing is requested. Every request would fail, the hooks would go
    // on showing cached data either way, and the failures cost battery and
    // data on a metered link.
    expect(refetchSpy).not.toHaveBeenCalled()
  })

  it('user glancing away and straight back does not trigger a refetch', async () => {
    // Given the app is open. Mount already ran a network leg for every query
    // on screen, so the clock starts there.
    await mountSignedIn()

    // When the user switches away and returns within the minimum gap
    advance(RESUME_REFETCH_MIN_GAP_MS - 1)
    resume()

    // Then nothing is refetched — the data cannot be meaningfully older
    expect(refetchSpy).not.toHaveBeenCalled()
  })

  it('user returning twice refetches only after the gap has passed again', async () => {
    // Given the app refetched once on an earlier resume
    await mountSignedIn()
    advance(RESUME_REFETCH_MIN_GAP_MS + 1)
    resume()
    expect(refetchSpy).toHaveBeenCalledTimes(1)

    // When the user comes back again too soon after THAT refetch
    advance(RESUME_REFETCH_MIN_GAP_MS - 1)
    resume()

    // Then it is still one refetch — the gap is measured from the last
    // refetch, not from mount
    expect(refetchSpy).toHaveBeenCalledTimes(1)

    // And when enough time has passed since that refetch, it runs again
    advance(2)
    resume()
    expect(refetchSpy).toHaveBeenCalledTimes(2)
  })

  it('hiding the app never refetches', async () => {
    // Given the app is open and a long time has passed
    await mountSignedIn()
    advance(RESUME_REFETCH_MIN_GAP_MS + 1)

    // When the app goes to the background
    setHidden()
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    // Then it saves the cache but asks for nothing. Only becoming VISIBLE
    // refetches.
    expect(refetchSpy).not.toHaveBeenCalled()
  })

  it('local mode refetches nothing, because nobody is signed in', async () => {
    // Given nobody is signed in — local mode never reaches the cloud
    signedInAs(null)
    render(
      <ApolloWrapper>
        <div>app</div>
      </ApolloWrapper>,
    )
    await letWritesLand()

    // When the app comes back after a long gap
    advance(RESUME_REFETCH_MIN_GAP_MS + 1)
    resume()

    // Then no listener was ever attached, so nothing is requested
    expect(refetchSpy).not.toHaveBeenCalled()
  })
})

// ─── the pantry sends ONE purchase-date request, whatever the card count ────
//
// `ItemCard` used to run its own `LastPurchaseDates` query with
// `itemIds: [itemId]`. `lastPurchaseDates` is keyed by `['itemIds','locationId']`
// in `cloudCache.ts`, so every card owned a separate cache entry that Apollo
// could not merge: 20 cards measured 20 requests, and the resume refetch sent
// 20 more. Two workarounds existed only because of that — a `cache-first` pin
// on the per-card query, and a context marker in `apollo/constants.ts` that let
// it opt out of the resume refetch here. Both are deleted (#305): the card
// takes the date as a prop from
// `useItemSortData`'s single batch query.
//
// These tests measure REAL requests through a counting `ApolloLink`, not calls
// to `refetchQueries`. A test that only checks `refetchQueries` was called says
// nothing about which queries it actually sent.
//
// They render REAL `ItemCard`s, not a stand-in, and this file restores the real
// generated Apollo hooks above — so a card that fetched for itself would be
// counted here. The card count is a parameter and both 3 and 30 are measured:
// a fixture with ONE card size could not tell "one request" from "one request
// per card".
//
// The counting client is separate from the one `ApolloWrapper` builds, because
// the wrapper's client talks to a real HTTP/WS link. The link between them is
// the options object: the spy captures exactly what the wrapper passes, and the
// counting client is then driven with that same object.
describe('ApolloWrapper resume refetch cost', () => {
  const GET_ITEMS = gql`
    query GetItemsProbe {
      itemsProbe {
        id
      }
    }
  `

  type RefetchOptions = Parameters<ApolloClient['refetchQueries']>[0]

  const cardIds = (n: number) =>
    Array.from({ length: n }, (_, i) => `item-${i}`)

  const cardItem = (id: string): PantryItem => ({
    id,
    name: `Item ${id}`,
    tagIds: [],
    targetUnit: 'package',
    targetQuantity: 2,
    refillThreshold: 1,
    packedQuantity: 2,
    unpackedQuantity: 0,
    consumeAmount: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  })

  function buildCountingClient() {
    const counts: Record<string, number> = {}
    const link = new ApolloLink((operation) => {
      const name = operation.operationName ?? 'unnamed'
      counts[name] = (counts[name] ?? 0) + 1
      return new Observable((observer) => {
        observer.next({
          data:
            name === 'GetItemsProbe'
              ? { itemsProbe: [] }
              : { lastPurchaseDates: [] },
        })
        observer.complete()
      })
    })
    // The REAL cache config, so `lastPurchaseDates`' `keyArgs` are the ones
    // production uses. With a default cache the per-card entries would still
    // be separate, but this keeps the fixture honest.
    return { client: new ApolloClient({ link, cache: createCache() }), counts }
  }

  function PantryProbe({ ids }: { ids: string[] }) {
    // The ONE batch query, as `useItemSortData` sends it: every visible item in
    // a single request. Its `purchaseDates` map feeds each card's prop.
    const { data } = useQuery(LastPurchaseDatesDocument, {
      variables: { itemIds: ids, locationId: 'loc-a' },
      fetchPolicy: 'cache-and-network',
    })
    const dates = new Map<string, Date>(
      (
        (data as { lastPurchaseDates?: { itemId: string; date: string }[] })
          ?.lastPurchaseDates ?? []
      )
        .filter((r) => r.date)
        .map((r) => [r.itemId, new Date(r.date)]),
    )
    return (
      <>
        {ids.map((id) => (
          <ItemCard
            key={id}
            item={cardItem(id)}
            lastPurchaseDate={dates.get(id)}
            tags={[]}
            tagTypes={[]}
          />
        ))}
        <ItemsProbe />
      </>
    )
  }

  /** Stands in for every other active query: must be refetched on resume. */
  function ItemsProbe() {
    useQuery(GET_ITEMS)
    return null
  }

  /**
   * Renders `cardCount` real cards plus the batch query, then resumes the app
   * and applies the options the wrapper passed to `refetchQueries` to the
   * counting client.
   *
   * Returns the request counts before and after the resume.
   */
  async function measureResume(cardCount: number) {
    const { client: countingClient, counts } = buildCountingClient()
    await renderWithRouter(
      <ApolloProvider client={countingClient}>
        <PantryProbe ids={cardIds(cardCount)} />
      </ApolloProvider>,
    )
    await waitFor(() => expect(counts.GetItemsProbe).toBe(1))
    // Settle: any per-card request would have been sent by now.
    await letWritesLand()
    const before = { ...counts }

    let captured: RefetchOptions | undefined
    const spy = vi
      .spyOn(ApolloClient.prototype, 'refetchQueries')
      .mockImplementation((options) => {
        captured = options as RefetchOptions
        return Promise.resolve([]) as unknown as ReturnType<
          ApolloClient['refetchQueries']
        >
      })

    let now = 1_700_000_000_000
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now)
    signedInAs('user-a')
    render(
      <ApolloWrapper>
        <div>app</div>
      </ApolloWrapper>,
    )
    await waitFor(() => expect(getLastSignedInUserId()).toBe('user-a'))
    now += RESUME_REFETCH_MIN_GAP_MS + 1
    setVisible()
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(captured).toBeDefined()

    // Restore before driving the counting client, or the spy would swallow
    // this call too and nothing would be measured.
    spy.mockRestore()
    nowSpy.mockRestore()
    await act(async () => {
      await countingClient.refetchQueries(
        captured as NonNullable<RefetchOptions>,
      )
    })
    return { before, after: { ...counts } }
  }

  it.each([
    3, 30,
  ])('user sees %i cards and the pantry sends ONE purchase-date request', async (cardCount) => {
    // Given a pantry showing `cardCount` real ItemCards
    // When the user comes back after a long gap
    const { before, after } = await measureResume(cardCount)

    // Then exactly one request went out at mount and one more on resume,
    // no matter how many cards are on screen. 30 cards used to cost 30 of
    // each.
    expect(before.LastPurchaseDates).toBe(1)
    expect(after.LastPurchaseDates).toBe(2)
  })

  it('user returning to the app still refreshes every other query', async () => {
    // Given the same pantry, which also has another query on screen
    // When the user comes back after a long gap
    const { before, after } = await measureResume(3)

    // Then that query WAS refetched. Without this half, a wrapper that
    // refetched nothing at all would pass the test above.
    expect(before.GetItemsProbe).toBe(1)
    expect(after.GetItemsProbe).toBe(2)
  })
})
