import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApolloServer } from '@apollo/server'
import { typeDefs } from '../schema/index.js'
import { resolvers } from '../resolvers/index.js'
import type { Context } from '../context.js'
import type { CartFake, CartItemRow, CartRow } from '../test/cartFake.js'
import type { HouseholdWorld } from '../test/householdWorld.js'
import { type ChangeEvent, liveEvents } from '../lib/liveEvents.js'

// The `CART` events of the cart mutations (households H3c-1, task C.4,
// decision P5 of the plan).
//
// ── HOW THE BUS IS WATCHED ──
//
// A recording listener subscribed to the DEFAULT bus (`liveEvents`), the one
// the resolvers publish on, and removed after each test. Not a `vi.spyOn` on
// `publish`: a listener sees exactly what a socket would see, and it can read
// the fake stores at the moment of the publish (`inTransaction` below).
// Not an injected bus: the resolvers take no bus argument, and adding one
// only for tests would be a second path that production never uses.
//
// ── THE FIXTURE ──
//
// | Person   | Households                         | Location roles                          |
// |----------|------------------------------------|-----------------------------------------|
// | ALICE    | hh_home owner, hh_second member    | LOC_HOME, LOC_GARAGE organizer;         |
// |          |                                    | LOC_SECOND participant                  |
// | BOB      | hh_home member                     | LOC_HOME participant                    |
// | VERA     | hh_home member                     | LOC_HOME viewer                         |
// | CAROL    | hh_second owner                    | LOC_SECOND organizer                    |
// | STRANGER | hh_other owner                     | LOC_STRANGER organizer                  |
//
// TWO locations in ALICE's first household, so an event with the wrong
// `locationId` is visible. And ALICE is in a SECOND household, listed after
// the first, so `requireHousehold(ALICE)` answers `hh_home` while LOC_SECOND
// belongs to `hh_second`. An event that carried the caller's household
// instead of the location's would say `hh_home` for a LOC_SECOND change.
// (Nothing in the schema stops a person being in two households; H5 makes it
// real.)

const hooks: {
  /** How many `$transaction` callbacks are running right now. */
  transactionDepth: number
  /** Throws inside checkout's transaction, after the claim. */
  failInsideCheckout?: boolean
  /** The `cartItem.upsert` call number (1-based) that throws. */
  failUpsertNumber?: number
  upsertCalls: number
} = { transactionDepth: 0, upsertCalls: 0 }

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
      { id: 'item_milk', householdId: 'hh_home', amountPerPackage: null },
      { id: 'item_bread', householdId: 'hh_home', amountPerPackage: null },
      { id: 'item_tea', householdId: 'hh_second', amountPerPackage: null },
      { id: 'item_theirs', householdId: 'hh_other', amountPerPackage: null },
    ] as never,
  })
  const vendors = createOwnedRowFake({ model: 'Vendor', scope: 'householdId' })
  const worldTransaction = world.client.$transaction
  world.extend(
    {
      cart: carts.client.cart,
      cartItem: {
        ...carts.client.cartItem,
        upsert: async (args: Parameters<typeof carts.client.cartItem.upsert>[0]) => {
          hooks.upsertCalls += 1
          if (hooks.upsertCalls === hooks.failUpsertNumber) throw new Error('upsert failed on purpose')
          return carts.client.cartItem.upsert(args)
        },
      },
      inventoryLog: logs.client,
      item: {
        ...items.client,
        // `findMany` with `amountPerPackage` is checkout's read after the
        // claim. `failInsideCheckout` throws there, inside the callback.
        findMany: async (args: Parameters<typeof items.client.findMany>[0]) => {
          if (hooks.failInsideCheckout && hooks.transactionDepth > 0) {
            throw new Error('inside the transaction, on purpose')
          }
          return items.client.findMany(args)
        },
      },
      vendor: vendors.client,
      // Counts the open callbacks, so a listener can see whether it was
      // called while a transaction was still running.
      $transaction: async (arg: unknown) => {
        hooks.transactionDepth += 1
        try {
          return await worldTransaction(arg)
        } finally {
          hooks.transactionDepth -= 1
        }
      },
    },
    [
      carts.state as unknown as Record<string, unknown>,
      logs.state as unknown as Record<string, unknown>,
    ],
  )
  return { prisma: { ...world.client, $world: world, $carts: carts, $vendors: vendors } }
})

import { prisma } from '../lib/prisma.js'
import { householdMemberRow, householdRow, locationMemberRow } from '../test/householdRows.js'
import { makeStock } from '../test/stockFake.js'

const handles = prisma as unknown as {
  $world: HouseholdWorld
  $carts: CartFake
  $vendors: { state: { rows: Array<Record<string, unknown>> } }
}
const world = handles.$world
const carts = handles.$carts
const vendors = handles.$vendors

const ALICE = 'user_alice'
const BOB = 'user_bob'
const VERA = 'user_vera'
const CAROL = 'user_carol'
const STRANGER = 'user_stranger'

const LOC_HOME = 'loc_home'
const LOC_GARAGE = 'loc_garage'
const LOC_SECOND = 'loc_second'
const LOC_STRANGER = 'loc_stranger'

const HOME_CART = `${LOC_HOME}:no-vendor`
const HOME_VENDOR_CART = `${LOC_HOME}:ven_1`
const GARAGE_CART = `${LOC_GARAGE}:no-vendor`
const GARAGE_VENDOR_CART = `${LOC_GARAGE}:ven_1`
const SECOND_CART = `${LOC_SECOND}:no-vendor`
const STRANGER_CART = `${LOC_STRANGER}:no-vendor`

const TAB = 'tab-alice-1'

function cartRow(id: string, locationId: string): CartRow {
  return { id, locationId, lastPurchasedAt: null }
}

function row(id: string, cartId: string, itemId: string, quantity: number, userId: string): CartItemRow {
  return { id, cartId, itemId, quantity, userId }
}

function seed() {
  hooks.transactionDepth = 0
  hooks.failInsideCheckout = undefined
  hooks.failUpsertNumber = undefined
  hooks.upsertCalls = 0
  world.reset()
  world.stock.reset(
    [
      { id: LOC_HOME, householdId: 'hh_home' },
      { id: LOC_GARAGE, householdId: 'hh_home' },
      { id: LOC_SECOND, householdId: 'hh_second' },
      { id: LOC_STRANGER, householdId: 'hh_other' },
    ],
    [makeStock({ id: 'st_milk_home', itemId: 'item_milk', locationId: LOC_HOME, packedQuantity: 2 })],
  )
  world.seedHouseholds({
    households: [
      householdRow('hh_home', ALICE),
      householdRow('hh_second', CAROL),
      householdRow('hh_other', STRANGER),
    ],
    householdMembers: [
      // ALICE's hh_home row FIRST, so `requireHousehold(ALICE)` is hh_home.
      householdMemberRow('hh_home', ALICE, 'owner'),
      householdMemberRow('hh_home', BOB, 'member'),
      householdMemberRow('hh_home', VERA, 'member'),
      householdMemberRow('hh_second', CAROL, 'owner'),
      householdMemberRow('hh_second', ALICE, 'member'),
      householdMemberRow('hh_other', STRANGER, 'owner'),
    ],
    locationMembers: [
      locationMemberRow(LOC_HOME, ALICE, 'organizer'),
      locationMemberRow(LOC_GARAGE, ALICE, 'organizer'),
      locationMemberRow(LOC_SECOND, ALICE, 'participant'),
      locationMemberRow(LOC_HOME, BOB, 'participant'),
      locationMemberRow(LOC_HOME, VERA, 'viewer'),
      locationMemberRow(LOC_SECOND, CAROL, 'organizer'),
      locationMemberRow(LOC_STRANGER, STRANGER, 'organizer'),
    ],
  })
  vendors.state.rows = [
    { id: 'ven_1', householdId: 'hh_home', name: 'Market' },
    { id: 'ven_empty', householdId: 'hh_home', name: 'No carts' },
    { id: 'ven_2', householdId: 'hh_second', name: 'Tea shop' },
  ]
  carts.reset({
    carts: [
      cartRow(HOME_CART, LOC_HOME),
      cartRow(HOME_VENDOR_CART, LOC_HOME),
      cartRow(GARAGE_CART, LOC_GARAGE),
      cartRow(GARAGE_VENDOR_CART, LOC_GARAGE),
      cartRow(SECOND_CART, LOC_SECOND),
      cartRow(STRANGER_CART, LOC_STRANGER),
    ],
    cartItems: [
      row('ci_home_milk', HOME_CART, 'item_milk', 1, ALICE),
      row('ci_garage_bread', GARAGE_CART, 'item_bread', 2, ALICE),
      row('ci_garage_vendor_milk', GARAGE_VENDOR_CART, 'item_milk', 1, ALICE),
      row('ci_second_tea', SECOND_CART, 'item_tea', 1, CAROL),
    ],
  })
}

// ─── the recording listener ──────────────────────────────────────────────────

type Seen = { event: ChangeEvent; inTransaction: boolean; cartItemIds: string[] }
let seen: Seen[] = []
let unsubscribe: () => void = () => undefined

beforeEach(() => {
  seed()
  seen = []
  unsubscribe = liveEvents.subscribe((event) => {
    seen.push({
      event,
      inTransaction: hooks.transactionDepth > 0,
      cartItemIds: carts.state.cartItems.map((r) => r.id).sort(),
    })
  })
})

afterEach(() => {
  unsubscribe()
})

function events(): ChangeEvent[] {
  return seen.map((s) => s.event)
}

/** The events, sorted by location, so a batch's order does not matter. */
function eventsByLocation(): ChangeEvent[] {
  return events().sort((a, b) => (a.locationId ?? '').localeCompare(b.locationId ?? ''))
}

/** `null` means "no tab id". Not `undefined`, which would take the default. */
function cart(locationId: string, householdId: string, sourceClientId: string | null = TAB): ChangeEvent {
  return {
    kind: 'CART',
    householdId,
    locationId,
    ...(sourceClientId === null ? {} : { sourceClientId }),
  }
}

// ─── running a mutation ──────────────────────────────────────────────────────

const server = new ApolloServer<Context>({ typeDefs, resolvers })

async function run(
  query: string,
  variables: Record<string, unknown>,
  userId: string,
  clientId: string | null = TAB,
) {
  const contextValue: Context = { userId, ...(clientId === null ? {} : { clientId }) }
  const res = await server.executeOperation({ query, variables }, { contextValue })
  if (res.body.kind !== 'single') throw new Error('expected a single result')
  return res.body.singleResult
}

function code(res: { errors?: ReadonlyArray<{ extensions?: Record<string, unknown> }> }) {
  return res.errors?.[0]?.extensions?.code
}

const ADD = `mutation M($c: ID!, $i: ID!, $q: Int!) { addToCart(cartId: $c, itemId: $i, quantity: $q) { id } }`
const UPDATE = `mutation M($id: ID!, $q: Int!) { updateCartItem(id: $id, quantity: $q) { id } }`
const REMOVE = `mutation M($id: ID!) { removeFromCart(id: $id) }`
const ABANDON = `mutation M($c: ID!) { abandonCart(cartId: $c) { id } }`
const CHECKOUT = `mutation M($c: ID!, $items: [CheckoutItemInput!]!) { checkout(cartId: $c, items: $items) { id } }`
const BOOTSTRAP = `mutation M($l: ID!) { bootstrapCarts(locationId: $l) { id } }`
const DELETE_VENDOR = `mutation M($id: ID!) { deleteVendor(id: $id) }`
const BULK_CREATE_CARTS = `mutation M($carts: [ShoppingCartInput!]!) { bulkCreateShoppingCarts(carts: $carts) { id } }`
const BULK_UPSERT_CARTS = `mutation M($carts: [ShoppingCartInput!]!) { bulkUpsertShoppingCarts(carts: $carts) { id } }`
const BULK_CREATE_ITEMS = `mutation M($rows: [CartItemInput!]!) { bulkCreateCartItems(cartItems: $rows) { id } }`
const BULK_UPSERT_ITEMS = `mutation M($rows: [CartItemInput!]!) { bulkUpsertCartItems(cartItems: $rows) { id } }`

// ─── the four row mutations ──────────────────────────────────────────────────

describe('the cart row mutations publish CART once, for the cart\'s location', () => {
  it('addToCart', async () => {
    const res = await run(ADD, { c: GARAGE_CART, i: 'item_milk', q: 2 }, ALICE)

    expect(res.errors).toBeUndefined()
    expect(events()).toEqual([cart(LOC_GARAGE, 'hh_home')])
  })

  it('addToCart with no tab id publishes with no sourceClientId', async () => {
    await run(ADD, { c: HOME_CART, i: 'item_bread', q: 1 }, ALICE, null)

    // Exactly this object: the key is absent, not `undefined`.
    expect(events()).toStrictEqual([cart(LOC_HOME, 'hh_home', null)])
    expect(Object.keys(events()[0] ?? {})).not.toContain('sourceClientId')
  })

  it('the event carries the LOCATION\'s household, not the caller\'s', async () => {
    // Given ALICE's household (by `requireHousehold`) is hh_home, and
    // LOC_SECOND belongs to hh_second
    const res = await run(ADD, { c: SECOND_CART, i: 'item_tea', q: 1 }, ALICE)

    expect(res.errors).toBeUndefined()
    expect(events()).toEqual([cart(LOC_SECOND, 'hh_second')])
  })

  it('updateCartItem', async () => {
    const res = await run(UPDATE, { id: 'ci_garage_bread', q: 5 }, ALICE)

    expect(res.errors).toBeUndefined()
    expect(events()).toEqual([cart(LOC_GARAGE, 'hh_home')])
  })

  it('removeFromCart', async () => {
    const res = await run(REMOVE, { id: 'ci_garage_bread' }, ALICE)

    expect(res.data?.removeFromCart).toBe(true)
    expect(events()).toEqual([cart(LOC_GARAGE, 'hh_home')])
  })

  it('abandonCart', async () => {
    const res = await run(ABANDON, { c: GARAGE_CART }, ALICE)

    expect(res.errors).toBeUndefined()
    expect(events()).toEqual([cart(LOC_GARAGE, 'hh_home')])
  })

  it('abandonCart of a cart that was already empty publishes nothing', async () => {
    const res = await run(ABANDON, { c: HOME_VENDOR_CART }, ALICE)

    expect(res.errors).toBeUndefined()
    expect(events()).toEqual([])
  })
})

describe('a call that changes nothing publishes nothing', () => {
  it('a viewer refused by the role check', async () => {
    const res = await run(ADD, { c: HOME_CART, i: 'item_milk', q: 1 }, VERA)

    expect(code(res)).toBe('FORBIDDEN')
    expect(events()).toEqual([])
  })

  it('a stranger\'s updateCartItem and removeFromCart', async () => {
    const updated = await run(UPDATE, { id: 'ci_home_milk', q: 9 }, STRANGER)
    const removed = await run(REMOVE, { id: 'ci_home_milk' }, STRANGER)

    expect(code(updated)).toBe('NOT_FOUND')
    expect(removed.data?.removeFromCart).toBe(false)
    expect(events()).toEqual([])
  })
})

// ─── checkout ────────────────────────────────────────────────────────────────

describe('checkout', () => {
  it('publishes CART once, after the transaction has committed', async () => {
    const res = await run(CHECKOUT, { c: HOME_CART, items: [{ cartItemId: 'ci_home_milk', quantity: 1 }] }, BOB)

    expect(res.errors).toBeUndefined()
    expect(events()).toEqual([cart(LOC_HOME, 'hh_home')])
    // No transaction was open when the listener ran, and the claimed row was
    // already gone from the store.
    expect(seen[0]?.inTransaction).toBe(false)
    expect(seen[0]?.cartItemIds).not.toContain('ci_home_milk')
  })

  it('a checkout refused with CART_CHANGED publishes nothing', async () => {
    // The screen showed 3; the cart holds 1.
    const res = await run(CHECKOUT, { c: HOME_CART, items: [{ cartItemId: 'ci_home_milk', quantity: 3 }] }, BOB)

    expect(code(res)).toBe('CART_CHANGED')
    expect(events()).toEqual([])
  })

  it('a checkout whose transaction throws after the claim publishes nothing', async () => {
    hooks.failInsideCheckout = true

    const res = await run(CHECKOUT, { c: HOME_CART, items: [{ cartItemId: 'ci_home_milk', quantity: 1 }] }, BOB)

    expect(res.errors).toBeDefined()
    // Rolled back: the row the claim deleted is back.
    expect(carts.state.cartItems.map((r) => r.id)).toContain('ci_home_milk')
    expect(events()).toEqual([])
  })
})

// ─── bootstrapCarts ──────────────────────────────────────────────────────────

describe('bootstrapCarts', () => {
  it('publishes CART when it made a cart', async () => {
    // Given LOC_SECOND has no cart for hh_second's vendor ven_2
    const res = await run(BOOTSTRAP, { l: LOC_SECOND }, ALICE)

    expect(res.errors).toBeUndefined()
    expect(carts.state.carts.map((c) => c.id)).toContain(`${LOC_SECOND}:ven_2`)
    expect(events()).toEqual([cart(LOC_SECOND, 'hh_second')])
  })

  it('publishes nothing when every cart was already there', async () => {
    // LOC_GARAGE already has the no-vendor cart, `ven_1`'s cart is there
    // too; only `ven_empty` has none, so take it away first.
    vendors.state.rows = vendors.state.rows.filter((v) => v.id !== 'ven_empty')

    const res = await run(BOOTSTRAP, { l: LOC_GARAGE }, ALICE)

    expect(res.errors).toBeUndefined()
    expect(events()).toEqual([])
  })
})

// ─── deleteVendor ────────────────────────────────────────────────────────────

describe('deleteVendor', () => {
  it('publishes CART for each location whose carts it deleted', async () => {
    const res = await run(DELETE_VENDOR, { id: 'ven_1' }, ALICE)

    expect(res.data?.deleteVendor).toBe(true)
    expect(eventsByLocation()).toEqual([cart(LOC_GARAGE, 'hh_home'), cart(LOC_HOME, 'hh_home')])
  })

  it('publishes nothing for a vendor with no carts', async () => {
    const res = await run(DELETE_VENDOR, { id: 'ven_empty' }, ALICE)

    expect(res.data?.deleteVendor).toBe(true)
    expect(events()).toEqual([])
  })

  it('publishes nothing when the household role check refuses it', async () => {
    // BOB is only a household `member`; deleting a vendor needs `manager`.
    const res = await run(DELETE_VENDOR, { id: 'ven_1' }, BOB)

    expect(code(res)).toBe('FORBIDDEN')
    expect(events()).toEqual([])
  })
})

// ─── the four imports ────────────────────────────────────────────────────────

describe('the cart imports publish one CART per location touched', () => {
  it('bulkCreateShoppingCarts over two locations', async () => {
    const res = await run(
      BULK_CREATE_CARTS,
      {
        carts: [
          { id: `${LOC_HOME}:ven_a` },
          { id: `${LOC_HOME}:ven_b` },
          { id: `${LOC_GARAGE}:ven_a` },
          // Already there: skipped, so it adds no location of its own.
          { id: SECOND_CART },
        ],
      },
      ALICE,
    )

    expect(res.errors).toBeUndefined()
    expect(eventsByLocation()).toEqual([cart(LOC_GARAGE, 'hh_home'), cart(LOC_HOME, 'hh_home')])
  })

  it('bulkUpsertShoppingCarts over two locations', async () => {
    const res = await run(
      BULK_UPSERT_CARTS,
      { carts: [{ id: HOME_CART }, { id: HOME_VENDOR_CART }, { id: SECOND_CART }] },
      ALICE,
    )

    expect(res.errors).toBeUndefined()
    expect(eventsByLocation()).toEqual([cart(LOC_HOME, 'hh_home'), cart(LOC_SECOND, 'hh_second')])
  })

  it('bulkCreateCartItems over two locations', async () => {
    const res = await run(
      BULK_CREATE_ITEMS,
      {
        rows: [
          { id: 'new_1', cartId: HOME_CART, itemId: 'item_bread', quantity: 1 },
          { id: 'new_2', cartId: HOME_VENDOR_CART, itemId: 'item_milk', quantity: 1 },
          { id: 'new_3', cartId: SECOND_CART, itemId: 'item_tea', quantity: 2 },
        ],
      },
      ALICE,
    )

    expect(res.errors).toBeUndefined()
    expect(eventsByLocation()).toEqual([cart(LOC_HOME, 'hh_home'), cart(LOC_SECOND, 'hh_second')])
  })

  it('bulkUpsertCartItems over two locations', async () => {
    const res = await run(
      BULK_UPSERT_ITEMS,
      {
        rows: [
          { id: 'ci_home_milk', cartId: HOME_CART, itemId: 'item_milk', quantity: 4 },
          { id: 'new_4', cartId: GARAGE_CART, itemId: 'item_milk', quantity: 1 },
        ],
      },
      ALICE,
    )

    expect(res.errors).toBeUndefined()
    expect(eventsByLocation()).toEqual([cart(LOC_GARAGE, 'hh_home'), cart(LOC_HOME, 'hh_home')])
  })

  it('a batch whose every row is skipped publishes nothing', async () => {
    // Another household's item: the row is skipped, nothing is written.
    const res = await run(
      BULK_CREATE_ITEMS,
      { rows: [{ id: 'new_5', cartId: HOME_CART, itemId: 'item_theirs', quantity: 1 }] },
      ALICE,
    )

    expect(res.data?.bulkCreateCartItems).toEqual([])
    expect(events()).toEqual([])
  })

  it('a batch refused before its first write publishes nothing', async () => {
    // A stranger's live location: the whole batch is FORBIDDEN.
    const res = await run(BULK_CREATE_CARTS, { carts: [{ id: `${LOC_STRANGER}:ven_z` }] }, ALICE)

    expect(code(res)).toBe('FORBIDDEN')
    expect(events()).toEqual([])
  })

  it('a batch that fails part-way publishes the locations it already wrote', async () => {
    // These imports are not one transaction: row 1 is saved before row 2
    // fails, so other tabs must hear about row 1's location.
    hooks.failUpsertNumber = 2

    const res = await run(
      BULK_UPSERT_ITEMS,
      {
        rows: [
          { id: 'ci_home_milk', cartId: HOME_CART, itemId: 'item_milk', quantity: 4 },
          { id: 'new_6', cartId: GARAGE_CART, itemId: 'item_milk', quantity: 1 },
        ],
      },
      ALICE,
    )

    expect(res.errors).toBeDefined()
    expect(carts.state.cartItems.find((r) => r.id === 'ci_home_milk')?.quantity).toBe(4)
    expect(events()).toEqual([cart(LOC_HOME, 'hh_home')])
  })
})
