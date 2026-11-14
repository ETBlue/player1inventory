// Prisma `where` matching for `CartItem`, shared by
// `itemStock.resolver.test.ts` (`removeItemFromLocation`'s cascade) and by the
// stateful cart store in `cartFake.ts` (households H3b task B.2), which
// `cart-shared.resolver.test.ts` runs `cartItemCountByItem` against. So both
// agree on what a `where` means.
//
// ── WHY THIS IS SHARED AND NOT COPIED ──
//
// Both resolvers ask the same question: "which of this item's cart entries
// belong to this location". Both ask it with the SAME relation filter,
// `where: { itemId, cart: { locationId } }` (a `userId` was in it from PR 3c
// until households H3b task B.4). The Stock tab
// shows the count in its remove-confirmation dialog and the removal then acts
// on it, so a disagreement between the two would show the user a number the
// removal does not match. One matcher keeps the two specs honest about that.
//
// ── THE CONSTRAINT THIS MODELS ──
//
// A hand-written fake that walks `where` key by key silently IGNORES a key it
// does not know about. `cart` is a nested relation filter, so a matcher
// written only for flat columns would return the same rows with it and
// without it — and then every test here would pass against a resolver that
// dropped the location scope entirely. Root CLAUDE.md: "Write test doubles to
// model the constraint, not the happy path."
//
// `cart: { locationId }` is therefore resolved the way Postgres resolves it:
// follow `CartItem.cartId` to its `Cart` row and read that row's
// `locationId` column. NOT the text of the cart id. The id happens to start
// with the location id today (`${locationId}:${vendorId | 'no-vendor'}`), but
// it is DERIVED from the column, and a fake that read the string would keep a
// resolver green after it went back to parsing ids.

import { checkWhere, type WhereSpec } from './whereKeys.js'

/** Only the columns a location filter needs. */
export interface FakeCart {
  id: string
  locationId: string
}

/** `CartItem` has no `locationId` of its own — see the note above. */
export interface FakeCartItem {
  id: string
  cartId: string
  itemId: string
  userId: string
}

/**
 * Raised when a fixture holds a `CartItem` whose `cartId` names no `Cart` in
 * the store. Real Postgres cannot reach that state: `CartItem.cartId` is a
 * NOT NULL foreign key onto `Cart.id`. Returning "no match" instead would let
 * an incomplete fixture quietly shrink a count, so this fails loudly and names
 * the row to fix.
 */
export class MissingCartError extends Error {
  constructor(cartItemId: string, cartId: string) {
    super(
      `Fixture error: CartItem '${cartItemId}' points at cart '${cartId}', which is not in the fake's carts store. ` +
        'CartItem.cartId is a NOT NULL foreign key onto Cart.id, so seed the cart too.',
    )
  }
}

// Every key the matcher models, and how. A key outside this spec, at either
// level, or a value shape its kind does not allow, THROWS — see
// `whereKeys.ts`.
//
// Households H3b task B.2 widened three keys, for the stateful store in
// `cartFake.ts` and the resolvers B.4 to B.7 change:
//   - `cartId` takes `{ in: [...] }` too (`deleteVendor` deletes the rows of
//     several carts at once);
//   - `quantity` takes a number or `{ gt | gte | lt | lte }` (checkout reads
//     and deletes only the rows being bought, `quantity: { gt: 0 }`);
//   - `cart: { locationId }` takes `{ in: [...] }` too ("rows in carts at
//     every location where the caller has a role").
const CART_ITEM_WHERE: WhereSpec = {
  id: 'in',
  cartId: 'in',
  itemId: 'equals',
  // No `userId`, since households H3b task B.4: `CartItem.userId` means
  // "added by" and is never a scope (H3b plan, rule 13). A resolver that
  // still filters by it throws here instead of passing.
  quantity: 'number',
  cart: { nested: { locationId: 'in' } },
}

/**
 * The `CartItem` rows a Prisma `where` selects, out of `rows`.
 *
 * This is the ONLY export that matches rows, on purpose. It checks the whole
 * `where` ONCE, before it looks at a row, and only then filters. An exported
 * per-row matcher would let each caller run the check inside
 * `Array.filter`, where it never runs on an empty store and never reaches the
 * nested `cart` filter when an outer key already failed. Both of those return
 * "no rows" with no error, which is exactly what a cross-account test
 * expects. See `whereKeys.ts`.
 *
 * Every key is `where.x === undefined || row.x === where.x`, which is Prisma's
 * own rule. A hardcoded ownership or location match would keep a scoping test
 * green after the resolver dropped the scope.
 *
 * Supported keys: `id` and `cartId` (each a plain string or `{ in: [...] }`),
 * `itemId`, `quantity` (a number or `{ gt | gte | lt | lte }`), and
 * the relation filter `cart: { locationId }` (a plain string or
 * `{ in: [...] }`). Any other key,
 * at either level, throws `UnknownWhereKeyError`; an operator object on a
 * plain key throws `UnsupportedWhereFilterError`.
 *
 * @param carts every `Cart` row the fixture holds — the relation filter reads
 *   `locationId` off these, never off the cart id string
 */
export function filterCartItems<Row extends FakeCartItem>(
  rows: readonly Row[],
  where: Record<string, unknown> | undefined,
  carts: FakeCart[],
): Row[] {
  checkWhere('cartItemFake(cartItem)', where, CART_ITEM_WHERE)
  return rows.filter((row) => cartItemMatches(row, where ?? {}, carts))
}

function cartItemMatches(
  row: FakeCartItem,
  where: Record<string, unknown>,
  carts: FakeCart[],
): boolean {
  if (where.itemId !== undefined && row.itemId !== where.itemId) return false
  if (!matchesIn(row.cartId, where.cartId)) return false
  if (!matchesIn(row.id, where.id)) return false
  if (where.quantity !== undefined && !matchesQuantity(row, where.quantity)) return false

  const cartFilter = where.cart as { locationId?: unknown } | undefined
  if (cartFilter !== undefined) {
    const cart = carts.find((c) => c.id === row.cartId)
    if (!cart) throw new MissingCartError(row.id, row.cartId)
    if (!matchesIn(cart.locationId, cartFilter.locationId)) return false
  }
  return true
}

/**
 * A plain string or `{ in: [...] }`. `undefined` matches every row, which is
 * Prisma's rule for a key nobody named. `checkWhere` has already refused any
 * other shape, so nothing else reaches here.
 */
function matchesIn(value: string, filter: unknown): boolean {
  if (filter === undefined) return true
  if (typeof filter === 'string') return value === filter
  return ((filter as { in: unknown[] }).in ?? []).includes(value)
}

/**
 * A number, or `{ gt | gte | lt | lte }` (all given operators must hold).
 * A fixture row with no number `quantity` cannot be compared, so it throws
 * and names the row, instead of quietly matching nothing.
 */
function matchesQuantity(row: FakeCartItem, filter: unknown): boolean {
  const quantity = (row as { quantity?: unknown }).quantity
  if (typeof quantity !== 'number') {
    throw new Error(
      `Fixture error: CartItem '${row.id}' has no number quantity, but the where filters on quantity. ` +
        'CartItem.quantity is a NOT NULL Float, so give the row one.',
    )
  }
  if (typeof filter === 'number') return quantity === filter
  const ops = filter as { gt?: number; gte?: number; lt?: number; lte?: number }
  if (ops.gt !== undefined && !(quantity > ops.gt)) return false
  if (ops.gte !== undefined && !(quantity >= ops.gte)) return false
  if (ops.lt !== undefined && !(quantity < ops.lt)) return false
  if (ops.lte !== undefined && !(quantity <= ops.lte)) return false
  return true
}
