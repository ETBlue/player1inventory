import { GraphQLError } from 'graphql'
import { type Context, requireAuth } from '../context.js'
import { prisma } from './prisma.js'

export type LocationRole = 'viewer' | 'member' | 'owner'

/**
 * The single authorization seam for location-scoped data.
 *
 * Call sites ask "does the caller hold a sufficient role on this location?"
 * and never inspect `userId` themselves. That is the whole point: today the
 * body below is user ownership, but under location RBAC (owner/member edit,
 * viewer reads) it becomes a membership lookup — and that is a change to THIS
 * function, not to every resolver that calls it.
 *
 * See docs/global/permissions/2026-08-29-design-location-rbac.md.
 *
 * `role` is accepted and deliberately unused pre-RBAC. Do not remove the
 * parameter to silence the unused warning: its presence at every call site is
 * what makes landing RBAC a one-function change.
 */
export async function requireLocationRole(
  ctx: Context,
  locationId: string,
  role: LocationRole,
): Promise<{ id: string; userId: string; isDefault: boolean }> {
  const userId = requireAuth(ctx)
  void role

  const location = await prisma.location.findFirst({
    where: { id: locationId, userId },
    select: { id: true, userId: true, isDefault: true },
  })

  // Deliberately indistinguishable from "not found": a caller must not be able
  // to probe for the existence of another user's location ids.
  if (!location) {
    throw new GraphQLError('Forbidden', { extensions: { code: 'FORBIDDEN' } })
  }

  return location
}

/**
 * The nine models that carry a `userId` column and have `id` as their only
 * unique key. `ItemStock` is NOT here on purpose: it carries no `userId` at
 * all and is scoped through its location by `requireLocationRole`. `Location`
 * is not here either, for the same reason — it IS the location.
 *
 * This is a hand-maintained list, and a wrong literal at a call site compiles.
 * Every call site therefore needs its own test, and deleting a guard must turn
 * a named test red.
 */
export type OwnedModel =
  | 'item'
  | 'tag'
  | 'tagType'
  | 'vendor'
  | 'recipe'
  | 'inventoryLog'
  | 'cart'
  | 'cartItem'
  | 'shelf'

/** The two reads the guard needs on a model with an `id` and a `userId`. */
interface OwnedRowDelegate {
  findUnique(args: {
    where: { id: string }
    select: { id: true }
  }): Promise<{ id: string } | null>
  findFirst(args: {
    where: { id: string; userId: string }
    select: { id: true }
  }): Promise<{ id: string } | null>
}

function delegateFor(model: OwnedModel): OwnedRowDelegate {
  // Built PER CALL, not captured at module load, so a test that swaps a method
  // on the mocked `prisma` after import still sees its own swap.
  //
  // `satisfies` type-checks the nine entries, so the `as unknown as
  // Record<OwnedModel, OwnedRowDelegate>` cast the design doc allowed as a
  // fallback is not needed. Prisma's `findUnique` is generic, and assignability
  // to this non-generic target instantiates its type parameter from the target.
  //
  // What `satisfies` catches here, measured on Prisma 6.19.3 on 2026-10-28:
  // `prisma.itemTag` (a composite-key model with no `id`) fails TS2322, and so
  // does any value that is not a delegate at all. What it does NOT catch:
  // `prisma.itemStock`, whose model has an `id` but no `userId` column, is
  // accepted — a `where` with an extra key is assignable to
  // `ItemStockWhereInput` because excess-property checking does not apply to a
  // type-level assignability check. Nor can it catch a swap between two models
  // that are both in this table. So a wrong model literal at a call site still
  // compiles, and per-call-site tests are what catch it.
  const delegates = {
    item: prisma.item,
    tag: prisma.tag,
    tagType: prisma.tagType,
    vendor: prisma.vendor,
    recipe: prisma.recipe,
    inventoryLog: prisma.inventoryLog,
    cart: prisma.cart,
    cartItem: prisma.cartItem,
    shelf: prisma.shelf,
  } satisfies Record<OwnedModel, OwnedRowDelegate>
  return delegates[model]
}

/**
 * The single authorization seam for account-scoped data — the nine models in
 * `OwnedModel`, which belong to no location and so are outside
 * `requireLocationRole`'s reach.
 *
 * Three cases for one row id:
 *
 * | The id is | Result |
 * |---|---|
 * | held by a row the caller may write | returns `'own'` |
 * | held by somebody else's row | **throws** `FORBIDDEN` |
 * | held by no row | returns `'unclaimed'` |
 *
 * The "somebody else's" case throws rather than returning, so a call site
 * cannot ignore it.
 *
 * Call sites never inspect `userId` themselves — root CLAUDE.md forbids
 * `row.userId === ctx.userId` as an authorization check. They say "this id
 * must be one I may write", and this body is what decides. When account scope
 * changes — a household scope is the likely answer and is being explored on
 * another branch — the `where` below changes and no call site moves. That is
 * the same contract `requireLocationRole` above already carries.
 *
 * See docs/features/settings/2026-10-28-design-import-ownership-guard.md.
 */
export async function requireOwnRowOrUnclaimed(
  ctx: Context,
  model: OwnedModel,
  id: string,
): Promise<'own' | 'unclaimed'> {
  const userId = requireAuth(ctx)

  // UNSCOPED on purpose, and only `id` is selected. "Is this primary key
  // taken" is not an authorization question and has no user to scope by.
  const taken = await delegateFor(model).findUnique({
    where: { id },
    select: { id: true },
  })
  if (!taken) return 'unclaimed'

  // The AUTHORIZATION decision, SCOPED IN SQL. Never a comparison of a fetched
  // row's `userId` against the caller's.
  const own = await delegateFor(model).findFirst({
    where: { id, userId },
    select: { id: true },
  })

  // Same wording and code as `requireLocationRole`'s refusal above, and for the
  // same reason: "not yours" must be indistinguishable from "does not exist",
  // or the mutation becomes a probe for other accounts' row ids.
  if (!own) {
    throw new GraphQLError('Forbidden', { extensions: { code: 'FORBIDDEN' } })
  }

  return 'own'
}
