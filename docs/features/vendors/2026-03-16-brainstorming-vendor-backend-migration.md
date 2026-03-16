# Brainstorming: Vendor Backend Migration

**Date:** 2026-03-16

## Questions & Answers

**Q1: What is the scope of this migration?**
Same as the tags migration (PR #115): server-side Typegoose model + GraphQL schema + resolver with full CRUD, frontend dual-mode hooks branching on `useDataMode()`, Apollo operations + codegen, unit tests (both modes), E2E cloud tests.

**Q2: How should cascade deletion work when a vendor is deleted?**
Two changes:
- **Local mode**: already a DB operation inside `deleteVendor` in `operations.ts` — confirmed correct, no change needed
- **Cloud mode**: server-side resolver handles cascade (deletes vendor AND removes vendorId from all item `vendorIds[]` arrays atomically)
- **Also**: add the same server-side cascade to the existing `deleteTag` and `deleteTagType` resolvers, which currently only delete the record without cleaning up items

**Q3: Should `itemCountByVendor` be a backend GraphQL query?**
Yes — add as a Query to the backend. Following the existing pattern, it belongs in `item.graphql` and `item.resolver.ts` (same location as `itemCountByTag`), and in `items.graphql` Apollo operations on the frontend.

**Q4: Any vendor-specific edge cases?**
No — vendors are simpler than tags (no type hierarchy, flat list of names).

## Final Decision

Vendors backend migration with these specifics:
1. Server: `Vendor.model.ts`, `vendor.graphql`, `vendor.resolver.ts` with cascade deletion
2. Server: Fix `tag.resolver.ts` `deleteTag` / `deleteTagType` to cascade into items
3. Server: Add `itemCountByVendor` to `item.graphql` + `item.resolver.ts`
4. Frontend: Dual-mode `useVendors.ts` hooks + `vendors.graphql` Apollo operations + codegen
5. Tests: Vendor model test, vendor resolver test, updated `useVendors.test.ts` (local + cloud), E2E cloud tests
