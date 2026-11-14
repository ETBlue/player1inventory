// A stateful Prisma double for `Cart` and `CartItem` together (households
// H3b, task B.2). Tasks B.4 (cart resolvers), B.5 (checkout in one
// transaction), B.6 (cooking) and B.7 (import and `deleteVendor`) test
// against it.
//
// ── WHY ONE FILE FOR BOTH MODELS, AND NOT `ownedRowFake` ──
//
// `ownedRowFake` was the first choice and does not fit, for three reasons:
//
//   - it REQUIRES a scope column (`userId` or `householdId`) on every
//     create. After task B.3, `Cart` has neither: it belongs to a location.
//   - it has no relation filter, no compound unique key, no number filter
//     and no `{ increment }`. `CartItem` needs all four. Adding them as
//     generic hooks would change a file that more than ten test files use.
//   - `cart: { locationId }` must be matched by `filterCartItems`
//     (`cartItemFake.ts`), the matcher two resolver specs already share. That
//     needs the `Cart` rows and the `CartItem` rows side by side, so the two
//     stores live in one `state` object.
//
// It reuses `ownedRowFake`'s error classes, so a test can match the same
// `code` ('P2002', 'P2025') whichever fake raised it.
//
// ── WHAT IT MODELS, AND WHY EACH ONE ──
//
//   - `@@unique([cartId, itemId])` on `CartItem` (task B.3 adds it). A second
//     row with the same pair raises P2002 in `create`, `createMany` (with no
//     `skipDuplicates`), `upsert`'s create half, `update` and `updateMany`.
//     Without it, two adds of one item would make two rows and a test of
//     "one row, the sum" (decision D2) would pass against code that never
//     merges.
//   - `createMany` is ONE statement. Without `skipDuplicates`, one conflict
//     anywhere in the payload, a stored row or another payload row, refuses
//     the whole call and writes nothing. With `skipDuplicates` it skips every
//     row that conflicts on ANY unique key (`id` or the pair), which is
//     Postgres's `ON CONFLICT DO NOTHING`. A foreign-key error is NOT skipped.
//   - `upsert` with the compound unique where
//     `{ cartId_itemId: { cartId, itemId } }`, and `update`'s
//     `quantity: { increment: n }` (Prisma's atomic number operation) or a
//     plain number. Any other number operation throws.
//   - `findUnique`, `update`, `delete` and `upsert` need a UNIQUE where: a
//     string `id`, or `cartId_itemId`. Prisma refuses
//     `update({ where: { cartId, itemId } })`, so this does too.
//   - `where` is checked ONCE per call, before the store is searched
//     (`whereKeys.ts`). A key the store does not model THROWS.
//   - **`userId` is never a `where` key here, on either model.** Rule 13 of the
//     H3b plan: `CartItem.userId` means "added by" and is never a scope, and
//     `Cart.userId` is dropped by task B.3. A resolver that still scopes by
//     `userId` fails here instead of passing. The shared `filterCartItems`
//     refuses it too, since task B.4.
//   - `Cart` has no `userId` column. A write that names it throws
//     `DroppedColumnError`, the way Prisma refuses an unknown argument after
//     task B.3. `CartItem.userId` stays and is required on create.
//   - `CartItem.cartId` is a foreign key onto `Cart.id`: a row whose cart is
//     not in the store raises P2003. Deleting a cart deletes its rows
//     (`onDelete: Cascade`).
//   - every NOT NULL column is required on create: `Cart.id` and
//     `Cart.locationId`; `CartItem.cartId`, `itemId`, `userId` and `quantity`.
//     `CartItem.id` is generated when absent (`@default(cuid())`).
//   - reads return COPIES. A resolver that changes a returned object does
//     not change the store, the same as with Prisma.
//
// ── WHAT IT DOES NOT MODEL ──
//
//   - `select`: accepted and ignored; whole rows come back.
//   - `include`: not accepted, it throws. No cart resolver uses it today.
//   - `orderBy`: only `{ id: 'asc' }` (alone or in an array) on `cart.findMany`.
//     Anything else throws, so no test rests on an order this file did not apply.
//   - the foreign keys onto `Location` and `Item`. This file holds no
//     location or item rows.
//   - the relation filters `cart: { location: { householdId } }` and
//     `location: { householdId }` (`clearAllData`, `/e2e/cleanup`). They throw
//     as unknown keys.
//   - Postgres's row locks. `runInTransaction` (below) models rollback only.
//     Two transactions run here at the same time and do not wait for each
//     other. See `householdWorld.ts` and its `serialTransactions`.
//
// ── TRANSACTIONS ──
//
// `state` is ONE plain object holding plain data, so it is one rollback
// store. Register it with `runInTransaction` (stockFake.ts), never with a
// second rollback of your own:
//
//   world.extend({ cart: carts.client.cart, cartItem: carts.client.cartItem },
//     [carts.state as unknown as RollbackStore])
//
// The client always reads `state.carts` and `state.cartItems` through
// `state`, so a rollback that replaces the arrays is seen at once.

import { filterCartItems } from './cartItemFake.js'
import {
  DroppedColumnError,
  MissingColumnError,
  OwnedRowIdConstraintError,
  OwnedRowNotFoundError,
  UnsupportedOptionError,
} from './ownedRowFake.js'
import { checkWhere, UnsupportedWhereFilterError, type WhereSpec } from './whereKeys.js'

export interface CartRow {
  id: string
  locationId: string
  lastPurchasedAt: Date | null
}

export interface CartItemRow {
  id: string
  cartId: string
  itemId: string
  quantity: number
  /** "Added by". Never a scope (H3b rule 13). */
  userId: string
}

export interface CartFakeState {
  carts: CartRow[]
  cartItems: CartItemRow[]
}

type Where = Record<string, unknown>
type Data = Record<string, unknown>

/** P2002 from `CartItem`'s `@@unique([cartId, itemId])`. */
export class CartItemPairConstraintError extends Error {
  code = 'P2002'
  meta = { target: ['cartId', 'itemId'] }
  constructor(cartId: string, itemId: string) {
    super(
      `Unique constraint failed on the fields: (\`cartId\`,\`itemId\`) — (${cartId}, ${itemId})`,
    )
  }
}

/** P2003: a `CartItem` whose `cartId` names no `Cart`. */
export class CartForeignKeyError extends Error {
  code = 'P2003'
  constructor(cartId: string) {
    super(`Foreign key constraint failed on the field: \`CartItem_cartId_fkey\` (${cartId})`)
  }
}

/** Raised when a method that needs a unique where gets a non-unique one. */
export class NotAUniqueWhereError extends Error {
  constructor(model: string, method: string, where: Where) {
    super(
      `cartFake(${model}).${method} needs a unique where: a string id` +
        (model === 'CartItem' ? ' or cartId_itemId: { cartId, itemId }' : '') +
        `. Prisma refuses ${JSON.stringify(where)}.`,
    )
  }
}

/** Raised for a number operation other than a plain number or `{ increment }`. */
export class UnsupportedNumberWriteError extends Error {
  constructor(column: string, value: unknown) {
    super(
      `cartFake(CartItem) models '${column}' as a number or { increment: number }, ` +
        `not ${JSON.stringify(value)}.`,
    )
  }
}

// Every `where` key each store models. `userId` is in neither, on purpose
// (see the file head). The CartItem spec is the same as the shared one in
// `cartItemFake.ts` (which also dropped `userId` in task B.4);
// `filterCartItems` then checks again with its own spec.
const CART_WHERE: WhereSpec = { id: 'in', locationId: 'in' }
const CART_ITEM_WHERE: WhereSpec = {
  id: 'in',
  cartId: 'in',
  itemId: 'equals',
  quantity: 'number',
  cart: { nested: { locationId: 'in' } },
}

const CART_COLUMNS = ['id', 'locationId', 'lastPurchasedAt']
const CART_ITEM_UPDATE_COLUMNS = ['cartId', 'itemId', 'quantity', 'userId']

function refuseUnknownOptions(model: string, method: string, args: object, allowed: string[]) {
  for (const key of Object.keys(args)) {
    if (!allowed.includes(key)) throw new UnsupportedOptionError(model, method, key)
  }
}

function matchesIn(value: string, filter: unknown): boolean {
  if (filter === undefined) return true
  if (typeof filter === 'string') return value === filter
  return ((filter as { in: unknown[] }).in ?? []).includes(value)
}

function cartMatches(row: CartRow, where: Where): boolean {
  return matchesIn(row.id, where.id) && matchesIn(row.locationId, where.locationId)
}

export function createCartFake(initial: Partial<CartFakeState> = {}) {
  const state: CartFakeState = {
    carts: [...(initial.carts ?? [])],
    cartItems: [...(initial.cartItems ?? [])],
  }
  let seq = 0

  // ── Cart ──────────────────────────────────────────────────────────────

  function findCarts(where: Where | undefined): CartRow[] {
    checkWhere('cartFake(Cart)', where, CART_WHERE)
    return state.carts.filter((c) => cartMatches(c, where ?? {}))
  }

  function uniqueCart(method: string, where: Where): CartRow | undefined {
    if (typeof where.id !== 'string') throw new NotAUniqueWhereError('Cart', method, where)
    return findCarts(where)[0]
  }

  function refuseCartUserId(data: Data): void {
    if ('userId' in data) throw new DroppedColumnError('Cart', 'userId')
  }

  /** Build a cart row from `create` data, checking every rule, writing nothing. */
  function buildCart(data: Data): CartRow {
    refuseCartUserId(data)
    for (const key of Object.keys(data)) {
      if (!CART_COLUMNS.includes(key)) throw new UnsupportedOptionError('Cart', 'create data', key)
    }
    const id = data.id
    if (typeof id !== 'string') throw new MissingColumnError('Cart', String(id), 'id')
    if (typeof data.locationId !== 'string') {
      throw new MissingColumnError('Cart', id, 'locationId')
    }
    return {
      id,
      locationId: data.locationId,
      lastPurchasedAt: (data.lastPurchasedAt as Date | null | undefined) ?? null,
    }
  }

  function applyCartUpdate(row: CartRow, data: Data): void {
    refuseCartUserId(data)
    for (const [key, value] of Object.entries(data)) {
      if (value === undefined) continue
      if (!CART_COLUMNS.includes(key)) throw new UnsupportedOptionError('Cart', 'update data', key)
      ;(row as unknown as Record<string, unknown>)[key] = value
    }
  }

  /** `onDelete: Cascade` from `CartItem.cartId`. */
  function removeCarts(rows: CartRow[]): void {
    const ids = new Set(rows.map((r) => r.id))
    state.carts = state.carts.filter((c) => !ids.has(c.id))
    state.cartItems = state.cartItems.filter((ci) => !ids.has(ci.cartId))
  }

  function sortCarts(rows: CartRow[], orderBy: unknown): CartRow[] {
    if (orderBy === undefined) return rows
    const list = Array.isArray(orderBy) ? orderBy : [orderBy]
    const ok =
      list.length === 1 &&
      JSON.stringify(list[0]) === JSON.stringify({ id: 'asc' })
    if (!ok) throw new UnsupportedOptionError('Cart', 'findMany orderBy', JSON.stringify(orderBy))
    return [...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  }

  const cart = {
    findUnique: async (args: { where: Where; select?: Where }) => {
      refuseUnknownOptions('Cart', 'findUnique', args, ['where', 'select'])
      const row = uniqueCart('findUnique', args.where)
      return row ? { ...row } : null
    },
    findFirst: async (args: { where?: Where; select?: Where } = {}) => {
      refuseUnknownOptions('Cart', 'findFirst', args, ['where', 'select'])
      const row = findCarts(args.where)[0]
      return row ? { ...row } : null
    },
    findMany: async (args: { where?: Where; select?: Where; orderBy?: unknown } = {}) => {
      refuseUnknownOptions('Cart', 'findMany', args, ['where', 'select', 'orderBy'])
      return sortCarts(findCarts(args.where), args.orderBy).map((r) => ({ ...r }))
    },
    create: async (args: { data: Data; select?: Where }) => {
      refuseUnknownOptions('Cart', 'create', args, ['data', 'select'])
      const row = buildCart(args.data)
      if (state.carts.some((c) => c.id === row.id)) {
        throw new OwnedRowIdConstraintError('Cart', row.id)
      }
      state.carts.push(row)
      return { ...row }
    },
    // One statement: every row is checked before any is written.
    createMany: async (args: { data: Data[]; skipDuplicates?: boolean }) => {
      refuseUnknownOptions('Cart', 'createMany', args, ['data', 'skipDuplicates'])
      const rows = args.data.map(buildCart)
      const taken = new Set(state.carts.map((c) => c.id))
      const toWrite: CartRow[] = []
      for (const row of rows) {
        if (taken.has(row.id)) {
          if (args.skipDuplicates) continue
          throw new OwnedRowIdConstraintError('Cart', row.id)
        }
        taken.add(row.id)
        toWrite.push(row)
      }
      state.carts.push(...toWrite)
      return { count: toWrite.length }
    },
    // `create` and `update` are kept apart, and `update` is applied key by key.
    upsert: async (args: { where: Where; create: Data; update: Data; select?: Where }) => {
      refuseUnknownOptions('Cart', 'upsert', args, ['where', 'create', 'update', 'select'])
      refuseCartUserId(args.create)
      refuseCartUserId(args.update)
      const existing = uniqueCart('upsert', args.where)
      if (existing) {
        applyCartUpdate(existing, args.update)
        return { ...existing }
      }
      return cart.create({ data: args.create })
    },
    update: async (args: { where: Where; data: Data; select?: Where }) => {
      refuseUnknownOptions('Cart', 'update', args, ['where', 'data', 'select'])
      const row = uniqueCart('update', args.where)
      if (!row) throw new OwnedRowNotFoundError('Cart', args.where)
      applyCartUpdate(row, args.data)
      return { ...row }
    },
    delete: async (args: { where: Where; select?: Where }) => {
      refuseUnknownOptions('Cart', 'delete', args, ['where', 'select'])
      const row = uniqueCart('delete', args.where)
      if (!row) throw new OwnedRowNotFoundError('Cart', args.where)
      removeCarts([row])
      return { ...row }
    },
    deleteMany: async (args: { where?: Where } = {}) => {
      refuseUnknownOptions('Cart', 'deleteMany', args, ['where'])
      const hits = findCarts(args.where)
      removeCarts(hits)
      return { count: hits.length }
    },
  }

  // ── CartItem ──────────────────────────────────────────────────────────

  function findItems(where: Where | undefined): CartItemRow[] {
    checkWhere('cartFake(CartItem)', where, CART_ITEM_WHERE)
    // The shared matcher: `cart: { locationId }` is read off the Cart ROW.
    return filterCartItems(state.cartItems, where, state.carts)
  }

  /**
   * Turn a unique where into a plain one. `cartId_itemId: { cartId, itemId }`
   * becomes `{ cartId, itemId }`; a string `id` stays. Anything else is not a
   * unique where and throws.
   */
  function flattenUnique(method: string, where: Where): Where {
    const { cartId_itemId: pair, ...rest } = where
    if (pair !== undefined) {
      const p = pair as Record<string, unknown>
      const keys = Object.keys(p ?? {}).sort()
      const ok =
        p !== null &&
        typeof p === 'object' &&
        keys.join(',') === 'cartId,itemId' &&
        typeof p.cartId === 'string' &&
        typeof p.itemId === 'string'
      if (!ok) {
        throw new UnsupportedWhereFilterError(
          'cartFake(CartItem)',
          'cartId_itemId',
          pair,
          '{ cartId: string, itemId: string }',
        )
      }
      return { ...rest, cartId: p.cartId, itemId: p.itemId }
    }
    if (typeof where.id !== 'string') throw new NotAUniqueWhereError('CartItem', method, where)
    return where
  }

  function uniqueItem(method: string, where: Where): CartItemRow | undefined {
    return findItems(flattenUnique(method, where))[0]
  }

  function pairTaken(cartId: string, itemId: string, ignore?: CartItemRow): boolean {
    return state.cartItems.some((r) => r !== ignore && r.cartId === cartId && r.itemId === itemId)
  }

  /** Build a cart item row from `create` data, checking columns and the FK. */
  function buildItem(data: Data): CartItemRow {
    for (const key of Object.keys(data)) {
      if (key !== 'id' && !CART_ITEM_UPDATE_COLUMNS.includes(key)) {
        throw new UnsupportedOptionError('CartItem', 'create data', key)
      }
    }
    const id = (data.id as string | undefined) ?? `cartItem-${++seq}`
    for (const column of ['cartId', 'itemId', 'userId']) {
      if (typeof data[column] !== 'string') throw new MissingColumnError('CartItem', id, column)
    }
    if (typeof data.quantity !== 'number') {
      throw new MissingColumnError('CartItem', id, 'quantity')
    }
    const row: CartItemRow = {
      id,
      cartId: data.cartId as string,
      itemId: data.itemId as string,
      quantity: data.quantity,
      userId: data.userId as string,
    }
    if (!state.carts.some((c) => c.id === row.cartId)) throw new CartForeignKeyError(row.cartId)
    return row
  }

  function insertItem(data: Data): CartItemRow {
    const row = buildItem(data)
    if (state.cartItems.some((r) => r.id === row.id)) {
      throw new OwnedRowIdConstraintError('CartItem', row.id)
    }
    if (pairTaken(row.cartId, row.itemId)) {
      throw new CartItemPairConstraintError(row.cartId, row.itemId)
    }
    state.cartItems.push(row)
    return row
  }

  /**
   * The row an `update` payload would produce, checked but NOT written.
   * `quantity` is a number or `{ increment: n }`. An explicit `undefined`
   * means "not mentioned" (Prisma's rule).
   */
  function updatedItem(row: CartItemRow, data: Data): CartItemRow {
    const next = { ...row }
    for (const [key, value] of Object.entries(data)) {
      if (value === undefined) continue
      if (!CART_ITEM_UPDATE_COLUMNS.includes(key)) {
        throw new UnsupportedOptionError('CartItem', 'update data', key)
      }
      if (key === 'quantity') {
        if (typeof value === 'number') {
          next.quantity = value
        } else {
          const ops = value as Record<string, unknown>
          const keys = value !== null && typeof value === 'object' ? Object.keys(ops) : []
          if (keys.length !== 1 || keys[0] !== 'increment' || typeof ops.increment !== 'number') {
            throw new UnsupportedNumberWriteError(key, value)
          }
          next.quantity = row.quantity + ops.increment
        }
        continue
      }
      if (typeof value !== 'string') throw new UnsupportedNumberWriteError(key, value)
      ;(next as unknown as Record<string, unknown>)[key] = value
    }
    if (next.cartId !== row.cartId && !state.carts.some((c) => c.id === next.cartId)) {
      throw new CartForeignKeyError(next.cartId)
    }
    return next
  }

  /** Check and then write a set of updates, all or nothing (one statement). */
  function writeItemUpdates(rows: CartItemRow[], data: Data): CartItemRow[] {
    const nexts = rows.map((r) => updatedItem(r, data))
    const touched = new Set(rows)
    const pairs = new Set(
      state.cartItems.filter((r) => !touched.has(r)).map((r) => `${r.cartId}\u0000${r.itemId}`),
    )
    for (const next of nexts) {
      const key = `${next.cartId}\u0000${next.itemId}`
      if (pairs.has(key)) throw new CartItemPairConstraintError(next.cartId, next.itemId)
      pairs.add(key)
    }
    rows.forEach((row, i) => Object.assign(row, nexts[i]))
    return rows
  }

  const cartItem = {
    findUnique: async (args: { where: Where; select?: Where }) => {
      refuseUnknownOptions('CartItem', 'findUnique', args, ['where', 'select'])
      const row = uniqueItem('findUnique', args.where)
      return row ? { ...row } : null
    },
    findFirst: async (args: { where?: Where; select?: Where } = {}) => {
      refuseUnknownOptions('CartItem', 'findFirst', args, ['where', 'select'])
      const row = findItems(args.where)[0]
      return row ? { ...row } : null
    },
    findMany: async (args: { where?: Where; select?: Where } = {}) => {
      refuseUnknownOptions('CartItem', 'findMany', args, ['where', 'select'])
      return findItems(args.where).map((r) => ({ ...r }))
    },
    count: async (args: { where?: Where } = {}) => {
      refuseUnknownOptions('CartItem', 'count', args, ['where'])
      return findItems(args.where).length
    },
    create: async (args: { data: Data; select?: Where }) => {
      refuseUnknownOptions('CartItem', 'create', args, ['data', 'select'])
      return { ...insertItem(args.data) }
    },
    // One statement. Without `skipDuplicates`, any conflict (a stored row or
    // another row of the same payload, on `id` or on the pair) refuses the
    // whole call. With it, every conflicting row is skipped. A foreign-key
    // error is never skipped: `ON CONFLICT` covers unique keys only.
    createMany: async (args: { data: Data[]; skipDuplicates?: boolean }) => {
      refuseUnknownOptions('CartItem', 'createMany', args, ['data', 'skipDuplicates'])
      const rows = args.data.map(buildItem)
      const ids = new Set(state.cartItems.map((r) => r.id))
      const pairs = new Set(state.cartItems.map((r) => `${r.cartId}\u0000${r.itemId}`))
      const toWrite: CartItemRow[] = []
      for (const row of rows) {
        const pair = `${row.cartId}\u0000${row.itemId}`
        const idTaken = ids.has(row.id)
        const pairIsTaken = pairs.has(pair)
        if (idTaken || pairIsTaken) {
          if (args.skipDuplicates) continue
          throw idTaken
            ? new OwnedRowIdConstraintError('CartItem', row.id)
            : new CartItemPairConstraintError(row.cartId, row.itemId)
        }
        ids.add(row.id)
        pairs.add(pair)
        toWrite.push(row)
      }
      state.cartItems.push(...toWrite)
      return { count: toWrite.length }
    },
    // `where` may be `{ id }` or `{ cartId_itemId: { cartId, itemId } }`.
    // Found: only `update` is applied, key by key, so `userId` (added by)
    // stays the first adder's unless `update` names it. Not found: `create`
    // is inserted, and it can still raise P2002 on the pair when `where`
    // named an id (task B.7's `bulkUpsertCartItems` path).
    upsert: async (args: { where: Where; create: Data; update: Data; select?: Where }) => {
      refuseUnknownOptions('CartItem', 'upsert', args, ['where', 'create', 'update', 'select'])
      const existing = uniqueItem('upsert', args.where)
      if (existing) return { ...writeItemUpdates([existing], args.update)[0] }
      return { ...insertItem(args.create) }
    },
    update: async (args: { where: Where; data: Data; select?: Where }) => {
      refuseUnknownOptions('CartItem', 'update', args, ['where', 'data', 'select'])
      const row = uniqueItem('update', args.where)
      if (!row) throw new OwnedRowNotFoundError('CartItem', args.where)
      return { ...writeItemUpdates([row], args.data)[0] }
    },
    updateMany: async (args: { where?: Where; data: Data }) => {
      refuseUnknownOptions('CartItem', 'updateMany', args, ['where', 'data'])
      const hits = findItems(args.where)
      writeItemUpdates(hits, args.data)
      return { count: hits.length }
    },
    delete: async (args: { where: Where; select?: Where }) => {
      refuseUnknownOptions('CartItem', 'delete', args, ['where', 'select'])
      const row = uniqueItem('delete', args.where)
      if (!row) throw new OwnedRowNotFoundError('CartItem', args.where)
      state.cartItems = state.cartItems.filter((r) => r !== row)
      return { ...row }
    },
    deleteMany: async (args: { where?: Where } = {}) => {
      refuseUnknownOptions('CartItem', 'deleteMany', args, ['where'])
      const hits = new Set(findItems(args.where))
      state.cartItems = state.cartItems.filter((r) => !hits.has(r))
      return { count: hits.size }
    },
  }

  /** Replace both stores. The arrays are copied; the rows are not. */
  function reset(next: Partial<CartFakeState> = {}) {
    state.carts = [...(next.carts ?? [])]
    state.cartItems = [...(next.cartItems ?? [])]
    seq = 0
  }

  return { state, client: { cart, cartItem }, reset }
}

export type CartFake = ReturnType<typeof createCartFake>
