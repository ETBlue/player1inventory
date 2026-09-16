# Plan — PR 3a: additive migration and location-scoped logs

**Date:** 2026-09-16
**Branch:** `feature/cloud-locations-pr3a`
**Worktree:** `.worktrees/feature-cloud-locations-pr3a`
**Design:** `2026-08-30-cloud-locations-design.md` §4.5, §8 (Amendment 2026-09-16)
**Brainstorming:** `2026-09-16-brainstorming-pr3-split.md`
**Status:** `cloud-locations-status.md`

Six tasks. Each ends with the full verification gate from root `CLAUDE.md`.

## What PR 3a is, and is not

**Is:** add, backfill and constrain `InventoryLog.locationId` and `Cart.locationId`.
Scope inventory logs by location, server and client.

**Is not:** the `'no-vendor'` split, the `Cart.id` re-key, the cart resolvers,
`applyUnitSwitch`, or `removeItemFromLocation`'s cascade. Those are PR 3b and 3c.

**`Cart.locationId` is written here and read by nothing.** That is on purpose. It
lands additively now so PR 3b's re-key has a column to build on. Do not wire any
cart query to it.

**PR 3a is additive in the database but NOT in the API.** The logs queries gain a
`locationId` argument and the client starts passing the active location. The API
change ships with its own client in this same PR.

## Standing rules

- **Never print a database connection string** into a report, a commit, a doc, or
  quoted output.
- `apps/server/.env` is gitignored and stays that way.
- **Never write `row.userId === ctx.userId` as an authorization check.** Route
  through `requireLocationRole` (`apps/server/src/lib/authz.ts`).
- `ItemStock` must never gain a `userId` column. Neither should any new scoping
  path depend on one.
- **Never point `pnpm verify:migration` at a production copy.** It opens with
  `migrate reset`. It is written for `TEST_DATABASE_URL`.
- Read `apps/server/prisma/CLAUDE.md` before touching a migration. A migration
  must be valid on a database built only from committed history.
- Before any Playwright run, check ports 5175, 5174 and 4001 are free and stay
  free for about 90 seconds. Never kill another session's server.
- **Do not narrow the E2E run with `--grep`.** Root `CLAUDE.md` was corrected on
  2026-09-16: `--grep` silently skips whole spec files. Run the suite, or pass
  positional spec paths.

---

## Task 1 — Prisma schema and the additive migration

**Step 1.1.** Add to `apps/server/prisma/schema.prisma`:

- `InventoryLog.locationId String` + `location Location @relation(...)` + an index
  that serves the read path (`@@index([itemId, locationId, occurredAt(sort: Desc)])`
  is the shape the queries want — confirm against the resolvers in Task 2 before
  settling on it).
- `Cart.locationId String` + `location Location @relation(...)`.

Decide the `onDelete` for both and say why in the schema comment. `ItemStock` uses
`Cascade` on its location. Deleting a location that still owns logs or carts is
the same question; `deleteLocation` currently refuses only for the default one.

**Step 1.2.** Write the migration **by hand**. Four phases per column, in this
order, matching §4.5:

1. `ADD COLUMN "locationId" TEXT` — nullable
2. backfill from the owner's default location
3. `SET NOT NULL`
4. add the FK and the index

The backfill joins through `userId` to `Location` where `isDefault`. Every user
holding a log or a cart already has a default location — PR 1's migration
backfilled them and `ensureDefaultLocation` covers everyone since (issue #287,
fixed 2026-09-16 in `apps/server/src/lib/defaultLocation.ts`).

**Do not assume that.** Add a guard: if any row would be left with a NULL
`locationId`, the migration must fail loudly rather than proceed to `SET NOT NULL`
and get a less readable error. State in the SQL comment what the guard protects.

**Step 1.3.** Run `pnpm verify:migration` (against `TEST_DATABASE_URL`, never a
production copy). Confirm the migration applies to a database built from committed
history alone.

### Mutation check (required)

Delete the backfill statement, keep `SET NOT NULL`. `verify:migration` must fail.
That proves the backfill is what makes the constraint satisfiable rather than the
table happening to be empty. If the test database is empty the check proves
nothing — seed a row first and say that you did.

Restore and confirm green.

### Report

- the migration file name and its four phases per column
- the `verify:migration` result
- the mutation check: exact failure text
- what you chose for `onDelete` and why

---

## Corrections found while running this plan

| Task | What the plan got wrong |
|---|---|
| 1 | **"Add two columns, nothing else" cannot pass Task 1's own gate.** Both columns are `NOT NULL` with no default, so Prisma's generated client requires `locationId` at every `create`. `pnpm build` failed with 8 TypeScript errors across 6 resolvers before anything else was touched. Making the field optional in Prisma while `NOT NULL` in the database would turn a compile error into a runtime 500 on every insert. So Task 3's Step 3.2 was pulled forward: nine write sites now pass `ensureDefaultLocation`, each with a marker. |
| 1 | The plan did not mention `apps/server/scripts/verify-migration.ts`. It parks one migration **by name**, so a second location migration cannot reset past it. Whoever writes the next one must add it to the `MIGRATIONS` list. |
| 1 | The plan did not ask for new assertions in the verify script. Without them the script proves PR 1's migration and says nothing about this one. They were added. |
| 1 | Several existing comments said "PR 3" for work now split three ways, and two became false with this commit — `Cart.locationId` exists now. Updated in `stockDualWrite.ts`, `cart.resolver.ts`, `recipe.resolver.ts`, `itemStock.resolver.ts`, `location.resolver.ts`. |
| 2 | **The plan pointed at the wrong fake, and the right one did not exist.** It said to check whether `stockFake.ts` models `locationId`. It does, and always did — so that check would have returned "fine". But `inventoryLog` was never in `stockFake.ts`. It was four bare `vi.fn()` call recorders inside `inventoryLog.resolver.test.ts`, with no `where` handling of any kind. A recorder returns whatever `mockResolvedValue` gave it, so it could not tell **any** scoped query from an unscoped one — not `locationId`, not `userId`, not `itemId`. Every read assertion in that file was checking the mock's own return value. Fixed by writing `apps/server/src/test/inventoryLogFake.ts`, which applies Prisma's `where` semantics key by key. |
| 2 | **The plan's own two statements about the API conflict.** It says PR 3a's API change "ships with its own client in this same PR", which reads as a required argument — but a required argument cannot land in Task 2 without also doing Task 4, which Task 2 was told not to start. The brief's suggested escape (a schema default) is impossible: a GraphQL default must be a literal, and no literal means "the caller's default location". The workable form is a **nullable** argument with a server-side fallback. Task 4 or Task 6 must tighten it to `ID!` once every caller passes it — an omitted argument reads the wrong location quietly, while a missing required argument fails loudly at codegen. |

### What this means for earlier location work

The inventory-log read tests were weaker than they looked, for as long as that mock
existed. Anyone auditing earlier location PRs should not count them as coverage.

The general rule is already in root `CLAUDE.md`: "Write test doubles to model the
constraint, not the happy path." This is the third instance in this repo, after the
`findFirst` fake that hardcoded `i.userId === where.userId` and the `createMany` fake
that silently deduped. **A call recorder is the weakest form** — the other two at least
had a `where` to get wrong.

**Tasks 2 and 3 are merged.** Task 3 shrank to "add the argument and the role check"
once Task 1 had to supply a location at every write site. Both tasks live in
`inventoryLog.resolver.ts` and both need `requireLocationRole`, so splitting them
would mean two agents editing the same file back to back.

**One wording risk recorded by Task 1.** The migration guard says "These users have
no default Location". That is the right diagnosis for the real failure. During the
mutation check it named two users who *do* have one, because the backfill had been
removed on purpose. The message describes the real-world cause, not an edit to the
migration.

## Task 2 — Server: the logs API, read and write

Three queries gain a `locationId`. Read `apps/server/src/resolvers/inventoryLog.resolver.ts`
and `apps/server/src/schema/inventoryLog.graphql` first.

| Query | Today | After |
|---|---|---|
| `itemLogs(itemId)` | `where: { itemId, userId }` | scoped to one location |
| `inventoryLogCountByItem(itemId)` | same | scoped to one location |
| `lastPurchaseDates(itemIds)` | same | scoped to one location |
| `inventoryLogs` | all of the user's | **decide and say why** |

`inventoryLogs` (no arguments) is the export path. Export should probably stay
whole-account rather than per-location, but check who calls it before deciding,
and write the reason into the resolver.

**Match local mode exactly.** `getItemLogs` in `apps/web/src/db/operations.ts:577`
reads:

```ts
logs.filter((log) => (log.locationId ?? DEFAULT_LOCATION_ID) === locationId)
```

Cloud has no nullable `locationId` after Task 1, so the `??` branch cannot happen
there. Do not copy the `??` into the resolver — a column that is `NOT NULL` does
not need a fallback, and one written anyway reads as if NULLs were possible.

**Authorization.** Every one of these takes a caller-supplied `locationId`. That
id must go through `requireLocationRole(ctx, locationId, 'viewer')` before it
reaches a query. Do not add a `userId` equality check.

### Mutation check (required)

Drop the `locationId` filter from `itemLogs` so it returns every log for the item.
A test with logs at **two** locations must go RED.

If the fixture has one location the test cannot fail, and it proves nothing —
root `CLAUDE.md`, "Every location-scoped test needs a fixture stocked only at
*another* location". Say plainly which fixture you used.

Run the same mutation against `inventoryLogCountByItem` and `lastPurchaseDates`.
Report each.

---

## Task 3 — merged into Task 2

See the corrections table above.

### What Task 1 already did

Nine write sites supply `ensureDefaultLocation(userId)` because the column is
`NOT NULL`. `addInventoryLog` is one of them. Markers are in place:
`grep -rn "PR 3b:" apps/server/src` returns 4.

### What Task 2 still owes from this section

**Step 3.1.** `addInventoryLog` gains a `locationId` argument, routed through
`requireLocationRole(ctx, locationId, 'member')`.

**Step 3.2.** Every server-side log writer must set `locationId`. Find them all —
`grep -rn "inventoryLog.create" apps/server/src` — and check at least `checkout`
(`cart.resolver.ts`) and `consumeRecipes` (`recipe.resolver.ts`).

**These two can only write the caller's default location in PR 3a**, because a
cloud `Cart` has no usable location until PR 3b re-keys it, and
`ConsumeRecipesInput` carries no location at all. Use `ensureDefaultLocation`
and mark each site:

```ts
// PR 3b: replace with the location the cart / consume actually names.
```

so `grep -rn "PR 3b:" apps/server/src` is 3b's checklist, the way
`REMOVED IN PR 5` is PR 5's.

**Say this in the report rather than hiding it:** after PR 3a, a user who checks
out while viewing their Garage still writes the log against their Kitchen. That
is not fixed here. It is the same limitation `stockDualWrite.ts` already carries
and documents.

### Mutation check (required)

Make `addInventoryLog` ignore its `locationId` and write the default instead. A
test that adds a log at a non-default location and reads it back there must go
RED.

---

## Task 4 — Web client: pass the active location

**Step 4.1.** `apps/web/src/hooks/useInventoryLogs.ts` — the cloud branch of
`useItemLogs` passes the active location. The local branch already does
(`getItemLogs(itemId, activeLocationId)`).

**Step 4.2.** Find every other cloud log query and do the same. Start from
`useItems.ts:1049` (`['inventoryLogs', 'countByItem', itemId, { locationId }]` —
local already keys by location; cloud must match) and from whoever calls
`lastPurchaseDates`.

**Step 4.3. Writes resolve the location at call time, not render time.** Use
`useCloudLocationId()` (`apps/web/src/hooks/useCloudLocationId.ts`). PR 2 added it
for exactly this: on a fresh cloud session the active id is the `'local'`
sentinel until `GetLocations` resolves, and a write sent with the sentinel is
refused with `FORBIDDEN` and lost. A read self-corrects; a write does not.

**Step 4.4.** Check `refetchQueries`. PR 2 found that refetching **by name**
refetches every observer with that name, including one `skip` has parked on a bad
id — and under `awaitRefetchQueries` that rejects a mutation which already
succeeded. Target the refetch at the location written.

### Mutation check (required)

For one cloud log query, pass a hardcoded default location instead of the active
one. A test at a non-default location must go RED.

---

## Task 5 — Rehearsal: the additive migration against a production copy

**This task is BLOCKED until the user creates a fresh Neon branch from
production and puts its connection strings in `apps/server/.env` as
`PROD_COPY_DATABASE_URL` / `PROD_COPY_DIRECT_URL`.** Stop and ask. Do not reuse
the branch used for the 2026-09-16 read-only measurement — a rehearsal writes to
its target.

**Never run `pnpm verify:migration` against it.** That script opens with
`migrate reset`.

**Step 5.1.** Record the before state, read-only: counts for `InventoryLog`,
`Cart`, `CartItem`, `Location`, and rows whose owner has no default location
(must be 0).

**Step 5.2.** Apply only this migration, with the two `PROD_COPY_` vars standing
in for `DATABASE_URL` / `DIRECT_URL` for that one command.

**Step 5.3.** Assert afterwards:

| Assertion | Why |
|---|---|
| Every `InventoryLog` has a `locationId` | the backfill reached every row |
| Every `Cart` has a `locationId` | same |
| Every log's location belongs to the log's own user | no cross-user backfill |
| Every cart's location belongs to the cart's own user | same |
| Log and cart counts are unchanged | the migration moved nothing |
| `Cart.id` values are unchanged | **PR 3a must not re-key.** This is the assertion that proves the split held |

**Name which assertions cannot fail on this data.** Production has one user, so
"no cross-user backfill" is trivially satisfied — the same limitation Rehearsal 1
recorded. Say so rather than counting it as passed.

**Step 5.4.** Tell the user to delete the Neon branch when the rehearsal is done.

---

## Task 6 — Docs, gate, and the full E2E run

**Step 6.1.** Update `cloud-locations-status.md`: PR 3a done, what it covers, what
3b and 3c still owe. Update `docs/INDEX.md`'s short row.

**Step 6.2.** Update `apps/server/prisma/CLAUDE.md` if the four-phase additive
pattern is worth recording there for the next migration.

**Step 6.3.** Full verification gate.

**Step 6.4.** Full E2E, both projects, **no `--grep`**:

```bash
pnpm test:e2e
```

Zero failures, except the ones already known red on `main`:
`item-list-state-restore.spec.ts` fails 4 local + 4 cloud (issue #280, left alone
on purpose). **Confirm the count is exactly 8 and that they are the same 8.** Any
other failure is yours.

`item-logs.spec.ts` is in the cloud `testMatch` and is the spec most likely to
catch a mistake in this PR.

### Report

- gate results command by command
- E2E counts per project, and the issue #280 failures named individually
- the final list of what PR 3b and PR 3c still owe
