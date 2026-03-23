import type { ApolloClient } from '@apollo/client'
import { db } from '@/db'
import type {
  AllCartItemsQuery,
  GetItemsQuery,
  GetRecipesQuery,
  GetTagsQuery,
  GetTagTypesQuery,
  GetVendorsQuery,
  InventoryLogsQuery,
  ShoppingCartsQuery,
} from '@/generated/graphql'
import {
  AllCartItemsDocument,
  GetItemsDocument,
  GetRecipesDocument,
  GetTagsDocument,
  GetTagTypesDocument,
  GetVendorsDocument,
  InventoryLogsDocument,
  ShoppingCartsDocument,
} from '@/generated/graphql'
import {
  toCartItemInput,
  toInventoryLogInput,
  toItemInput,
  toRecipeInput,
  toShoppingCartInput,
  toTagInput,
  toTagTypeInput,
  toVendorInput,
} from './importData'

export interface ExportPayload {
  version: number
  exportedAt: string
  items: unknown[]
  tags: unknown[]
  tagTypes: unknown[]
  vendors: unknown[]
  recipes: unknown[]
  inventoryLogs: unknown[]
  shoppingCarts: unknown[]
  cartItems: unknown[]
}

export function buildExportPayload(
  data: Omit<ExportPayload, 'version' | 'exportedAt'>,
): ExportPayload {
  return { version: 1, exportedAt: new Date().toISOString(), ...data }
}

/**
 * Strip Apollo/server-only fields (__typename, userId, familyId) from a cloud
 * export payload. Reuses the same mapper functions used on the import side so
 * the allowed field sets stay in sync.
 */
export function sanitiseCloudPayload(payload: ExportPayload): ExportPayload {
  return {
    ...payload,
    items: payload.items.map((i) => toItemInput(i as Record<string, unknown>)),
    tags: payload.tags.map((t) => toTagInput(t as Record<string, unknown>)),
    tagTypes: payload.tagTypes.map((t) =>
      toTagTypeInput(t as Record<string, unknown>),
    ),
    vendors: payload.vendors.map((v) =>
      toVendorInput(v as Record<string, unknown>),
    ),
    recipes: payload.recipes.map((r) =>
      toRecipeInput(r as Record<string, unknown>),
    ),
    inventoryLogs: payload.inventoryLogs.map((l) =>
      toInventoryLogInput(l as Record<string, unknown>),
    ),
    shoppingCarts: payload.shoppingCarts.map((c) =>
      toShoppingCartInput(c as Record<string, unknown>),
    ),
    cartItems: payload.cartItems.map((ci) =>
      toCartItemInput(ci as Record<string, unknown>),
    ),
  }
}

export async function exportAllData(): Promise<void> {
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

  const payload = buildExportPayload({
    items,
    tags,
    tagTypes,
    vendors,
    recipes,
    inventoryLogs,
    shoppingCarts,
    cartItems,
  })

  triggerDownload(payload)
}

function triggerDownload(payload: ExportPayload): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `player1inventory-backup-${new Date().toISOString().split('T')[0]}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export async function exportCloudData(client: ApolloClient): Promise<void> {
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
  ] = await Promise.all([
    client.query<GetItemsQuery>({ query: GetItemsDocument, fetchPolicy }),
    client.query<GetTagsQuery>({ query: GetTagsDocument, fetchPolicy }),
    client.query<GetTagTypesQuery>({
      query: GetTagTypesDocument,
      fetchPolicy,
    }),
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

  const payload = buildExportPayload({
    items: itemsResult.data?.items ?? [],
    tags: tagsResult.data?.tags ?? [],
    tagTypes: tagTypesResult.data?.tagTypes ?? [],
    vendors: vendorsResult.data?.vendors ?? [],
    recipes: recipesResult.data?.recipes ?? [],
    inventoryLogs: inventoryLogsResult.data?.inventoryLogs ?? [],
    shoppingCarts: shoppingCartsResult.data?.shoppingCarts ?? [],
    cartItems: allCartItemsResult.data?.allCartItems ?? [],
  })

  triggerDownload(sanitiseCloudPayload(payload))
}
