import { prisma } from './prisma.js'
import type { ItemStock, Prisma } from '@prisma/client'

/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE ONE PLACE CLOUD PER-LOCATION STOCK IS WRITTEN.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── WHY THE NAME CHANGED FROM `mirrorStock` ──
 *
 * This function used to live in `lib/stockDualWrite.ts` and was called
 * `mirrorStock`. The word *mirror* was accurate at the time: `Item` carried
 * five stock state columns — `targetQuantity`, `refillThreshold`,
 * `packedQuantity`, `unpackedQuantity`, `dueDate` — those columns were the
 * source of truth, and `ItemStock` held a copy of them for the default
 * location. Every write went to `Item` first and was then mirrored here, so
 * that a browser on a pre-PR-2 bundle, which still read `Item`'s columns,
 * kept working through PRs 2 to 4b.
 *
 * Cloud locations PR 5 drops those five columns from `Item`. `ItemStock` is
 * now the ONLY place a quantity lives, so there is nothing left to mirror and
 * nothing left to mirror from. The name says `write` because that is all it
 * does: it writes the row.
 *
 * Written down here on purpose. Without it, a reader who finds `writeStock`
 * and then finds "mirror" in a doc, a comment or `git log` has to reconstruct
 * this from history to learn whether the two are the same thing. They are.
 *
 * ── IT RETURNS THE SAVED ROW ──
 *
 * `mirrorStock` returned `void`, because the caller already held the `Item`
 * row it had just written and read its totals from there. With `Item`'s
 * columns gone, the saved `ItemStock` row is the only source for those
 * totals. `checkout` (resolvers/cart.resolver.ts) needs exactly that: the
 * inventory log it writes records the resulting ON-HAND total, which is
 * `packedQuantity + unpackedQuantity` AFTER the write — not the cart's delta.
 * A `void` return would push that caller back onto recomputing the total from
 * its own input, which is a different number whenever the row started at
 * anything but zero.
 *
 * ── EMPTY `data` ──
 *
 * `writeStock` always writes, even when `data` is empty: an empty write
 * creates the row with every column at its zero default, and returns it.
 *
 * It differs from `mirrorStock` here, which returned early and wrote nothing.
 * The difference is deliberate and reaches no caller:
 *
 *   - A function that must return the saved row cannot also decline to write
 *     one. There is no row to return.
 *   - `upsertItemStock` (resolvers/itemStock.resolver.ts), which this function
 *     absorbed, already behaved this way — its `findUnique`-then-`create`
 *     block wrote a row of zeroes for an empty input, because its GraphQL
 *     field returns `ItemStock!` and so must have a row.
 *   - `mirrorStock`'s own guard was unreachable from every one of its
 *     callers anyway. `checkout` and `consumeRecipes` both pass an object
 *     literal whose keys are always present. The one guard that MATTERED sat
 *     in its caller `mirrorStockToDefaultLocation`: it stopped `updateItem`
 *     from stocking every renamed item in the default location. PR 5 task 3
 *     deleted that function along with `updateItem`'s mirror, so there is no
 *     longer a caller that passes an empty `data` and does not want a row.
 *
 * ── AUTHORIZATION ──
 *
 * Nothing here authorizes anything. A caller must hold `member` on
 * `locationId` before it gets this far, through
 * `requireLocationRole(ctx, locationId, 'member')` (lib/authz.ts) — never a
 * `row.userId === ctx.userId` comparison (root CLAUDE.md, Authorization).
 *
 * Current callers and where their authorization happens:
 *
 * | Caller | Authorized by |
 * |---|---|
 * | `upsertItemStock` (itemStock.resolver.ts) | `requireLocationRole` on the named location |
 * | `applyUnitSwitch` (itemStock.resolver.ts) | `requireLocationRole` on EVERY location the switch names, before the transaction opens |
 * | `checkout` (cart.resolver.ts) | `requireCartLocation`, which parses the location out of the cart id and calls `requireLocationRole` |
 * | `consumeRecipes` (recipe.resolver.ts) | `requireLocationRole` on `input.locationId` |
 *
 * ── THE LAST PARAMETER IS THE CLIENT TO WRITE THROUGH ──
 *
 * `applyUnitSwitch` writes stock from inside a `prisma.$transaction`
 * callback. A write issued through the module-level `prisma` from in there
 * runs OUTSIDE the transaction and survives a rollback, which for a unit
 * switch means `Item` left on the new unit while some location still holds
 * old-unit numbers — the corruption that transaction exists to prevent. So
 * the client is a parameter, defaulting to the module-level `prisma`.
 *
 * **Pass `tx` whenever the call sits inside a `$transaction` callback.**
 * Omitting it there compiles and type-checks and is silently wrong; nothing
 * but this sentence stops it.
 *
 * Cloud locations PR 5 task 3 added the parameter. Before it, `applyUnitSwitch`
 * kept its own `tx.itemStock.upsert` — a third copy of this upsert, with its
 * own hand-written list of the five zero defaults.
 *
 * ── STILL NOT THE ONLY STOCK WRITER ──
 *
 * Three writers have genuinely different contracts and stay separate:
 * `addItemToLocation` (copy-on-add — it must CREATE, never update, and seeds
 * from another location's row), and `bulkCreateItemStocks` /
 * `bulkUpsertItemStocks` (import — they preserve the payload's own ids and
 * timestamps). What this function owns is every per-location stock VALUE
 * edit.
 */

// A number, or Prisma's atomic increment form. `checkout` needs the latter so
// two concurrent checkouts of the same item cannot lose an increment to a
// read-modify-write race.
type NumberWrite = number | { increment: number }

export type StockWrite = {
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
 * Write one location's stock for one item, creating the row if it is missing,
 * and return the saved row.
 *
 * A key absent from `data` is left alone on an existing row — this is a merge,
 * not a replace — and opens at 0 (or `null`, for `dueDate`) on a new one.
 *
 * One `upsert` rather than `findUnique` then `create`-or-`update`: Postgres
 * applies `INSERT ... ON CONFLICT DO UPDATE` as a single statement, so two
 * concurrent first writes for the same (item, location) pair cannot both
 * decide the row is missing and race into a unique-constraint error.
 */
export async function writeStock(
  itemId: string,
  locationId: string,
  data: StockWrite,
  client: Prisma.TransactionClient = prisma,
): Promise<ItemStock> {
  return client.itemStock.upsert({
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
