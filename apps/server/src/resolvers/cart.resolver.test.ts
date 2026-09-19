import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApolloServer } from '@apollo/server'
import { typeDefs } from '../schema/index.js'
import { resolvers } from '../resolvers/index.js'
import type { Context } from '../context.js'

// ─── Mock Prisma ─────────────────────────────────────────────────────────────

// `cart` / `cartItem` / `item` / `inventoryLog` stay plain `vi.fn()` call
// recorders — every assertion on them is "was this called with X".
//
// `location` and `itemStock` are a STATEFUL fake instead (src/test/stockFake.ts),
// because checkout's PR-2 dual-write is only meaningful as an end state: the
// interesting questions are "did the row get the increment" and "was a missing
// row created", neither of which a call recorder can answer without restating
// the implementation. The fake enforces `@@unique([itemId, locationId])` and
// models Prisma's `where` semantics — see that file for why both matter.
vi.mock('../lib/prisma.js', async () => {
  const { createStockFake } = await import('../test/stockFake.js')
  const stockFake = createStockFake()
  return {
    prisma: {
      cart: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      cartItem: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        deleteMany: vi.fn(),
      },
      item: {
        update: vi.fn(),
      },
      inventoryLog: {
        create: vi.fn(),
      },
      ...stockFake.client,
      // Handle onto the fake's state, hung off the mocked client because a
      // `vi.mock` factory is hoisted above every import and cannot close over
      // a module-scope binding.
      $stockFake: stockFake,
    },
  }
})

import { prisma } from '../lib/prisma.js'
import { makeStock, type StockFake } from '../test/stockFake.js'

const mockPrisma = prisma as unknown as {
  cart: {
    findFirst: ReturnType<typeof vi.fn>
    findUnique: ReturnType<typeof vi.fn>
    findMany: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
  }
  cartItem: {
    findFirst: ReturnType<typeof vi.fn>
    findMany: ReturnType<typeof vi.fn>
    count: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
    deleteMany: ReturnType<typeof vi.fn>
  }
  item: {
    update: ReturnType<typeof vi.fn>
  }
  inventoryLog: {
    create: ReturnType<typeof vi.fn>
  }
  $stockFake: StockFake
}

const stockFake = mockPrisma.$stockFake

// TWO locations for the checking-out user, plus one belonging to somebody
// else — which is ALSO flagged isDefault. Two different assertions need this:
//
//   - `vendorCart` takes the location it is GIVEN. Its `locationId` is `ID!`
//     since PR 3b Task 4 and the default-location fallback is gone, so the
//     "viewing a NON-default location" test names LOC_OTHER — the only fixture
//     that can tell "the location I asked for" apart from "the caller's
//     default". LOC_STRANGER belongs to somebody else and is ALSO flagged
//     isDefault, which is what makes the FORBIDDEN case real.
//   - Since PR 3b Task 3 `checkout` writes the location its CART id names. One
//     location cannot tell that apart from "the caller's default location"
//     either, so those tests use a cart at LOC_OTHER.
const LOC_DEFAULT = 'loc_kitchen'
const LOC_OTHER = 'loc_garage'
const LOC_STRANGER = 'loc_theirs'

function seedLocations() {
  stockFake.reset(
    [
      // Deliberately NOT first in the array: a mirror that took `locations[0]`
      // instead of the `isDefault` row would still pass with the default first.
      { id: LOC_OTHER, userId: 'user_test123', isDefault: false },
      { id: LOC_DEFAULT, userId: 'user_test123', isDefault: true },
      { id: LOC_STRANGER, userId: 'user_other', isDefault: true },
    ],
    [],
  )
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const now = new Date('2024-01-01T00:00:00.000Z')

function makeCart(overrides: Partial<{
  id: string
  userId: string
  lastPurchasedAt: Date | null
}> = {}) {
  return {
    id: overrides.id ?? `${LOC_DEFAULT}:no-vendor`,
    userId: overrides.userId ?? 'user_test123',
    lastPurchasedAt: overrides.lastPurchasedAt ?? null,
  }
}

function makeCartItem(overrides: Partial<{
  id: string
  cartId: string
  itemId: string
  quantity: number
  userId: string
}> = {}) {
  return {
    id: overrides.id ?? 'cartitem_1',
    cartId: overrides.cartId ?? `${LOC_DEFAULT}:no-vendor`,
    itemId: overrides.itemId ?? 'item_1',
    quantity: overrides.quantity ?? 1,
    userId: overrides.userId ?? 'user_test123',
  }
}

// ─── Test setup ───────────────────────────────────────────────────────────────

let server: ApolloServer<Context>
const ctx: Context = { userId: 'user_test123' }

beforeEach(async () => {
  vi.clearAllMocks()
  seedLocations()
  server = new ApolloServer<Context>({ typeDefs, resolvers })
  await server.start()
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function execOp(query: string, variables?: Record<string, unknown>, context = ctx) {
  const r = await server.executeOperation({ query, variables }, { contextValue: context })
  return r.body.kind === 'single' ? r.body.singleResult : null
}

// ─── vendorCart ──────────────────────────────────────────────────────────────

describe('vendorCart', () => {
  it('user can get existing vendor cart by vendor ID', async () => {
    // Given a cart with the composite id exists, carrying a Prisma `Date`
    const cart = makeCart({ id: `${LOC_DEFAULT}:vendor_1`, lastPurchasedAt: now })
    mockPrisma.cart.findUnique.mockResolvedValue(cart)

    // When querying vendorCart
    const result = await execOp(
      `query VendorCart($vendorId: ID, $locationId: ID!) {
        vendorCart(vendorId: $vendorId, locationId: $locationId) { id lastPurchasedAt }
      }`,
      { vendorId: 'vendor_1', locationId: LOC_DEFAULT },
    )

    // Then the cart is looked up by `${locationId}:${vendorId}`, not by the
    // bare vendor id. A resolver that looked up 'vendor_1' would find nothing,
    // fall into its create branch and make a DUPLICATE cart under the old
    // shape — silently, because Cart.id is a String either way.
    expect(result?.errors).toBeUndefined()
    expect(mockPrisma.cart.findUnique).toHaveBeenCalledWith({
      where: { id: `${LOC_DEFAULT}:vendor_1` },
    })
    const found = result?.data?.vendorCart as { id: string; lastPurchasedAt: string | null }
    expect(found.id).toBe(`${LOC_DEFAULT}:vendor_1`)
    expect(found.lastPurchasedAt).toBe(now.toISOString())
    expect(mockPrisma.cart.create).not.toHaveBeenCalled()
  })

  it('user gets a new vendor cart created if none exists for that vendor', async () => {
    // Given no cart exists for vendor_2
    mockPrisma.cart.findUnique.mockResolvedValue(null)
    const newCart = makeCart({ id: `${LOC_DEFAULT}:vendor_2` })
    mockPrisma.cart.create.mockResolvedValue(newCart)

    // When querying vendorCart
    const result = await execOp(
      `query VendorCart($vendorId: ID, $locationId: ID!) {
        vendorCart(vendorId: $vendorId, locationId: $locationId) { id }
      }`,
      { vendorId: 'vendor_2', locationId: LOC_DEFAULT },
    )

    // Then a new cart is created at the location the caller NAMED. Since
    // Task 4 there is no default-location fallback for it to be confused with;
    // the "viewing a NON-default location" case below is what proves the
    // resolver follows the argument rather than the caller's default.
    expect(result?.errors).toBeUndefined()
    expect(mockPrisma.cart.create).toHaveBeenCalledWith({
      data: { id: `${LOC_DEFAULT}:vendor_2`, userId: 'user_test123', locationId: LOC_DEFAULT },
    })
  })

  it('user gets a new no-vendor cart created if none exists', async () => {
    // Given no cart exists for the no-vendor id in this location
    mockPrisma.cart.findUnique.mockResolvedValue(null)
    const newCart = makeCart({ id: `${LOC_DEFAULT}:no-vendor` })
    mockPrisma.cart.create.mockResolvedValue(newCart)

    // When querying vendorCart with a null vendorId
    const result = await execOp(
      `query VendorCart($vendorId: ID, $locationId: ID!) {
        vendorCart(vendorId: $vendorId, locationId: $locationId) { id lastPurchasedAt }
      }`,
      { vendorId: null, locationId: LOC_DEFAULT },
    )

    // Then the new cart id is `${locationId}:no-vendor`.
    //
    // The location prefix is what fixes the cross-user leak design §5 names:
    // before PR 3b this id was the literal 'no-vendor', one row shared by the
    // whole database, so the first user to open it owned everybody's.
    expect(result?.errors).toBeUndefined()
    const found = result?.data?.vendorCart as { id: string; lastPurchasedAt: string | null }
    expect(found.id).toBe(`${LOC_DEFAULT}:no-vendor`)
    // And a never-purchased cart keeps a null lastPurchasedAt (not epoch 0)
    expect(found.lastPurchasedAt).toBeNull()
    expect(mockPrisma.cart.create).toHaveBeenCalledOnce()
    expect(mockPrisma.cart.create).toHaveBeenCalledWith({
      data: { id: `${LOC_DEFAULT}:no-vendor`, userId: 'user_test123', locationId: LOC_DEFAULT },
    })
  })

  it('null vendorId falls back to no-vendor cart', async () => {
    // Given a no-vendor cart exists in the default location
    const cart = makeCart({ id: `${LOC_DEFAULT}:no-vendor` })
    mockPrisma.cart.findUnique.mockResolvedValue(cart)

    // When querying vendorCart with null vendorId
    const result = await execOp(
      `query VendorCart($vendorId: ID, $locationId: ID!) {
        vendorCart(vendorId: $vendorId, locationId: $locationId) { id }
      }`,
      { vendorId: null, locationId: LOC_DEFAULT },
    )

    // Then the no-vendor cart is returned
    expect(result?.errors).toBeUndefined()
    const found = result?.data?.vendorCart as { id: string }
    expect(found.id).toBe(`${LOC_DEFAULT}:no-vendor`)
  })

  it('user viewing a NON-default location gets that location\'s cart', async () => {
    // Given the caller asks for their Garage, not their Kitchen
    mockPrisma.cart.findUnique.mockResolvedValue(null)
    mockPrisma.cart.create.mockResolvedValue(makeCart({ id: `${LOC_OTHER}:vendor_1` }))

    // When querying vendorCart with an explicit locationId
    const result = await execOp(
      `query VendorCart($vendorId: ID, $locationId: ID!) {
        vendorCart(vendorId: $vendorId, locationId: $locationId) { id }
      }`,
      { vendorId: 'vendor_1', locationId: LOC_OTHER },
    )

    // Then BOTH the lookup and the create name the Garage, not the default.
    // This is the assertion that a single-location fixture could not make.
    expect(result?.errors).toBeUndefined()
    expect(mockPrisma.cart.findUnique).toHaveBeenCalledWith({
      where: { id: `${LOC_OTHER}:vendor_1` },
    })
    expect(mockPrisma.cart.create).toHaveBeenCalledWith({
      data: { id: `${LOC_OTHER}:vendor_1`, userId: 'user_test123', locationId: LOC_OTHER },
    })
  })

  it('omitting locationId is refused — the default-location fallback is gone', async () => {
    // Given a client that sends no locationId. Until PR 3b Task 4 the server
    // fell back to the caller's default location, so a cart opened while
    // viewing the Garage quietly returned the Kitchen's. The field is `ID!`
    // now — see src/schema/cart.graphql.
    mockPrisma.cart.findUnique.mockResolvedValue(null)
    mockPrisma.cart.create.mockResolvedValue(makeCart({ id: `${LOC_DEFAULT}:vendor_1` }))

    // When querying vendorCart without one
    const result = await execOp(
      `query VendorCartNoLocation($vendorId: ID) { vendorCart(vendorId: $vendorId) { id } }`,
      { vendorId: 'vendor_1' },
    )

    // Then the request fails at validation and NO cart is read or written.
    // Loud, at the schema layer, rather than a quiet read of a location the
    // caller did not ask for.
    expect(result?.errors?.[0]?.extensions?.code).toBe('GRAPHQL_VALIDATION_FAILED')
    expect(mockPrisma.cart.findUnique).not.toHaveBeenCalled()
    expect(mockPrisma.cart.create).not.toHaveBeenCalled()
  })

  it("asking for another user's location is FORBIDDEN", async () => {
    // Given LOC_STRANGER belongs to user_other, and is flagged isDefault there
    // When the caller names it
    const result = await execOp(
      `query VendorCart($vendorId: ID, $locationId: ID!) {
        vendorCart(vendorId: $vendorId, locationId: $locationId) { id }
      }`,
      { vendorId: 'vendor_1', locationId: LOC_STRANGER },
    )

    // Then the request is refused before any cart query runs
    expect(result?.errors?.[0]?.extensions?.code).toBe('FORBIDDEN')
    expect(mockPrisma.cart.findUnique).not.toHaveBeenCalled()
    expect(mockPrisma.cart.create).not.toHaveBeenCalled()
  })
})

// ─── allCarts ────────────────────────────────────────────────────────────────

describe('allCarts', () => {
  it('user can get all their carts', async () => {
    // Given two carts exist for the user — one purchased, one never purchased
    const carts = [
      makeCart({ id: `${LOC_DEFAULT}:no-vendor`, lastPurchasedAt: now }),
      makeCart({ id: `${LOC_OTHER}:vendor_1` }),
    ]
    mockPrisma.cart.findMany.mockResolvedValue(carts)

    // When querying allCarts
    const result = await execOp(`query { allCarts { id lastPurchasedAt } }`)

    // Then both carts are returned, each lastPurchasedAt ISO 8601 (or null).
    // `allCarts` feeds useLastPurchasedByVendor() → the shopping page's
    // "last purchased" sort, so the wire format matters here specifically.
    expect(result?.errors).toBeUndefined()
    const found = result?.data?.allCarts as { id: string; lastPurchasedAt: string | null }[]
    expect(found).toHaveLength(2)
    expect(found[0].lastPurchasedAt).toBe(now.toISOString())
    expect(found[1].lastPurchasedAt).toBeNull()
    expect(mockPrisma.cart.findMany).toHaveBeenCalledWith({
      where: { userId: 'user_test123' },
      orderBy: [{ id: 'asc' }],
    })
  })
})

// ─── addToCart ───────────────────────────────────────────────────────────────

describe('addToCart', () => {
  it('user can add a new item to the cart', async () => {
    // Given no existing cart item for this item
    mockPrisma.cartItem.findFirst.mockResolvedValue(null)
    const cartItem = makeCartItem({ itemId: 'item_milk', quantity: 2 })
    mockPrisma.cartItem.create.mockResolvedValue(cartItem)

    // When adding an item
    const result = await execOp(
      `mutation AddToCart($cartId: ID!, $itemId: ID!, $quantity: Int!) {
        addToCart(cartId: $cartId, itemId: $itemId, quantity: $quantity) { id cartId itemId quantity }
      }`,
      { cartId: `${LOC_DEFAULT}:no-vendor`, itemId: 'item_milk', quantity: 2 },
    )

    // Then the cart item is created
    expect(result?.errors).toBeUndefined()
    const created = result?.data?.addToCart as { id: string; cartId: string; itemId: string; quantity: number }
    expect(created.itemId).toBe('item_milk')
    expect(created.quantity).toBe(2)
    expect(mockPrisma.cartItem.create).toHaveBeenCalledOnce()
  })

  it('user can add the same item again — quantity is incremented (upsert)', async () => {
    // Given cart item already exists with quantity 2
    const existing = makeCartItem({ itemId: 'item_milk', quantity: 2 })
    mockPrisma.cartItem.findFirst.mockResolvedValue(existing)
    const updated = makeCartItem({ itemId: 'item_milk', quantity: 5 })
    mockPrisma.cartItem.update.mockResolvedValue(updated)

    // When adding the same item again with quantity 3
    const result = await execOp(
      `mutation AddToCart($cartId: ID!, $itemId: ID!, $quantity: Int!) {
        addToCart(cartId: $cartId, itemId: $itemId, quantity: $quantity) { id quantity }
      }`,
      { cartId: `${LOC_DEFAULT}:no-vendor`, itemId: 'item_milk', quantity: 3 },
    )

    // Then the quantity is incremented to 5
    expect(result?.errors).toBeUndefined()
    const cartItem = result?.data?.addToCart as { id: string; quantity: number }
    expect(cartItem.quantity).toBe(5)
    expect(mockPrisma.cartItem.create).not.toHaveBeenCalled()
    expect(mockPrisma.cartItem.update).toHaveBeenCalledWith({
      where: { id: existing.id },
      data: { quantity: 5 },
    })
  })
})

// ─── updateCartItem ──────────────────────────────────────────────────────────

describe('updateCartItem', () => {
  it('user can update the quantity of a cart item', async () => {
    // Given a cart item exists for this user
    const existing = makeCartItem({ quantity: 2 })
    mockPrisma.cartItem.findFirst.mockResolvedValue(existing)
    const updated = makeCartItem({ quantity: 5 })
    mockPrisma.cartItem.update.mockResolvedValue(updated)

    // When updating the quantity
    const result = await execOp(
      `mutation UpdateCartItem($id: ID!, $quantity: Int!) {
        updateCartItem(id: $id, quantity: $quantity) { id quantity }
      }`,
      { id: 'cartitem_1', quantity: 5 },
    )

    // Then the quantity is updated
    expect(result?.errors).toBeUndefined()
    const cartItem = result?.data?.updateCartItem as { id: string; quantity: number }
    expect(cartItem.quantity).toBe(5)
  })

  it('updating a cart item belonging to another user throws NOT_FOUND', async () => {
    // Given no cart item found for user B
    mockPrisma.cartItem.findFirst.mockResolvedValue(null)

    // When user B tries to update it
    const result = await execOp(
      `mutation UpdateCartItem($id: ID!, $quantity: Int!) {
        updateCartItem(id: $id, quantity: $quantity) { id quantity }
      }`,
      { id: 'cartitem_1', quantity: 99 },
      { userId: 'user_B' },
    )

    // Then a NOT_FOUND error is returned
    expect(result?.errors).toBeDefined()
    expect(result?.errors![0].extensions?.code).toBe('NOT_FOUND')
  })
})

// ─── cartItemCountByItem ──────────────────────────────────────────────────────

describe('cartItemCountByItem', () => {
  it('user can get the count of cart items for a given item', async () => {
    // Given prisma returns count 1
    mockPrisma.cartItem.count.mockResolvedValue(1)

    // When querying the count for that item
    const result = await execOp(
      `query CartItemCountByItem($itemId: ID!) { cartItemCountByItem(itemId: $itemId) }`,
      { itemId: 'item_1' },
    )

    // Then the count is 1
    expect(result?.errors).toBeUndefined()
    expect(result?.data?.cartItemCountByItem).toBe(1)
  })

  it('count is scoped to the requesting user — other users\' carts are excluded', async () => {
    // Given prisma returns 0 for user B
    mockPrisma.cartItem.count.mockResolvedValue(0)

    // When user B queries the count
    const result = await execOp(
      `query CartItemCountByItem($itemId: ID!) { cartItemCountByItem(itemId: $itemId) }`,
      { itemId: 'item_1' },
      { userId: 'user_B' },
    )

    // Then the count is 0
    expect(result?.errors).toBeUndefined()
    expect(result?.data?.cartItemCountByItem).toBe(0)
    // Verify it was called with userId: user_B
    expect(mockPrisma.cartItem.count).toHaveBeenCalledWith({ where: { itemId: 'item_1', userId: 'user_B' } })
  })

  // The location-scoped form (PR 3c). The Stock tab's "remove from location"
  // confirmation asks this way, so the number must equal exactly what
  // `removeItemFromLocation` deletes — both read the location out of the cart
  // id with the same `parseCartId`.
  it('user can count only one location\'s cart entries for an item', async () => {
    // Given the item sits in three of LOC_DEFAULT's carts — one of them keyed
    // with a vendor id that itself contains ':' — and in one of LOC_OTHER's.
    // `${LOC_OTHER}` does NOT start with `${LOC_DEFAULT}`, so the prefix trap
    // is covered by the dedicated test below.
    mockPrisma.cartItem.findMany.mockResolvedValue([
      makeCartItem({ id: 'ci_1', cartId: `${LOC_DEFAULT}:no-vendor` }),
      makeCartItem({ id: 'ci_2', cartId: `${LOC_DEFAULT}:ven_1` }),
      makeCartItem({ id: 'ci_3', cartId: `${LOC_DEFAULT}:ven:dor` }),
      makeCartItem({ id: 'ci_4', cartId: `${LOC_OTHER}:ven_1` }),
    ])

    // When the count is asked for LOC_DEFAULT
    const result = await execOp(
      `query C($itemId: ID!, $locationId: ID) { cartItemCountByItem(itemId: $itemId, locationId: $locationId) }`,
      { itemId: 'item_1', locationId: LOC_DEFAULT },
    )

    // Then it is 3, not 4 — the whole-account `count` path was not used
    expect(result?.errors).toBeUndefined()
    expect(result?.data?.cartItemCountByItem).toBe(3)
    expect(mockPrisma.cartItem.count).not.toHaveBeenCalled()
  })

  it('a location-scoped count does not include a location whose id merely starts with it', async () => {
    // Given one cart at 'loc_a' and one at 'loc_a2'. 'loc_a2:ven_1' starts
    // with 'loc_a', so a prefix match would count both.
    stockFake.reset(
      [
        { id: 'loc_a', userId: 'user_test123', isDefault: true },
        { id: 'loc_a2', userId: 'user_test123', isDefault: false },
      ],
      [],
    )
    mockPrisma.cartItem.findMany.mockResolvedValue([
      makeCartItem({ id: 'ci_1', cartId: 'loc_a:no-vendor' }),
      makeCartItem({ id: 'ci_2', cartId: 'loc_a2:ven_1' }),
    ])

    const result = await execOp(
      `query C($itemId: ID!, $locationId: ID) { cartItemCountByItem(itemId: $itemId, locationId: $locationId) }`,
      { itemId: 'item_1', locationId: 'loc_a' },
    )

    expect(result?.data?.cartItemCountByItem).toBe(1)
  })

  it('a location-scoped count is refused for a location the caller holds no role on', async () => {
    const result = await execOp(
      `query C($itemId: ID!, $locationId: ID) { cartItemCountByItem(itemId: $itemId, locationId: $locationId) }`,
      { itemId: 'item_1', locationId: LOC_STRANGER },
    )

    expect(result?.errors?.[0]?.extensions?.code).toBe('FORBIDDEN')
    expect(mockPrisma.cartItem.findMany).not.toHaveBeenCalled()
  })
})

// ─── removeFromCart ──────────────────────────────────────────────────────────

describe('removeFromCart', () => {
  it('user can remove an item from the cart — returns true', async () => {
    // Given a cart item exists for this user
    const existing = makeCartItem()
    mockPrisma.cartItem.findFirst.mockResolvedValue(existing)
    mockPrisma.cartItem.delete.mockResolvedValue(existing)

    // When removing the item
    const result = await execOp(
      `mutation RemoveFromCart($id: ID!) { removeFromCart(id: $id) }`,
      { id: 'cartitem_1' },
    )

    // Then true is returned
    expect(result?.errors).toBeUndefined()
    expect(result?.data?.removeFromCart).toBe(true)
  })

  it('removing a non-existent item returns false', async () => {
    // Given no cart item found for this user
    mockPrisma.cartItem.findFirst.mockResolvedValue(null)

    // When trying to remove it
    const result = await execOp(
      `mutation RemoveFromCart($id: ID!) { removeFromCart(id: $id) }`,
      { id: 'nonexistent_id' },
    )

    // Then false is returned
    expect(result?.errors).toBeUndefined()
    expect(result?.data?.removeFromCart).toBe(false)
  })
})

// ─── checkout ────────────────────────────────────────────────────────────────

describe('checkout', () => {
  it('user can checkout — buying items update packedQuantity and create inventory logs', async () => {
    // Given a cart with a buying item (qty > 0)
    const buyItem = makeCartItem({ itemId: 'item_milk', quantity: 3 })
    mockPrisma.cartItem.findMany.mockResolvedValue([buyItem])
    mockPrisma.item.update.mockResolvedValue({ packedQuantity: 3, unpackedQuantity: 0 })
    mockPrisma.inventoryLog.create.mockResolvedValue({})
    const updatedCart = makeCart({ lastPurchasedAt: now })
    mockPrisma.cart.update.mockResolvedValue(updatedCart)
    mockPrisma.cartItem.deleteMany.mockResolvedValue({ count: 1 })

    // When checking out
    const result = await execOp(
      `mutation Checkout($cartId: ID!) { checkout(cartId: $cartId) { id lastPurchasedAt } }`,
      { cartId: `${LOC_DEFAULT}:no-vendor` },
    )

    // Then the cart's lastPurchasedAt is set, as an ISO 8601 string.
    // `toBeDefined()` alone was vacuous here: it passed against the epoch-millis
    // digit-string ("1704067200000") that `new Date(...)` on the client turns
    // into an Invalid Date, breaking the shopping page's last-purchased sort.
    expect(result?.errors).toBeUndefined()
    const checkedOut = result?.data?.checkout as { id: string; lastPurchasedAt: string }
    expect(checkedOut.lastPurchasedAt).toBe(now.toISOString())
    expect(Number.isNaN(new Date(checkedOut.lastPurchasedAt).getTime())).toBe(false)

    // And item's packedQuantity was incremented
    expect(mockPrisma.item.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ packedQuantity: { increment: 3 } }) }),
    )

    // And an inventory log was created
    expect(mockPrisma.inventoryLog.create).toHaveBeenCalledOnce()
  })

  it('user can checkout — pinned items (qty === 0) stay in the permanent cart', async () => {
    // Given a cart with a buying item and a pinned item
    const buyItem = makeCartItem({ id: 'ci_buy', itemId: 'item_milk', quantity: 2 })
    const pinnedItem = makeCartItem({ id: 'ci_pin', itemId: 'item_eggs', quantity: 0 })
    mockPrisma.cartItem.findMany.mockResolvedValue([buyItem, pinnedItem])
    mockPrisma.item.update.mockResolvedValue({ packedQuantity: 2, unpackedQuantity: 0 })
    mockPrisma.inventoryLog.create.mockResolvedValue({})
    const updatedCart = makeCart({ lastPurchasedAt: now })
    mockPrisma.cart.update.mockResolvedValue(updatedCart)
    mockPrisma.cartItem.deleteMany.mockResolvedValue({ count: 1 })

    // When checking out
    const result = await execOp(
      `mutation Checkout($cartId: ID!) { checkout(cartId: $cartId) { id lastPurchasedAt } }`,
      { cartId: `${LOC_DEFAULT}:no-vendor` },
    )

    // Then no new cart is created (permanent cart model — pinned items just stay)
    expect(result?.errors).toBeUndefined()
    expect(mockPrisma.cart.create).not.toHaveBeenCalled()

    // And lastPurchasedAt is still ISO 8601
    const checkedOut = result?.data?.checkout as { lastPurchasedAt: string }
    expect(checkedOut.lastPurchasedAt).toBe(now.toISOString())

    // And only buying items (qty > 0) are deleted
    expect(mockPrisma.cartItem.deleteMany).toHaveBeenCalledWith({
      where: { cartId: `${LOC_DEFAULT}:no-vendor`, userId: 'user_test123', quantity: { gt: 0 } },
    })
  })

  it('user can checkout — only buying items are deleted, pinned items remain', async () => {
    // Given a cart with a buying item
    const buyItem = makeCartItem({ quantity: 1 })
    mockPrisma.cartItem.findMany.mockResolvedValue([buyItem])
    mockPrisma.item.update.mockResolvedValue({ packedQuantity: 1, unpackedQuantity: 0 })
    mockPrisma.inventoryLog.create.mockResolvedValue({})
    const updatedCart = makeCart({ lastPurchasedAt: now })
    mockPrisma.cart.update.mockResolvedValue(updatedCart)
    mockPrisma.cartItem.deleteMany.mockResolvedValue({ count: 1 })

    // When checking out
    await execOp(
      `mutation Checkout($cartId: ID!) { checkout(cartId: $cartId) { id } }`,
      { cartId: `${LOC_DEFAULT}:no-vendor` },
    )

    // Then only items with qty > 0 are removed
    expect(mockPrisma.cartItem.deleteMany).toHaveBeenCalledWith({
      where: { cartId: `${LOC_DEFAULT}:no-vendor`, userId: 'user_test123', quantity: { gt: 0 } },
    })
  })
})

// ─── checkout: the PR-2 dual-write onto ItemStock ────────────────────────────
//
// Every test above pins the `Item` half of the dual-write. These pin the
// `ItemStock` half. The pair is the point: deleting either half must turn one
// group red and leave the other green, which is what "dual" means and what a
// browser on a stale bundle depends on until PR 5.

describe('checkout dual-writes onto ItemStock', () => {
  // The stock the checkout is topping up, plus a row for the same item in the
  // user's OTHER location and in a stranger's. Without those a mirror that
  // wrote every location — or the wrong one — would be invisible.
  function seedStocks() {
    stockFake.reset(stockFake.state.locations, [
      makeStock({ id: 'st_default', itemId: 'item_milk', locationId: LOC_DEFAULT, packedQuantity: 2 }),
      makeStock({ id: 'st_other', itemId: 'item_milk', locationId: LOC_OTHER, packedQuantity: 40 }),
      makeStock({ id: 'st_stranger', itemId: 'item_milk', locationId: LOC_STRANGER, packedQuantity: 99 }),
    ])
  }

  function stockAt(locationId: string) {
    return stockFake.state.itemStocks.find(
      (s) => s.itemId === 'item_milk' && s.locationId === locationId,
    )
  }

  it('user checking out increments ONE location\'s stock, not every location', async () => {
    // Given Milk is stocked in both of the user's locations, and in a third
    // belonging to somebody else. The cart is the Kitchen's, so the Kitchen is
    // where the mirror must land — see the group below for why the cart id, and
    // not the caller's default location, is what decides that since Task 3.
    seedStocks()
    const buyItem = makeCartItem({ itemId: 'item_milk', quantity: 3 })
    mockPrisma.cartItem.findMany.mockResolvedValue([buyItem])
    mockPrisma.item.update.mockResolvedValue({ packedQuantity: 5, unpackedQuantity: 0 })
    mockPrisma.inventoryLog.create.mockResolvedValue({})
    mockPrisma.cart.update.mockResolvedValue(makeCart({ lastPurchasedAt: now }))
    mockPrisma.cartItem.deleteMany.mockResolvedValue({ count: 1 })

    // When they buy 3 of it
    const result = await execOp(
      `mutation Checkout($cartId: ID!) { checkout(cartId: $cartId) { id } }`,
      { cartId: `${LOC_DEFAULT}:no-vendor` },
    )

    // Then only the cart's location moved: 2 + 3
    expect(result?.errors).toBeUndefined()
    expect(stockAt(LOC_DEFAULT)?.packedQuantity).toBe(5)
    // And the user's other location is untouched — this is the assertion a
    // one-location fixture could not make
    expect(stockAt(LOC_OTHER)?.packedQuantity).toBe(40)
    // And so is the stranger's, whose location is ALSO flagged isDefault
    expect(stockAt(LOC_STRANGER)?.packedQuantity).toBe(99)
  })

  it('user checking out an item with no stock row there gets one created at the bought quantity', async () => {
    // Given the item is stocked nowhere yet (a catalog item bought for the
    // first time)
    stockFake.reset(stockFake.state.locations, [])
    const buyItem = makeCartItem({ itemId: 'item_new', quantity: 4 })
    mockPrisma.cartItem.findMany.mockResolvedValue([buyItem])
    mockPrisma.item.update.mockResolvedValue({ packedQuantity: 4, unpackedQuantity: 0 })
    mockPrisma.inventoryLog.create.mockResolvedValue({})
    mockPrisma.cart.update.mockResolvedValue(makeCart({ lastPurchasedAt: now }))
    mockPrisma.cartItem.deleteMany.mockResolvedValue({ count: 1 })

    // When they check out
    await execOp(`mutation Checkout($cartId: ID!) { checkout(cartId: $cartId) { id } }`, {
      cartId: `${LOC_DEFAULT}:no-vendor`,
    })

    // Then exactly one row exists, in the cart's location, opening at 4 —
    // an increment against a row that does not exist yet is the increment
    expect(stockFake.state.itemStocks).toHaveLength(1)
    expect(stockFake.state.itemStocks[0]).toMatchObject({
      itemId: 'item_new',
      locationId: LOC_DEFAULT,
      packedQuantity: 4,
      unpackedQuantity: 0,
    })
  })

  it('user checking out twice accumulates rather than overwriting', async () => {
    // Given a first checkout has already run against a row at 2
    seedStocks()
    const buyItem = makeCartItem({ itemId: 'item_milk', quantity: 3 })
    mockPrisma.cartItem.findMany.mockResolvedValue([buyItem])
    mockPrisma.item.update.mockResolvedValue({ packedQuantity: 5, unpackedQuantity: 0 })
    mockPrisma.inventoryLog.create.mockResolvedValue({})
    mockPrisma.cart.update.mockResolvedValue(makeCart({ lastPurchasedAt: now }))
    mockPrisma.cartItem.deleteMany.mockResolvedValue({ count: 1 })
    await execOp(`mutation Checkout($cartId: ID!) { checkout(cartId: $cartId) { id } }`, {
      cartId: `${LOC_DEFAULT}:no-vendor`,
    })

    // When a second checkout buys 3 more
    await execOp(`mutation Checkout($cartId: ID!) { checkout(cartId: $cartId) { id } }`, {
      cartId: `${LOC_DEFAULT}:no-vendor`,
    })

    // Then the row reads 8, not 3 — the mirror increments, it does not assign
    // the quantity bought. Also proves the second write took the update branch
    // rather than a create the @@unique constraint would have rejected.
    expect(stockAt(LOC_DEFAULT)?.packedQuantity).toBe(8)
    expect(
      stockFake.state.itemStocks.filter(
        (st) => st.itemId === 'item_milk' && st.locationId === LOC_DEFAULT,
      ),
    ).toHaveLength(1)
  })

  it('pinned items do not move any stock', async () => {
    // Given a cart holding only a pinned item (quantity 0)
    seedStocks()
    mockPrisma.cartItem.findMany.mockResolvedValue([
      makeCartItem({ id: 'ci_pin', itemId: 'item_milk', quantity: 0 }),
    ])
    mockPrisma.cart.update.mockResolvedValue(makeCart({ lastPurchasedAt: now }))
    mockPrisma.cartItem.deleteMany.mockResolvedValue({ count: 0 })

    // When the user checks out
    await execOp(`mutation Checkout($cartId: ID!) { checkout(cartId: $cartId) { id } }`, {
      cartId: `${LOC_DEFAULT}:no-vendor`,
    })

    // Then no stock row changed, in either half of the dual-write
    expect(stockAt(LOC_DEFAULT)?.packedQuantity).toBe(2)
    expect(mockPrisma.item.update).not.toHaveBeenCalled()
  })

  it('a user with no locations gets one, and the mirror still lands (issue #287)', async () => {
    // Given an account with no Location rows at all — a brand-new account that
    // has never run the `locations` query. Until issue #287 the mirror returned
    // early here and the purchased quantity was dropped with no error.
    stockFake.reset([], [])

    // The account reads its location list first. Since PR 3b Task 4 a cart id
    // names a location AND `vendorCart` demands one, so this is the only way
    // such an account can reach checkout at all: the `locations` query calls
    // `ensureDefaultLocation`, which creates the row, and every location-scoped
    // call the client makes afterwards names the id it got back. That is the
    // real client's order too — `useCloudLocationId` and `useCloudLocationKnown`
    // both read `GetLocations` before anything location-scoped is sent.
    mockPrisma.cart.findUnique.mockResolvedValue(null)
    mockPrisma.cart.create.mockImplementation(
      async ({ data }: { data: { id: string } }) => makeCart({ id: data.id }),
    )
    const listed = await execOp(`query Locations { locations { id isDefault name } }`)
    expect(listed?.errors).toBeUndefined()
    const created = stockFake.state.locations.find((l) => l.userId === 'user_test123')
    expect(created).toMatchObject({ isDefault: true, name: 'My Home' })

    // And opening the no-vendor cart at that location creates it under the
    // composite id
    const opened = await execOp(
      `query VendorCartNewAccount($vendorId: ID, $locationId: ID!) {
        vendorCart(vendorId: $vendorId, locationId: $locationId) { id }
      }`,
      { vendorId: null, locationId: created?.id },
    )
    expect(opened?.errors).toBeUndefined()

    const buyItem = makeCartItem({ cartId: `${created?.id}:no-vendor`, itemId: 'item_milk', quantity: 2 })
    mockPrisma.cartItem.findMany.mockResolvedValue([buyItem])
    mockPrisma.item.update.mockResolvedValue({ packedQuantity: 2, unpackedQuantity: 0 })
    mockPrisma.inventoryLog.create.mockResolvedValue({})
    mockPrisma.cart.update.mockResolvedValue(makeCart({ lastPurchasedAt: now }))
    mockPrisma.cartItem.deleteMany.mockResolvedValue({ count: 1 })

    // When they check out
    const result = await execOp(
      `mutation Checkout($cartId: ID!) { checkout(cartId: $cartId) { id } }`,
      { cartId: `${created?.id}:no-vendor` },
    )

    // Then the checkout succeeds, the Item half still ran, and the purchase
    // landed in the location that was created for them
    expect(result?.errors).toBeUndefined()
    expect(mockPrisma.item.update).toHaveBeenCalledOnce()
    expect(stockFake.state.itemStocks).toHaveLength(1)
    expect(stockFake.state.itemStocks[0]).toMatchObject({
      itemId: 'item_milk',
      locationId: created?.id,
      packedQuantity: 2,
    })
  })
})

// ─── checkout: PR 3b Task 3, the CART's location ─────────────────────────────
//
// Every checkout test above uses a cart at `${LOC_DEFAULT}:...`, so "the cart's
// location" and "the caller's default location" are the same string and neither
// group can tell the two implementations apart. These use a cart at LOC_OTHER,
// the caller's NON-default location, which is the only fixture that can.
//
// Before Task 3, checkout resolved its target with `defaultLocationId(userId)`
// and a purchase made while viewing the Garage moved the Kitchen's stock and
// logged against the Kitchen. That was the limitation PR 3a shipped.

describe("checkout writes the CART's location, not the caller's default", () => {
  function seedStocks() {
    stockFake.reset(stockFake.state.locations, [
      makeStock({ id: 'st_default', itemId: 'item_milk', locationId: LOC_DEFAULT, packedQuantity: 2 }),
      makeStock({ id: 'st_other', itemId: 'item_milk', locationId: LOC_OTHER, packedQuantity: 40 }),
      makeStock({ id: 'st_stranger', itemId: 'item_milk', locationId: LOC_STRANGER, packedQuantity: 99 }),
    ])
  }

  function stockAt(locationId: string) {
    return stockFake.state.itemStocks.find(
      (s) => s.itemId === 'item_milk' && s.locationId === locationId,
    )
  }

  function arrangeBuy(cartId: string) {
    mockPrisma.cartItem.findMany.mockResolvedValue([
      makeCartItem({ cartId, itemId: 'item_milk', quantity: 3 }),
    ])
    mockPrisma.item.update.mockResolvedValue({ packedQuantity: 5, unpackedQuantity: 0 })
    mockPrisma.inventoryLog.create.mockResolvedValue({})
    mockPrisma.cart.update.mockResolvedValue(makeCart({ id: cartId, lastPurchasedAt: now }))
    mockPrisma.cartItem.deleteMany.mockResolvedValue({ count: 1 })
  }

  it("user checking out at their Garage moves the GARAGE's stock", async () => {
    // Given Milk is stocked in both of the caller's locations and in a
    // stranger's, and the cart being checked out is the GARAGE's
    seedStocks()
    const cartId = `${LOC_OTHER}:no-vendor`
    arrangeBuy(cartId)

    // When they buy 3 of it
    const result = await execOp(
      `mutation Checkout($cartId: ID!) { checkout(cartId: $cartId) { id } }`,
      { cartId },
    )

    // Then the GARAGE's row moved: 40 + 3
    expect(result?.errors).toBeUndefined()
    expect(stockAt(LOC_OTHER)?.packedQuantity).toBe(43)

    // And the Kitchen — the caller's DEFAULT location — is untouched. This is
    // the assertion that goes red if checkout resolves the default location
    // again instead of reading the cart id.
    expect(stockAt(LOC_DEFAULT)?.packedQuantity).toBe(2)
    // And so is the stranger's, whose location is ALSO flagged isDefault
    expect(stockAt(LOC_STRANGER)?.packedQuantity).toBe(99)
  })

  it('user checking out at their Garage logs the purchase against the Garage', async () => {
    // Given the same Garage cart
    seedStocks()
    const cartId = `${LOC_OTHER}:no-vendor`
    arrangeBuy(cartId)

    // When they check out
    const result = await execOp(
      `mutation Checkout($cartId: ID!) { checkout(cartId: $cartId) { id } }`,
      { cartId },
    )

    // Then the inventory log names the Garage, not the Kitchen. The log row and
    // the stock move it explains must never name different locations.
    expect(result?.errors).toBeUndefined()
    expect(mockPrisma.inventoryLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ locationId: LOC_OTHER, itemId: 'item_milk', delta: 3 }),
    })
  })

  it('a cart at the Kitchen still writes the Kitchen', async () => {
    // Given the cart is the caller's DEFAULT location's — the ordinary case,
    // kept so "reads the cart id" is not confused with "always picks the
    // non-default location"
    seedStocks()
    const cartId = `${LOC_DEFAULT}:no-vendor`
    arrangeBuy(cartId)

    // When they check out
    await execOp(`mutation Checkout($cartId: ID!) { checkout(cartId: $cartId) { id } }`, {
      cartId,
    })

    // Then the Kitchen moved and the Garage did not
    expect(stockAt(LOC_DEFAULT)?.packedQuantity).toBe(5)
    expect(stockAt(LOC_OTHER)?.packedQuantity).toBe(40)
    expect(mockPrisma.inventoryLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ locationId: LOC_DEFAULT }),
    })
  })
})

// ─── abandonCart ─────────────────────────────────────────────────────────────

describe('abandonCart', () => {
  it('user can abandon a cart — all items are deleted, cart is returned as-is', async () => {
    // Given a cart exists for this user, carrying a Prisma `Date`
    const cart = makeCart({ lastPurchasedAt: now })
    mockPrisma.cart.findFirst.mockResolvedValue(cart)
    mockPrisma.cartItem.deleteMany.mockResolvedValue({ count: 2 })

    // When abandoning the cart
    const result = await execOp(
      `mutation AbandonCart($cartId: ID!) { abandonCart(cartId: $cartId) { id lastPurchasedAt } }`,
      { cartId: `${LOC_DEFAULT}:no-vendor` },
    )

    // Then the cart is returned (no status change — permanent cart model),
    // with lastPurchasedAt still ISO 8601
    expect(result?.errors).toBeUndefined()
    const abandoned = result?.data?.abandonCart as { id: string; lastPurchasedAt: string | null }
    expect(abandoned.id).toBe(`${LOC_DEFAULT}:no-vendor`)
    expect(abandoned.lastPurchasedAt).toBe(now.toISOString())

    // And all cart items are deleted (including pinned)
    expect(mockPrisma.cartItem.deleteMany).toHaveBeenCalledWith({ where: { cartId: `${LOC_DEFAULT}:no-vendor`, userId: 'user_test123' } })

    // And cart itself is NOT deleted (permanent)
    expect(mockPrisma.cart.delete).not.toHaveBeenCalled()
  })
})

// ─── Cross-user isolation ─────────────────────────────────────────────────────

describe('cross-user isolation', () => {
  it("user cannot read the cart items of a location they do not hold", async () => {
    // Given user_B names a cart id whose location belongs to user_test123
    // When user_B queries its items
    const result = await execOp(
      `query CartItems($cartId: ID!) { cartItems(cartId: $cartId) { id } }`,
      { cartId: `${LOC_DEFAULT}:no-vendor` },
      { userId: 'user_B' },
    )

    // Then the read is refused before it reaches the database.
    //
    // Before PR 3b this returned an empty list: the cart id carried no
    // location, so the only defence was the `userId` scope in the where clause.
    // Now the id names a location and requireLocationRole answers first.
    expect(result?.errors?.[0]?.extensions?.code).toBe('FORBIDDEN')
    expect(mockPrisma.cartItem.findMany).not.toHaveBeenCalled()
  })

  it('user cannot remove another user\'s cart item', async () => {
    // Given no cart item found for user B
    mockPrisma.cartItem.findFirst.mockResolvedValue(null)

    // When user B tries to remove that cart item
    const result = await execOp(
      `mutation RemoveFromCart($id: ID!) { removeFromCart(id: $id) }`,
      { id: 'cartitem_1' },
      { userId: 'user_B' },
    )

    // Then false is returned (item not found for user B)
    expect(result?.errors).toBeUndefined()
    expect(result?.data?.removeFromCart).toBe(false)
  })

  it("user cannot abandon a cart in a location they do not hold", async () => {
    // Given user_B names user_test123's cart
    // When user_B tries to abandon it
    const result = await execOp(
      `mutation AbandonCart($cartId: ID!) { abandonCart(cartId: $cartId) { id } }`,
      { cartId: `${LOC_DEFAULT}:no-vendor` },
      { userId: 'user_B' },
    )

    // Then it is refused, and no cart item is deleted
    expect(result?.errors?.[0]?.extensions?.code).toBe('FORBIDDEN')
    expect(mockPrisma.cartItem.deleteMany).not.toHaveBeenCalled()
  })

  it("user cannot check out a cart in a location they do not hold", async () => {
    // Given user_B names user_test123's cart
    // When user_B checks it out
    const result = await execOp(
      `mutation Checkout($cartId: ID!) { checkout(cartId: $cartId) { id } }`,
      { cartId: `${LOC_DEFAULT}:no-vendor` },
      { userId: 'user_B' },
    )

    // Then it is refused before any write. Design §5 named this exact bug:
    // checkout wrote `where: { id: cartId }` with no user scope, so one user's
    // checkout stamped another user's shared row.
    expect(result?.errors?.[0]?.extensions?.code).toBe('FORBIDDEN')
    expect(mockPrisma.cart.update).not.toHaveBeenCalled()
    expect(mockPrisma.item.update).not.toHaveBeenCalled()
  })

  it("user cannot add to a cart in a location they do not hold", async () => {
    // Given user_B names user_test123's cart
    // When user_B adds an item to it
    const result = await execOp(
      `mutation AddToCart($cartId: ID!, $itemId: ID!, $quantity: Int!) {
        addToCart(cartId: $cartId, itemId: $itemId, quantity: $quantity) { id }
      }`,
      { cartId: `${LOC_DEFAULT}:no-vendor`, itemId: 'item_milk', quantity: 1 },
      { userId: 'user_B' },
    )

    // Then it is refused and nothing is written
    expect(result?.errors?.[0]?.extensions?.code).toBe('FORBIDDEN')
    expect(mockPrisma.cartItem.create).not.toHaveBeenCalled()
  })
})

// ─── Pre-PR-3b cart ids ───────────────────────────────────────────────────────
//
// An old browser bundle sends the bare vendor id, or the literal 'no-vendor'.
// Those ids have no ':' at all, so parseCartId reads the WHOLE id as a location
// id, no Location row matches, and the request is refused.
//
// This is the deploy hazard the PR 3b brainstorming chose to accept: the
// migration and the new server go out together, and in the gap between them an
// old client fails loudly instead of quietly reading or creating the wrong row.

describe('a cart id from before the re-key', () => {
  for (const [label, cartId] of [
    ['a bare vendor id', 'vendor_1'],
    ["the literal 'no-vendor'", 'no-vendor'],
  ] as const) {
    it(`${label} is refused, not silently created`, async () => {
      // Given an old client sends a pre-migration cart id
      // When it adds an item to that cart
      const result = await execOp(
        `mutation AddToCart($cartId: ID!, $itemId: ID!, $quantity: Int!) {
          addToCart(cartId: $cartId, itemId: $itemId, quantity: $quantity) { id }
        }`,
        { cartId, itemId: 'item_milk', quantity: 1 },
      )

      // Then it is refused and no row is written
      expect(result?.errors?.[0]?.extensions?.code).toBe('FORBIDDEN')
      expect(mockPrisma.cartItem.create).not.toHaveBeenCalled()
    })
  }
})
