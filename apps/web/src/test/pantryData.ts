import { DEFAULT_LOCATION_ID } from '@/types'

// Adapts a hand-written `GetItems` cloud fixture to the `PantryData` shape the
// pantry hooks now read (`hooks/useItems.ts`), stocking EVERY item in one
// location.
//
// Cloud fixtures were written against `GetItems`, whose `Item` still declares
// the five stock STATE fields until PR 5, so each fixture item already carries
// the quantities its test asserts on. This lifts them into an `ItemStock` row —
// the only place the join reads stock from — leaving those assertions intact
// while the request underneath changes.
//
// NOT for tests about location scoping. Everything here is stocked in the same
// location, so "stocked in the active location" and "exists at all" are the
// same set and a hook ignoring the location entirely would still pass. Those
// tests build two locations by hand — see `hooks/useItems.cloud.test.tsx`.
type CloudItemFixture = Record<string, unknown> & { id: string }

interface ItemsQueryResult {
  data?: { items: CloudItemFixture[] } | undefined
}

function stockRowFor(item: CloudItemFixture, locationId: string) {
  return {
    __typename: 'ItemStock' as const,
    id: `stock-${item.id}`,
    itemId: item.id,
    locationId,
    targetQuantity: item.targetQuantity ?? 0,
    refillThreshold: item.refillThreshold ?? 0,
    packedQuantity: item.packedQuantity ?? 0,
    unpackedQuantity: item.unpackedQuantity ?? 0,
    dueDate: item.dueDate ?? null,
    createdAt: item.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: item.updatedAt ?? '2026-01-01T00:00:00.000Z',
  }
}

export function asPantryDataResult<T extends ItemsQueryResult>(
  result: T,
  locationId: string = DEFAULT_LOCATION_ID,
): Omit<T, 'data'> & {
  data:
    | {
        items: CloudItemFixture[]
        itemStocks: ReturnType<typeof stockRowFor>[]
      }
    | undefined
} {
  const items = result.data?.items
  return {
    ...result,
    data: items
      ? {
          items,
          itemStocks: items.map((item) => stockRowFor(item, locationId)),
        }
      : undefined,
  }
}

// The same adaptation for a fixture given as a bare item array.
export function pantryDataFromItems(
  items: CloudItemFixture[],
  locationId: string = DEFAULT_LOCATION_ID,
) {
  return {
    items,
    itemStocks: items.map((item) => stockRowFor(item, locationId)),
  }
}
