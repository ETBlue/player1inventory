import { ensureDefaultLocation } from './defaultLocation.js'
import { prisma } from './prisma.js'

/**
 * ══════════════════════════════════════════════════════════════════════════
 * TEMPORARY DUAL-WRITE BRIDGE — DELETE THIS FILE IN PR 5.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * PR 2 moved the cloud client's stock *reads* onto `ItemStock` while `Item`
 * still carries the five state columns. Three resolvers write quantities:
 * `checkout`, `consumeRecipes` and `updateItem`. Left writing `Item` alone
 * they would write where nothing reads — a visibly broken cloud pantry on
 * `main` between PR 2 and PR 3.
 *
 * So each of those three keeps its `Item` write AND mirrors it here. That
 * preserves the rollout's invariant: a browser on a stale bundle, still
 * reading `Item`'s columns, keeps working through every intermediate PR.
 * PR 5 drops the columns and every call to this module goes with them
 * (docs/features/locations/2026-08-30-cloud-locations-plan-pr2.md, "The
 * write-path decision").
 *
 * ── THE BRIDGE RUNS BOTH WAYS ──
 *
 * `mirrorStock` / `mirrorStockToDefaultLocation` carry `Item` → `ItemStock`,
 * for the three resolvers above. `mirrorItemStockToItem` carries the REVERSE,
 * `ItemStock` → `Item`, for `upsertItemStock` — the mutation a CURRENT client
 * sends its stock edits to. Without it the current client's writes never reach
 * `Item`'s columns and a stale bundle shows frozen quantities, which is the
 * same broken-pantry failure from the other direction.
 *
 * ── WHICH CALLERS ARE LOCATION-AWARE, AS OF PR 3b TASK 3 ──
 *
 * | Caller | Location it writes |
 * |---|---|
 * | `checkout` (cart.resolver.ts) | the location the CART names |
 * | `consumeRecipes` (recipe.resolver.ts) | the location the COOK names |
 * | `updateItem` (item.resolver.ts) | the caller's DEFAULT location |
 * | `importData` (import.resolver.ts) | the caller's DEFAULT location |
 * | `upsertItemStock` (itemStock.resolver.ts) | default only, see below |
 *
 * The first two were the caller's default location until PR 3b Task 3. A user
 * who checked out while viewing their Garage moved their Kitchen's stock and
 * logged the purchase against the Kitchen. Task 1's re-key of `Cart.id` put the
 * cart's location within reach of `checkout`; Task 3 added `locationId` to
 * `ConsumeRecipesInput` for the other one.
 *
 * The last three stay default-bound ON PURPOSE, and it is not a leftover:
 *
 *   - `updateItem` and `importData` mirror through
 *     `mirrorStockToDefaultLocation`. Both serve a client with NO location
 *     concept — a stale bundle that still sends the five state fields inline,
 *     and an old backup file. Neither has a location to name.
 *   - `upsertItemStock` mirrors the REVERSE direction through
 *     `mirrorItemStockToItem`, and its call site runs that only when the
 *     location it just wrote is the default one. See that function below for
 *     why any other location has no correct value to write.
 *
 * ── AUTHORIZATION ──
 *
 * Since PR 3b Task 3 two callers DO take a caller-supplied location id, and
 * both authorize it before they reach this module:
 *
 *   - `checkout` calls `requireCartLocation`, which parses the location out of
 *     the cart id and passes it to `requireLocationRole(..., 'member')`.
 *   - `consumeRecipes` calls `requireLocationRole(..., 'member')` on
 *     `input.locationId` before its first write.
 *
 * Nothing in THIS module authorizes anything. A new caller must do the same at
 * its own call site — never a `row.userId === ctx.userId` comparison (root
 * CLAUDE.md).
 *
 * ── ATOMICITY ──
 *
 * The mirror is a second statement, not part of a transaction — neither
 * `checkout` nor `consumeRecipes` is transactional today (each already does
 * an `item.update` followed by a separate `inventoryLog.create`). A crash
 * between the two writes leaves `Item` and `ItemStock` disagreeing. That is
 * accepted for the three PRs this bridge lives, because PR 5 makes `ItemStock`
 * the single writer and the divergence unrepresentable.
 */

// A number, or Prisma's atomic increment form. `checkout` needs the latter so
// two concurrent checkouts of the same item cannot lose an increment to a
// read-modify-write race.
type NumberWrite = number | { increment: number }

export type StockMirror = {
  targetQuantity?: number
  refillThreshold?: number
  packedQuantity?: NumberWrite
  unpackedQuantity?: NumberWrite
  dueDate?: Date | null
}

// The value a brand-new row should open at. An increment applied to a row that
// does not exist yet is just the increment itself (the row's implicit 0 + n).
function seed(value: NumberWrite | undefined): number {
  if (value === undefined) return 0
  return typeof value === 'number' ? value : value.increment
}

/**
 * The bridge's name for `ensureDefaultLocation` (lib/defaultLocation.ts): the
 * caller's default location, created if they have none.
 *
 * It never returns null. It used to, and a stock write that landed on that path
 * disappeared with no error (issue #287). The real function lives in
 * `defaultLocation.ts` because it must outlive PR 5, which deletes this file.
 *
 * Since PR 3b Task 3 it has exactly ONE caller left:
 * `mirrorStockToDefaultLocation` below. `checkout` and `consumeRecipes` used to
 * call it and now pass a real location instead.
 *
 * **Do not call it from a new resolver.** Reaching for it is how a write ends up
 * in the wrong location silently. If a resolver knows its location, pass it to
 * `mirrorStock`; if it truly has none, say why in a comment at the call site,
 * the way `updateItem` and `importData` do.
 */
export async function defaultLocationId(userId: string): Promise<string> {
  return ensureDefaultLocation(userId)
}

/**
 * Mirror a stock write onto one location's `ItemStock`, creating the row if it
 * is missing.
 *
 * It does nothing when `data` is EMPTY, which is the only no-op left here. That
 * happens on a real path: `updateItem` calls
 * `mirrorStockToDefaultLocation` on every update, and a current client's update
 * carries none of the five stock fields (a rename, a tag change). Upserting an
 * empty write would stock every renamed item in the default location.
 *
 * A missing location is no longer a no-op. Until issue #287 this function's
 * caller returned early when the user had no `Location`, and the write was lost
 * with nothing logged. The comment here justified that with "a user whose
 * account predates PR 1's backfill" — a class that does not exist: PR 1's
 * migration (20260830000000_add_location_and_item_stock) backfills one default
 * `Location` for every user holding a row in any of nine tables. The class that
 * DID exist was a brand-new account writing stock before its first `locations`
 * query. `ensureDefaultLocation` now creates the location for it.
 */
export async function mirrorStock(
  itemId: string,
  locationId: string,
  data: StockMirror,
): Promise<void> {
  if (Object.keys(data).length === 0) return
  await prisma.itemStock.upsert({
    where: { itemId_locationId: { itemId, locationId } },
    update: data,
    create: {
      itemId,
      locationId,
      targetQuantity: data.targetQuantity ?? 0,
      refillThreshold: data.refillThreshold ?? 0,
      packedQuantity: seed(data.packedQuantity),
      unpackedQuantity: seed(data.unpackedQuantity),
      dueDate: data.dueDate ?? null,
    },
  })
}

/**
 * The reverse mirror: one location's `ItemStock` back onto `Item`'s five legacy
 * columns. Call it ONLY for the caller's DEFAULT location.
 *
 * Why default-only: a stale bundle has no location concept at all — it renders
 * one number per item — so the default location's stock is the only value that
 * is correct to show it. An edit to a NON-default location must leave `Item`
 * alone, because there is no correct single value to write: mirroring a Garage
 * edit onto `Item` would make the stale bundle report the Garage's numbers as
 * the Kitchen's.
 *
 * `updateMany` rather than `update`, so an itemId that is not the caller's
 * matches nothing and the mirror silently no-ops. That is a query SCOPE, not an
 * authorization decision — the caller's right to write here was already settled
 * by `requireLocationRole` at the call site (root CLAUDE.md forbids
 * `row.userId === ctx.userId` as a guard, not `userId` in a where clause).
 */
export async function mirrorItemStockToItem(
  userId: string,
  itemId: string,
  stock: {
    targetQuantity: number
    refillThreshold: number
    packedQuantity: number
    unpackedQuantity: number
    dueDate: Date | null
  },
): Promise<void> {
  await prisma.item.updateMany({
    where: { id: itemId, userId },
    data: {
      targetQuantity: stock.targetQuantity,
      refillThreshold: stock.refillThreshold,
      packedQuantity: stock.packedQuantity,
      unpackedQuantity: stock.unpackedQuantity,
      dueDate: stock.dueDate,
    },
  })
}

/**
 * `mirrorStock` against the caller's default location.
 *
 * For the two callers that genuinely have no location: `updateItem` (a stale
 * bundle sending the five state fields inline) and `importData` (an old backup
 * file). PR 3b Task 3 left both alone on purpose — it moved `checkout` and
 * `consumeRecipes` off the default location because those two DO know where
 * they are, and these two do not.
 */
export async function mirrorStockToDefaultLocation(
  userId: string,
  itemId: string,
  data: StockMirror,
): Promise<void> {
  if (Object.keys(data).length === 0) return
  const locationId = await defaultLocationId(userId)
  await mirrorStock(itemId, locationId, data)
}
