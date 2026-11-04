import { GraphQLError } from 'graphql'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Context } from '../context.js'

/** A row of the small stores below: a catalog row or a `cart` row. */
interface ScopedRow {
  id: string
  householdId?: string
  userId?: string
}

// Two kinds of double in one mocked `prisma`:
//
// - `user`, `household`, `householdMember`, `location`, `locationMember` and
//   `$transaction` are the stateful doubles joined in
//   src/test/householdWorld.ts. The role helpers read them.
// - `tag`, `item` and `cart` are small stores for `requireOwnRowOrUnclaimed`
//   and `requireCatalogIds`, with a `lookups` counter. `tag` and `item` are
//   catalog models, scoped by `householdId` since households H3a task 3.7.
//   `cart` is still scoped by `userId` until H3b.
const { state, client } = vi.hoisted(() => {
  const state = {
    tags: [] as ScopedRow[],
    items: [] as ScopedRow[],
    carts: [] as ScopedRow[],
    // Counts every read the stores serve, so "refused before any lookup" can
    // be asserted as a fact rather than inferred from the error message.
    lookups: 0,
  }

  type Where = { id?: string | { in: string[] }; householdId?: string; userId?: string }

  // Filters only on keys actually present in `where`, exactly as real Prisma
  // does. Hardcoding a scope comparison here would leave the "delete the
  // scope from the where clause" mutation check meaningless: the store would
  // refuse another household's row even when the code stopped asking it to.
  // Any other key THROWS, so a filter on a column a store does not have is
  // not silently ignored (the `cartItemFake` trap, root CLAUDE.md).
  const matches = (row: ScopedRow, where: Where) => {
    for (const key of Object.keys(where)) {
      if (key !== 'id' && key !== 'householdId' && key !== 'userId') {
        throw new Error(`authz.test store does not model the where key '${key}'`)
      }
    }
    const id = where.id
    const idOk =
      id === undefined || (typeof id === 'string' ? row.id === id : id.in.includes(row.id))
    return (
      idOk &&
      (where.householdId === undefined || row.householdId === where.householdId) &&
      (where.userId === undefined || row.userId === where.userId)
    )
  }

  const store = (rows: () => ScopedRow[], scope: 'householdId' | 'userId') => {
    const check = (where: Where) => {
      const other = scope === 'householdId' ? 'userId' : 'householdId'
      if (where[other] !== undefined) {
        throw new Error(`this store is scoped by ${scope}, not ${other}`)
      }
    }
    return {
      findUnique: async ({ where }: { where: Where }) => {
        state.lookups += 1
        check(where)
        return rows().find((row) => matches(row, where)) ?? null
      },
      findFirst: async ({ where }: { where: Where }) => {
        state.lookups += 1
        check(where)
        return rows().find((row) => matches(row, where)) ?? null
      },
      findMany: async ({ where }: { where: Where }) => {
        state.lookups += 1
        check(where)
        return rows()
          .filter((row) => matches(row, where))
          .map((row) => ({ id: row.id }))
      },
    }
  }

  const client = {
    tag: store(() => state.tags, 'householdId'),
    item: store(() => state.items, 'householdId'),
    cart: store(() => state.carts, 'userId'),
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
  householdOfLocation,
  locationIdsWithRole,
  requireCatalogIds,
  requireCatalogRole,
  requireHousehold,
  requireHouseholdRole,
  requireLocationItems,
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

describe('locationIdsWithRole', () => {
  it("returns the caller's own location roles only, not another person's", async () => {
    // Given the caller is a viewer on loc-1. `other` organizes loc-1 and
    // loc-2 in the same household, and `stranger` organizes loc-s in hh-2.
    seed({ callerLocationRole: 'viewer' })

    // Then only loc-1 comes back, whatever the role
    await expect(locationIdsWithRole(caller)).resolves.toEqual(['loc-1'])
  })

  it('a location role does not count once the caller has left that household (decision H18)', async () => {
    // Given the caller kept the organizer row on loc-1 but has no
    // HouseholdMember row in hh-1. `other` is still in hh-1, so a check that
    // asked only "does hh-1 have any member" would still pass.
    seed({ callerHouseholdRole: null, callerLocationRole: 'organizer' })

    await expect(locationIdsWithRole(caller)).resolves.toEqual([])
  })

  it("a role row on a location in a household the caller is not in does not count", async () => {
    // Given the caller also has an organizer row on loc-s, in hh-2, where
    // the caller is not a member
    seed({ callerLocationRole: 'organizer' })
    await world.households.client.locationMember.create({
      data: { locationId: 'loc-s', userId: 'caller', role: 'organizer' },
    })

    // Then loc-s is left out
    await expect(locationIdsWithRole(caller)).resolves.toEqual(['loc-1'])
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


// The catalog rows the next three blocks share. Three people (plan H3a rule
// 10): `caller` and `other` share hh-1, `stranger` is in hh-2. `tag-others`
// was made by `other`, so its `userId` is NOT the caller's: a check by
// `userId` refuses it, and a check by household lets it through. With only
// the caller's own rows, the two checks give the same answer.
function seedCatalog() {
  state.tags = [
    { id: 'tag-mine', householdId: 'hh-1', userId: 'caller' },
    { id: 'tag-others', householdId: 'hh-1', userId: 'other' },
    { id: 'tag-theirs', householdId: 'hh-2', userId: 'stranger' },
  ]
  state.items = [
    { id: 'item-mine', householdId: 'hh-1', userId: 'caller' },
    { id: 'item-theirs', householdId: 'hh-2', userId: 'stranger' },
  ]
  state.carts = [
    { id: 'cart-mine', userId: 'caller' },
    { id: 'cart-others', userId: 'other' },
  ]
  state.lookups = 0
}

describe('requireOwnRowOrUnclaimed', () => {
  beforeEach(() => {
    seed({ callerHouseholdRole: 'member' })
    seedCatalog()
  })

  it('user can import under an id their own row already holds', async () => {
    // When the guard is asked about the caller's own tag
    const verdict = await requireOwnRowOrUnclaimed(caller, 'tag', 'tag-mine')

    // Then the call site is told the row is the caller's, so it may replace it
    expect(verdict).toBe('own')
  })

  it("user can write a catalog row another member of their household made", async () => {
    // Given a tag `other` made in hh-1, the caller's household
    // When the guard is asked about it
    const verdict = await requireOwnRowOrUnclaimed(caller, 'tag', 'tag-others')

    // Then it is the household's, so it is "own" (households H3a task 3.7).
    // A body that still scoped by `userId` throws FORBIDDEN here.
    expect(verdict).toBe('own')
  })

  it('user can import under an id no row holds', async () => {
    // Given an id held by no row in any household
    const verdict = await requireOwnRowOrUnclaimed(caller, 'tag', 'tag-free')

    // Then the call site is told it is free, so it may create it
    expect(verdict).toBe('unclaimed')
  })

  it("user cannot import under another household's row id", async () => {
    // Given a tag of hh-2
    // When the guard is asked about it
    // Then it throws, so no call site can carry on and overwrite that row
    await expect(requireOwnRowOrUnclaimed(caller, 'tag', 'tag-theirs')).rejects.toThrow(/Forbidden/)
  })

  it("a cart is still checked by account, not by household, until H3b", async () => {
    // Given a cart of `other`, who is in the caller's household
    // When the guard is asked about it, and about the caller's own cart
    // Then the caller's own cart is "own", and `other`'s cart is refused:
    // `Cart` keeps its `userId` scope until H3b
    await expect(requireOwnRowOrUnclaimed(caller, 'cart', 'cart-mine')).resolves.toBe('own')
    await expect(requireOwnRowOrUnclaimed(caller, 'cart', 'cart-others')).rejects.toThrow(
      /Forbidden/,
    )
  })

  it("user sees the same refusal for another household's row as for a missing location", async () => {
    // NEGATIVE CONTROL. This test compares two string literals and passes
    // whatever the scoping does, so it is not evidence that the guard works.
    // It is here to pin the wording: both seams must refuse with the same
    // message and the same code, or a client can tell them apart.
    //
    // Note what it does NOT compare. `requireOwnRowOrUnclaimed` returns
    // 'unclaimed' for an id no row holds — it does not refuse it — so this
    // helper has no missing-id refusal of its own to compare against. The
    // nearest one is `requireLocationRole`'s, which does refuse a missing id.
    const refusals: GraphQLError[] = []
    await requireOwnRowOrUnclaimed(caller, 'tag', 'tag-theirs').catch((e) => refusals.push(e))
    await requireLocationRole(caller, 'loc-missing', 'viewer').catch((e) => refusals.push(e))

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
    // When the guard is asked about that id for the ITEM model
    const verdict = await requireOwnRowOrUnclaimed(caller, 'item', 'tag-mine')

    // Then no item holds it, so it is unclaimed. A delegate lookup that
    // ignored the model and always returned prisma.tag would answer 'own'.
    expect(verdict).toBe('unclaimed')
  })
})

describe('requireCatalogIds', () => {
  beforeEach(() => {
    seed({ callerHouseholdRole: 'member' })
    seedCatalog()
  })

  it("passes ids of the caller's household, including rows another member made", async () => {
    await expect(
      requireCatalogIds(caller, 'hh-1', 'tag', ['tag-mine', 'tag-others']),
    ).resolves.toBeUndefined()
  })

  it("refuses an id of another household with FORBIDDEN", async () => {
    const error = await requireCatalogIds(caller, 'hh-1', 'tag', ['tag-mine', 'tag-theirs']).catch(
      (e: GraphQLError) => e,
    )
    expect(error).toBeInstanceOf(GraphQLError)
    expect((error as GraphQLError).extensions.code).toBe('FORBIDDEN')
    expect((error as GraphQLError).message).toBe('Forbidden')
  })

  it('refuses an id no row holds with BAD_USER_INPUT', async () => {
    const error = await requireCatalogIds(caller, 'hh-1', 'tag', ['tag-gone']).catch(
      (e: GraphQLError) => e,
    )
    expect((error as GraphQLError).extensions.code).toBe('BAD_USER_INPUT')
  })

  it("refuses with FORBIDDEN when a list holds both another household's id and a missing one", async () => {
    const error = await requireCatalogIds(caller, 'hh-1', 'tag', ['tag-gone', 'tag-theirs']).catch(
      (e: GraphQLError) => e,
    )
    expect((error as GraphQLError).extensions.code).toBe('FORBIDDEN')
  })

  it("with missing: 'allow', lets an id no row holds through, and still refuses another household's", async () => {
    const allow = { missing: 'allow' } as const
    await expect(
      requireCatalogIds(caller, 'hh-1', 'tag', ['tag-mine', 'tag-gone'], allow),
    ).resolves.toBeUndefined()
    await expect(
      requireCatalogIds(caller, 'hh-1', 'tag', ['tag-theirs'], allow),
    ).rejects.toThrow(/Forbidden/)
  })

  // A repeated id is not refused. `findMany` returns ONE row for an id listed
  // twice, so a check that compared the number of rows found with the number
  // of ids sent would refuse this list. The second case is the negative
  // control: a repeated stranger's id is still refused.
  it("passes a repeated id of the household, and still refuses a repeated stranger's id", async () => {
    await expect(
      requireCatalogIds(caller, 'hh-1', 'tag', ['tag-mine', 'tag-mine']),
    ).resolves.toBeUndefined()
    // One query: every id was the household's, so the unscoped second read
    // never ran
    expect(state.lookups).toBe(1)
    await expect(
      requireCatalogIds(caller, 'hh-1', 'tag', ['tag-theirs', 'tag-theirs']),
    ).rejects.toThrow(/Forbidden/)
  })

  it('reads nothing for an empty list', async () => {
    await expect(requireCatalogIds(caller, 'hh-1', 'tag', [])).resolves.toBeUndefined()
    expect(state.lookups).toBe(0)
  })

  it('checks the model it is given, not tag', async () => {
    // `tag-mine` is a tag, not an item: as an item id, no row holds it
    const error = await requireCatalogIds(caller, 'hh-1', 'item', ['tag-mine']).catch(
      (e: GraphQLError) => e,
    )
    expect((error as GraphQLError).extensions.code).toBe('BAD_USER_INPUT')
  })
})

describe('requireCatalogRole', () => {
  it("returns the caller's household when the role is high enough", async () => {
    seed({ callerHouseholdRole: 'manager' })
    await expect(requireCatalogRole(caller, 'manager')).resolves.toBe('hh-1')
  })

  it('refuses a household member a manager check', async () => {
    // Given the caller is a `member` of hh-1, and `other` is its manager. A
    // check that read `other`'s row, or no row, would pass here.
    seed({ callerHouseholdRole: 'member' })
    await expect(requireCatalogRole(caller, 'manager')).rejects.toThrow(/Forbidden/)
  })
})

describe('householdOfLocation', () => {
  beforeEach(() => {
    seed({})
  })

  it("returns the location's own household", async () => {
    await expect(householdOfLocation('loc-1')).resolves.toBe('hh-1')
    await expect(householdOfLocation('loc-s')).resolves.toBe('hh-2')
  })

  it('refuses an id no location holds, and a location with no household, with FORBIDDEN', async () => {
    world.stock.state.locations.push({ id: 'loc-orphan', userId: 'caller', isDefault: false })
    for (const id of ['loc-none', 'loc-orphan']) {
      const error = await householdOfLocation(id).catch((e: GraphQLError) => e)
      expect((error as GraphQLError).extensions.code).toBe('FORBIDDEN')
    }
  })
})

describe('requireLocationItems', () => {
  beforeEach(() => {
    seed({})
    seedCatalog()
  })

  it("passes an item of the location's household", async () => {
    await expect(requireLocationItems(caller, 'loc-1', ['item-mine'])).resolves.toBeUndefined()
  })

  it("refuses another household's item with FORBIDDEN, and a missing one with BAD_USER_INPUT", async () => {
    const theirs = await requireLocationItems(caller, 'loc-1', ['item-theirs']).catch(
      (e: GraphQLError) => e,
    )
    expect((theirs as GraphQLError).extensions.code).toBe('FORBIDDEN')
    const gone = await requireLocationItems(caller, 'loc-1', ['item-gone']).catch(
      (e: GraphQLError) => e,
    )
    expect((gone as GraphQLError).extensions.code).toBe('BAD_USER_INPUT')
  })

  it("checks the LOCATION's household, not the caller's", async () => {
    // loc-s is hh-2's. The caller is in hh-1, so `requireHousehold` would say
    // hh-1 and pass `item-mine`. This helper checks no role (the caller has
    // none on loc-s); the role is `requireLocationRole`'s job.
    await expect(requireLocationItems(caller, 'loc-s', ['item-theirs'])).resolves.toBeUndefined()
    await expect(requireLocationItems(caller, 'loc-s', ['item-mine'])).rejects.toThrow(/Forbidden/)
  })

  it('reads nothing for an empty list', async () => {
    const spy = vi.spyOn(prisma.location, 'findUnique')
    await expect(requireLocationItems(caller, 'loc-1', [])).resolves.toBeUndefined()
    expect(spy).not.toHaveBeenCalled()
    expect(state.lookups).toBe(0)
  })
})
