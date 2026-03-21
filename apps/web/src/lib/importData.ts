import type { ApolloClient } from '@apollo/client'
import { db } from '@/db'
import {
  AllCartItemsDocument,
  type AllCartItemsQuery,
  BulkCreateCartItemsDocument,
  BulkCreateInventoryLogsDocument,
  BulkCreateItemsDocument,
  BulkCreateRecipesDocument,
  BulkCreateShoppingCartsDocument,
  BulkCreateTagsDocument,
  BulkCreateTagTypesDocument,
  BulkCreateVendorsDocument,
  BulkUpsertCartItemsDocument,
  BulkUpsertInventoryLogsDocument,
  BulkUpsertItemsDocument,
  BulkUpsertRecipesDocument,
  BulkUpsertShoppingCartsDocument,
  BulkUpsertTagsDocument,
  BulkUpsertTagTypesDocument,
  BulkUpsertVendorsDocument,
  ClearAllDataDocument,
  GetItemsDocument,
  type GetItemsQuery,
  GetRecipesDocument,
  type GetRecipesQuery,
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
  ShoppingCart,
  Tag,
  TagType,
  Vendor,
} from '@/types'
import type { ExportPayload } from './exportData'

export type ImportStrategy = 'skip' | 'replace' | 'clear'

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
    tags: detectNamedConflicts(payload.tags as NamedEntity[], existing.tags),
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
    summary.cartItems.length > 0
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
  ] = await Promise.all([
    db.items.toArray(),
    db.tags.toArray(),
    db.tagTypes.toArray(),
    db.vendors.toArray(),
    db.recipes.toArray(),
    db.inventoryLogs.toArray(),
    db.shoppingCarts.toArray(),
    db.cartItems.toArray(),
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
  }
}

export async function importLocalData(
  payload: ExportPayload,
  strategy: ImportStrategy,
): Promise<void> {
  if (strategy === 'clear') {
    // Delete all tables in dependency order (children before parents)
    await db.cartItems.clear()
    await db.shoppingCarts.clear()
    await db.inventoryLogs.clear()
    await db.tags.clear()
    await db.tagTypes.clear()
    await db.recipes.clear()
    await db.vendors.clear()
    await db.items.clear()

    // Bulk add all entities in reverse order (parents before children)
    await db.items.bulkAdd(payload.items as Item[])
    await db.vendors.bulkAdd(payload.vendors as Vendor[])
    await db.recipes.bulkAdd(payload.recipes as Recipe[])
    await db.tagTypes.bulkAdd(payload.tagTypes as TagType[])
    await db.tags.bulkAdd(payload.tags as Tag[])
    await db.inventoryLogs.bulkAdd(payload.inventoryLogs as InventoryLog[])
    await db.shoppingCarts.bulkAdd(payload.shoppingCarts as ShoppingCart[])
    await db.cartItems.bulkAdd(payload.cartItems as CartItem[])
    return
  }

  const existing = await fetchLocalExistingData()
  const conflicts = detectConflicts(payload, existing)

  if (strategy === 'skip') {
    const { toCreate } = partitionPayload(payload, conflicts, 'skip')

    await db.items.bulkAdd(toCreate.items as Item[], { allKeys: false })
    await db.vendors.bulkAdd(toCreate.vendors as Vendor[], { allKeys: false })
    await db.recipes.bulkAdd(toCreate.recipes as Recipe[], { allKeys: false })
    await db.tagTypes.bulkAdd(toCreate.tagTypes as TagType[], {
      allKeys: false,
    })
    await db.tags.bulkAdd(toCreate.tags as Tag[], { allKeys: false })
    await db.inventoryLogs.bulkAdd(toCreate.inventoryLogs as InventoryLog[], {
      allKeys: false,
    })
    await db.shoppingCarts.bulkAdd(toCreate.shoppingCarts as ShoppingCart[], {
      allKeys: false,
    })
    await db.cartItems.bulkAdd(toCreate.cartItems as CartItem[], {
      allKeys: false,
    })
    return
  }

  // strategy === 'replace'
  const { toCreate, toUpsert } = partitionPayload(payload, conflicts, 'replace')

  await db.items.bulkAdd(toCreate.items as Item[], { allKeys: false })
  await db.vendors.bulkAdd(toCreate.vendors as Vendor[], { allKeys: false })
  await db.recipes.bulkAdd(toCreate.recipes as Recipe[], { allKeys: false })
  await db.tagTypes.bulkAdd(toCreate.tagTypes as TagType[], { allKeys: false })
  await db.tags.bulkAdd(toCreate.tags as Tag[], { allKeys: false })
  await db.inventoryLogs.bulkAdd(toCreate.inventoryLogs as InventoryLog[], {
    allKeys: false,
  })
  await db.shoppingCarts.bulkAdd(toCreate.shoppingCarts as ShoppingCart[], {
    allKeys: false,
  })
  await db.cartItems.bulkAdd(toCreate.cartItems as CartItem[], {
    allKeys: false,
  })

  await db.items.bulkPut(toUpsert.items as Item[])
  await db.vendors.bulkPut(toUpsert.vendors as Vendor[])
  await db.recipes.bulkPut(toUpsert.recipes as Recipe[])
  await db.tagTypes.bulkPut(toUpsert.tagTypes as TagType[])
  await db.tags.bulkPut(toUpsert.tags as Tag[])
  await db.inventoryLogs.bulkPut(toUpsert.inventoryLogs as InventoryLog[])
  await db.shoppingCarts.bulkPut(toUpsert.shoppingCarts as ShoppingCart[])
  await db.cartItems.bulkPut(toUpsert.cartItems as CartItem[])
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
    cartItemsResult,
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
  ])

  // Apollo Client v4 data field is typed as {} — cast via unknown for property access
  type R = Record<string, unknown[] | undefined>
  return {
    items: ((itemsResult.data as unknown as R).items ?? []) as Item[],
    tags: ((tagsResult.data as unknown as R).tags ?? []) as Tag[],
    tagTypes: ((tagTypesResult.data as unknown as R).tagTypes ??
      []) as TagType[],
    vendors: ((vendorsResult.data as unknown as R).vendors ?? []) as Vendor[],
    recipes: ((recipesResult.data as unknown as R).recipes ?? []) as Recipe[],
    inventoryLogs: ((inventoryLogsResult.data as unknown as R).inventoryLogs ??
      []) as InventoryLog[],
    shoppingCarts: ((shoppingCartsResult.data as unknown as R).shoppingCarts ??
      []) as ShoppingCart[],
    cartItems: ((cartItemsResult.data as unknown as R).allCartItems ??
      []) as CartItem[],
  }
}

async function bulkCreate(
  client: ApolloClient,
  data: ExportPayload,
): Promise<void> {
  if (data.items.length > 0) {
    await client.mutate({
      mutation: BulkCreateItemsDocument,
      variables: { items: data.items },
    })
  }
  if (data.vendors.length > 0) {
    await client.mutate({
      mutation: BulkCreateVendorsDocument,
      variables: { vendors: data.vendors },
    })
  }
  if (data.recipes.length > 0) {
    await client.mutate({
      mutation: BulkCreateRecipesDocument,
      variables: { recipes: data.recipes },
    })
  }
  if (data.tagTypes.length > 0) {
    await client.mutate({
      mutation: BulkCreateTagTypesDocument,
      variables: { tagTypes: data.tagTypes },
    })
  }
  if (data.tags.length > 0) {
    await client.mutate({
      mutation: BulkCreateTagsDocument,
      variables: { tags: data.tags },
    })
  }
  if (data.inventoryLogs.length > 0) {
    await client.mutate({
      mutation: BulkCreateInventoryLogsDocument,
      variables: { logs: data.inventoryLogs },
    })
  }
  if (data.shoppingCarts.length > 0) {
    await client.mutate({
      mutation: BulkCreateShoppingCartsDocument,
      variables: { carts: data.shoppingCarts },
    })
  }
  if (data.cartItems.length > 0) {
    await client.mutate({
      mutation: BulkCreateCartItemsDocument,
      variables: { cartItems: data.cartItems },
    })
  }
}

async function bulkUpsert(
  client: ApolloClient,
  data: ExportPayload,
): Promise<void> {
  if (data.items.length > 0) {
    await client.mutate({
      mutation: BulkUpsertItemsDocument,
      variables: { items: data.items },
    })
  }
  if (data.vendors.length > 0) {
    await client.mutate({
      mutation: BulkUpsertVendorsDocument,
      variables: { vendors: data.vendors },
    })
  }
  if (data.recipes.length > 0) {
    await client.mutate({
      mutation: BulkUpsertRecipesDocument,
      variables: { recipes: data.recipes },
    })
  }
  if (data.tagTypes.length > 0) {
    await client.mutate({
      mutation: BulkUpsertTagTypesDocument,
      variables: { tagTypes: data.tagTypes },
    })
  }
  if (data.tags.length > 0) {
    await client.mutate({
      mutation: BulkUpsertTagsDocument,
      variables: { tags: data.tags },
    })
  }
  if (data.inventoryLogs.length > 0) {
    await client.mutate({
      mutation: BulkUpsertInventoryLogsDocument,
      variables: { logs: data.inventoryLogs },
    })
  }
  if (data.shoppingCarts.length > 0) {
    await client.mutate({
      mutation: BulkUpsertShoppingCartsDocument,
      variables: { carts: data.shoppingCarts },
    })
  }
  if (data.cartItems.length > 0) {
    await client.mutate({
      mutation: BulkUpsertCartItemsDocument,
      variables: { cartItems: data.cartItems },
    })
  }
}

export async function importCloudData(
  payload: ExportPayload,
  strategy: ImportStrategy,
  client: ApolloClient,
): Promise<void> {
  if (strategy === 'clear') {
    await client.mutate({ mutation: ClearAllDataDocument })
    await bulkCreate(client, payload)
    await client.resetStore()
    return
  }

  const existing = await fetchCloudExistingData(client)
  const conflicts = detectConflicts(payload, existing)

  if (strategy === 'skip') {
    const { toCreate } = partitionPayload(payload, conflicts, 'skip')
    await bulkCreate(client, toCreate)
    await client.resetStore()
    return
  }

  // strategy === 'replace'
  const { toCreate, toUpsert } = partitionPayload(payload, conflicts, 'replace')
  await bulkCreate(client, toCreate)
  await bulkUpsert(client, toUpsert)
  await client.resetStore()
}
