import { describe, expect, it, vi } from 'vitest'
import type { Prisma } from '@prisma/client'

// `deleteHouseholdData(tx, householdId)` (lib/household.ts, households H6
// task J.4, decision T64): the ordered delete of every data row of ONE
// household. `clearAllData` and `deleteHousehold` both call it.
//
// It takes the transaction client only, so this file needs no `prisma` mock
// beyond keeping the real client from being built.
//
// ── THE TABLE FAKE ──
//
// A small stateful double for the 14 tables the helper deletes, with two
// households of the same shape. It models what decides the result in
// Postgres:
//
//   - each `where` it understands is APPLIED: `householdId` on the row, and
//     the relation filters `location`, `cart`, `recipe` and `item`, which it
//     resolves by following the row's own id column to its parent row. Any
//     other key THROWS, so a filter the helper changes to an unknown shape
//     fails here instead of matching nothing. An empty `where` matches every
//     row, as in Prisma, so a dropped filter deletes the other household too.
//   - the cascades of the schema: a location takes its stock rows, carts,
//     logs and role rows; a cart its cart rows; an item its stock rows, tag
//     and vendor links and recipe lines; a tag its item links; a vendor its
//     item links; a recipe its lines.
//   - `Tag.type` is `onDelete: NoAction` (schema.prisma). A tag type that a
//     tag still points at cannot be deleted: Postgres raises a foreign key
//     error, which Prisma gives as P2003. So deleting tag types before tags
//     fails here, as it does on real SQL.
//
// What it does not model: `select`, a row lock, and any table the helper does
// not touch.

vi.mock('./prisma.js', () => ({ prisma: {} }))

import { deleteHouseholdData } from './household.js'

type Row = Record<string, string>

const TABLES = [
  'location',
  'locationMember',
  'itemStock',
  'cart',
  'cartItem',
  'inventoryLog',
  'item',
  'itemTag',
  'itemVendor',
  'tag',
  'tagType',
  'vendor',
  'recipe',
  'recipeItem',
  'shelf',
] as const
type Table = (typeof TABLES)[number]

/** The column that points at the parent of each relation filter. */
const PARENT: Record<string, { table: Table; column: string }> = {
  location: { table: 'location', column: 'locationId' },
  cart: { table: 'cart', column: 'cartId' },
  recipe: { table: 'recipe', column: 'recipeId' },
  item: { table: 'item', column: 'itemId' },
}

/** What goes when a row of a table is deleted (ON DELETE CASCADE). */
const CASCADES: Partial<Record<Table, { table: Table; column: string }[]>> = {
  location: [
    { table: 'locationMember', column: 'locationId' },
    { table: 'itemStock', column: 'locationId' },
    { table: 'cart', column: 'locationId' },
    { table: 'inventoryLog', column: 'locationId' },
  ],
  cart: [{ table: 'cartItem', column: 'cartId' }],
  item: [
    { table: 'itemStock', column: 'itemId' },
    { table: 'itemTag', column: 'itemId' },
    { table: 'itemVendor', column: 'itemId' },
    { table: 'recipeItem', column: 'itemId' },
  ],
  tag: [{ table: 'itemTag', column: 'tagId' }],
  vendor: [{ table: 'itemVendor', column: 'vendorId' }],
  recipe: [{ table: 'recipeItem', column: 'recipeId' }],
}

function seedTables(): Record<Table, Row[]> {
  const rows: Record<Table, Row[]> = Object.fromEntries(TABLES.map((t) => [t, []])) as unknown as Record<
    Table,
    Row[]
  >
  // Two households with the same shape. Every id ends in the household's
  // number, so a test can tell which household a row belongs to.
  for (const n of ['1', '2']) {
    const h = `hh-${n}`
    rows.location.push({ id: `loc-a${n}`, householdId: h }, { id: `loc-b${n}`, householdId: h })
    rows.locationMember.push({ id: `lm-${n}`, locationId: `loc-a${n}` })
    rows.item.push({ id: `item-${n}`, householdId: h })
    rows.itemStock.push(
      { id: `stock-a${n}`, locationId: `loc-a${n}`, itemId: `item-${n}` },
      { id: `stock-b${n}`, locationId: `loc-b${n}`, itemId: `item-${n}` },
    )
    rows.cart.push({ id: `cart-${n}`, locationId: `loc-a${n}` })
    rows.cartItem.push({ id: `ci-${n}`, cartId: `cart-${n}`, itemId: `item-${n}` })
    rows.inventoryLog.push({ id: `log-${n}`, locationId: `loc-b${n}`, itemId: `item-${n}` })
    rows.tagType.push({ id: `tt-${n}`, householdId: h })
    // A tag WITH a tag type: the NoAction case.
    rows.tag.push({ id: `tag-${n}`, householdId: h, typeId: `tt-${n}` })
    rows.itemTag.push({ id: `it-${n}`, itemId: `item-${n}`, tagId: `tag-${n}` })
    rows.vendor.push({ id: `vendor-${n}`, householdId: h })
    rows.itemVendor.push({ id: `iv-${n}`, itemId: `item-${n}`, vendorId: `vendor-${n}` })
    rows.recipe.push({ id: `recipe-${n}`, householdId: h })
    rows.recipeItem.push({ id: `ri-${n}`, recipeId: `recipe-${n}`, itemId: `item-${n}` })
    rows.shelf.push({ id: `shelf-${n}`, householdId: h })
  }
  return rows
}

function createTableFake() {
  const rows = seedTables()
  const calls: string[] = []

  function matches(table: Table, row: Row, where: Record<string, unknown>): boolean {
    for (const [key, filter] of Object.entries(where)) {
      if (key === 'householdId') {
        if (typeof filter !== 'string') throw new Error(`tableFake: ${table}.householdId must be a string`)
        if (row.householdId !== filter) return false
        continue
      }
      const parent = PARENT[key]
      if (!parent || typeof filter !== 'object' || filter === null) {
        throw new Error(`tableFake: unknown where key "${key}" on ${table}`)
      }
      const parentRow = rows[parent.table].find((p) => p.id === row[parent.column])
      if (!parentRow) return false
      if (!matches(parent.table, parentRow, filter as Record<string, unknown>)) return false
    }
    return true
  }

  function remove(table: Table, ids: Set<string>) {
    if (ids.size === 0) return
    if (table === 'tagType') {
      const blocking = rows.tag.filter((t) => ids.has(t.typeId ?? ''))
      if (blocking.length > 0) {
        throw Object.assign(
          new Error(`Foreign key constraint violated: Tag_typeId_fkey (${blocking.map((t) => t.id).join(', ')})`),
          { code: 'P2003' },
        )
      }
    }
    rows[table] = rows[table].filter((r) => !ids.has(r.id ?? ''))
    for (const child of CASCADES[table] ?? []) {
      const childIds = new Set(rows[child.table].filter((r) => ids.has(r[child.column] ?? '')).map((r) => r.id ?? ''))
      remove(child.table, childIds)
    }
  }

  const tx: Record<string, unknown> = {}
  for (const table of TABLES) {
    tx[table] = {
      deleteMany: async (args: { where?: Record<string, unknown> } = {}) => {
        calls.push(table)
        const where = args.where ?? {}
        const ids = new Set(rows[table].filter((r) => matches(table, r, where)).map((r) => r.id ?? ''))
        remove(table, ids)
        return { count: ids.size }
      },
    }
  }
  return { rows, calls, tx: tx as unknown as Prisma.TransactionClient }
}

/** Every row id still stored, by table. */
function idsLeft(rows: Record<Table, Row[]>): Record<Table, string[]> {
  return Object.fromEntries(TABLES.map((t) => [t, rows[t].map((r) => r.id).sort()])) as Record<
    Table,
    string[]
  >
}

describe('deleteHouseholdData (households H6 task J.4, decision T64)', () => {
  it('deletes every data row of one household and none of the other', async () => {
    // Given two households with the same shape, each with a tag that has a
    // tag type
    const fake = createTableFake()

    // When household 1's data is deleted
    await deleteHouseholdData(fake.tx, 'hh-1')

    // Then every row of household 1 is gone, and every row of household 2
    // is still there
    const left = idsLeft(fake.rows)
    for (const table of TABLES) {
      expect(left[table].filter((id) => id.endsWith('1')), table).toEqual([])
      expect(left[table].filter((id) => id.endsWith('2')).length, table).toBeGreaterThan(0)
    }
    expect(left).toEqual(idsLeft(onlyHousehold2()))
  })

  it('deletes tags before tag types, so the NoAction foreign key never refuses', async () => {
    const fake = createTableFake()
    await expect(deleteHouseholdData(fake.tx, 'hh-1')).resolves.toBeUndefined()
    expect(fake.calls.indexOf('tag')).toBeLessThan(fake.calls.indexOf('tagType'))
  })

  it('runs each delete once, children before parents, in the order of clearAllData', async () => {
    const fake = createTableFake()
    await deleteHouseholdData(fake.tx, 'hh-1')
    expect(fake.calls).toEqual([
      'inventoryLog',
      'cartItem',
      'cart',
      'recipeItem',
      'recipe',
      'itemTag',
      'itemVendor',
      'itemStock',
      'item',
      'tag',
      'tagType',
      'vendor',
      'shelf',
      'location',
    ])
  })

  it('refuses an empty or missing household id before any delete', async () => {
    // Prisma reads `{ householdId: undefined }` as NO filter, so every delete
    // would empty its table for every household.
    for (const bad of ['', undefined]) {
      const fake = createTableFake()
      await expect(deleteHouseholdData(fake.tx, bad as unknown as string)).rejects.toThrow(
        'deleteHouseholdData: no household id',
      )
      expect(fake.calls).toEqual([])
    }
  })
})

/** The rows of household 2 only: what must be left after household 1 goes. */
function onlyHousehold2(): Record<Table, Row[]> {
  const rows = seedTables()
  for (const table of TABLES) rows[table] = rows[table].filter((r) => (r.id ?? '').endsWith('2'))
  return rows
}
