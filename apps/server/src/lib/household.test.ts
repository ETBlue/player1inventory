import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// `ensureHousehold` writes through `prisma.user`, `household`,
// `householdMember`, `location`, `locationMember` and `$transaction`. Here
// they are the stateful doubles joined in src/test/householdWorld.ts, so the
// rows each call leaves behind can be read back.
vi.mock('./prisma.js', async () => {
  const { createHouseholdWorld } = await import('../test/householdWorld.js')
  const world = createHouseholdWorld()
  return { prisma: { ...world.client, $world: world } }
})

import { GraphQLError } from 'graphql'
import { prisma } from './prisma.js'
import type { HouseholdWorld } from '../test/householdWorld.js'
import type { UserRow } from '../test/userFake.js'
import { ensureHousehold, firstSignInNames } from './household.js'

const world = (prisma as unknown as { $world: HouseholdWorld }).$world

const NOW = new Date('2026-11-04T08:00:00.000Z')
const EARLIER = new Date('2026-11-01T08:00:00.000Z')

function userRow(over: Partial<UserRow> & Pick<UserRow, 'id'>): UserRow {
  return {
    displayName: 'ET',
    email: null,
    lastSeenAt: null,
    deletedAt: null,
    householdSetupAt: null,
    activeHouseholdId: null,
    createdAt: EARLIER,
    updatedAt: EARLIER,
    ...over,
  }
}

beforeEach(() => {
  world.reset()
})

describe('ensureHousehold — a new user', () => {
  it('user gets a household, an owner row, a Home location and an organizer row on first sign-in', async () => {
    // Given a User row that was never set up
    world.users.reset([userRow({ id: 'user-et', displayName: 'ET' })])

    // When the first request needs the household
    const householdId = await ensureHousehold('user-et', 'en', NOW)

    // Then one household exists, named after the person
    expect(world.households.state.households).toHaveLength(1)
    const household = world.households.state.households[0]
    expect(household?.id).toBe(householdId)
    expect(household?.name).toBe("ET's Household")
    // And BOTH the owner column and the owner row say who owns it (decision
    // H15). The fake does not tie them together, so both are asserted.
    expect(household?.ownerId).toBe('user-et')
    expect(world.households.state.householdMembers).toEqual([
      expect.objectContaining({ householdId, userId: 'user-et', role: 'owner' }),
    ])
    // And one location, "Home", first in order, in that household. The fake
    // refuses a `userId` or an `isDefault` in the write (columns dropped in
    // task 3.14).
    expect(world.stock.state.locations).toEqual([
      expect.objectContaining({
        name: 'Home',
        order: 0,
        householdId,
      }),
    ])
    // And the person organizes it
    const locationId = world.stock.state.locations[0]?.id
    expect(world.households.state.locationMembers).toEqual([
      expect.objectContaining({ locationId, userId: 'user-et', role: 'organizer' }),
    ])
    // And the claim is set, so no later request makes a second household
    expect(world.users.state.rows[0]?.householdSetupAt).toEqual(NOW)
  })

  it('user who is already set up gets their household back and nothing new is made', async () => {
    // Given a person with a household and a location
    world.users.reset([userRow({ id: 'user-et', householdSetupAt: EARLIER })])
    world.seedHouseholds({
      households: [
        {
          id: 'hh-et',
          name: "ET's Household",
          ownerId: 'user-et',
          ownerGoneAt: null,
          createdAt: EARLIER,
          updatedAt: EARLIER,
        },
      ],
      householdMembers: [
        { householdId: 'hh-et', userId: 'user-et', role: 'owner', joinedAt: EARLIER },
      ],
    })

    // When a request needs the household
    const householdId = await ensureHousehold('user-et', 'en', NOW)

    // Then it is the existing one, and nothing was added or changed
    expect(householdId).toBe('hh-et')
    expect(world.households.state.households).toHaveLength(1)
    expect(world.households.state.householdMembers).toHaveLength(1)
    expect(world.stock.state.locations).toHaveLength(0)
    expect(world.users.state.rows[0]?.householdSetupAt).toEqual(EARLIER)
  })

  it('ten parallel first requests for one new user make one household', async () => {
    // Given a new user, and transactions that run one at a time, as the
    // `User` row lock makes them in Postgres. The fake has no row lock, so
    // without the queue it would report a race the database never has
    // (src/test/householdWorld.ts). The real race is proved in
    // scripts/verify-migration.ts.
    world.users.reset([userRow({ id: 'user-et' })])
    world.serialTransactions(true)

    // When ten requests ask at the same moment
    const results = await Promise.all(
      Array.from({ length: 10 }, () => ensureHousehold('user-et', 'en', NOW)),
    )

    // Then all ten get the same household, and there is exactly one of each row
    expect(new Set(results).size).toBe(1)
    expect(world.households.state.households).toHaveLength(1)
    expect(world.households.state.householdMembers).toHaveLength(1)
    expect(world.stock.state.locations).toHaveLength(1)
    expect(world.households.state.locationMembers).toHaveLength(1)
  })
})

describe('ensureHousehold — a user who is set up but in no household', () => {
  it('throws NO_HOUSEHOLD and creates nothing', async () => {
    // Given a person whose claim is set but who has no membership. This is
    // "left their household" (H5). It must not make a second household.
    world.users.reset([userRow({ id: 'user-left', householdSetupAt: EARLIER })])

    // When a request needs the household
    const error = await ensureHousehold('user-left', 'en', NOW).catch((e: unknown) => e)

    // Then it is refused with NO_HOUSEHOLD
    expect(error).toBeInstanceOf(GraphQLError)
    expect((error as GraphQLError).extensions.code).toBe('NO_HOUSEHOLD')
    // And no row was made, and the claim did not move
    expect(world.households.state.households).toHaveLength(0)
    expect(world.households.state.householdMembers).toHaveLength(0)
    expect(world.stock.state.locations).toHaveLength(0)
    expect(world.users.state.rows[0]?.householdSetupAt).toEqual(EARLIER)
  })

  it('a person whose only member row was deleted gets NO_HOUSEHOLD, not a missing-row error', async () => {
    // Given B1 is a member of hh-1, with no User row seeded (the world
    // implies one, as the foreign key does in Postgres)
    world.seedHouseholds({
      households: [
        { id: 'hh-1', name: 'One', ownerId: 'user-a', ownerGoneAt: null, createdAt: EARLIER, updatedAt: EARLIER },
      ],
      householdMembers: [
        { householdId: 'hh-1', userId: 'user-a', role: 'owner', joinedAt: EARLIER },
        { householdId: 'hh-1', userId: 'user-b1', role: 'member', joinedAt: EARLIER },
      ],
    })
    await expect(ensureHousehold('user-b1', 'en', NOW)).resolves.toBe('hh-1')

    // When B1 is removed: the member row goes, the User row stays (T16)
    world.households.state.householdMembers = world.households.state.householdMembers.filter(
      (m) => m.userId !== 'user-b1',
    )

    // Then B1 is in no household
    const error = await ensureHousehold('user-b1', 'en', NOW).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(GraphQLError)
    expect((error as GraphQLError).extensions.code).toBe('NO_HOUSEHOLD')
    // And no household was made for them
    expect(world.households.state.households).toHaveLength(1)
  })

  it('throws a plain error, not NO_HOUSEHOLD, when there is no User row at all', async () => {
    // Given no User row (ensureUserOrLog failed earlier in the request)
    // When a request needs the household
    const error = await ensureHousehold('user-ghost', 'en', NOW).catch((e: unknown) => e)

    // Then it fails, and does not claim the person left a household
    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(GraphQLError)
    expect(world.households.state.households).toHaveLength(0)
  })
})

describe('ensureHousehold — which household, for a person in several (decision T14)', () => {
  // P is in three households: hh-1 (joined first), hh-2 and hh-4 (joined
  // last). Q is a second person, with rows of their own that must never
  // change P's answer (design, *Testing notes*).
  //
  // The store order of P's rows is hh-2, hh-1, hh-4, and it differs from the
  // `joinedAt` order on purpose:
  // - A read with no `orderBy` (the old `findFirst`) returns the first stored
  //   row, hh-2. So a test that expects hh-1 (the oldest) fails when the
  //   order is dropped.
  // - The active-household tests use hh-4, which is neither the first stored
  //   row nor the oldest. So they fail when the code ignores
  //   `activeHouseholdId`, with or without the order.
  const JOINED_1 = new Date('2026-11-02T08:00:00.000Z')
  const JOINED_2 = new Date('2026-11-03T08:00:00.000Z')
  const JOINED_4 = new Date('2026-11-04T07:00:00.000Z')

  function household(id: string, ownerId: string) {
    return { id, name: id, ownerId, ownerGoneAt: null, createdAt: EARLIER, updatedAt: EARLIER }
  }

  function seedHouseholdsOfPAndQ() {
    world.seedHouseholds({
      households: [
        household('hh-1', 'user-p'),
        household('hh-2', 'user-q'),
        household('hh-3', 'user-q'),
        household('hh-0', 'user-q'),
        household('hh-4', 'user-q'),
      ],
      householdMembers: [
        // Q, oldest of all, with the smallest id. Q is not P.
        { householdId: 'hh-0', userId: 'user-q', role: 'owner', joinedAt: EARLIER },
        { householdId: 'hh-2', userId: 'user-p', role: 'member', joinedAt: JOINED_2 },
        { householdId: 'hh-1', userId: 'user-p', role: 'owner', joinedAt: JOINED_1 },
        { householdId: 'hh-3', userId: 'user-q', role: 'owner', joinedAt: JOINED_1 },
        { householdId: 'hh-4', userId: 'user-p', role: 'member', joinedAt: JOINED_4 },
      ],
    })
  }

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function seedUsers(activeOfP: string | null) {
    world.users.reset([
      userRow({ id: 'user-p', householdSetupAt: EARLIER, activeHouseholdId: activeOfP }),
      // Q's active household is hh-0, where P is not a member.
      userRow({ id: 'user-q', householdSetupAt: EARLIER, activeHouseholdId: 'hh-0' }),
    ])
  }

  it('a person in several households gets the active one', async () => {
    seedHouseholdsOfPAndQ()
    seedUsers('hh-4')

    await expect(ensureHousehold('user-p', 'en', NOW)).resolves.toBe('hh-4')
  })

  it('a person whose active household they left gets the oldest membership', async () => {
    // Given P's active household is hh-3, where P has no member row (left it)
    seedHouseholdsOfPAndQ()
    seedUsers('hh-3')

    // Then P gets hh-1, the oldest membership, not hh-3
    await expect(ensureHousehold('user-p', 'en', NOW)).resolves.toBe('hh-1')
  })

  it('a person with no active household gets the oldest membership', async () => {
    seedHouseholdsOfPAndQ()
    seedUsers(null)

    await expect(ensureHousehold('user-p', 'en', NOW)).resolves.toBe('hh-1')
  })

  it('two memberships with the same joinedAt are ordered by householdId', async () => {
    // Given two memberships that joined at the same moment, the larger id
    // stored first
    world.seedHouseholds({
      households: [household('hh-a', 'user-p'), household('hh-b', 'user-q')],
      householdMembers: [
        { householdId: 'hh-b', userId: 'user-p', role: 'member', joinedAt: JOINED_1 },
        { householdId: 'hh-a', userId: 'user-p', role: 'owner', joinedAt: JOINED_1 },
      ],
    })
    seedUsers(null)

    // Then the smaller id wins
    await expect(ensureHousehold('user-p', 'en', NOW)).resolves.toBe('hh-a')
  })

  it("Q's rows never change P's answer", async () => {
    // Given Q is the oldest member of anything, with the smallest id, and Q's
    // active household is hh-0. P has no active household.
    seedHouseholdsOfPAndQ()
    seedUsers(null)

    // Then P still gets P's own oldest membership
    await expect(ensureHousehold('user-p', 'en', NOW)).resolves.toBe('hh-1')
    // And Q gets Q's active one
    await expect(ensureHousehold('user-q', 'en', NOW)).resolves.toBe('hh-0')
  })

  it('the common path costs one query', async () => {
    seedHouseholdsOfPAndQ()
    seedUsers('hh-4')
    const findUnique = vi.spyOn(prisma.user, 'findUnique')
    const findFirst = vi.spyOn(prisma.householdMember, 'findFirst')
    const transaction = vi.spyOn(prisma, '$transaction')

    await expect(ensureHousehold('user-p', 'en', NOW)).resolves.toBe('hh-4')

    expect(findUnique).toHaveBeenCalledTimes(1)
    expect(findFirst).not.toHaveBeenCalled()
    expect(transaction).not.toHaveBeenCalled()
  })

  it('the count === 0 branch uses the same rule', async () => {
    // Given P's claim is already set, and P has no membership when the first
    // read runs. The memberships are added right after that read, as if
    // another request committed them in between.
    world.users.reset([
      userRow({ id: 'user-p', householdSetupAt: EARLIER, activeHouseholdId: 'hh-4' }),
      userRow({ id: 'user-q', householdSetupAt: EARLIER, activeHouseholdId: 'hh-0' }),
    ])
    // `world.users.client` is the same object as `prisma.user` here, typed as
    // the fake, so the stand-in below needs no cast.
    const read = world.users.client.findUnique.bind(world.users.client)
    vi.spyOn(world.users.client, 'findUnique').mockImplementationOnce(async (args) => {
      const before = await read(args)
      seedHouseholdsOfPAndQ()
      return before
    })

    // When a request needs the household
    const householdId = await ensureHousehold('user-p', 'en', NOW)

    // Then the transaction's read applies the same rule: the active one,
    // not the first stored row and not the oldest
    expect(householdId).toBe('hh-4')
    // And nothing new was made
    expect(world.households.state.households).toHaveLength(5)
    expect(world.stock.state.locations).toHaveLength(0)
  })
})

describe('ensureHousehold — names in the app language', () => {
  it('names a tw household and its location in Traditional Chinese', async () => {
    // Given a new user whose app is in Traditional Chinese
    world.users.reset([userRow({ id: 'user-tw', displayName: '小明' })])

    // When the first request arrives with language tw
    await ensureHousehold('user-tw', 'tw', NOW)

    // Then both names are the tw ones
    expect(world.households.state.households[0]?.name).toBe('小明的家')
    expect(world.stock.state.locations[0]?.name).toBe('住家')
  })

  it('uses the User display name in the English household name', () => {
    expect(firstSignInNames('en', 'ET Blue')).toEqual({
      household: "ET Blue's Household",
      location: 'Home',
    })
  })
})

describe('firstSignInNames — the 100 code unit cap', () => {
  // `renameHousehold` refuses a name over 100 UTF-16 code units. A longer
  // first name would be one the owner cannot save again unchanged.
  // "'s Household" is 12 code units, so 88 are left for the display name.
  // "的家" is 2, so 98 are left.

  /** True when the text holds half of a surrogate pair on its own. */
  function hasLoneSurrogate(text: string): boolean {
    return /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(text)
  }

  it('keeps a display name that fits exactly', () => {
    const name = 'a'.repeat(88)
    const { household } = firstSignInNames('en', name)
    expect(household).toBe(`${name}'s Household`)
    expect(household).toHaveLength(100)
  })

  it('shortens a long English display name and keeps the suffix', () => {
    const { household } = firstSignInNames('en', 'a'.repeat(300))
    expect(household).toBe(`${'a'.repeat(88)}'s Household`)
    expect(household).toHaveLength(100)
  })

  it('shortens a long tw display name and keeps the suffix', () => {
    const { household } = firstSignInNames('tw', '明'.repeat(300))
    expect(household).toBe(`${'明'.repeat(98)}的家`)
    expect(household).toHaveLength(100)
  })

  it('drops an emoji at the cut whole, and does not split it', () => {
    // Given an emoji (2 code units) at code units 87 and 88: the cut at 88
    // falls between its two halves
    const name = `${'a'.repeat(87)}😀${'b'.repeat(20)}`

    const { household } = firstSignInNames('en', name)

    // Then the emoji is gone whole, and no half of it is left
    expect(household).toBe(`${'a'.repeat(87)}'s Household`)
    expect(household).toHaveLength(99)
    expect(hasLoneSurrogate(household)).toBe(false)
  })

  it('keeps an emoji that ends exactly at the cut', () => {
    const name = `${'a'.repeat(86)}😀${'b'.repeat(20)}`
    const { household } = firstSignInNames('en', name)
    expect(household).toBe(`${'a'.repeat(86)}😀's Household`)
    expect(household).toHaveLength(100)
  })

  it('removes spaces left at the end of a cut display name', () => {
    const name = `${'a'.repeat(80)}${' '.repeat(10)}tail`
    const { household } = firstSignInNames('en', name)
    expect(household).toBe(`${'a'.repeat(80)}'s Household`)
  })
})
