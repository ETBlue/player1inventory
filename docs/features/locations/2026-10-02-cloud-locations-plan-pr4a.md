# Cloud locations PR 4a — implementation plan

**Date:** 2026-10-02
**Status:** ✅ Tasks 1–8 done, **full gate green** (task 8 fixed the cart regression task 7's gate found). Not pushed, no PR — the main session does both.
**Design:** [cloud locations PR 4 design](2026-10-02-cloud-locations-pr4-design.md)
**Brainstorming:** [PR 4 brainstorming](2026-10-02-brainstorming-pr4.md)
**Branch:** `feature/cloud-locations-pr4a`
**Worktree:** `.worktrees/feature-cloud-locations-pr4a`, based on `main` at `dac2dcd4`

---

## What this PR is

The GraphQL surface that PR 4b needs, and nothing else.

**No web code changes. No behaviour changes. No migration.** Every piece is additive: new
query, new type field, new optional input field, new inputs, new mutations. After this PR
merges, no client calls any of it.

**What the user gets: nothing visible.** This is groundwork so 4b can be one reviewable
diff. Say that plainly in the PR description rather than inventing a benefit.

## What the developer gets

**One rule leaves everyone's head: "which location does an imported row belong to?"**

Today three import resolvers have to answer it, and all three answer it the same wrong way —
`ensureDefaultLocation(userId)`, under a comment apologising for it
(`import.resolver.ts:238`, `:260`, and the two dual-write sites). After 4a the location
comes from the data.

| DX gain | Specifics |
|---|---|
| Fewer ways to get it wrong | 3 hardcoded location fallbacks stop being the only answer. Each one currently writes a row into a location the user did not pick, with no error |
| A failure that now has a name | an import naming someone else's location is rejected through `requireLocationRole`. Today a wrong `locationId` cannot even be expressed, so the wrong row is written silently |
| Export becomes possible at all | `allItemStocks` is the field cloud export needs. Without it an export must fan out one request per location |
| Honest comments | the two import dual-write markers say "PR 5" in the header and "PR 4" in the body. Task 7 makes both say **4b** |

**DX cost, stated plainly:** two more hand-maintained inputs. `LocationInput` and
`ItemStockImportInput` each duplicate a Prisma model's field set, and nothing checks they
stay in sync — the same weakness the existing 9 import inputs have. Accepted because the
alternative, one generic bulk endpoint, would move the per-model `where` scoping out of
view, which is the exact problem issue #320 is about.

## Why it is separate

Brainstorming decision 5. The first split put lossless cloud export in this PR too. That
does not work: changing the payload shape breaks two import readers that use the old shape
as a signal (`importData.ts:359-365` and `:136-143`). So the payload change moved to 4b,
and 4a is left with only the parts nothing reads yet.

## Ground rules for every task

1. **Measure your own baseline before you start.** Run the check on the unmodified tree
   first — `git stash push -u -m "<tag>"` or a second worktree — and diff the **outputs**,
   not the numbers. Never subtract a count written in this plan or in a brief. The counts
   here were measured on 2026-10-02 and go stale on their own.
2. **`import.resolver.test.ts`'s stubs CANNOT see an ownership check.** Measured in task 3:
   `import.resolver.test.ts:195` does

   ```ts
   p.location.findFirst.mockResolvedValue(DEFAULT_LOCATION)
   ```

   which answers "yes, that location is yours" for **any** id, a stranger's included. So an
   ownership check written against that file's stubs **can never fail**, and
   `p.inventoryLog.create` / `p.cart.create` are recorders that cannot show which
   `locationId` column was written. Tasks 4 and 6 add ownership checks in that same file's
   resolvers: write the new tests in a **separate file** with the stateful fakes, as task 3
   did (`import-inventoryLog-location.resolver.test.ts`). `vi.mock` is per file, so the
   alternative is rewriting the 7 passing tests in the old one.

3. **New server tests use the stateful fakes, not `vi.fn()` stubs.** `import.resolver.test.ts`
   and `purge.resolver.test.ts` use plain `vi.fn()` mocks that return a fixed value whatever
   the filter says. A test like that cannot see a wrong `where` clause. Use
   `apps/server/src/test/stockFake.ts` and its `runInTransaction`, and model Prisma's own
   semantics: `where.userId === undefined || row.userId === where.userId`.
4. **Run the mutation check and report it.** Break the **source**, see the test go red,
   restore, see it green. "I added tests" and "I verified the test fails without the
   behaviour" are different claims. Only the second one counts.
5. **Run `pnpm codegen` after every schema change.** There is nothing to commit —
   `apps/server/src/generated/` and `apps/web/src/generated/` are **gitignored**
   (`.gitignore:58-59`) and `git ls-files` on both returns nothing. Run it to confirm the
   new field lands in both files; the root `pnpm build` runs codegen itself and fails on
   drift. *(Corrected 2026-10-02 after task 1 — this rule used to say "commit the
   generated files", which is impossible.)*
6. One commit per task, with scope: `feat(server): …`.

---

## Task 1 — `allItemStocks` query

**Files:** `apps/server/src/schema/itemStock.graphql`,
`apps/server/src/resolvers/itemStock.resolver.ts`, and its test.

Add to the existing `extend type Query`:

```graphql
# Every ItemStock the caller can reach, across all of their locations.
# Cloud export needs all of it in one request, and `itemStocks(locationId:)`
# cannot serve that. Scoped THROUGH the location — ItemStock carries no
# userId column, by design (root CLAUDE.md, Authorization).
allItemStocks: [ItemStock!]!
```

Resolver:

```ts
allItemStocks: async (_, __, ctx) => {
  const userId = requireAuth(ctx)
  return prisma.itemStock.findMany({ where: { location: { userId } } })
}
```

**Do not add a `userId` column to `ItemStock`,** and do not write
`row.userId === ctx.userId` anywhere. Root `CLAUDE.md` forbids both.

**Serialize dates as ISO strings.** Every resolver return site in this repo had a bug where
`Date` fields went out as epoch milliseconds (PR 1's two latent bugs). Check how the
existing `itemStocks` resolver returns and match it exactly.

### Tests

| Test | Asserts |
|---|---|
| returns stock from every location the caller owns | two locations, two rows, both returned |
| does not return another user's stock | user B's row is absent |
| returns `[]` for a caller with no locations | empty array, not null |

**Done 2026-10-02, commit `3fea034e`.** Server tests 259 → 265 (measured in task 7 by
running the suite at this commit). Two things turned out differently from this task's
text:

- The resolver snippet above omits `toGraphQL`, which would have shipped `createdAt`,
  `updatedAt` and `dueDate` as epoch milliseconds — PR 1's bug again. The implementation
  uses `toGraphQL` (`itemStock.resolver.ts:35-42`) and has a test asserting ISO strings.
- `orderBy: { locationId: 'asc' }` is **not** a total order here. `itemStocksForItem` can
  use it because it filters to one `itemId`; `allItemStocks` spans every item, so many rows
  share a location and Postgres may return ties in any order — an export would differ run
  to run. It uses `orderBy: [{ locationId: 'asc' }, { itemId: 'asc' }]`, a true total order
  because of `@@unique([itemId, locationId])` (`schema.prisma:282`).

It also fixed a loaded trap in the **shared** fake: `src/test/stockFake.ts`'s
`matchesStock` dropped `where.location` on the floor, so any future test of a
whole-account stock read written against that fake would have passed with no user scope at
all. This is the same failure root `CLAUDE.md` records for the `cartItem` fake in PR 3c.
Fixed and pinned in `stockFake.test.ts`.

### Mutation check 1 (required)

Change the scope to `{}`:

```ts
- return prisma.itemStock.findMany({ where: { location: { userId } } })
+ return prisma.itemStock.findMany({})
```

The "does not return another user's stock" test **must** go red.

If it stays green, the fake is wrong, not the mutation — it is ignoring the `where` clause.
Fix the fake. This is the exact failure root `CLAUDE.md` describes under *Write test doubles
to model the constraint*: a `findFirst` fake hardcoding `i.userId === where.userId` leaves
the guard green even when the filter is dropped.

---

## Task 2 — `InventoryLog.locationId` on the GraphQL type

**Files:** `apps/server/src/schema/inventoryLog.graphql`, and the resolver if the field is
not resolved by default.

The Prisma column exists and is **NOT NULL** (`schema.prisma:205`), written by every log
writer since PR 3a. The GraphQL type never exposed it, so `inventoryLog.graphql:1-10` lists
only `id, itemId, delta, quantity, occurredAt, note, logKey, logParams`.

Add `locationId: ID!`.

**Check it is non-null-safe before declaring it `ID!`.** The column is NOT NULL in the
schema, but confirm no row can reach the resolver without it — read PR 3a's migration, which
backfilled then constrained. If any path can produce a null, declare `ID` and say why.

### Tests

One resolver test: a log created through any existing writer comes back with the
`locationId` it was written with.

**Done 2026-10-02, commit `6222e335`.** Server tests 265 → 268 (measured in task 7 by
running the suite at this commit), in the existing
`inventoryLog.resolver.test.ts` (24 → 27 tests). No `select` anywhere on the read path, so
nothing had to change in the resolver — only the schema. Declared `ID!`: PR 3a's migration
`20260916000000_add_location_to_log_and_cart` added the column nullable, backfilled it from
each owner's default location, raised an exception if any row was still NULL, and only then
ran `SET NOT NULL`; no later migration touches it, and every resolver returning an
`InventoryLog` returns the whole Prisma row. The reasoning is recorded as a GraphQL doc
string on the field itself, not only here.

It also corrected root `CLAUDE.md` (`d63d1f69`), which claimed `InventoryLog` exposes no
`locationId` field — true when written, false from this commit on.

*(This Done note was missing until task 7 added it; tasks 1 and 3–6 each wrote their own.)*

### Mutation check 2 (required)

Hardcode the field to a wrong value in the resolver (or strip it from the `select` if one is
used). The new test must go red.

**Run in task 7: red.** Adding `locationId: () => 'loc_wrong'` to the `InventoryLog` field
resolvers fails *each exported log reports the location it was written at* with
`expected 'loc_wrong' to be 'loc_kitchen'`.

---

## Task 3 — `InventoryLogInput.locationId`, optional

**Files:** `apps/server/src/schema/import.graphql`,
`apps/server/src/resolvers/import.resolver.ts`.

`bulkCreateInventoryLogs` currently hardcodes the location
(`import.resolver.ts:238`):

```ts
// PR 4 rewrites the import surface to carry real locations. Until
// then an imported log lands in the caller's default location, …
locationId: await ensureDefaultLocation(userId),
```

Add `locationId: ID` to `InventoryLogInput` — **optional**, so no existing client breaks —
and make the resolver prefer it:

```ts
locationId: log.locationId ?? (await ensureDefaultLocation(userId)),
```

**The location must belong to the caller.** An input `locationId` is attacker-controlled. A
log written into someone else's location is a cross-user write. Verify ownership through
`requireLocationRole`, the helper the whole series routes location checks through — not an
inline comparison. If the id is not the caller's, reject the row rather than silently
falling back to the default: a silent fallback hides the error and writes the log somewhere
the user did not ask for.

Do the same in `bulkUpsertInventoryLogs` (`import.resolver.ts:432`).

### Tests

| Test | Asserts |
|---|---|
| a log with `locationId` lands in that location | the row's column matches the input |
| a log with no `locationId` lands in the default | the fallback still works |
| a log naming another user's location is rejected | the row is not created, and the caller gets an error |

**Done 2026-10-02, commit `ebfb0f30`.** Server tests 268 → 277, in a new 21st file.
Role chosen: **`'member'`** — the lowest role that may write under location RBAC. Asking for
`'owner'` would pass today, because `requireLocationRole` ignores `role` before RBAC, and
would then silently deny a legitimate member of a shared location the day RBAC lands.

**Forbidden location: throw, and throw BEFORE the write loop.** `continue` would make a
cross-user attempt look like a successful import that returned fewer rows, with no way to
tell which rows vanished. And throwing from *inside* the loop is only half right — these
bulk resolvers are not transactional, so rows written before the throw stay on disk.
Resolving every distinct location id first means a payload naming a forbidden location
writes **nothing at all**. Pinned by a test with an allowed row ahead of the forbidden one.

Each distinct id is checked once, not once per row: a test asserts `location.findFirst` ran
exactly 2 times for a 5-row payload spanning 2 locations.

**A trap this task caught.** `bulkUpsertInventoryLogs` builds `data` from `...rest` and
passes `data` as the upsert's **`update`** payload. Adding `locationId` to the input puts it
in `rest` automatically — so the obvious patch would have made `update` carry it, and
**re-importing a backup would move every existing log** to whatever location the payload
named. `locationId` is destructured out in both resolvers to prevent it. The cart upsert now
carries the same comment.

Line numbers in this task's text have drifted: the hardcoded `locationId` was at `:239`, not
`:238`, and the upsert's at `:448`, not `:432`.

### Mutation check 3 (required)

Delete the ownership check. The third test must go red. This is the one mutation in 4a that
guards against a cross-user write, so it matters more than the other six.

---

## Task 4 — cart `locationId` from the cart id

**Files:** `apps/server/src/resolvers/import.resolver.ts`.

`bulkCreateShoppingCarts` (`:310`) and `bulkUpsertShoppingCarts` (`:530`) hardcode
`locationId` at `:325` and `:543` respectively — re-measured 2026-10-02 after task 3, which
moved them. They
`locationId: await ensureDefaultLocation(userId)`. Since PR 3b the cart id **already
carries** its location: `${locationId}:${vendorId|'no-vendor'}`. So no new input field is
needed.

Parse the id, and fall back only for a legacy bare id:

```ts
// Cart.id is `${locationId}:${vendorId|'no-vendor'}` since PR 3b, so the
// location rides inside the id and needs no input field. A bare id comes
// from a pre-3b backup and falls back to the caller's default.
const [maybeLocationId, ...rest] = id.split(':')
const locationId =
  rest.length > 0 ? maybeLocationId : await ensureDefaultLocation(userId)
```

**Same ownership rule as task 3.** Route through `requireLocationRole`. A cart id is
attacker-controlled text, and this one is worse than the log case: `Cart.id` is a global
primary key with no `userId` in it, which is the root of the leak 4b fixes.

**Note for the PR description:** this is the server-side half of the cart-id leak. The leak
is **not closed** until 4b stops stripping the prefix on the client. Do not claim 4a fixes
it.

Use `rest.length > 0`, not `split(':').length === 2`. A vendor id containing a colon would
otherwise be misread. Check whether vendor ids can contain one before deciding how to
rejoin `rest`.

### Tests

| Test | Asserts |
|---|---|
| a composite cart id sets `locationId` from the id | the column matches the prefix |
| a bare cart id falls back to the default | the pre-3b path still works |
| a cart id naming another user's location is rejected | no row created |

**Done 2026-10-02, commit `eda64a54`.** Server tests 277 → 290, in a new 22nd file. This
task adds **no schema at all** — the location was already in `ShoppingCartInput.id`.

**Do not hand-roll the split.** `parseCartId` already exists at
`apps/server/src/lib/cartId.ts`, has existed since PR 3b, and `cartId.test.ts` pins it with
16 tests against its `packages/types` twin — including a vendor id that contains a colon.
This task's text suggested `const [maybeLocationId, ...rest] = id.split(':')`, which would
have been a **third** copy of a rule that already had two guarded copies.

`parseCartId` alone cannot serve import, though: for a bare id it returns
`{ locationId: <the whole id> }`, which `requireLocationRole` then refuses. The pre-3b
fallback needs a separate "is there a colon at all" test, which is what the new
`locationIdInCartId` wrapper adds. It returns `string | null`, not a truthy value, so that
`":vendor-1"` (empty location part) is refused rather than silently falling back.

**Can a vendor id contain a colon? Yes**, through an import payload: `bulkCreateVendors`
stores `VendorInput.id` verbatim and `VendorInput.id` is `ID!` with no format check. Neither
id generator produces one — local is `crypto.randomUUID()` (`operations.ts:959`), cloud is
`@default(cuid())` (`schema.prisma:63`) — but a hand-edited backup can supply anything.
The mirror-image limit is that a **location** id containing a colon would be misparsed; that
predates this work, from PR 3b's `cartIdFor`, and neither location id generator makes one.

**A bug fixed on the way: `shoppingFake.cart.upsert` ignored its `update` payload.** Its
comment claimed `update: {}` was the only payload any resolver passes. False —
`bulkUpsertShoppingCarts` passes `update: data`. Nothing was broken in production, but
**every test of a column that upsert writes was unpinned**. With the old fake, mutation
check 3 would have gone red on the wrong line (`lastPurchasedAt`, not the location), so the
obvious "fix" would have been to drop that assertion and leave a negative control that
stays green against a resolver which moves every cart on re-import.

**Task 3's `...rest` trap does not apply here.** `bulkUpsertShoppingCarts` builds `data`
field by field and `ShoppingCartInput` has no `locationId` at all, so the accident cannot
happen. A pinning test and a comment were added anyway.

### Mutation check 4 (required)

Restore the hardcoded `ensureDefaultLocation(userId)`. The first test must go red.

---

## Task 5 — `LocationInput` and its two bulk mutations

**Files:** `apps/server/src/schema/import.graphql`,
`apps/server/src/resolvers/import.resolver.ts`.

```graphql
input LocationInput {
  id: ID!
  name: String!
  order: Int!
  createdAt: String!
  updatedAt: String!
}

# in extend type Mutation
bulkCreateLocations(locations: [LocationInput!]!): [Location!]!
bulkUpsertLocations(locations: [LocationInput!]!): [Location!]!
```

**No `isDefault` field, and the resolvers always write `false`.** The remap rule means the
payload's default location is never uploaded as a row — its id is rewritten to the
destination's existing default — so only non-default locations arrive here. Put the reason
in a comment on the input.

**Corrected 2026-10-02 by task 5:** this used to say there is "no database constraint
limiting it to one row per user". There is —
`CREATE UNIQUE INDEX "Location_one_default_per_user_key" ON "Location" ("userId") WHERE "isDefault"`,
in `migrations/20260830000000_add_location_and_item_stock/migration.sql:57`. Prisma cannot
express a partial index, so it is hand-written SQL and invisible in `schema.prisma`. So
accepting the flag would not create a second default — it would **die with an unhandled
`P2002` after `clearAllData` has already run**, leaving the account empty.

Follow the existing shape of the 18 bulk mutations exactly
(`import.resolver.ts:51-540`): `bulkCreate*` skips a row whose id already exists
(`findUnique` then `continue`), `bulkUpsert*` replaces it. Match the date handling —
`new Date(createdAt)` — and the `requireAuth(ctx)` first line.

### Tests

| Test | Asserts |
|---|---|
| creates locations with their payload ids | ids preserved verbatim |
| `bulkCreate` skips an existing id | the existing row is unchanged |
| `bulkUpsert` replaces an existing row | name and order updated |
| never writes `isDefault: true` | an input that somehow carries it has no effect |
| the account's own default is untouched | the `isDefault` row still has exactly one holder |

**Done 2026-10-02.** Server tests 290 → 311, in a new 23rd file. 16 tests, not the 6 this
task asked for: "another user's location is not readable or writable" is two different
holes in two different mutations, and the throw-before-any-write property needs its own test
in each.

**Following the house style verbatim would have shipped two cross-user holes.** This task's
instruction to "match the existing house style exactly" conflicts with its own ownership
requirement. The new mutations deviate, with a comment at each deviation:

| Mutation | House style | What it does |
|---|---|---|
| `bulkCreate` | `findUnique({ where: { id } })` then `continue` | finds a **stranger's** row and silently drops the caller's own location, with no error |
| `bulkUpsert` | `upsert({ where: { id }, update: data })` with `userId` in `data` | **overwrites the stranger's row and reassigns it to the caller**, taking its `ItemStock`, `Cart` and `InventoryLog` children |

Both are fixed here by `requireOwnLocationIdsOrUnclaimed`, which runs before the write loop
and routes the decision through `requireLocationRole(ctx, id, 'member')`.

**The same two shapes exist in the other 18 bulk mutations** — measured after this task, all
nine upserts use an unscoped `where: { id }` with `userId` in the `update` payload. That is
out of PR 4a's scope and is filed as its own issue.

**`bulkUpsert`'s `update` payload must be narrower than its `create`.** Every other bulk
upsert passes one `data` object to both. Here that is two bugs: `isDefault: false` in
`update` would **demote the caller's own default** if a payload ever named its id, leaving
the account with none; and `userId` in `update` is the row-steal half above.

**The `isDefault` test fixture must start with NO default row.** With a default present, the
partial unique index makes a wrong `isDefault: true` write *fail* instead of *succeed
wrongly* — so the test would go red for the wrong reason and prove nothing about the flag.

**`updatedAt` is unresolved, and recorded as unresolved.** `grep isUpdatedAt` over the
Prisma client runtime returns 0, so the JS client never inspects the descriptor and the Rust
engine decides. No local test can settle it: every server test runs against a fake. The same
open question already applies to the 18 existing bulk mutations, since `Item`, `Shelf` and
`ItemStock` are all `@updatedAt` and their resolvers already pass explicit values.

### Mutation check 5 (required)

Make the resolver pass `isDefault: true`. The last two tests must go red.

---

## Task 6 — `ItemStockImportInput` and its two bulk mutations

**Files:** `apps/server/src/schema/import.graphql`,
`apps/server/src/resolvers/import.resolver.ts`.

```graphql
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

# in extend type Mutation
bulkCreateItemStocks(itemStocks: [ItemStockImportInput!]!): [ItemStock!]!
bulkUpsertItemStocks(itemStocks: [ItemStockImportInput!]!): [ItemStock!]!
```

**Do not reuse or widen `ItemStockInput`** (`itemStock.graphql:72-78`). It is the
partial-merge input for `upsertItemStock` — five optional fields, no identity fields, and a
missing key means "leave that column alone". It is also referenced by
`UnitSwitchStockConversionInput` (`itemStock.graphql:51-54`), so widening it would change
`applyUnitSwitch`'s contract. Renaming it is also out: input type names appear in client
operations, so a rename breaks a cached bundle. Put this reason in a comment next to the new
input, or the next person will try to merge them.

**Ownership, again through `requireLocationRole`.** Both `itemId` and `locationId` are
attacker-controlled. Follow the existing pattern in `bulkCreateCartItems`
(`import.resolver.ts:277-283`), which checks the referenced rows exist — but note that
pattern checks **existence without a user scope**, which is itself part of the leak 4b
fixes. Scope these checks to the caller.

**`ItemStock` has a unique constraint on `[itemId, locationId]`.** Confirm the exact
constraint name and behaviour before writing `bulkCreate`: two payload rows for the same
pair must not both insert, and a `P2002` must not surface as an unhandled error. Local
import handles this by dropping stale rows on the same pair (`importData.ts:1127-1148`) —
read that and match the semantics.

### Tests

| Test | Asserts |
|---|---|
| creates stock rows in the locations they name | each row's `locationId` matches its input |
| `bulkCreate` skips an existing id | existing row unchanged |
| `bulkUpsert` replaces an existing row | quantities updated |
| a row naming another user's location is rejected | no row created |
| a row naming another user's item is rejected | no row created |
| two rows for the same `[itemId, locationId]` do not both insert | one row, no unhandled `P2002` |

**Done 2026-10-02, commit `627a23f2`.** Server tests 311 → 340, in a new 24th file. 25
tests in it plus 4 in `stockFake.test.ts`, not the 7 this task asked for.

**The first test was red for the WRONG reason, and that nearly hid a real gap.** The
original fixture used **one item at two locations**. Hardcoding `locationId` to the default
then made both rows the same `[itemId, locationId]` pair, so the mutation check died with
`P2002` — *not* with "the row is in the wrong location", and the location assertion never
ran at all. A red test is not proof the test works; it has to go red **for the reason you
claim**. The fixture now uses two different items at two different locations, so a wrong
location *succeeds* and must be caught by reading the column:

```
-   "locationId": "loc_garage",
+   "locationId": "loc_kitchen",
```

A separate test covers one item at two locations.

**Three ownership holes here, not one.** `ItemStock` has no `userId`, so there is nothing to
reassign — instead an attacker redirects the row's **two parents**. `upsert` with `itemId`
and `locationId` in the `update` payload moves the victim's row into the attacker's location
and repoints it at the attacker's item: the quantities vanish from the victim's pantry and
appear in the attacker's, under the victim's `createdAt`. Worse than the `Location` case in
one way — the attacker needs only a stock row id, and the row carries real quantity data.

**Local and cloud disagree on duplicate pairs, and cannot be made to agree.** The Dexie
index `[itemId+locationId]` (`apps/web/src/db/index.ts:612`) is **not unique**, so local
allows two rows on one pair; only Postgres enforces it. The comment at
`importData.ts:1126` saying "that pair is unique" is true of cloud, not of the local schema.
A hand-edited local DB with a duplicate pair cannot round-trip. Recorded in the resolver.

**`requireOwnLocationIdsOrUnclaimed` does not fit here.** In task 5 an id no row holds is
free to create; here a `locationId` no `Location` holds is a **broken foreign key**. Reusing
it would have let that through. A separate `requireOwnItemStockRefs` was written instead.

**The pair key separator matters.** `${itemId}:${locationId}` makes `("a:b","c")` and
`("a","b:c")` the same key, and `ItemInput.id` is stored verbatim so a hand-edited backup can
contain a colon — the same hazard task 4 hit in cart ids. It uses `\u0000`.

### Mutation check 6 (required)

Hardcode `locationId` to the caller's default location, ignoring the input. The first test
must go red — and it only can if the fixture seeds **more than one location**. A
single-location fixture cannot tell "the location the row names" from "the default
location", which is the vacuous-fixture trap root `CLAUDE.md` describes.

### Mutation check 7 (required)

Delete the location ownership check. The fourth test must go red.

---

## Task 7 — codegen, gate, docs

1. `pnpm codegen` from the repo root, and confirm the new fields are in both
   `apps/server/src/generated/graphql.ts` and `apps/web/src/generated/graphql.ts`. Both
   are gitignored, so nothing is committed — see ground rule 5.
2. Run the full Verification Gate from the root `CLAUDE.md`, each command with an explicit
   path. The root `pnpm build` is the one that type-checks `apps/server`; `pnpm test`,
   `pnpm check` and `pnpm build-storybook` do not.
3. `pnpm test` from the repo root — **both** workspaces. A web-only run cannot fail on a
   broken resolver, which is how three failing purge tests sat on `main` (issue #250).
4. `pnpm test:e2e:all` — three separate invocations, never the bare `pnpm test:e2e`, and no
   `--grep`. 4a changes no behaviour, so the expected result is the measured baseline
   unchanged.
5. Update `docs/INDEX.md`: the `cloud-locations` row gets 4a, and a new row for PR 4 points
   at the design doc and this plan.
6. Update `docs/features/locations/cloud-locations-status.md`: PR 4 splits into 4a / 4b / 4c,
   with the reason.
7. Update the two import markers' comment text at `import.resolver.ts:76-87` and `:316-327`.
   They say "REMOVED IN PR 5" in the header and "goes away with PR 4" in the body. 4a does
   not remove them — **4b** does. Make both halves say 4b so the next reader is not misled.

---

**Done 2026-10-02.** Every gate command was run with an explicit path from the worktree
root, and every count below was measured here rather than copied from this plan.

| Command | Result |
|---|---|
| `uptime` before starting | load average 1.94 — not starved |
| `pnpm codegen` | clean; `allItemStocks`, the 4 bulk mutations, both new inputs and `InventoryLog.locationId` all present in **both** generated files, and `git status` stays clean (they are gitignored) |
| `(cd apps/web && pnpm lint)` | pass — 4 warnings, all pre-existing, all in `src/routes/shopping/index.tsx` (lines 187, 191, 211, 215) |
| `pnpm build` (root) | pass, exit 0 — codegen + web `tsc -b` + vite + server `tsc` |
| `grep 'TS6385' /tmp/p1i-build-pr4a.log` | no match |
| `(cd apps/web && pnpm build-storybook)` | pass |
| `(cd apps/web && pnpm check)` | pass — the same 4 warnings in the same file |
| `pnpm test` (root, both workspaces) | pass — `apps/server` **340 passed (24 files)**, `apps/web` **2259 passed (249 files)**, `test:spec` 57 pass / 0 fail |
| baseline at merge base `8f34529b` | `apps/server` **259 passed (20 files)** — measured by checking out `apps/server` at the base and removing the 4 files the branch adds, then restoring |
| all 7 mutation checks | **all red, each for the reason claimed** — the failure text of each is in the design doc |
| `pnpm test:e2e:all` | **RED.** local 170 / 5 skipped · cloud **2 failed**, 7 skipped, 88 passed · pwa 69 |

**The E2E failure is real and it blocks the PR.** `import-export-cloud.spec.ts:133`
(cloud → cloud) dies with "Import failed during Forbidden." It is task 4's cart-location
check refusing a location id that `clearAllData` has just deleted and that nothing
re-creates until 4b uploads the payload's locations. Reverting task 4's cart change turns
the same command from 1 passed / 1 failed into 2 passed. Full write-up, with the three
options, in the design doc under *4a is NOT behaviour-neutral*. **Nothing was pushed.**

Documentation fixed in task 7:

- the two import dual-write markers now say **4b** in the header as well as the body, and
  no longer claim the import surface lacks `LocationInput` / `ItemStockImportInput` — 4a
  added both (`eb503758`)
- root `CLAUDE.md`'s server test count, 259/20 → **340/24**, with where the 81 new tests
  are; and its "the server suite has hit this three times" fake list, now **five**
- `docs/INDEX.md` and this status doc record 4a's state honestly, red gate included
- the design doc carries the measured mutation outcomes and the behaviour-neutrality finding

What this task's own brief got wrong: it said the expected E2E result is "the baseline
unchanged", on the stated ground that 4a touches no web code and changes no behaviour. The
first half is true and the second is not — a server-side authorization check is a behaviour
change even with no client calling the new surface.

---

## Task 8 — the cart regression, fixed (unplanned)

Added 2026-10-02, after task 7's gate found a blocking cloud E2E failure. Not in the
original plan. This plan is a record now, not a forecast.

### What was wrong

Task 4 made an imported cart take its location from its own id
(`${locationId}:${vendorId | 'no-vendor'}`) and verify it through `requireLocationRole`.
A cloud → cloud restore then died with **"Import failed during Forbidden."**

1. A cloud export carries no `itemStocks`, so `flattenPayloadForCloud` returns early
   (`apps/web/src/lib/importData.ts:365`) and the cart ids keep their composite form,
   naming the **source** account's locations.
2. The import calls `clearAllData` first, which deletes those very `Location` rows.
3. Nothing uploads the payload's locations — `bulkCreateLocations` exists as of task 5,
   but no client calls it until 4b.
4. `requireLocationRole(ctx, <a deleted location id>, 'member')` refused, and because
   "not yours" is indistinguishable from "does not exist" on purpose, the whole mutation
   threw.

### What was done

The user chose option 2 of the three in the design doc: **fall back to the caller's default
when no row holds the named id, and refuse only when a row holds it and belongs to someone
else.** `resolveCartLocations` now does, once per **distinct** named id and all of it before
the write loop:

```ts
const taken = await prisma.location.findUnique({ where: { id: named }, select: { id: true } })
if (taken) {
  await requireLocationRole(ctx, named, 'member')
  resolved.set(named, named)
} else {
  resolved.set(named, await ensureDefault())
}
```

One shape changed beyond the bug: `":vendor"` — a colon with an empty location prefix — was
refused outright by task 4 and now takes the unclaimed fallback like any other unheld id.
A hand-edited backup *can* create a location whose id is `''` (`LocationInput.id` is stored
verbatim), and in that case the role check decides. Task 4's special case in
`locationIdInCartId` is gone, so `null` there now means only "no colon at all".

**A sibling, not task 5's helper.** `requireOwnLocationIdsOrUnclaimed` returns `void`,
because for `LocationInput` an unclaimed id just means "free to create" and the caller needs
no further answer. Here the resolver must know **which** ids came back unclaimed, so it can
send those carts to the default. Same two-step pattern — unscoped existence check, then
`requireLocationRole` — with a result instead of a bare assertion, and the same accepted
oracle, documented in the helper's block comment.

### Tests

`import-cart-location.resolver.test.ts`: **13 → 19 cases.** One existing test changed its
expectation (the `":vendor"` shape now falls back instead of being refused); the other 12
are unchanged. The fixture keeps three locations and the live target is **not** the default,
so "the location in the id" and "the caller's default" stay different answers.

| New case | Mutations covered |
|---|---|
| an unclaimed id falls back to the default | create and upsert |
| a mixed payload — live, deleted and bare ids — places each one separately | create and upsert |
| a stranger's **live** location is still refused when an unclaimed id sits ahead of it | create and upsert |

### Mutation checks 8, 9 and 10

Checks 8 and 9 are a **pair**: each alone passes against a different wrong implementation.

| # | Mutation | Red | Failure text |
|---|---|---|---|
| 8 | the unclaimed branch refuses instead of falling back (task 4 restored) | 5 tests | `expected [ { message: 'Forbidden', …(3) } ] to be undefined` |
| 9 | a stranger's live location falls back instead of refusing | 6 tests | `expected undefined to be 'Forbidden'` |
| 10 | `ensureDefaultLocation(userId)` hardcoded for every cart, id ignored | 7 tests | `expected 'loc_kitchen' to be 'loc_garage'` |

Each was read, not just counted. Check 8 names the refusal that should not have happened,
check 9 names the refusal that should have, and check 10 names the two locations —
`loc_kitchen` is the default and `loc_garage` is the live non-default target. None went red
for an incidental reason.

### Measured

Every number below was measured in this worktree, on the unmodified tree first where a
baseline was needed.

| Check | Result |
|---|---|
| `uptime` before starting | load average 2.03 — not starved |
| `pnpm test:server` **baseline, unmodified tree** | 340 passed, 24 files — matches task 7 |
| `pnpm test:server` after the fix | **346 passed, 24 files** |
| `(cd apps/web && pnpm check)` baseline and after | 4 warnings both times, all in `src/routes/shopping/index.tsx` (187, 191, 211, 215) |
| `pnpm codegen` | clean; `git status` stays clean (both generated files are gitignored) |
| `(cd apps/web && pnpm lint)` | pass — the same 4 warnings |
| `pnpm build` (root) | pass, exit 0 |
| `grep 'TS6385' /tmp/p1i-build-task8.log` | no match |
| `(cd apps/web && pnpm build-storybook)` | pass |
| `pnpm test` (root, both workspaces) | `apps/server` **346 passed (24 files)**, `apps/web` **2259 passed (249 files)** — unchanged, 4a is still server-only — `test:spec` 57 pass / 0 fail |
| `pnpm test:e2e --project=cloud e2e/tests/settings/import-export-cloud.spec.ts` | **2 passed (47.5s)** — was 1 passed / 1 failed |
| `pnpm test:e2e:all` | **GREEN.** local **170 passed / 5 skipped** (3m14s) · cloud **90 passed / 7 skipped** (9m12s) · pwa **69 passed** (1m23s) |

The E2E result is the exact baseline the design doc records for `main` at `dac2dcd4`. No
flake appeared in this run, so task 7's second, moving cloud failure
(`cleanup-endpoint.spec.ts:129`, then `settings/vendors.spec.ts:218`) did not need a
re-run — which is itself evidence it was starvation, not code.

### What this task's brief got wrong

| The brief said | Truth |
|---|---|
| "Task 4's tests … (13 of them). **Some will need updating.**" — implying several | Exactly **one** needed its expectation changed: the `":vendor"` empty-prefix case. The other 12 pass unchanged, including both stranger-location refusals. |
| `stockFake.ts`'s `location` store "already supports `findUnique` with `where: { id, userId }` **applied**" | True, and it matters in the opposite direction from what the sentence suggests. The new call passes `where: { id }` only, on purpose — an unscoped existence check. The fake's `matchesLocation` applies whatever keys it is given, so `{ id }` alone matches across accounts, which is what makes mutation check 9 able to go red. |
| The suggested code shape used `const taken = named ? await findUnique(…) : null` | Truthiness sends `''` down the no-prefix path without ever asking the database. The code uses `named === null` instead, so `":vendor"` goes through the same existence check as any other id. Same answer today (no row holds `''`), one fewer special case, and correct if a hand-edited backup ever creates one. |

---

## Expected baseline after 4a

Measured on `main` at `dac2dcd4`. Re-measure rather than trusting these.

| Check | Before | Expected after | **Measured after task 8** |
|---|---|---|---|
| `apps/server` tests | 259 passed, 20 files | 259 + the new cases | **346 passed, 24 files** |
| `apps/web` tests | 2259 passed, 249 files | **2259, unchanged** — 4a touches no web code | **2259, unchanged** ✅ |
| E2E local | 170 passed / 5 skipped | unchanged | **170 / 5** ✅ (3m14s) |
| E2E cloud | 90 passed / 7 skipped | unchanged | **90 / 7** ✅ (9m12s) |
| E2E pwa | 69 passed | unchanged | **69** ✅ (1m23s) |
| `stockDualWrite` calls | 6 across 5 files | **6, unchanged** — 4b removes two |
| `REMOVED IN PR 5` markers | 7 | 7, with two re-labelled to 4b |

**Both rows in that table are now history, and the marker row was never re-measured.**
Re-measured 2026-10-05 on the finished PR 5 branch: 4b took the calls to **4 in 4 files**
and the markers to **5**, and PR 5 took both to **0**. `apps/server/src/lib/stockDualWrite.ts`
is deleted. The "7 → 7" row above is what the plan *expected*; nobody checked it after task 8,
which is how 5 got written down elsewhere as 7. Re-measure, never subtract.

**If `apps/web`'s count moves, something is wrong.** 4a is server-only. A changed web count
means a generated file changed a test's behaviour, and that needs explaining before the PR
goes up.

---

## Known gaps this PR leaves

| Gap | Owner |
|---|---|
| Nothing calls any of the new surface | 4b |
| Cloud export is still lossy | 4b |
| The cart-id leak is still open — the server half is ready, the client still strips | 4b |
| The 2 import dual-writes are still in place | 4b |
| `purgeUserData` still has no real-SQL two-user test | 4c |
| `ItemInput` still carries the five state fields | PR 5 |
