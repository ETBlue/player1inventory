import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApolloServer } from '@apollo/server'
import { buildCheckoutLogQuantities } from '@p1i/types'
import { typeDefs } from '../schema/index.js'
import { resolvers } from '../resolvers/index.js'
import type { Context } from '../context.js'
import type { CartFake, CartItemRow, CartRow } from '../test/cartFake.js'
import type { HouseholdWorld } from '../test/householdWorld.js'
import type { InventoryLogFake } from '../test/inventoryLogFake.js'

// `checkout` in one transaction (households H3b task B.5, decision D1).
//
// ── WHY A FILE OF ITS OWN ──
//
// `checkout` writes four models (cart rows, stock, logs, the cart) and must
// write all of them or none. So every one of those stores is a STATEFUL fake,
// registered with `runInTransaction` (src/test/stockFake.ts), which restores
// them all when the callback throws. A call recorder cannot show "nothing was
// written"; a store that was not registered would keep the writes of a
// transaction that rolled back, and a rollback test would pass against code
// with no transaction at all.
//
//   - `cart`, `cartItem`: `cartFake` (unique `(cartId, itemId)`, `quantity`
//     filters, THROWS on a `userId` where key: H3b rule 13).
//   - `location`, `itemStock`, roles: `householdWorld`.
//   - `inventoryLog`: `inventoryLogFake`.
//   - `item`: `findMany` over an `ownedRowFake`. The rows carry
//     `amountPerPackage`, which the log total needs.
//
// `cart.resolver.test.ts` keeps `vendorCart` and `allCarts`;
// `cart-shared.resolver.test.ts` keeps the other cart resolvers (task B.4).
//
// ── THE FIXTURE (H3b rules 10 and 14) ──
//
// | Person    | Household | Location roles                                  |
// |-----------|-----------|-------------------------------------------------|
// | ALICE     | hh_home   | LOC_HOME organizer, LOC_GARAGE organizer        |
// | BOB       | hh_home   | LOC_HOME participant, LOC_GARAGE organizer      |
// | VERA      | hh_home   | LOC_HOME viewer                                 |
// | STRANGER  | hh_other  | LOC_STRANGER organizer                          |
//
// The home cart holds a row ALICE added, a row BOB added, and a pinned row.
// With rows from one person only, "rows I added" and "rows in this cart" are
// the same set and a scope test could not fail.
//
// ── WHAT THE FAKE CANNOT SHOW ──
//
// It has no row locks. Two transactions run here at the same time do not wait
// for each other, and a rollback restores the WHOLE store, including writes
// another transaction made meanwhile (see `householdWorld.ts`). So the race
// between two checkouts is staged in two ways that the fake CAN model:
//
//   - one checkout after the other, from the same screen (the same input);
//   - a change made between the read and the claim, through `beforeClaim`
//     below. That is the state Postgres's re-check sees when another
//     transaction commits while this one waits for the row lock.
//
// What it cannot show is the lock wait itself. That needs real Postgres.

const hooks: { beforeClaim?: (where: Record<string, unknown>) => void } = {}

vi.mock('../lib/prisma.js', async () => {
  const { createHouseholdWorld } = await import('../test/householdWorld.js')
  const { createCartFake } = await import('../test/cartFake.js')
  const { createInventoryLogFake } = await import('../test/inventoryLogFake.js')
  const { createOwnedRowFake } = await import('../test/ownedRowFake.js')
  const world = createHouseholdWorld()
  const carts = createCartFake()
  const logs = createInventoryLogFake()
  const items = createOwnedRowFake({
    model: 'Item',
    scope: 'householdId',
    rows: [
      // 6 to a pack: the item whose log total a raw sum gets wrong.
      { id: 'item_milk', householdId: 'hh_home', userId: 'user_alice', amountPerPackage: 6 },
      { id: 'item_bread', householdId: 'hh_home', userId: 'user_bob', amountPerPackage: null },
      { id: 'item_eggs', householdId: 'hh_home', userId: 'user_bob', amountPerPackage: null },
    ],
  })
  world.extend(
    {
      cart: carts.client.cart,
      cartItem: {
        ...carts.client.cartItem,
        // The claim is `deleteMany`. `beforeClaim` lets a test change the
        // store between checkout's read and its claim.
        deleteMany: async (args: { where?: Record<string, unknown> } = {}) => {
          hooks.beforeClaim?.(args.where ?? {})
          return carts.client.cartItem.deleteMany(args)
        },
      },
      inventoryLog: logs.client,
      item: { findMany: items.client.findMany },
    },
    [
      carts.state as unknown as Record<string, unknown>,
      logs.state as unknown as Record<string, unknown>,
    ],
  )
  return { prisma: { ...world.client, $world: world, $carts: carts, $logs: logs, $items: items } }
})

import { prisma } from '../lib/prisma.js'
import { householdMemberRow, householdRow, locationMemberRow } from '../test/householdRows.js'
import { makeStock } from '../test/stockFake.js'

const handles = prisma as unknown as {
  $world: HouseholdWorld
  $carts: CartFake
  $logs: InventoryLogFake
  $items: { state: { rows: Array<{ id: string; amountPerPackage?: number | null }> } }
}
const world = handles.$world
const carts = handles.$carts
const logs = handles.$logs
const items = handles.$items

const ALICE = 'user_alice'
const BOB = 'user_bob'
const VERA = 'user_vera'
const STRANGER = 'user_stranger'

const LOC_HOME = 'loc_home'
const LOC_GARAGE = 'loc_garage'
const LOC_STRANGER = 'loc_stranger'

const HOME_CART = `${LOC_HOME}:no-vendor`
const HOME_VENDOR_CART = `${LOC_HOME}:ven_1`
const GARAGE_CART = `${LOC_GARAGE}:no-vendor`
const STRANGER_CART = `${LOC_STRANGER}:no-vendor`

function cartRow(id: string, locationId: string): CartRow {
  return { id, locationId, lastPurchasedAt: null }
}

function row(id: string, cartId: string, itemId: string, quantity: number, userId: string): CartItemRow {
  return { id, cartId, itemId, quantity, userId }
}

// What the home cart's screen shows as being bought: ALICE's milk and BOB's
// bread, not the pinned eggs.
const HOME_INPUT = [
  { cartItemId: 'ci_alice_milk', quantity: 1 },
  { cartItemId: 'ci_bob_bread', quantity: 3 },
]

function seed() {
  hooks.beforeClaim = undefined
  world.reset()
  world.stock.reset(
    [
      { id: LOC_HOME, householdId: 'hh_home' },
      { id: LOC_GARAGE, householdId: 'hh_home' },
      { id: LOC_STRANGER, householdId: 'hh_other' },
    ],
    [
      // Milk at home: 2 packs and 3 loose, 6 to a pack.
      makeStock({ id: 'st_milk_home', itemId: 'item_milk', locationId: LOC_HOME, packedQuantity: 2, unpackedQuantity: 3 }),
      makeStock({ id: 'st_bread_home', itemId: 'item_bread', locationId: LOC_HOME, packedQuantity: 1 }),
      // The same item at two other locations. A write that reached every
      // location, or the wrong one, would change these.
      makeStock({ id: 'st_milk_garage', itemId: 'item_milk', locationId: LOC_GARAGE, packedQuantity: 40 }),
      makeStock({ id: 'st_milk_stranger', itemId: 'item_milk', locationId: LOC_STRANGER, packedQuantity: 99 }),
    ],
  )
  world.seedHouseholds({
    households: [householdRow('hh_home', ALICE), householdRow('hh_other', STRANGER)],
    householdMembers: [
      householdMemberRow('hh_home', ALICE, 'owner'),
      householdMemberRow('hh_home', BOB, 'member'),
      householdMemberRow('hh_home', VERA, 'member'),
      householdMemberRow('hh_other', STRANGER, 'owner'),
    ],
    locationMembers: [
      locationMemberRow(LOC_HOME, ALICE, 'organizer'),
      locationMemberRow(LOC_HOME, BOB, 'participant'),
      locationMemberRow(LOC_HOME, VERA, 'viewer'),
      locationMemberRow(LOC_GARAGE, ALICE, 'organizer'),
      locationMemberRow(LOC_GARAGE, BOB, 'organizer'),
      locationMemberRow(LOC_STRANGER, STRANGER, 'organizer'),
    ],
  })
  carts.reset({
    carts: [
      cartRow(HOME_CART, LOC_HOME),
      cartRow(HOME_VENDOR_CART, LOC_HOME),
      cartRow(GARAGE_CART, LOC_GARAGE),
      cartRow(STRANGER_CART, LOC_STRANGER),
    ],
    cartItems: [
      row('ci_alice_milk', HOME_CART, 'item_milk', 1, ALICE),
      row('ci_bob_bread', HOME_CART, 'item_bread', 3, BOB),
      row('ci_bob_eggs_pinned', HOME_CART, 'item_eggs', 0, BOB),
      // The same location, another cart.
      row('ci_bob_milk_vendor', HOME_VENDOR_CART, 'item_milk', 1, BOB),
      // Another location.
      row('ci_bob_eggs_garage', GARAGE_CART, 'item_eggs', 4, BOB),
      row('ci_stranger_milk', STRANGER_CART, 'item_milk', 7, STRANGER),
    ],
  })
  logs.reset([])
}

const server = new ApolloServer<Context>({ typeDefs, resolvers })

const CHECKOUT = `mutation M($c: ID!, $items: [CheckoutItemInput!]!, $note: String, $logKey: String, $logParams: JSON) {
  checkout(cartId: $c, items: $items, note: $note, logKey: $logKey, logParams: $logParams) { id lastPurchasedAt }
}`

async function checkout(
  input: Array<{ cartItemId: string; quantity: number }>,
  userId: string,
  cartId = HOME_CART,
  extra: Record<string, unknown> = {},
) {
  const res = await server.executeOperation(
    { query: CHECKOUT, variables: { c: cartId, items: input, ...extra } },
    { contextValue: { userId } },
  )
  if (res.body.kind !== 'single') throw new Error('expected a single result')
  return res.body.singleResult
}

function code(res: { errors?: ReadonlyArray<{ extensions?: Record<string, unknown> }> }) {
  return res.errors?.[0]?.extensions?.code
}

function stockAt(itemId: string, locationId: string) {
  return world.stock.state.itemStocks.find((s) => s.itemId === itemId && s.locationId === locationId)
}

function rowIds(cartId: string): string[] {
  return carts.state.cartItems
    .filter((r) => r.cartId === cartId)
    .map((r) => r.id)
    .sort()
}

/** Everything `checkout` can write, as plain data, for a before/after compare. */
function writable() {
  return structuredClone({
    itemStocks: world.stock.state.itemStocks,
    logs: logs.state.logs,
    cartItems: carts.state.cartItems,
    carts: carts.state.carts,
  })
}

beforeEach(() => {
  seed()
})

// ─── a shared cart ───────────────────────────────────────────────────────────

describe('checkout buys every row of a shared cart', () => {
  it('user checking out buys the rows a co-member added too', async () => {
    // Given the home cart holds ALICE's milk (1), BOB's bread (3) and BOB's
    // pinned eggs
    // When ALICE checks out what her screen shows
    const res = await checkout(HOME_INPUT, ALICE)

    // Then both rows are bought: BOB's bread too, not only the row she added
    expect(res.errors).toBeUndefined()
    expect(stockAt('item_milk', LOC_HOME)).toMatchObject({ packedQuantity: 3, unpackedQuantity: 3 })
    expect(stockAt('item_bread', LOC_HOME)?.packedQuantity).toBe(4)

    // And both bought rows are gone, whoever added them. The pinned row stays.
    expect(rowIds(HOME_CART)).toEqual(['ci_bob_eggs_pinned'])

    // And one log per bought row, at the cart's location, written BY ALICE
    // (the person who checked out, not the person who added the row)
    expect(
      logs.state.logs
        .map((l) => ({ itemId: l.itemId, delta: l.delta, userId: l.userId, locationId: l.locationId }))
        .sort((a, b) => a.itemId.localeCompare(b.itemId)),
    ).toEqual([
      { itemId: 'item_bread', delta: 3, userId: ALICE, locationId: LOC_HOME },
      { itemId: 'item_milk', delta: 1, userId: ALICE, locationId: LOC_HOME },
    ])
  })

  it('a location participant can check out, and the rows of other carts and locations stay', async () => {
    // Given BOB is only a participant at LOC_HOME
    const res = await checkout(HOME_INPUT, BOB)

    expect(res.errors).toBeUndefined()
    // Then only the home cart changed
    expect(rowIds(HOME_VENDOR_CART)).toEqual(['ci_bob_milk_vendor'])
    expect(rowIds(GARAGE_CART)).toEqual(['ci_bob_eggs_garage'])
    expect(rowIds(STRANGER_CART)).toEqual(['ci_stranger_milk'])
    // And only the cart's location's stock moved
    expect(stockAt('item_milk', LOC_GARAGE)?.packedQuantity).toBe(40)
    expect(stockAt('item_milk', LOC_STRANGER)?.packedQuantity).toBe(99)
  })

  it('pinned rows stay, and move no stock and write no log', async () => {
    await checkout(HOME_INPUT, ALICE)

    expect(carts.state.cartItems.find((r) => r.id === 'ci_bob_eggs_pinned')).toMatchObject({ quantity: 0 })
    expect(stockAt('item_eggs', LOC_HOME)).toBeUndefined()
    expect(logs.state.logs.some((l) => l.itemId === 'item_eggs')).toBe(false)
  })

  it('user checking out sets lastPurchasedAt, as ISO 8601', async () => {
    const before = Date.now()
    const res = await checkout(HOME_INPUT, ALICE)

    expect(res.errors).toBeUndefined()
    const stamped = (res.data?.checkout as { lastPurchasedAt: string }).lastPurchasedAt
    // ISO 8601, not the epoch-millis string graphql-js would send for a Date
    expect(stamped).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(new Date(stamped).getTime()).toBeGreaterThanOrEqual(before)
    expect(carts.state.carts.find((c) => c.id === HOME_CART)?.lastPurchasedAt).toBeInstanceOf(Date)
  })

  it('the log keeps note, logKey and logParams', async () => {
    await checkout(HOME_INPUT, ALICE, HOME_CART, {
      note: 'purchased at Costco',
      logKey: 'shopping.log.purchasedAt',
      logParams: { vendor: 'Costco' },
    })

    expect(logs.state.logs).toHaveLength(2)
    for (const log of logs.state.logs) {
      expect(log).toMatchObject({
        note: 'purchased at Costco',
        logKey: 'shopping.log.purchasedAt',
        logParams: { vendor: 'Costco' },
      })
    }
  })
})

// ─── CART_CHANGED ────────────────────────────────────────────────────────────
//
// One test per cause. Each asserts the error code AND that nothing was written:
// no stock, no log, no cart row removed, no `lastPurchasedAt`.

describe('checkout refuses with CART_CHANGED when the screen does not match the cart', () => {
  const CAUSES: Array<{ name: string; input: Array<{ cartItemId: string; quantity: number }> }> = [
    {
      name: 'an id no row holds',
      input: [...HOME_INPUT, { cartItemId: 'ci_nobody', quantity: 1 }],
    },
    {
      name: "a row of another cart at the same location",
      input: [...HOME_INPUT, { cartItemId: 'ci_bob_milk_vendor', quantity: 1 }],
    },
    {
      name: 'a pinned row (amount 0), which is not being bought',
      input: [...HOME_INPUT, { cartItemId: 'ci_bob_eggs_pinned', quantity: 0 }],
    },
    {
      name: 'an amount that differs from the stored amount',
      input: [
        { cartItemId: 'ci_alice_milk', quantity: 1 },
        { cartItemId: 'ci_bob_bread', quantity: 2 },
      ],
    },
    {
      name: 'the same id twice',
      input: [...HOME_INPUT, { cartItemId: 'ci_bob_bread', quantity: 3 }],
    },
    {
      name: 'a row being bought that the input leaves out (a co-member added it later)',
      input: [{ cartItemId: 'ci_alice_milk', quantity: 1 }],
    },
    {
      name: 'an empty list while the cart has rows being bought',
      input: [],
    },
  ]

  for (const cause of CAUSES) {
    it(`${cause.name} is refused, and nothing is written`, async () => {
      const before = writable()

      const res = await checkout(cause.input, ALICE)

      expect(code(res)).toBe('CART_CHANGED')
      expect(writable()).toEqual(before)
    })
  }

  it('an empty list for a cart with nothing being bought is accepted, as before: no stock, no log', async () => {
    // Given a cart holding only a pinned row. The web's Done button is
    // disabled here, so only a direct API call can reach this. It kept its
    // pre-B.5 answer: success, with only `lastPurchasedAt` stamped.
    carts.reset({
      carts: [cartRow(HOME_CART, LOC_HOME)],
      cartItems: [row('ci_bob_eggs_pinned', HOME_CART, 'item_eggs', 0, BOB)],
    })
    const stockBefore = structuredClone(world.stock.state.itemStocks)

    const ok = await checkout([], ALICE)

    expect(ok.errors).toBeUndefined()
    expect(world.stock.state.itemStocks).toEqual(stockBefore)
    expect(logs.state.logs).toHaveLength(0)
    expect(rowIds(HOME_CART)).toEqual(['ci_bob_eggs_pinned'])
  })
})

// ─── two checkouts of the same rows ──────────────────────────────────────────

describe('checkout counts a purchase once', () => {
  it('two checkouts from the same screen: the second is refused, and the stock is counted once', async () => {
    // Given ALICE and BOB both have the home cart open, showing the same rows
    // When ALICE checks out, then BOB presses checkout on his (now old) screen
    const first = await checkout(HOME_INPUT, ALICE)
    const second = await checkout(HOME_INPUT, BOB)

    // Then the first is bought and the second is refused
    expect(first.errors).toBeUndefined()
    expect(code(second)).toBe('CART_CHANGED')

    // And the purchase is in stock once: 2 + 1 packs of milk, 1 + 3 bread
    expect(stockAt('item_milk', LOC_HOME)?.packedQuantity).toBe(3)
    expect(stockAt('item_bread', LOC_HOME)?.packedQuantity).toBe(4)
    expect(logs.state.logs).toHaveLength(2)
  })

  // The two tests below stage what Postgres's re-check sees: a change that
  // ANOTHER transaction committed after this checkout read the rows and
  // before it claimed them. `beforeClaim` makes the change at the first claim.
  //
  // The fake's rollback restores that change too, which Postgres would not
  // do (the other transaction committed). So these assert only the refusal,
  // the stock and the logs, never the cart rows.

  it('rows another checkout bought between the read and the claim are refused, and no stock is added', async () => {
    // Given another checkout of the same rows commits while this one waits
    hooks.beforeClaim = () => {
      hooks.beforeClaim = undefined
      carts.state.cartItems = carts.state.cartItems.filter((r) => r.quantity === 0 || r.cartId !== HOME_CART)
    }
    const stockBefore = structuredClone(world.stock.state.itemStocks)

    // When this checkout reaches its claim
    const res = await checkout(HOME_INPUT, ALICE)

    // Then the claim deletes 0 rows and the checkout is refused: the rows
    // were already bought, so their stock must not be added a second time
    expect(code(res)).toBe('CART_CHANGED')
    expect(world.stock.state.itemStocks).toEqual(stockBefore)
    expect(logs.state.logs).toHaveLength(0)
  })

  it('an amount a co-member changed between the read and the claim is refused', async () => {
    // Given BOB changes the bread from 3 to 5 while ALICE's checkout waits
    hooks.beforeClaim = () => {
      hooks.beforeClaim = undefined
      const bread = carts.state.cartItems.find((r) => r.id === 'ci_bob_bread')
      if (bread) bread.quantity = 5
    }
    const stockBefore = structuredClone(world.stock.state.itemStocks)

    // When ALICE's checkout claims the rows it read, at the amounts it read
    const res = await checkout(HOME_INPUT, ALICE)

    // Then the claim names amount 3, finds no such row, and refuses. Buying
    // 5 would buy an amount nobody saw; buying 3 would leave the row behind.
    expect(code(res)).toBe('CART_CHANGED')
    expect(world.stock.state.itemStocks).toEqual(stockBefore)
    expect(logs.state.logs).toHaveLength(0)
  })
})

// ─── roles ───────────────────────────────────────────────────────────────────

describe('checkout needs location role participant', () => {
  it('a location viewer cannot check out, and nothing is written', async () => {
    const before = writable()
    const res = await checkout(HOME_INPUT, VERA)
    expect(code(res)).toBe('FORBIDDEN')
    expect(writable()).toEqual(before)
  })

  it('a stranger gets the same refusal for a real cart as for a cart at a location that does not exist', async () => {
    const before = writable()

    const theirs = await checkout(HOME_INPUT, STRANGER)
    const nowhere = await checkout(HOME_INPUT, STRANGER, 'loc_nowhere:no-vendor')

    // Then the two answers cannot be told apart, so a stranger learns
    // nothing about which carts exist
    expect(code(theirs)).toBe('FORBIDDEN')
    expect(theirs.errors?.[0]?.message).toBe(nowhere.errors?.[0]?.message)
    expect(code(nowhere)).toBe('FORBIDDEN')
    expect(writable()).toEqual(before)
  })
})

// ─── one transaction ─────────────────────────────────────────────────────────

describe('checkout is one transaction', () => {
  it('a stock write that fails on the second item rolls back the first item, its log and the claimed rows', async () => {
    // Given the stock write fails for milk. Rows are written in item id
    // order, so bread (first) is written and logged before milk fails.
    const upsert = world.client.itemStock.upsert
    const spy = vi
      .spyOn(world.client.itemStock, 'upsert')
      .mockImplementation(async (args: Parameters<typeof upsert>[0]) => {
        const where = args.where as { itemId_locationId: { itemId: string } }
        if (where.itemId_locationId.itemId === 'item_milk') throw new Error('disk full')
        return upsert(args)
      })
    const before = writable()

    try {
      // When ALICE checks out
      const res = await checkout(HOME_INPUT, ALICE)

      // Then the checkout fails, and nothing it wrote survives: not bread's
      // stock, not bread's log, not the deleted rows, not lastPurchasedAt
      expect(res.errors).toBeDefined()
      expect(spy.mock.calls.map((c) => (c[0].where as { itemId_locationId: { itemId: string } }).itemId_locationId.itemId)).toEqual([
        'item_bread',
        'item_milk',
      ])
      expect(writable()).toEqual(before)
    } finally {
      spy.mockRestore()
    }
  })
})

// ─── the log total ───────────────────────────────────────────────────────────
//
// The server computes the log's `quantity` since task B.5. It must give the
// same number the client used to send, which `buildCheckoutLogQuantities`
// (`@p1i/types`) still computes, for the cases in
// `apps/web/src/lib/checkoutQuantities.test.ts`. Every numeric case sets BOTH
// `amountPerPackage` AND a non-zero `unpackedQuantity`, or no fixture could
// tell the right rule from a raw sum.
//
// | Web case                                   | Here                                         |
// |--------------------------------------------|----------------------------------------------|
// | packs, 2 + 3/6, buy 1 → 3.5                 | the same                                     |
// | packs, buy 0.5 → 3                          | the same                                     |
// | no amountPerPackage, 2 + 3 + 1 → 6          | the same                                     |
// | a pinned row gets no entry                  | a pinned row gets no log (test above)        |
// | an item missing from the page is skipped    | not possible on the server: the item is read |
// |                                            | from `Item`. Nearest case: an item with no   |
// |                                            | stock row here yet logs just the amount      |
// | an empty cart gives no entries              | an empty checkout writes no log (test above) |

describe('checkout logs the on-hand total, computed on the server', () => {
  const CASES = [
    { name: 'an item sold in packs logs the converted total, not the raw sum', amountPerPackage: 6, buy: 1, total: 3.5, rawSum: 6 },
    { name: 'a fractional pack is added in packs', amountPerPackage: 6, buy: 0.5, total: 3, rawSum: 5.5 },
    { name: 'an item with no amountPerPackage logs the plain sum', amountPerPackage: null, buy: 1, total: 6, rawSum: 6 },
  ]

  for (const c of CASES) {
    it(`user checking out: ${c.name}`, async () => {
      // Given milk at home holds 2 packed and 3 loose, with the case's
      // amountPerPackage, and the cart buys `buy` of it
      const milkRow = items.state.rows.find((r) => r.id === 'item_milk')
      if (!milkRow) throw new Error('fixture: item_milk missing')
      const savedApp = milkRow.amountPerPackage
      milkRow.amountPerPackage = c.amountPerPackage
      carts.reset({
        carts: [cartRow(HOME_CART, LOC_HOME)],
        cartItems: [row('ci_milk', HOME_CART, 'item_milk', c.buy, BOB)],
      })

      try {
        const res = await checkout([{ cartItemId: 'ci_milk', quantity: c.buy }], ALICE)
        expect(res.errors).toBeUndefined()

        // Then the log total is the old client rule's answer
        const expected = buildCheckoutLogQuantities(
          [{ itemId: 'item_milk', quantity: c.buy }],
          [{ id: 'item_milk', packedQuantity: 2, unpackedQuantity: 3, amountPerPackage: c.amountPerPackage ?? undefined }],
        )
        expect(expected).toEqual([{ itemId: 'item_milk', quantity: c.total }])
        expect(logs.state.logs.map((l) => l.quantity)).toEqual([c.total])
        // And not the raw sum, where the two differ
        if (c.rawSum !== c.total) expect(logs.state.logs[0]?.quantity).not.toBe(c.rawSum)
        // And the stock moved by the amount in whole packs; the loose units
        // are not touched. The conversion changes what is LOGGED only.
        expect(stockAt('item_milk', LOC_HOME)).toMatchObject({ packedQuantity: 2 + c.buy, unpackedQuantity: 3 })
      } finally {
        milkRow.amountPerPackage = savedApp
      }
    })
  }

  it('an item with no stock row at the location yet logs just the amount bought', async () => {
    // Given eggs are not stocked at home, and the cart buys 2
    carts.reset({
      carts: [cartRow(HOME_CART, LOC_HOME)],
      cartItems: [row('ci_eggs', HOME_CART, 'item_eggs', 2, BOB)],
    })

    const res = await checkout([{ cartItemId: 'ci_eggs', quantity: 2 }], ALICE)

    expect(res.errors).toBeUndefined()
    expect(stockAt('item_eggs', LOC_HOME)).toMatchObject({ packedQuantity: 2, unpackedQuantity: 0 })
    expect(logs.state.logs.map((l) => l.quantity)).toEqual([2])
  })
})

// ─── the cart's location ─────────────────────────────────────────────────────

describe("checkout writes the CART's location", () => {
  it("user checking out the Garage's cart moves the Garage's stock and logs there", async () => {
    // Given eggs are stocked at the Garage with settings, and not at home
    world.stock.state.itemStocks.push(
      makeStock({ id: 'st_eggs_garage', itemId: 'item_eggs', locationId: LOC_GARAGE, packedQuantity: 10 }),
    )

    const res = await checkout([{ cartItemId: 'ci_bob_eggs_garage', quantity: 4 }], ALICE, GARAGE_CART)

    expect(res.errors).toBeUndefined()
    expect(stockAt('item_eggs', LOC_GARAGE)?.packedQuantity).toBe(14)
    expect(stockAt('item_eggs', LOC_HOME)).toBeUndefined()
    expect(logs.state.logs.map((l) => l.locationId)).toEqual([LOC_GARAGE])
  })

  it('user can check out at a location the item is not stocked in and keep its stock settings', async () => {
    // Given eggs are stocked ONLY at home, with NON-ZERO settings. Non-zero is
    // what lets this fail: with zeros, inheriting and not inheriting agree.
    const due = new Date('2026-12-24T00:00:00.000Z')
    world.stock.state.itemStocks.push(
      makeStock({
        id: 'st_eggs_home',
        itemId: 'item_eggs',
        locationId: LOC_HOME,
        targetQuantity: 7,
        refillThreshold: 3,
        dueDate: due,
        packedQuantity: 40,
      }),
    )

    // When the Garage's cart buys 4
    const res = await checkout([{ cartItemId: 'ci_bob_eggs_garage', quantity: 4 }], ALICE, GARAGE_CART)

    // Then the Garage's new row inherited the settings and zeroed only the
    // quantities, which the purchase then raised to 4. `targetQuantity` 0
    // would mean "not active here" to every reader.
    expect(res.errors).toBeUndefined()
    expect(stockAt('item_eggs', LOC_GARAGE)).toMatchObject({
      targetQuantity: 7,
      refillThreshold: 3,
      dueDate: due,
      packedQuantity: 4,
      unpackedQuantity: 0,
    })
    // And the home row it copied from is untouched
    expect(stockAt('item_eggs', LOC_HOME)).toMatchObject({ packedQuantity: 40, targetQuantity: 7 })
  })
})
