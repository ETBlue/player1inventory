# Unified item search — PR D-1: make the cloud filter-shelf picker atomic

**Date:** 2026-08-28
**Status:** ✅ Complete — PR #272
**Issue:** [#269](https://github.com/ETBlue/player1inventory/issues/269)
**Depends on:** PR D (`2026-08-28-unified-item-search-plan-d.md`) being merged
**Design doc:** `2026-08-26-unified-item-search-design.md`
**Decision record:** `2026-08-28-brainstorming-filter-shelf-picker.md` (Q4)

## The gap

PR D's filter-shelf picker applies up to two writes in one press:

| Write | Target | Why it is separate |
|---|---|---|
| tag ids + vendor ids | `Item.tagIds`, `Item.vendorIds` | both are global `Item` fields |
| recipe membership | `Recipe.items` | membership lives on the recipe, not the item |

**Local mode is atomic.** `applyShelfFilterPicksBatch` (`apps/web/src/db/operations.ts`)
wraps both in one Dexie transaction over `[db.items, db.recipes]`, modelled on
`applyUnitSwitchBatch`.

**Cloud mode is not.** `useApplyShelfFilterPicks`'s cloud branch does two sequential Apollo
round-trips — `useUpdateItem().mutateAsync(…)` then `useUpdateRecipe().mutateAsync(…)`. If
the second fails, the first stands.

This mirrors the asymmetry `useApplyUnitSwitch` already ships, with one difference worth
naming: `useApplyUnitSwitch` **throws** in cloud and the Info tab keeps a sequential path at
the call site, whereas `useApplyShelfFilterPicks` degrades silently to sequential. That was
deliberate — a filter shelf's tags, vendors and recipes all exist in cloud, so refusing the
feature there would withhold something that otherwise works.

## Why it was deferred, and why that was safe

ETBlue's ruling (2026-08-28): ship PR D web-only, land the resolver as its own reviewable
change. PR D is a UI change; a schema + resolver change has a different blast radius and
different reviewers.

The deferral is safe because **a cloud half-write is benign and self-healing**:

- Nothing *wrong* is persisted — only something *incomplete*. The item gains tags and a
  vendor it was going to gain anyway; it simply is not yet on the recipe.
- The row therefore still fails `matchesFilterConfig` and stays in bucket 2, visible.
- **The retry is idempotent by construction.** Re-pressing recomputes `deriveFilterAxes`
  against fresh data, so the axis that *did* land comes back with `metBy` set, renders
  read-only, and is not written a second time. One more press finishes the job.

Contrast this with the unit switch, where a half-write leaves quantities inconsistent across
locations — which is exactly why that one refuses to run in cloud rather than degrading.

## The work

### 1. Schema

Add to `apps/server/src/schema/` (follow the file layout the shelf/recipe types already use):

```graphql
input ApplyShelfFilterPicksInput {
  itemId: ID!
  "Tag ids to add — one per unmet tag axis. May be empty."
  addTagIds: [ID!]!
  "Vendor ids to add — at most one. May be empty."
  addVendorIds: [ID!]!
  "Recipe to add the item to, when the recipe axis was unmet."
  addRecipeId: ID
}

extend type Mutation {
  applyShelfFilterPicks(input: ApplyShelfFilterPicksInput!): Item!
}
```

Returning `Item!` keeps it consistent with `updateItem`; the recipe side is picked up by the
client's existing `GetRecipes` refetch.

### 2. Resolver

In `apps/server/src/resolvers/shelf.resolver.ts` (the picks belong to a shelf's filter, even
though neither write touches a `Shelf` row — putting it in `item.resolver.ts` would hide the
recipe write from anyone reading the item resolvers).

Use `prisma.$transaction`, as `import.resolver.ts:499` and `purge.resolver.ts:22` already do.
The resolver must:

- **Scope every read and write to the authenticated user** — the same ownership guard the
  neighbouring mutations apply. A picks call naming another user's item or recipe must fail,
  not write.
- **Read current rows inside the transaction** and union the ids, mirroring
  `applyShelfFilterPicksBatch`'s idempotency. Do not trust client-supplied merged arrays:
  the local op deliberately stopped doing that so two quick presses cannot duplicate an id,
  and the cloud path should not reintroduce the bug the local path designed out.
- **Use `|| 1`, not `?? 1`,** for the recipe entry's `defaultAmount` from
  `item.consumeAmount` — `0` is legitimate and means "optional, unchecked" in cooking.
- **Skip the recipe write** when the recipe already holds the item.

### 3. Client

- Add the operation document so codegen produces `useApplyShelfFilterPicksMutation`.
- Replace the cloud branch of `apps/web/src/hooks/useApplyShelfFilterPicks.ts` with a single
  call to it, refetching `GetRecipesDocument` and the item queries with
  `awaitRefetchQueries: true` (matching `useUpdateRecipe`'s cloud branch, which already does
  this — `useRecipes.ts:194,214`).
- Delete the "CLOUD is NOT atomic" paragraph from that hook's doc comment and the pointer to
  this document. **Delete it, do not reword** — the claim becomes false, not imprecise.
- `useUpdateItem` / `useUpdateRecipe` are then no longer called by this hook; remove the two
  now-unused hook calls.

### 4. Tests

- **Resolver tests** (`shelf.resolver.test.ts`): all three writes land; a failing recipe
  write rolls back the item write; re-applying duplicates nothing; `consumeAmount: 0` →
  `defaultAmount: 1`; a call naming another user's item is rejected.
  **Mutation check:** replace `$transaction` with sequential awaits — the rollback test must
  go RED.
- **Web:** the existing `useApplyShelfFilterPicks` local guard is unaffected. Add a cloud
  test only if the file already has a cloud-branch harness; per `hooks/CLAUDE.md`, cloud
  branches in this repo are typically covered at the resolver level instead.

### 5. Docs

- `apps/web/src/hooks/CLAUDE.md` — `useApplyShelfFilterPicks` is atomic in both modes.
- This file — mark ✅ and record the PR number.
- `docs/INDEX.md` — status column.

## Verification gate

The full gate from the repo root, per the root `CLAUDE.md` — and note that **`pnpm test` is
load-bearing here in a way it is not for a web-only change**: this PR's only new logic lives
in a resolver, and lint, Biome and `build-storybook` do not touch `apps/server` at all. The
root `pnpm build` type-checks it but never runs its tests. That combination is exactly how
issue #250's three failing purge tests sat on `main` unnoticed.

Also run `pnpm test:e2e --grep "shelves|vendors-group|recipes-group|items|a11y"`. Expect the
4 known #257 colour-contrast failures and no others.

## Out of scope

- The **local** path. It is already atomic; do not refactor it to share code with the
  resolver — they run against different engines and the duplication is one merge rule.
- Cloud `Location` / `ItemStock`. Unrelated, and tracked separately.
