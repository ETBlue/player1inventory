# Brainstorming — location-aware shopping & cooking

**Date:** 2026-08-21
**Participants:** ETBlue (designer), Claude
**Outcome:** [design doc](2026-08-21-design-location-aware-shopping-cooking.md)

## Opening request (verbatim)

> * shopping cart page: show active location in the top bar, same visual as pantry shelf page
> * shopping page: show inactive item count in the cart card based on active location
> * cooking page: show stock status info in the recipe card. disable recipes with no item stocked in active location

## Survey before asking

Read `routes/shopping/index.tsx`, `routes/shopping/$vendorId.tsx`, `routes/cooking.tsx`,
`components/shopping/VendorCartCard`, `components/shared/LocationSwitcher`,
`components/shared/GroupCard`, `components/pantry/RecipeGroupView`,
`hooks/useVendorItemCounts.ts`, `lib/quantityUtils.ts`, `db/operations.ts`.

Findings that shaped the questions:

- **"Same visual as pantry shelf page"** resolves cleanly — every other main page
  already mounts the shared `<LocationSwitcher />` first in its `<Toolbar>`. The
  cart page is the only one missing it. No new visual to design.
- **"Inactive" is an existing domain term**, not an ad-hoc phrase:
  `isInactive(item) === (item.targetQuantity === 0)`, used in 14 files. So the
  request was not about inactive *locations*.
- **"Stock status" is also an existing term** — `getStockStatus()` returns
  `error | warning | ok`. And `GroupCard` already renders the exact idiom for
  recipes on the pantry's recipe group view: `{active} / {total} active ·
  {n} empty · {n} low stock`. So change 3 had a precedent to copy rather than a
  visual to invent.
- **Cooking already computes availability correctly** (`isItemAvailable`,
  `cooking.tsx:119`) and already excludes unavailable items from the tri-state
  checkbox. Only the *display* and the *disabled state* are missing.

## Q1 — Which branch?

**Asked because:** PR E (#241) was open, and its own docs already flip the
Locations feature to ✅ Implemented, "all 5 PRs landed". Adding three page-level
features would contradict that and bloat a PR already through four review waves.

**Answer:** new branch off `main`.

**Rationale:** these depend on PR D's `ItemStock` split, which is already on main —
not on PR E's pager. So the new branch needed no wait and PR E stayed scoped to
its title. (ETBlue then asked to merge PR E and clean up first, which was done:
merge commit `b2bf87c2`.)

## Q2 — What counts as "inactive" on the cart card?

**Asked because:** after the `ItemStock` split an item can be in three states
relative to the active location — stocked and active, stocked with
`targetQuantity` 0, or **never stocked here at all**. At a second location the
third bucket is the large majority, and the three readings give very different
numbers on the card.

**Answer:** **strict** — inactive means *has a stock row here* with
`targetQuantity === 0`. Items not stocked here drop out of the card's counts
entirely, and the existing "in vendor" figure becomes location-scoped.

**Rationale:** matches how the pantry already behaves — `getStockedItems()` hides
items with no row in the active location, so the cart card agreeing with the
pantry beside it beats preserving a global total that no other surface shows.

**Consequence found while writing the design doc:** this ruling *cannot* be
implemented with `isInactive()` alone. `joinItemStock` gives unstocked items
`ZERO_STOCK`, whose `targetQuantity` is 0 — so `isInactive()` returns `true` for
an item that is merely not stocked here. Every new count needs a `stockId` guard.
Recorded prominently in the design doc; it is the same class of bug PR D shipped
four times.

## Q3 — What does "stock status info" mean on the recipe card?

**Asked because:** "stock status" is a precise term in this codebase (the
empty/low-stock health signal), but *availability* is what actually drives the
disabling requested in the same sentence. Both readings are plausible and produce
different cards.

**Answer:** **both** — `3 / 5 here · 1 empty · 1 low stock`.

**Rationale:** availability explains the disabled state (the user can see *why* a
recipe is greyed out), and health is the signal `GroupCard` already gives for the
same recipes on the pantry. Reusing that row-3 idiom means no new visual language
and no new colour decisions.

## Decisions not escalated

Made directly, as routine judgment:

- Use the shared `LocationSwitcher` component for change 1 rather than a
  read-only lookalike — that *is* "same visual as pantry shelf page", and it
  keeps one component to maintain.
- Keep it **interactive**. Switching location inside a cart swaps which cart you
  are editing (carts are keyed `${locationId}:${vendorId}`), but nothing is
  destroyed and switching back restores it — so no confirm dialog.
- Reuse `GroupCard`'s status colours and separator-dot layout rather than
  designing a new metadata treatment.
- Leave `GroupCard`'s hardcoded English strings alone (pre-existing debt; fixing
  them would widen the diff across every pantry group view).
