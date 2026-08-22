# Brainstorming — unified group visibility across pantry, shopping & cooking

**Date:** 2026-08-21
**Participants:** ETBlue (designer), Claude
**Outcome:** design doc `2026-08-21-design-unified-group-visibility.md`

## The opening question

> I would like to have the same visibility logic for location aware pantry,
> shopping and cooking. any idea?

## What the code actually said

Before proposing anything, the three surfaces were read to find out where they
genuinely diverge. The answer reframed the question.

**The item-level rule is already unified.** All three surfaces show an item only
where it is stocked in the active location. They reach that state by two
different mechanisms, which is why it looked inconsistent:

| Surface | Data source | How unstocked items are excluded |
|---|---|---|
| Pantry `/` | `useStockedItems()` | never arrive — `getStockedItems()` starts from the location's `ItemStock` rows |
| Shopping | `useItems()` | arrive with `ZERO_STOCK`, filtered out by `isStockedHere` at the component |
| Cooking | `useItems()` | same, via the `isItemAvailable` gate at `cooking.tsx:117` |

**The group-level rule is what varies — three surfaces, three answers:**

| Surface | Group with 0 items stocked here | Mechanism |
|---|---|---|
| Pantry `/` | **shown**, reads `0` | `sortedShelves` is unfiltered (`ShelfGroupView.tsx:189`) |
| Shopping `/shopping` | **hidden** | `if (availableCount === 0) return null` (`index.tsx:218`) |
| Cooking `/cooking` | **disabled**, greyed | `isRecipeUnavailable` (`cooking.tsx:570`) |

## The reframing

These are not three competing answers to one question. They are answers to **two
different questions** that had been collapsed into one:

- **Visibility** — "does this group exist here?" This should not vary by surface.
- **Interactivity** — "would the primary action do anything here?" This
  legitimately varies, because the primary actions differ.

Cooking's checkbox *consumes stock*, so with nothing stocked here it is a
guaranteed no-op → disable is correct. Shopping's card *opens a cart* and
pantry's *opens a list* — both remain meaningful at zero, because that is exactly
where a user would go to add something. Split along those two axes, one rule
explains all three surfaces with no per-surface special cases, and cooking's
disable stops being an inconsistency.

## Q1 — which way should the unified visibility rule go?

Three options were offered:

- **A. Always show, badge `0 here`** (pantry's rule everywhere) — recommended
- **B. Always hide at 0** (shopping's D2 rule everywhere)
- **C. Always show but disable at 0** (cooking's rule everywhere)

**Answer: A, plus an addition** —

> option 1 + move the card to the bottom of the list, with a group title styled
> similar to the "inactive" text row in item list

The addition is better than the recommendation it amended. Plain "always show"
would have left zero-here groups interleaved among stocked ones, trading
shopping's *invisible* groups for a *diluted* list. Sinking them below a divider
keeps the working set at the top while leaving everything reachable — and it
reuses an idiom the app already has, rather than inventing a new affordance.

**Rejected, and why:**

- **B (hide everywhere)** would strip the pantry of its shelf structure whenever
  the user switches to a sparse location, and would render a near-blank app at a
  freshly created one.
- **C (disable everywhere)** blocks the only path to adding items to an empty
  vendor or shelf — visible but unreachable is worse than either alternative.

**Consequence accepted:** this reverses decision **D2** from the
location-aware-shopping-cooking round earlier the same day ("hide vendors at 0",
chosen to match the no-vendor card). D2 is what produced the known follow-up
"`/shopping` has no empty state when every vendor is hidden" — under the new rule
nothing is hidden, so there is no empty state to design.

## Q2 — divider copy

Asked because it is user-facing copy in two languages and should not be guessed.
Options offered: `N not stocked here`, `N with nothing here`, `N empty here`.

**Answer:**

> EN: "N not stocked here"; TW: "此據點無庫存的 N 項"

`N empty here` was the shortest but was flagged as risky in the question itself:
"empty" already means *below refill threshold* on the cooking status line and the
pantry group cards, so it would have been overloaded against existing copy.

## Incidental finding — the divider is copy-pasted five times

Locating the "inactive" row the designer referred to turned up five copies:
`PantryListView.tsx:284`, `VendorDetailView.tsx:182`, `RecipeDetailView.tsx:204`,
`ShelfDetailView.tsx:336`, and `shopping/$vendorId.tsx:379`.

Only the cart page is translated (`t('shopping.inactiveItems')`). **The four
pantry views hardcode English**, including a hand-rolled `!== 1 ? 's' : ''`
plural that no locale can override — a live i18n bug in the Chinese UI, not a
hypothetical one.

Decision: extract a shared divider component rather than add a sixth copy, and
fix the four hardcoded rows as a side effect. This is the "targeted improvement
to code you are working in" case, not unrelated refactoring — the new divider
*is* the fifth call site.

## Open judgement call, deferred to implementation

The `Unsorted` / `No vendor` pseudo-cards currently hide at 0
(`VendorGroupView.tsx:156`, `RecipeGroupView.tsx:164`). Under the new rule they
must distinguish two cases that both read as "0":

- nothing is unfiled anywhere → stay hidden, the bucket is genuinely empty
- unfiled items exist but none here → drop to the bottom section

The design implements that split. Flagged to the designer as the one judgement
call, with an explicit invitation to overrule in favour of "keep hiding".

## Related

- Reverses D2 in [`2026-08-21-design-location-aware-shopping-cooking.md`](./2026-08-21-design-location-aware-shopping-cooking.md)
- Issue **#245** (duplicate `Item` on create-from-search) becomes *reachable*
  rather than hidden behind a vanished vendor. Not fixed here.
