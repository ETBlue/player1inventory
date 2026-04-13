# Brainstorming Log — Rename index.tsx to ComponentName.tsx

**Date:** 2026-04-13
**Design doc:** `2026-04-13-rename-index-tsx-design.md`

## Questions and Answers

**Q: Should route `index.tsx` files in `src/routes/` be included?**
A: No. TanStack Router uses `index.tsx` as a routing convention — renaming would break routing. Routes are out of scope.

**Q: Should we keep the per-component directory structure, or flatten?**
A: Keep directories. `ItemCard/` stays as a folder grouping the component, stories, and tests together.

**Q: What happens to existing import paths like `@/components/item/ItemCard`?**
A: Add a thin barrel `index.ts` with `export * from './ComponentName'`. All existing imports continue to resolve via the barrel.

**Q: Should the barrel export stories and tests too?**
A: No — only the component file. Stories and tests are never imported by other modules.

**Q: Rename all 39 at once or phase by domain?**
A: All 39 in one PR. Consistent immediately, no mixed state.

## Final Decision

- Rename `index.tsx` → `ComponentName.tsx` inside each component directory (keep directories)
- Add barrel `index.ts` re-exporting only from `ComponentName.tsx`
- All 39 components in one branch, one PR
- Routes untouched
