import { beforeEach, describe, expect, it, vi } from 'vitest'

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
    // And one location, "Home", first in order, in that household, written
    // with both scope columns until task 3.14 (decision H16)
    expect(world.stock.state.locations).toEqual([
      expect.objectContaining({
        name: 'Home',
        order: 0,
        householdId,
        userId: 'user-et',
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
