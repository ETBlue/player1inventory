# Cloud `Location` / `ItemStock` — deferred requirements

**Date:** 2026-08-23 (recorded), still open
**Status:** 🔲 Pending — cloud backend not built
**Related:** [locations design](2026-06-11-locations-design.md) ·
[global stock settings](../items/2026-08-22-design-global-stock-settings.md) ·
[location RBAC](../../global/permissions/2026-08-29-design-location-rbac.md)

Cloud has **no `Location` / `ItemStock` backend** — deferred since PR D of the locations
feature. Every location predicate in the web app carries an `isCloud` bypass as a
placeholder. These are the obligations that come due when that backend is built. They are
easy to miss because the local implementations look complete.

## Atomicity for the unit switch

Changing an item's tracking unit rewrites three things at once:

1. the `Item`'s configuration,
2. the converted quantities on **every** location's `ItemStock` row,
3. `RecipeItem.defaultAmount` on every affected recipe.

Locally this is one Dexie `rw` transaction — a partial failure would leave mixed units
silently. Cloud must get the same guarantee via a **single combined GraphQL mutation
wrapping all three in one server-side transaction**, not a sequence of Apollo calls
(Apollo has no client-side transaction). Designer requirement, 2026-08-23.

## A catalog-only create path must exist server-side

The four Settings assignment tabs (tags, vendors, recipes, shelves) create items that are
attached to the entity and stocked in **no location** — locally via
`createItem(..., { catalogOnly: true })`, which skips the `ItemStock` write. In cloud today
`catalogOnly` is a harmless no-op because there is no `ItemStock` to skip.

The moment cloud gains `Location`/`ItemStock`, the GraphQL `createItem` mutation needs the
same affordance (a flag, or simply not auto-creating a stock row), and the Settings tabs'
cloud branch must use it. Otherwise cloud silently regresses to stocking every
Settings-created item in some default location — the exact bug issue #247 part 2 fixed
locally. Designer requirement, 2026-08-23.

## Every `isCloud` bypass is a placeholder, not a decision

Each one exists solely because cloud items carry stock inline and never a `stockId`. When
the backend lands, **revisit every one** rather than leaving them — a bypass that silently
stays becomes a permanent behaviour fork between modes.

## What needs no cloud work

- `ItemCard showStock={false}`, the assigned/unassigned two-bucket ordering, and the shelf
  filter counts all read global data and behave identically in both modes.
- No Settings tab mounts `NewItemDialog` any more, so no Settings surface can stock an item
  in either mode.
- Cloud `Item` **already carries all eight global stock-config fields** (`packageUnit`,
  `targetUnit`, `measurementUnit`, `amountPerPackage`, `expirationMode`,
  `estimatedDueDays`, `expirationThreshold`, `consumeAmount`) in `item.graphql`, both
  GraphQL inputs, and Prisma. The v16 local move brought local into line with cloud, not
  the other way round — so only the per-location *state* half needs new backend.

## Authorization

This backend lands into **location RBAC**, not a per-user model. See the root `CLAUDE.md`
→ *Authorization (cloud)* and the
[RBAC design](../../global/permissions/2026-08-29-design-location-rbac.md).
Never write `row.userId === ctx.userId` as the guard.

## Other deferred cloud obligations

- Cloud `Item` rows with `consumeAmount = 0` from the 2026-08-23/24 window still need
  repair — see `apps/server/prisma/CLAUDE.md` → *Deferred data repair*.
- Cloud E2E shares the dev database — see `e2e/CLAUDE.md`.
