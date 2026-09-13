// Shared cloud-mode fixture for the location tests.
//
// THE FIXTURE IS THE TEST. Cloud location ids are server-generated cuids, never
// the local `'local'` sentinel, and there are always TWO of them: with a single
// location "stocked in the active location" and "exists in the catalog at all"
// are the same set, so every assertion below would pass against code that
// ignored the location entirely (root CLAUDE.md → Proving a Test Works).
//
// Lives outside a `.test.ts` file on purpose: `tsconfig.app.json` excludes test
// files from the build's type-check, so a fixture shared by five specs is worth
// having type-checked.
import { GetLocationsDocument } from '@/generated/graphql'

export const LOC_A = 'clw3loc0a0000s9f8h7g6d5e4' // Cloud Kitchen — the default, active first
export const LOC_B = 'clw3loc0b0001s9f8h7g6d5e5' // Cloud Garage

export const cloudLocation = (
  id: string,
  name: string,
  order: number,
  isDefault: boolean,
) => ({
  __typename: 'Location' as const,
  id,
  name,
  order,
  isDefault,
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-02T11:00:00.000Z',
})

export const CLOUD_LOCATIONS = [
  cloudLocation(LOC_A, 'Cloud Kitchen', 0, true),
  cloudLocation(LOC_B, 'Cloud Garage', 1, false),
]

export const getLocationsMock = {
  request: { query: GetLocationsDocument },
  maxUsageCount: Number.POSITIVE_INFINITY,
  result: { data: { locations: CLOUD_LOCATIONS } },
}

// The cloud `Item` still declares the five stock STATE fields until PR 5. The
// defaults here are the zeroes the server sends for an item nobody has written
// inline stock to; `inline` is how a test gives an item leftover values that
// `stripStockFields` has to remove before the per-location join.
export const cloudItem = (
  id: string,
  name: string,
  inline: Record<string, unknown> = {},
) => ({
  __typename: 'Item' as const,
  id,
  name,
  tagIds: [],
  vendorIds: [],
  packageUnit: null,
  measurementUnit: null,
  amountPerPackage: null,
  targetUnit: 'package',
  targetQuantity: 0,
  refillThreshold: 0,
  packedQuantity: 0,
  unpackedQuantity: 0,
  consumeAmount: 1,
  expirationMode: null,
  dueDate: null,
  estimatedDueDays: null,
  expirationThreshold: null,
  userId: 'user-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...inline,
})

export const cloudStock = (
  id: string,
  itemId: string,
  locationId: string,
  fields: {
    targetQuantity: number
    refillThreshold: number
    packedQuantity: number
    unpackedQuantity: number
    dueDate?: string | null
  },
) => ({
  __typename: 'ItemStock' as const,
  id,
  itemId,
  locationId,
  dueDate: null,
  ...fields,
  createdAt: '2026-02-01T00:00:00.000Z',
  updatedAt: '2026-02-02T00:00:00.000Z',
})

export type CloudStock = ReturnType<typeof cloudStock>
