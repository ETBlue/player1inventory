# Unified group visibility across pantry, shopping & cooking

**Date:** 2026-08-21
**Branch:** `worktree-feature-location-aware-shopping-cooking` (PR #244 — folded in)
**Base:** `2da81627`
**Spec origin:** designer session 2026-08-21, logged in
[`2026-08-21-brainstorming-unified-group-visibility.md`](./2026-08-21-brainstorming-unified-group-visibility.md)

Follow-on to the location-aware shopping & cooking work in the same PR. That
round made each surface *location-aware*; it did not make them *agree*. A shelf,
vendor or recipe with nothing stocked at the active location is shown by the
pantry, hidden by shopping, and disabled by cooking. This unifies the rule.

## Designer ruling (verbatim)

> option 1 + move the card to the bottom of the list, with a group title styled
> similar to the "inactive" text row in item list

and, on copy:

> EN: "N not stocked here"; TW: "此據點無庫存的 N 項"

## The rule

Two axes, applied identically on all five list surfaces.

| Axis | Rule | Varies by surface? |
|---|---|---|
| **Visibility** | A group always renders if it exists. Never hidden for having nothing here. | No |
| **Order** | Groups with nothing stocked here sort **below** all stocked groups, under a divider. | No |
| **Interactivity** | Disabled **only** when the primary action is a provable no-op. | Yes — see below |

Interactivity is the one axis that legitimately differs, because the primary
actions differ:

- **Cooking** — the recipe checkbox *consumes stock*. With nothing stocked here
  it can only ever be a no-op → **disabled** (unchanged from today).
- **Shopping** — the card *opens a cart*. Still meaningful at zero: it is the
  path to adding items here → **enabled**.
- **Pantry** — the card *opens a list*. Same → **enabled**.

This is what makes cooking's `isRecipeUnavailable` stop looking like an
inconsistency: it is not a visibility decision at all.

## ⚠️ The `stockId` trap still applies

Unchanged from the previous round's doc, and load-bearing here. `joinItemStock`
(`db/operations.ts:290`) gives an item with **no** stock row in the requested
location `ZERO_STOCK`, whose `targetQuantity` is `0` and which carries **no
`stockId`**. So `isInactive(item)` returns `true` for an item merely *not stocked
here*.

Every partition added by this work must decide "is this group stocked here?"
via `stockId`, never via `isInactive`. The predicate is `isStockedHere`, already
in `quantityUtils.ts:281`.

**Note the two data sources behave differently and this is by design:**

| Hook | Returns | `stockId` guard needed? |
|---|---|---|
| `useStockedItems()` (pantry) | only items with an `ItemStock` row here | **no** — unstocked items never arrive |
| `useItems()` (shopping, cooking) | all items, joined with here's stock | **yes** — unstocked items arrive zeroed |

Do not "unify" these two hooks. The pantry genuinely wants the narrow set; the
other two surfaces need the full catalog for other reasons (cart membership,
recipe composition).

## Task 1 — extract the shared section divider

The row the designer referred to is copy-pasted **five** times:

| Site | Translated? |
|---|---|
| `components/pantry/PantryListView.tsx:284` | ❌ hardcoded EN |
| `components/pantry/VendorDetailView.tsx:182` | ❌ hardcoded EN |
| `components/pantry/RecipeDetailView.tsx:204` | ❌ hardcoded EN |
| `components/pantry/ShelfDetailView.tsx:336` | ❌ hardcoded EN |
| `routes/shopping/$vendorId.tsx:379` | ✅ `t('shopping.inactiveItems')` |

The four pantry copies hardcode English *and* a hand-rolled
`{n !== 1 ? 's' : ''}` plural that no locale can override. **This is a live i18n
bug in the Chinese UI**, not a hypothetical one — fixing it is in scope because
the new divider is the sixth call site and must not become a sixth copy.

Create `components/shared/ListSectionDivider` (directory + `ListSectionDivider.tsx`
+ barrel `index.ts`, per the project's component convention):

```tsx
// Full-width label separating a list into sections — the "N inactive items" row
// the pantry and cart pages have always had, and now the "N not stocked here"
// row on group lists. Callers pass an already-translated label.
export function ListSectionDivider({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background-surface px-3 py-2 text-foreground-muted text-center text-sm">
      {children}
    </div>
  )
}
```

Replace all five sites. The four pantry sites switch to
`t('shopping.inactiveItems', { count })` — **reuse the existing key**, do not
mint a pantry-specific duplicate; the string is identical and already has both
plural forms in both locales.

> Consider whether the key still belongs under `shopping.` once four pantry
> views use it. Moving it is optional and, if done, must update both locale
> files and all five call sites in the same commit.

**Commit 1** — pure refactor plus the i18n fix. No behaviour change beyond the
four rows becoming translatable.

## Task 2 — the partition helper

> **As built: `hasStockHere` was never shipped.** It was written in `e1ce18b6`
> and deleted again in `96327c65` before the branch landed, because it ended up
> with no production caller: every one of the five surfaces already had a
> location-scoped count of its own and inlines its own predicate against it —
> the pantry views on `useStockedItems()` list lengths, shopping on
> `useVendorCartCounts()`, cooking on `availableRecipeItems.length`. Shipping it
> would have been dead code. `isStockedHere` (which the spec below builds on)
> does exist in `lib/quantityUtils.ts`; `hasStockHere` does not — do not go
> looking for it. The spec below is kept as written so the reasoning stays
> legible.

Add to `lib/quantityUtils.ts`, beside `isStockedHere`:

```ts
// True when at least one of the group's items is stocked in the active
// location. Groups for which this is false sink below the "not stocked here"
// divider on every group list.
export function hasStockHere(items: { stockId?: string }[]): boolean {
  return items.some(isStockedHere)
}
```

**Cloud mode has no `ItemStock` backend**, so cloud items never carry a
`stockId` and `hasStockHere` would report *every* group as unstocked. Every call
site must bypass it in cloud mode, following the existing precedent at
`cooking.tsx:113`:

```ts
const isUnstockedHere = !isCloud && !hasStockHere(groupItems)
```

Ship this with Task 3 rather than alone — a predicate with no caller is not
independently verifiable.

## Task 3 — apply the partition to all five list surfaces

Partition **after** the existing sort, so ordering is preserved *within* each
half. Never sort by stocked-ness as a primary key — that would silently discard
the user's chosen sort.

```ts
const stocked = sorted.filter((g) => !isUnstockedHere(g))
const unstocked = sorted.filter((g) => isUnstockedHere(g))
```

Render `stocked`, then — only when `unstocked.length > 0` — the divider, then
`unstocked`.

### 3a. Pantry group views

`components/pantry/ShelfGroupView.tsx`, `VendorGroupView.tsx`,
`RecipeGroupView.tsx`.

These read from `useStockedItems()`, so an unstocked group is simply one whose
item list is empty — no `stockId` guard needed, and no cloud bypass (`isCloud`
is not even in scope in these components). Partition on the count each view
already computes (`getItemCount(shelf.id)` and its vendor/recipe equivalents).

Existing sort to preserve: shelves by `order` (`ShelfGroupView.tsx:189`),
vendors and recipes by their current comparator.

### 3b. Shopping vendor list

`routes/shopping/index.tsx:215-218`. **Delete** the early return:

```ts
if (availableCount === 0) return null   // ← remove; this is D2 being reversed
```

Partition `sortedVendors` on `vendorCartCounts.get(vendor.id)?.count ?? 0`, which
`useVendorCartCounts` already computes location-scoped with a cloud bypass — so
no new cloud handling is needed here.

### 3c. Cooking recipe list

`routes/cooking.tsx:503+`. Partition on `availableRecipeItems.length === 0`,
the value that already drives `isRecipeUnavailable` (`cooking.tsx:570`).

`isRecipeUnavailable`, the `opacity-80` card styling, `disabled` on the checkbox
and its `aria-describedby` wiring all stay **exactly as they are**. This task
only changes where the card sits in the list.

### 3d. The `Unsorted` / `No vendor` pseudo-cards

`VendorGroupView.tsx:156`, `RecipeGroupView.tsx:164` and the `noVendorCount > 0`
guard in `shopping/index.tsx:242` currently hide these at 0. Under the new rule
"0" is ambiguous and must be split:

| Situation | Treatment |
|---|---|
| No items are unfiled **anywhere** | stay hidden — the bucket is genuinely empty |
| Unfiled items exist but **none stocked here** | render in the bottom section |

This is the one judgement call in the design; the designer was invited to
overrule it in favour of "keep hiding" and did not.

**Commit 2** — the partition helper and all five surfaces, with tests and stories.

> **As built:** this shipped as three commits, not one — `91184539` (extract
> `ListSectionDivider` + the plural fix, i.e. Task 1), `e1ce18b6` (the three
> pantry group views) and `96327c65` (shopping + cooking, and the deletion of
> `hasStockHere`).

## i18n

Two new plural forms, both locales, both forms in each (a missing `_one` falls
back to another *language*, not to that locale's `_other` — the bug fixed
earlier in this same PR):

```jsonc
// en.json
"notStockedHere_one":   "{{count}} not stocked here",
"notStockedHere_other": "{{count}} not stocked here",
// tw.json
"notStockedHere_one":   "此據點無庫存的 {{count}} 項",
"notStockedHere_other": "此據點無庫存的 {{count}} 項",
```

English is intentionally identical in both forms — "not stocked here" does not
inflect. Both keys are still required; `locales.test.ts` enforces full parity in
both directions and will fail on a missing form.

Place the key at a shared top level (not under `shopping.`), since pantry,
shopping and cooking all use it.

## Testing

**The mandatory fixture.** Every partition test must include a group whose items
are stocked **only at another location**. Without it the test passes against a
location-blind implementation. This is the exact trap that let PR D ship four
tests that stayed green after their behaviour was deleted.

Per surface, assert:

1. a group with items stocked here renders **above** the divider
2. a group with items stocked only elsewhere renders **below** it
3. the divider count equals the number of below-the-line groups
4. no divider renders when every group is stocked here
5. the pre-existing sort holds **within** each section

Plus:

- **Cooking**: an unstocked recipe is both below the divider **and** still
  `disabled` with its `aria-describedby` intact — the two axes are independent
  and a test must pin that.
- **Shopping**: a vendor with nothing stocked here now **renders** (the direct
  D2 reversal — this test replaces one asserting it was hidden; find and update
  it, do not leave a contradicting test).
- **Cloud mode**: every group renders in the top section, no divider. Cloud
  items have no `stockId`; without the bypass the whole list would sink.
- **`ListSectionDivider`**: a `.stories.tsx` + matching `.stories.test.tsx`, per
  the project's component SOP.

**Mutation-check each partition test**: delete the partition, confirm RED. "A
test exists" counts as unproven until mutated.

**Stories**: update the five list components' existing stories to cover the
split state; add stories for the new divider.

## Out of scope

- **Issue #245** (create-from-search can mint a duplicate `Item`). This work makes
  the dead end *reachable* rather than hidden behind a vanished vendor. It does
  not fix it — that needs the affordance decision recorded in #245.
- **The four settings assignment UIs** that still classify with bare
  `isInactive()` over `useItems()`. Separate surface, separate round.
- **Merging `useItems()` and `useStockedItems()`.** Deliberately kept distinct;
  see the trap section.
- **Cloud `ItemStock`.** Every cloud bypass here is a placeholder to revisit when
  the backend lands.

## Verification

Standard gate after each commit, from the repo root, absolute paths (cwd does
not persist):

```bash
(cd apps/web && pnpm lint)
pnpm build 2>&1 | tee /tmp/p1i-build.log     # root build — only full type-check of both tsc targets
(cd apps/web && pnpm build-storybook)
(cd apps/web && pnpm check)
grep 'TS6385' /tmp/p1i-build.log && echo FAIL || echo OK
(cd apps/web && pnpm test --run)
```

Final: `pnpm test:e2e --grep "shopping|cooking|items|a11y"`.

Known pre-existing E2E failures, expected unchanged: 4 a11y colour-contrast
violations (shelves, vendor group-by, recipe group-by, shelves-mobile). Capture
the baseline **before** changing code so "unchanged" is provable.
