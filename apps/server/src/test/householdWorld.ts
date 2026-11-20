// One Prisma double for the code that reads households and roles: `User`
// (userFake), `Household`, `HouseholdMember`, `LocationMember`,
// `HouseholdInvite` and `HouseholdActivity` (householdFake), and `Location` and `ItemStock` (stockFake), joined into one
// client with one `$transaction` (households H3a, task 3.5).
//
// `householdFake` reads the CURRENT location rows from `stockFake`, so a
// location created in a test (or by the code under test) is at once visible
// to the `LocationMember` foreign key and to the `location` relation filter.
//
// ── TRANSACTIONS, AND THE ROW LOCK THE FAKE DOES NOT HAVE ──
//
// `$transaction` is `runInTransaction` from stockFake.ts over all three
// fakes' state. That models rollback. It does NOT model Postgres's row lock:
// two transactions here run at the same time, and a rollback restores the
// WHOLE store from its snapshot, so it also removes rows another transaction
// wrote in the meantime (plan H3a, task 3.5 note (b)). Correct first sign-in
// code run ten times in parallel through the plain fake gives 1 success and 9
// `NO_HOUSEHOLD` errors.
//
// `serialTransactions(true)` puts the transactions in a queue: each one
// starts only after the one before it has finished. That is what the row lock
// on `User` does for the first sign-in claim (decision H1). It is for tests
// only. Do not change correct code to pass without it: if a test fails only
// without the queue, the fake is wrong, not the code. The real race is proved
// against Postgres in `scripts/verify-migration.ts`.

import {
  createHouseholdFake,
  type HouseholdContents,
  type HouseholdFakeOptions,
} from './householdFake.js'
import { createStockFake, runInTransaction, type RollbackStore } from './stockFake.js'
import { createUserFake } from './userFake.js'

/**
 * The rows the world does not own as models, but that decide whether a
 * household is EMPTY (decision T21 of the H5b plan, `joinHousehold`). A test
 * pushes plain rows here: an item of a household, a log at a location, a cart
 * and its rows. Stock rows are not here: they live in `stock`.
 *
 * Only `household.deleteMany`'s "is it empty" check reads them. They are NOT
 * the `item`, `cart`, ... models of a test that `extend`s the world: such a
 * model keeps its rows in its own store, and this check would not see them.
 */
export type WorldContents = { [K in Exclude<keyof HouseholdContents, 'itemStocks'>]: HouseholdContents[K][number][] }

function emptyContents(): WorldContents {
  return {
    items: [],
    tags: [],
    tagTypes: [],
    vendors: [],
    recipes: [],
    shelves: [],
    inventoryLogs: [],
    carts: [],
    cartItems: [],
  }
}

export function createHouseholdWorld() {
  const stock = createStockFake()
  // One plain object, registered as a rollback store below.
  const contents: { rows: WorldContents } = { rows: emptyContents() }
  const households = createHouseholdFake({
    locations: () => stock.state.locations,
    contents: () => ({ ...contents.rows, itemStocks: stock.state.itemStocks }),
  })
  // `user.findUnique` can select `householdMemberships` (decision T14 of the
  // H5b plan: `ensureHousehold` reads the person and their memberships in
  // one query). The fake reads the CURRENT member rows of this world. And
  // every person a member row names has a `User` row, as the foreign key
  // makes it in Postgres (`rowForEveryMember`, see userFake.ts).
  const users = createUserFake([], {
    householdMembers: () => households.state.householdMembers,
    rowForEveryMember: true,
  })

  let serial = false
  let queue: Promise<unknown> = Promise.resolve()
  // More stores a test file registered with `extend`, rolled back with the
  // world's own three.
  const extraStores: RollbackStore[] = []

  const client = {
    user: users.client,
    household: { ...households.client.household, deleteMany: deleteHouseholds },
    householdMember: households.client.householdMember,
    locationMember: households.client.locationMember,
    // The invite store (households H5b). It lives in `households.state`, so
    // it rolls back with the rest.
    householdInvite: households.client.householdInvite,
    // The activity log (households H6, task J.1). Its rows live in
    // `households.state` too, so they roll back with the rest, and
    // `household.deleteMany` deletes them with their household.
    householdActivity: households.client.householdActivity,
    location: {
      ...stock.client.location,
      delete: deleteLocation,
      deleteMany: deleteLocations,
    },
    itemStock: stock.client.itemStock,
    $transaction,
  }

  // `LocationMember.locationId` is `onDelete: Cascade`, so in Postgres
  // deleting a location deletes its role rows. The two stores live in two
  // fakes, so the cascade is modelled here, where they meet (task 3.6). Without
  // it, the role rows of a deleted location stay, and a test that counts them
  // fails against correct code. Pinned in `householdWorld.test.ts`.
  async function deleteLocation(args: { where: Record<string, unknown> }) {
    const row = await stock.client.location.delete(args)
    households.state.locationMembers = households.state.locationMembers.filter(
      (m) => m.locationId !== row.id,
    )
    return row
  }

  // The same cascade for `deleteMany`, which `clearAllData` uses (task 3.10).
  // The ids are read BEFORE the delete, because after it the rows are gone
  // and nothing says which locations matched. Pinned in
  // `householdWorld.test.ts`.
  async function deleteLocations(args: { where?: Record<string, unknown> } = {}) {
    const ids = (await stock.client.location.findMany({ where: args.where ?? {} })).map(
      (l) => l.id,
    )
    const result = await stock.client.location.deleteMany(args)
    households.state.locationMembers = households.state.locationMembers.filter(
      (m) => !ids.includes(m.locationId),
    )
    return result
  }

  // `household.deleteMany` (households H5b, task G.4). The household fake
  // deletes the household and its own child rows (member rows, invites,
  // location role rows). Postgres also cascades from the household to its
  // locations, from a location to its stock rows, logs and carts, from a cart
  // to its rows, and from the household to its catalog rows. And it sets
  // `User.activeHouseholdId` to null where it named the household
  // (`onDelete: SetNull`). Those stores live here, so it is modelled here.
  // Pinned in `householdWorld.test.ts`.
  async function deleteHouseholds(args: { where?: Record<string, unknown> } = {}) {
    const before = new Set(households.state.households.map((h) => h.id))
    const result = await households.client.household.deleteMany(args)
    const after = new Set(households.state.households.map((h) => h.id))
    const gone = new Set([...before].filter((id) => !after.has(id)))
    if (gone.size === 0) return result
    const locationIds = new Set(
      stock.state.locations
        .filter((l) => l.householdId != null && gone.has(l.householdId))
        .map((l) => l.id),
    )
    stock.state.locations = stock.state.locations.filter((l) => !locationIds.has(l.id))
    stock.state.itemStocks = stock.state.itemStocks.filter((s) => !locationIds.has(s.locationId))
    const c = contents.rows
    const cartIds = new Set(c.carts.filter((x) => locationIds.has(x.locationId)).map((x) => x.id))
    contents.rows = {
      items: c.items.filter((r) => !gone.has(r.householdId)),
      tags: c.tags.filter((r) => !gone.has(r.householdId)),
      tagTypes: c.tagTypes.filter((r) => !gone.has(r.householdId)),
      vendors: c.vendors.filter((r) => !gone.has(r.householdId)),
      recipes: c.recipes.filter((r) => !gone.has(r.householdId)),
      shelves: c.shelves.filter((r) => !gone.has(r.householdId)),
      inventoryLogs: c.inventoryLogs.filter((r) => !locationIds.has(r.locationId)),
      carts: c.carts.filter((r) => !cartIds.has(r.id)),
      cartItems: c.cartItems.filter((r) => !cartIds.has(r.cartId)),
    }
    for (const row of users.state.rows) {
      if (row.activeHouseholdId !== null && gone.has(row.activeHouseholdId)) {
        row.activeHouseholdId = null
      }
    }
    return result
  }

  async function $transaction(arg: unknown): Promise<unknown> {
    const run = () =>
      runInTransaction(
        [
          users.state as unknown as RollbackStore,
          households.state as unknown as RollbackStore,
          stock.state as unknown as RollbackStore,
          contents as unknown as RollbackStore,
          ...extraStores,
        ],
        client,
        arg,
      )
    if (!serial) return run()
    const next = queue.then(run)
    // The queue must go on after a transaction that throws.
    queue = next.catch(() => undefined)
    return next
  }

  /** Run transactions one at a time, as the `User` row lock does. Tests only. */
  function serialTransactions(on: boolean) {
    serial = on
    queue = Promise.resolve()
  }

  /**
   * Add more models to the client, and their stores to the rollback.
   *
   * For a resolver that touches models the world does not own (`item`,
   * `recipe`, `inventoryLog`, `cartItem`, ...). The models are put on the SAME
   * client object, so the `tx` a `$transaction` callback receives has them
   * too, and every store in `stores` is snapshotted and restored with the
   * world's own. A model left out of `stores` would keep the writes of a
   * transaction that rolled back, and a test of that rollback would pass
   * against code with no transaction at all.
   *
   * A store must hold plain data only (see `RollbackStore`). Call it once, in
   * the `vi.mock` factory, before any test runs. `reset` does not undo it.
   */
  function extend(models: Record<string, unknown>, stores: RollbackStore[] = []) {
    Object.assign(client, models)
    extraStores.push(...stores)
  }

  /** Empty every store, and turn the queue off. */
  function reset() {
    users.reset()
    stock.reset([], [])
    households.reset()
    contents.rows = emptyContents()
    serialTransactions(false)
  }

  /** Replace the household rows. The location rows live in `stock`. */
  function seedHouseholds(next: Omit<HouseholdFakeOptions, 'locations'>) {
    households.reset(next)
  }

  /**
   * Make `householdId` the household `userId` acts in, by writing their
   * `User.activeHouseholdId` (decision T14 of the H5b plan). Creates the
   * `User` row when the store has none. For a test where one person is in
   * two households and must act in a chosen one.
   *
   * Since H5b this replaces pinning `requestCache.householdId`: a pin does not
   * survive a `Mutation` field, because `forgetRolesAroundEach` forgets it
   * (decision T15). The person must be a member of `householdId`, or
   * `ensureHousehold` falls back to their oldest membership, as it does in
   * Postgres.
   */
  function setActiveHousehold(userId: string, householdId: string) {
    const row = users.state.rows.find((r) => r.id === userId)
    if (row) {
      row.activeHouseholdId = householdId
      return
    }
    const T = new Date('2026-01-01T00:00:00.000Z')
    users.state.rows.push({
      id: userId,
      displayName: userId,
      email: null,
      lastSeenAt: null,
      deletedAt: null,
      householdSetupAt: T,
      activeHouseholdId: householdId,
      createdAt: T,
      updatedAt: T,
    })
  }

  return {
    users,
    stock,
    households,
    /** See `WorldContents`. Write to `contents.rows`; `reset` empties it. */
    contents,
    client,
    serialTransactions,
    reset,
    seedHouseholds,
    extend,
    setActiveHousehold,
  }
}

export type HouseholdWorld = ReturnType<typeof createHouseholdWorld>
