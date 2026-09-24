import type { APIRequestContext, Page } from '@playwright/test'
import { CLOUD_WEB_URL } from '../constants'
import { makeGql } from '../utils/cloud'
import { readRows } from './locationSeed'

// Read an item's `ItemStock` rows back from whichever backend the current
// project runs against.
//
// WHY THIS EXISTS: a cloud run has no IndexedDB to read. `readRows(page,
// 'itemStocks')` returns an empty array there, so every assertion built on it
// would be vacuous — it would pass against any implementation at all.
// `itemStocksForItem` is the server-side twin, and it is the same query the
// Stock-tab pager itself uses (`useItemStocks`, apps/web/src/hooks/useItemStocks.ts).
//
// The local IndexedDB row and the GraphQL type carry the same key names, so one
// `StockRow` type covers both modes.

export type StockRow = {
  itemId: string
  locationId: string
  packedQuantity: number
  unpackedQuantity: number
  targetQuantity: number
  refillThreshold: number
}

const STOCKS_FOR_ITEM = `query ($itemId: ID!) {
  itemStocksForItem(itemId: $itemId) {
    itemId
    locationId
    packedQuantity
    unpackedQuantity
    targetQuantity
    refillThreshold
  }
}`

/** Every stock row for `itemId`, across every location. */
export async function readStocksForItem(
  page: Page,
  request: APIRequestContext,
  baseURL: string | undefined,
  itemId: string,
): Promise<StockRow[]> {
  if (baseURL === CLOUD_WEB_URL) {
    const gql = makeGql(request)
    const { itemStocksForItem } = await gql<{ itemStocksForItem: StockRow[] }>(
      STOCKS_FOR_ITEM,
      { itemId },
    )
    return itemStocksForItem
  }
  const rows = (await readRows(page, 'itemStocks')) as unknown as StockRow[]
  return rows.filter((stock) => stock.itemId === itemId)
}

/** This item's stock row at one location, or undefined when it has none there. */
export async function readStockAt(
  page: Page,
  request: APIRequestContext,
  baseURL: string | undefined,
  itemId: string,
  locationId: string,
): Promise<StockRow | undefined> {
  const rows = await readStocksForItem(page, request, baseURL, itemId)
  return rows.find((stock) => stock.locationId === locationId)
}
