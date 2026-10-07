# Cloud `Location` / `ItemStock` — deferred requirements

**Date:** 2026-08-23 (recorded) · **audited 2026-10-07**
**Status:** ✅ **Closed, except one deliberate deferral** — see *Where each item landed*
**Related:** [locations design](2026-06-11-locations-design.md) ·
[global stock settings](../items/2026-08-22-design-global-stock-settings.md) ·
[location RBAC](../../global/permissions/2026-08-29-design-location-rbac.md) ·
[cloud-locations status](cloud-locations-status.md)

> **This document is a record, not a to-do list.** Its header used to read
> *"🔲 Pending — cloud backend not built"*, and said *"Every location predicate in the web app
> carries an `isCloud` bypass as a placeholder"*. Both were true on 2026-08-23 and are now
> wrong on every count. The cloud `Location` / `ItemStock` backend shipped across
> cloud-locations PRs 0 to 5, the last of which merged 2026-10-07.

## Where each item landed

Audited 2026-10-07 against `main` at `bb391502`, by reading the code rather than this file.

| Item below | Verdict |
|---|---|
| Atomicity for the unit switch | ✅ **Done** in PR 3c. `applyUnitSwitch` wraps the `Item` write, every location's `ItemStock`, and each affected recipe's items in one `prisma.$transaction`, with authorization for every named location run **before** the transaction opens |
| A catalog-only create path server-side | ✅ **Done, and this file's framing is obsolete.** Cloud solved it by **inversion**, not by a flag: `createItem` writes **no** `ItemStock` at all, so catalog-only is the default and stocking is an explicit second step. The client skips that step on `catalogOnly`, and all four Settings assignment tabs pass it. Recorded in [the PR 2 brainstorming](2026-08-30-brainstorming-cloud-locations.md): *"B makes a recorded deferred requirement disappear"* |
| Every `isCloud` bypass is a placeholder | ✅ **All revisited and deleted.** The `isCloud` occurrences that remain are the local/cloud fork every dual-mode hook needs — "read Dexie or read Apollo" — not feature bypasses. Two are comments recording bypasses that no longer exist |
| Cloud `Item` already carries all eight global stock-config fields | ✅ **Still true**, and unchanged by PR 5, which dropped only the five per-**location** state columns |
| The `consumeAmount = 0` data repair | 🔲 **Still open, deliberately.** See `apps/server/prisma/CLAUDE.md` → *Deferred data repair*, which carries the decision, the trigger ("before cloud has real users") and the SQL |
| Cloud E2E shares the dev database | ✅ **Fixed** by PR 1's dedicated test database (`TEST_DATABASE_URL`) |

**The gaps that remain between the two modes are not about locations.** The 2026-10-07 audit
found four things that bite a user, and none of them is a location feature: cloud has no
storage for `Item.note` / `Item.wikidataUrl` (issue #335, which also breaks a unit switch),
checkout logs a different `quantity` per mode when `amountPerPackage` is set (issue #336), and
the `consumeAmount` repair above.

---

## The original text, from 2026-08-23

Kept because the reasoning is still worth reading, and because two of the items were closed in
ways the text did not anticipate.

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
