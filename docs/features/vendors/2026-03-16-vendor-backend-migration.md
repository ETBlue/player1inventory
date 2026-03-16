# Vendor Backend Migration — Implementation Plan

**Date:** 2026-03-16
**Branch:** `feature/backend-vendors-migration`
**Design doc:** `2026-03-16-vendor-backend-migration-design.md`

## Steps

### Step 1 — Server: Vendor model, schema, resolver

**Files:**
- `apps/server/src/models/Vendor.model.ts` (new)
- `apps/server/src/schema/vendor.graphql` (new)
- `apps/server/src/resolvers/vendor.resolver.ts` (new)
- `apps/server/src/resolvers/index.ts` (register vendorResolvers)
- `apps/server/src/schema/index.ts` (register vendor.graphql)

**Vendor.model.ts** — mirrors Tag.model.ts:
```ts
@modelOptions({ schemaOptions: { timestamps: false, collection: 'vendors' } })
@index({ userId: 1, name: 1 })
@index({ familyId: 1, name: 1 })
class VendorClass implements Omit<Vendor, 'id'> {
  name, userId (required), familyId (optional)
}
export const VendorModel = getModelForClass(VendorClass)
```

**vendor.graphql** — Vendor type + Query (vendors) + Mutation (createVendor, updateVendor, deleteVendor).

**vendor.resolver.ts** — full CRUD. `deleteVendor` uses:
```ts
await ItemModel.updateMany({ userId, vendorIds: id }, { $pull: { vendorIds: id } })
await VendorModel.deleteOne({ _id: id, userId })
```

**Verification gate:**
```bash
(cd apps/server && pnpm build)
(cd apps/server && pnpm test)
```

---

### Step 2 — Server: Fix tags cascade deletion

**Files:**
- `apps/server/src/resolvers/tag.resolver.ts` (update deleteTag + deleteTagType)

**deleteTag fix:**
```ts
await ItemModel.updateMany({ userId, tagIds: id }, { $pull: { tagIds: id } })
await TagModel.deleteOne({ _id: id, userId })
```

**deleteTagType fix:**
1. Find all tags of that typeId for this userId
2. Bulk remove their IDs from items: `ItemModel.updateMany({ userId, tagIds: { $in: tagIds } }, { $pull: { tagIds: { $in: tagIds } } })`
3. Bulk delete tags: `TagModel.deleteMany({ typeId: id, userId })`
4. Delete tag type: `TagTypeModel.deleteOne({ _id: id, userId })`

**Update `tag.resolver.test.ts`** to assert items are cleaned up after cascade deletion.

**Verification gate:**
```bash
(cd apps/server && pnpm build)
(cd apps/server && pnpm test)
```

---

### Step 3 — Server: Add `itemCountByVendor` to item schema + resolver

**Files:**
- `apps/server/src/schema/item.graphql` (add query)
- `apps/server/src/resolvers/item.resolver.ts` (add resolver)

**item.graphql addition:**
```graphql
itemCountByVendor(vendorId: String!): Int!
```

**item.resolver.ts addition:**
```ts
itemCountByVendor: async (_, { vendorId }, ctx) => {
  const userId = requireAuth(ctx)
  return ItemModel.countDocuments({ userId, vendorIds: vendorId })
},
```

**Verification gate:**
```bash
(cd apps/server && pnpm build)
(cd apps/server && pnpm test)
```

---

### Step 4 — Server: Model + resolver tests

**Files:**
- `apps/server/src/models/Vendor.model.test.ts` (new)
- `apps/server/src/resolvers/vendor.resolver.test.ts` (new)

Mirror `Tag.model.test.ts` and `tag.resolver.test.ts` patterns:
- Model test: create, index shape
- Resolver tests: `vendors`, `createVendor`, `updateVendor`, `deleteVendor` (assert cascade removes vendorId from items), `itemCountByVendor`

**Verification gate:**
```bash
(cd apps/server && pnpm build)
(cd apps/server && pnpm test)
```

---

### Step 5 — Frontend: Apollo operations + codegen

**Files:**
- `apps/web/src/apollo/operations/vendors.graphql` (new)
- Run codegen to update `apps/web/src/generated/graphql.ts`

**vendors.graphql:**
```graphql
query GetVendors {
  vendors { id name userId familyId }
}
mutation CreateVendor($name: String!) {
  createVendor(name: $name) { id name userId }
}
mutation UpdateVendor($id: ID!, $name: String) {
  updateVendor(id: $id, name: $name) { id name }
}
mutation DeleteVendor($id: ID!) {
  deleteVendor(id: $id)
}
```

Also add `ItemCountByVendor` to `items.graphql`:
```graphql
query ItemCountByVendor($vendorId: String!) {
  itemCountByVendor(vendorId: $vendorId)
}
```

**Run codegen:**
```bash
(cd apps/web && pnpm codegen)
```

**Verification gate:**
```bash
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL: deprecated imports found" || echo "OK"
```

---

### Step 6 — Frontend: Dual-mode `useVendors.ts` hooks

**Files:**
- `apps/web/src/hooks/useVendors.ts` (update)

Extend each hook to branch on `useDataMode()` — identical pattern to `useTags.ts`:
- `useVendors()` — local: TanStack Query + `getVendors`; cloud: `useGetVendorsQuery`
- `useCreateVendor()` — local: useMutation; cloud: `useCreateVendorMutation`
- `useUpdateVendor()` — local: useMutation; cloud: `useUpdateVendorMutation`
- `useDeleteVendor()` — local: useMutation (cascade already in DB op); cloud: `useDeleteVendorMutation` (cascade in resolver)
- `useItemCountByVendor(vendorId)` — local: TanStack Query; cloud: `useItemCountByVendorQuery`

**Verification gate:**
```bash
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
(cd apps/web && pnpm build-storybook)
(cd apps/web && pnpm check)
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL: deprecated imports found" || echo "OK"
```

---

### Step 7 — Frontend: Hook tests + E2E cloud tests

**Files:**
- `apps/web/src/hooks/useVendors.test.ts` (extend with cloud paths)
- `e2e/tests/settings/vendors.spec.ts` (new — cloud mode tests)

**useVendors.test.ts** — add cloud path tests for all 5 hooks, mirroring `useTags.test.ts` structure.

**vendors.spec.ts** — cloud E2E tests: create vendor, rename vendor, delete vendor (assert item no longer shows vendor), `itemCountByVendor` display.

**Final verification gate (full quality gate):**
```bash
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
(cd apps/web && pnpm build-storybook)
(cd apps/web && pnpm check)
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL: deprecated imports found" || echo "OK"
pnpm test:e2e --grep "vendors|tags"
```

---

## Commit Plan

| Commit | Files |
|---|---|
| `feat(vendors): add Typegoose model, GraphQL schema, and resolver with cascade deletion` | model, schema, resolver, index registrations |
| `fix(tags): add server-side cascade deletion to deleteTag and deleteTagType resolvers` | tag.resolver.ts, tag.resolver.test.ts |
| `feat(vendors): add itemCountByVendor GraphQL query` | item.graphql, item.resolver.ts |
| `test(vendors): add server-side model and resolver tests` | Vendor.model.test.ts, vendor.resolver.test.ts |
| `feat(vendors): add Apollo operations and run codegen` | vendors.graphql, items.graphql, generated/ |
| `feat(vendors): add dual-mode useVendors hooks` | useVendors.ts |
| `test(vendors): add cloud path hook tests and E2E vendor cloud tests` | useVendors.test.ts, vendors.spec.ts |
