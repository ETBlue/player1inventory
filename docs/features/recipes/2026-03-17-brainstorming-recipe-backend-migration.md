# Brainstorming — Recipe Backend Migration

**Date:** 2026-03-17
**Branch:** `feature/backend-recipes-migration`

## Questions & Answers

**Q1 — RecipeItem storage in cloud mode**

Options:
- A: Store `itemId` as plain string (consistent with how items store `vendorIds: string[]`)
- B: Use MongoDB `Ref<Item>` (enables `.populate()` but adds schema/resolver complexity)

User answer: Plain string (Option A). Cascade deletion handles orphan itemIds anyway.

---

**Q2 — `lastCookedAt` in cloud mode**

Should it be stored in MongoDB or kept local-only?

User answer: Store in MongoDB (Option A). Behavior is naturally scoped:
- User-private recipe (no `familyId`) → `lastCookedAt` is user-specific
- Family-shared recipe (`familyId` set) → `lastCookedAt` is family-specific (any member cooking updates the same document field)

No extra design needed — document ownership handles both cases.

---

**Q3 — Cascade deletion**

When a recipe is deleted: no outward cascade needed (nothing references recipes by ID from items).

When an item is deleted: it should be removed from all recipes that reference it via `recipe.items[].itemId`.

User answer: Cascade deletion in both backend (MongoDB resolver) and local (IndexedDB operations — already implemented).

Backend cascade: in `deleteItem` resolver, add:
```ts
await RecipeModel.updateMany(
  { userId, 'items.itemId': id },
  { $pull: { items: { itemId: id } } }
)
```

---

**Q4 — Family sharing**

User answer: Yes — support family sharing with `userId` + optional `familyId`, same pattern as tags and vendors.

---

**Q5 — Scope and milestone**

User answer:
- Milestone: `v0.2.0 — Cloud Foundation`
- Item cascade (`deleteItem` removes from recipes) is in scope for this PR

---

## Final Decisions

| Decision | Choice |
|----------|--------|
| RecipeItem storage | Plain `itemId` string |
| `lastCookedAt` | Stored on Recipe document (user/family-scoped naturally) |
| Cascade on recipe delete | No outward cascade needed |
| Cascade on item delete | Backend resolver + IndexedDB (already done) |
| Family sharing | Yes — `userId` + `familyId?` |
| Milestone | `v0.2.0 — Cloud Foundation` |
| Item cascade scope | In this PR |
