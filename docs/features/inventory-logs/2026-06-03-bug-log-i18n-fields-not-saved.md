# Bug: Inventory Log i18n Fields Not Saved to Cloud

## Bug Description

After PR #221 (`feat(i18n): store log descriptor as logKey/logParams for dynamic translation`), inventory logs are not being saved with the new i18n fields `logKey` and `logParams` in the cloud layer. The fields are not returned in GraphQL responses.

## Root Cause

The local Dexie/IndexedDB implementation was complete, but the cloud/GraphQL layer was never updated to support the new fields. Five locations are affected:

1. **GraphQL schema** (`apps/server/src/schema/inventoryLog.graphql`) — `InventoryLog` type missing `logKey` and `logParams` fields; `addInventoryLog` mutation missing parameters
2. **Prisma schema** (`apps/server/prisma/schema.prisma`) — `InventoryLog` model missing `logKey String?` and `logParams Json?` columns
3. **Client GraphQL operations** (`apps/web/src/apollo/operations/inventoryLogs.graphql`) — `ItemLogs` query and `AddInventoryLog` mutation missing the fields
4. **Resolver** (`apps/server/src/resolvers/inventoryLog.resolver.ts`) — `addInventoryLog` doesn't read or persist the new fields
5. **Hook mapping** (`apps/web/src/hooks/useInventoryLogs.ts`) — cloud response not mapped to `logKey`/`logParams`

## Fix Applied

Added `logKey`/`logParams` across the full cloud stack (18 files):
- `scalar JSON` in server GraphQL schema
- `logKey: String` + `logParams: JSON` to `InventoryLog` type, `addInventoryLog`, `checkout`, `ConsumeRecipesItemInput`, and `InventoryLogInput` (bulk import)
- Prisma migration `20260602175405_add_log_i18n_fields` adding `logKey String?` and `logParams Json?` columns
- All four server resolvers (`addInventoryLog`, `checkout`, `consumeRecipes`, `bulkCreate/UpsertInventoryLogs`) now persist the fields
- JSON scalar resolver registered in `resolvers/index.ts`
- Client GraphQL operations updated; hooks (`useInventoryLogs`, `useShoppingCart`, `useRecipes`) now pass and map the fields

## Test Added

None added — the cloud paths require a running server + database. Existing integration tests (`useInventoryLogs.test.ts`) continue to pass; the local-mode path was already correct.

## PR / Commit

Commit: `7b83a13d` — branch `fix/inventory-log-i18n-fields`
