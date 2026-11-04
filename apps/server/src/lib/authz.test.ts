import { GraphQLError } from 'graphql'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Context } from '../context.js'

interface OwnedRow {
  id: string
  userId: string
}

// Two kinds of double in one mocked `prisma`:
//
// - `user`, `household`, `householdMember`, `location`, `locationMember` and
//   `$transaction` are the stateful doubles joined in
//   src/test/householdWorld.ts. The role helpers read them.
// - `tag` and `item` are small stores for `requireOwnRowOrUnclaimed`, with a
//   `lookups` counter.
const { state, client } = vi.hoisted(() => {
  const state = {
    tags: [] as OwnedRow[],
    items: [] as OwnedRow[],
    // Counts every read the tag and item stores serve, so "refused before any
    // lookup" can be asserted as a fact rather than inferred from the error
    // message.
    lookups: 0,
  }

  // Filters only on keys actually present in `where`, exactly as real Prisma
  // does. Hardcoding a userId comparison here would leave the "delete userId
  // from the where clause" mutation check meaningless: the store would refuse
  // another user's row even when the resolver stopped asking it to.
  const matches = (row: OwnedRow, where: { id?: string; userId?: string }) =>
    (where.id === undefined || row.id === where.id) &&
    (where.userId === undefined || row.userId === where.userId)

  const ownedStore = (rows: () => OwnedRow[]) => ({
    findUnique: async ({ where }: { where: { id?: string; userId?: string } }) => {
      state.lookups += 1
      return rows().find((row) => matches(row, where)) ?? null
    },
    findFirst: async ({ where }: { where: { id?: string; userId?: string } }) => {
      state.lookups += 1
      return rows().find((row) => matches(row, where)) ?? null
    },
  })

  const client = {
    tag: ownedStore(() => state.tags),
    item: ownedStore(() => state.items),
  }
  return { state, client }
})

vi.mock('./prisma.js', async () => {
  const { createHouseholdWorld } = await import('../test/householdWorld.js')
  const world = createHouseholdWorld()
  return { prisma: { ...world.client, ...client, $world: world } }
})

import { prisma } from './prisma.js'
import type { HouseholdWorld } from '../test/householdWorld.js'
import type { HouseholdRole, LocationRole } from './authz.js'

const {
  fallbackImportLocation,
  requireHousehold,
  requireHouseholdRole,
  requireLocationRole,
  requireOwnRowOrUnclaimed,
} = await import('./authz.js')

const world = (prisma as unknown as { $world: HouseholdWorld }).$world

const T = new Date('2026-11-01T00:00:00.000Z')

// ── The three-person fixture (plan H3a rule 10) ──
//
// | Person   | Household | Household role      | Location roles                    |
// |----------|-----------|---------------------|-----------------------------------|
// | caller   | hh-1      | set by each test    | loc-1: set by each test           |
// | other    | hh-1      | manager             | loc-1 and loc-2: organizer        |
// | stranger | hh-2      | owner               | loc-s: organizer                  |
//
// - `other` has a DIFFERENT role from the caller, so a check that ignores
//   the role, or reads the wrong person's row, gives a different answer.
// - `loc-2` is in the caller's own household, but the caller has no role on
//   it.
// - `other` keeps hh-1 non-empty when a test takes the caller's household
//   row away. Prisma's `some` is true when ANY member row passes, so with the
//   caller alone in hh-1 a check that forgot `userId` inside `some` would give
//   the same answer as a correct one (plan H3a task 3.5 note (d)).
function seed(options: {
  callerHouseholdRole?: HouseholdRole | null
  callerLocationRole?: LocationRole | null
}) {
  const { callerHouseholdRole = 'owner', callerLocationRole = 'organizer' } = options
  world.reset()
  world.stock.reset(
    [
      { id: 'loc-1', userId: 'caller', isDefault: true, householdId: 'hh-1', name: 'Kitchen', order: 1 },
      { id: 'loc-2', userId: 'other', isDefault: false, householdId: 'hh-1', name: 'Garage', order: 0 },
      { id: 'loc-s', userId: 'stranger', isDefault: true, householdId: 'hh-2', name: 'Theirs', order: 0 },
    ],
    [],
  )
  const household = (id: string, ownerId: string) => ({
    id,
    name: `${id} name`,
    ownerId,
    ownerGoneAt: null,
    createdAt: T,
    updatedAt: T,
  })
  world.seedHouseholds({
    households: [household('hh-1', 'caller'), household('hh-2', 'stranger')],
    householdMembers: [
      ...(callerHouseholdRole
        ? [{ householdId: 'hh-1', userId: 'caller', role: callerHouseholdRole, joinedAt: T }]
        : []),
      { householdId: 'hh-1', userId: 'other', role: 'manager' as const, joinedAt: T },
      { householdId: 'hh-2', userId: 'stranger', role: 'owner' as const, joinedAt: T },
    ],
    locationMembers: [
      ...(callerLocationRole
        ? [{ locationId: 'loc-1', userId: 'caller', role: callerLocationRole, createdAt: T }]
        : []),
      { locationId: 'loc-1', userId: 'other', role: 'organizer' as const, createdAt: T },
      { locationId: 'loc-2', userId: 'other', role: 'organizer' as const, createdAt: T },
      { locationId: 'loc-s', userId: 'stranger', role: 'organizer' as const, createdAt: T },
    ],
  })
}

const caller: Context = { userId: 'caller' }

// The spies below count reads. Restored after every test, so a test that
// fails before its end cannot leave a spy counting into the next one.
afterEach(() => {
  vi.restoreAllMocks()
})

describe('requireLocationRole', () => {
  // Every pair of (role held, role asked for). `organizer` > `participant` >
  // `viewer`.
  it.each([
    ['organizer', 'organizer', true],
    ['organizer', 'participant', true],
    ['organizer', 'viewer', true],
    ['participant', 'organizer', false],
    ['participant', 'participant', true],
    ['participant', 'viewer', true],
    ['viewer', 'organizer', false],
    ['viewer', 'participant', false],
    ['viewer', 'viewer', true],
  ] as const)('a %s asking for %s passes: %s', async (held, asked, passes) => {
    // Given the caller holds `held` on loc-1, and `other` organizes it
    seed({ callerLocationRole: held })

    // When the caller asks for `asked`
    const result = requireLocationRole(caller, 'loc-1', asked)

    // Then it passes only when the held role is at least the asked one
    if (passes) {
      await expect(result).resolves.toEqual({ id: 'loc-1', role: held })
    } else {
      await expect(result).rejects.toThrow(/Forbidden/)
    }
  })

  it('location viewer cannot write stock', async () => {
    // Given the caller is a viewer on loc-1, while `other` organizes it
    seed({ callerLocationRole: 'viewer' })

    // When a write asks for participant
    // Then it is refused
    await expect(requireLocationRole(caller, 'loc-1', 'participant')).rejects.toThrow(
      /Forbidden/,
    )
  })

  it('household owner with no role on a location is refused there', async () => {
    // Given the caller OWNS hh-1, and loc-2 is in hh-1, but the caller has no
    // location role on loc-2 (design, *Rules that cross the two levels*)
    seed({ callerHouseholdRole: 'owner' })

    // When the caller asks for the lowest role on loc-2
    // Then it is refused: a household role is not a location role
    await expect(requireLocationRole(caller, 'loc-2', 'viewer')).rejects.toThrow(/Forbidden/)
  })

  it("user cannot act in another household's location", async () => {
    seed({})
    await expect(requireLocationRole(caller, 'loc-s', 'viewer')).rejects.toThrow(/Forbidden/)
  })

  it('user cannot act in a location that does not exist', async () => {
    seed({})
    await expect(requireLocationRole(caller, 'loc-missing', 'viewer')).rejects.toThrow(
      /Forbidden/,
    )
  })

  it('a location role stops counting when the person is no longer in the household', async () => {
    // Given the caller still has an organizer row on loc-1, but no household
    // row in hh-1 any more. `other` is still in hh-1, so hh-1 has members
    // (decision H18, and note (d) in the fixture comment above).
    seed({ callerHouseholdRole: null, callerLocationRole: 'organizer' })

    // When the caller asks for the lowest role
    // Then the left-behind location row does not count
    await expect(requireLocationRole(caller, 'loc-1', 'viewer')).rejects.toThrow(/Forbidden/)
  })

  it('every refusal is the same FORBIDDEN error', async () => {
    seed({ callerLocationRole: 'viewer' })
    const errors = await Promise.all([
      requireLocationRole(caller, 'loc-1', 'organizer').catch((e: GraphQLError) => e),
      requireLocationRole(caller, 'loc-2', 'viewer').catch((e: GraphQLError) => e),
      requireLocationRole(caller, 'loc-s', 'viewer').catch((e: GraphQLError) => e),
      requireLocationRole(caller, 'loc-missing', 'viewer').catch((e: GraphQLError) => e),
    ])
    for (const error of errors) {
      expect(error).toBeInstanceOf(GraphQLError)
      expect((error as GraphQLError).message).toBe('Forbidden')
      expect((error as GraphQLError).extensions.code).toBe('FORBIDDEN')
    }
  })

  it('an unauthenticated caller is rejected before any lookup', async () => {
    seed({})
    const findFirst = vi.spyOn(world.households.client.locationMember, 'findFirst')
    await expect(requireLocationRole({ userId: null }, 'loc-1', 'viewer')).rejects.toThrow(
      /Unauthorized/,
    )
    expect(findFirst).not.toHaveBeenCalled()
  })
})

describe('requireHouseholdRole', () => {
  // `owner` > `manager` > `member`.
  it.each([
    ['owner', 'owner', true],
    ['owner', 'manager', true],
    ['owner', 'member', true],
    ['manager', 'owner', false],
    ['manager', 'manager', true],
    ['manager', 'member', true],
    ['member', 'owner', false],
    ['member', 'manager', false],
    ['member', 'member', true],
  ] as const)('a household %s asking for %s passes: %s', async (held, asked, passes) => {
    // Given the caller holds `held` in hh-1, and `other` is a manager there.
    // The owner seat is taken by the caller only when `held` is owner; the
    // fixture's hh-1 has no other owner row.
    seed({ callerHouseholdRole: held })

    const result = requireHouseholdRole(caller, 'hh-1', asked)

    if (passes) {
      await expect(result).resolves.toBe(held)
    } else {
      await expect(result).rejects.toThrow(/Forbidden/)
    }
  })

  it('household member cannot pass a manager check', async () => {
    seed({ callerHouseholdRole: 'member' })
    await expect(requireHouseholdRole(caller, 'hh-1', 'manager')).rejects.toThrow(/Forbidden/)
  })

  it("user who is not in a household gets the same refusal as a missing role", async () => {
    // Given the stranger's household, which the caller is not in
    seed({})

    const error = await requireHouseholdRole(caller, 'hh-2', 'member').catch(
      (e: GraphQLError) => e,
    )

    // Then it is the same FORBIDDEN as requireLocationRole's
    expect(error).toBeInstanceOf(GraphQLError)
    expect((error as GraphQLError).message).toBe('Forbidden')
    expect((error as GraphQLError).extensions.code).toBe('FORBIDDEN')
  })
})

describe('requireHousehold', () => {
  it("returns the caller's household", async () => {
    seed({ callerHouseholdRole: 'member' })
    await expect(requireHousehold({ userId: 'caller' })).resolves.toBe('hh-1')
    await expect(requireHousehold({ userId: 'stranger' })).resolves.toBe('hh-2')
  })

  it('reads the household once per request when the request has a cache', async () => {
    // Given one request context with its own cache
    seed({})
    const findFirst = vi.spyOn(world.households.client.householdMember, 'findFirst')
    const ctx: Context = { userId: 'caller', requestCache: {} }

    // When three resolvers in that request ask at once, and one more later
    const ids = await Promise.all([
      requireHousehold(ctx),
      requireHousehold(ctx),
      requireHousehold(ctx),
    ])
    ids.push(await requireHousehold(ctx))

    // Then all four get the household from one lookup
    expect(ids).toEqual(['hh-1', 'hh-1', 'hh-1', 'hh-1'])
    expect(findFirst).toHaveBeenCalledTimes(1)
  })

  it('a context with no cache looks the household up every time', async () => {
    seed({})
    const findFirst = vi.spyOn(world.households.client.householdMember, 'findFirst')
    const ctx: Context = { userId: 'caller' }

    await requireHousehold(ctx)
    await requireHousehold(ctx)

    expect(findFirst).toHaveBeenCalledTimes(2)
  })

  it('user signing in for the first time gets a household named in their app language', async () => {
    // Given a new User row with no household
    world.reset()
    world.users.reset([
      {
        id: 'new-user',
        displayName: '小明',
        email: null,
        lastSeenAt: null,
        deletedAt: null,
        householdSetupAt: null,
        createdAt: T,
        updatedAt: T,
      },
    ])

    // When their first request arrives with x-app-language tw
    const householdId = await requireHousehold({ userId: 'new-user', language: 'tw' })

    // Then a household was made for them, with the tw name
    expect(world.households.state.households).toEqual([
      expect.objectContaining({ id: householdId, name: '小明的家' }),
    ])
  })
})

describe('fallbackImportLocation', () => {
  it('picks the first location by order on which the caller may write', async () => {
    // Given loc-2 comes first by order, but the caller has no role on it, and
    // the caller is a participant on loc-1
    seed({ callerLocationRole: 'participant' })

    // Then loc-1 is picked
    await expect(fallbackImportLocation(caller)).resolves.toBe('loc-1')
  })

  it('picks the lower order when the caller may write to both', async () => {
    // Given the caller is also an organizer on loc-2, which comes first
    seed({ callerLocationRole: 'participant' })
    await world.households.client.locationMember.create({
      data: { locationId: 'loc-2', userId: 'caller', role: 'organizer' },
    })

    await expect(fallbackImportLocation(caller)).resolves.toBe('loc-2')
  })

  it('skips a location where the caller is only a viewer', async () => {
    // Given the caller views loc-1 and has no other role
    seed({ callerLocationRole: 'viewer' })

    // Then there is nowhere to import into
    const error = await fallbackImportLocation(caller).catch((e: GraphQLError) => e)
    expect((error as GraphQLError).extensions.code).toBe('NO_LOCATION')
  })

  it('skips a location whose household the caller has left', async () => {
    // Given the caller left hh-1 but kept the organizer row on loc-1, and
    // has a new household of their own with no location
    seed({ callerHouseholdRole: null, callerLocationRole: 'organizer' })
    await world.households.client.household.create({
      data: { id: 'hh-new', name: 'New', ownerId: 'caller' },
    })
    await world.households.client.householdMember.create({
      data: { householdId: 'hh-new', userId: 'caller', role: 'owner' },
    })

    const error = await fallbackImportLocation(caller).catch((e: GraphQLError) => e)
    expect((error as GraphQLError).extensions.code).toBe('NO_LOCATION')
  })

  it('user importing for the first time gets Home and the import goes there', async () => {
    // Given a new person with no household
    world.reset()
    world.users.reset([
      {
        id: 'new-user',
        displayName: 'Ann',
        email: null,
        lastSeenAt: null,
        deletedAt: null,
        householdSetupAt: null,
        createdAt: T,
        updatedAt: T,
      },
    ])

    // When an import needs a fallback location
    const locationId = await fallbackImportLocation({ userId: 'new-user' })

    // Then it is the new "Home"
    expect(world.stock.state.locations).toEqual([
      expect.objectContaining({ id: locationId, name: 'Home' }),
    ])
  })
})


describe('requireOwnRowOrUnclaimed', () => {
  beforeEach(() => {
    // Two users, on purpose. A single-user fixture cannot tell a query scoped
    // by userId from an unscoped one — see plan rule 4.
    state.tags = [
      { id: 'tag-mine', userId: 'user-a' },
      { id: 'tag-theirs', userId: 'user-b' },
    ]
    state.items = [
      { id: 'item-mine', userId: 'user-a' },
      { id: 'item-theirs', userId: 'user-b' },
    ]
    state.lookups = 0
  })

  it('user can import under an id their own row already holds', async () => {
    // Given a caller authenticated as user-a and a tag owned by user-a
    const ctx = { userId: 'user-a' }

    // When the guard is asked about that id
    const verdict = await requireOwnRowOrUnclaimed(ctx, 'tag', 'tag-mine')

    // Then the call site is told the row is the caller's, so it may replace it
    expect(verdict).toBe('own')
  })

  it('user can import under an id no row holds', async () => {
    // Given an id held by no row in any account
    const ctx = { userId: 'user-a' }

    // When the guard is asked about it
    const verdict = await requireOwnRowOrUnclaimed(ctx, 'tag', 'tag-free')

    // Then the call site is told it is free, so it may create it
    expect(verdict).toBe('unclaimed')
  })

  it("user cannot import under another account's row id", async () => {
    // Given a caller authenticated as user-a and a tag owned by user-b
    const ctx = { userId: 'user-a' }

    // When the guard is asked about user-b's id
    // Then it throws, so no call site can carry on and overwrite that row
    await expect(requireOwnRowOrUnclaimed(ctx, 'tag', 'tag-theirs')).rejects.toThrow(/Forbidden/)
  })

  it("user sees the same refusal for another account's row as for a missing location", async () => {
    // NEGATIVE CONTROL. This test compares two string literals and passes
    // whatever the scoping does, so it is not evidence that the guard works.
    // It is here to pin the wording: both seams must refuse with the same
    // message and the same code, or a client can tell them apart.
    //
    // Note what it does NOT compare. `requireOwnRowOrUnclaimed` returns
    // 'unclaimed' for an id no row holds — it does not refuse it — so this
    // helper has no missing-id refusal of its own to compare against. The
    // nearest one is `requireLocationRole`'s, which does refuse a missing id.
    const ctx = { userId: 'user-a' }

    const refusals: GraphQLError[] = []
    await requireOwnRowOrUnclaimed(ctx, 'tag', 'tag-theirs').catch((e) => refusals.push(e))
    await requireLocationRole(ctx, 'loc-missing', 'viewer').catch((e) => refusals.push(e))

    expect(refusals).toHaveLength(2)
    expect(refusals[0].message).toBe('Forbidden')
    expect(refusals[1].message).toBe('Forbidden')
    expect(refusals[0].extensions.code).toBe('FORBIDDEN')
    expect(refusals[1].extensions.code).toBe('FORBIDDEN')
  })

  it('user who is not signed in is refused before any lookup', async () => {
    // Given no authenticated user
    // When the guard is called
    // Then it refuses as Unauthorized
    await expect(requireOwnRowOrUnclaimed({ userId: null }, 'tag', 'tag-mine')).rejects.toThrow(
      /Unauthorized/,
    )

    // And no store was read at all, so an unauthenticated caller cannot use
    // the guard to probe which row ids are taken
    expect(state.lookups).toBe(0)
  })

  it('user importing an item is checked against the item model, not tag', async () => {
    // Given an id held only in the tag store, by the caller's own tag
    const ctx = { userId: 'user-a' }

    // When the guard is asked about that id for the ITEM model
    const verdict = await requireOwnRowOrUnclaimed(ctx, 'item', 'tag-mine')

    // Then no item holds it, so it is unclaimed. A delegateFor that ignored
    // the model and always returned prisma.tag would answer 'own' here.
    expect(verdict).toBe('unclaimed')
  })
})
