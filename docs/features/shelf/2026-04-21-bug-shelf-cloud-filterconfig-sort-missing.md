# Bug: Cloud-mode shelf save drops sortBy/sortDir from filterConfig

## Bug description
In cloud mode, saving a filter shelf's info does not persist `sortBy`/`sortDir` to the server. These fields are present in the form state but silently dropped before the GraphQL mutation.

## Root cause
Three layers all missing `sortBy`/`sortDir`:
1. `FilterConfigInput` in `apps/server/src/schema/shelf.graphql` only declares `tagIds`/`vendorIds`/`recipeIds`
2. `filterConfig { ... }` response shape in `apps/web/src/apollo/operations/shelves.graphql` doesn't request `sortBy`/`sortDir`
3. `toGqlFilterConfig` helper in `apps/web/src/hooks/useShelves.ts` explicitly strips sort fields when building the mutation input

The form handler itself correctly passes the sort fields — they are lost in the adapter layer.

## Fix applied
Three-layer fix:
1. **Server schema** (`apps/server/src/schema/shelf.graphql`): Added `sortBy: String` and `sortDir: String` to both `FilterConfig` type and `FilterConfigInput` input type.
2. **Web GraphQL operations** (`apps/web/src/apollo/operations/shelves.graphql`): Added `sortBy` and `sortDir` to the `filterConfig { ... }` selection in all four operations — `GetShelves`, `GetShelf`, `CreateShelf`, `UpdateShelf`.
3. **Web hook helper** (`apps/web/src/hooks/useShelves.ts`): Updated `toGqlFilterConfig` to include `sortBy` and `sortDir` in the returned object when present, and updated all return type annotations accordingly. Removed the old comment that said sort fields were intentionally stripped.

## Test added
Added a test case in `apps/web/src/lib/deserialization.test.ts` (`deserializeShelf` suite): "preserves sortBy and sortDir from filterConfig" — given a raw GraphQL shelf response with `sortBy: 'name'` and `sortDir: 'asc'` in `filterConfig`, verifies both fields survive deserialization unchanged.

## PR/commit
Commit: `98142d1` — fix(shelf): include sortBy/sortDir in cloud filterConfig send and receive
