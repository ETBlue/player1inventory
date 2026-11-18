import { ApolloServer } from '@apollo/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Context } from '../context.js'
import { resolvers } from '../resolvers/index.js'
import { typeDefs } from '../schema/index.js'
import type { CartFake } from '../test/cartFake.js'
import type { HouseholdWorld } from '../test/householdWorld.js'
import type { InventoryLogFake } from '../test/inventoryLogFake.js'

// The five reads behind an export, scoped to ONE household (households H4
// task E.5, decision T15): `locations`, `inventoryLogs`, `allCarts`,
// `allCartItems` and `allItemStocks`.
//
// The design says a cloud export, and the cloud -> local copy, take "what the
// user can read in the ACTIVE household". Before E.5 these reads used
// `locationIdsWithRole(ctx)` with no household, so a person in two
// households (possible after H5) would export the rows of both. Importing
// that file back would then be refused as "another household".
//
// ── THE FIXTURE (H4 plan rule 16) ──
//
// | Location   | Household | ALICE's role | Must ALICE get it, target hh_a? |
// |------------|-----------|--------------|---------------------------------|
// | LOC_A      | hh_a      | organizer    | yes                             |
// | LOC_A_VIEW | hh_a      | viewer       | yes (an export is a read)       |
// | LOC_A_NONE | hh_a      | none         | no                              |
// | LOC_B      | hh_b      | organizer    | no (another household)          |
//
// ALICE is owner of hh_a and manager of hh_b, so her role on LOC_B counts
// (decision H18). Only the household filter can leave LOC_B out. The target
// is pinned through `ctx.requestCache.householdId`. These are queries, and a
// query is not wrapped by `forgetRolesAroundEach`, so the pin holds. (A
// mutation test sets `User.activeHouseholdId` instead: decisions T14 and T15
// of the H5b plan.)
//
// Every location holds one row of each kind, so each read has rows it must
// return and rows it must not.

vi.mock('../lib/prisma.js', async () => {
  const { createHouseholdWorld } = await import('../test/householdWorld.js')
  const { createCartFake } = await import('../test/cartFake.js')
  const { createInventoryLogFake } = await import('../test/inventoryLogFake.js')
  const world = createHouseholdWorld()
  const carts = createCartFake()
  const logs = createInventoryLogFake()
  world.extend(
    { cart: carts.client.cart, cartItem: carts.client.cartItem, inventoryLog: logs.client },
    [carts.state, logs.state] as unknown as Record<string, unknown>[],
  )
  return { prisma: { ...world.client, $world: world, $carts: carts, $logs: logs } }
})

import { prisma } from '../lib/prisma.js'
import { householdMemberRow, householdRow, locationMemberRow } from '../test/householdRows.js'
import { makeInventoryLog } from '../test/inventoryLogFake.js'

const handles = prisma as unknown as { $world: HouseholdWorld; $carts: CartFake; $logs: InventoryLogFake }
const world = handles.$world
const carts = handles.$carts
const logs = handles.$logs

const ALICE = 'user_alice'
const BOB = 'user_bob'
const HH_A = 'hh_a'
const HH_B = 'hh_b'

const LOC_A = 'loc_a'
const LOC_A_VIEW = 'loc_a_view'
const LOC_A_NONE = 'loc_a_none'
const LOC_B = 'loc_b'
const ALL_LOCATIONS = [LOC_A, LOC_A_VIEW, LOC_A_NONE, LOC_B]

const T = new Date('2026-01-01T00:00:00.000Z')

function seed() {
  world.reset()
  world.stock.reset(
    [
      { id: LOC_A, householdId: HH_A, name: 'A', order: 0, createdAt: T, updatedAt: T },
      { id: LOC_A_VIEW, householdId: HH_A, name: 'A view', order: 1, createdAt: T, updatedAt: T },
      { id: LOC_A_NONE, householdId: HH_A, name: 'A none', order: 2, createdAt: T, updatedAt: T },
      { id: LOC_B, householdId: HH_B, name: 'B', order: 0, createdAt: T, updatedAt: T },
    ],
    ALL_LOCATIONS.map((locationId) => ({
      id: `stock_${locationId}`,
      itemId: 'item_1',
      locationId,
      targetQuantity: 1,
      refillThreshold: 0,
      packedQuantity: 1,
      unpackedQuantity: 0,
      dueDate: null,
      createdAt: T,
      updatedAt: T,
    })),
  )
  world.seedHouseholds({
    households: [householdRow(HH_A, ALICE), householdRow(HH_B, BOB)],
    householdMembers: [
      householdMemberRow(HH_A, ALICE, 'owner'),
      householdMemberRow(HH_B, BOB, 'owner'),
      householdMemberRow(HH_B, ALICE, 'manager'),
    ],
    locationMembers: [
      locationMemberRow(LOC_A, ALICE, 'organizer'),
      locationMemberRow(LOC_A_VIEW, ALICE, 'viewer'),
      locationMemberRow(LOC_A_NONE, BOB, 'organizer'),
      locationMemberRow(LOC_B, ALICE, 'organizer'),
    ],
  })
  logs.reset(
    ALL_LOCATIONS.map((locationId) =>
      makeInventoryLog({ id: `log_${locationId}`, itemId: 'item_1', userId: BOB, locationId }),
    ),
  )
  carts.reset({
    carts: ALL_LOCATIONS.map((locationId) => ({
      id: `${locationId}:no-vendor`,
      locationId,
      lastPurchasedAt: null,
    })),
    cartItems: ALL_LOCATIONS.map((locationId) => ({
      id: `ci_${locationId}`,
      cartId: `${locationId}:no-vendor`,
      itemId: 'item_1',
      quantity: 1,
      userId: BOB,
    })),
  })
}

beforeEach(() => {
  seed()
})

const server = new ApolloServer<Context>({ typeDefs, resolvers })

/** Run as ALICE, with the target household pinned (H4 plan rule 16). */
async function read<T>(query: string, householdId: string): Promise<T> {
  const contextValue: Context = { userId: ALICE, requestCache: { householdId: Promise.resolve(householdId) } }
  const res = await server.executeOperation({ query }, { contextValue })
  if (res.body.kind !== 'single') throw new Error('expected a single result')
  const { data, errors } = res.body.singleResult
  if (errors) throw new Error(JSON.stringify(errors))
  return data as T
}

const READS: Array<{ field: string; query: string; ids: (locationIds: string[]) => string[] }> = [
  { field: 'locations', query: '{ locations { id } }', ids: (l) => l },
  { field: 'allItemStocks', query: '{ allItemStocks { id } }', ids: (l) => l.map((x) => `stock_${x}`) },
  { field: 'inventoryLogs', query: '{ inventoryLogs { id } }', ids: (l) => l.map((x) => `log_${x}`) },
  { field: 'allCarts', query: '{ allCarts { id } }', ids: (l) => l.map((x) => `${x}:no-vendor`) },
  { field: 'allCartItems', query: '{ allCartItems { id } }', ids: (l) => l.map((x) => `ci_${x}`) },
]

describe('the export reads give the active household only (H4 task E.5)', () => {
  for (const { field, query, ids } of READS) {
    it(`${field}: target hh_a gives hh_a's locations with a role, not the role-less one, not hh_b's`, async () => {
      // Given ALICE holds roles in hh_a and hh_b, and hh_a is the target
      // When she reads
      const data = await read<Record<string, Array<{ id: string }>>>(query, HH_A)

      // Then she gets the rows of the two hh_a locations she has a role on
      const got = (data[field] ?? []).map((r) => r.id).sort()
      expect(got).toEqual(ids([LOC_A, LOC_A_VIEW]).sort())
      // And not the hh_a location she has no role on, nor hh_b's
      expect(got).not.toContain(ids([LOC_A_NONE])[0])
      expect(got).not.toContain(ids([LOC_B])[0])
    })

    it(`${field}: target hh_b gives hh_b's location only`, async () => {
      // Given the same person, with hh_b as the target
      const data = await read<Record<string, Array<{ id: string }>>>(query, HH_B)

      // Then only hh_b's row comes back
      expect((data[field] ?? []).map((r) => r.id)).toEqual(ids([LOC_B]))
    })
  }
})
