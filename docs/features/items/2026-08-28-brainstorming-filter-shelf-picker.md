# Brainstorming — filter-shelf per-axis picker (PR D)

**Date:** 2026-08-28
**Branch:** `feature/unified-item-search-d`
**Design doc:** `2026-08-26-unified-item-search-design.md` (the semantics were settled there
— "apply the whole filter, with a picker on every OR'd axis"; this session settled only the
UI shape and the edge rulings the design left open)

## Q1 — How does a bucket-2 tail row present the per-axis picks?

**Options offered:** dialog on press · inline pickers in the row · popover on the button.

**ETBlue chose: dialog on press.** The row keeps a plain `Add to shelf` button, identical to
the one selection shelves already render. Pressing it opens a modal dialog with one radio
group per axis. When every axis is already settled — satisfied by the item, or offering
exactly one option — the press applies immediately and **no dialog opens**, which is the
design doc's "the picker collapses to a plain button on the common single-tag-type shelf".

**Rationale:** the tail is a dense, mobile-first list. Inline selects would grow every row by
one control per axis and repeat the same three dropdowns down the whole section. A popover
would need a `Popover` primitive that `components/ui/` does not have.

## Q2 — Which axes does the dialog show?

**Options offered:** only the failing axes · every axis, satisfied ones shown as met.

**ETBlue chose: every axis, satisfied ones shown as met.** An axis the item already satisfies
renders read-only as `✓ <name>` — no radio, and **it is never written**. Only unsatisfied axes
are mutated, so an item already tagged `Frozen` never gains a second Category tag.

**Rationale:** the dialog then explains *why* the item did not match, rather than silently
asking about one axis out of three. The cost is a slightly longer dialog.

## Q3 — Two non-atomic writes: what happens when the second fails?

ETBlue did not pick from the offered options and asked instead: **"is it possible to wrap the
2 writes into 1 transaction?"**

**Answer: yes in local mode.** `db/operations.ts:442`'s `applyUnitSwitchBatch` already does
exactly this shape — `db.transaction('rw', [db.items, db.itemStocks, db.recipes], …)`. The
picker writes only `Item.tagIds` / `Item.vendorIds` (both global `Item` fields — no
`ItemStock`) and `Recipe.items`, so one `rw` transaction over `[db.items, db.recipes]` covers
it.

**Decision: local mode is atomic**, via a new `applyShelfFilterPicksBatch`.

## Q4 — Can cloud be atomic too?

ETBlue asked: **"for cloud mode, is it possible to create a GraphQL mutation that covers the
2 writes?"**

**Answer: yes.** `prisma.$transaction` is already used server-side (`import.resolver.ts:499`,
`purge.resolver.ts:22`), so a resolver could wrap both writes.

**Options offered:** add it now · ship the `useApplyUnitSwitch` asymmetry · server mutation as
its own follow-up.

**ETBlue chose: server mutation as its own follow-up (PR D-1).** PR D ships web-only with a
sequential cloud path; cloud atomicity lands as an independently reviewable change. See
`2026-08-28-unified-item-search-plan-d1-cloud-transaction.md`.

**Rationale:** the same end state, reached in two reviewable steps. PR D stays a UI change a
reviewer can weigh without also reviewing a schema change.

## Q5 — How does a failed write surface?

**Options offered:** dialog stays open with an inline error · close and stay silent · toast.

**ETBlue chose: dialog stays open, inline error.** Follows the repo's stated convention (the
InfoForm pattern — "inline error messages (not toast)"). Add re-enables so the user can retry.

**Note this diverges deliberately from the four shipped tail surfaces**, where
`useItemSearchTailWiring`'s documented empty `catch` swallows every group-action failure. A
two-write action failing halfway is a worse thing to hide than a one-write action, and the
dialog gives the error somewhere to live that a bare row does not.

## Ruling made during the design presentation (not a question)

**An unsatisfiable axis is a property of the shelf, not the row.** An axis is unsatisfiable
when every id on it points at a deleted entity: a recipe axis naming only deleted recipes, or
a vendor axis naming only deleted vendors. We must not write a dangling `vendorId` onto an
item merely to satisfy `matchesFilterConfig`'s `includes` check, so such an axis genuinely
cannot be satisfied by any press.

Because that depends only on `filterConfig` + the vendor/recipe catalogs — never on the item —
a shelf with any unsatisfiable axis keeps today's inert `groupNote` for the **whole** section,
rather than offering a button that cannot work. `ItemSearchTail`'s `groupAction` is one
descriptor for the entire section, so a per-row fallback was never available anyway.

**Tag axes can never be unsatisfiable**: `matchesFilterConfig` resolves each configured tag id
through `tags.find` and skips the ones that miss, so an all-dangling tag axis creates no entry
in `tagIdsByType` and is simply not a constraint.

## Confirmed while gathering context

- **`RadioGroup` is the right primitive.** `components/ui/radio-group.tsx` looked unused and
  off-token, but `AddShelfDialog.tsx:119-138` already renders it — so the picker follows an
  established in-repo dialog idiom rather than introducing one.
- **The tag axis label is the tag *type* name** (`Category`, `Storage`), which is what makes a
  multi-tag-type shelf legible. Vendor and recipe axis labels are translated strings.

## Approved scope

`ItemSearchTail` and `useItemSearchTailWiring` are **untouched** — the design doc promised
"nothing else about the wiring changes when that lands", and nothing does.

## Addendum — 2026-08-28 (later same day, decision reversed)

Q1's recorded answer above — "When every axis is already settled ... the press applies
immediately and **no dialog opens**" — is **historical**, left as written since this section
is the record of the original session, not of current behaviour. Later the same day the
designer reversed the bypass: pressing `Add to shelf` on a filter shelf now **always** opens
the dialog, regardless of how many options each axis offers. Their words: "the concept is to
provide a chance to double confirm the tags/vendors/recipes that are about to be applied to
the item."

**The dialog's rendering did not change.** A single-option axis still pre-selects that option
(`defaultPicksFor`, unchanged), so Confirm is enabled the instant the dialog opens — the user
sees the pick and presses Add once. What changed is entirely in `ShelfDetailView.tsx`:
`groupAction.onAction` used to branch on `open.every((a) => a.options.length === 1)` and call
`applyFilterPicks` directly in the true case; that branch is deleted, and the handler now
always calls `setPicksItem(item)`.

See the dated addendum in `2026-08-26-unified-item-search-design.md`'s "Filter shelves"
section for the same reversal recorded against the design doc.
