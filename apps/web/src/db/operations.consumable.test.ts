import { beforeEach, describe, expect, it } from 'vitest'
import type { ExportPayload } from '@/lib/exportData'
import { importLocalData } from '@/lib/importData'
import { NotConsumableError } from '@/lib/recipeConsumables'
import { addRecipeWithOldLinks } from '@/test/oldRecipeLinks'
import { DEFAULT_LOCATION_ID, type PantryItem } from '@/types'
import { db } from './index'
import {
  applyShelfFilterPicksBatch,
  applyUnitSwitchBatch,
  consumeRecipesBatch,
  createItem,
  createRecipe,
  updateItem,
  updateRecipe,
} from './operations'

// Only consumable items can be in a recipe (owner decision 2026-11-26).
// Local mode keeps the same rules as the server
// (`apps/server/src/lib/consumable.ts`):
//
// | Write | A non-consumable item |
// |---|---|
// | `createRecipe`, `updateRecipe`, `applyShelfFilterPicksBatch`, `applyUnitSwitchBatch`'s recipe lists | refused, `NotConsumableError`, nothing written |
// | `consumeRecipesBatch` | refused |
// | `importLocalData` | its recipe links are dropped |
// | `updateItem`, `applyUnitSwitchBatch` turning an item off | its links are deleted |
//
// Every fixture has a consumable item AND a non-consumable one, and two
// recipes, so code that drops every link, or ignores the flag, gives a
// different store.

async function clearAll() {
  await db.items.clear()
  await db.itemStocks.clear()
  await db.recipes.clear()
  await db.inventoryLogs.clear()
}

const makeItem = (name: string, consumable: boolean): Promise<PantryItem> =>
  createItem({
    name,
    tagIds: [],
    targetUnit: 'package',
    targetQuantity: 2,
    refillThreshold: 1,
    packedQuantity: 3,
    unpackedQuantity: 0,
    consumeAmount: 1,
    ...(consumable ? {} : { consumable: false }),
  })

const linkIds = async (recipeId: string) =>
  ((await db.recipes.get(recipeId))?.items ?? []).map((ri) => ri.itemId).sort()

let flour: PantryItem
let eggs: PantryItem
let cups: PantryItem

beforeEach(async () => {
  await clearAll()
  flour = await makeItem('Flour', true)
  eggs = await makeItem('Eggs', true)
  cups = await makeItem('Cups', false)
})

describe('recipe writes and non-consumable items (local)', () => {
  it('user cannot create a recipe with a non-consumable item', async () => {
    await expect(
      createRecipe({
        name: 'Tea',
        items: [
          { itemId: flour.id, defaultAmount: 1 },
          { itemId: cups.id, defaultAmount: 1 },
        ],
      }),
    ).rejects.toBeInstanceOf(NotConsumableError)
    expect(await db.recipes.count()).toBe(0)
  })

  it('user cannot add a non-consumable item to a recipe', async () => {
    const recipe = await createRecipe({
      name: 'Cake',
      items: [{ itemId: flour.id, defaultAmount: 1 }],
    })

    await expect(
      updateRecipe(recipe.id, {
        items: [
          { itemId: flour.id, defaultAmount: 1 },
          { itemId: cups.id, defaultAmount: 1 },
        ],
      }),
    ).rejects.toBeInstanceOf(NotConsumableError)
    expect(await linkIds(recipe.id)).toEqual([flour.id])
  })

  it('user editing a recipe with an old link to a non-consumable item is not refused', async () => {
    // Given a recipe that holds an old link, from before the rule
    const recipe = await addRecipeWithOldLinks({
      name: 'Cake',
      items: [
        { itemId: flour.id, defaultAmount: 1 },
        { itemId: cups.id, defaultAmount: 1 },
      ],
    })

    // When the user changes another amount and the list still names it
    await updateRecipe(recipe.id, {
      items: [
        { itemId: flour.id, defaultAmount: 3 },
        { itemId: cups.id, defaultAmount: 1 },
      ],
    })

    // Then the save works
    expect((await db.recipes.get(recipe.id))?.items[0]?.defaultAmount).toBe(3)
  })

  it('user cannot join a non-consumable item to a filter shelf through its recipe axis', async () => {
    const recipe = await createRecipe({ name: 'Cake', items: [] })

    await expect(
      applyShelfFilterPicksBatch({
        itemId: cups.id,
        addTagIds: ['tag-x'],
        addVendorIds: [],
        addRecipeId: recipe.id,
      }),
    ).rejects.toBeInstanceOf(NotConsumableError)
    // Nothing written: no link, and the tag write rolled back too
    expect(await linkIds(recipe.id)).toEqual([])
    expect((await db.items.get(cups.id))?.tagIds).toEqual([])
  })

  it('user cannot cook a non-consumable item, and nothing is written', async () => {
    await expect(
      consumeRecipesBatch({
        occurredAt: new Date(),
        recipeIds: [],
        items: [
          {
            itemId: flour.id,
            packedQuantity: 2,
            unpackedQuantity: 0,
            delta: -1,
            quantity: 2,
          },
          {
            itemId: cups.id,
            packedQuantity: 2,
            unpackedQuantity: 0,
            delta: -1,
            quantity: 2,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(NotConsumableError)
    expect(await db.inventoryLogs.count()).toBe(0)
    const flourStock = await db.itemStocks
      .where('[itemId+locationId]')
      .equals([flour.id, DEFAULT_LOCATION_ID])
      .first()
    expect(flourStock?.packedQuantity).toBe(3)
  })
})

describe('turning an item non-consumable (local)', () => {
  let cake: string
  let soup: string

  beforeEach(async () => {
    cake = (
      await createRecipe({
        name: 'Cake',
        items: [
          { itemId: flour.id, defaultAmount: 1 },
          { itemId: eggs.id, defaultAmount: 2 },
        ],
      })
    ).id
    soup = (
      await createRecipe({
        name: 'Soup',
        items: [{ itemId: flour.id, defaultAmount: 1 }],
      })
    ).id
  })

  it('user who turns Consumable off removes the item from every recipe', async () => {
    await updateItem(flour.id, { consumable: false })

    expect((await db.items.get(flour.id))?.consumable).toBe(false)
    expect(await linkIds(cake)).toEqual([eggs.id])
    expect(await linkIds(soup)).toEqual([])
  })

  it('a save that leaves Consumable on keeps the recipe links', async () => {
    // Negative control: a rename removes nothing
    await updateItem(flour.id, { name: 'Rye flour' })

    expect(await linkIds(cake)).toEqual([eggs.id, flour.id].sort())
    expect(await linkIds(soup)).toEqual([flour.id])
  })

  it('user who turns Consumable off through the stock dialog removes the item from every recipe', async () => {
    // The "Update stock numbers?" dialog saves through applyUnitSwitchBatch
    await applyUnitSwitchBatch({
      itemId: flour.id,
      updates: { consumable: false },
      stockConversions: [],
      recipeUpdates: [],
    })

    expect(await linkIds(cake)).toEqual([eggs.id])
    expect(await linkIds(soup)).toEqual([])
  })

  it('a unit switch cannot attach a non-consumable item to a recipe', async () => {
    await expect(
      applyUnitSwitchBatch({
        itemId: flour.id,
        updates: { consumeAmount: 2 },
        stockConversions: [],
        recipeUpdates: [
          {
            recipeId: soup,
            items: [
              { itemId: flour.id, defaultAmount: 2 },
              { itemId: cups.id, defaultAmount: 1 },
            ],
          },
        ],
      }),
    ).rejects.toBeInstanceOf(NotConsumableError)
    expect((await db.items.get(flour.id))?.consumeAmount).toBe(1)
    expect(await linkIds(soup)).toEqual([flour.id])
  })
})

describe('import and non-consumable items (local)', () => {
  // All three strategies: each has its own exit in `importLocalData`.
  it.each([
    'skip',
    'replace',
    'clear',
  ] as const)('user importing a recipe that names a non-consumable item gets the recipe without it (%s)', async (strategy) => {
    const now = new Date()
    // The items travel in the file too, so `clear` still has them
    const items = await db.items.toArray()
    const payload: ExportPayload = {
      version: 1,
      exportedAt: now.toISOString(),
      items,
      tags: [],
      tagTypes: [],
      vendors: [],
      recipes: [
        {
          id: 'recipe-imported',
          name: 'Tea',
          items: [
            { itemId: flour.id, defaultAmount: 1 },
            { itemId: cups.id, defaultAmount: 1 },
          ],
          createdAt: now,
          updatedAt: now,
        },
      ],
      inventoryLogs: [],
      shoppingCarts: [],
      cartItems: [],
      shelves: [],
      itemStocks: [],
      locations: [],
    }

    // Skipped, not refused: the recipe lands with its consumable item
    await importLocalData(payload, strategy)

    expect(await linkIds('recipe-imported')).toEqual([flour.id])
    expect((await db.items.get(cups.id))?.consumable).toBe(false)
  })
})
