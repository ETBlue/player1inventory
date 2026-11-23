import { ApolloClient, ApolloLink, gql, InMemoryCache } from '@apollo/client'
import { MockLink } from '@apollo/client/testing'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHoldLink } from '@/test/holdLink'
import { refetchAfterWrite } from './refetchAfterWrite'

// `refetchAfterWrite` must wait for EVERY read, also when another read fails
// (review of households H5c task H.4). Apollo's `client.refetchQueries()`
// gives one `Promise.all` over the reads, which rejects as soon as ONE read
// fails, so a helper that waits for it stops waiting early. After a person
// leaves a location, the mounted `LocationPeople` read fails with FORBIDDEN
// every time, and the call resolved before `GetHouseholdLocations` landed.

const FAILS = gql`
  query FailsAfterWrite {
    fails
  }
`
const SLOW = gql`
  query SlowAfterWrite {
    slow
  }
`

let failNext = false
let slowValue = 1

function makeClient() {
  const hold = createHoldLink()
  const mocks = new MockLink(
    [
      {
        request: { query: FAILS },
        maxUsageCount: Number.POSITIVE_INFINITY,
        result: () =>
          failNext
            ? {
                errors: [
                  { message: 'Forbidden', extensions: { code: 'FORBIDDEN' } },
                ],
              }
            : { data: { fails: 1 } },
      },
      {
        request: { query: SLOW },
        maxUsageCount: Number.POSITIVE_INFINITY,
        result: () => ({ data: { slow: slowValue } }),
      },
    ],
    { defaultOptions: { delay: 0 } },
  )
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    link: ApolloLink.from([hold.link, mocks]),
  })
  return { client, hold }
}

const subscriptions: { unsubscribe: () => void }[] = []

/**
 * Mount a query, so a refetch by document reaches it. Returns a record of
 * the errors the mounted query has seen, so a test can wait until a failing
 * read has really been answered.
 */
function watch(client: ApolloClient, query: typeof FAILS) {
  const seen = { errors: 0 }
  subscriptions.push(
    client.watchQuery({ query }).subscribe({
      next: (result) => {
        if (result.error) seen.errors += 1
      },
      error: () => {
        seen.errors += 1
      },
    }),
  )
  return seen
}

afterEach(() => {
  for (const s of subscriptions.splice(0)) s.unsubscribe()
  failNext = false
  slowValue = 1
})

describe('refetchAfterWrite', () => {
  it('waits for a slow read even when another read fails', async () => {
    // Given two mounted queries, both loaded once
    const { client, hold } = makeClient()
    const failing = watch(client, FAILS)
    watch(client, SLOW)
    await vi.waitFor(() => {
      expect(client.readQuery({ query: FAILS })).toEqual({ fails: 1 })
      expect(client.readQuery({ query: SLOW })).toEqual({ slow: 1 })
    })

    // And the next read of the first one fails, while the second is held
    failNext = true
    slowValue = 2
    hold.hold('SlowAfterWrite')

    // When both are read again after a write
    let done = false
    const call = refetchAfterWrite(client, [FAILS, SLOW]).then(() => {
      done = true
    })
    await vi.waitFor(() => expect(hold.waiting('SlowAfterWrite')).toBe(1))
    // And the failing read has really been answered (no fixed wait: under
    // load a fixed wait could end before the failure, and the test would
    // then pass against a helper that stops at the first failure)
    await vi.waitFor(() => expect(failing.errors).toBe(1))
    // One more turn, so a helper that stops at the first failure has had
    // the chance to resolve
    await new Promise((r) => setTimeout(r, 0))

    // Then the call has NOT resolved: the slow read is still open
    expect(done).toBe(false)

    // And it resolves once the slow read lands, with its new value
    hold.release('SlowAfterWrite')
    await call
    expect(done).toBe(true)
    expect(client.readQuery({ query: SLOW })).toEqual({ slow: 2 })
  })

  it('does not reject when every read fails', async () => {
    const { client, hold } = makeClient()
    watch(client, FAILS)
    watch(client, SLOW)
    await vi.waitFor(() =>
      expect(client.readQuery({ query: SLOW })).toEqual({ slow: 1 }),
    )
    failNext = true
    hold.hold('SlowAfterWrite')
    const call = refetchAfterWrite(client, [FAILS, SLOW])
    await vi.waitFor(() => expect(hold.waiting('SlowAfterWrite')).toBe(1))
    hold.fail('SlowAfterWrite')
    await expect(call).resolves.toBeUndefined()
  })
})

// Households H6, task J.5: a purge changes every list on screen, the way the
// household-level `LOCATION` event does for other tabs. So the purge hooks
// pass `'active'`: every mounted query is read again, with the same rules.
describe("refetchAfterWrite — 'active'", () => {
  it('reads every mounted query again, and waits for a slow one when another fails', async () => {
    const { client, hold } = makeClient()
    const failing = watch(client, FAILS)
    watch(client, SLOW)
    await vi.waitFor(() => {
      expect(client.readQuery({ query: FAILS })).toEqual({ fails: 1 })
      expect(client.readQuery({ query: SLOW })).toEqual({ slow: 1 })
    })
    failNext = true
    slowValue = 2
    hold.hold('SlowAfterWrite')

    let done = false
    const call = refetchAfterWrite(client, 'active').then(() => {
      done = true
    })
    await vi.waitFor(() => expect(hold.waiting('SlowAfterWrite')).toBe(1))
    await vi.waitFor(() => expect(failing.errors).toBe(1))
    await new Promise((r) => setTimeout(r, 0))
    expect(done).toBe(false)

    hold.release('SlowAfterWrite')
    await call
    expect(client.readQuery({ query: SLOW })).toEqual({ slow: 2 })
  })

  it('does not reject when every read fails', async () => {
    const { client, hold } = makeClient()
    watch(client, FAILS)
    watch(client, SLOW)
    await vi.waitFor(() =>
      expect(client.readQuery({ query: SLOW })).toEqual({ slow: 1 }),
    )
    failNext = true
    hold.hold('SlowAfterWrite')
    const call = refetchAfterWrite(client, 'active')
    await vi.waitFor(() => expect(hold.waiting('SlowAfterWrite')).toBe(1))
    hold.fail('SlowAfterWrite')
    await expect(call).resolves.toBeUndefined()
  })
})
