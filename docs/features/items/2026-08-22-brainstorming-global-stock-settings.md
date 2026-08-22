# Brainstorming — global stock settings vs per-location stock state

**Date:** 2026-08-22
**Participants:** ETBlue (designer), Claude
**Outcome:** design doc `2026-08-22-design-global-stock-settings.md`; tracking issue **#247**

## How this started

Not from this feature. It began as a documentation question — whether two
follow-ups from the merged locations PR were recorded anywhere. One of them was
"four settings assignment UIs still classify with bare `isInactive()` over
`useItems()`", which is a predicate bug.

The designer's response reframed it:

> the settings pages are global (not location specific)

and then, after poking at the running dev server:

> I would like to move some item stock properties with sort of "stock settings"
> concept from location specific item stock fields to global item fields

That is a better diagnosis than the one in the follow-up list. The predicate
misuse is a symptom; the cause is that `ItemStock` conflates two different
kinds of thing.

## The distinction

| | Belongs to | Examples |
|---|---|---|
| **Stock configuration** | the **item** | how it is packaged, measured, expires, is consumed |
| **Stock state** | the **item × location** | how much is here, when this one expires |

Everything the designer listed is configuration. Everything left behind is
state. The line is clean enough that no field needed arguing about.

## What the survey found before any decision was taken

Three findings changed the shape of the work:

1. **Four of the designer's bullets were already satisfied.** All four Settings
   *list* pages (shelves, vendors, recipes, tags) already count globally off
   `useItems()`. The vendor one is deliberate and documented. Nothing to do.

2. **The shelf *filters* tab shows no counts at all.** That bullet is additive,
   not a rescoping.

3. **`RecipeItem.defaultAmount` is already global**, lives on the recipe row,
   and is what cooking consumes (`servings × defaultAmount`).
   `ItemStock.consumeAmount` is a per-location **step size** and is never the
   consumed amount, despite the name. So "decouple the recipe amount" needed no
   migration — only three couplings cut.

   The third of those is a genuine defect: saving **one** location's
   `consumeAmount` or `targetUnit` **rewrites `defaultAmount` on every recipe
   using that item** (`items/$id/stock.tsx:228-308`). Change a step size at the
   cabin, every recipe rescales.

   Notably, the field move **rehabilitates** that behaviour rather than deleting
   it: once `targetUnit` is global, a g → kg switch invalidating a global recipe
   amount is a coherent global→global operation.

## Q1 — where do the now-global fields get edited?

Options: a global section above the Stock-tab pager; move them to the Info tab;
or a new fifth tab.

**Answer: move them to the Info tab.**

Info becomes "everything global about this item"; Stock becomes purely the
per-location numbers. The strongest conceptual split of the three, at the cost
of relearning where the unit fields live. The alternative — a divider on the
Stock tab — keeps muscle memory but leaves the tab meaning two things.

## Q2 — migration collapse rule

An item stocked in three locations has three values per field. One must win.

**Answer: the default location's value; the oldest `ItemStock` row as fallback**
when the item is not stocked at the default location.

Deterministic and explainable. Rejected: *most recently updated* — `updatedAt`
also moves on quantity edits, so the winner would often be whichever location
was last shopped for, not where the units were set. Rejected: *most common
value* — decides each field independently, so one item can end up with a mix of
rows.

## Q3 — `expirationThreshold`

Not in the designer's list. Asked because leaving it behind splits expiration
config across both models while `expirationMode` and `estimatedDueDays` move.

**Answer: move it global too.** Eight fields, not seven.

## Q4 — sequencing

**Answer: field move first (PR 1), Settings pages second (PR 2).**

The move makes PR 2 simpler to state and removes the need for an interim answer
to "what should the recipe stepper step by" — with `consumeAmount` global, it
just uses it.

## Related

- Tracking issue **#247** (both parts).
- Unblocks **#245** — "create globally, attach, don't stock anywhere" is the
  affordance whose absence leaves create-from-search with only bad options.
