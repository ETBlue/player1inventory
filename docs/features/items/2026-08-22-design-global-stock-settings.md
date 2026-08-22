# Global stock settings — move configuration from `ItemStock` to `Item`

**Date:** 2026-08-22
**Branch:** `worktree-feature-global-stock-settings`
**Base:** `3f651eb3`
**Tracking issue:** **#247** (part 1 of 2)
**Spec origin:** designer session 2026-08-22, logged in
[`2026-08-22-brainstorming-global-stock-settings.md`](./2026-08-22-brainstorming-global-stock-settings.md)

`ItemStock` currently holds two different kinds of thing. **Configuration** —
how an item is packaged, measured, expires and is consumed — is a property of
the item and does not vary by location. **State** — how much is here, when this
one expires — genuinely does. This moves the configuration half to `Item`.

Part 2 (the Settings assignment pages) is a separate branch; see #247.

## The line

Eight fields move `ItemStock` → `Item`:

| Field | Designer's term |
|---|---|
| `packageUnit` | package unit |
| `targetUnit` | track in package unit or measurement unit |
| `measurementUnit` | measurement unit |
| `amountPerPackage` | amount per package |
| `expirationMode` | calculate expiration based on |
| `estimatedDueDays` | expire in N days |
| `expirationThreshold` | (not in the original list — added per Q3) |
| `consumeAmount` | amount per consume |

Five stay on `ItemStock`:

`packedQuantity` · `unpackedQuantity` · `targetQuantity` · `refillThreshold` · `dueDate`

**`targetQuantity` stays per-location deliberately** — `targetQuantity === 0` is
the "inactive here" marker, and `isInactive` / `isStockedHere` / `isInactiveHere`
(`lib/quantityUtils.ts:270-290`) must keep working unchanged. Do not disturb
them.

## Task 1 — types

`packages/types/src/index.ts`:

- Move the eight fields from `ItemStock` (`:23-53`) to `Item` (`:7-21`).
- `StockFields` (`:59-62`) shrinks automatically — it is
  `Omit<ItemStock, 'id'|'itemId'|'locationId'|'createdAt'|'updatedAt'>`.
- `PantryItem = Item & StockFields & { stockId?, locationId? }` (`:70-74`) needs
  **no change** — the union still resolves; the fields just arrive from the
  other half. Every existing read site (`item.packageUnit`, `item.consumeAmount`,
  …) keeps compiling. That is the point: this is a move, not a rename.

Update the comments on both interfaces — they currently assert the old split
("Stock/unit/expiration now live on ItemStock").

## Task 2 — Dexie v16 migration

`apps/web/src/db/index.ts` (current version at `:41`).

**Follow the schema rules in `apps/web/src/db/CLAUDE.md`** — forward-only, add a
version rather than editing one, and remember **a fresh DB never runs upgrade
functions**, so `on('populate')` must produce the same shape.

Collapse rule, decided in Q2:

1. If the item has an `ItemStock` row at the **default location** (id = user id;
   `'local'` offline), that row's values win.
2. Otherwise the **oldest** `ItemStock` row for that item wins (by `createdAt`,
   tie-broken by `id` for determinism).
3. An item with no rows at all (orphan) takes the field defaults.

Copy all eight fields onto the `Item`, then delete them from every `ItemStock`
row. The migration must be **idempotent** and must not depend on any value that
only exists at runtime.

Only `packageUnit` / `measurementUnit` / `amountPerPackage` / `targetUnit` are
indexed-adjacent concerns; check the store definitions before assuming an index
needs changing.

## Task 3 — `db/operations.ts`

The join machinery is the load-bearing part. Sites identified by survey:

| Site | Lines | What changes |
|---|---|---|
| `ZERO_STOCK` | `:30-37` | shrinks to the five remaining fields |
| `STOCK_FIELD_KEYS` | `:~40-68` | drops the eight |
| `pickStockFields` / `stripStockFields` | `:79-103` | follow the key list |
| `joinItemStock` | `:290-299` | spreads `Item` (now richer) over the stock row |
| `getAllItems` / `getStockedItems` | `:290-315` | unchanged in behaviour |
| `createItem` | `:231-278` | writes the eight to the `Item`, the rest to the `ItemStock` |
| `updateItem` (`stockKeys`) | `:326-358` | routes each field to the right table |
| `addItemToLocation` | copy-on-add | must **stop** copying the eight — they are no longer per-location |

`addItemToLocation`'s copy-on-add is the subtle one: it inherits stock fields
from an existing row. Eight of those no longer exist on the row. Re-read it
rather than pattern-matching the diff.

## Task 4 — the item form: Info gets the global fields, Stock keeps the numbers

Decided in Q1. **Info tab = everything global about the item. Stock tab = the
per-location pager numbers only.**

- `apps/web/src/routes/items/$id/` — Info route gains the eight fields; the
  Stock route (`stock.tsx`) loses them.
- `ItemForm.tsx` (`consumeAmount` at `:485-503`, unit fields nearby) is shared —
  work out whether it splits into two forms or takes a section flag. Prefer the
  smaller change that does not leave one component meaning two things.
- Conditional fields must keep their existing show/hide logic: measurement unit
  and amount-per-package only when tracking by measurement; expire-in-N-days
  only when expiration is "days from purchase".

### The rescale dialog — keep it, re-hang it

`items/$id/stock.tsx:228-308` (`buildAdjustments` `:233-280`,
`handleConfirmAdjustments` `:292-308`, `calcNewDefault` /
`calcRecipeDefaultAfterUnitSwitch` `:~170-183`, the `AlertDialog` `:326+`)
currently rewrites `RecipeItem.defaultAmount` on every recipe when one
location's `consumeAmount`/`targetUnit` is saved.

That is a defect **only because the trigger is per-location**. Once the trigger
is a global field it becomes coherent: changing an item's unit globally really
does invalidate stored recipe amounts. **Move the dialog to wherever the global
unit fields now live** rather than deleting it. Its behaviour is unchanged;
its trigger is now global→global.

## Task 5 — the recipe stepper

`settings/recipes/$id/items.tsx` — seed `:203`, `:217`, `:332`; stepper step
`:258-264`. Also `cooking.tsx:315-329` (`:324`).

These already read `item.consumeAmount`. With the field global, they keep
working **and become correct** — no interim rule, no new field. Verify rather
than rewrite, and add a test that pins the amount is now location-independent.

## Task 6 — importer, cloud, e2e seeds

- `apps/web/src/lib/importData.ts` — `:78`, `:145`, `:309`, `:488`. Import must
  accept **both** shapes: an export written before this change has the eight
  fields on the stock rows. Decide and document the rule (suggest: same
  collapse as the migration).
- **Cloud** — `apps/server/src/schema/item.graphql:14,47,66` already carries
  `consumeAmount` on `Item`. Check which of the other seven the cloud `Item`
  already has; this change should **reduce** local/cloud divergence, not add to
  it. Anything already aligned needs no server work. Do not add an `ItemStock`
  backend here — still deferred.
- `e2e/helpers/locationSeed.ts` — `:107`, `:133`, plus ~20 specs that seed stock
  fields. Mechanical but broad.

## Testing

- **Migration is the highest-risk piece.** Test at minimum: an item stocked at
  the default location plus two others with differing values (default wins); an
  item stocked only at non-default locations (oldest wins); an orphan; and an
  item stocked at exactly one location. Assert the eight fields are removed from
  every `ItemStock` row afterwards.
- **Fresh-DB parity**: a database created from scratch must end up with the same
  shape as one migrated from v15. This is the `on('populate')` trap in
  `db/CLAUDE.md` — assert it explicitly, do not assume.
- **Location independence**: set a unit at location A, read it at location B,
  assert they agree. A test that only ever uses one location cannot distinguish
  this change from a no-op.
- **The rescale dialog** still fires on a global unit change and still rewrites
  recipe amounts — and no longer fires on a per-location quantity edit.
- **Mutation-check** the migration and the location-independence tests per
  `CLAUDE.md` → *Proving a Test Works*.

Existing suites to update: `db/operations.test.ts`, `ItemCard.test.tsx`,
`items/$id/stock.test.tsx`, `cooking.test.tsx` + `.cloud.test.tsx`,
`settings/recipes/$id/items.test.tsx`, plus `e2e/tests/settings/recipes.spec.ts:306-330`
(asserts step = `consumeAmount` = 1) and `e2e/tests/cooking.spec.ts:194-212`.

## Docs

Nine `CLAUDE.md` files document the current contract. At minimum: root
(if it describes the split), `apps/web/src/db/CLAUDE.md` (v16 + the collapse
rule), `apps/web/src/routes/items/CLAUDE.md` (Info vs Stock tab), and
`apps/web/src/hooks/CLAUDE.md`. Also add a note to
`apps/web/src/routes/settings/CLAUDE.md` recording that the four Items tabs
still leak location-scoped stock **until part 2 lands** — that gap is real in
the window between the two PRs.

Update `docs/INDEX.md`.

## Out of scope

- **Part 2** — the Settings assignment pages, create-globally, shelf filter
  badges, sidebar reorder. Separate branch, same issue (#247).
- **Issue #245** — unblocked by part 2, not fixed here.
- **Cloud `ItemStock`** — still deferred.

## Verification

```bash
(cd apps/web && pnpm lint)
pnpm build 2>&1 | tee /tmp/p1i-build.log   # root build — only full type-check of both tsc targets
(cd apps/web && pnpm build-storybook)
(cd apps/web && pnpm check)
grep 'TS6385' /tmp/p1i-build.log && echo FAIL || echo OK
(cd apps/web && pnpm test --run)
```

Baseline at `3f651eb3`: **1644 tests / 202 files green**;
`routes/shopping/index.tsx` carries exactly 4 pre-existing Biome warnings.

Final: `pnpm test:e2e --grep "items|cooking|shopping|location|settings|shelves|vendors-group|recipes-group|a11y"`
— build the grep from **spec filenames**, per root `CLAUDE.md`. Capture the
baseline before changing code; the known pre-existing failures are the 4 a11y
colour-contrast violations.

## Addendum — per-location quantity conversion on a unit switch (designer ruling, 2026-08-22)

This branch originally shipped the unit switch with a flagged gap: toggling
"track in measurement" rescaled the global `consumeAmount` and every recipe's
`defaultAmount`, but left the per-location quantities alone. The Info-tab notes
above and `routes/items/CLAUDE.md` recorded "no per-location rescale" as the
intended behaviour, on the grounds that rescaling one location's numbers from a
global switch would be arbitrary.

The designer then ruled:

> item page > stock tab: when the target unit in item info tab changes, update
> "unpacked" "target quantity" "refill when below" numbers accordingly

**That is now implemented, and it is well defined precisely because of this
branch.** `amountPerPackage` moved to the `Item` in v16, so one factor applies
to every location; while it was per-location there was no single correct
factor, which is what made the original gap defensible.

### What changed

- **`lib/quantityUtils.ts`** gains `convertTrackedQuantities(quantities,
  amountPerPackage, newTargetUnit)` — a pure helper beside `roundToStep` /
  `computePack` / `computeUnpack` / `computeFillToFull`. Package → measurement
  multiplies, measurement → package divides. Returns `null` when
  `amountPerPackage` is missing / zero / negative, matching the recipe branch's
  bail.
- **`routes/items/$id/index.tsx`** builds one `StockConversion` per stocked
  location from that row's **own** stored values (never from the form, which
  only ever holds the active location's numbers) and shows them in the existing
  confirm dialog before saving. Confirming writes each row via
  `useUpdateItem({ …, locationId })`; cancelling writes nothing at all.

### Decisions

| Decision | Rationale |
|---|---|
| Only `unpackedQuantity`, `targetQuantity`, `refillThreshold` convert | The designer named exactly three fields. `packedQuantity` counts **sealed packages**, which are packages in either mode, so converting it would be wrong. |
| Previewed, never silent | Rewriting inventory numbers across every location without showing them first is not acceptable. It reuses the dialog that already gathers recipe adjustments; either half alone opens it. |
| One dialog row per location | Three fields × N locations listed field-by-field is an unreadable wall. Columns are `Location │ Unpacked │ Target Quantity │ Refill When Below`, each cell `before → after`, so the user can see which locations are affected and what happens to each. |
| No rounding to integers, and **not** `roundToStep` | 500 g at 1000 g per package is 0.5 packages, not 1 — rounding would invent or destroy inventory. The helper only strips IEEE-754 dust (12 significant figures), which is what makes a package → measurement → package round trip return the original values exactly. `ItemForm`'s 3-decimal in-form rounding is deliberately not reused: it doubles 0.0005 to 0.001 and breaks the round trip. It stays where it is because the Info tab never submits those form values. |
| Rows that would not move are skipped | An all-zero row, or a 1:1 package size, produces no change — listing it would make the user reason about a no-op. |
| Local mode only | Cloud has no locations and no `ItemStock`; a cloud `Item` carries its stock inline. |

### Tests

- `lib/quantityUtils.test.ts` — both directions, exact round trip (including a
  fractional `amountPerPackage`), no integer rounding, zeros, and the
  missing/zero/negative/NaN bail.
- `routes/items/$id.test.tsx` (`targetUnit change — per-location stock
  conversion`) — a **three-location** fixture with three *different* sets of
  numbers, asserting every row converted from its own values; `packedQuantity`
  untouched everywhere; the dialog previews per-location before → after;
  cancelling changes nothing; a save that does not touch `targetUnit` converts
  nothing (negative control); an empty location is neither listed nor written;
  and no conversion without a usable `amountPerPackage`.
- Mutation-checked per root `CLAUDE.md`: inverting the conversion direction,
  removing the float-dust strip, rounding to integers, and converting only the
  active location each turned the relevant tests red.
