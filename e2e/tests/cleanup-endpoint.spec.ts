import { expect, test } from '@playwright/test'
import { E2E_SECOND_USER_ID, E2E_USER_ID } from '../constants'
import { CLEANUP_MODEL_KEYS, cleanupCloudData } from '../helpers/cloudTeardown'
import {
  createCloudUser,
  createInvite,
  joinHousehold,
  readCloudUser,
  sendFakeUserDeleted,
} from '../helpers/cloudUsers'
import { makeGql } from '../utils/cloud'

// ── WHAT THIS FILE COVERS ────────────────────────────────────────────────────
//
// `DELETE /e2e/cleanup` (apps/server/src/lib/e2eCleanup.ts, mounted in
// apps/server/src/index.ts) — that it really deletes the test user's rows,
// its `User` row included, against real Postgres.
//
// Since households H3a task 3.10 the route deletes by the households the
// user OWNS, plus the user's own role rows, and returns 18 counts (19 since
// households H5b task G.6 added `householdInvites`, 20 since households H6
// task J.1 added `householdActivities`, 21 since households H6b task K.1
// added `ownershipOffers`, 22 since households H7b task M.1 added
// `locationPreferences`). The seed
// below makes the user's household on the first request (first sign-in), so
// the three new counts — `locationMembers`, `householdMembers` and
// `households` — are at least 1 too. The rule "never delete a household the
// user only belongs to" needs a second member, which E2E cannot add before
// task 3.11 (`POST /e2e/household-members`). It is pinned only by the unit
// test `apps/server/src/lib/e2eCleanup.test.ts`.
//
// The invite is made through the real `createInvite` mutation, in the user's
// own household, so it is deleted by the `householdId` half of its filter.
// The other half, `createdById` (an invite the user made in a household they
// do not own), is pinned only by that unit test too.
//
// ── SEVERAL USERS IN ONE CALL (E2E speed plan, task S.4) ─────────────────────
//
// | Test | What it proves on real SQL                                         |
// |------|--------------------------------------------------------------------|
// | 2    | one call with two users deletes both; each count is the sum        |
// | 3    | a household with NO owner (its owner's account deleted) and two    |
// |      | members A and B: a call with [A] keeps it, a call with [A, B]      |
// |      | deletes it with its data (decision D6, owner answer P5-A)          |
//
// Test 3 is the real-SQL check of the D6 rule in both directions. The other
// direction, "a member's cleanup leaves the OWNER's household alone", is
// household-member-cleanup.spec.ts.
//
// ── WHY IT EXISTS (issue #319) ───────────────────────────────────────────────
//
// `apps/server/src/resolvers/purge-coverage.test.ts` guards the route's delete
// list, but it is a SOURCE-TEXT check. When this spec was written it asserted
// that the string `prisma.location.deleteMany(` appears in `lib/e2eCleanup.ts`.
// It never started the server, never called the route, and never read the
// `where` clause. So this passed that guard, answered 200, and deleted nothing:
//
//   prisma.location.deleteMany({ where: { userId: someWrongValue } })
//
// Since E2E speed plan task S.2 the route is one SQL function
// (`lib/e2eCleanupSql.ts`), and the guard reads each `DELETE FROM "<Model>"`
// and the text of its `WHERE`. It still cannot see a VALUE, so this spec is
// still the only check that each filter matches real rows.
//
// `cleanupCloudData` could not see it either — until this issue it checked only
// the HTTP status.
//
// This spec closes that gap behaviourally: it seeds one row of EVERY model the
// route deletes, calls the route, and asserts every returned count is at least
// 1. A wrong `where` clause reports 0 for that model and the test fails.
//
// ── WHAT IT STILL DOES NOT COVER ─────────────────────────────────────────────
//
// The `"ItemStock"` delete (it was `prisma.itemStock.deleteMany` until task S.2)
// remains covered by no test that can fail on DATA. Both of its
// foreign keys are ON DELETE CASCADE (prisma/schema.prisma) — deleting the item
// or the location takes the stock rows with it. Delete that line and the rows
// still go; only the reported `itemStocks` count changes, and this spec's
// "at least 1" assertion is what notices. So the LINE is covered here, but the
// DATA it protects is not at risk either way.
//
// The `User` row (households task 2.6) is checked by its `users` count only.
// GraphQL has no query that reads a `User` row, so it cannot be read back.
// The server's `lib/e2eCleanup.test.ts` pins its `where: { id }` and that it
// is deleted last, but only against a fake.
//
// ── WHY THERE IS NO BROWSER ──────────────────────────────────────────────────
//
// The subject is a server route, not a screen. Everything below goes through
// GraphQL with `makeGql`, the same way `location-scoped-writes.spec.ts` does.
// This file runs in the `cloud` project only: it is named in that project's
// `testMatch` and in the `local` project's `testIgnore`
// (e2e/playwright.config.ts).
//
// ── CLEANING UP AFTER ITSELF ─────────────────────────────────────────────────
//
// This spec calls the cleanup endpoint as its SUBJECT, which is unusual. It
// still runs `cleanupCloudData` in `beforeEach` like every other cloud spec
// (only there since E2E speed plan task S.3), so a failure part-way through
// in an earlier run, or the fresh default location the readbacks create, is
// gone before the test starts. The next spec's own `beforeEach` cleans the
// users it uses.

type Row = { id: string }

/** The member the seed's ownership offer is made TO (households H6b K.8). */
const OFFER_MEMBER = `${E2E_SECOND_USER_ID}-cleanup-offer`
/** Test 2: two users, each with their own household, cleaned in one call. */
const SUM_A = `${E2E_SECOND_USER_ID}-cleanup-sum-a`
const SUM_B = `${E2E_SECOND_USER_ID}-cleanup-sum-b`
/** Test 3: an owner whose account is deleted, and the two members left. */
const GONE_OWNER = `${E2E_SECOND_USER_ID}-cleanup-gone-owner`
const LEFT_A = `${E2E_SECOND_USER_ID}-cleanup-left-a`
const LEFT_B = `${E2E_SECOND_USER_ID}-cleanup-left-b`
/** Every user this file writes as, cleaned in ONE call (E2E speed plan, S.4). */
const ALL_USERS = [
  OFFER_MEMBER,
  SUM_A,
  SUM_B,
  GONE_OWNER,
  LEFT_A,
  LEFT_B,
  E2E_USER_ID,
]

const LOCATIONS = `query { locations { id name } }`
const CREATE_LOCATION = `mutation ($name: String!) { createLocation(name: $name) { id } }`
const CREATE_TAG_TYPE = `mutation ($name: String!, $color: String!) {
  createTagType(name: $name, color: $color) { id }
}`
const CREATE_TAG = `mutation ($name: String!, $typeId: String!) {
  createTag(name: $name, typeId: $typeId) { id }
}`
const CREATE_VENDOR = `mutation ($name: String!, $locationId: ID!) {
  createVendor(name: $name, locationId: $locationId) { id }
}`
const CREATE_ITEM = `mutation ($input: CreateItemInput!) {
  createItem(input: $input) { id tagIds vendorIds }
}`
const CREATE_RECIPE = `mutation ($name: String!, $items: [RecipeItemInput!]) {
  createRecipe(name: $name, items: $items) { id items { itemId defaultAmount } }
}`
const CREATE_SHELF = `mutation ($name: String!, $type: String!, $itemIds: [String!]) {
  createShelf(name: $name, type: $type, itemIds: $itemIds) { id }
}`
const UPSERT_STOCK = `mutation ($itemId: ID!, $locationId: ID!, $input: ItemStockInput!) {
  upsertItemStock(itemId: $itemId, locationId: $locationId, input: $input) { id }
}`
const VENDOR_CART = `query ($vendorId: ID, $locationId: ID!) {
  vendorCart(vendorId: $vendorId, locationId: $locationId) { id }
}`
const ADD_TO_CART = `mutation ($cartId: ID!, $itemId: ID!, $quantity: Int!) {
  addToCart(cartId: $cartId, itemId: $itemId, quantity: $quantity) { id }
}`
const ADD_LOG = `mutation ($itemId: ID!, $delta: Float!, $quantity: Float!, $occurredAt: String!, $locationId: ID!) {
  addInventoryLog(itemId: $itemId, delta: $delta, quantity: $quantity, occurredAt: $occurredAt, locationId: $locationId) { id }
}`

// Read-back queries. Every one is whole-account, so none of them needs an id
// that the cleanup has just destroyed.
const READ_BACK = `query ($itemId: ID!) {
  items { id }
  tags { id }
  tagTypes { id }
  vendors { id }
  recipes { id }
  shelves { id }
  inventoryLogs { id }
  allCarts { id }
  allCartItems { id }
  itemStocksForItem(itemId: $itemId) { id }
}`

type ReadBack = {
  items: Row[]
  tags: Row[]
  tagTypes: Row[]
  vendors: Row[]
  recipes: Row[]
  shelves: Row[]
  inventoryLogs: Row[]
  allCarts: Row[]
  allCartItems: Row[]
  itemStocksForItem: Row[]
}

test.beforeEach(async ({ request }) => {
  // The only cleanup of each test: it starts clean whatever ran before it
  // (E2E speed plan, D7). One call for every user of the file (task S.4).
  // Test 3 can leave a household with no owner when it fails half way; all
  // its members are in this list, so this call deletes it (decision D6).
  await cleanupCloudData(request, ALL_USERS)
})

test.describe('the /e2e/cleanup endpoint really deletes', () => {
  test('user data seeded across every model is gone after a cleanup, and every model reports what it deleted', async ({
    request,
  }) => {
    const gql = makeGql(request)

    // ── Given one row of every model the route deletes ───────────────────────

    // User — written on purpose, with a name the server would never pick. The
    // server's request-path safety net (`ensureUser`) would also create this
    // row on the first GraphQL call below, named by the id. Seeding it here
    // means the `users` count does not depend on that.
    await createCloudUser(request, E2E_USER_ID, 'Cleanup Spec User')

    // Location — the first request makes the caller's household and its
    // first location, "Home", with a `HouseholdMember` and a `LocationMember`
    // row (`ensureHousehold`, apps/server/src/lib/household.ts), and a
    // second is created outright, with a second `LocationMember` row. Two, so the readback can tell "the seeded
    // locations are gone" from "there happens to be one location".
    const { locations } = await gql<{
      locations: { id: string; name: string }[]
    }>(LOCATIONS)
    // Exactly one: the account was cleaned in `beforeEach`, so first sign-in
    // has just made "Home" and nothing else.
    expect(locations).toHaveLength(1)
    const home = locations[0]
    if (!home)
      throw new Error(
        `no location after the locations query — got ${JSON.stringify(locations)}`,
      )
    const { createLocation } = await gql<{ createLocation: Row }>(
      CREATE_LOCATION,
      {
        name: 'Office',
      },
    )
    const seededLocationIds = [home.id, createLocation.id]

    // TagType and Tag
    const { createTagType } = await gql<{ createTagType: Row }>(
      CREATE_TAG_TYPE,
      {
        name: 'Category',
        color: 'orange',
      },
    )
    const { createTag } = await gql<{ createTag: Row }>(CREATE_TAG, {
      name: 'Dairy',
      typeId: createTagType.id,
    })

    // Vendor — and, as a side effect, this vendor's Cart at Home
    // (`createVendor`, apps/server/src/resolvers/vendor.resolver.ts).
    const { createVendor } = await gql<{ createVendor: Row }>(CREATE_VENDOR, {
      name: 'Corner Shop',
      locationId: home.id,
    })

    // Item — and, through its `tagIds` / `vendorIds`, one ItemTag and one
    // ItemVendor. Those two junction models have no mutation of their own.
    const { createItem } = await gql<{
      createItem: { id: string; tagIds: string[]; vendorIds: string[] }
    }>(CREATE_ITEM, {
      input: {
        name: 'Milk',
        tagIds: [createTag.id],
        vendorIds: [createVendor.id],
      },
    })
    // `createItem` takes no id, so the server's cuid is what every later call
    // and the readback use.
    const itemId = createItem.id

    // ItemStock — `createItem` writes none, so it is written here on purpose.
    // It never did: this used to read "only `updateItem` mirrors stock to the
    // default location", and cloud locations PR 5 deleted that mirror along
    // with `Item`'s five state columns. `upsertItemStock` is now the only way
    // a seed gets a stock row, and it names its location.
    await gql(UPSERT_STOCK, {
      itemId,
      locationId: home.id,
      input: {
        targetQuantity: 4,
        refillThreshold: 1,
        packedQuantity: 3,
        unpackedQuantity: 0,
      },
    })

    // Recipe — and, through its `items`, one RecipeItem.
    const { createRecipe } = await gql<{
      createRecipe: { id: string; items: { itemId: string }[] }
    }>(CREATE_RECIPE, {
      name: 'Pancakes',
      items: [{ itemId, defaultAmount: 1 }],
    })

    // Shelf
    await gql(CREATE_SHELF, {
      name: 'Fridge',
      type: 'selection',
      itemIds: [itemId],
    })

    // Cart and CartItem — the no-vendor cart at Home, with one entry.
    const { vendorCart } = await gql<{ vendorCart: Row }>(VENDOR_CART, {
      vendorId: null,
      locationId: home.id,
    })
    await gql(ADD_TO_CART, { cartId: vendorCart.id, itemId, quantity: 2 })

    // InventoryLog
    await gql(ADD_LOG, {
      itemId,
      delta: 2,
      quantity: 5,
      occurredAt: new Date().toISOString(),
      locationId: home.id,
    })

    // HouseholdInvite — an open invite to the user's own household, made
    // through the real `createInvite` mutation (households H5b, task G.3).
    // The user owns the household, so they may invite. It is read back
    // BEFORE the cleanup only: `householdInvites` runs first sign-in like
    // `locations`, so after the cleanup it would read a brand-new, empty
    // household. Its `deleted` count below is the check on the delete.
    //
    // HouseholdActivity — no seed step of its own. Since households H6 task
    // J.2, `createInvite` writes an INVITE_CREATED row in the user's own
    // household, so this one call also seeds the activity row that the
    // `householdActivities` count below needs. It is read back just below,
    // through the real `householdActivity` query (task J.3).
    //
    const token = await createInvite(request, E2E_USER_ID, 'member', [
      { locationId: home.id, role: 'viewer' },
    ])
    const { householdInvites } = await gql<{
      householdInvites: { token: string }[]
    }>(`query { householdInvites { token } }`)
    expect(householdInvites.map((invite) => invite.token)).toEqual([token])
    const { householdActivity } = await gql<{
      householdActivity: { action: string }[]
    }>(`query { householdActivity { action } }`)
    expect(householdActivity.map((row) => row.action)).toContain(
      'INVITE_CREATED',
    )

    // OwnershipOffer — a real transfer offer (households H6b task K.8). An
    // offer is made TO a member, so OFFER_MEMBER joins first, through a
    // second invite, then the user (the owner) offers the household with the
    // real `offerOwnership` mutation (task K.3). The offer is in the user's
    // OWN household and is TO someone else, so only the `householdId: owned`
    // half of the cleanup's filter can delete it: the `toUserId` half names
    // the user, and the household delete would cascade it away before the
    // count. So this seed is what lets `ownershipOffers` read at least 1.
    // OFFER_MEMBER is cleaned in `beforeEach`: the user's cleanup deletes
    // their member row (the household is the user's), theirs the `User` row.
    await createCloudUser(request, OFFER_MEMBER, 'Cleanup Offer Member')
    await joinHousehold(
      request,
      OFFER_MEMBER,
      await createInvite(request, E2E_USER_ID, 'member', []),
    )
    await gql(
      `mutation ($userId: ID!) { offerOwnership(userId: $userId) { id } }`,
      { userId: OFFER_MEMBER },
    )
    const { household } = await gql<{
      household: { pendingTransfer: { toUserId: string } | null }
    }>(`query { household { pendingTransfer { toUserId } } }`)
    expect(household.pendingTransfer?.toUserId).toBe(OFFER_MEMBER)

    // LocationPreference — one row, written by the real `markLocationVisited`
    // mutation (households H7b task M.2): the user's visit to Home. It is
    // the user's own row, so the `userId` half of the cleanup's filter can
    // delete it; the delete runs before the location delete, which would
    // take it by cascade. `true` means the row was written.
    const { markLocationVisited } = await gql<{
      markLocationVisited: boolean
    }>(
      `mutation ($locationId: ID!) { markLocationVisited(locationId: $locationId) }`,
      {
        locationId: home.id,
      },
    )
    expect(markLocationVisited).toBe(true)

    // ── The seed really wrote rows ───────────────────────────────────────────
    //
    // A seed that quietly wrote nothing would leave every readback empty, so the
    // "nothing is left" half at the bottom would pass while proving nothing. This
    // block is what stops that.
    //
    // It is not the ONLY guard: a fully dead seed also makes every deleted count
    // 0, which the count assertion below catches. What this block adds is WHERE
    // the failure lands. It fails before the route is even called, naming the
    // model whose seed is broken, instead of reporting "the route deleted
    // nothing" and sending the reader to `lib/e2eCleanup.ts`. Measured 2026-09-25 with
    // `createShelf` removed: the run failed at `expect(before.shelves)`, not at
    // the count assertion.
    const before = await gql<ReadBack>(READ_BACK, { itemId })
    expect(before.items).toHaveLength(1)
    expect(before.tags).toHaveLength(1)
    expect(before.tagTypes).toHaveLength(1)
    expect(before.vendors).toHaveLength(1)
    expect(before.recipes).toHaveLength(1)
    expect(before.shelves).toHaveLength(1)
    // Two: the seeded log, and the `stockCount` row the stock seed's
    // `upsertItemStock` wrote (inventory log layout, 2026-11-25)
    expect(before.inventoryLogs).toHaveLength(2)
    expect(before.allCartItems).toHaveLength(1)
    expect(before.itemStocksForItem).toHaveLength(1)
    // Two carts: the one `createVendor` pre-created, and the no-vendor cart.
    expect(before.allCarts).toHaveLength(2)
    // The three junction models are read through their parents, which is the
    // only way GraphQL exposes them.
    expect(createItem.tagIds).toEqual([createTag.id])
    expect(createItem.vendorIds).toEqual([createVendor.id])
    expect(createRecipe.items.map((row) => row.itemId)).toEqual([itemId])

    // ── When the cleanup endpoint runs ───────────────────────────────────────
    const { deleted } = await cleanupCloudData(request)

    // ── Then every model reports at least one deleted row ────────────────────
    //
    // THIS IS THE ASSERTION THAT CATCHES A WRONG `where` CLAUSE. A filter that
    // matches nothing still answers 200 and still satisfies the source-text
    // guard in `purge-coverage.test.ts`; it reports 0 here.
    const zero = CLEANUP_MODEL_KEYS.filter((key) => deleted[key] < 1)
    expect(
      zero,
      `models that deleted nothing: ${JSON.stringify(deleted)}`,
    ).toEqual([])
    // Named on its own too, for the model households H6 task J.1 added (the
    // check above already covers it; this line says so in the report).
    expect(deleted.householdActivities).toBeGreaterThanOrEqual(1)
    // And for the model households H6b task K.1 added.
    expect(deleted.ownershipOffers).toBeGreaterThanOrEqual(1)
    // And for the model households H7b task M.1 added. The seed's visit
    // above wrote its row (task M.5). Between tasks M.1 and M.5 nothing
    // seeded one, and this spec failed on `"locationPreferences":0`.
    expect(deleted.locationPreferences).toBeGreaterThanOrEqual(1)

    // ── And nothing of the user's is left ────────────────────────────────────
    const after = await gql<ReadBack>(READ_BACK, { itemId })
    expect(after.items).toEqual([])
    expect(after.tags).toEqual([])
    expect(after.tagTypes).toEqual([])
    expect(after.vendors).toEqual([])
    expect(after.recipes).toEqual([])
    expect(after.shelves).toEqual([])
    expect(after.inventoryLogs).toEqual([])
    expect(after.allCarts).toEqual([])
    expect(after.allCartItems).toEqual([])
    // Weak on its own: `ItemStock` cascades from both `Item` and `Location`, so
    // this is empty even if the `"ItemStock"` delete were removed. The `deleted`
    // count above is the assertion that speaks for that line.
    expect(after.itemStocksForItem).toEqual([])
    // NOT READ BACK: ItemTag, ItemVendor and RecipeItem. GraphQL exposes them
    // only through `Item.tagIds` / `Item.vendorIds` / `Recipe.items`, and all
    // three parents are gone by now. Their `deleted` counts above are the only
    // check on them.

    // Location is read back LAST, because reading it recreates one. The user
    // has no household any more, so the `locations` query runs first sign-in
    // again (`ensureHousehold`) and answers with a brand-new "Home" — exactly
    // one row, and not one of the seeded ids. The next test's `beforeEach`
    // deletes it, with its new household.
    const { locations: afterLocations } = await gql<{
      locations: { id: string }[]
    }>(LOCATIONS)
    expect(afterLocations).toHaveLength(1)
    expect(seededLocationIds).not.toContain(afterLocations[0].id)
  })

  test('one call with two users deletes both, and each count is the sum', async ({
    request,
  }) => {
    // Given two users, each in their own household: A with one tag type,
    // B with two. The first request of each makes a household, its "Home",
    // a member row and a location role row (first sign-in).
    const a = makeGql(request, SUM_A)
    const b = makeGql(request, SUM_B)
    for (const [gql, names] of [
      [a, ['A Kind']],
      [b, ['B Kind 1', 'B Kind 2']],
    ] as const) {
      const { locations } = await gql<{ locations: Row[] }>(LOCATIONS)
      expect(locations).toHaveLength(1)
      for (const name of names) {
        await gql(CREATE_TAG_TYPE, { name, color: 'blue' })
      }
    }

    // When ONE call cleans both
    const { deleted } = await cleanupCloudData(request, [SUM_A, SUM_B])

    // Then each count is A's plus B's
    expect(deleted.tagTypes).toBe(3)
    expect(deleted.households).toBe(2)
    expect(deleted.locations).toBe(2)
    expect(deleted.householdMembers).toBe(2)
    expect(deleted.locationMembers).toBe(2)
    expect(deleted.users).toBe(2)
    // And both users are gone
    expect(await readCloudUser(request, SUM_A)).toBeNull()
    expect(await readCloudUser(request, SUM_B)).toBeNull()
  })

  test('a household with no owner is deleted only when every member is in the list', async ({
    request,
  }) => {
    // Given a household with one item, and two members, A (manager) and B
    // (member), who joined through real invites before sending any other
    // request (so neither has a household of their own)
    const owner = makeGql(request, GONE_OWNER)
    await createCloudUser(request, GONE_OWNER, 'Gone Owner')
    await createCloudUser(request, LEFT_A, 'Left A')
    await createCloudUser(request, LEFT_B, 'Left B')
    await owner(LOCATIONS)
    await owner(CREATE_ITEM, { input: { name: 'Orphan Rice' } })
    await joinHousehold(
      request,
      LEFT_A,
      await createInvite(request, GONE_OWNER, 'manager', []),
    )
    await joinHousehold(
      request,
      LEFT_B,
      await createInvite(request, GONE_OWNER, 'member', []),
    )

    // And the owner's account is deleted: the hand-over removes the owner's
    // member row, so the household has NO owner, and offers it to the others
    await sendFakeUserDeleted(request, GONE_OWNER)
    const b = makeGql(request, LEFT_B)
    const HOUSEHOLD_STATE = `query {
      household { id hasOwner }
      householdMembers { userId role }
      items { name }
    }`
    type State = {
      household: { id: string; hasOwner: boolean }
      householdMembers: { userId: string; role: string }[]
      items: { name: string }[]
    }
    const before = await b<State>(HOUSEHOLD_STATE)
    expect(before.household.hasOwner).toBe(false)
    expect(before.householdMembers.map((p) => p.userId).sort()).toEqual(
      [LEFT_A, LEFT_B].sort(),
    )
    expect(before.items).toEqual([{ name: 'Orphan Rice' }])

    // When only A is cleaned
    const first = await cleanupCloudData(request, [LEFT_A])

    // Then the household stays: B, a member, is not in the list
    expect(first.deleted.households).toBe(0)
    expect(first.deleted.items).toBe(0)
    expect(first.deleted.householdMembers).toBe(1)
    expect(first.deleted.users).toBe(1)
    const middle = await b<State>(HOUSEHOLD_STATE)
    expect(middle.household.id).toBe(before.household.id)
    expect(middle.householdMembers.map((p) => p.userId)).toEqual([LEFT_B])
    expect(middle.items).toEqual([{ name: 'Orphan Rice' }])

    // When A and B are cleaned together
    const second = await cleanupCloudData(request, [LEFT_A, LEFT_B])

    // Then the household and its data are deleted: every member is listed,
    // although nobody owns it
    expect(second.deleted.households).toBe(1)
    expect(second.deleted.items).toBe(1)
    expect(second.deleted.locations).toBe(1)
    expect(second.deleted.householdMembers).toBe(1)
    expect(second.deleted.users).toBe(1)
  })
})
