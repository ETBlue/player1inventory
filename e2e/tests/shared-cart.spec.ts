import { expect, test } from '@playwright/test'
import { E2E_SECOND_USER_ID } from '../constants'
import { cleanupCloudData } from '../helpers/cloudTeardown'
import { addHouseholdMember } from '../helpers/cloudUsers'
import { makeGql } from '../utils/cloud'

// ── WHAT THIS FILE PROVES ────────────────────────────────────────────────────
//
// That a cart is SHARED by the people of one household, against real Postgres
// (households H3b, task B.9). Every server unit test for carts runs against
// the hand-written Prisma fake, so this is the first time these rules meet
// SQL:
//
// | Rule                                                  | Code                                   |
// |-------------------------------------------------------|----------------------------------------|
// | one row per item per cart; two adds sum               | `addToCart`, an upsert with `increment` |
// | each person sees the other's rows                     | `cartItems`, `cartItemCountByItem`      |
// | a checkout from an old list is refused, nothing moves | `checkout`, `CART_CHANGED`              |
// | two checkouts at once buy the rows once               | `checkout`'s claim (`deleteMany` + count) |
// | a participant can empty the cart, others' rows too    | `abandonCart`                           |
// | a viewer can read and cannot write                    | `requireCartLocation(…, 'participant')` |
// | the two cart item imports merge by pair               | `bulkCreateCartItems`, `bulkUpsertCartItems` |
//
// The resolvers are in apps/server/src/resolvers/cart.resolver.ts and
// import.resolver.ts. The design is
// docs/global/permissions/2026-11-14-households-h3b-design.md.
//
// | Person      | Household role | Home        |
// |-------------|----------------|-------------|
// | OWNER       | owner          | organizer   |
// | PARTICIPANT | member         | participant |
// | VIEWER      | member         | viewer      |
// | IMPORTER    | manager        | participant | (the two import tests only)
//
// With ONE person, "the rows in this cart" and "the rows I added" are the same
// set, so no test here could fail against a server that still scoped carts by
// `userId`. Every test has rows from two people (H3b plan, rule 14).
//
// ── WHAT IT DOES NOT PROVE ───────────────────────────────────────────────────
//
// - **"Added by" is not read back.** `CartItem.userId` is not in the GraphQL
//   type, so a test cannot see which person a row names. The rule "an add to
//   an existing row keeps the first adder" is pinned by the server unit tests
//   only.
// - **The two "at the same time" tests can only TRY to overlap.** Two requests
//   are sent together with `Promise.all`. Whether their transactions really
//   overlap inside Postgres is up to timing, so each test runs several rounds.
//   Measured 2026-11-15, one run each, against real Postgres:
//
//   | Mutation                                              | Result                         |
//   |-------------------------------------------------------|--------------------------------|
//   | `checkout` claim without its `count !== 1` check      | red in round 2 of 5: both checkouts succeeded. Round 1 did not overlap |
//   | `addToCart` as a read, then `create` or `update`      | red in round 2 of 3 ("Butter"): P2002. Round 1 did not overlap |
//
//   So a round does not always overlap, and a run of these tests could, in
//   principle, miss a broken claim. Several rounds make that unlikely, not
//   impossible.
// - **Two households are not here.** `cart-id-cross-user-leak.spec.ts` is the
//   two-household test.
//
// ── WHY THERE IS NO BROWSER ──────────────────────────────────────────────────
//
// The browser can only be `E2E_USER_ID`, and this file needs three people.
// Everything goes through GraphQL with `makeGql`, like `cloud-roles.spec.ts`.
// It is in the `cloud` project's `testMatch` and the `local` project's
// `testIgnore` (e2e/playwright.config.ts).

const OWNER = `${E2E_SECOND_USER_ID}-cart-owner`
const PARTICIPANT = `${E2E_SECOND_USER_ID}-cart-participant`
const VIEWER = `${E2E_SECOND_USER_ID}-cart-viewer`
/**
 * The person who imports in the two P3 tests: a household MANAGER who is a
 * `participant` on Home. Since households H4 task E.3 every bulk import
 * mutation asks the household role `manager` first, so a `member` (the other
 * two above) is refused before the cart rules are reached (decision O1).
 */
const IMPORTER = `${E2E_SECOND_USER_ID}-cart-importer`

type Gql = ReturnType<typeof makeGql>
type Row = { id: string }
type CartItemRow = {
  id: string
  cartId: string
  itemId: string
  quantity: number
}

const LOCATIONS = `query { locations { id } }`
const CREATE_ITEM = `mutation ($input: CreateItemInput!) { createItem(input: $input) { id } }`
const UPSERT_STOCK = `mutation ($itemId: ID!, $locationId: ID!, $input: ItemStockInput!) {
  upsertItemStock(itemId: $itemId, locationId: $locationId, input: $input) { id }
}`
const ITEM_STOCKS = `query ($locationId: ID!) {
  itemStocks(locationId: $locationId) { itemId packedQuantity }
}`
const ITEM_LOGS = `query ($itemId: ID!, $locationId: ID!) {
  itemLogs(itemId: $itemId, locationId: $locationId) { id delta }
}`
const VENDOR_CART = `query ($locationId: ID!) {
  vendorCart(vendorId: null, locationId: $locationId) { id }
}`
const CART_ITEMS = `query ($cartId: ID!) {
  cartItems(cartId: $cartId) { id cartId itemId quantity }
}`
const CART_ITEM_COUNT = `query ($itemId: ID!, $locationId: ID) {
  cartItemCountByItem(itemId: $itemId, locationId: $locationId)
}`
const ADD_TO_CART = `mutation ($cartId: ID!, $itemId: ID!, $quantity: Int!) {
  addToCart(cartId: $cartId, itemId: $itemId, quantity: $quantity) { id cartId itemId quantity }
}`
const UPDATE_CART_ITEM = `mutation ($id: ID!, $quantity: Int!) {
  updateCartItem(id: $id, quantity: $quantity) { id quantity }
}`
const CHECKOUT = `mutation ($cartId: ID!, $items: [CheckoutItemInput!]!) {
  checkout(cartId: $cartId, items: $items) { id }
}`
const ABANDON_CART = `mutation ($cartId: ID!) { abandonCart(cartId: $cartId) { id } }`
const BULK_CREATE_CART_ITEMS = `mutation ($cartItems: [CartItemInput!]!) {
  bulkCreateCartItems(cartItems: $cartItems) { id }
}`
const BULK_UPSERT_CART_ITEMS = `mutation ($cartItems: [CartItemInput!]!) {
  bulkUpsertCartItems(cartItems: $cartItems) { id }
}`

/** `makeGql` throws the GraphQL errors as JSON text. These match a code. */
const FORBIDDEN = /"code":"FORBIDDEN"/
const CART_CHANGED = /"code":"CART_CHANGED"/

/** Milk starts with this many packed at Home. */
const MILK_PACKED = 3

type Seed = { home: string; cartId: string; milk: string; eggs: string }

/**
 * The owner's household: "Home", Milk stocked 3 packed there, Eggs not
 * stocked, and Home's no-vendor cart. Then the participant and the viewer are
 * added, BEFORE either sends a request, as `addHouseholdMember` requires.
 */
async function seedHousehold(
  request: Parameters<typeof makeGql>[0],
  owner: Gql,
): Promise<Seed> {
  // The first request makes the household and "Home" (first sign-in)
  const { locations } = await owner<{ locations: Row[] }>(LOCATIONS)
  const home = locations[0]?.id
  if (!home) throw new Error('owner: no location after first sign-in')
  const milk = (
    await owner<{ createItem: Row }>(CREATE_ITEM, { input: { name: 'Milk' } })
  ).createItem.id
  const eggs = (
    await owner<{ createItem: Row }>(CREATE_ITEM, { input: { name: 'Eggs' } })
  ).createItem.id
  await owner(UPSERT_STOCK, {
    itemId: milk,
    locationId: home,
    input: { packedQuantity: MILK_PACKED, unpackedQuantity: 0 },
  })
  const cartId = (
    await owner<{ vendorCart: Row }>(VENDOR_CART, { locationId: home })
  ).vendorCart.id

  await addHouseholdMember(request, {
    ownerUserId: OWNER,
    memberUserId: PARTICIPANT,
    householdRole: 'member',
    locations: [{ locationId: home, role: 'participant' }],
  })
  await addHouseholdMember(request, {
    ownerUserId: OWNER,
    memberUserId: VIEWER,
    householdRole: 'member',
    locations: [{ locationId: home, role: 'viewer' }],
  })
  return { home, cartId, milk, eggs }
}

/**
 * Add `IMPORTER` to the owner's household as a `manager` with `participant`
 * on Home. Called after `seedHousehold`, and before the importer sends any
 * request (`addHouseholdMember` answers 409 otherwise).
 */
async function addImporter(
  request: Parameters<typeof makeGql>[0],
  seed: Seed,
): Promise<void> {
  await addHouseholdMember(request, {
    ownerUserId: OWNER,
    memberUserId: IMPORTER,
    householdRole: 'manager',
    locations: [{ locationId: seed.home, role: 'participant' }],
  })
}

async function cartRows(gql: Gql, cartId: string): Promise<CartItemRow[]> {
  const { cartItems } = await gql<{ cartItems: CartItemRow[] }>(CART_ITEMS, {
    cartId,
  })
  return [...cartItems].sort((a, b) => (a.itemId < b.itemId ? -1 : 1))
}

/** Packed Milk at Home, or `undefined` when there is no stock row. */
async function packedAt(gql: Gql, seed: Seed, itemId: string) {
  const { itemStocks } = await gql<{
    itemStocks: { itemId: string; packedQuantity: number }[]
  }>(ITEM_STOCKS, { locationId: seed.home })
  return itemStocks.find((s) => s.itemId === itemId)?.packedQuantity
}

async function logCount(gql: Gql, seed: Seed, itemId: string) {
  const { itemLogs } = await gql<{ itemLogs: Row[] }>(ITEM_LOGS, {
    itemId,
    locationId: seed.home,
  })
  return itemLogs.length
}

async function cleanupAll(request: Parameters<typeof makeGql>[0]) {
  // The two members first, then the owner, whose cleanup deletes the
  // household, its carts and every cart row in them.
  await cleanupCloudData(request, PARTICIPANT)
  await cleanupCloudData(request, VIEWER)
  await cleanupCloudData(request, IMPORTER)
  await cleanupCloudData(request, OWNER)
}

test.beforeEach(async ({ request }) => {
  // The only cleanup of each test: it starts clean whatever ran before it (E2E speed plan, D7).
  await cleanupAll(request)
})

test.describe('a shared cart in one household', () => {
  test('two members adding the same item share one row with the sum, and each sees the other’s rows', async ({
    request,
  }) => {
    const owner = makeGql(request, OWNER)
    const participant = makeGql(request, PARTICIPANT)
    const viewer = makeGql(request, VIEWER)
    // Given the shared Home cart
    const seed = await seedHousehold(request, owner)

    // When the owner adds 2 Milk and then the participant adds 3 Milk
    const first = (
      await owner<{ addToCart: CartItemRow }>(ADD_TO_CART, {
        cartId: seed.cartId,
        itemId: seed.milk,
        quantity: 2,
      })
    ).addToCart
    const second = (
      await participant<{ addToCart: CartItemRow }>(ADD_TO_CART, {
        cartId: seed.cartId,
        itemId: seed.milk,
        quantity: 3,
      })
    ).addToCart

    // Then the second add wrote the SAME row, and the amount is the sum.
    // `addToCart` with `set` instead of `increment` reads 3 here.
    expect(second.id).toBe(first.id)
    expect(second.quantity).toBe(5)

    // When the participant adds Eggs, a row only they added
    await participant(ADD_TO_CART, {
      cartId: seed.cartId,
      itemId: seed.eggs,
      quantity: 1,
    })

    // Then all three people read the same two rows: one Milk row of 5 and
    // the participant's Eggs row. A cart still scoped by who added the row
    // would give the owner no Eggs and the participant no row at all
    // before their own add.
    for (const gql of [owner, participant, viewer]) {
      const rows = await cartRows(gql, seed.cartId)
      expect(rows).toHaveLength(2)
      expect(rows).toEqual(
        expect.arrayContaining([
          { id: first.id, cartId: seed.cartId, itemId: seed.milk, quantity: 5 },
          expect.objectContaining({ itemId: seed.eggs, quantity: 1 }),
        ]),
      )
    }

    // And the count the item list shows: the owner counts the participant's
    // Eggs row, the participant counts the owner's Milk row
    const eggsForOwner = await owner<{ cartItemCountByItem: number }>(
      CART_ITEM_COUNT,
      { itemId: seed.eggs, locationId: seed.home },
    )
    expect(eggsForOwner.cartItemCountByItem).toBe(1)
    const milkForParticipant = await participant<{
      cartItemCountByItem: number
    }>(CART_ITEM_COUNT, { itemId: seed.milk, locationId: null })
    expect(milkForParticipant.cartItemCountByItem).toBe(1)
  })

  test('a checkout from an old list is refused with CART_CHANGED, and nothing is written', async ({
    request,
  }) => {
    const owner = makeGql(request, OWNER)
    const participant = makeGql(request, PARTICIPANT)
    // Given 2 Milk in the shared cart, and the owner's screen showing it
    const seed = await seedHousehold(request, owner)
    const row = (
      await owner<{ addToCart: CartItemRow }>(ADD_TO_CART, {
        cartId: seed.cartId,
        itemId: seed.milk,
        quantity: 2,
      })
    ).addToCart
    const ownerScreen = [{ cartItemId: row.id, quantity: 2 }]

    // When the participant changes the amount to 4 first
    await participant(UPDATE_CART_ITEM, { id: row.id, quantity: 4 })

    // Then the owner's checkout of "2 Milk" is refused
    await expect(
      owner(CHECKOUT, { cartId: seed.cartId, items: ownerScreen }),
    ).rejects.toThrow(CART_CHANGED)

    // When the participant instead adds a row the owner's screen does not show
    await participant(UPDATE_CART_ITEM, { id: row.id, quantity: 2 })
    await participant(ADD_TO_CART, {
      cartId: seed.cartId,
      itemId: seed.eggs,
      quantity: 1,
    })

    // Then the same checkout is refused again
    await expect(
      owner(CHECKOUT, { cartId: seed.cartId, items: ownerScreen }),
    ).rejects.toThrow(CART_CHANGED)

    // And nothing was written: both rows are still in the cart, Milk is
    // still 3 packed, and no log exists. The rows are read FIRST, so an empty
    // answer cannot pass the "nothing moved" checks below.
    const rows = await cartRows(owner, seed.cartId)
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => [r.itemId, r.quantity])).toEqual(
      expect.arrayContaining([
        [seed.milk, 2],
        [seed.eggs, 1],
      ]),
    )
    expect(await packedAt(owner, seed, seed.milk)).toBe(MILK_PACKED)
    expect(await logCount(owner, seed, seed.milk)).toBe(0)

    // And a checkout from the CURRENT list goes through: the positive
    // control, so the refusals above were not a checkout that always fails
    await owner(CHECKOUT, {
      cartId: seed.cartId,
      items: rows.map((r) => ({ cartItemId: r.id, quantity: r.quantity })),
    })
    expect(await packedAt(owner, seed, seed.milk)).toBe(MILK_PACKED + 2)
    expect(await cartRows(owner, seed.cartId)).toEqual([])
  })

  test('two checkouts of the same rows at the same time buy them once', async ({
    request,
  }) => {
    // Each round sends two checkouts of the same rows together. If their
    // transactions overlap in Postgres, both pass the comparison (step 2 of
    // `checkout`), and only the claim (`deleteMany` with a count of 1) stops
    // the second one. If they do not overlap, the second one is refused at
    // step 2 because the rows are gone. Either way exactly one may succeed,
    // and the stock may move once. Five rounds, to give the overlap a chance.
    //
    // 60s, not the default 30s: this test took 15.4s to 20.1s alone (five
    // runs, 2026-11-15), the slowest in the file. A test that runs past its
    // budget showed misleading Postgres errors, because the `afterEach` cleanup
    // (removed in E2E speed plan task S.3) raced its last requests (docs/global/bugs/2026-11-15-bug-reimport-tests-over-time-budget.md).
    test.setTimeout(60_000)
    const owner = makeGql(request, OWNER)
    const participant = makeGql(request, PARTICIPANT)
    const seed = await seedHousehold(request, owner)

    const ROUNDS = 5
    for (let round = 1; round <= ROUNDS; round++) {
      // Given 2 Milk in the cart, from the owner
      const row = (
        await owner<{ addToCart: CartItemRow }>(ADD_TO_CART, {
          cartId: seed.cartId,
          itemId: seed.milk,
          quantity: 2,
        })
      ).addToCart
      const items = [{ cartItemId: row.id, quantity: 2 }]

      // When the owner and the participant both check it out at once
      const results = await Promise.allSettled([
        owner(CHECKOUT, { cartId: seed.cartId, items }),
        participant(CHECKOUT, { cartId: seed.cartId, items }),
      ])

      // Then exactly one succeeded, and the other was told the cart changed
      const fulfilled = results.filter((r) => r.status === 'fulfilled')
      const rejected = results.filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected',
      )
      expect(fulfilled, `round ${round}`).toHaveLength(1)
      expect(rejected, `round ${round}`).toHaveLength(1)
      expect(String(rejected[0]?.reason)).toMatch(CART_CHANGED)

      // And the 2 Milk were counted once: one log per round, and the stock
      // went up by 2 per round
      expect(await logCount(owner, seed, seed.milk), `round ${round}`).toBe(
        round,
      )
      expect(await packedAt(owner, seed, seed.milk), `round ${round}`).toBe(
        MILK_PACKED + 2 * round,
      )
    }
  })

  test('a participant clearing the cart removes the rows another member added', async ({
    request,
  }) => {
    const owner = makeGql(request, OWNER)
    const participant = makeGql(request, PARTICIPANT)
    // Given the owner's 2 Milk in the shared cart, seen by the participant
    const seed = await seedHousehold(request, owner)
    await owner(ADD_TO_CART, {
      cartId: seed.cartId,
      itemId: seed.milk,
      quantity: 2,
    })
    expect(await cartRows(participant, seed.cartId)).toHaveLength(1)

    // When the participant clears the cart
    await participant(ABANDON_CART, { cartId: seed.cartId })

    // Then the owner's row is gone, and the stock did not move
    expect(await cartRows(owner, seed.cartId)).toEqual([])
    expect(await packedAt(owner, seed, seed.milk)).toBe(MILK_PACKED)
  })

  test('location viewer can read the shared cart, and cannot add to it or check it out', async ({
    request,
  }) => {
    const owner = makeGql(request, OWNER)
    const viewer = makeGql(request, VIEWER)
    // Given the owner's 2 Milk in the Home cart
    const seed = await seedHousehold(request, owner)
    const row = (
      await owner<{ addToCart: CartItemRow }>(ADD_TO_CART, {
        cartId: seed.cartId,
        itemId: seed.milk,
        quantity: 2,
      })
    ).addToCart

    // When the viewer reads it
    // Then the viewer sees the owner's row
    const seen = await cartRows(viewer, seed.cartId)
    expect(seen.map((r) => [r.id, r.quantity])).toEqual([[row.id, 2]])

    // When the viewer adds to it, or checks it out with the right list
    // Then both are refused
    await expect(
      viewer(ADD_TO_CART, {
        cartId: seed.cartId,
        itemId: seed.milk,
        quantity: 1,
      }),
    ).rejects.toThrow(FORBIDDEN)
    await expect(
      viewer(CHECKOUT, {
        cartId: seed.cartId,
        items: [{ cartItemId: row.id, quantity: 2 }],
      }),
    ).rejects.toThrow(FORBIDDEN)

    // And nothing changed: the row is still 2, the stock still 3
    expect(
      (await cartRows(owner, seed.cartId)).map((r) => [r.id, r.quantity]),
    ).toEqual([[row.id, 2]])
    expect(await packedAt(owner, seed, seed.milk)).toBe(MILK_PACKED)
    expect(await logCount(owner, seed, seed.milk)).toBe(0)
  })

  test('two adds of the same new item at the same time make one row with the sum', async ({
    request,
  }) => {
    // `addToCart` is one `upsert` on `cartId_itemId`. If two adds of an item
    // that has no row yet both tried to INSERT, the second would hit the
    // unique index and fail with P2002. Three rounds, each with its own item
    // so each round starts with no row. Like the checkout race above, the
    // overlap is up to timing.
    const owner = makeGql(request, OWNER)
    const participant = makeGql(request, PARTICIPANT)
    const seed = await seedHousehold(request, owner)

    for (const name of ['Bread', 'Butter', 'Jam']) {
      const itemId = (
        await owner<{ createItem: Row }>(CREATE_ITEM, { input: { name } })
      ).createItem.id

      // When the owner adds 2 and the participant adds 3 at once
      const results = await Promise.allSettled([
        owner(ADD_TO_CART, { cartId: seed.cartId, itemId, quantity: 2 }),
        participant(ADD_TO_CART, { cartId: seed.cartId, itemId, quantity: 3 }),
      ])

      // Then both adds succeeded (no P2002), into one row of 5
      expect(
        results.map((r) => (r.status === 'rejected' ? String(r.reason) : 'ok')),
        name,
      ).toEqual(['ok', 'ok'])
      const rows = (await cartRows(owner, seed.cartId)).filter(
        (r) => r.itemId === itemId,
      )
      expect(
        rows.map((r) => r.quantity),
        name,
      ).toEqual([5])
    }
  })
})

test.describe('cart item imports into a shared cart', () => {
  // `bulkCreateCartItems` (the `skip` and `clear` strategies) and
  // `bulkUpsertCartItems` (`replace`) follow decision P3 of the H3b plan:
  // rows of one `(cartId, itemId)` pair are summed first, `bulkCreate…` ADDS
  // to the pair's row, `bulkUpsert…` SETS it, and every write is one upsert on
  // the pair. Until now this was proved only on the Prisma fake.
  //
  // Both tests import as a second person into a cart where the OWNER already
  // has a Milk row. Cart imports go by location role (`participant`+), not by
  // who added a row, so that person may write the shared cart's rows.
  //
  // THE IMPORTER IS A HOUSEHOLD MANAGER, NOT THE PARTICIPANT, since households
  // H4 task E.3. Every bulk import mutation now asks `manager` first (the
  // import role gate, decision O1), and the PARTICIPANT is a household
  // `member`, so the gate refused both tests with `FORBIDDEN` before the P3
  // rules ran. The importer still holds only `participant` on Home, and is
  // still not the person who added the owner's row, so each test proves what
  // it proved before: a person other than the adder merges into the shared
  // cart's rows. Importing as the OWNER would lose that second half.
  //
  // The payload ids carry a `shared-cart-` prefix: `CartItem.id` is a global
  // primary key, so they must not meet another spec's ids.

  test('the add strategy sums two rows of one pair, and adds to a pair that already has a row', async ({
    request,
  }) => {
    const owner = makeGql(request, OWNER)
    const importer = makeGql(request, IMPORTER)
    // Given the owner's 2 Milk in the shared cart
    const seed = await seedHousehold(request, owner)
    // And a household manager who is a participant on Home
    await addImporter(request, seed)
    const milkRow = (
      await owner<{ addToCart: CartItemRow }>(ADD_TO_CART, {
        cartId: seed.cartId,
        itemId: seed.milk,
        quantity: 2,
      })
    ).addToCart

    // When the importer imports, with `bulkCreateCartItems`, a backup with
    // two rows for Eggs and a NEW id for Milk
    await importer(BULK_CREATE_CART_ITEMS, {
      cartItems: [
        {
          id: 'shared-cart-eggs-b',
          cartId: seed.cartId,
          itemId: seed.eggs,
          quantity: 2,
        },
        {
          id: 'shared-cart-eggs-a',
          cartId: seed.cartId,
          itemId: seed.eggs,
          quantity: 1,
        },
        {
          id: 'shared-cart-milk',
          cartId: seed.cartId,
          itemId: seed.milk,
          quantity: 3,
        },
      ],
    })

    // Then there is one row per pair: Eggs is the sum, under the LOWEST id,
    // and Milk is 2 + 3 under the owner's row id
    const rows = await cartRows(owner, seed.cartId)
    expect(rows).toEqual(
      expect.arrayContaining([
        {
          id: milkRow.id,
          cartId: seed.cartId,
          itemId: seed.milk,
          quantity: 5,
        },
        {
          id: 'shared-cart-eggs-a',
          cartId: seed.cartId,
          itemId: seed.eggs,
          quantity: 3,
        },
      ]),
    )
    expect(rows).toHaveLength(2)
  })

  test('the replace strategy sets a pair that already has a row to the sum of the backup’s rows', async ({
    request,
  }) => {
    const owner = makeGql(request, OWNER)
    const importer = makeGql(request, IMPORTER)
    // Given the owner's 2 Milk in the shared cart
    const seed = await seedHousehold(request, owner)
    // And a household manager who is a participant on Home
    await addImporter(request, seed)
    const milkRow = (
      await owner<{ addToCart: CartItemRow }>(ADD_TO_CART, {
        cartId: seed.cartId,
        itemId: seed.milk,
        quantity: 2,
      })
    ).addToCart

    // When the importer imports, with `bulkUpsertCartItems`, a backup with
    // two NEW ids for Milk (3 and 4) and two rows for Eggs
    await importer(BULK_UPSERT_CART_ITEMS, {
      cartItems: [
        {
          id: 'shared-cart-milk-a',
          cartId: seed.cartId,
          itemId: seed.milk,
          quantity: 3,
        },
        {
          id: 'shared-cart-milk-b',
          cartId: seed.cartId,
          itemId: seed.milk,
          quantity: 4,
        },
        {
          id: 'shared-cart-eggs-a',
          cartId: seed.cartId,
          itemId: seed.eggs,
          quantity: 1,
        },
        {
          id: 'shared-cart-eggs-b',
          cartId: seed.cartId,
          itemId: seed.eggs,
          quantity: 1,
        },
      ],
    })

    // Then Milk is SET to 3 + 4 = 7 on the owner's row (not 2 + 7 = 9, and
    // not a second row), and Eggs is one row of 2
    const rows = await cartRows(owner, seed.cartId)
    expect(rows).toEqual(
      expect.arrayContaining([
        {
          id: milkRow.id,
          cartId: seed.cartId,
          itemId: seed.milk,
          quantity: 7,
        },
        {
          id: 'shared-cart-eggs-a',
          cartId: seed.cartId,
          itemId: seed.eggs,
          quantity: 2,
        },
      ]),
    )
    expect(rows).toHaveLength(2)
  })
})
