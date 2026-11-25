import { ApolloServer } from '@apollo/server'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Context } from '../context.js'
import { resolvers } from '../resolvers/index.js'
import { typeDefs } from '../schema/index.js'

// ─── What this file covers ───────────────────────────────────────────────────
//
// `Item.consumable` (design: docs/features/items/2026-11-25-item-consumable-design.md,
// PR 1). Four writers and every reader:
//
// | Writer             | Value omitted (or null)  | Value given  |
// |--------------------|--------------------------|--------------|
// | `createItem`       | true                     | that value   |
// | `updateItem`       | the stored value stays   | that value   |
// | `bulkCreateItems`  | true                     | that value   |
// | `bulkUpsertItems`  | true (a replace takes the file's value, and a file
// |                    | with no value means "consumable")       | that value |
//
// ─── Why a stateful fake, and why it does not hide a dropped field ──────────
//
// The `item` store is `ownedRowFake`, which keeps the rows the resolver
// wrote, and every test reads the value BACK through GraphQL (`items` or
// the mutation's own answer) and from the store. Two things make a dropped
// field visible:
//
//   - the fake does NOT apply the column's `DEFAULT true`. A resolver that
//     stops writing `consumable` leaves the row without the key, and
//     `consumable: Boolean!` then fails with a non-null error.
//   - `upsert` applies `update` key by key and keeps `create` apart, so a
//     value that reaches only one half shows as a wrong stored row.
//
// The seeded rows carry `consumable` on purpose: a real row always has it.
vi.mock('../lib/prisma.js', async () => {
  const { createOwnedRowFake } = await import('../test/ownedRowFake.js')
  const { createHouseholdFake } = await import('../test/householdFake.js')
  const T = new Date('2026-11-01T00:00:00.000Z')
  const households = createHouseholdFake({
    householdMembers: [{ householdId: 'hh_mine', userId: 'user_consumable', role: 'owner', joinedAt: T }],
  })
  const catalog = { scope: 'householdId' as const }

  // The two junction tables. No test here names a tag or a vendor, so they
  // only need to answer the calls `createItem`, `updateItem` and the imports
  // make with empty lists, and the `include` of the closing reads.
  const junction = () => ({
    rows: [] as Record<string, unknown>[],
    client: {
      createMany: async ({ data }: { data: Record<string, unknown>[] }) => ({ count: data.length }),
      deleteMany: async () => ({ count: 0 }),
    },
  })
  const itemTag = junction()
  const itemVendor = junction()

  const item = createOwnedRowFake<{
    id: string
    householdId: string
    userId: string
    name: string
    targetUnit: string
    consumeAmount: number
    expirationMode: string
    consumable?: boolean
    createdAt: Date
    updatedAt: Date
  }>({
    model: 'Item',
    ...catalog,
    relations: () => ({ tags: [], vendors: [] }),
  })
  const tag = createOwnedRowFake<{ id: string; householdId: string; userId: string }>({ model: 'Tag', ...catalog })
  const vendor = createOwnedRowFake<{ id: string; householdId: string; userId: string }>({
    model: 'Vendor',
    ...catalog,
  })

  return {
    prisma: {
      user: (await import('../test/userFake.js')).createUserFake([], {
        householdMembers: () => households.state.householdMembers,
        rowForEveryMember: true,
      }).client,
      householdMember: households.client.householdMember,
      // `createItem` leaves `createdAt` and `updatedAt` to the database
      // (`@default(now())`, `@updatedAt`), and the fake applies no default.
      // This wrapper adds those two and NOTHING else, so a missing
      // `consumable` still stays missing.
      item: {
        ...item.client,
        create: (args: { data: Record<string, unknown> }) =>
          item.client.create({
            ...args,
            data: { createdAt: new Date(0), updatedAt: new Date(0), ...args.data },
          } as Parameters<typeof item.client.create>[0]),
      },
      tag: tag.client,
      vendor: vendor.client,
      itemTag: itemTag.client,
      itemVendor: itemVendor.client,
      $item: item,
    },
  }
})

import { prisma } from '../lib/prisma.js'
import type { OwnedRowFake } from '../test/ownedRowFake.js'

type ItemRow = {
  id: string
  householdId: string
  userId: string
  name: string
  targetUnit: string
  consumeAmount: number
  expirationMode: string
  consumable?: boolean
  createdAt: Date
  updatedAt: Date
}

const mockPrisma = prisma as unknown as { $item: OwnedRowFake<ItemRow> }

let server: ApolloServer<Context>

beforeAll(async () => {
  server = new ApolloServer<Context>({ typeDefs, resolvers })
  await server.start()
})

afterAll(async () => {
  await server.stop()
})

const USER = 'user_consumable'
const HH = 'hh_mine'
const TS = new Date('2026-01-01T00:00:00.000Z')

// One item of each kind, so a resolver that writes a constant cannot pass a
// test that reads both.
const CUPS = 'item_cups'
const MILK = 'item_milk'

const row = (id: string, name: string, consumable: boolean): ItemRow => ({
  id,
  householdId: HH,
  userId: USER,
  name,
  targetUnit: 'package',
  consumeAmount: 1,
  expirationMode: 'disabled',
  consumable,
  createdAt: TS,
  updatedAt: TS,
})

beforeEach(() => {
  vi.resetAllMocks()
  mockPrisma.$item.reset([row(CUPS, 'Cups', false), row(MILK, 'Milk', true)])
})

async function exec(query: string, variables: Record<string, unknown> = {}) {
  const response = await server.executeOperation({ query, variables }, { contextValue: { userId: USER } })
  if (response.body.kind !== 'single') throw new Error('expected a single result')
  return response.body.singleResult
}

const stored = (id: string) => mockPrisma.$item.state.rows.find((r) => r.id === id)

async function readBack(id: string) {
  const result = await exec('query { items { id consumable } }')
  expect(result.errors).toBeUndefined()
  const items = (result.data?.items ?? []) as { id: string; consumable: boolean }[]
  return items.find((i) => i.id === id)?.consumable
}

const CREATE = `mutation ($input: CreateItemInput!) { createItem(input: $input) { id consumable } }`
const UPDATE = `mutation ($id: ID!, $input: UpdateItemInput!) { updateItem(id: $id, input: $input) { id consumable } }`
const BULK_CREATE = `mutation ($items: [ItemInput!]!) { bulkCreateItems(items: $items) { id consumable } }`
const BULK_UPSERT = `mutation ($items: [ItemInput!]!) { bulkUpsertItems(items: $items) { id consumable } }`

const itemIn = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: id,
  tagIds: [],
  targetUnit: 'package',
  consumeAmount: 1,
  createdAt: '2026-02-03T04:05:06.000Z',
  updatedAt: '2026-03-04T05:06:07.000Z',
  ...extra,
})

describe('Item.consumable on read', () => {
  it('user sees whether each item is consumable', async () => {
    // Given one consumable and one non-consumable item
    // When the items are read
    // Then each reads its own stored value
    expect(await readBack(CUPS)).toBe(false)
    expect(await readBack(MILK)).toBe(true)
  })
})

describe('createItem and consumable', () => {
  it('user creates an item that is consumable by default', async () => {
    // When the user creates an item without the field
    const result = await exec(CREATE, { input: { name: 'Rice' } })

    // Then it is stored and answered as consumable
    expect(result.errors).toBeUndefined()
    const { id, consumable } = result.data?.createItem as { id: string; consumable: boolean }
    expect(consumable).toBe(true)
    expect(stored(id)?.consumable).toBe(true)
    expect(await readBack(id)).toBe(true)
  })

  it('user can create a non-consumable item', async () => {
    const result = await exec(CREATE, { input: { name: 'Slippers', consumable: false } })

    expect(result.errors).toBeUndefined()
    const { id, consumable } = result.data?.createItem as { id: string; consumable: boolean }
    expect(consumable).toBe(false)
    expect(stored(id)?.consumable).toBe(false)
    expect(await readBack(id)).toBe(false)
  })

  it('createItem treats an explicit null like an omitted value', async () => {
    // The column is NOT NULL, so null must never reach Prisma
    const result = await exec(CREATE, { input: { name: 'Bread', consumable: null } })

    expect(result.errors).toBeUndefined()
    const { id } = result.data?.createItem as { id: string }
    expect(stored(id)?.consumable).toBe(true)
  })
})

describe('updateItem and consumable', () => {
  it('user renaming a non-consumable item keeps it non-consumable', async () => {
    // Given a non-consumable item
    // When the user changes only its name
    const result = await exec(UPDATE, { id: CUPS, input: { name: 'Glass cups' } })

    // Then the stored false stays false
    expect(result.errors).toBeUndefined()
    expect(stored(CUPS)?.consumable).toBe(false)
    expect(await readBack(CUPS)).toBe(false)
  })

  it('updateItem with consumable null keeps the stored value', async () => {
    const result = await exec(UPDATE, { id: CUPS, input: { consumable: null } })

    expect(result.errors).toBeUndefined()
    expect(stored(CUPS)?.consumable).toBe(false)
  })

  it('user can make a consumable item non-consumable', async () => {
    const result = await exec(UPDATE, { id: MILK, input: { consumable: false } })

    expect(result.errors).toBeUndefined()
    expect(result.data?.updateItem).toMatchObject({ consumable: false })
    expect(stored(MILK)?.consumable).toBe(false)
  })

  it('user can make a non-consumable item consumable again', async () => {
    const result = await exec(UPDATE, { id: CUPS, input: { consumable: true } })

    expect(result.errors).toBeUndefined()
    expect(stored(CUPS)?.consumable).toBe(true)
    expect(await readBack(CUPS)).toBe(true)
  })
})

describe('bulkCreateItems and consumable', () => {
  it('user importing a file with no consumable field gets consumable items', async () => {
    // Given a backup written before the field existed
    const result = await exec(BULK_CREATE, { items: [itemIn('item_old_file')] })

    // Then the item imports as consumable
    expect(result.errors).toBeUndefined()
    expect(stored('item_old_file')?.consumable).toBe(true)
    expect(await readBack('item_old_file')).toBe(true)
  })

  it('user importing a non-consumable item keeps it non-consumable', async () => {
    const result = await exec(BULK_CREATE, { items: [itemIn('item_plates', { consumable: false })] })

    expect(result.errors).toBeUndefined()
    expect(result.data?.bulkCreateItems).toEqual([{ id: 'item_plates', consumable: false }])
    expect(stored('item_plates')?.consumable).toBe(false)
  })

  it('bulkCreateItems treats an explicit null like an omitted value', async () => {
    const result = await exec(BULK_CREATE, { items: [itemIn('item_null', { consumable: null })] })

    expect(result.errors).toBeUndefined()
    expect(stored('item_null')?.consumable).toBe(true)
  })
})

describe('bulkUpsertItems and consumable', () => {
  it('user replacing an item with a non-consumable one stores false', async () => {
    // Given a consumable item already in the cloud
    // When a file names it with consumable false
    const result = await exec(BULK_UPSERT, { items: [itemIn(MILK, { consumable: false })] })

    // Then the `update` half writes false
    expect(result.errors).toBeUndefined()
    expect(result.data?.bulkUpsertItems).toEqual([{ id: MILK, consumable: false }])
    expect(stored(MILK)?.consumable).toBe(false)
  })

  it('user replacing an item from a file with no consumable field gets a consumable item', async () => {
    // Given a non-consumable item already in the cloud
    // When a file written before the field existed names it
    const result = await exec(BULK_UPSERT, { items: [itemIn(CUPS)] })

    // Then the file's meaning wins: no value means consumable
    expect(result.errors).toBeUndefined()
    expect(stored(CUPS)?.consumable).toBe(true)
    expect(await readBack(CUPS)).toBe(true)
  })

  it('user importing a new non-consumable item through replace stores false', async () => {
    // The `create` half, for an id no row holds
    const result = await exec(BULK_UPSERT, { items: [itemIn('item_bowls', { consumable: false })] })

    expect(result.errors).toBeUndefined()
    expect(stored('item_bowls')?.consumable).toBe(false)
  })

  it('user importing a new item through replace with no field gets a consumable item', async () => {
    const result = await exec(BULK_UPSERT, { items: [itemIn('item_flour')] })

    expect(result.errors).toBeUndefined()
    expect(stored('item_flour')?.consumable).toBe(true)
  })
})
