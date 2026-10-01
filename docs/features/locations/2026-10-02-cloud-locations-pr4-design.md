# Cloud locations PR 4 — design

**Date:** 2026-10-02
**Status:** 🔲 Pending
**Supersedes:** §6 of the [cloud locations design](2026-08-30-cloud-locations-design.md),
which described this work in about 40 lines and is stale in 8 places — see *What §6 got
wrong* below.
**Brainstorming:** [PR 4 brainstorming](2026-10-02-brainstorming-pr4.md)
**Plan:** [PR 4a plan](2026-10-02-cloud-locations-plan-pr4a.md) — 4b and 4c are planned
later, on purpose (brainstorming decision 9)

---

## Goal

Make data movement between local and cloud **lossless for locations**.

Today a local → cloud copy keeps one location's stock and throws the rest away. A cloud
backup carries no locations and no stock rows at all. PR 4 closes both gaps, and removes
the warning dialog that exists only to tell the user about the loss.

## Where this sits

PRs 0 through 3c are merged **and deployed**. Cloud has had per-location `ItemStock` since
PR 1. The gap PR 4 closes is only in the **import and export surface**, which is still
flat: `ItemInput` carries stock inline with no `locationId`.

| | |
|---|---|
| Blocked by | nothing — PRs 0–3c are live |
| Blocks | PR 5, the contract step, which drops `Item`'s five state columns |
| Hands to PR 5 | 2 of the 6 `stockDualWrite` calls, removed in 4b rather than PR 5 |

## What the user gets

**4a: nothing user-visible.** It adds GraphQL fields and inputs that no client calls. It is
groundwork so 4b can be one reviewable diff.

**4b: two real gains.**

1. Signing in with local data no longer throws away every location's stock except one.
2. Cloud backups become complete. Today a cloud export cannot restore your locations,
   your per-location stock, or which location a log belongs to.

**4c: nothing user-visible.** It is a test. What it protects is the "delete my data"
action: it proves `purgeUserData` deletes all of your rows and none of anyone else's.

## What the developer gets

**4a: one rule removed from everyone's head.** Today an import resolver has to decide a
location for every row it writes, because the payload does not carry one. Three resolvers
hardcode `ensureDefaultLocation(userId)` under a comment apologising for it
(`import.resolver.ts:238`, `:260`, and the two dual-write sites). After 4a the location
comes from the data, so there is no decision left to get wrong.

| DX gain | Specifics |
|---|---|
| Fewer ways to get it wrong | 3 hardcoded `ensureDefaultLocation` fallbacks stop being the only answer. Each one currently writes a row to a location the user did not choose, silently |
| A failure that now has a name | an import naming someone else's location is **rejected**, through `requireLocationRole`. Today a wrong `locationId` cannot even be expressed, so the wrong row is written with no error |
| Honest documentation | 8 stale claims in design §6 corrected, and 2 wrong counts (`stockDualWrite` is 6 calls behind 7 markers, not 5). Both had already been copied into task briefs |

**DX cost of 4a, stated plainly:** two more hand-maintained lists. `LocationInput` and
`ItemStockImportInput` each duplicate a Prisma model's field set, like the 9 import inputs
already do, and nothing checks they stay in sync. The existing 18 bulk mutations have the
same problem and it has not bitten yet. Worth it because the alternative — a generic bulk
endpoint — would take the `where`-clause scoping out of per-model view, which is exactly
what issue #320 is about.

**4b: a large amount of code stops existing.**

| DX gain | Specifics |
|---|---|
| Less code to maintain | `flattenPayloadForCloud` (72 lines), `resolveFlattenLocationId` (15 lines), `MigrationLocationWarningDialog` (4 files), 4 i18n keys × 2 languages, and 2 of the 6 `stockDualWrite` calls |
| Less to remember | the "payload with no `itemStocks` is a cloud export" sniff test goes away. It is an invisible coupling between the export writer and two import readers, and it is the reason 4a and 4b cannot be cut the other way round |
| Fewer ways to get it wrong | one remap rule replaces three different location decisions — flatten's chosen location, `deserializeLocation`'s id test, and the resolvers' default fallback |
| PR 5 gets smaller | its teardown list drops from 6 calls to 4, plus the inline `applyUnitSwitch` block |

**DX cost of 4b:** it removes the mirror that currently hides a broken stock upload. If the
new upload has a bug, imported items are stocked **nowhere** — invisible in the pantry, no
error. That is a real loss of safety net, and the reason 4b's test plan is the longest of
the three.

**4c: the "delete my data" path becomes testable at all.**

| DX gain | Specifics |
|---|---|
| A failure that now has a name | an over-broad purge filter currently passes every test in the repo. After 4c it fails one, by name |
| Less to remember | `purge-coverage.test.ts` checks 10 models and skips 4 on purpose. Nobody has to hold that exclusion list in mind to know whether a filter is covered |
| Reusable fixture | the two-user cloud fixture is the first since PR 1, and 4b's cart-collision test needs the same thing |

**DX cost of 4c:** cloud E2E gains a spec that needs two synthetic users, so the cleanup
contract in `e2e/helpers/cloudTeardown.ts` has to cover both. One more thing to keep in
sync.

Both gains need a **deploy**, not just a merge. Railway auto-deploys `main` and runs
`prisma migrate deploy` as its release command, so each PR deploys itself on merge. PR 4
adds **no migration** — `Location` and `ItemStock` already exist — so the deploy is a
plain code deploy.

---

## The rollout — three PRs

| PR | Contents | Risk |
|---|---|---|
| **4a** | The GraphQL surface only. No web change. | Low. Nothing calls it. |
| **4b** | The payload shape and both import readers, in one diff. Includes the cart-id leak fix. | High. This is the data-movement rewrite. |
| **4c** | Issue #320's two-user purge spec. | Low. Test only. |

**Why 4b is not split further.** The first split drawn in brainstorming put lossless export
in 4a and the import rewrite in 4b. That does not work: the export change alone breaks two
import readers, because both use the **old payload shape as a signal**.

| Export change | Reader that breaks | Evidence |
|---|---|---|
| Cloud export starts carrying `itemStocks` | `flattenPayloadForCloud` returns early when `itemStocks` is absent, treating absence as "this payload is already flat". A cloud → cloud import would start flattening: collapsed onto one location, cart prefixes stripped. | `importData.ts:359-365` |
| Cloud export starts carrying `locations` | `deserializeLocation` derives `isDefault` from `raw.id === 'local'`. A cloud backup's ids are cuids, so nothing is flagged and `ensureDefaultLocationRow()` adds a stray empty default. | `importData.ts:136-143`, then `importData.ts:1121` |

So the payload and its readers change together, or the tree is broken in between.

**Why 4c can go any time.** It touches no file the other two touch. It builds a two-user
cloud E2E fixture that 4b's cart-collision test also needs, so running it first would save
building that fixture twice. That order was offered and not chosen; the duplication is a
known cost.

---

## 1. The remap rule

One rule, stated once, used in both directions.

> **Preserve payload location ids verbatim, except the payload's default, which maps onto
> the destination's default.**

| Direction | The payload's default maps to | Everything else |
|---|---|---|
| local → cloud | the destination account's `isDefault` location | kept verbatim |
| cloud → local | `DEFAULT_LOCATION_ID` (`'local'`) | kept verbatim |

**Why only the default remaps.** A cloud → local → cloud round trip then preserves every
id. Carts still upsert by their composite `${locationId}:${vendorId}` id, which is what the
composite key was for. Only a **first** copy between modes remaps anything, and only one
row.

**What the rule rewrites.** Four places carry a location id:

| Field | Shape |
|---|---|
| `itemStocks[].locationId` | plain id |
| `inventoryLogs[].locationId` | plain id — **new in 4a**, see §2 |
| `shoppingCarts[].id` | `${locationId}:${vendorId\|'no-vendor'}` |
| `cartItems[].cartId` | the same composite |

**Legacy payloads need no new code.** `upgradeLegacyPayload` (`importData.ts:259-292`)
already turns a pre-v15 payload's inline stock into `itemStocks` rows, placed in a location
passed as a parameter. That location is simply that payload's default, and flows through
the same map.

One correction to §6 here: §6 says legacy normalization produces `locationId: 'local'`.
`'local'` is only the **default value** of `importLocalData`'s third parameter
(`importData.ts:1170-1174`). Both real UI call sites pass a resolved local id instead
(`DataModeCard.tsx:100-104` and `:119-122`). The remap rule must not assume the id is
literally `'local'`.

---

## 2. The GraphQL surface — PR 4a

Everything in this section is **additive**. No existing field changes shape, no existing
input loses a field, and no web code calls any of it until 4b.

### New query — whole-account stock

```graphql
type Query {
  itemStocks(locationId: ID!): [ItemStock!]!   # existing
  allItemStocks: [ItemStock!]!                 # new
}
```

Resolver scope is `{ location: { userId } }` — the same shape `purgeUserData` uses
(`purge.resolver.ts:39`), and the shape location RBAC needs. **No `userId` column is added
to `ItemStock`** (root `CLAUDE.md`, *Authorization*).

It exists because cloud export needs every location's stock in one query, and
`itemStocks(locationId: ID!)` cannot give it. `fetchCloudPayload` runs nine queries in one
`Promise.all` (`exportData.ts:178-198`); a per-location fan-out would break that into two
rounds and cost one request per location.

### `InventoryLog` gains `locationId`

The Prisma column exists and is **NOT NULL** (`schema.prisma:205`), written by every log
writer since PR 3a. The GraphQL type never exposed it
(`inventoryLog.graphql:1-10`), so a cloud export cannot say which location a log belongs
to. 4a adds it to the type; 4b adds it to the export operation.

### `InventoryLogInput` gains `locationId`

Optional, so nothing breaks. `bulkCreateInventoryLogs` currently hardcodes
`locationId: await ensureDefaultLocation(userId)` (`import.resolver.ts:238`) under a comment
that says PR 4 rewrites it. In 4a the resolver prefers the input's value and falls back to
the default when it is absent. In 4b the client starts sending it.

### Cart location, from the cart id

`bulkCreateShoppingCarts` has the same hardcoding (`import.resolver.ts:260`). The cart id
**already carries** its location since PR 3b, so no new input field is needed: the resolver
parses `${locationId}:${vendorId}` and uses that. It falls back to
`ensureDefaultLocation(userId)` for a legacy bare id.

This is also where the cart-id leak is closed on the server side, but the leak is not fixed
until 4b stops stripping the prefix on the client.

### New import inputs and mutations

```graphql
input LocationInput {
  id: ID!
  name: String!
  order: Int!
  createdAt: String!
  updatedAt: String!
}

input ItemStockImportInput {
  id: ID!
  itemId: ID!
  locationId: ID!
  targetQuantity: Float!
  refillThreshold: Float!
  packedQuantity: Float!
  unpackedQuantity: Float!
  dueDate: String
  createdAt: String!
  updatedAt: String!
}

type Mutation {
  bulkCreateLocations(locations: [LocationInput!]!): [Location!]!
  bulkUpsertLocations(locations: [LocationInput!]!): [Location!]!
  bulkCreateItemStocks(itemStocks: [ItemStockImportInput!]!): [ItemStock!]!
  bulkUpsertItemStocks(itemStocks: [ItemStockImportInput!]!): [ItemStock!]!
}
```

**`LocationInput` carries no `isDefault`, and the resolvers always write `false`.**
`Location.isDefault` is `Boolean @default(false)` in Prisma (`schema.prisma`), with no
database constraint keeping it to one row per user. The remap rule makes the field
unnecessary: the payload's default location is never uploaded as a row at all — its id is
rewritten to the destination's existing `isDefault` id, so only the **non-default**
locations reach `bulkCreateLocations`. Accepting the flag would let a payload create a
second default, and nothing in the schema would stop it.

`ensureDefaultLocation(userId)` already guarantees the account has exactly one default, so
the server does not need the payload's opinion. This is the server-side half of brainstorming
decision 7.

**Why `ItemStockImportInput` and not `ItemStockInput`.** `ItemStockInput` already exists
(`itemStock.graphql:72-78`) and is the **partial-merge** input for `upsertItemStock`: five
optional fields, no `id`, no `itemId`, no `locationId`, and a missing key means "leave that
column alone". It is also referenced by `UnitSwitchStockConversionInput`
(`itemStock.graphql:46-49`), so widening it would change `applyUnitSwitch`'s contract too.

Renaming the existing one to free the clean name is also out: input type names appear in
client operations (`mutation UpsertItemStock($input: ItemStockInput!)`), so a rename breaks
any cached bundle. A second input is the only safe option, and the naming asymmetry with
`LocationInput` is accepted.

**Naming convention followed.** The existing 18 bulk mutations use
`bulkCreate<PluralEntity>` / `bulkUpsert<PluralEntity>`, an argument named after the
`ExportPayload` key, and a return type of `[<GraphQLType>!]!`
(`import.graphql:84-107`). The four new ones match.

### `ItemInput` keeps its five state fields

Design §6 says PR 4 drops `targetQuantity`, `refillThreshold`, `packedQuantity`,
`unpackedQuantity` and `dueDate` from `ItemInput` (`import.graphql:11-16`). **It does not.**

4b stops sending them and the resolver stops reading them. The input keeps **accepting**
them until PR 5, which is already the contract step for the same five fields and drops them
from the columns, the `Item` type and the inputs together.

Dropping an input field is breaking. A browser on a cached bundle would send the old fields
and fail validation — and it would fail **after `clearAllData` has run**, leaving the
account empty and the import dead. Staging it is the same rule PRs 1–3 used.

---

## 3. Export and import — PR 4b

### Cloud export becomes lossless

`fetchCloudPayload` (`exportData.ts:162-232`) gains:

| Added | Source |
|---|---|
| `locations` | the existing `locations` query |
| `itemStocks` | the new `allItemStocks` query |
| `locationId` on each log | the `InventoryLog.locationId` field 4a added — the export operation at `apps/web/src/apollo/operations/export.graphql:1-10` must ask for it |

`ExportPayload` needs **no change**. It already declares `itemStocks?` and `locations?`
(`exportData.ts:52-53`) — the one line reference in §6 that has not drifted. Local exports
have populated both since v15, via `fetchLocalPayload` (`exportData.ts:121-122`).

`fetchCloudPayload` has **no unit test today**. Every consumer mocks it
(`DataModeCard/index.test.tsx:53`, `ExportCard/index.test.tsx:9`). 4b adds one.

### Cloud import carries locations

`importCloudData` (`importData.ts:1868-2037`) replaces its single call to
`flattenPayloadForCloud` with the remap of §1, then uploads locations and stock through the
four new mutations.

**Deleted, not changed:**

| Deleted | Lines | Why |
|---|---|---|
| `flattenPayloadForCloud` | `importData.ts:361-432` | its whole job was collapsing the pantry onto one location |
| `resolveFlattenLocationId` | `importData.ts:456-470` | chose which location to collapse onto |
| the `itemStocks`/`locations` `void` block | `importData.ts:426-430` | the two tables now have a cloud home |
| the cart prefix strip | `importData.ts:403-413` | **this is the leak fix** — ids stay composite |
| `MigrationLocationWarningDialog` | 4 files + 4 i18n keys × 2 languages | its warning becomes untrue |

§6 calls this function `flattenToLocation`. **No function by that name exists anywhere in
the code** — only in the design doc. The real name is `flattenPayloadForCloud`, and the
`void` block is at `importData.ts:426-430`, not `:414-418`.

### `deserializeLocation` stops deriving `isDefault` from the id

`deserializeLocation` (`importData.ts:136-143`) sets `isDefault: raw.id ===
DEFAULT_LOCATION_ID` and ignores the file. That is correct while cloud backups carry no
locations. Once they do, a cloud backup's cuid-keyed locations would all import unflagged,
and `ensureDefaultLocationRow()` (`importData.ts:1121`) would add a stray empty default
beside them.

4b applies the §1 remap on this side instead: the payload's default becomes the `'local'`
row, so exactly one row is flagged and no extra row is created.

### Two of the six dual-writes go

`stockDualWrite.ts` has **6 calls across 5 files** and **7 `REMOVED IN PR 5` markers**. Two
calls are in the import path:

| Call site | Resolver |
|---|---|
| `import.resolver.ts:88` | `bulkCreateItems` |
| `import.resolver.ts:328` | `bulkUpsertItems` |

Their markers say "PR 5" in the header and "goes away with PR 4" in the body
(`import.resolver.ts:76-87`). The body is right: once the payload carries real stock rows,
mirroring item columns into the caller's default location is wrong, not just redundant.

**This is the sharpest risk in 4b.** That mirror is the only reason an imported item is
visible in the cloud pantry today. Remove it, and if the new `itemStocks` upload has a bug,
**every imported item lands in the catalog stocked nowhere — invisible, with no error**. The
marker says so in its own words. The only existing guard is one E2E test,
`import-export-cloud.spec.ts:161`.

PR 5's teardown list therefore shrinks to **4 calls in 4 files** plus the inline
`applyUnitSwitch` block at `itemStock.resolver.ts:320-328`.

`import.resolver.test.ts:364` (`user importing items has each one stocked in their default
location`) asserts the mirror. It must be **replaced**, not deleted: the new assertion is
that an imported item is stocked in the location its `ItemStock` row names.

**Leave `apps/server/src/lib/defaultLocation.ts` alone.** Its comment at `:10-11` says it
must outlive PR 5, even though `stockDualWrite.ts` is its biggest consumer.

### The post-login migration gate

```ts
// before — usePostLoginMigration.ts:38, :51-54
const migrationLocationId = readStoredLocationId('local')
const locationResolved =
  locations !== undefined &&
  (activeLocationId === DEFAULT_LOCATION_ID ||
    locations.some((loc) => loc.id === activeLocationId))

// after
// The remap maps the payload's default location onto THIS account's
// isDefault row, so the copy cannot start until the destination's
// locations are known.
const locationsLoaded = locations !== undefined
```

The stored id goes with it, because `importCloudData` loses its `locationId` option.

§6 says the hook "loses the `{ locationId: activeLocationId }` option". The hook takes no
options; it **passes** `{ locationId }` down at `usePostLoginMigration.ts:82-84` and
`:125-127`, and the value is `readStoredLocationId('local')`, not `activeLocationId`. The
code's own note at `:45-50` already records that the design doc went stale here and leaves
the decision to PR 4.

Keep `autoImportStarted` (`usePostLoginMigration.ts:62`). `locationsLoaded` is in the
effect's dependency array (`:113`), so without the one-shot ref a location change mid-flight
would start a second copy.

---

## 4. Purge — PR 4c

**The resolvers need no change.** Today's state, measured:

| Path | `deleteMany` calls | `ItemStock` scope | `Location` deleted? |
|---|---|---|---|
| `purgeUserData` (`purge.resolver.ts:7-64`) | 14 | `{ location: { userId } }` at `:39` | yes, last, at `:45` |
| `clearAllData` (`import.resolver.ts:549-576`) | 14, same order | `{ location: { userId } }` at `:567` | yes, at `:573` |

So §6's purge paragraph is already done. What is missing is the **proof**, which is issue
#320.

### What #320 builds

A cloud E2E spec, no browser, in the shape of `location-scoped-writes.spec.ts` and
`cleanup-endpoint.spec.ts`:

1. Seed one row of all 14 models for **user A** and for **user B**.
2. Assert both seeds landed.
3. Call `purgeUserData` as A.
4. Assert every A row is gone.
5. **Assert every B row survives.**

Step 5 is the reason for this shape. It is the only check in the repo that would catch an
**over-broad** filter — one that deletes a stranger's data. `purgeUserData` is the
user-facing "delete my data" action, so that risk is worth a real database.

### What the existing guards do and do not cover

| Guard | Covers | Misses |
|---|---|---|
| `purge-coverage.test.ts` (3 cases, 113 lines) | that `prisma.<model>.deleteMany(` appears, for the **10** models carrying a `userId` column | the `where` clause entirely. A filter matching nothing passes — proved during #319, 5 of 5 still green |
| `purge.resolver.test.ts:121-127` | the `where` clause for `shelf`, `location`, `itemStock` | the other 11 models |
| `purge.resolver.test.ts:135-140` | delete **order**, via `mock.invocationCallOrder` | — |
| `import.resolver.test.ts:504-517` | the same three, for `clearAllData` | the other 11 |

Two corrections to #320's text. The clauses are **not** completely unguarded — three are
asserted, in two files. And `purge-coverage.test.ts` checks **10** models, not 14: it
excludes `ItemTag`, `ItemVendor`, `RecipeItem` and `ItemStock` on purpose, because they
carry no `userId` of their own (`purge-coverage.test.ts:21-28`).

### One fragility to fix while here

`purge.resolver.test.ts:76-93` hands `$transaction` a hard-coded 14-element array of
`{ count }` objects in source order, and `:143` uses `Array(14).fill({ count: 0 })`. If a
`deleteMany` is ever added or reordered, the array silently misaligns and the counts map to
the wrong keys — and the test still passes unless the expected values happen to differ.

Both `purge.resolver.test.ts` and `import.resolver.test.ts` use **plain `vi.fn()` stubs**,
not the hand-written stateful fakes the other server tests use. Root `CLAUDE.md` names this
exact failure under *Write test doubles to model the constraint, not the happy path*.

---

## 5. Verification

### Mutation checks required

A green test proves nothing on its own. Each of these must be seen to go **red**, by
breaking the **source**, not the fixture.

| # | PR | Break this | The test that must go red |
|---|---|---|---|
| 1 | 4a | `allItemStocks` resolver scope → `{}` (no filter) | a resolver test asserting one user cannot read another's stock |
| 2 | 4b | restore the cart prefix strip at `importData.ts:403-413` | the two-user cart-collision spec |
| 3 | 4b | drop `itemStocks` from the remap, so the upload sends none | the cloud import E2E — imported items must be stocked, not catalog-only |
| 4 | 4b | map every payload location to the destination default | an E2E asserting a two-location payload arrives as two locations |
| 5 | 4b | restore `deserializeLocation`'s `raw.id === DEFAULT_LOCATION_ID` | a cloud → local import test asserting exactly one default and no stray row |
| 6 | 4c | `purgeUserData`'s `item` filter → `{ userId: 'nobody' }` | the two-user purge spec, on the "A's rows are gone" half |
| 7 | 4c | `purgeUserData`'s `item` filter → `{}` | the two-user purge spec, on the "B's rows survive" half |

Checks 6 and 7 are a **pair**, and both are needed. Each one alone passes against a
different wrong implementation.

### The cart leak is unproved

Decision 1 in the brainstorming log traces it through six files. The trace is consistent and
it is **not proof**. 4b's first task writes the two-user test and runs it on `main`. If it
goes red, the finding stands. **If it passes, the trace has a mistake in it** and the
finding must be withdrawn rather than explained away.

### E2E coverage

| Spec | Project | Tests today |
|---|---|---|
| `e2e/tests/settings/import-export-local.spec.ts` | `local` only | 3 |
| `e2e/tests/settings/import-export-cloud.spec.ts` | `cloud` only (`playwright.config.ts:200`) | 2 |

`import-export-cloud.spec.ts:161` — *user can import a local backup into cloud mode* — is
the **single** E2E test covering the path 4b rewrites, and the only thing standing between
4b and silently stocking every imported item nowhere. 4b extends it and adds specs for
locations, per-location stock, cart ids and the cloud → local direction.

Both new cloud specs in this PR series need **two synthetic users**, which cloud E2E has
not needed since PR 1's `'no-vendor'` split test. 4c and 4b each build one; doing 4c first
would build it once.

### The gate

`pnpm test:e2e:all` — three separate Playwright invocations, never the bare
`pnpm test:e2e`. Measure the baseline on the unmodified tree first and diff the **outputs**,
not the counts. Last measured on `main` at `dac2dcd4`: local 170 passed / 5 skipped, cloud
90 / 7, pwa 69, in 13m49s.

---

## What §6 got wrong

Measured 2026-10-02 against `main` at `dac2dcd4`. §6 was written 2026-08-30, before PRs 3a,
3b and 3c shipped.

| §6 says | Truth |
|---|---|
| `flattenToLocation` | **No such function.** The real one is `flattenPayloadForCloud` (`importData.ts:361`) |
| The `void` block is at `importData.ts:414-418`, inside `importCloudData` | It is at `importData.ts:426-430`, inside `flattenPayloadForCloud` |
| Legacy normalization is at `importData.ts:243-274` | `upgradeLegacyPayload` is at `importData.ts:259-292`. `:243` is a closing brace |
| It produces `locationId: 'local'` | The location is a **parameter**. `'local'` is only `importLocalData`'s default; both real callers pass a resolved id |
| `LocationInput` and `ItemStockInput` are both new | `ItemStockInput` **already exists** (`itemStock.graphql:72`) as a partial-merge input, and cannot be reused |
| `usePostLoginMigration` passes `{ locationId: activeLocationId }` | It passes `readStoredLocationId('local')` (`:38`). The hook takes no options |
| `ItemInput` drops the five state fields in PR 4 | Deferred to PR 5 — dropping an input field is breaking (§2) |
| `exportData.ts:52-53` declares `itemStocks?`/`locations?` | **Correct.** The one reference that has not drifted |

Five pieces of required work are in §6 **not at all**:

1. A whole-account stock query — `itemStocks(locationId: ID!)` cannot serve an export
2. `locationId` on the `InventoryLog` GraphQL type
3. `locationId` on `InventoryLogInput`
4. Cart `locationId` parsed from the cart id instead of hardcoded
5. Removing 2 of the 6 `stockDualWrite` calls

And one defect §6 could not have known about: the cart-id leak, which PR 3b created in this
path on 2026-09-19.

---

## Known gaps after PR 4

| Gap | Owner |
|---|---|
| `Item`'s five state columns still exist, still dual-written at 4 sites | PR 5 |
| Nothing has run the new server code against rows the PR 3b migration converted | still owed from 3b |
| Whether anything still branches on `DEFAULT_LOCATION_ID` — 302 non-comment references across 41 files | must be answered before PR 5 |
| Location RBAC — `requireLocationRole` is still parity-first | issue #273, out of scope |
| `ItemStock` has no cloud → cloud merge strategy of its own; it follows its item, as local does | accepted |
