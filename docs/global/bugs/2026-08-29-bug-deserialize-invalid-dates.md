# Bug: `deserializeVendor`/`deserializeRecipe` build Invalid Dates from fields the cloud schema never sends

**Date:** 2026-08-29
**Area:** `apps/web/src/lib/deserialization.ts` — cloud mode reads + backup import
**Issue:** [#263](https://github.com/ETBlue/player1inventory/issues/263)

## Bug description

`deserializeVendor` and `deserializeRecipe` unconditionally construct `Date`s
from `createdAt` / `updatedAt` — fields the cloud GraphQL schema does not
declare, Prisma does not store, and the client operations never select. In cloud
mode `raw.createdAt` is `undefined`, `new Date(undefined)` is an **Invalid
Date**, and `.getTime()` on it is `NaN`.

Verified absent server-side:

- `apps/server/src/schema/vendor.graphql` — `Vendor { id, name, userId }`
- `apps/server/src/schema/recipe.graphql` — `Recipe { id, name, items, lastCookedAt, userId }`
- `apps/server/prisma/schema.prisma` — neither `model Vendor` nor `model Recipe`
  has a `createdAt`/`updatedAt` column
- `apps/web/src/apollo/operations/{vendors,recipes}.graphql` — never select one

Both deserializers end in `as Vendor` / `as Recipe`, which is why `tsc` never
flagged a required `Date` field being built from `undefined`.

| Deserializer | Field | In SDL? | In Prisma? | Result in cloud mode |
|---|---|---|---|---|
| `deserializeVendor` | `createdAt` | ❌ | ❌ | **Invalid Date** |
| `deserializeRecipe` | `createdAt` | ❌ | ❌ | **Invalid Date** |
| `deserializeRecipe` | `updatedAt` | ❌ | ❌ | **Invalid Date** |
| `deserializeRecipe` | `lastCookedAt` | ✅ | ✅ | ✅ guarded, ISO resolver |
| `deserializeItem` | `createdAt`/`updatedAt` | ✅ | ✅ | ✅ correct |
| `deserializeShelf` | `createdAt`/`updatedAt` | ❌ | ✅ | ✅ already guarded with `new Date(0)` |

## Root cause

Stale assumption encoded in the comment above each function ("GraphQL returns
createdAt as ISO string"). It is true of `Item`, and was copied to `Vendor` and
`Recipe`, whose cloud models never carried timestamps. `deserializeShelf` hit the
same situation later and was written correctly; the two older functions were
never revisited.

The existing tests did not catch it because they are **vacuous**: they feed an
ISO `createdAt` fixture — a wire shape the server never produces — so they pass
against both the broken and the correct implementation. This is the same
fixture-shaped blind spot that let the sibling `Cart.lastPurchasedAt` bug ship
(`docs/features/shopping/2026-08-27-bug-cloud-checkout-last-purchased-sort.md`).

## Impact

**Cloud reads — latent.** Reached via `useVendors.ts:37` and `useRecipes.ts:44,76`,
so Invalid Dates sit in live cloud app state, but no UI reads
`vendor.createdAt` or `recipe.createdAt`/`updatedAt` today. It becomes visible
the moment anything sorts or displays by them, and it will fail silently — a
`NaN` comparator is a no-op, not a throw.

**Backup import — already happening.** `deserializeRecipe` is also called on the
import path (`importData.ts:1189,1245,1352,1400`). A cloud-exported backup
carries recipes with no `createdAt`/`updatedAt` (`exportData.ts` passes raw
GraphQL results through), so importing one into local mode writes **Invalid
Dates into IndexedDB** today. Neither field is indexed on the `recipes` store
(`db/index.ts` — `'id, name, lastCookedAt'`), so IndexedDB accepts them without
a `DataError` and the corruption is silent.

Cloud *export* is unaffected — absent fields are simply absent from the backup,
not serialized as `Invalid Date`.

## Fix applied

Not by adding the columns. The data does not exist server-side and nothing
consumes it, so adding `createdAt`/`updatedAt` to Prisma and the SDL would cost a
migration plus a backfill to serve no reader. The client stops pretending
instead.

All three fields now route through the existing `parseWireDate()` helper (added
by the `Cart` fix) with an epoch fallback:

```ts
createdAt: parseWireDate(raw.createdAt) ?? new Date(0)
```

This is strictly stronger than the `raw.X ? new Date(...) : new Date(0)` guard
`deserializeShelf` used: that ternary is correct for an *absent* value but still
yields an Invalid Date for a value that is present and unparseable.
`parseWireDate` returns `undefined` for anything it cannot parse, so `?? new
Date(0)` catches both cases. `deserializeShelf` was harmonized onto the same
idiom, giving the file one rule instead of three.

`deserializeItem` is untouched — its `createdAt`/`updatedAt` genuinely are in the
SDL and Prisma, and it is already correct. `deserializeRecipe.lastCookedAt` is
likewise untouched.

The stale comments above `deserializeVendor` and `deserializeRecipe` — which
claimed "GraphQL returns createdAt as ISO string" — were replaced with the true
statement: the field is absent from the SDL, from Prisma, and from every
selection set; only a local backup carries it as ISO; epoch is the fallback.

## Test added

**The existing tests were the problem, not just missing coverage.** Both
`deserializeVendor` and `deserializeRecipe` already had passing tests, and both
fed an ISO `createdAt` — a wire shape the cloud never produces. They pass
identically against the broken and the fixed implementation. They were renamed
to `... (local-backup shape)`, which is the case they actually cover, and their
comments corrected.

New tests in `apps/web/src/lib/deserialization.test.ts`:

- vendor at the **real cloud wire shape** `{ id, name, userId }` → epoch
- recipe at the **real cloud wire shape** `{ id, name, items, userId, lastCookedAt }` → epoch for both fields
- unparseable timestamps → epoch, for vendor, recipe, and shelf

Each asserts `Number.isNaN(result.createdAt.getTime()) === false` explicitly.
`toBeInstanceOf(Date)` alone would be useless here — **an Invalid Date is a
`Date` instance**, so that assertion keeps passing against the bug. That is
precisely the trap the pre-existing recipe test fell into.

New test in `apps/web/src/lib/importData.test.ts`:

- `user can import a cloud-exported recipe that carries no timestamps` — a
  timestamp-less recipe through `importLocalData(payload, 'skip')`, asserting
  the Dexie row's `createdAt`/`updatedAt` are non-NaN. This pins the path that
  was corrupting data today, not just the deserializer in isolation.

### Mutation check

Per the repo's "Proving a Test Works" rule, each behaviour was reverted in the
source and the tests confirmed RED, then restored and confirmed green (114/114
across the two files).

| Mutation | Result |
|---|---|
| `deserializeVendor.createdAt` → `new Date(raw.createdAt as string)` | **2 RED** — `expected true to be false` on `Number.isNaN(...)` |
| `deserializeRecipe.createdAt`/`.updatedAt` → `new Date(raw.X as string)` | **3 RED** — both recipe tests **and** the `importLocalData` test, proving the import-path test is a real guard rather than a restatement of the unit test |
| `deserializeShelf` back to the `raw.X ? … : new Date(0)` ternary | **1 RED** — only the unparseable-value test. The pre-existing "absent timestamps" shelf test correctly stays green: it is a negative control for this mutation, not evidence. |

## Noted, out of scope

`importData.ts` bulk-writes vendors as `payload.vendors as Vendor[]` without
routing them through `deserializeVendor` at all, so an imported cloud vendor
lands in Dexie with `createdAt` **absent** rather than Invalid. Different
symptom, different fix; not part of this issue.

## PR / commit

*TBD*
