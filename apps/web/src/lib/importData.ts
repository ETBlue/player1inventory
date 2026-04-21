import type { ApolloClient } from '@apollo/client'
import { db } from '@/db'
import {
  AllCartItemsDocument,
  type AllCartItemsQuery,
  BulkCreateCartItemsDocument,
  BulkCreateInventoryLogsDocument,
  BulkCreateItemsDocument,
  BulkCreateRecipesDocument,
  BulkCreateShelvesDocument,
  BulkCreateShoppingCartsDocument,
  BulkCreateTagsDocument,
  BulkCreateTagTypesDocument,
  BulkCreateVendorsDocument,
  BulkUpsertCartItemsDocument,
  BulkUpsertInventoryLogsDocument,
  BulkUpsertItemsDocument,
  BulkUpsertRecipesDocument,
  BulkUpsertShelvesDocument,
  BulkUpsertShoppingCartsDocument,
  BulkUpsertTagsDocument,
  BulkUpsertTagTypesDocument,
  BulkUpsertVendorsDocument,
  ClearAllDataDocument,
  GetItemsDocument,
  type GetItemsQuery,
  GetRecipesDocument,
  type GetRecipesQuery,
  GetShelvesDocument,
  type GetShelvesQuery,
  GetTagsDocument,
  type GetTagsQuery,
  GetTagTypesDocument,
  type GetTagTypesQuery,
  GetVendorsDocument,
  type GetVendorsQuery,
  InventoryLogsDocument,
  type InventoryLogsQuery,
  ShoppingCartsDocument,
  type ShoppingCartsQuery,
} from '@/generated/graphql'
import type {
  CartItem,
  InventoryLog,
  Item,
  Recipe,
  Shelf,
  ShoppingCart,
  Tag,
  TagType,
  Vendor,
} from '@/types'
import type { ExportPayload } from './exportData'

export type ImportStrategy = 'skip' | 'replace' | 'clear'

// Convert item date fields from ISO strings (as stored in JSON) to Date objects.
function deserializeItem(item: Item): Item {
  const result: Item = {
    ...item,
    createdAt:
      item.createdAt instanceof Date
        ? item.createdAt
        : new Date(item.createdAt as unknown as string),
    updatedAt:
      item.updatedAt instanceof Date
        ? item.updatedAt
        : new Date(item.updatedAt as unknown as string),
  }
  if (item.dueDate !== null && item.dueDate !== undefined) {
    result.dueDate =
      item.dueDate instanceof Date
        ? item.dueDate
        : new Date(item.dueDate as string)
  } else {
    delete result.dueDate
  }
  if (item.estimatedDueDays !== null && item.estimatedDueDays !== undefined) {
    result.estimatedDueDays = item.estimatedDueDays
  } else {
    delete result.estimatedDueDays
  }
  if (
    item.expirationThreshold !== null &&
    item.expirationThreshold !== undefined
  ) {
    result.expirationThreshold = item.expirationThreshold
  } else {
    delete result.expirationThreshold
  }
  return result
}

// ---------------------------------------------------------------------------
// Batching helpers
// ---------------------------------------------------------------------------

const BATCH_SIZE = 50

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size))
  }
  return result
}

export interface ImportProgress {
  completedBatches: number
  totalBatches: number
  currentEntity: string
}

export interface ImportSession {
  payload: ExportPayload
  strategy: ImportStrategy
  completedBatchKeys: Set<string> // key format: `${entityType}:${batchIndex}`
}

// ---------------------------------------------------------------------------
// GraphQL Input mappers — strip server-only fields (__typename, userId,
// familyId) and any other fields not accepted by the corresponding Input type.
// These are used before passing payload objects as GraphQL mutation variables.
// ---------------------------------------------------------------------------

export function toItemInput(item: Record<string, unknown>) {
  const createdAt =
    item.createdAt instanceof Date
      ? item.createdAt.toISOString()
      : (item.createdAt as string)
  const updatedAt =
    item.updatedAt instanceof Date
      ? item.updatedAt.toISOString()
      : (item.updatedAt as string)
  return {
    id: item.id as string,
    name: item.name as string,
    tagIds: (item.tagIds ?? []) as string[],
    vendorIds: item.vendorIds as string[] | undefined,
    packageUnit: item.packageUnit as string | undefined,
    measurementUnit: item.measurementUnit as string | undefined,
    amountPerPackage: item.amountPerPackage as number | undefined,
    targetUnit: item.targetUnit as string,
    targetQuantity: item.targetQuantity as number,
    refillThreshold: item.refillThreshold as number,
    packedQuantity: item.packedQuantity as number,
    unpackedQuantity: item.unpackedQuantity as number,
    consumeAmount: item.consumeAmount as number,
    dueDate: item.dueDate as string | undefined,
    estimatedDueDays: item.estimatedDueDays as number | undefined,
    expirationThreshold: item.expirationThreshold as number | undefined,
    expirationMode: item.expirationMode as string | undefined,
    createdAt,
    updatedAt,
  }
}

export function toTagInput(tag: Record<string, unknown>) {
  return {
    id: tag.id as string,
    name: tag.name as string,
    typeId: tag.typeId as string,
    parentId: tag.parentId as string | undefined,
  }
}

export function toTagTypeInput(tagType: Record<string, unknown>) {
  return {
    id: tagType.id as string,
    name: tagType.name as string,
    color: tagType.color as string,
  }
}

export function toVendorInput(vendor: Record<string, unknown>) {
  return {
    id: vendor.id as string,
    name: vendor.name as string,
  }
}

export function toRecipeInput(recipe: Record<string, unknown>) {
  return {
    id: recipe.id as string,
    name: recipe.name as string,
    items: ((recipe.items ?? []) as Array<Record<string, unknown>>).map(
      (ri) => ({
        itemId: ri.itemId as string,
        defaultAmount: ri.defaultAmount as number,
      }),
    ),
    lastCookedAt: recipe.lastCookedAt as string | undefined,
  }
}

export function toInventoryLogInput(log: Record<string, unknown>) {
  const occurredAt =
    log.occurredAt instanceof Date
      ? log.occurredAt.toISOString()
      : (log.occurredAt as string)
  return {
    id: log.id as string,
    itemId: log.itemId as string,
    delta: log.delta as number,
    quantity: log.quantity as number,
    occurredAt,
    note: log.note as string | undefined,
  }
}

export function toShoppingCartInput(cart: Record<string, unknown>) {
  const createdAt =
    cart.createdAt instanceof Date
      ? cart.createdAt.toISOString()
      : (cart.createdAt as string)
  return {
    id: cart.id as string,
    status: cart.status as string,
    createdAt,
    completedAt: cart.completedAt as string | undefined,
  }
}

export function toCartItemInput(cartItem: Record<string, unknown>) {
  return {
    id: cartItem.id as string,
    cartId: cartItem.cartId as string,
    itemId: cartItem.itemId as string,
    quantity: cartItem.quantity as number,
  }
}

export function toShelfInput(shelf: Record<string, unknown>) {
  const createdAt =
    shelf.createdAt instanceof Date
      ? shelf.createdAt.toISOString()
      : (shelf.createdAt as string)
  const updatedAt =
    shelf.updatedAt instanceof Date
      ? shelf.updatedAt.toISOString()
      : (shelf.updatedAt as string)
  return {
    id: shelf.id as string,
    name: shelf.name as string,
    type: shelf.type as string,
    order: shelf.order as number,
    sortBy: shelf.sortBy as string | undefined,
    sortDir: shelf.sortDir as string | undefined,
    filterConfig: shelf.filterConfig as
      | { tagIds?: string[]; vendorIds?: string[]; recipeIds?: string[] }
      | undefined,
    itemIds: shelf.itemIds as string[] | undefined,
    createdAt,
    updatedAt,
  }
}

export interface ConflictEntry {
  id: string
  name: string
  matchReasons: ('id' | 'name')[]
}

export interface ConflictSummary {
  items: ConflictEntry[]
  tags: ConflictEntry[]
  tagTypes: ConflictEntry[]
  vendors: ConflictEntry[]
  recipes: ConflictEntry[]
  inventoryLogs: ConflictEntry[]
  shoppingCarts: ConflictEntry[]
  cartItems: ConflictEntry[]
  shelves: ConflictEntry[]
}

export interface ExistingData {
  items: Item[]
  tags: Tag[]
  tagTypes: TagType[]
  vendors: Vendor[]
  recipes: Recipe[]
  inventoryLogs: InventoryLog[]
  shoppingCarts: ShoppingCart[]
  cartItems: CartItem[]
  shelves: Shelf[]
}

// Entities that have a meaningful "name" field for conflict detection
type NamedEntity = { id: string; name: string }
// Entities that only have an id (no name to match by)
type IdOnlyEntity = { id: string }

function detectNamedConflicts(
  incoming: NamedEntity[],
  existing: NamedEntity[],
): ConflictEntry[] {
  const existingById = new Map(existing.map((e) => [e.id, e]))
  const existingByName = new Map(existing.map((e) => [e.name.toLowerCase(), e]))

  const conflicts: ConflictEntry[] = []

  for (const entry of incoming) {
    const matchReasons: ('id' | 'name')[] = []

    if (existingById.has(entry.id)) {
      matchReasons.push('id')
    }
    if (existingByName.has(entry.name.toLowerCase())) {
      matchReasons.push('name')
    }

    if (matchReasons.length > 0) {
      conflicts.push({ id: entry.id, name: entry.name, matchReasons })
    }
  }

  return conflicts
}

// Tags have an additional conflict dimension: a changed parentId means the tag
// is being moved to a different parent. This function extends the standard
// id/name conflict check so that a tag whose parentId differs from the stored
// record is also flagged, even when id and name would not otherwise conflict.
function detectNamedTagConflicts(
  incoming: Tag[],
  existing: Tag[],
): ConflictEntry[] {
  const existingById = new Map(existing.map((e) => [e.id, e]))
  const existingByName = new Map(existing.map((e) => [e.name.toLowerCase(), e]))

  const conflicts: ConflictEntry[] = []

  for (const entry of incoming) {
    const matchReasons: ('id' | 'name')[] = []

    const existingRecord = existingById.get(entry.id)
    if (existingRecord) {
      matchReasons.push('id')
    }

    if (existingByName.has(entry.name.toLowerCase())) {
      matchReasons.push('name')
    }

    // A parentId change (tag reparented) is treated as a conflict even when
    // the id and name checks would not surface it on their own.
    if (
      existingRecord &&
      existingRecord.parentId !== entry.parentId &&
      !matchReasons.includes('id')
    ) {
      matchReasons.push('id')
    }

    if (matchReasons.length > 0) {
      conflicts.push({ id: entry.id, name: entry.name, matchReasons })
    }
  }

  return conflicts
}

function detectIdOnlyConflicts(
  incoming: IdOnlyEntity[],
  existing: IdOnlyEntity[],
  getLabel: (entry: IdOnlyEntity) => string,
): ConflictEntry[] {
  const existingIds = new Set(existing.map((e) => e.id))
  const conflicts: ConflictEntry[] = []

  for (const entry of incoming) {
    if (existingIds.has(entry.id)) {
      conflicts.push({
        id: entry.id,
        name: getLabel(entry),
        matchReasons: ['id'],
      })
    }
  }

  return conflicts
}

export function detectConflicts(
  payload: ExportPayload,
  existing: ExistingData,
): ConflictSummary {
  return {
    items: detectNamedConflicts(payload.items as NamedEntity[], existing.items),
    tags: detectNamedTagConflicts(payload.tags as Tag[], existing.tags),
    tagTypes: detectNamedConflicts(
      payload.tagTypes as NamedEntity[],
      existing.tagTypes,
    ),
    vendors: detectNamedConflicts(
      payload.vendors as NamedEntity[],
      existing.vendors,
    ),
    recipes: detectNamedConflicts(
      payload.recipes as NamedEntity[],
      existing.recipes,
    ),
    inventoryLogs: detectIdOnlyConflicts(
      payload.inventoryLogs as IdOnlyEntity[],
      existing.inventoryLogs,
      (e) => (e as InventoryLog).id,
    ),
    shoppingCarts: detectIdOnlyConflicts(
      payload.shoppingCarts as IdOnlyEntity[],
      existing.shoppingCarts,
      (e) => (e as ShoppingCart).id,
    ),
    cartItems: detectIdOnlyConflicts(
      payload.cartItems as IdOnlyEntity[],
      existing.cartItems,
      (e) => (e as CartItem).id,
    ),
    shelves: detectIdOnlyConflicts(
      (payload.shelves ?? []) as IdOnlyEntity[],
      existing.shelves,
      (e) => (e as Shelf).id,
    ),
  }
}

export function hasConflicts(summary: ConflictSummary): boolean {
  return (
    summary.items.length > 0 ||
    summary.tags.length > 0 ||
    summary.tagTypes.length > 0 ||
    summary.vendors.length > 0 ||
    summary.recipes.length > 0 ||
    summary.inventoryLogs.length > 0 ||
    summary.shoppingCarts.length > 0 ||
    summary.cartItems.length > 0 ||
    summary.shelves.length > 0
  )
}

function emptyPayload(): ExportPayload {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    items: [],
    tags: [],
    tagTypes: [],
    vendors: [],
    recipes: [],
    inventoryLogs: [],
    shoppingCarts: [],
    cartItems: [],
    shelves: [],
  }
}

function getConflictIds(entries: ConflictEntry[]): Set<string> {
  return new Set(entries.map((e) => e.id))
}

export function partitionPayload(
  payload: ExportPayload,
  conflicts: ConflictSummary,
  strategy: ImportStrategy,
): { toCreate: ExportPayload; toUpsert: ExportPayload } {
  if (strategy === 'clear') {
    // All entities go to toCreate; toUpsert is empty
    return {
      toCreate: { ...payload },
      toUpsert: emptyPayload(),
    }
  }

  if (strategy === 'skip') {
    // Non-conflicting entities go to toCreate; toUpsert is empty
    const conflictIdSets = {
      items: getConflictIds(conflicts.items),
      tags: getConflictIds(conflicts.tags),
      tagTypes: getConflictIds(conflicts.tagTypes),
      vendors: getConflictIds(conflicts.vendors),
      recipes: getConflictIds(conflicts.recipes),
      inventoryLogs: getConflictIds(conflicts.inventoryLogs),
      shoppingCarts: getConflictIds(conflicts.shoppingCarts),
      cartItems: getConflictIds(conflicts.cartItems),
      shelves: getConflictIds(conflicts.shelves),
    }

    return {
      toCreate: {
        ...payload,
        items: (payload.items as IdOnlyEntity[]).filter(
          (e) => !conflictIdSets.items.has(e.id),
        ),
        tags: (payload.tags as IdOnlyEntity[]).filter(
          (e) => !conflictIdSets.tags.has(e.id),
        ),
        tagTypes: (payload.tagTypes as IdOnlyEntity[]).filter(
          (e) => !conflictIdSets.tagTypes.has(e.id),
        ),
        vendors: (payload.vendors as IdOnlyEntity[]).filter(
          (e) => !conflictIdSets.vendors.has(e.id),
        ),
        recipes: (payload.recipes as IdOnlyEntity[]).filter(
          (e) => !conflictIdSets.recipes.has(e.id),
        ),
        inventoryLogs: (payload.inventoryLogs as IdOnlyEntity[]).filter(
          (e) => !conflictIdSets.inventoryLogs.has(e.id),
        ),
        shoppingCarts: (payload.shoppingCarts as IdOnlyEntity[]).filter(
          (e) => !conflictIdSets.shoppingCarts.has(e.id),
        ),
        cartItems: (payload.cartItems as IdOnlyEntity[]).filter(
          (e) => !conflictIdSets.cartItems.has(e.id),
        ),
        shelves: ((payload.shelves ?? []) as IdOnlyEntity[]).filter(
          (e) => !conflictIdSets.shelves.has(e.id),
        ),
      },
      toUpsert: emptyPayload(),
    }
  }

  // strategy === 'replace'
  // Non-conflicting -> toCreate, conflicting -> toUpsert
  const conflictIdSets = {
    items: getConflictIds(conflicts.items),
    tags: getConflictIds(conflicts.tags),
    tagTypes: getConflictIds(conflicts.tagTypes),
    vendors: getConflictIds(conflicts.vendors),
    recipes: getConflictIds(conflicts.recipes),
    inventoryLogs: getConflictIds(conflicts.inventoryLogs),
    shoppingCarts: getConflictIds(conflicts.shoppingCarts),
    cartItems: getConflictIds(conflicts.cartItems),
    shelves: getConflictIds(conflicts.shelves),
  }

  return {
    toCreate: {
      ...payload,
      items: (payload.items as IdOnlyEntity[]).filter(
        (e) => !conflictIdSets.items.has(e.id),
      ),
      tags: (payload.tags as IdOnlyEntity[]).filter(
        (e) => !conflictIdSets.tags.has(e.id),
      ),
      tagTypes: (payload.tagTypes as IdOnlyEntity[]).filter(
        (e) => !conflictIdSets.tagTypes.has(e.id),
      ),
      vendors: (payload.vendors as IdOnlyEntity[]).filter(
        (e) => !conflictIdSets.vendors.has(e.id),
      ),
      recipes: (payload.recipes as IdOnlyEntity[]).filter(
        (e) => !conflictIdSets.recipes.has(e.id),
      ),
      inventoryLogs: (payload.inventoryLogs as IdOnlyEntity[]).filter(
        (e) => !conflictIdSets.inventoryLogs.has(e.id),
      ),
      shoppingCarts: (payload.shoppingCarts as IdOnlyEntity[]).filter(
        (e) => !conflictIdSets.shoppingCarts.has(e.id),
      ),
      cartItems: (payload.cartItems as IdOnlyEntity[]).filter(
        (e) => !conflictIdSets.cartItems.has(e.id),
      ),
      shelves: ((payload.shelves ?? []) as IdOnlyEntity[]).filter(
        (e) => !conflictIdSets.shelves.has(e.id),
      ),
    },
    toUpsert: {
      ...payload,
      items: (payload.items as IdOnlyEntity[]).filter((e) =>
        conflictIdSets.items.has(e.id),
      ),
      tags: (payload.tags as IdOnlyEntity[]).filter((e) =>
        conflictIdSets.tags.has(e.id),
      ),
      tagTypes: (payload.tagTypes as IdOnlyEntity[]).filter((e) =>
        conflictIdSets.tagTypes.has(e.id),
      ),
      vendors: (payload.vendors as IdOnlyEntity[]).filter((e) =>
        conflictIdSets.vendors.has(e.id),
      ),
      recipes: (payload.recipes as IdOnlyEntity[]).filter((e) =>
        conflictIdSets.recipes.has(e.id),
      ),
      inventoryLogs: (payload.inventoryLogs as IdOnlyEntity[]).filter((e) =>
        conflictIdSets.inventoryLogs.has(e.id),
      ),
      shoppingCarts: (payload.shoppingCarts as IdOnlyEntity[]).filter((e) =>
        conflictIdSets.shoppingCarts.has(e.id),
      ),
      cartItems: (payload.cartItems as IdOnlyEntity[]).filter((e) =>
        conflictIdSets.cartItems.has(e.id),
      ),
      shelves: ((payload.shelves ?? []) as IdOnlyEntity[]).filter((e) =>
        conflictIdSets.shelves.has(e.id),
      ),
    },
  }
}

export async function fetchExistingData(options: {
  mode: 'local' | 'cloud'
  client?: ApolloClient
}): Promise<ExistingData> {
  if (options.mode === 'cloud' && options.client) {
    return fetchCloudExistingData(options.client)
  }
  return fetchLocalExistingData()
}

async function fetchLocalExistingData(): Promise<ExistingData> {
  const [
    items,
    tags,
    tagTypes,
    vendors,
    recipes,
    inventoryLogs,
    shoppingCarts,
    cartItems,
    shelves,
  ] = await Promise.all([
    db.items.toArray(),
    db.tags.toArray(),
    db.tagTypes.toArray(),
    db.vendors.toArray(),
    db.recipes.toArray(),
    db.inventoryLogs.toArray(),
    db.shoppingCarts.toArray(),
    db.cartItems.toArray(),
    db.shelves.toArray(),
  ])

  return {
    items,
    tags,
    tagTypes,
    vendors,
    recipes,
    inventoryLogs,
    shoppingCarts,
    cartItems,
    shelves,
  }
}

export async function importLocalData(
  payload: ExportPayload,
  strategy: ImportStrategy,
): Promise<void> {
  if (strategy === 'clear') {
    // Delete all tables in dependency order (children before parents)
    await db.shelves.clear()
    await db.cartItems.clear()
    await db.shoppingCarts.clear()
    await db.inventoryLogs.clear()
    await db.tags.clear()
    await db.tagTypes.clear()
    await db.recipes.clear()
    await db.vendors.clear()
    await db.items.clear()

    // Bulk add all entities in reverse order (parents before children)
    await db.items.bulkAdd((payload.items as Item[]).map(deserializeItem))
    await db.vendors.bulkAdd(payload.vendors as Vendor[])
    await db.recipes.bulkAdd(payload.recipes as Recipe[])
    await db.tagTypes.bulkAdd(payload.tagTypes as TagType[])
    await db.tags.bulkAdd(payload.tags as Tag[])
    await db.inventoryLogs.bulkAdd(
      (payload.inventoryLogs as InventoryLog[]).map((log) => ({
        ...log,
        occurredAt:
          log.occurredAt instanceof Date
            ? log.occurredAt
            : new Date(log.occurredAt as unknown as string),
      })),
    )
    await db.shoppingCarts.bulkAdd(payload.shoppingCarts as ShoppingCart[])
    await db.cartItems.bulkAdd(payload.cartItems as CartItem[])
    await db.shelves.bulkAdd(
      ((payload.shelves ?? []) as Shelf[]).map((s) => ({
        ...s,
        createdAt:
          s.createdAt instanceof Date
            ? s.createdAt
            : new Date(s.createdAt as unknown as string),
        updatedAt:
          s.updatedAt instanceof Date
            ? s.updatedAt
            : new Date(s.updatedAt as unknown as string),
      })),
    )
    return
  }

  const existing = await fetchLocalExistingData()
  const conflicts = detectConflicts(payload, existing)

  if (strategy === 'skip') {
    const { toCreate } = partitionPayload(payload, conflicts, 'skip')

    await db.items.bulkAdd((toCreate.items as Item[]).map(deserializeItem), {
      allKeys: false,
    })
    await db.vendors.bulkAdd(toCreate.vendors as Vendor[], { allKeys: false })
    await db.recipes.bulkAdd(toCreate.recipes as Recipe[], { allKeys: false })
    await db.tagTypes.bulkAdd(toCreate.tagTypes as TagType[], {
      allKeys: false,
    })
    await db.tags.bulkAdd(toCreate.tags as Tag[], { allKeys: false })
    await db.inventoryLogs.bulkAdd(
      (toCreate.inventoryLogs as InventoryLog[]).map((log) => ({
        ...log,
        occurredAt:
          log.occurredAt instanceof Date
            ? log.occurredAt
            : new Date(log.occurredAt as unknown as string),
      })),
      { allKeys: false },
    )
    await db.shoppingCarts.bulkAdd(toCreate.shoppingCarts as ShoppingCart[], {
      allKeys: false,
    })
    await db.cartItems.bulkAdd(toCreate.cartItems as CartItem[], {
      allKeys: false,
    })
    await db.shelves.bulkAdd(
      ((toCreate.shelves ?? []) as Shelf[]).map((s) => ({
        ...s,
        createdAt:
          s.createdAt instanceof Date
            ? s.createdAt
            : new Date(s.createdAt as unknown as string),
        updatedAt:
          s.updatedAt instanceof Date
            ? s.updatedAt
            : new Date(s.updatedAt as unknown as string),
      })),
      { allKeys: false },
    )
    return
  }

  // strategy === 'replace'
  const { toCreate, toUpsert } = partitionPayload(payload, conflicts, 'replace')

  await db.items.bulkAdd((toCreate.items as Item[]).map(deserializeItem), {
    allKeys: false,
  })
  await db.vendors.bulkAdd(toCreate.vendors as Vendor[], { allKeys: false })
  await db.recipes.bulkAdd(toCreate.recipes as Recipe[], { allKeys: false })
  await db.tagTypes.bulkAdd(toCreate.tagTypes as TagType[], { allKeys: false })
  await db.tags.bulkAdd(toCreate.tags as Tag[], { allKeys: false })
  await db.inventoryLogs.bulkAdd(
    (toCreate.inventoryLogs as InventoryLog[]).map((log) => ({
      ...log,
      occurredAt:
        log.occurredAt instanceof Date
          ? log.occurredAt
          : new Date(log.occurredAt as unknown as string),
    })),
    { allKeys: false },
  )
  await db.shoppingCarts.bulkAdd(toCreate.shoppingCarts as ShoppingCart[], {
    allKeys: false,
  })
  await db.cartItems.bulkAdd(toCreate.cartItems as CartItem[], {
    allKeys: false,
  })
  await db.shelves.bulkAdd(
    ((toCreate.shelves ?? []) as Shelf[]).map((s) => ({
      ...s,
      createdAt:
        s.createdAt instanceof Date
          ? s.createdAt
          : new Date(s.createdAt as unknown as string),
      updatedAt:
        s.updatedAt instanceof Date
          ? s.updatedAt
          : new Date(s.updatedAt as unknown as string),
    })),
    { allKeys: false },
  )

  await db.items.bulkPut((toUpsert.items as Item[]).map(deserializeItem))
  await db.vendors.bulkPut(toUpsert.vendors as Vendor[])
  await db.recipes.bulkPut(toUpsert.recipes as Recipe[])
  await db.tagTypes.bulkPut(toUpsert.tagTypes as TagType[])
  await db.tags.bulkPut(toUpsert.tags as Tag[])
  await db.inventoryLogs.bulkPut(
    (toUpsert.inventoryLogs as InventoryLog[]).map((log) => ({
      ...log,
      occurredAt:
        log.occurredAt instanceof Date
          ? log.occurredAt
          : new Date(log.occurredAt as unknown as string),
    })),
  )
  await db.shoppingCarts.bulkPut(toUpsert.shoppingCarts as ShoppingCart[])
  await db.cartItems.bulkPut(toUpsert.cartItems as CartItem[])
  await db.shelves.bulkPut(
    ((toUpsert.shelves ?? []) as Shelf[]).map((s) => ({
      ...s,
      createdAt:
        s.createdAt instanceof Date
          ? s.createdAt
          : new Date(s.createdAt as unknown as string),
      updatedAt:
        s.updatedAt instanceof Date
          ? s.updatedAt
          : new Date(s.updatedAt as unknown as string),
    })),
  )
}

async function fetchCloudExistingData(
  client: ApolloClient,
): Promise<ExistingData> {
  const fetchPolicy = 'network-only' as const

  const [
    itemsResult,
    tagsResult,
    tagTypesResult,
    vendorsResult,
    recipesResult,
    inventoryLogsResult,
    shoppingCartsResult,
    allCartItemsResult,
    shelvesResult,
  ] = await Promise.all([
    client.query<GetItemsQuery>({ query: GetItemsDocument, fetchPolicy }),
    client.query<GetTagsQuery>({ query: GetTagsDocument, fetchPolicy }),
    client.query<GetTagTypesQuery>({ query: GetTagTypesDocument, fetchPolicy }),
    client.query<GetVendorsQuery>({ query: GetVendorsDocument, fetchPolicy }),
    client.query<GetRecipesQuery>({ query: GetRecipesDocument, fetchPolicy }),
    client.query<InventoryLogsQuery>({
      query: InventoryLogsDocument,
      fetchPolicy,
    }),
    client.query<ShoppingCartsQuery>({
      query: ShoppingCartsDocument,
      fetchPolicy,
    }),
    client.query<AllCartItemsQuery>({
      query: AllCartItemsDocument,
      fetchPolicy,
    }),
    client.query<GetShelvesQuery>({ query: GetShelvesDocument, fetchPolicy }),
  ])

  return {
    items: (itemsResult.data?.items ?? []) as unknown as Item[],
    tags: (tagsResult.data?.tags ?? []) as unknown as Tag[],
    tagTypes: (tagTypesResult.data?.tagTypes ?? []) as unknown as TagType[],
    vendors: (vendorsResult.data?.vendors ?? []) as unknown as Vendor[],
    recipes: (recipesResult.data?.recipes ?? []) as unknown as Recipe[],
    inventoryLogs: (inventoryLogsResult.data?.inventoryLogs ??
      []) as unknown as InventoryLog[],
    shoppingCarts: (shoppingCartsResult.data?.shoppingCarts ??
      []) as unknown as ShoppingCart[],
    cartItems: (allCartItemsResult.data?.allCartItems ??
      []) as unknown as CartItem[],
    shelves: (shelvesResult.data?.shelves ?? []) as unknown as Shelf[],
  }
}

// ---------------------------------------------------------------------------
// Batched bulk create — processes each entity array in chunks of BATCH_SIZE.
// Skips batches already recorded in session.completedBatchKeys.
// Calls onProgress after each successful batch.
// Entity order: tagTypes → tags → vendors → items → recipes → inventoryLogs →
//               shoppingCarts → cartItems
// ---------------------------------------------------------------------------

interface BatchedBulkArgs {
  client: ApolloClient
  data: ExportPayload
  session: ImportSession
  onProgress: (p: ImportProgress) => void
  startCompleted: number
  totalBatches: number
}

async function bulkCreate(args: BatchedBulkArgs): Promise<number> {
  const { client, data, session, onProgress, totalBatches } = args
  let completedBatches = args.startCompleted

  const entityGroups: Array<{
    entityType: string
    items: unknown[]
    mutate: (batch: unknown[]) => Promise<void>
  }> = [
    {
      entityType: 'tagTypes',
      items: data.tagTypes,
      mutate: (batch) =>
        client
          .mutate({
            mutation: BulkCreateTagTypesDocument,
            variables: {
              tagTypes: batch.map((t) =>
                toTagTypeInput(t as Record<string, unknown>),
              ),
            },
          })
          .then(() => undefined),
    },
    {
      entityType: 'tags',
      items: data.tags,
      mutate: (batch) =>
        client
          .mutate({
            mutation: BulkCreateTagsDocument,
            variables: {
              tags: batch.map((t) => toTagInput(t as Record<string, unknown>)),
            },
          })
          .then(() => undefined),
    },
    {
      entityType: 'vendors',
      items: data.vendors,
      mutate: (batch) =>
        client
          .mutate({
            mutation: BulkCreateVendorsDocument,
            variables: {
              vendors: batch.map((v) =>
                toVendorInput(v as Record<string, unknown>),
              ),
            },
          })
          .then(() => undefined),
    },
    {
      entityType: 'items',
      items: data.items,
      mutate: (batch) =>
        client
          .mutate({
            mutation: BulkCreateItemsDocument,
            variables: {
              items: batch.map((i) =>
                toItemInput(i as Record<string, unknown>),
              ),
            },
          })
          .then(() => undefined),
    },
    {
      entityType: 'recipes',
      items: data.recipes,
      mutate: (batch) =>
        client
          .mutate({
            mutation: BulkCreateRecipesDocument,
            variables: {
              recipes: batch.map((r) =>
                toRecipeInput(r as Record<string, unknown>),
              ),
            },
          })
          .then(() => undefined),
    },
    {
      entityType: 'inventoryLogs',
      items: data.inventoryLogs,
      mutate: (batch) =>
        client
          .mutate({
            mutation: BulkCreateInventoryLogsDocument,
            variables: {
              logs: batch.map((l) =>
                toInventoryLogInput(l as Record<string, unknown>),
              ),
            },
          })
          .then(() => undefined),
    },
    {
      entityType: 'shoppingCarts',
      items: data.shoppingCarts,
      mutate: (batch) =>
        client
          .mutate({
            mutation: BulkCreateShoppingCartsDocument,
            variables: {
              carts: batch.map((c) =>
                toShoppingCartInput(c as Record<string, unknown>),
              ),
            },
          })
          .then(() => undefined),
    },
    {
      entityType: 'cartItems',
      items: data.cartItems,
      mutate: (batch) =>
        client
          .mutate({
            mutation: BulkCreateCartItemsDocument,
            variables: {
              cartItems: batch.map((ci) =>
                toCartItemInput(ci as Record<string, unknown>),
              ),
            },
          })
          .then(() => undefined),
    },
    {
      entityType: 'shelves',
      items: data.shelves ?? [],
      mutate: (batch) =>
        client
          .mutate({
            mutation: BulkCreateShelvesDocument,
            variables: {
              shelves: batch.map((s) =>
                toShelfInput(s as Record<string, unknown>),
              ),
            },
          })
          .then(() => undefined),
    },
  ]

  for (const group of entityGroups) {
    const batches = chunk(group.items, BATCH_SIZE)
    for (const [i, batch] of batches.entries()) {
      const key = `${group.entityType}:${i}`
      if (session.completedBatchKeys.has(key)) {
        completedBatches++
        continue
      }
      await group.mutate(batch)
      session.completedBatchKeys.add(key)
      completedBatches++
      onProgress({
        completedBatches,
        totalBatches,
        currentEntity: group.entityType,
      })
    }
  }

  return completedBatches
}

// ---------------------------------------------------------------------------
// Batched bulk upsert — same structure as bulkCreate but uses Upsert mutations.
// ---------------------------------------------------------------------------

async function bulkUpsert(args: BatchedBulkArgs): Promise<number> {
  const { client, data, session, onProgress, totalBatches } = args
  let completedBatches = args.startCompleted

  const entityGroups: Array<{
    entityType: string
    items: unknown[]
    mutate: (batch: unknown[]) => Promise<void>
  }> = [
    {
      entityType: 'tagTypes',
      items: data.tagTypes,
      mutate: (batch) =>
        client
          .mutate({
            mutation: BulkUpsertTagTypesDocument,
            variables: {
              tagTypes: batch.map((t) =>
                toTagTypeInput(t as Record<string, unknown>),
              ),
            },
          })
          .then(() => undefined),
    },
    {
      entityType: 'tags',
      items: data.tags,
      mutate: (batch) =>
        client
          .mutate({
            mutation: BulkUpsertTagsDocument,
            variables: {
              tags: batch.map((t) => toTagInput(t as Record<string, unknown>)),
            },
          })
          .then(() => undefined),
    },
    {
      entityType: 'vendors',
      items: data.vendors,
      mutate: (batch) =>
        client
          .mutate({
            mutation: BulkUpsertVendorsDocument,
            variables: {
              vendors: batch.map((v) =>
                toVendorInput(v as Record<string, unknown>),
              ),
            },
          })
          .then(() => undefined),
    },
    {
      entityType: 'items',
      items: data.items,
      mutate: (batch) =>
        client
          .mutate({
            mutation: BulkUpsertItemsDocument,
            variables: {
              items: batch.map((i) =>
                toItemInput(i as Record<string, unknown>),
              ),
            },
          })
          .then(() => undefined),
    },
    {
      entityType: 'recipes',
      items: data.recipes,
      mutate: (batch) =>
        client
          .mutate({
            mutation: BulkUpsertRecipesDocument,
            variables: {
              recipes: batch.map((r) =>
                toRecipeInput(r as Record<string, unknown>),
              ),
            },
          })
          .then(() => undefined),
    },
    {
      entityType: 'inventoryLogs',
      items: data.inventoryLogs,
      mutate: (batch) =>
        client
          .mutate({
            mutation: BulkUpsertInventoryLogsDocument,
            variables: {
              logs: batch.map((l) =>
                toInventoryLogInput(l as Record<string, unknown>),
              ),
            },
          })
          .then(() => undefined),
    },
    {
      entityType: 'shoppingCarts',
      items: data.shoppingCarts,
      mutate: (batch) =>
        client
          .mutate({
            mutation: BulkUpsertShoppingCartsDocument,
            variables: {
              carts: batch.map((c) =>
                toShoppingCartInput(c as Record<string, unknown>),
              ),
            },
          })
          .then(() => undefined),
    },
    {
      entityType: 'cartItems',
      items: data.cartItems,
      mutate: (batch) =>
        client
          .mutate({
            mutation: BulkUpsertCartItemsDocument,
            variables: {
              cartItems: batch.map((ci) =>
                toCartItemInput(ci as Record<string, unknown>),
              ),
            },
          })
          .then(() => undefined),
    },
    {
      entityType: 'shelves',
      items: data.shelves ?? [],
      mutate: (batch) =>
        client
          .mutate({
            mutation: BulkUpsertShelvesDocument,
            variables: {
              shelves: batch.map((s) =>
                toShelfInput(s as Record<string, unknown>),
              ),
            },
          })
          .then(() => undefined),
    },
  ]

  for (const group of entityGroups) {
    const batches = chunk(group.items, BATCH_SIZE)
    for (const [i, batch] of batches.entries()) {
      const key = `${group.entityType}:${i}`
      if (session.completedBatchKeys.has(key)) {
        completedBatches++
        continue
      }
      await group.mutate(batch)
      session.completedBatchKeys.add(key)
      completedBatches++
      onProgress({
        completedBatches,
        totalBatches,
        currentEntity: group.entityType,
      })
    }
  }

  return completedBatches
}

function computeTotalBatches(data: ExportPayload): number {
  return (
    chunk(data.tagTypes, BATCH_SIZE).length +
    chunk(data.tags, BATCH_SIZE).length +
    chunk(data.vendors, BATCH_SIZE).length +
    chunk(data.items, BATCH_SIZE).length +
    chunk(data.recipes, BATCH_SIZE).length +
    chunk(data.inventoryLogs, BATCH_SIZE).length +
    chunk(data.shoppingCarts, BATCH_SIZE).length +
    chunk(data.cartItems, BATCH_SIZE).length +
    chunk(data.shelves ?? [], BATCH_SIZE).length
  )
}

export async function importCloudData(
  payload: ExportPayload,
  strategy: ImportStrategy,
  client: ApolloClient,
  options?: {
    onProgress?: (p: ImportProgress) => void
    session?: ImportSession
  },
): Promise<void> {
  const onProgress = options?.onProgress ?? (() => undefined)
  const session: ImportSession = options?.session ?? {
    payload,
    strategy,
    completedBatchKeys: new Set(),
  }

  try {
    if (strategy === 'clear') {
      const totalBatches = computeTotalBatches(payload)
      onProgress({ completedBatches: 0, totalBatches, currentEntity: '' })
      await client.mutate({ mutation: ClearAllDataDocument })
      await bulkCreate({
        client,
        data: payload,
        session,
        onProgress,
        startCompleted: 0,
        totalBatches,
      })
      await client.resetStore()
      return
    }

    const existing = await fetchCloudExistingData(client)
    const conflicts = detectConflicts(payload, existing)

    if (strategy === 'skip') {
      const { toCreate } = partitionPayload(payload, conflicts, 'skip')
      const totalBatches = computeTotalBatches(toCreate)
      onProgress({ completedBatches: 0, totalBatches, currentEntity: '' })
      await bulkCreate({
        client,
        data: toCreate,
        session,
        onProgress,
        startCompleted: 0,
        totalBatches,
      })
      await client.resetStore()
      return
    }

    // strategy === 'replace'
    const { toCreate, toUpsert } = partitionPayload(
      payload,
      conflicts,
      'replace',
    )
    const totalBatches =
      computeTotalBatches(toCreate) + computeTotalBatches(toUpsert)
    onProgress({ completedBatches: 0, totalBatches, currentEntity: '' })
    const afterCreate = await bulkCreate({
      client,
      data: toCreate,
      session,
      onProgress,
      startCompleted: 0,
      totalBatches,
    })
    await bulkUpsert({
      client,
      data: toUpsert,
      session,
      onProgress,
      startCompleted: afterCreate,
      totalBatches,
    })
    await client.resetStore()
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    ;(error as Error & { session: ImportSession }).session = session
    throw error
  }
}
