# Cloud locations PR 4a — implementation plan

**Date:** 2026-10-02
**Status:** 🔲 Pending
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

**Done 2026-10-02, commit `3fea034e`.** Two things turned out differently from this
task's text:

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

### Mutation check 2 (required)

Hardcode the field to a wrong value in the resolver (or strip it from the `select` if one is
used). The new test must go red.

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

**No `isDefault` field, and the resolvers always write `false`.** `Location.isDefault` is
`Boolean @default(false)` with no database constraint limiting it to one row per user. The
remap rule means the payload's default location is never uploaded as a row — its id is
rewritten to the destination's existing default — so only non-default locations arrive here.
Accepting the flag would let a payload create a second default and nothing would stop it.
Put that reason in a comment on the input.

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
`UnitSwitchStockConversionInput` (`itemStock.graphql:46-49`), so widening it would change
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

## Expected baseline after 4a

Measured on `main` at `dac2dcd4`. Re-measure rather than trusting these.

| Check | Before | Expected after |
|---|---|---|
| `apps/server` tests | 259 passed, 20 files | 259 + the new cases |
| `apps/web` tests | 2259 passed, 249 files | **2259, unchanged** — 4a touches no web code |
| E2E local | 170 passed / 5 skipped | unchanged |
| E2E cloud | 90 passed / 7 skipped | unchanged |
| E2E pwa | 69 passed | unchanged |
| `stockDualWrite` calls | 6 across 5 files | **6, unchanged** — 4b removes two |
| `REMOVED IN PR 5` markers | 7 | 7, with two re-labelled to 4b |

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
