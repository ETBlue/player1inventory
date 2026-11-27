import { ApolloServer } from '@apollo/server'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Context } from '../context.js'
import { resolvers } from '../resolvers/index.js'
import { typeDefs } from '../schema/index.js'

// ─── What this file covers ───────────────────────────────────────────────────
//
// `setItemRecipes(itemId, recipeIds)` (recipe.resolver.ts): make `recipeIds`
// the exact set of recipes that hold the item, in one transaction. Design:
// docs/features/items/2026-11-27-item-relations-save-design.md, *Server:
// `setItemRecipes` (PR A)*. The live event is tested in
// `catalog-live-publish.resolver.test.ts`.
//
// ─── The fake ────────────────────────────────────────────────────────────────
//
// `item` and `recipe` are `ownedRowFake` stores. `recipeItem` is a junction
// store that models three things the resolver depends on:
//
//   - the primary key `(recipeId, itemId)`: a second row raises `P2002`,
//     unless `createMany` gets `skipDuplicates`;
//   - the relation filter `recipe: { householdId }`, by following `recipeId`
//     to the `recipe` store (`RecipeItem` has no `householdId` column);
//   - a THROW on any other `where` key or shape, so a resolver that sends a
//     filter this fake does not understand cannot pass by matching everything.
//
// `$transaction` is the shared `runInTransaction`, over all three stores, so a
// failure inside the transaction is seen to roll back.
//
// ─── The fixture ─────────────────────────────────────────────────────────────
//
// Chosen so that a wrong implementation gives a different store:
//
//   - THEIR_RECIPE is a recipe of ANOTHER household that holds FLOUR (a row
//     made before issue #273). A links read without `recipe: { householdId }`
//     sees it and removes FLOUR from it.
//   - SALT has `consumeAmount: 0`. With 0, `?? 1` gives 0 and `> 0 ? … : 1`
//     gives 1, so the two rules give different answers.
//   - CAKE holds FLOUR with `defaultAmount: 5`, and FLOUR's `consumeAmount`
//     is 2. A resolver that rewrites existing links changes the 5.
//   - CAKE also holds CUPS, a non-consumable item, through an old link.
vi.mock('../lib/prisma.js', async () => {
  const { createOwnedRowFake } = await import('../test/ownedRowFake.js')
  const { createHouseholdFake } = await import('../test/householdFake.js')
  const { runInTransaction } = await import('../test/stockFake.js')
  const T = new Date('2026-11-01T00:00:00.000Z')
  const households = createHouseholdFake({
    householdMembers: [
      { householdId: 'hh_mine', userId: 'user_owner', role: 'owner', joinedAt: T },
      { householdId: 'hh_mine', userId: 'user_member', role: 'member', joinedAt: T },
      { householdId: 'hh_theirs', userId: 'user_stranger', role: 'owner', joinedAt: T },
    ],
  })
  const catalog = { scope: 'householdId' as const }

  const item = createOwnedRowFake<{
    id: string
    householdId: string
    userId: string
    name: string
    targetUnit: string
    consumeAmount: number
    expirationMode: string
    consumable: boolean
    createdAt: Date
    updatedAt: Date
  }>({ model: 'Item', ...catalog, relations: () => ({ tags: [], vendors: [] }) })

  type Link = { recipeId: string; itemId: string; defaultAmount: number }
  const links: { rows: Link[] } = { rows: [] }
  // Counts of the writes, so "no write" can be asserted, not only "the same
  // rows at the end".
  const calls = { deleteMany: 0, createMany: 0 }

  const recipe = createOwnedRowFake<{
    id: string
    householdId: string
    userId: string
    name: string
    lastCookedAt: Date | null
  }>({
    model: 'Recipe',
    ...catalog,
    relations: (row) => ({ items: links.rows.filter((r) => r.recipeId === row.id) }),
  })

  const p2002 = () =>
    Object.assign(new Error('Unique constraint failed — RecipeItem (recipeId, itemId)'), {
      code: 'P2002',
    })
  const isString = (v: unknown): v is string => typeof v === 'string'
  const isIn = (v: unknown): v is { in: string[] } =>
    !!v && typeof v === 'object' && Object.keys(v).length === 1 && Array.isArray((v as { in?: unknown }).in)
  // Checked ONCE per call, before the store is searched, not per row: a
  // per-row check never runs on an empty store (test/whereKeys.ts says why).
  const checkWhere = (where: Record<string, unknown>) => {
    for (const [key, filter] of Object.entries(where)) {
      if (filter === undefined) continue
      if (key === 'recipeId' || key === 'itemId') {
        if (!isString(filter) && !isIn(filter)) {
          throw new Error(`recipeItem fake: unsupported filter for "${key}": ${JSON.stringify(filter)}`)
        }
        continue
      }
      if (key === 'recipe') {
        const f = filter as Record<string, unknown>
        const keys = Object.keys(f)
        if (keys.length !== 1 || keys[0] !== 'householdId' || !isString(f.householdId)) {
          throw new Error(`recipeItem fake: unsupported recipe filter ${JSON.stringify(filter)}`)
        }
        continue
      }
      throw new Error(`recipeItem fake: unknown where key "${key}"`)
    }
  }
  const matches = (row: Link, where: Record<string, unknown>) =>
    Object.entries(where).every(([key, filter]) => {
      if (filter === undefined) return true
      if (key === 'recipe') {
        // Follow `recipeId` to the recipe store: `RecipeItem` has no
        // `householdId` column of its own.
        const parent = recipe.state.rows.find((r) => r.id === row.recipeId)
        return !!parent && parent.householdId === (filter as { householdId: string }).householdId
      }
      const value = row[key as 'recipeId' | 'itemId']
      return isString(filter) ? value === filter : (filter as { in: string[] }).in.includes(value)
    })
  const recipeItem = {
    findMany: async ({ where = {} }: { where?: Record<string, unknown>; select?: unknown } = {}) => {
      checkWhere(where)
      return links.rows.filter((r) => matches(r, where)).map((r) => ({ ...r }))
    },
    createMany: async ({ data, skipDuplicates }: { data: Link[]; skipDuplicates?: boolean }) => {
      calls.createMany++
      let count = 0
      for (const row of data) {
        if (links.rows.some((r) => r.recipeId === row.recipeId && r.itemId === row.itemId)) {
          if (skipDuplicates) continue
          throw p2002()
        }
        links.rows.push({ ...row })
        count++
      }
      return { count }
    },
    deleteMany: async ({ where = {} }: { where?: Record<string, unknown> } = {}) => {
      calls.deleteMany++
      checkWhere(where)
      const before = links.rows.length
      links.rows = links.rows.filter((r) => !matches(r, where))
      return { count: before - links.rows.length }
    },
  }

  const client: Record<string, unknown> = {
    user: (await import('../test/userFake.js')).createUserFake([], {
      householdMembers: () => households.state.householdMembers,
      rowForEveryMember: true,
    }).client,
    householdMember: households.client.householdMember,
    item: item.client,
    recipe: recipe.client,
    recipeItem,
    $item: item,
    $recipe: recipe,
    $links: links,
    $calls: calls,
  }
  client.$transaction = (arg: unknown) =>
    runInTransaction(
      [item.state, recipe.state, links] as unknown as Parameters<typeof runInTransaction>[0],
      client,
      arg,
    )
  return { prisma: client }
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
  consumable: boolean
  createdAt: Date
  updatedAt: Date
}
type RecipeRow = { id: string; householdId: string; userId: string; name: string; lastCookedAt: Date | null }
type Link = { recipeId: string; itemId: string; defaultAmount: number }
type RecipeItemFake = {
  findMany: (args?: unknown) => Promise<Link[]>
  createMany: (args: unknown) => Promise<{ count: number }>
}

const mockPrisma = prisma as unknown as {
  $item: OwnedRowFake<ItemRow>
  $recipe: OwnedRowFake<RecipeRow>
  $links: { rows: Link[] }
  $calls: { deleteMany: number; createMany: number }
  recipeItem: RecipeItemFake
}

let server: ApolloServer<Context>

beforeAll(async () => {
  server = new ApolloServer<Context>({ typeDefs, resolvers })
  await server.start()
})

afterAll(async () => {
  await server.stop()
})

const OWNER = 'user_owner'
const MEMBER = 'user_member'
const HH = 'hh_mine'
const OTHER_HH = 'hh_theirs'
const TS = new Date('2026-01-01T00:00:00.000Z')

const FLOUR = 'item_flour' // consumable, consumeAmount 2
const SALT = 'item_salt' // consumable, consumeAmount 0
const CUPS = 'item_cups' // not consumable
const THEIR_ITEM = 'item_theirs' // another household's
const CAKE = 'recipe_cake'
const SOUP = 'recipe_soup'
const BREAD = 'recipe_bread'
const THEIR_RECIPE = 'recipe_theirs' // another household's

const itemRow = (
  id: string,
  over: Partial<ItemRow> = {},
): ItemRow => ({
  id,
  householdId: HH,
  userId: OWNER,
  name: id,
  targetUnit: 'package',
  consumeAmount: 1,
  expirationMode: 'disabled',
  consumable: true,
  createdAt: TS,
  updatedAt: TS,
  ...over,
})
const recipeRow = (id: string, householdId = HH): RecipeRow => ({
  id,
  householdId,
  userId: OWNER,
  name: id,
  lastCookedAt: null,
})

const SEED_LINKS: Link[] = [
  { recipeId: CAKE, itemId: FLOUR, defaultAmount: 5 },
  { recipeId: CAKE, itemId: CUPS, defaultAmount: 1 },
  { recipeId: THEIR_RECIPE, itemId: FLOUR, defaultAmount: 1 },
]

beforeEach(() => {
  vi.resetAllMocks()
  mockPrisma.$item.reset([
    itemRow(FLOUR, { consumeAmount: 2 }),
    itemRow(SALT, { consumeAmount: 0 }),
    itemRow(CUPS, { consumable: false }),
    itemRow(THEIR_ITEM, { householdId: OTHER_HH }),
  ])
  mockPrisma.$recipe.reset([recipeRow(CAKE), recipeRow(SOUP), recipeRow(BREAD), recipeRow(THEIR_RECIPE, OTHER_HH)])
  mockPrisma.$links.rows = SEED_LINKS.map((r) => ({ ...r }))
  mockPrisma.$calls.deleteMany = 0
  mockPrisma.$calls.createMany = 0
})

const SET = `mutation ($itemId: ID!, $recipeIds: [ID!]!) {
  setItemRecipes(itemId: $itemId, recipeIds: $recipeIds) { id items { itemId defaultAmount } }
}`

async function setRecipes(itemId: string, recipeIds: string[], userId = OWNER) {
  const response = await server.executeOperation(
    { query: SET, variables: { itemId, recipeIds } },
    { contextValue: { userId } },
  )
  if (response.body.kind !== 'single') throw new Error('expected a single result')
  return response.body.singleResult
}

const allLinks = () =>
  mockPrisma.$links.rows.map((r) => `${r.recipeId}:${r.itemId}:${r.defaultAmount}`).sort()
const SEED = SEED_LINKS.map((r) => `${r.recipeId}:${r.itemId}:${r.defaultAmount}`).sort()
const returnedIds = (result: Awaited<ReturnType<typeof setRecipes>>) =>
  ((result.data?.setItemRecipes ?? []) as { id: string }[]).map((r) => r.id).sort()
const code = (result: Awaited<ReturnType<typeof setRecipes>>) => result.errors?.[0]?.extensions?.code

describe('setItemRecipes', () => {
  it('user can add an item to two recipes and remove it from one in one save', async () => {
    // Given FLOUR is in CAKE (and in another household's recipe, a pre-#273 row)
    // When the user saves FLOUR's recipes as SOUP and BREAD
    const result = await setRecipes(FLOUR, [SOUP, BREAD])

    // Then FLOUR leaves CAKE and joins SOUP and BREAD with its consumeAmount
    expect(result.errors).toBeUndefined()
    expect(allLinks()).toEqual(
      [
        `${BREAD}:${FLOUR}:2`,
        `${CAKE}:${CUPS}:1`,
        `${SOUP}:${FLOUR}:2`,
        // the other household's recipe is not touched
        `${THEIR_RECIPE}:${FLOUR}:1`,
      ].sort(),
    )
    // And the answer is the three recipes that changed
    expect(returnedIds(result)).toEqual([BREAD, CAKE, SOUP].sort())
  })

  it('user who adds an item with consumeAmount 0 gives it an amount of 1', async () => {
    const result = await setRecipes(SALT, [SOUP])

    expect(result.errors).toBeUndefined()
    expect(mockPrisma.$links.rows.find((r) => r.recipeId === SOUP && r.itemId === SALT)?.defaultAmount).toBe(1)
  })

  it('user who keeps a recipe keeps its amount', async () => {
    // Given CAKE holds FLOUR with amount 5 (FLOUR's consumeAmount is 2)
    // When the user saves CAKE and SOUP
    const result = await setRecipes(FLOUR, [CAKE, SOUP])

    // Then CAKE keeps 5, SOUP gets 2, and only SOUP is returned
    expect(result.errors).toBeUndefined()
    expect(allLinks()).toEqual(
      [`${CAKE}:${CUPS}:1`, `${CAKE}:${FLOUR}:5`, `${SOUP}:${FLOUR}:2`, `${THEIR_RECIPE}:${FLOUR}:1`].sort(),
    )
    expect(returnedIds(result)).toEqual([SOUP])
  })

  it('user who saves the same list again writes nothing and gets an empty answer', async () => {
    const result = await setRecipes(FLOUR, [CAKE])

    expect(result.errors).toBeUndefined()
    expect(returnedIds(result)).toEqual([])
    expect(allLinks()).toEqual(SEED)
    expect(mockPrisma.$calls).toEqual({ deleteMany: 0, createMany: 0 })
  })

  it('a repeated recipe id is folded into one link (negative control)', async () => {
    // Negative control: `skipDuplicates` would also stop the second row, so
    // this passes with or without the fold. It pins that a repeat is not an
    // error.
    const result = await setRecipes(FLOUR, [CAKE, SOUP, SOUP])

    expect(result.errors).toBeUndefined()
    expect(mockPrisma.$links.rows.filter((r) => r.recipeId === SOUP && r.itemId === FLOUR)).toHaveLength(1)
    expect(returnedIds(result)).toEqual([SOUP])
  })

  it('a link made by another save at the same moment does not fail the save', async () => {
    // Given another save added FLOUR to SOUP after this save read the links
    const fake = mockPrisma.recipeItem
    const realFindMany = fake.findMany
    fake.findMany = async (args) => {
      const rows = await realFindMany(args)
      mockPrisma.$links.rows.push({ recipeId: SOUP, itemId: FLOUR, defaultAmount: 7 })
      fake.findMany = realFindMany
      return rows
    }

    // When this save adds FLOUR to SOUP too
    const result = await setRecipes(FLOUR, [CAKE, SOUP])

    // Then it succeeds (no P2002) and the other save's row stays
    expect(result.errors).toBeUndefined()
    expect(mockPrisma.$links.rows.filter((r) => r.recipeId === SOUP && r.itemId === FLOUR)).toEqual([
      { recipeId: SOUP, itemId: FLOUR, defaultAmount: 7 },
    ])
  })

  describe('refusals write nothing', () => {
    it('household member cannot set an item\'s recipes', async () => {
      const result = await setRecipes(FLOUR, [SOUP], MEMBER)

      expect(code(result)).toBe('FORBIDDEN')
      expect(allLinks()).toEqual(SEED)
    })

    it('an unknown item gives NOT_FOUND', async () => {
      const result = await setRecipes('item_gone', [SOUP])

      expect(code(result)).toBe('NOT_FOUND')
      expect(allLinks()).toEqual(SEED)
    })

    it('another household\'s item gives NOT_FOUND, the same as an unknown item', async () => {
      const result = await setRecipes(THEIR_ITEM, [SOUP])

      expect(code(result)).toBe('NOT_FOUND')
      expect(allLinks()).toEqual(SEED)
    })

    it('another household\'s recipe gives FORBIDDEN', async () => {
      const result = await setRecipes(FLOUR, [CAKE, THEIR_RECIPE])

      expect(code(result)).toBe('FORBIDDEN')
      expect(allLinks()).toEqual(SEED)
    })

    it('an unknown recipe gives BAD_USER_INPUT', async () => {
      const result = await setRecipes(FLOUR, [CAKE, 'recipe_gone'])

      expect(code(result)).toBe('BAD_USER_INPUT')
      expect(allLinks()).toEqual(SEED)
    })
  })

  describe('non-consumable items', () => {
    it('user cannot add a non-consumable item to a recipe, and the remove in the same save is not done', async () => {
      // Given CUPS (not consumable) is in CAKE through an old link
      // When the user saves SOUP only: add SOUP, remove CAKE
      const result = await setRecipes(CUPS, [SOUP])

      // Then it is refused, and CAKE still holds CUPS
      expect(code(result)).toBe('BAD_USER_INPUT')
      expect(result.errors?.[0]?.extensions?.reason).toBe('NOT_CONSUMABLE')
      expect(allLinks()).toEqual(SEED)
    })

    it('user can remove a non-consumable item from its old recipe', async () => {
      const result = await setRecipes(CUPS, [])

      expect(result.errors).toBeUndefined()
      expect(allLinks()).toEqual([`${CAKE}:${FLOUR}:5`, `${THEIR_RECIPE}:${FLOUR}:1`])
      expect(returnedIds(result)).toEqual([CAKE])
    })
  })

  it('a failure while adding rolls back the remove', async () => {
    // Given the add fails once
    const fake = mockPrisma.recipeItem
    const realCreateMany = fake.createMany
    fake.createMany = async () => {
      fake.createMany = realCreateMany
      throw new Error('boom')
    }

    // When the user moves FLOUR from CAKE to SOUP
    const result = await setRecipes(FLOUR, [SOUP])

    // Then the save fails and CAKE still holds FLOUR
    expect(result.errors).toBeDefined()
    expect(allLinks()).toEqual(SEED)
  })
})
