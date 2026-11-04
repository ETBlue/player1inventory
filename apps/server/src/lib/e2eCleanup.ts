import type { Request, Response } from 'express'
import { prisma } from './prisma.js'
import { forgetSeenToday } from './userRow.js'

// `DELETE /e2e/cleanup`: delete every row one test user owns, so each E2E
// test starts clean. `index.ts` mounts it ONLY inside its
// `if (E2E_TEST_MODE)` block; `src/webhookRouteOrder.test.ts` guards that.
//
// It lived inline in `index.ts` until households task 2.6. It moved here so
// a unit test can call it: `index.ts` starts a server when it loads, so no
// test can import it. `e2eCleanup.test.ts` pins the order of the deletes and
// that `forgetSeenToday` runs after they commit.

/**
 * The one key per model in the `deleted` object this route returns, in the
 * order the transaction deletes them. 15 models. The names match
 * `CLEANUP_MODEL_KEYS` in e2e/helpers/cloudTeardown.ts, which checks that
 * every one of them is present in the body. The 11 names shared with
 * `PurgeResult` (apps/server/src/schema/purge.graphql) are spelled the same
 * way there.
 */
export const CLEANUP_MODEL_KEYS = [
  'inventoryLogs',
  'cartItems',
  'carts',
  'itemTags',
  'itemVendors',
  'recipeItems',
  'itemStocks',
  'items',
  'tags',
  'tagTypes',
  'vendors',
  'recipes',
  'shelves',
  'locations',
  'users',
] as const

export type CleanupModelKey = (typeof CLEANUP_MODEL_KEYS)[number]

export async function e2eCleanupHandler(req: Request, res: Response): Promise<void> {
  const userId = req.headers['x-e2e-user-id'] as string | undefined
  if (!userId) {
    res.status(400).json({ error: 'Missing x-e2e-user-id header' })
    return
  }
  // Every `deleteMany` result is `{ count }`. The counts used to be thrown
  // away, and that is what made a WRONG `where` clause invisible: the route
  // answered 200 either way. `purge-coverage.test.ts` cannot see it either —
  // it is a source-text check that only asks whether the string
  // `prisma.<model>.deleteMany(` appears in this file, never what filter the
  // call carries. So the counts are returned, and
  // `e2e/tests/cleanup-endpoint.spec.ts` seeds one row of every model below
  // and asserts each count is at least 1.
  //
  // ORDER MATTERS FOR THE COUNTS, not only for the deletes. Every child is
  // deleted before its parent, so each count is the number of rows this
  // statement removed. Move `item.deleteMany` above `itemTag.deleteMany` and
  // the ItemTag rows go by ON DELETE CASCADE instead, reporting 0.
  //
  // This is the ARRAY form of `$transaction`: Prisma runs the 15 statements
  // in this order, in one transaction, and returns their results in the
  // same order.
  const [
    inventoryLogs,
    cartItems,
    carts,
    itemTags,
    itemVendors,
    recipeItems,
    itemStocks,
    items,
    tags,
    tagTypes,
    vendors,
    recipes,
    shelves,
    locations,
    users,
  ] = await prisma.$transaction([
    prisma.inventoryLog.deleteMany({ where: { userId } }),
    prisma.cartItem.deleteMany({ where: { userId } }),
    prisma.cart.deleteMany({ where: { userId } }),
    prisma.itemTag.deleteMany({ where: { item: { userId } } }),
    prisma.itemVendor.deleteMany({ where: { item: { userId } } }),
    prisma.recipeItem.deleteMany({ where: { item: { userId } } }),
    // ItemStock has no userId — it is scoped through its Location. Both of its
    // FKs are ON DELETE CASCADE, so these rows would go when item or location
    // goes; the explicit delete, and its position before both, keeps this list
    // identical to clearAllData and purgeUserData. See the ordering comment on
    // purgeUserData (purge.resolver.ts), where the order does change the result
    // because that path returns the deleted count.
    prisma.itemStock.deleteMany({ where: { location: { userId } } }),
    prisma.item.deleteMany({ where: { userId } }),
    prisma.tag.deleteMany({ where: { userId } }),
    prisma.tagType.deleteMany({ where: { userId } }),
    prisma.vendor.deleteMany({ where: { userId } }),
    prisma.recipe.deleteMany({ where: { userId } }),
    // Shelves are user-scoped too — without this they accumulate across runs
    // in the shared DB and collide (by id) with imported fixture shelves,
    // surfacing a spurious "Conflicts detected" dialog on import tests.
    prisma.shelf.deleteMany({ where: { userId } }),
    // Locations are user-scoped too. Without this they accumulate across runs
    // in the shared test DB, and the next run starts with the previous run's
    // locations instead of a fresh first location.
    //
    // NOT TRUE YET for a user who has signed in since households H3a task
    // 3.5. Until task 3.5, ensureDefaultLocation made the fresh location on
    // the next request. Now first sign-in (ensureHousehold, lib/household.ts)
    // makes a household, a location and a `HouseholdMember` row, and this
    // list does not delete `HouseholdMember` rows. That row's foreign key to
    // `User` is ON DELETE RESTRICT, so the `user.deleteMany` below fails with
    // P2003 and the whole transaction rolls back: nothing is deleted. Only a
    // user with no `HouseholdMember` row is cleaned up, and that user gets a
    // fresh household and location on the next request. Task 3.10 adds the
    // household rows to this list and makes this comment true again.
    prisma.location.deleteMany({ where: { userId } }),
    // The User row itself (households task 2.6). Its key is `id`, not
    // `userId`: the row IS the user. It goes LAST. No model has a relation
    // to `User` yet, but H3 adds them, and a parent must go after its
    // children for every count to be the rows this statement removed.
    prisma.user.deleteMany({ where: { id: userId } }),
  ])

  // AFTER the transaction has committed, never inside it. `ensureUser`
  // (lib/userRow.ts) remembers, per process, the users it saw today, and
  // skips the database for them. Without this call, the next request today
  // would skip the check and the User row would not be created again. Called
  // before the commit, a request arriving in between could find the row that
  // is about to go, and remember it again. If the transaction throws, this
  // line is not reached, and nothing was deleted, so the memory is still
  // right.
  forgetSeenToday(userId)

  const deleted: Record<CleanupModelKey, number> = {
    inventoryLogs: inventoryLogs.count,
    cartItems: cartItems.count,
    carts: carts.count,
    itemTags: itemTags.count,
    itemVendors: itemVendors.count,
    recipeItems: recipeItems.count,
    itemStocks: itemStocks.count,
    items: items.count,
    tags: tags.count,
    tagTypes: tagTypes.count,
    vendors: vendors.count,
    recipes: recipes.count,
    shelves: shelves.count,
    locations: locations.count,
    users: users.count,
  }
  res.json({ ok: true, deleted })
}
