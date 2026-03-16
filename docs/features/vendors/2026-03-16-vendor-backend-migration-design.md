# Vendor Backend Migration Design

**Date:** 2026-03-16

## Overview

Migrate vendors to the backend, following the same dual-mode pattern established by the tags migration (PR #115). Also fix cascade deletion for tags (cloud mode currently deletes the record but does not clean up items).

## Scope

| Area | Work |
|---|---|
| Server model | `Vendor.model.ts` — Typegoose class with `userId`, `familyId` |
| Server schema | `vendor.graphql` — GraphQL type + Query + Mutation |
| Server resolver | `vendor.resolver.ts` — full CRUD with server-side cascade deletion |
| Server item schema | Add `itemCountByVendor` to `item.graphql` |
| Server item resolver | Add `itemCountByVendor` to `item.resolver.ts` |
| Tags cascade fix | Update `tag.resolver.ts` `deleteTag` / `deleteTagType` to cascade into items |
| Frontend operations | `vendors.graphql` — Apollo operation documents |
| Frontend codegen | Run codegen to generate typed hooks |
| Frontend hooks | Dual-mode `useVendors.ts` branching on `useDataMode()` |
| Tests | Model test, resolver test, hook tests (local + cloud), E2E cloud tests |

## Data Model

Vendor type (from `packages/types/src/index.ts`):
```ts
interface Vendor {
  id: string
  name: string
  createdAt: Date
}
```

Server model adds `userId` (required) and `familyId` (optional) — same pattern as Tags.

## GraphQL Schema

```graphql
type Vendor {
  id: ID!
  name: String!
  userId: String!
  familyId: String
}

extend type Query {
  vendors: [Vendor!]!
}

extend type Mutation {
  createVendor(name: String!): Vendor!
  updateVendor(id: ID!, name: String): Vendor!
  deleteVendor(id: ID!): Boolean!
}
```

`itemCountByVendor` goes in `item.graphql` (matching the `itemCountByTag` pattern):
```graphql
extend type Query {
  itemCountByVendor(vendorId: String!): Int!
}
```

## Cascade Deletion Strategy

### Local mode (unchanged)
`deleteVendor` in `operations.ts` already cascades — removes vendorId from all item `vendorIds[]` in the same Dexie transaction. No change needed.

### Cloud mode (new)

**`deleteVendor` resolver:**
1. Verify vendor belongs to userId
2. Use `ItemModel.updateMany({ userId, vendorIds: id }, { $pull: { vendorIds: id } })` to remove the vendor from all items
3. Delete the vendor record

**`deleteTag` resolver (fix):**
1. Use `ItemModel.updateMany({ userId, tagIds: id }, { $pull: { tagIds: id } })` to remove the tag from all items
2. Delete the tag record

**`deleteTagType` resolver (fix):**
1. Find all tags of that type
2. For each tag, run the cascade (or bulk: `ItemModel.updateMany({ userId, tagIds: { $in: tagIds } }, { $pull: { tagIds: { $in: tagIds } } })`)
3. Delete all tags of that type
4. Delete the tag type record

## Frontend Hooks Shape

`useVendors()` — query, branches local/cloud
`useCreateVendor()` — mutation, returns `{ mutate, mutateAsync, isPending }`
`useUpdateVendor()` — mutation, accepts `{ id, updates }`
`useDeleteVendor()` — mutation, accepts `id: string`
`useItemCountByVendor(vendorId)` — query

All hooks call `useDataMode()` and branch identically to the tags pattern.

## Files Changed / Created

### Server
- `apps/server/src/models/Vendor.model.ts` — new
- `apps/server/src/schema/vendor.graphql` — new
- `apps/server/src/resolvers/vendor.resolver.ts` — new
- `apps/server/src/resolvers/index.ts` — register vendorResolvers
- `apps/server/src/schema/index.ts` — register vendor.graphql
- `apps/server/src/schema/item.graphql` — add `itemCountByVendor` query
- `apps/server/src/resolvers/item.resolver.ts` — add `itemCountByVendor` resolver
- `apps/server/src/resolvers/tag.resolver.ts` — fix cascade for `deleteTag` + `deleteTagType`
- `apps/server/src/models/Vendor.model.test.ts` — new
- `apps/server/src/resolvers/vendor.resolver.test.ts` — new
- `apps/server/src/resolvers/tag.resolver.test.ts` — update cascade tests

### Frontend
- `apps/web/src/apollo/operations/vendors.graphql` — new
- `apps/web/src/hooks/useVendors.ts` — add dual-mode branching
- `apps/web/src/hooks/useVendors.test.ts` — extend with cloud path tests
- `e2e/tests/settings/vendors.spec.ts` — new (cloud mode tests)

## References

- Tags migration PR #115
- `apps/server/src/models/Tag.model.ts` — model pattern
- `apps/server/src/schema/tag.graphql` — schema pattern
- `apps/server/src/resolvers/tag.resolver.ts` — resolver pattern
- `apps/web/src/hooks/useTags.ts` — dual-mode hook pattern
