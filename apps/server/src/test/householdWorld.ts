// One Prisma double for the code that reads households and roles: `User`
// (userFake), `Household`, `HouseholdMember` and `LocationMember`
// (householdFake), and `Location` and `ItemStock` (stockFake), joined into one
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

import { createHouseholdFake, type HouseholdFakeOptions } from './householdFake.js'
import { createStockFake, runInTransaction, type RollbackStore } from './stockFake.js'
import { createUserFake } from './userFake.js'

export function createHouseholdWorld() {
  const users = createUserFake()
  const stock = createStockFake()
  const households = createHouseholdFake({ locations: () => stock.state.locations })

  let serial = false
  let queue: Promise<unknown> = Promise.resolve()

  const client = {
    user: users.client,
    household: households.client.household,
    householdMember: households.client.householdMember,
    locationMember: households.client.locationMember,
    location: stock.client.location,
    itemStock: stock.client.itemStock,
    $transaction,
  }

  async function $transaction(arg: unknown): Promise<unknown> {
    const run = () =>
      runInTransaction(
        [
          users.state as unknown as RollbackStore,
          households.state as unknown as RollbackStore,
          stock.state as unknown as RollbackStore,
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

  /** Empty every store, and turn the queue off. */
  function reset() {
    users.reset()
    stock.reset([], [])
    households.reset()
    serialTransactions(false)
  }

  /** Replace the household rows. The location rows live in `stock`. */
  function seedHouseholds(next: Omit<HouseholdFakeOptions, 'locations'>) {
    households.reset(next)
  }

  return { users, stock, households, client, serialTransactions, reset, seedHouseholds }
}

export type HouseholdWorld = ReturnType<typeof createHouseholdWorld>
