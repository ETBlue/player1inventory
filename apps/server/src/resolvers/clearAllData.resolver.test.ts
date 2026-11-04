import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApolloServer } from '@apollo/server'
import { typeDefs } from '../schema/index.js'
import { resolvers } from '../resolvers/index.js'
import type { AppLanguage, Context } from '../context.js'
import type { HouseholdWorld } from '../test/householdWorld.js'
import {
  householdMemberRow,
  householdRow,
  locationMemberRow,
} from '../test/householdRows.js'
import { makeStock } from '../test/stockFake.js'

// `clearAllData` (import.resolver.ts) clears the caller's HOUSEHOLD
// (households H3a, task 3.10; design *Purge*; decision H17).
//
// It runs on `householdWorld` (src/test/householdWorld.ts): `Household`,
// `HouseholdMember`, `LocationMember`, `Location` and `ItemStock` are real
// stores, so the role check, the lock, the location delete with its two
// cascades, and the "Home" it makes again are all real rows. The twelve other
// models it deletes are RECORDERS: each records its `deleteMany` argument and
// returns `{ count: 0 }`. So for those twelve this file pins the exact filter,
// not which rows it matches. The real-SQL proof that another household's rows
// survive is e2e/tests/purge-two-households.spec.ts.
//
// Every call is written to `events` in order, so a test can see that the lock
// comes first and that "Home" is made after the deletes.

const shared = vi.hoisted(() => ({
  events: [] as string[],
  /** The twelve models this file only records. */
  RECORDED: [
    'inventoryLog',
    'cartItem',
    'cart',
    'recipeItem',
    'recipe',
    'itemTag',
    'itemVendor',
    'item',
    'tag',
    'tagType',
    'vendor',
    'shelf',
  ] as const,
}))
const { events } = shared

vi.mock('../lib/prisma.js', async () => {
  const { createHouseholdWorld } = await import('../test/householdWorld.js')
  const world = createHouseholdWorld()
  // The world's own model objects, held BEFORE `extend` replaces them on the
  // client, so each wrapper below calls the real one and not itself.
  const base = {
    household: world.client.household,
    itemStock: world.client.itemStock,
    location: world.client.location,
  }
  const recorders: Record<string, unknown> = {}
  for (const model of shared.RECORDED) {
    recorders[model] = {
      deleteMany: vi.fn(async (_args: unknown) => {
        shared.events.push(`delete:${model}`)
        return { count: 0 }
      }),
    }
  }
  world.extend({
    ...recorders,
    household: {
      ...base.household,
      update: async (args: Parameters<typeof base.household.update>[0]) => {
        shared.events.push('lock')
        return base.household.update(args)
      },
    },
    itemStock: {
      ...base.itemStock,
      deleteMany: async (args: Parameters<typeof base.itemStock.deleteMany>[0]) => {
        shared.events.push('delete:itemStock')
        return base.itemStock.deleteMany(args)
      },
    },
    location: {
      ...base.location,
      deleteMany: async (args: Parameters<typeof base.location.deleteMany>[0]) => {
        shared.events.push('delete:location')
        return base.location.deleteMany(args)
      },
      create: async (args: Parameters<typeof base.location.create>[0]) => {
        shared.events.push('create:location')
        return base.location.create(args)
      },
    },
  })
  return { prisma: { ...world.client, $world: world } }
})

// `requireHousehold` is wrapped, not replaced, so one test can make it answer
// with no household id. Every other test gets the real function.
vi.mock('../lib/authz.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../lib/authz.js')>()
  return { ...real, requireHousehold: vi.fn(real.requireHousehold) }
})

import { prisma } from '../lib/prisma.js'
import { requireHousehold } from '../lib/authz.js'

const world = (prisma as unknown as { $world: HouseholdWorld }).$world
const recorded = prisma as unknown as Record<
  string,
  { deleteMany: ReturnType<typeof vi.fn> }
>

const server = new ApolloServer<Context>({ typeDefs, resolvers })

async function run(
  query: string,
  userId = 'caller',
  language: AppLanguage = 'en',
) {
  const res = await server.executeOperation({ query }, { contextValue: { userId, language } })
  if (res.body.kind !== 'single') throw new Error('expected single result')
  return res.body.singleResult
}

const CLEAR = 'mutation { clearAllData }'
const LOCATIONS = 'query { locations { id name isDefault } }'

/** The 14 deletes, in the order `clearAllData` runs them. */
const DELETE_ORDER = [
  'inventoryLog',
  'cartItem',
  'cart',
  'recipeItem',
  'recipe',
  'itemTag',
  'itemVendor',
  'itemStock',
  'item',
  'tag',
  'tagType',
  'vendor',
  'shelf',
  'location',
] as const

// ── The fixture (plan H3a rule 10) ──
//
// | Person   | Household | Household role      | Location roles                       |
// |----------|-----------|---------------------|--------------------------------------|
// | caller   | hh-1      | set by each test    | loc-kitchen, loc-pantry: organizer   |
// | other    | hh-1      | owner, or manager   | loc-kitchen: participant             |
// | stranger | hh-2      | owner               | loc-theirs: organizer                |
//
// `other` always holds a DIFFERENT household role from the caller. hh-2 has a
// location, a role row and a stock row of its own, so a delete that is not
// scoped to hh-1 takes them too.
function seed(callerRole: 'owner' | 'manager' | 'member' = 'owner') {
  world.reset()
  world.stock.reset(
    [
      { id: 'loc-kitchen', userId: 'caller', isDefault: true, householdId: 'hh-1', name: 'Kitchen', order: 0 },
      { id: 'loc-pantry', userId: 'other', isDefault: false, householdId: 'hh-1', name: 'Pantry', order: 1 },
      { id: 'loc-theirs', userId: 'stranger', isDefault: true, householdId: 'hh-2', name: 'Theirs', order: 0 },
    ],
    [
      makeStock({ id: 's-kitchen', itemId: 'item-1', locationId: 'loc-kitchen' }),
      makeStock({ id: 's-pantry', itemId: 'item-1', locationId: 'loc-pantry' }),
      makeStock({ id: 's-theirs', itemId: 'item-9', locationId: 'loc-theirs' }),
    ],
  )
  const ownerOfHh1 = callerRole === 'owner' ? 'caller' : 'other'
  world.seedHouseholds({
    households: [householdRow('hh-1', ownerOfHh1), householdRow('hh-2', 'stranger')],
    householdMembers: [
      householdMemberRow('hh-1', 'caller', callerRole),
      householdMemberRow('hh-1', 'other', callerRole === 'owner' ? 'manager' : 'owner'),
      householdMemberRow('hh-2', 'stranger', 'owner'),
    ],
    locationMembers: [
      locationMemberRow('loc-kitchen', 'caller', 'organizer'),
      locationMemberRow('loc-pantry', 'caller', 'organizer'),
      locationMemberRow('loc-kitchen', 'other', 'participant'),
      locationMemberRow('loc-theirs', 'stranger', 'organizer'),
    ],
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  events.length = 0
  seed()
})

describe('clearAllData clears the household', () => {
  it('household owner can clear the household: every delete is scoped to it, lock first, Home last', async () => {
    // When the owner clears the household
    const res = await run(CLEAR)

    // Then it succeeds
    expect(res.errors).toBeUndefined()
    expect(res.data?.clearAllData).toBe(true)

    // And the household lock comes FIRST, before any delete (task 3.6 review:
    // locking later can deadlock with `deleteLocation`), and "Home" is made
    // AFTER every delete
    expect(events).toEqual([
      'lock',
      ...DELETE_ORDER.map((model) => `delete:${model}`),
      'create:location',
    ])

    // And every recorded delete carries its exact household filter. Logs,
    // carts and cart items go through their LOCATION, never through the
    // `userId` of whoever wrote them (design *Purge*, issue #320).
    const expected: Record<(typeof shared.RECORDED)[number], unknown> = {
      inventoryLog: { where: { location: { householdId: 'hh-1' } } },
      cartItem: { where: { cart: { location: { householdId: 'hh-1' } } } },
      cart: { where: { location: { householdId: 'hh-1' } } },
      recipeItem: { where: { recipe: { householdId: 'hh-1' } } },
      recipe: { where: { householdId: 'hh-1' } },
      itemTag: { where: { item: { householdId: 'hh-1' } } },
      itemVendor: { where: { item: { householdId: 'hh-1' } } },
      item: { where: { householdId: 'hh-1' } },
      tag: { where: { householdId: 'hh-1' } },
      tagType: { where: { householdId: 'hh-1' } },
      vendor: { where: { householdId: 'hh-1' } },
      shelf: { where: { householdId: 'hh-1' } },
    }
    for (const model of shared.RECORDED) {
      expect(recorded[model]?.deleteMany.mock.calls, model).toStrictEqual([[expected[model]]])
    }
  })

  it('household owner who clears keeps the other household untouched, and their own household is emptied', async () => {
    await run(CLEAR)

    // hh-2's location, role row and stock row are all still there
    expect(world.stock.state.locations.filter((l) => l.householdId === 'hh-2').map((l) => l.id)).toEqual([
      'loc-theirs',
    ])
    expect(world.stock.state.itemStocks.map((s) => s.id)).toEqual(['s-theirs'])
    // And of hh-1's old locations, none is left, nor any of their role rows
    // (one was `other`'s, so nothing here goes by who wrote the row)
    const ids = world.stock.state.locations.map((l) => l.id)
    expect(ids).not.toContain('loc-kitchen')
    expect(ids).not.toContain('loc-pantry')
    expect(
      world.households.state.locationMembers.filter((m) =>
        ['loc-kitchen', 'loc-pantry'].includes(m.locationId),
      ),
    ).toEqual([])
    // And the household and its members stay (design *Purge*: keeps the
    // household, its members, their household roles)
    expect(world.households.state.households.map((h) => h.id).sort()).toEqual(['hh-1', 'hh-2'])
    expect(world.households.state.householdMembers).toHaveLength(3)
  })

  it('household owner sees one "Home", with an organizer row, after clearing', async () => {
    // Given the owner has cleared the household
    await run(CLEAR)

    // When the locations are read
    const res = await run(LOCATIONS)

    // Then there is exactly one, "Home", the default until task 3.12
    expect(res.errors).toBeUndefined()
    const locations = res.data?.locations as { id: string; name: string; isDefault: boolean }[]
    expect(locations).toHaveLength(1)
    const home = locations[0]
    expect(home?.name).toBe('Home')
    expect(home?.isDefault).toBe(true)
    // And it is a location of the same household, with the caller as organizer
    expect(world.stock.state.locations.find((l) => l.id === home?.id)?.householdId).toBe('hh-1')
    expect(
      world.households.state.locationMembers.filter((m) => m.locationId === home?.id),
    ).toEqual([expect.objectContaining({ userId: 'caller', role: 'organizer' })])
  })

  it('household owner who uses the app in Chinese gets the Chinese name for Home', async () => {
    await run(CLEAR, 'caller', 'tw')

    const hh1 = world.stock.state.locations.filter((l) => l.householdId === 'hh-1')
    expect(hh1.map((l) => l.name)).toEqual(['住家'])
  })

  it('makes "Home" in the same transaction as the deletes: if it fails, nothing is deleted', async () => {
    // Given the "Home" create fails, as a `P2002` from
    // "Location_one_default_per_user_key" would
    const create = world.client.location.create
    const spy = vi
      .spyOn(world.client.location, 'create')
      .mockRejectedValueOnce(Object.assign(new Error('unique'), { code: 'P2002' }))

    // When the owner clears the household
    const res = await run(CLEAR)
    spy.mockRestore()
    expect(world.client.location.create).toBe(create)

    // Then the mutation fails, and the deletes it ran are rolled back
    expect(res.errors).toBeDefined()
    expect(world.stock.state.locations.map((l) => l.id).sort()).toEqual([
      'loc-kitchen',
      'loc-pantry',
      'loc-theirs',
    ])
    expect(world.households.state.locationMembers).toHaveLength(4)
    expect(world.stock.state.itemStocks).toHaveLength(3)
  })
})

describe('clearAllData is owner only', () => {
  for (const role of ['manager', 'member'] as const) {
    it(`household ${role} cannot clear the household, and nothing is deleted`, async () => {
      // Given the caller is a household `${role}` and `other` owns hh-1
      seed(role)

      // When the caller tries to clear it
      const res = await run(CLEAR)

      // Then it is refused before anything runs
      expect(res.errors?.[0]?.extensions?.code).toBe('FORBIDDEN')
      expect(events).toEqual([])
      expect(world.stock.state.locations).toHaveLength(3)
      expect(world.households.state.locationMembers).toHaveLength(4)
    })
  }
})

describe('clearAllData with no household id', () => {
  it('throws before the transaction, so an undefined id cannot become "no filter"', async () => {
    // Given the household lookup answers with no id. Prisma reads
    // `{ householdId: undefined }` as NO filter, so a delete with it would
    // empty that table for every household.
    vi.mocked(requireHousehold).mockResolvedValueOnce(undefined as unknown as string)

    // When the caller clears
    const res = await run(CLEAR)

    // Then it fails with the guard's own message, and nothing ran: no lock,
    // no delete, no role check against an undefined household
    expect(res.errors?.[0]?.message).toBe('clearAllData: no household id')
    expect(events).toEqual([])
    expect(world.stock.state.locations).toHaveLength(3)
  })
})
