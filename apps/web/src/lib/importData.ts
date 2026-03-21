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
