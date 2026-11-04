import type { Request, Response } from 'express'
import { prisma } from './prisma.js'
import { forgetSeenToday } from './userRow.js'

// `DELETE /e2e/cleanup`: delete one test user's households and account, so
// each E2E test starts clean. `index.ts` mounts it ONLY inside its
// `if (E2E_TEST_MODE)` block; `src/webhookRouteOrder.test.ts` guards that.
//
// It lived inline in `index.ts` until households task 2.6. It moved here so
// a unit test can call it: `index.ts` starts a server when it loads, so no
// test can import it. `e2eCleanup.test.ts` pins every filter, the order of
// the deletes, and that `forgetSeenToday` runs after they commit.
//
// ── WHAT IT DELETES (households H3a, task 3.10) ──
//
// 1. Every household the user OWNS (a `HouseholdMember` row with role
//    `owner`), with everything in it: its catalog, its locations and what is
//    in them, every member's role rows in it, and the household row.
// 2. The user's OWN role rows in households they do not own: their
//    `HouseholdMember` row there, and their `LocationMember` rows. Both have
//    a RESTRICT foreign key to `User`, so the `User` row cannot go while
//    they exist.
// 3. The `User` row, last.
//
// **It never deletes a household the user only belongs to.** Two-user specs
// run this route once for each user. If the first call emptied a household
// the user was only a member of, it would delete the OTHER user's data
// before that user's own cleanup ran, and the other user's test would see
// it. Only the membership rows go (point 2). Rows the user wrote in such a
// household (logs, carts) stay with it: "no path deletes rows because of who
// created them" (design *Purge*).

/**
 * The one key per model in the `deleted` object this route returns, in the
 * order the transaction deletes them. 18 models. The names match
 * `CLEANUP_MODEL_KEYS` in e2e/helpers/cloudTeardown.ts, which checks that
 * every one of them is present in the body.
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
  'locationMembers',
  'locations',
  'householdMembers',
  'households',
  'users',
] as const

export type CleanupModelKey = (typeof CLEANUP_MODEL_KEYS)[number]

export async function e2eCleanupHandler(req: Request, res: Response): Promise<void> {
  const userId = req.headers['x-e2e-user-id'] as string | undefined
  if (!userId) {
    res.status(400).json({ error: 'Missing x-e2e-user-id header' })
    return
  }

  // The households this user owns. Read by the `HouseholdMember` row, which
  // is the source of truth for rights (decision H15), not by
  // `Household.ownerId`, which only mirrors it.
  //
  // Read BEFORE the transaction, because the array form below cannot use a
  // value it reads. A household the user starts to own between this read and
  // the transaction is not deleted, and then its owner row is deleted by
  // point 2, so its `User` row delete fails on the foreign key. E2E runs one
  // test at a time, so nothing creates a household in that gap.
  //
  // `{ in: [] }` matches no row, so a user who owns nothing deletes no
  // household data at all, only their own role rows and the `User` row.
  const ownerRows = await prisma.householdMember.findMany({
    where: { userId, role: 'owner' },
    select: { householdId: true },
  })
  const owned = { in: ownerRows.map((row) => row.householdId) }

  // Every `deleteMany` result is `{ count }`. The counts are returned, so a
  // WRONG `where` clause is visible: `e2e/tests/cleanup-endpoint.spec.ts`
  // seeds one row of every model below and asserts each count is at least 1.
  // `purge-coverage.test.ts` checks the filter TEXT of each call, and
  // `e2eCleanup.test.ts` the exact values.
  //
  // ORDER MATTERS FOR THE COUNTS, not only for the deletes. Every child is
  // deleted before its parent, so each count is the number of rows this
  // statement removed. Move `item.deleteMany` above `itemTag.deleteMany` and
  // the ItemTag rows go by ON DELETE CASCADE instead, reporting 0. The same
  // holds for `locationMember` before `location`, and every household-scoped
  // table before `household`: `householdId` is ON DELETE CASCADE on all of
  // them.
  //
  // This is the ARRAY form of `$transaction`: Prisma runs the 18 statements
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
    locationMembers,
    locations,
    householdMembers,
    households,
    users,
  ] = await prisma.$transaction([
    // Logs, carts and stock have no household of their own. They go
    // through their location, the same as in `clearAllData`.
    prisma.inventoryLog.deleteMany({ where: { location: { householdId: owned } } }),
    prisma.cartItem.deleteMany({ where: { cart: { location: { householdId: owned } } } }),
    prisma.cart.deleteMany({ where: { location: { householdId: owned } } }),
    prisma.itemTag.deleteMany({ where: { item: { householdId: owned } } }),
    prisma.itemVendor.deleteMany({ where: { item: { householdId: owned } } }),
    // Through the recipe, the same path as `clearAllData`. It was through
    // the item here until task 3.10.
    prisma.recipeItem.deleteMany({ where: { recipe: { householdId: owned } } }),
    prisma.itemStock.deleteMany({ where: { location: { householdId: owned } } }),
    prisma.item.deleteMany({ where: { householdId: owned } }),
    prisma.tag.deleteMany({ where: { householdId: owned } }),
    prisma.tagType.deleteMany({ where: { householdId: owned } }),
    prisma.vendor.deleteMany({ where: { householdId: owned } }),
    prisma.recipe.deleteMany({ where: { householdId: owned } }),
    prisma.shelf.deleteMany({ where: { householdId: owned } }),
    // Every role row on the owned households' locations (anybody's), and
    // the user's own role rows on any other location.
    prisma.locationMember.deleteMany({
      where: { OR: [{ userId }, { location: { householdId: owned } }] },
    }),
    prisma.location.deleteMany({ where: { householdId: owned } }),
    // Every member row of the owned households (anybody's), and the user's
    // own member rows in households they do not own.
    prisma.householdMember.deleteMany({ where: { OR: [{ userId }, { householdId: owned }] } }),
    prisma.household.deleteMany({ where: { id: owned } }),
    // The User row itself (households task 2.6). Its key is `id`, not
    // `userId`: the row IS the user. It goes LAST, after the two role
    // tables, whose `userId` foreign key to it is RESTRICT.
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
    locationMembers: locationMembers.count,
    locations: locations.count,
    householdMembers: householdMembers.count,
    households: households.count,
    users: users.count,
  }
  res.json({ ok: true, deleted })
}
