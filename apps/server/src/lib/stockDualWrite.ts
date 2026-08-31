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
 * ── NOT LOCATION-AWARE, AND DELIBERATELY SO ──
 *
 * `checkout` and `consumeRecipes` have no location to write to in PR 2:
 * `Cart.locationId` does not exist until PR 3, and `ConsumeRecipesInput`
 * carries none either. Until then they mirror into the caller's DEFAULT
 * location (`Location.isDefault`). A reader must not mistake that for real
 * scoping — a user who checks out while viewing their Garage still moves
 * their Kitchen's stock. PR 3 replaces `defaultLocationId` at those two call
 * sites with the location the cart/consume actually names.
 *
 * ── AUTHORIZATION ──
 *
 * Nothing here takes a caller-supplied location id, so there is no id to
 * authorize: the target is DERIVED from the authenticated user. When PR 3
 * starts accepting a `locationId` from input, that id must go through
 * `requireLocationRole` (lib/authz.ts) before reaching this module — never a
 * `row.userId === ctx.userId` comparison (root CLAUDE.md).
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

/** The caller's default location, or null if they have none yet. */
export async function defaultLocationId(userId: string): Promise<string | null> {
  const location = await prisma.location.findFirst({
    where: { userId, isDefault: true },
    select: { id: true },
  })
  return location?.id ?? null
}

/**
 * Mirror a stock write onto one location's `ItemStock`, creating the row if it
 * is missing. Silently does nothing when there is no location to write to —
 * a user whose account predates PR 1's backfill has no rows to keep in sync,
 * and failing their checkout over a bridge that PR 5 deletes would be worse
 * than the divergence.
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

/** `mirrorStock` against the caller's default location. PR 3 replaces this. */
export async function mirrorStockToDefaultLocation(
  userId: string,
  itemId: string,
  data: StockMirror,
): Promise<void> {
  if (Object.keys(data).length === 0) return
  const locationId = await defaultLocationId(userId)
  if (!locationId) return
  await mirrorStock(itemId, locationId, data)
}
