import { beforeEach, describe, expect, it, vi } from 'vitest'

// The stateful location fake from src/test/stockFake.ts, with every method
// wrapped in a `vi.fn()` so a test can COUNT queries. The count matters: the
// fix for issue #287 must not turn the common path — a user who already has a
// default location — into two queries.
vi.mock('./prisma.js', async () => {
  const { createStockFake } = await import('../test/stockFake.js')
  const stockFake = createStockFake()
  const location = {
    findFirst: vi.fn(stockFake.client.location.findFirst),
    findMany: vi.fn(stockFake.client.location.findMany),
    create: vi.fn(stockFake.client.location.create),
  }
  return {
    prisma: { ...stockFake.client, location, $stockFake: stockFake, $location: location },
  }
})

import { DEFAULT_LOCATION_NAME, ensureDefaultLocation } from './defaultLocation.js'
import { prisma } from './prisma.js'
import type { StockFake } from '../test/stockFake.js'

const mocked = prisma as unknown as {
  $stockFake: StockFake
  $location: {
    findFirst: ReturnType<typeof vi.fn>
    findMany: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
  }
}
const stockFake = mocked.$stockFake
const location = mocked.$location

describe('ensureDefaultLocation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stockFake.reset([], [])
  })

  it('returns the existing default and creates nothing', async () => {
    // Given the user already has two locations, the default second so that a
    // lookup taking locations[0] would return the wrong one — and a STRANGER
    // whose own location is also flagged isDefault, so "the caller's default"
    // is distinguishable from "the first default row in the table"
    stockFake.reset(
      [
        { id: 'loc_garage', userId: 'user_a', isDefault: false },
        { id: 'loc_home', userId: 'user_a', isDefault: true },
        { id: 'loc_theirs', userId: 'user_b', isDefault: true },
      ],
      [],
    )

    // When the default is resolved
    const id = await ensureDefaultLocation('user_a')

    // Then it is the caller's own default, and no row was added
    expect(id).toBe('loc_home')
    expect(location.create).not.toHaveBeenCalled()
    expect(stockFake.state.locations).toHaveLength(3)
  })

  it('costs exactly one query when the user already has a default', async () => {
    // Given a user with a default location
    stockFake.reset([{ id: 'loc_home', userId: 'user_a', isDefault: true }], [])

    // When the default is resolved
    await ensureDefaultLocation('user_a')

    // Then one findFirst ran and nothing else. `checkout` and `consumeRecipes`
    // call this on every purchase and every cook, so a second query here would
    // be paid by every user on every write.
    expect(location.findFirst).toHaveBeenCalledTimes(1)
    expect(location.findMany).not.toHaveBeenCalled()
    expect(location.create).not.toHaveBeenCalled()
  })

  it('creates the default when the user has none, and returns its id', async () => {
    // Given the caller has no location at all — a brand-new account that has
    // never run the `locations` query — while another user does have one
    stockFake.reset([{ id: 'loc_theirs', userId: 'user_b', isDefault: true }], [])

    // When the default is resolved
    const id = await ensureDefaultLocation('user_a')

    // Then a default location was created for THIS user and its id returned
    const created = stockFake.state.locations.find((l) => l.userId === 'user_a')
    expect(created).toBeDefined()
    expect(id).toBe(created?.id)
    expect(created).toMatchObject({
      userId: 'user_a',
      isDefault: true,
      name: DEFAULT_LOCATION_NAME,
      order: 0,
    })
    // And the other user's location was left alone
    expect(stockFake.state.locations).toHaveLength(2)
  })

  it('returns the winner id after losing the create race, without a duplicate', async () => {
    // Given the user DOES have a default, but the lookup loses the race and
    // sees null — exactly what the loser of two concurrent calls sees
    stockFake.reset([{ id: 'loc_home', userId: 'user_a', isDefault: true }], [])
    location.findFirst.mockImplementationOnce(async () => null)

    // When the default is resolved
    const id = await ensureDefaultLocation('user_a')

    // Then the create was rejected by the partial unique index, the re-read
    // returned the winner, and no second default row exists
    expect(location.create).toHaveBeenCalledTimes(1)
    expect(id).toBe('loc_home')
    expect(stockFake.state.locations).toHaveLength(1)
  })

  it('rethrows a create failure that is not a lost race', async () => {
    // Given the user has no location and the create fails for some other
    // reason — the database is down, say. Swallowing this is what made the
    // original bug silent, so it must reach the caller.
    location.create.mockImplementationOnce(async () => {
      throw new Error('connection refused')
    })

    // When the default is resolved
    const call = ensureDefaultLocation('user_a')

    // Then the error propagates
    await expect(call).rejects.toThrow('connection refused')
  })
})
