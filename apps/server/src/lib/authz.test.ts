import { GraphQLError } from 'graphql'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Context } from '../context.js'

/** A row of the small stores below: a catalog row or a `cart` row. */
interface ScopedRow {
  id: string
  householdId?: string
  userId?: string
  locationId?: string
}

// Two kinds of double in one mocked `prisma`:
//
// - `user`, `household`, `householdMember`, `location`, `locationMember` and
//   `$transaction` are the stateful doubles joined in
//   src/test/householdWorld.ts. The role helpers read them.
// - `tag`, `item`, `cart` and `cartItem` are small stores for
//   `requireOwnRowOrUnclaimed` and `requireCatalogIds`, with a `lookups`
//   counter. `tag` and `item` are catalog models, scoped by `householdId`
//   since households H3a task 3.7. `cart` is scoped by `locationId` since
//   households H3b task B.3, which dropped `Cart.userId`, and `cartItem`
//   through its cart's location since task B.7. `inventoryLog` is scoped by
//   `locationId` since households H4 task E.1.
const { state, client } = vi.hoisted(() => {
  const state = {
    tags: [] as ScopedRow[],
    items: [] as ScopedRow[],
    carts: [] as ScopedRow[],
    inventoryLogs: [] as ScopedRow[],
    cartItems: [] as { id: string; cartId: string; userId: string }[],
    // Counts every read the stores serve, so "refused before any lookup" can
    // be asserted as a fact rather than inferred from the error message.
    lookups: 0,
  }

  type Where = {
    id?: string | { in: string[] }
    householdId?: string
    userId?: string
    locationId?: string | { in: string[] }
  }

  // Filters only on keys actually present in `where`, exactly as real Prisma
  // does. Hardcoding a scope comparison here would leave the "delete the
  // scope from the where clause" mutation check meaningless: the store would
  // refuse another household's row even when the code stopped asking it to.
  // Any other key THROWS, so a filter on a column a store does not have is
  // not silently ignored (the `cartItemFake` trap, root CLAUDE.md).
  const matches = (row: ScopedRow, where: Where) => {
    for (const key of Object.keys(where)) {
      if (key !== 'id' && key !== 'householdId' && key !== 'userId' && key !== 'locationId') {
        throw new Error(`authz.test store does not model the where key '${key}'`)
      }
    }
    const id = where.id
    const idOk =
      id === undefined || (typeof id === 'string' ? row.id === id : id.in.includes(row.id))
    return (
      idOk &&
      (where.householdId === undefined || row.householdId === where.householdId) &&
      (where.userId === undefined || row.userId === where.userId) &&
      (where.locationId === undefined ||
        (row.locationId !== undefined &&
          (typeof where.locationId === 'string'
            ? row.locationId === where.locationId
            : where.locationId.in.includes(row.locationId))))
    )
  }

  type Scope = 'householdId' | 'userId' | 'locationId'
  const store = (rows: () => ScopedRow[], scope: Scope) => {
    // A store refuses a filter on a scope column its model does not have:
    // `Cart` has no `userId` since households H3b task B.3, and Prisma throws
    // on such a `where` at run time.
    const check = (where: Where) => {
      for (const other of ['householdId', 'userId', 'locationId'] as const) {
        if (other !== scope && where[other] !== undefined) {
          throw new Error(`this store is scoped by ${scope}, not ${other}`)
        }
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

  // `CartItem` is scoped THROUGH its cart's location since households H3b
  // task B.7: `where: { id, cart: { locationId: { in } } }`. The relation is
  // followed to the cart row here, the way Prisma joins it. Any other key
  // throws — `userId` above all, which means "added by" and is never a scope.
  type CartItemWhere = { id?: string; cart?: { locationId?: { in: string[] } } }
  const cartItemMatches = (row: { id: string; cartId: string }, where: CartItemWhere) => {
    for (const key of Object.keys(where)) {
      if (key !== 'id' && key !== 'cart') {
        throw new Error(`authz.test cartItem store does not model the where key '${key}'`)
      }
    }
    for (const key of Object.keys(where.cart ?? {})) {
      if (key !== 'locationId') throw new Error(`authz.test cartItem store does not model cart.${key}`)
    }
    const cart = state.carts.find((c) => c.id === row.cartId)
    const locationIds = where.cart?.locationId?.in
    return (
      (where.id === undefined || row.id === where.id) &&
      (where.cart === undefined ||
        (cart !== undefined &&
          (locationIds === undefined ||
            (cart.locationId !== undefined && locationIds.includes(cart.locationId)))))
    )
  }
  const cartItem = {
    findUnique: async ({ where }: { where: CartItemWhere }) => {
      state.lookups += 1
      return state.cartItems.find((row) => cartItemMatches(row, where)) ?? null
    },
    findFirst: async ({ where }: { where: CartItemWhere }) => {
      state.lookups += 1
      return state.cartItems.find((row) => cartItemMatches(row, where)) ?? null
    },
  }

  const client = {
    tag: store(() => state.tags, 'householdId'),
    item: store(() => state.items, 'householdId'),
    cart: store(() => state.carts, 'locationId'),
    // `InventoryLog` is scoped by its location since households H4 task E.1.
    // Its `userId` means "written by" and is never a scope, so this store
    // refuses a `userId` filter.
    inventoryLog: store(() => state.inventoryLogs, 'locationId'),
    cartItem,
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
  forgetLocationRoles,
  householdOfLocation,
  locationIdsWithOrganizer,
  locationIdsWithRole,
  locationRolesByLocation,
  requireCatalogIds,
  requireCatalogRole,
  requireHousehold,
  requireHouseholdRole,
  requireLocationItems,
  requireLocationRole,
  requireLocationInHousehold,
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
      { id: 'loc-1', householdId: 'hh-1', name: 'Kitchen', order: 1 },
      { id: 'loc-2', householdId: 'hh-1', name: 'Garage', order: 0 },
      { id: 'loc-s', householdId: 'hh-2', name: 'Theirs', order: 0 },
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

  it('reads through the client it is given, so a transaction can pass its own (H5b task G.5)', async () => {
    // Given the store says the caller is a plain member of hh-1
    seed({ callerHouseholdRole: 'member' })
    const storeRead = vi.spyOn(prisma.householdMember, 'findUnique')
    // And a transaction client that answers `owner`
    const findUnique = vi.fn(async () => ({ role: 'owner' as const }))
    const tx = { householdMember: { findUnique } }

    // When the role is checked through that client
    const role = await requireHouseholdRole(caller, 'hh-1', 'owner', tx as never)

    // Then the answer comes from the client, and the global client is not read
    expect(role).toBe('owner')
    expect(findUnique).toHaveBeenCalledWith({
      where: { householdId_userId: { householdId: 'hh-1', userId: caller.userId } },
      select: { role: true },
    })
    expect(storeRead).not.toHaveBeenCalled()
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
    // `ensureHousehold` reads the household in one `user.findUnique`
    // (decision T14 of the H5b plan).
    const findUnique = vi.spyOn(world.users.client, 'findUnique')
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
    expect(findUnique).toHaveBeenCalledTimes(1)
  })

  it('a context with no cache looks the household up every time', async () => {
    seed({})
    const findUnique = vi.spyOn(world.users.client, 'findUnique')
    const ctx: Context = { userId: 'caller' }

    await requireHousehold(ctx)
    await requireHousehold(ctx)

    expect(findUnique).toHaveBeenCalledTimes(2)
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
        activeHouseholdId: null,
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

  it('with a role, leaves out a location where the caller holds a weaker one (H3b task B.7)', async () => {
    // Given the caller is a viewer on loc-1, and `other` organizes loc-1 too,
    // so the location has a writer and only the caller's own role decides
    seed({ callerLocationRole: 'viewer' })

    // Then asking for participant leaves loc-1 out, and asking for viewer
    // keeps it
    await expect(locationIdsWithRole(caller, 'participant')).resolves.toEqual([])
    await expect(locationIdsWithRole(caller, 'viewer')).resolves.toEqual(['loc-1'])
  })

  it('with a role, keeps a location where the caller holds that role or a stronger one', async () => {
    for (const role of ['participant', 'organizer'] as const) {
      seed({ callerLocationRole: role })
      await expect(locationIdsWithRole(caller, 'participant')).resolves.toEqual(['loc-1'])
    }
    seed({ callerLocationRole: 'participant' })
    await expect(locationIdsWithRole(caller, 'organizer')).resolves.toEqual([])
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
  // No cart has an owner since households H3b task B.3. `cart-here` is at
  // loc-1, where the caller has a role (`other` organizes it too); `cart-loc2`
  // is in the caller's OWN household but at loc-2, where the caller has no
  // role; `cart-theirs` is at another household's location.
  //
  // Every cart id starts with its location id and a colon (`cartIdFor`), since
  // households H4 task E.1 checks that prefix first (issue #361).
  state.carts = [
    { id: 'loc-1:v', locationId: 'loc-1' },
    { id: 'loc-2:v', locationId: 'loc-2' },
    { id: 'loc-s:v', locationId: 'loc-s' },
  ]
  // One row per cart. `ci-here-other` is in the cart at loc-1 and was added
  // by `other`, so a guard that scoped by `CartItem.userId` would refuse it.
  state.cartItems = [
    { id: 'ci-here-other', cartId: 'loc-1:v', userId: 'other' },
    { id: 'ci-loc2', cartId: 'loc-2:v', userId: 'other' },
    { id: 'ci-theirs', cartId: 'loc-s:v', userId: 'stranger' },
  ]
  state.inventoryLogs = []
  state.lookups = 0
}

describe('requireOwnRowOrUnclaimed', () => {
  beforeEach(() => {
    seed({ callerHouseholdRole: 'member' })
    seedCatalog()
  })

  it('user can import under an id their own row already holds', async () => {
    // When the guard is asked about the caller's own tag
    const verdict = await requireOwnRowOrUnclaimed(caller, 'tag', 'tag-mine', 'hh-1')

    // Then the call site is told the row is the caller's, so it may replace it
    expect(verdict).toBe('own')
  })

  it("user can write a catalog row another member of their household made", async () => {
    // Given a tag `other` made in hh-1, the caller's household
    // When the guard is asked about it
    const verdict = await requireOwnRowOrUnclaimed(caller, 'tag', 'tag-others', 'hh-1')

    // Then it is the household's, so it is "own" (households H3a task 3.7).
    // A body that still scoped by `userId` throws FORBIDDEN here.
    expect(verdict).toBe('own')
  })

  it('user can import under an id no row holds', async () => {
    // Given an id held by no row in any household
    const verdict = await requireOwnRowOrUnclaimed(caller, 'tag', 'tag-free', 'hh-1')

    // Then the call site is told it is free, so it may create it
    expect(verdict).toBe('unclaimed')
  })

  it("user cannot import under another household's row id", async () => {
    // Given a tag of hh-2
    // When the guard is asked about it
    // Then it throws, so no call site can carry on and overwrite that row
    await expect(requireOwnRowOrUnclaimed(caller, 'tag', 'tag-theirs', 'hh-1')).rejects.toThrow(/Forbidden/)
  })

  it('a cart is checked by its location: participant or higher there makes it own (H3b task B.7)', async () => {
    // Given carts at loc-1 (the caller is organizer), at loc-2 (the caller's
    // own household, but no role) and at another household's location
    // When the guard is asked about each
    // Then only the cart at loc-1 is "own". The cart at loc-2 is refused,
    // which a check by household would let through
    await expect(requireOwnRowOrUnclaimed(caller, 'cart', 'loc-1:v', 'hh-1')).resolves.toBe('own')
    await expect(requireOwnRowOrUnclaimed(caller, 'cart', 'loc-2:v', 'hh-1')).rejects.toThrow(
      /Forbidden/,
    )
    await expect(requireOwnRowOrUnclaimed(caller, 'cart', 'loc-s:v', 'hh-1')).rejects.toThrow(
      /Forbidden/,
    )
    // And an id no cart holds is still unclaimed
    await expect(requireOwnRowOrUnclaimed(caller, 'cart', 'loc-1:free', 'hh-1')).resolves.toBe('unclaimed')
  })

  it('a cart is refused once the caller has no role left on its location', async () => {
    // Given the caller holds no location role at all; `other` still organizes
    // loc-1, so the cart's location is not empty
    seed({ callerHouseholdRole: 'member', callerLocationRole: null })
    seedCatalog()

    // When the guard is asked about the cart at loc-1
    // Then it is refused: the role is what counts, not the household
    await expect(requireOwnRowOrUnclaimed(caller, 'cart', 'loc-1:v', 'hh-1')).rejects.toThrow(
      /Forbidden/,
    )
  })

  it('a cart and its rows are refused to a location viewer, and own to a participant', async () => {
    // Given the caller is only a viewer at loc-1. A viewer may read the cart,
    // but an import WRITES the row it names (decision D7).
    seed({ callerHouseholdRole: 'member', callerLocationRole: 'viewer' })
    seedCatalog()
    await expect(requireOwnRowOrUnclaimed(caller, 'cart', 'loc-1:v', 'hh-1')).rejects.toThrow(
      /Forbidden/,
    )
    await expect(requireOwnRowOrUnclaimed(caller, 'cartItem', 'ci-here-other', 'hh-1')).rejects.toThrow(
      /Forbidden/,
    )

    // And as a participant, the lowest role that writes, both are "own"
    seed({ callerHouseholdRole: 'member', callerLocationRole: 'participant' })
    seedCatalog()
    await expect(requireOwnRowOrUnclaimed(caller, 'cart', 'loc-1:v', 'hh-1')).resolves.toBe('own')
    await expect(requireOwnRowOrUnclaimed(caller, 'cartItem', 'ci-here-other', 'hh-1')).resolves.toBe('own')
  })

  it("a cart item is checked by its cart's location, not by who added it (H3b task B.7)", async () => {
    // Given three rows, none added by the caller: one in the cart at loc-1
    // (the caller is organizer there), one at loc-2 (the caller's household,
    // no role) and one at another household's location
    // When the guard is asked about each
    // Then the row at loc-1 is "own" although `other` added it, and the two
    // others are refused
    await expect(requireOwnRowOrUnclaimed(caller, 'cartItem', 'ci-here-other', 'hh-1')).resolves.toBe('own')
    await expect(requireOwnRowOrUnclaimed(caller, 'cartItem', 'ci-loc2', 'hh-1')).rejects.toThrow(
      /Forbidden/,
    )
    await expect(requireOwnRowOrUnclaimed(caller, 'cartItem', 'ci-theirs', 'hh-1')).rejects.toThrow(
      /Forbidden/,
    )
    // And an id no cart item holds is unclaimed
    await expect(requireOwnRowOrUnclaimed(caller, 'cartItem', 'ci-free', 'hh-1')).resolves.toBe('unclaimed')
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
    await requireOwnRowOrUnclaimed(caller, 'tag', 'tag-theirs', 'hh-1').catch((e) => refusals.push(e))
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
    await expect(requireOwnRowOrUnclaimed({ userId: null }, 'tag', 'tag-mine', 'hh-1')).rejects.toThrow(
      /Unauthorized/,
    )

    // And no store was read at all, so an unauthenticated caller cannot use
    // the guard to probe which row ids are taken
    expect(state.lookups).toBe(0)
  })

  it('user importing an item is checked against the item model, not tag', async () => {
    // Given an id held only in the tag store, by the caller's own tag
    // When the guard is asked about that id for the ITEM model
    const verdict = await requireOwnRowOrUnclaimed(caller, 'item', 'tag-mine', 'hh-1')

    // Then no item holds it, so it is unclaimed. A delegate lookup that
    // ignored the model and always returned prisma.tag would answer 'own'.
    expect(verdict).toBe('unclaimed')
  })
})

// ── One person in two households (plan H4 rule 16) ──
//
// | Person   | Household role       | Location roles                                  |
// |----------|----------------------|-------------------------------------------------|
// | caller   | hh-a owner, hh-b manager | loc-a organizer, loc-a-view viewer, loc-b organizer |
// | other    | hh-a member          | loc-a participant                               |
// | stranger | hh-c owner           | loc-c organizer                                 |
//
// The caller is a member of TWO households, so "the caller's household" has
// two answers. Each test pins the caller's household to hh-b through
// `requestCache`, and asks about target hh-a. So a body that reads
// `requireHousehold(ctx)` instead of the target gets hh-b, and a body that
// asks for every location the caller has a role on gets loc-b too. Both give
// a different answer from the correct one.
function seedTwoHouseholds() {
  world.reset()
  world.stock.reset(
    [
      { id: 'loc-a', householdId: 'hh-a', name: 'Kitchen', order: 0 },
      { id: 'loc-a-view', householdId: 'hh-a', name: 'Garage', order: 1 },
      { id: 'loc-b', householdId: 'hh-b', name: 'Office', order: 0 },
      { id: 'loc-c', householdId: 'hh-c', name: 'Theirs', order: 0 },
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
    households: [
      household('hh-a', 'caller'),
      household('hh-b', 'other-b'),
      household('hh-c', 'stranger'),
    ],
    householdMembers: [
      { householdId: 'hh-a', userId: 'caller', role: 'owner' as const, joinedAt: T },
      { householdId: 'hh-b', userId: 'caller', role: 'manager' as const, joinedAt: T },
      { householdId: 'hh-a', userId: 'other', role: 'member' as const, joinedAt: T },
      { householdId: 'hh-c', userId: 'stranger', role: 'owner' as const, joinedAt: T },
    ],
    locationMembers: [
      { locationId: 'loc-a', userId: 'caller', role: 'organizer' as const, createdAt: T },
      { locationId: 'loc-a-view', userId: 'caller', role: 'viewer' as const, createdAt: T },
      { locationId: 'loc-b', userId: 'caller', role: 'organizer' as const, createdAt: T },
      { locationId: 'loc-a', userId: 'other', role: 'participant' as const, createdAt: T },
      { locationId: 'loc-c', userId: 'stranger', role: 'organizer' as const, createdAt: T },
    ],
  })
  state.tags = [
    { id: 'tag-a', householdId: 'hh-a' },
    { id: 'tag-b', householdId: 'hh-b' },
    { id: 'tag-c', householdId: 'hh-c' },
  ]
  state.items = []
  // `userId` on a log is its AUTHOR, never a scope.
  state.inventoryLogs = [
    { id: 'log-a', locationId: 'loc-a', userId: 'caller' },
    { id: 'log-a-other', locationId: 'loc-a', userId: 'other' },
    { id: 'log-a-view', locationId: 'loc-a-view', userId: 'caller' },
    { id: 'log-b', locationId: 'loc-b', userId: 'caller' },
    { id: 'log-c', locationId: 'loc-c', userId: 'stranger' },
  ]
  // `loc-a:moved` is a cart stored at loc-b although its id names loc-a. The
  // old import fallback could make such a row (plan H4, *Facts*). The caller
  // organizes both locations, so only the prefix rule refuses it.
  state.carts = [
    { id: 'loc-a:no-vendor', locationId: 'loc-a' },
    { id: 'loc-a:moved', locationId: 'loc-b' },
    { id: 'loc-b:no-vendor', locationId: 'loc-b' },
    { id: 'loc-c:no-vendor', locationId: 'loc-c' },
  ]
  state.cartItems = [
    { id: 'ci-a', cartId: 'loc-a:no-vendor', userId: 'other' },
    { id: 'ci-b', cartId: 'loc-b:no-vendor', userId: 'caller' },
  ]
  state.lookups = 0
}

/** The caller, with "the caller's household" pinned to `householdId`. */
function callerIn(householdId: string): Context {
  return { userId: 'caller', requestCache: { householdId: Promise.resolve(householdId) } }
}

async function codeOf(promise: Promise<unknown>): Promise<unknown> {
  const error = await promise.then(
    () => null,
    (e: GraphQLError) => e,
  )
  return error ? (error as GraphQLError).extensions.code : 'resolved'
}

describe('locationIdsWithRole with a household (H4 task E.1)', () => {
  beforeEach(() => seedTwoHouseholds())

  it("keeps only the locations of that household", async () => {
    // Given the caller has roles at loc-a and loc-a-view (hh-a) and loc-b (hh-b)
    // Then asking for hh-a leaves loc-b out
    const ids = await locationIdsWithRole(callerIn('hh-b'), 'viewer', { householdId: 'hh-a' })
    expect([...ids].sort()).toEqual(['loc-a', 'loc-a-view'])

    // And the role filter still applies: a viewer location is left out for
    // participant
    await expect(
      locationIdsWithRole(callerIn('hh-b'), 'participant', { householdId: 'hh-a' }),
    ).resolves.toEqual(['loc-a'])
  })

  it('still drops a role in a household the caller is not a member of (decision H18)', async () => {
    // Given the caller has an organizer row on loc-c, in hh-c, but is not a
    // member of hh-c. Asking for hh-c must not bring it back: the household
    // filter goes next to the H18 filter, it does not replace it.
    await world.households.client.locationMember.create({
      data: { locationId: 'loc-c', userId: 'caller', role: 'organizer' },
    })

    await expect(
      locationIdsWithRole(callerIn('hh-b'), 'viewer', { householdId: 'hh-c' }),
    ).resolves.toEqual([])
  })

  it('with no household, keeps every household (unchanged)', async () => {
    const ids = await locationIdsWithRole(callerIn('hh-b'))
    expect([...ids].sort()).toEqual(['loc-a', 'loc-a-view', 'loc-b'])
  })
})

describe('locationRolesByLocation (H5 task F.1)', () => {
  beforeEach(() => seedTwoHouseholds())

  it("maps each location of ONE household to the caller's role there", async () => {
    // Given the caller organizes loc-a and views loc-a-view (hh-a), and
    // organizes loc-b (hh-b). `other` is a participant of loc-a.
    // When the roles in hh-a are read
    const roles = await locationRolesByLocation(callerIn('hh-a'), 'hh-a')

    // Then only hh-a's two locations, with the CALLER's roles, not other's
    expect(Object.fromEntries(roles)).toEqual({ 'loc-a': 'organizer', 'loc-a-view': 'viewer' })
  })

  it('leaves out a role that does not count (decision H18)', async () => {
    // Given the caller has an organizer row on loc-c (hh-c) but is not a
    // member of hh-c
    await world.households.client.locationMember.create({
      data: { locationId: 'loc-c', userId: 'caller', role: 'organizer' },
    })

    // Then asking for hh-c gives no role
    const roles = await locationRolesByLocation(callerIn('hh-a'), 'hh-c')
    expect(roles.size).toBe(0)
  })

  it('reads once per household per request', async () => {
    // Given one request context
    const ctx = callerIn('hh-a')
    const spy = vi.spyOn(prisma.locationMember, 'findMany')

    // When hh-a is asked three times and hh-b once
    await locationRolesByLocation(ctx, 'hh-a')
    await locationRolesByLocation(ctx, 'hh-a')
    await locationRolesByLocation(ctx, 'hh-a')
    const b = await locationRolesByLocation(ctx, 'hh-b')

    // Then there are two reads, one per household, and hh-b's answer is its own
    expect(spy).toHaveBeenCalledTimes(2)
    expect(Object.fromEntries(b)).toEqual({ 'loc-b': 'organizer' })
  })
})

describe('locationIdsWithOrganizer (H5 task F.1)', () => {
  beforeEach(() => seedTwoHouseholds())

  it('lists the locations of one household that have an organizer still in it', async () => {
    // Given hh-a: loc-a has the caller as organizer; loc-a-view has none.
    // hh-c: loc-c has the stranger as organizer.
    const ids = await locationIdsWithOrganizer(callerIn('hh-a'), 'hh-a')

    // Then only loc-a. loc-c is another household's.
    expect([...ids]).toEqual(['loc-a'])
  })

  it('does not count an organizer who left the household (decision H18)', async () => {
    // Given other is made organizer of loc-a-view, then removed from hh-a.
    // The caller is still in hh-a, so a filter that checked the CALLER's
    // membership instead of the organizer's would still count loc-a-view.
    await world.households.client.locationMember.create({
      data: { locationId: 'loc-a-view', userId: 'other', role: 'organizer' },
    })
    await world.households.client.householdMember.delete({
      where: { householdId_userId: { householdId: 'hh-a', userId: 'other' } },
    })

    const ids = await locationIdsWithOrganizer(callerIn('hh-a'), 'hh-a')

    // Then loc-a-view has no counted organizer
    expect([...ids]).toEqual(['loc-a'])
  })

  it('reads once per household per request', async () => {
    const ctx = callerIn('hh-a')
    const spy = vi.spyOn(prisma.locationMember, 'findMany')
    await locationIdsWithOrganizer(ctx, 'hh-a')
    await locationIdsWithOrganizer(ctx, 'hh-a')
    expect(spy).toHaveBeenCalledTimes(1)
  })
})

describe('forgetLocationRoles (review of H5 task F.1)', () => {
  beforeEach(() => seedTwoHouseholds())

  it('makes both role caches read again', async () => {
    // Given both caches are filled for hh-a in one request
    const ctx = callerIn('hh-a')
    await locationRolesByLocation(ctx, 'hh-a')
    await locationIdsWithOrganizer(ctx, 'hh-a')
    const spy = vi.spyOn(prisma.locationMember, 'findMany')

    // When a write forgets them, and both are asked again
    forgetLocationRoles(ctx)
    await locationRolesByLocation(ctx, 'hh-a')
    await locationIdsWithOrganizer(ctx, 'hh-a')

    // Then each reads the table again: two reads, not zero
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('forgets the household id too (decision T15 of the H5b plan)', async () => {
    // A join, a leave or a removal can change the caller's household inside
    // one request, so the next root field must look it up again.
    const ctx = callerIn('hh-a')
    forgetLocationRoles(ctx)
    expect(ctx.requestCache?.householdId).toBeUndefined()
  })

  it('does nothing on a context with no cache', () => {
    expect(() => forgetLocationRoles({ userId: 'caller' })).not.toThrow()
  })
})

describe('requireLocationInHousehold (H4 task E.1)', () => {
  beforeEach(() => seedTwoHouseholds())

  it('passes a location of that household', async () => {
    await expect(
      requireLocationInHousehold(callerIn('hh-b'), 'loc-a', 'hh-a'),
    ).resolves.toBeUndefined()
  })

  it("refuses a location of another household, even one the caller organizes", async () => {
    // Given the caller organizes loc-b, in hh-b, and is a member of hh-a too
    // Then loc-b is refused for hh-a
    expect(await codeOf(requireLocationInHousehold(callerIn('hh-b'), 'loc-b', 'hh-a'))).toBe(
      'FORBIDDEN',
    )
  })

  it('refuses a missing location with the same error', async () => {
    expect(await codeOf(requireLocationInHousehold(callerIn('hh-b'), 'loc-gone', 'hh-a'))).toBe(
      'FORBIDDEN',
    )
  })

  it('refuses a caller who is not signed in', async () => {
    await expect(
      requireLocationInHousehold({ userId: null }, 'loc-a', 'hh-a'),
    ).rejects.toThrow(/Unauthorized/)
  })
})

describe('requireOwnRowOrUnclaimed with a target household (H4 task E.1)', () => {
  beforeEach(() => seedTwoHouseholds())

  it("a catalog row of household B is refused when the target is A", async () => {
    // Given the caller's household is pinned to hh-b, and the caller is a
    // member of hh-a too
    // Then a tag of hh-b is refused for target hh-a, and own for target hh-b
    expect(await codeOf(requireOwnRowOrUnclaimed(callerIn('hh-b'), 'tag', 'tag-b', 'hh-a'))).toBe(
      'FORBIDDEN',
    )
    await expect(requireOwnRowOrUnclaimed(callerIn('hh-b'), 'tag', 'tag-b', 'hh-b')).resolves.toBe(
      'own',
    )
    // And a tag of hh-a is own for target hh-a, a stranger's tag is refused
    await expect(requireOwnRowOrUnclaimed(callerIn('hh-b'), 'tag', 'tag-a', 'hh-a')).resolves.toBe(
      'own',
    )
    expect(await codeOf(requireOwnRowOrUnclaimed(callerIn('hh-b'), 'tag', 'tag-c', 'hh-a'))).toBe(
      'FORBIDDEN',
    )
  })

  it('a log at a location where the caller is only viewer is refused', async () => {
    expect(
      await codeOf(requireOwnRowOrUnclaimed(callerIn('hh-b'), 'inventoryLog', 'log-a-view', 'hh-a')),
    ).toBe('FORBIDDEN')
  })

  it("a log at household B's location is refused when the target is A, and own when it is B", async () => {
    // Given the caller organizes loc-b, in hh-b
    expect(
      await codeOf(requireOwnRowOrUnclaimed(callerIn('hh-b'), 'inventoryLog', 'log-b', 'hh-a')),
    ).toBe('FORBIDDEN')
    await expect(
      requireOwnRowOrUnclaimed(callerIn('hh-b'), 'inventoryLog', 'log-b', 'hh-b'),
    ).resolves.toBe('own')
  })

  it('a log another member wrote at a writable location is own', async () => {
    // Given `other` wrote log-a-other at loc-a, where the caller is organizer.
    // A check by `userId` would refuse it.
    await expect(
      requireOwnRowOrUnclaimed(callerIn('hh-b'), 'inventoryLog', 'log-a-other', 'hh-a'),
    ).resolves.toBe('own')
    // And a stranger's log is refused, a free id is unclaimed
    expect(
      await codeOf(requireOwnRowOrUnclaimed(callerIn('hh-b'), 'inventoryLog', 'log-c', 'hh-a')),
    ).toBe('FORBIDDEN')
    await expect(
      requireOwnRowOrUnclaimed(callerIn('hh-b'), 'inventoryLog', 'log-free', 'hh-a'),
    ).resolves.toBe('unclaimed')
  })

  it('a cart id with no location prefix is refused as bad input, before any lookup', async () => {
    expect(
      await codeOf(requireOwnRowOrUnclaimed(callerIn('hh-b'), 'cart', 'no-vendor', 'hh-a')),
    ).toBe('BAD_USER_INPUT')
    expect(state.lookups).toBe(0)
  })

  it("a cart id with another household's location prefix is refused, and the cart table is not read", async () => {
    // Given a cart id whose prefix is loc-c, in the stranger's household. One
    // id is taken (`loc-c:no-vendor`), one is free.
    const findUnique = vi.spyOn(prisma.cart, 'findUnique')
    const findFirst = vi.spyOn(prisma.cart, 'findFirst')

    // Then both get the same refusal, so the caller cannot tell a taken id
    // from a free one
    expect(
      await codeOf(requireOwnRowOrUnclaimed(callerIn('hh-b'), 'cart', 'loc-c:no-vendor', 'hh-a')),
    ).toBe('FORBIDDEN')
    expect(
      await codeOf(requireOwnRowOrUnclaimed(callerIn('hh-b'), 'cart', 'loc-c:free', 'hh-a')),
    ).toBe('FORBIDDEN')
    // And the cart table was not read at all
    expect(findUnique).not.toHaveBeenCalled()
    expect(findFirst).not.toHaveBeenCalled()
  })

  it("a cart id with household B's location prefix is refused when the target is A", async () => {
    // The caller organizes loc-b, so only the target household refuses it
    expect(
      await codeOf(requireOwnRowOrUnclaimed(callerIn('hh-b'), 'cart', 'loc-b:no-vendor', 'hh-a')),
    ).toBe('FORBIDDEN')
    await expect(
      requireOwnRowOrUnclaimed(callerIn('hh-b'), 'cart', 'loc-b:no-vendor', 'hh-b'),
    ).resolves.toBe('own')
  })

  it('a cart at a writable location is own, and a free id there is unclaimed', async () => {
    await expect(
      requireOwnRowOrUnclaimed(callerIn('hh-b'), 'cart', 'loc-a:no-vendor', 'hh-a'),
    ).resolves.toBe('own')
    await expect(
      requireOwnRowOrUnclaimed(callerIn('hh-b'), 'cart', 'loc-a:v9', 'hh-a'),
    ).resolves.toBe('unclaimed')
  })

  it('a stored cart whose location is not the one its id names is refused', async () => {
    // Given `loc-a:moved` is stored at loc-b. The caller organizes loc-b too,
    // so a check by "any writable location" would pass it.
    expect(
      await codeOf(requireOwnRowOrUnclaimed(callerIn('hh-b'), 'cart', 'loc-a:moved', 'hh-a')),
    ).toBe('FORBIDDEN')
  })

  it("a cart item in a cart at household B's location is refused when the target is A", async () => {
    expect(
      await codeOf(requireOwnRowOrUnclaimed(callerIn('hh-b'), 'cartItem', 'ci-b', 'hh-a')),
    ).toBe('FORBIDDEN')
    await expect(
      requireOwnRowOrUnclaimed(callerIn('hh-b'), 'cartItem', 'ci-b', 'hh-b'),
    ).resolves.toBe('own')
    // And a row another member added at a writable location of A is own
    await expect(
      requireOwnRowOrUnclaimed(callerIn('hh-b'), 'cartItem', 'ci-a', 'hh-a'),
    ).resolves.toBe('own')
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

  it('refuses an id no location holds with FORBIDDEN', async () => {
    const error = await householdOfLocation('loc-none').catch((e: GraphQLError) => e)
    expect((error as GraphQLError).extensions.code).toBe('FORBIDDEN')
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
