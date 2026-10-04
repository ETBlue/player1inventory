# Cloud locations PR 5 — implementation plan

**Date:** 2026-10-04
**Status:** 🔲 Pending
**Design:** [cloud locations design](2026-08-30-cloud-locations-design.md) §8 — **and that
section's framing of PR 5 is wrong, see *What the design doc gets wrong* below**
**Branch:** `feature/cloud-locations-pr5`
**Worktree:** `.worktrees/feature-cloud-locations-pr5`, based on `main` at `9b809f1b`
**Blocks:** all household work except H1 — see *Why this is on the critical path*

---

## What this PR is

The contract step. `Item` loses its five stock state columns — `targetQuantity`,
`refillThreshold`, `packedQuantity`, `unpackedQuantity`, `dueDate` — and the PR 2 bridge that
kept them fed comes down.

## Why this is on the critical path

The households design (`feature/households`,
`docs/global/permissions/2026-10-04-households-design.md`) names this PR as a hard blocker:

> *Household work starts **after cloud-locations PR 5 merges**. It changes `userId` to
> `householdId` on seven models and removes `isDefault`, and PR 5 changes the same code.*

Only phase H1 (the Settings layout) can start before this merges. H2 and H3 cannot.

PR 5 is also a net win for that work: it deletes **both** `Location.isDefault` reads in
`itemStock.resolver.ts` — the `upsertItemStock` branch and the `defaultLocationIds` set — and
households removes the column entirely in H3. **Do not quote a total.** This plan said "2 of
the 5 reads" and task 3 measured 6 occurrences of which 3 were reads; after task 3, what is
left in that file is two **comments** explaining the removal. Counting `isDefault` by grep
mixes reads, writes and comments, so **re-measure and say which kind** rather than subtracting.

## What the design doc gets wrong

§8 says PR 5 should *"delete `apps/server/src/lib/stockDualWrite.ts` and all FIVE of its call
sites"*. Measured 2026-10-04, two things are wrong with that.

**There are 4 calls, not 5**, in 4 files, plus one inline block. PR 4b took the two import
ones. The count is already right in
[the PR 4 design doc](2026-10-02-cloud-locations-pr4-design.md) — cite that, not §8.

**And deleting all four would stop cloud stock updating.** `mirrorStock` is the **only**
`ItemStock` write in both `checkout` and `consumeRecipes`:

| Call site | What it writes | PR 5 |
|---|---|---|
| `cart.resolver.ts:178` | `ItemStock` — the only stock write in `checkout` | **survives**, renamed |
| `recipe.resolver.ts:103` | `ItemStock` — the only one in `consumeRecipes` | **survives**, renamed |
| `item.resolver.ts:191` | `ItemStock` from `UpdateItemInput`'s five fields | deleted — the input loses them |
| `itemStock.resolver.ts:137` | `Item` from the stock row (reverse mirror) | deleted |
| `itemStock.resolver.ts:345-358` (inline) | `Item`, inside the transaction | deleted |

So PR 5 removes the bridge **in one direction** and promotes the other direction to being the
real write. It is not a pure teardown.

## What the user gets (UX)

**Nothing visible, and one thing taken away for one page load.** See *The accepted break*.

The gain is indirect: this unblocks households, which is where sharing a pantry with family
comes from.

## What the developer gets (DX)

| Gain | Specifics |
|---|---|
| Less code | `stockDualWrite.ts` (232 lines) deleted. 5 `REMOVED IN PR 5` markers gone. ~21 dual-write tests across 5 files gone. `upsertItemStock`'s duplicate inline upsert folded away |
| One way to write stock | `writeStock` in a new `lib/itemStockWrite.ts` replaces **two** duplicate general-purpose upserts — `mirrorStock`'s and `upsertItemStock`'s. **It does not become the only stock writer**, and the claim that it does was wrong: `applyUnitSwitch`'s write is transaction-bound, and three more (`addItemToLocation`, `bulkCreateItemStocks`, `bulkUpsertItemStocks`) have genuinely different contracts. Corrected 2026-10-04 by task 1 |
| Less to remember | `Item` stops having two meanings. Today it carries both configuration and a copy of the default location's state, and four `stripStockFields` call sites exist to undo that |
| Fewer ways to get it wrong | `Item`'s columns can currently hold values no `ItemStock` row has — `createItem` and both bulk item imports write them with no stock row. After PR 5 that divergence cannot exist |
| Honest documentation | 3 stale dual-write counts corrected (§8.4 of the survey), plus 5 doc files that describe the bridge in the present tense |
| Households gets smaller | 2 of 5 `Location.isDefault` resolver reads go |

**DX cost, stated plainly.** This is the first PR in the series that is **not safe for a stale
browser bundle**, and that is deliberate — PRs 1 through 4b were all designed so an old bundle
kept working. `railway.toml`'s release command protects the server, never the client. And the
work is scattered: 4 GraphQL declarations, 8 web operations, 4 separate `cloudItem` fixture
copies, and 5 doc files, none of which `grep "REMOVED IN PR 5"` finds.

---

## The accepted break

**8 web operations still SELECT the five fields on `Item`.** PR 2 stopped the client *using*
them; it never stopped it *asking* for them.

| Operation | File:line |
|---|---|
| `GetItem` | `apps/web/src/apollo/operations/items.graphql:11-14, 17` |
| `GetItems` | `items.graphql:36-39, 42` |
| `CreateItem` | `items.graphql:57-60, 63` |
| `UpdateItem` | `items.graphql:81-84, 87` |
| `PantryData` | `apps/web/src/apollo/operations/itemStocks.graphql:15-18, 21` |
| `ApplyUnitSwitch` | `itemStocks.graphql:108-111, 114` |
| `BulkCreateItems` | `apps/web/src/apollo/operations/import.graphql:11-14, 16` |
| `BulkUpsertItems` | `import.graphql:101-104, 106` |

Dropping a field a document selects fails **GraphQL validation** — the whole operation errors.
So `GetItems` and `PantryData` failing means a **blank pantry**, not missing numbers.

Decided 2026-10-04 to accept it:

| | |
|---|---|
| Who breaks | a browser holding a pre-PR-5 bundle |
| Symptom | `GetItems` / `PantryData` fail validation → blank pantry |
| Fix | reload the page |
| Not fixed by a reload | **a Cloudflare Pages preview built before PR 5.** It keeps its old bundle and points at the shared cloud API |

Production has one user. The server is never mismatched, because Railway runs
`prisma migrate deploy` as its release command, after the build and before the new instance
takes traffic.

**The server schema change and the 8 document edits must ship in the same PR.** There is no
staging this one.

---

## Ground rules for every task

1. **Run `pnpm codegen` first.** `apps/web/src/generated/` is gitignored, so a fresh worktree
   holds a stale copy and **19 web tests fail** with
   `No "AllItemStocksDocument" export is defined`. That is not a code bug.
2. **The dev database is TWO migrations behind.** `prisma migrate status` lists
   `20260916000000_add_location_to_log_and_cart` and
   `20260917000000_rekey_cart_to_location_vendor` as unapplied, and
   `migrate diff` confirms `Cart.locationId` and `InventoryLog.locationId` are genuinely
   missing. **The first `migrate dev` will apply both before creating ours** — a backfill and
   a primary-key re-key, under our command. Read `apps/server/prisma/CLAUDE.md` first, and run
   the cloud E2E suite once before starting so a pre-existing failure is not mistaken for ours.
3. **Measure your own baseline.** Measured 2026-10-04 at `9b809f1b` after codegen: web
   **2285 passed / 248 files**, server **347 passed / 24 files**, `typecheck` clean. Diff the
   outputs, not the numbers.
4. **`grep "REMOVED IN PR 5"` is a complete checklist for the server and nothing else.** It
   finds nothing in `apps/web`, `e2e/`, or the four GraphQL declarations. For the web half use
   `grep -rn "PR 5" apps/web/src`.
5. **Run the mutation check and confirm it goes red for the reason you claim.** PR 4b had one
   check die on an unrelated `P2002` and two that could not fail at all.
6. **Read every fake before trusting it.** PR 4a and 4b found holes in five.
7. One commit per task, with scope.

---

## Task 1 — `writeStock`, the one way to write stock

**Additive and a refactor. No deletions, no behaviour change.**

New file `apps/server/src/lib/itemStockWrite.ts`:

```ts
export async function writeStock(
  itemId: string,
  locationId: string,
  data: StockWrite,
): Promise<ItemStock>   // returns the saved row, NOT void
```

It is `mirrorStock` (`stockDualWrite.ts:149-167`) with an honest name and a return value. The
name must carry its own history in a comment: it was called *mirror* because `Item`'s columns
were the source of truth; since PR 5 this **is** the source of truth.

**Returning the row is required, not a nicety.** `checkout` computes the inventory log's
`quantity` from `Item`'s two quantity columns today (`cart.resolver.ts:172`), and task 2 has to
re-source it from the saved stock row.

**Fold in `upsertItemStock`'s duplicate.** `itemStock.resolver.ts`'s `upsertItemStock` has a
near-identical `findUnique`-then-`update`-or-`create` block. Move it onto `writeStock`. Note
the subtlety its comment records: `requireLocationRole` already returns `isDefault` on the
authorized row, so `upsertItemStock` must not gain a second location query.

Keep `mirrorStock` in place for now — tasks 2 and 3 remove its callers.

### Tests

The existing `mirrorStock` tests show the shape. New ones for `writeStock`:

| Test | Must assert |
|---|---|
| creates a row with zeroes for unset fields | a partial `data` leaves the others at 0, not null |
| updates an existing row | only the named fields change |
| returns the saved row | the return value's quantities match what was written |
| an `{ increment }` write is applied | the row's value is old + delta |
| `upsertItemStock` still behaves identically | its existing tests pass unchanged |

### Mutation check 1

Make `writeStock` return `void` and have the caller recompute from its input. The "returns the
saved row" test must go red. This is the check that protects task 2.

---

**Done 2026-10-04.** Server **347 → 357** (+10 tests, +1 file). Web unmoved at 2285/248.
Nothing deleted, so PR 5 is still fully reversible at this point.

**This task's text contradicted itself and the agent caught it.** It asked for
`Promise<ItemStock>` *and* for `writeStock` to "match what `mirrorStock` does today" on an
empty `data`. `mirrorStock` writes nothing and returns `void` — a function that must return
the saved row cannot decline to write one. `writeStock` always writes, and the file says why.

It then checked the thing that makes that safe: **`mirrorStock`'s empty guard is unreachable
from every one of its callers.** `mirrorStockToDefaultLocation` makes the same emptiness test
itself before calling, and `checkout` and `consumeRecipes` both pass object literals whose
keys are always present. So dropping the guard changes nothing observable.

**`mirrorStock` has no unit tests at all.** This task's text said "its existing tests show the
shape". There is no `stockDualWrite.test.ts`; the module is reached only through five resolver
spec files. Nothing of those changed and nothing failed.

**A real race was fixed on the way.** `upsertItemStock` went from 2 queries to 1. Two
concurrent first writes for the same `(itemId, locationId)` pair could both find no row and
both try to create one, and one would fail with `P2002`. Postgres applies
`INSERT … ON CONFLICT DO UPDATE` as one statement.

**And this task's own stop rule would have selected the worse implementation.** It said "if any
`upsertItemStock` test needs editing, stop — that is a signal you changed behaviour". All 8
failed, on a **missing mock method** (`itemStock.upsert` was absent from that file's
hand-written prisma mock), not on a behaviour change. Read literally, the rule pointed at
keeping the racy `findUnique`-then-branch shape to avoid editing a double. No assertion or
`it(…)` block changed.

**`stockFake`'s `itemStock` store handles `{ increment }` on update but not on create** — the
create path stores the object verbatim. Safe to rely on, because the stored value is then an
object where a number is expected and the assertion fails loudly. Mutation 2 proves it:
`expected { increment: 6 } to be 6`.

Five mutation checks, all red for the stated reason. Two of them are the required check split
in half, and both halves are needed: returning `void` proves the test consumes the return
value (`Cannot read properties of undefined`), and recomputing the total from the input proves
the fixture can tell the saved row from the delta (`expected 5 to be 10`). The fixture starts
at packed 2 / unpacked 3 and increments by 5, so the total (10), the delta (5) and the written
column alone (7) are three different numbers.

## Task 2 — checkout and cooking write stock, not `Item`

**This is the behaviour change.** Both resolvers stop writing `Item`'s columns and keep
writing `ItemStock`, now through `writeStock`.

### `checkout` — `apps/server/src/resolvers/cart.resolver.ts`

| Delete | Keep, moved onto `writeStock` |
|---|---|
| `prisma.item.update({ data: { packedQuantity: { increment } } })` at `:167-171` | the stock write at `:178-180` |
| the `REMOVED IN PR 5` marker at `:174` | |

**`finalQuantity` at `:172` is the hard part.** Today:

```ts
const updatedItem = await prisma.item.update({ ... })
const finalQuantity = updatedItem.packedQuantity + updatedItem.unpackedQuantity
```

It feeds the inventory log at `:186`. After PR 5 it must come from the `ItemStock` row
`writeStock` returns. **Do not compute it from the cart item's input** — the log records the
resulting on-hand total, not the delta.

### `consumeRecipes` — `apps/server/src/resolvers/recipe.resolver.ts`

Delete `prisma.item.updateMany(...)` and the marker at `:98`. This one has no `finalQuantity`
problem: it uses `item.quantity` from the client input at the log site.

### Tests

`cart.resolver.test.ts:751` holds `describe('checkout dual-writes onto ItemStock')`, 5 tests.
`recipe.resolver.test.ts:443` holds the twin, 5 tests. **These do not all delete.** The half
asserting the `ItemStock` write is now the primary behaviour and must survive, renamed. Only
the half asserting the `Item` write goes. Say which you kept, which you rewrote and which you
deleted, one line each.

Add: the inventory log's `quantity` equals the **stock row's** packed + unpacked after
checkout. The fixture must make that differ from the cart delta, or the assertion cannot tell
the two sources apart.

### Mutation check 2

Compute `finalQuantity` from the cart item's input instead of the saved row. The new log
assertion must go red. **The fixture needs a non-zero starting quantity** or input and total
give the same answer.

---

**Done 2026-10-04, commit `0c7b10b6`.** Server **357 → 358**, web unmoved at 2285/248.
`REMOVED IN PR 5` markers **5 → 3**, and the 3 left are exactly task 3's two files.
`finalQuantity` now comes from the saved row (`cart.resolver.ts:187`).

**This task's test list of 10 undercounted by four, and two of the four were the dangerous
kind.** Fourteen tests had to change, not ten. Four lived outside the two named `describe`
groups, and **two of those were vacuous negative controls**:
`expect(mockPrisma.item.update).not.toHaveBeenCalled()`. Once the source call is deleted, such
an assertion **can never fail** — so it would have sat there reporting coverage of "refused
before any write" while checking nothing, and it never turns red to announce itself. A
count-based checklist cannot find those.

The fix was better than replacing the assertions: the **`item` store was removed from both
files' prisma mocks entirely**, so a reinstated `Item` write now throws
`Cannot read properties of undefined` rather than passing quietly.

Fate of the 14: **6 kept, 8 rewritten, 0 deleted.** Tests 4, 5, 9 and 10 assert *both* halves
in one body, so this task's "the `ItemStock` half survives, the `Item` half goes" framing did
not describe them — deleting them would have taken real stock coverage with it, including the
whole of issue #287's regression guard.

**A behaviour change this task's text did not mention.** The deleted `prisma.item.update` also
carried `updatedAt: now`, so **checkout and cooking no longer bump `Item.updatedAt`**.

The agent's conclusion — that nothing sees this — is right, but **its evidence was wrong** and
the corrected version is what task 7 should rely on:

| Claim | Truth |
|---|---|
| "`GetItem` and `GetItems` do not select `updatedAt`" | **They do**, at `items.graphql:22, 47, 67, 90`, and `itemStocks.graphql` selects it in six places |
| nothing *acts* on it | **Confirmed.** No web code reads `.updatedAt` off an item, no server resolver has an `orderBy` on it, and the one local sort (`db/operations.ts:105`) is Dexie, not cloud |

So it is selected and unused. Worth noting separately: `Item` carries
`@@index([userId, updatedAt])` (`schema.prisma:99`) and **nothing orders by it** — a possible
leftover, not PR 5's business.

**Two more stale comments for task 3**, which this plan's task-3 list does not name:
`cart.resolver.ts:38` and `inventoryLog.resolver.ts:42` both cite `mirrorItemStockToItem` and
`lib/stockDualWrite.ts` to explain the "`userId` is a scope" rule. True today, wrong the
moment task 3 deletes that module.

**`location-scoped-writes.spec.ts` needs no edit** — the only cloud spec exercising `checkout`
and `consumeRecipes` against real Postgres asserts through the `itemStocks` query, never
`Item`'s columns. So task 8 gives this behaviour change real-SQL coverage for free.

Both mutation checks red for the claimed reason. Mutation 1 (`finalQuantity` from the cart
delta) turned **exactly one** test red — `"quantity": 10` vs `"quantity": 5` — which also says
that test is the single guard on that number. Mutation 2 (delete the `writeStock` call) turned
**8** red, so stock still updating is observable in 8 places.

## Task 3 — delete the `Item`-direction mirrors

Three deletions, all writing `Item` from a stock row.

| Delete | Marker |
|---|---|
| `mirrorStockToDefaultLocation` call, `item.resolver.ts:191-197` | `:183` |
| `mirrorItemStockToItem` call, `itemStock.resolver.ts:137`, inside `if (location.isDefault)` at `:136` | `:121` |
| the inline `tx.item.updateMany` block, `itemStock.resolver.ts:345-358`, and the `defaultLocationIds` set at `:272-276` it depends on | `:334` |

Then delete `apps/server/src/lib/stockDualWrite.ts` entirely — all six exports are PR-5-only,
and its one internal caller of `defaultLocationId` goes with it.

Remove the now-unused imports: `cart.resolver.ts:6`, `recipe.resolver.ts:5`,
`item.resolver.ts:3`, `itemStock.resolver.ts:5`.

**The inline block's comment explains why it exists** (`itemStock.resolver.ts:340-344`): a
mirror issued through the module-level `prisma` inside a `$transaction` callback runs outside
the transaction, so a rollback would leave `Item` and `ItemStock` in different units. That
reasoning dies with the block. Do not carry the comment forward.

### One decision this task must make

**Does `writeStock` gain a transaction-client parameter?**

`applyUnitSwitch` has its own `tx.itemStock.upsert`, and it **has to**: its write belongs to a
`prisma.$transaction`, while `writeStock` uses the module-level `prisma`. A call from inside
that callback would run **outside** the transaction and survive a rollback — the same hazard
the inline `Item` block's comment describes. Task 1 deliberately did not add the parameter,
because nothing needed it then.

So either `writeStock` takes an optional `tx`, or `applyUnitSwitch` keeps its own write and
the two coexist. Decide, and say which and why.

### Do NOT delete

- **`apps/server/src/lib/defaultLocation.ts`.** Its comment at `:11` says it must outlive
  PR 5. Three callers remain: `location.resolver.ts:32`, `import.resolver.ts:92`,
  `import.resolver.ts:221`. Households H3 deletes it later — **do not write a comment claiming
  it is permanent.**
- the local variable named `defaultLocationId` in `import.resolver.ts` (10 occurrences). It is
  unrelated to the deleted export.
- `addItemToLocation` and `removeItemFromLocation` have no mirror **on purpose**
  (`itemStock.resolver.ts:142-150`). Do not read the missing marker as an oversight.

### Tests

`item.resolver.test.ts:540` (5 tests), `itemStock.resolver.test.ts:501-512` plus its
`itemColumns` helper (4 tests), `applyUnitSwitch.resolver.test.ts:330, 345` (2 tests). The
`itemStock.resolver.test.ts` block already marks itself for deletion in its header comment.

`applyUnitSwitch.resolver.test.ts:345` — *"a switch that names only a NON-default location
leaves Item's legacy columns alone"* — loses its subject entirely. Delete it and say so.

### Mutation check 3

Reinstate the `applyUnitSwitch` inline block. A test must go red. If none does, the deletion
is unobserved — say so plainly rather than inventing one. PR 4b hit the same question and
found a way; this one may genuinely be unobservable once the columns are gone.

---

**Done 2026-10-04.** Server **358 → 349** (10 tests deleted, 1 rewritten, 1 added).
`stockDualWrite.ts` **deleted**. `REMOVED IN PR 5` markers **0**. `stockDualWrite` references
**0**. Net −725/+214 lines across 12 files.

**`writeStock` took the transaction-client parameter:**
`writeStock(itemId, locationId, data, client: Prisma.TransactionClient = prisma)`.
`applyUnitSwitch` passes its `tx` and its own upsert folded away — a third copy of the same
upsert, with its own copy of the five zero defaults, gone. `PrismaClient` is assignable to
`Omit<PrismaClient, ITXClientDenyList>`, so the default needs no cast.

**The hazard that replaces the old one, written down at both ends:** omitting `tx` inside a
`$transaction` callback **compiles, type-checks, and is silently wrong**. Nothing but the
comments in `itemStockWrite.ts`'s header and at the `applyUnitSwitch` call site prevents it.

**Two more vacuous negative controls, exactly as task 2 predicted.** Both
`itemStock.resolver.test.ts` tests asserting `Item`'s columns "still read 99" stayed **green**
after the source was deleted, because nothing writes them. Fixed task 2's way — by removing
the capability, three times:

| File | Removed from the fake | A reinstated mirror now gives |
|---|---|---|
| `item.resolver.test.ts` | the whole `stockFake` | `Cannot read properties of undefined (reading 'findFirst')` |
| `itemStock.resolver.test.ts` | the `item` store, `FakeItem`, `state.items` | `… (reading 'updateMany')` |
| `applyUnitSwitch.resolver.test.ts` | `item.updateMany` only | `tx.item.updateMany is not a function` |

**It made an unobservable mutation observable instead of reporting it as unobservable.** Its
first attempt at reinstating `updateItem`'s mirror came back **all green**, because after the
five deletions **no surviving test sent inline stock fields to `updateItem`**, so the
reinstated mirror's empty-data guard short-circuited. Rather than take the "I could not
distinguish it" answer this task's brief offered, it added one test that makes the mutation
red. That test **dies in task 4** and its comment says so.

All three mutation checks red: 3 tests, 4 tests, and 1 test respectively.

### A hard dependency on task 4

**`updateItem` is now in an inconsistent intermediate state, on purpose.** It still writes
`Item`'s five columns from `UpdateItemInput`, and nothing mirrors them onto `ItemStock`. So a
client sending them inline changes a column nothing reads. **If task 4 slips, that is a
silently-lost write.** Task 4 is not optional and cannot be deferred to a later PR.

### What this task's text got wrong

| Said | Truth |
|---|---|
| "all **six** exports are PR-5-only" | **five**: `StockMirror`, `defaultLocationId`, `mirrorStock`, `mirrorItemStockToItem`, `mirrorStockToDefaultLocation` |
| heading: "Three deletions, **all writing `Item` from a stock row**" | only **two** do. `updateItem`'s `mirrorStockToDefaultLocation` runs the **opposite** way — it writes `ItemStock` from the input's five fields. The table at the top of this plan has it right; the heading did not |
| four unused imports to remove | **two**. Task 2 had already repointed `cart.resolver.ts` and `recipe.resolver.ts` at `writeStock` |

## Task 4 — the contract: GraphQL, the 8 operations, and the senders

**Everything in this task ships together or the API is broken.**

### Four Item-side GraphQL declarations, not two

| File:line | Declaration |
|---|---|
| `apps/server/src/schema/item.graphql:10-13, 15` | `type Item` |
| `item.graphql:43-46, 51` | `input CreateItemInput` |
| `item.graphql:62-65, 70` | `input UpdateItemInput` |
| `apps/server/src/schema/import.graphql:11-14, 16` | `input ItemInput` |

**Do NOT touch these**, which legitimately declare the same field names:

| File:line | Why |
|---|---|
| `itemStock.graphql:6-10`, `:79-83` | `type ItemStock`, `input ItemStockInput` |
| `import.graphql:146-150` | `ItemStockImportInput` |
| **`recipe.graphql:13-14`** | **`ConsumeRecipesItemInput`** — `packedQuantity` and `unpackedQuantity` here are the cook's post-cooking quantities, read by `consumeRecipes`. **A grep-driven edit will delete them.** |

Update, do not delete, the comment at `itemStock.graphql:69-72`, which says the five fields
"this input still carries until PR 5".

### Resolver write paths that still set the five on `Item`

| File:line | What |
|---|---|
| `item.resolver.ts:130-133, 146` | `createItem` writes all five |
| `item.resolver.ts:66-80` | `buildItemUpdateData` maps all five from `UpdateItemInput` |
| `item.resolver.ts:27` | `toGraphQL`'s hand-written `dueDate` mapping |
| `import.resolver.ts:429, 437, 443` | `bulkCreateItems`, via `...rest` |
| `import.resolver.ts:680, 683, 689` | `bulkUpsertItems`, via `...rest` |
| `import.resolver.ts:17-25, 46` | the local `Item` TS interface and its `toGraphQL` |

`toGraphQL` spreads the whole Prisma row, so the fields leave the payload automatically once
the columns go. Only the `dueDate` line is hand-written.

### The 8 web operations

Listed under *The accepted break*. Two carry comments promising their selection sets stay in
step with a sibling, so both halves of each pair move together:

- `itemStocks.graphql:3-4` — `PantryData`'s `items` set matches `GetItems`
- `itemStocks.graphql:96-97` — `ApplyUnitSwitch`'s matches `UpdateItem`

### Three senders still push the five through `ItemInput`

`ItemInput` declares them as `Float!` — **required**. So this is not optional cleanup: after
the drop, a sender emitting `undefined` fails validation.

| Sender | File:line |
|---|---|
| `toItemInput` | `apps/web/src/lib/importData.ts:671-674, 677-680` |
| → used by both import mutations | `importData.ts:1941`, `:1950` |
| → **and by the cloud export sanitiser**, so every exported item carries them | `apps/web/src/lib/exportData.ts:90` |
| the cloud E2E seed | `e2e/helpers/cloudSeed.ts:148-151` |

PR 4b's brainstorming decision 4 said *"4b stops sending them; PR 5 removes them from the
input."* **The first half never happened on the import path.** So PR 5 does both.

### Web cleanup the drop makes possible

| File:line | What becomes dead |
|---|---|
| `apps/web/src/lib/itemStock.ts:22-28, 53-61` | `STOCK_FIELD_KEYS` and `stripStockFields` |
| `apps/web/src/hooks/useItems.ts:236, 426, 524` | three `stripStockFields` call sites |
| `apps/web/src/routes/items/$id/stock.tsx:86` | the fourth |
| `apps/web/src/hooks/useItems.ts:193-199` | `toConfigInput`'s deletion of the five |
| `apps/web/src/lib/deserialization.ts:11-27` | `deserializeItem` can return `Item` instead of `PantryItem`; the `dueDate` conversion at `:23` goes |

**Check each before deleting.** Local mode uses `PantryItem` heavily and legitimately — 150
files in `apps/web/src` mention these field names and almost all are local-mode code that
stays.

### A comment that goes stale

`importData.ts:559-565` justifies a guard with *"a cloud export's items carry the legacy stock
columns as 0 rather than null"*. After PR 5 that is false. The guard itself
(`payload.itemStocks !== undefined`, `:574`) stays correct; its stated reason does not.

### Mutation check 4

Leave one of the 8 operations selecting `targetQuantity` while the schema drops it. `pnpm
codegen` or the root `pnpm build` must fail. If both pass, codegen is not validating documents
against the schema and that is worth knowing on its own.

---

**Done 2026-10-04.** Server **349 → 347**, web **2285 → 2283**. Net −327/+186 across 29
files. `pnpm build` clean, 0 `TS6385`.

### The finding: nothing in this repo catches an extra field sent to a GraphQL input

**Mutation check 2 failed on its first attempt.** With `toItemInput` still sending the five
after `ItemInput` dropped them, the root `pnpm build` **passed** and **all 2283 web tests
passed**. Two reasons:

- `tsc` does not excess-property-check a function **result** assigned to a typed parameter —
  only a fresh object literal;
- every test mocks the Apollo client instead of validating against the schema.

The first thing that would have seen it is the cloud E2E import spec, **after the whole
mutation had already failed**. So this task's brief offered two outcomes ("a test goes red, or
the build fails") and the real answer was a third: **nothing caught it.**

The fix is a return-type annotation, `ItemInputShape`, and it is now **the only guard**. The
measurement is recorded in a comment above it so nobody removes it as noise. `ItemInputShape`
rather than `ItemInput` because `exactOptionalPropertyTypes` is on and codegen types an
optional input field as `T | null`; the mapped type keeps the key set exact — the half that
catches an extra field — while allowing `undefined` as a value.

**Mutation check 1 passed as hoped, and settles a question worth knowing:** codegen *does*
validate documents against the schema. Leaving all eight documents stale gave **40 validation
errors** and generated nothing — `Cannot query field "targetQuantity" on type "Item". Did you
mean "targetUnit"?` So the root `pnpm build` cannot pass with a stale document, which is the
stale-bundle break caught at build time instead of in a browser.

### What this task's text got wrong

| Said | Truth |
|---|---|
| mutation check 2: "a test must go red, or the build must fail" | **neither did** — see above. The guard had to be *added* before the check could work |
| "four separate `cloudItem` fixture copies" | **eight** cloud-`Item`-shaped fixtures carried the five: the four named, plus three in `routes/items/$id/stock.test.tsx` and two in `stock.stories.tsx` / `stock.stories.test.tsx` |
| `stripStockFields`'s fourth call site "may become dead" | **it is not, and must not be deleted.** `withLocationStock` operates on an already-joined `PantryItem` — `useItem` joins in **both** modes — so it never had anything to do with the cloud `Item`'s columns. `STOCK_FIELD_KEYS` and `pickStockFields` also stay; local-mode `db/operations.ts` uses them |
| `toConfigInput`'s deletion loop "may become dead" | **still needed**, for a new reason: it maps a `PantryItem`, which still carries the five joined from `ItemStock`, and sending one to `updateItem` now fails validation outright |
| the server test list | undercounted. `applyUnitSwitch.resolver.test.ts` is filed under task 3 but its `MUTATION` selected `targetQuantity` on `Item` — **6** tests failed on it. And `item.resolver.test.ts`'s `dueDate is an ISO string when set` had to go, unnamed in the brief |
| did not mention | `applyUnitSwitch`'s **five dead `delete itemData.<field>` lines**, whose own comment names task 4 as the time to remove them |

### Confirmed facts for the remaining tasks

- **`createItem` writes nothing for the five**, safely: `schema.prisma` gives all four
  quantities `Float @default(0)` and `dueDate DateTime?`, so an omitted column lands on exactly
  the zero the resolver used to write by hand.
- **`ConsumeRecipesItemInput` was not touched** — verified: `git diff --stat` on
  `recipe.graphql` is empty and both fields are still there. The method was an exact multi-line
  match asserted to occur once per declaration, never a field-name grep-replace.
- **Nothing in `apps/web` still reads the five off a cloud `Item`.**
- **69 `not.toHaveBeenCalled` matches repo-wide, 10 in touched files, none vacuous.** The two
  4b import controls are armed — reinstating one `itemStock.upsert` turns one red. What they
  cannot see is *which* location, which the file already says.
- **Two tests pass vacuously if you only fix their type errors**
  (`useItems.cloud.test.tsx`, `useShowStock.cloud.test.tsx`). Both were kept because each has a
  real location-scoping fixture underneath, and the comments now say that is what carries the
  assertion rather than the inline values.

## Task 5 — the migration

Five bare drops. **No index or constraint touches any of the five on `Item`** — its only two
indexes are `[userId, updatedAt]` and `[userId, name]`.

```sql
ALTER TABLE "Item" DROP COLUMN IF EXISTS "targetQuantity";
ALTER TABLE "Item" DROP COLUMN IF EXISTS "refillThreshold";
ALTER TABLE "Item" DROP COLUMN IF EXISTS "packedQuantity";
ALTER TABLE "Item" DROP COLUMN IF EXISTS "unpackedQuantity";
ALTER TABLE "Item" DROP COLUMN IF EXISTS "dueDate";
```

`IF EXISTS` per `apps/server/prisma/CLAUDE.md`'s *Defensive SQL* rule.

**Ground rule 2 applies hardest here.** The first `migrate dev` applies two unrelated
migrations first, one of which re-keys `Cart`'s primary key. Expect that, and check
`migrate status` before and after.

**Add the new migration to `verify-migration.ts`'s `MIGRATIONS` list**
(`apps/server/scripts/verify-migration.ts:216-220`, currently three names) **and write
assertions for it.** `apps/server/prisma/CLAUDE.md` requires this, and without it the script
re-proves PR 1 and says nothing about PR 5.

**Nothing in the automated gate executes a migration.** Every server test runs against
hand-written fakes. `pnpm --filter server verify:migration` is the only real-SQL check and no
gate command reaches it.

**Never point `verify:migration` at a copy of production** — it opens with `migrate reset`.

---

**Done 2026-10-04** — `ce2a4eda` (schema + migration) and `8609101e` (verification). Server
**347**, web **2283**, both unmoved, which is what task 4 having removed every write path
predicts. **Nothing was applied to any database** — see *What the user still has to do*.

File created: `apps/server/prisma/migrations/20261004000000_drop_item_stock_state_columns/migration.sql`.

**`prisma migrate diff` showed exactly five `ADD COLUMN`s on `Item`** and nothing else on that
table, which is the check that the five drops are both right and complete. It also showed six
statements of the pre-existing drift ground rule 2 warns about — `Cart.locationId` and
`InventoryLog.locationId` missing because those two migrations are unapplied. Expecting only
five would have looked like a mismatch.

### The finding: nothing in the gate regenerates the Prisma client

**This task's text claimed `pnpm codegen` regenerates the Prisma client. It does not, and
neither does the root `pnpm build`.** Root `codegen` is `graphql-codegen` alone;
`prisma generate` is wired only to `postinstall` and `predev`. So `tsc` compares your code
against whatever client was generated last.

Measured with a throwaway file reading a dropped column:

| Prisma client | `pnpm --filter server typecheck` |
|---|---|
| regenerated from the edited schema | **fails** — `TS2551: … Did you mean 'targetUnit'?` |
| stale, pre-PR-5 | **zero errors** |

Also found: `apps/server`'s build does not type-check `scripts/`, and the gate does not list
`pnpm typecheck`, so **no gate command type-checks `verify-migration.ts`**. Both are now
recorded in root `CLAUDE.md`'s Verification Gate section, because they apply to every future
schema change and not just this PR.

### An existing assertion had to die, which this task's text did not say

`verify-migration.ts` carried
`assert(items[0]?.targetQuantity === 3, 'Item.targetQuantity survives (dropped in PR 5, not here)')`.
Once PR 5 joins the `MIGRATIONS` list that `SELECT` throws Postgres `42703`. **Following this
task's text literally — "add yours, and write assertions for it" — would have left the script
broken.** It is replaced by a comment pointing at the `milk` assertion above it, which reads
the same five values off `ItemStock` and is now the proof the data survived in its new home.

### Why the `ItemStock`-still-present assertion is not padding

`Item` and `ItemStock` declare the **same five field names**. Checking `Item` alone passes just
as happily against `ALTER TABLE "ItemStock" DROP COLUMN "targetQuantity"` — the wrong table —
as against the real migration. The second assertion is the only one that can tell those apart.
A third checks `consumeAmount` survives on `Item`, catching a drop that took one column too
many.

Two implementation details recorded in comments: the columns are read from `information_schema`
rather than with a `SELECT`, because `SELECT "dueDate" FROM "Item"` throws `42703` before
`assert` is reached and a raw driver error is not the named `FAIL` the script exists to print;
and both identifier columns need a `::text` cast, because `information_schema` uses the
`sql_identifier` domain that Prisma's raw mapper does not know.

**A dependency this plan did not state:** migration 4 depends on migration 1 *in the other
direction*. PR 5 destroys the columns PR 1's backfill reads, so parking 4 without parking 1
would reset to a database where PR 1 could not run.

## Task 6 — the runbook, and the production reconciliation

PR 5 is irreversible: `migrate deploy` has no down step, and a dropped column's data is gone.
The precedent is
[the cart re-key runbook](../../global/backend/2026-09-18-deploy-runbook-cart-rekey.md), whose
own closing advice is that a future runbook should be *a verification document, not a
deploy-order one*.

### The pre-deploy query — read-only, against a BRANCH of production

Decided 2026-10-04. **This needs the user's credentials and consent. Do not touch production
without them.**

```sql
SELECT count(*)
FROM "Item" i
JOIN "Location" l ON l."userId" = i."userId" AND l."isDefault"
LEFT JOIN "ItemStock" s ON s."itemId" = i."id" AND s."locationId" = l."id"
WHERE s."id" IS NULL
   OR s."targetQuantity"   <> i."targetQuantity"
   OR s."refillThreshold"  <> i."refillThreshold"
   OR s."packedQuantity"   <> i."packedQuantity"
   OR s."unpackedQuantity" <> i."unpackedQuantity"
   OR s."dueDate" IS DISTINCT FROM i."dueDate";
```

**Expect 0. A non-zero answer is data this PR would destroy** — stop and reconcile first.

### The evidence that already exists

| Date | Finding |
|---|---|
| 2026-08-30, rehearsal 1 | 167 items → 167 `ItemStock` rows, all five values copied verbatim |
| 2026-09-16, rehearsal 2 | 173 items → **173** stock rows, **0** items with no stock row, 1 location and it is the default |

The backfill is `migrations/20260830000000_add_location_and_item_stock/migration.sql:77-93`,
which duplicates rather than moves.

**Why divergence is near-impossible on production:** there is one user and one location, which
is the default, so every dual-write target reduces to the same row — `checkout`'s cart
location, `consumeRecipes`' cook location, `updateItem`'s default, and both default-only
mirrors.

**The gap that justifies re-measuring anyway:** the newest count predates PRs 3b, 3c, 4a and
4b. And `createItem` (`item.resolver.ts:126-150`) and both bulk item imports write `Item`'s
columns with **no** `ItemStock` row. Such an item is already invisible in the cloud pantry, so
PR 5 loses nothing a user can see — but its values are real and unmeasured.

### The runbook must say the stale-bundle break out loud

PR 1 through 4b were all designed so an old bundle kept working. **PR 5 ends that on
purpose**, and `railway.toml`'s release-command ordering protects the server, not the client.
Include the table from *The accepted break*, including the Cloudflare Pages preview case that
a reload does not fix.

---

## Task 7 — fixtures, tests and docs

### Four separate `cloudItem` helpers

This is the thing most likely to make PR 5 feel bigger than planned. There is no shared
fixture.

| File:line | |
|---|---|
| `apps/web/src/test/cloudFixtures.ts:68-95` | the shared one, with an `inline` escape hatch |
| `apps/web/src/hooks/useItems.cloud.test.tsx:80-101` | its own private copy |
| `apps/web/src/routes/shopping/index.cloud.test.tsx:84-104` | a third — and `:141` reads `i.targetQuantity` off the Item to seed a stock row |
| `apps/web/src/components/item/NewItemDialog/NewItemDialog.stories.tsx:163-184` | a fourth, in a story |

### Tests whose subject disappears

These set *inline* values on a cloud `Item` specifically to prove `stripStockFields` removes
them. With no such fields, they have nothing to prove.

| File:line |
|---|
| `apps/web/src/hooks/useItems.cloud.test.tsx:137-143`, and the assertion comment at `:352` |
| `apps/web/src/hooks/useShowStock.cloud.test.tsx:39-42` |
| `apps/web/src/routes/items/$id/index.cloud.test.tsx:78` |

### Tests that break on a fixture, not an assertion — edit, do not delete

| File:line | |
|---|---|
| `import.resolver.test.ts:383`, `:486` | the two 4b tests asserting **no** stock is written. They must **survive**; they break on `makeItemInput` at `:400-403` and `:504-507` |
| `import.resolver.test.ts:217-220, 233-243` | `makePrismaItem` |
| `shelf.resolver.test.ts:59-63` | `projectItem` builds a fake `Item` with all five |
| `apps/web/src/lib/exportData.test.ts:226-276` | asserts only `id`/`name`/`createdAt`, so it survives an edit |
| `apps/web/src/lib/importData.test.ts:1535-1573, 1575-1598` | the `toItemInput` tests |

**Leave `apps/web/src/apollo/ApolloWrapper.test.tsx:414-426` alone** — its `cardItem` is a
`PantryItem`, not a GraphQL `Item`.

**No shared server fake models `Item`'s five columns.** `stockFake.ts` models them only on
`FakeStock` and survives untouched — but three of its comments name the bridge
(`:12`, `:68`, `:334`) and go stale.

### Docs to correct

| File:line | Why |
|---|---|
| `apps/web/src/db/CLAUDE.md:96` | says the cloud `Item` "still declares the five state columns until PR 5" |
| `apps/web/src/routes/items/CLAUDE.md:70` | the `withLocationStock` strip rationale |
| `e2e/CLAUDE.md:293, 391, 516` | three `mirrorStockToDefaultLocation` references |
| `e2e/helpers/cloudSeed.ts:134-146, 183-194` | the `ItemInput` comment, and a step-4 comment already stale since 4b |
| `apps/server/prisma/CLAUDE.md` | the `MIGRATIONS` list |
| `docs/INDEX.md:20, 52, 54` | PR 4 / PR 5 status |
| `cloud-locations-status.md:1071-1083` | says "all **six** dual-write sites" and lists the import one 4b deleted. Line 1085 already contradicts it |
| `2026-08-30-cloud-locations-design.md:541, 570-573` | "five dual-write sites", "6 markers across 5 files" |
| `2026-10-02-cloud-locations-plan-pr4a.md:751` | markers 7 → 7; truth is 5 |

---

## Task 8 — the gate

The full Verification Gate from root `CLAUDE.md`, each command with an explicit path, then
`pnpm test:e2e:all` — **never the bare `pnpm test:e2e`**, no `--grep`.

**The baseline will move.** Measured on `main` at `9b809f1b`: local 171 passed / 5 skipped,
cloud 96 / 7, pwa 69, in 15m33s. Report the new numbers and say which project changed.

Known flake risk: `cloud → cloud` in `import-export-cloud.spec.ts` runs ~36.5s and carries
`test.setTimeout(60000)` for that reason. A failure there at high load is starvation; check
`uptime` and re-run the spec alone.

Re-count and report: `stockDualWrite` call sites (**expect 0** — already true after task 3),
`REMOVED IN PR 5` markers (**expect 0** — already true), and `Location.isDefault`. **For the
last one, report reads, writes and comments separately** and do not subtract from any figure
in this plan. The "expect 3" this task used to say was wrong whichever way it is counted; task
3 measured 6 occurrences in non-test resolver and lib files, of which 3 were reads, and the two
it removed leave comments behind at `itemStock.resolver.ts:121` and `:257`.

---

**Done 2026-10-05 — THE GATE IS RED. The branch must not be pushed.**

Every command in the Verification Gate passed. `pnpm test:e2e:all` did not: the `cloud`
project went from a **96 passed / 7 skipped** baseline to **33 failed / 63 passed / 7
skipped**. `local` and `pwa` are both unchanged and green.

| Project | Result | Time | Counts | Baseline |
|---|---|---|---|---|
| `local` | **PASS** | 3m19s | 171 passed, 5 skipped | 171 / 5 — unchanged |
| `cloud` | **FAIL** | 11m57s | **33 failed**, 63 passed, 7 skipped | 96 / 7 |
| `pwa` | **PASS** | 1m26s | 69 passed | 69 — unchanged |

Total Playwright time **16m42s**. Collected counts match the baseline exactly — local 176,
cloud 103, pwa 69 — so nothing was lost from the suite; 33 tests that passed now fail.

**These are not phantom failures.** Load average was **2.6 to 4.3** for the whole run, the
errors are GraphQL validation errors with named fields rather than starvation symptoms, and
the 23 timeout failures all stop at the same line in the same page-object method. The one
genuine flake is listed as cause 4 below.

### Cause 1 — `toCreateItemInput` sends `dueDate` on every cloud create. 23 tests.

**This is a user-visible, blocking bug, not a test problem: in cloud mode the app cannot
create an item at all.**

`apps/web/src/hooks/useItems.ts:74-80`:

```ts
function toCreateItemInput(input: ItemMutationInput): CreateItemInput {
  const { dueDate, ...rest } = input
  return {
    ...rest,
    dueDate: dueDate instanceof Date ? dueDate.toISOString() : null,
  } as CreateItemInput
}
```

The returned object **always** carries a `dueDate` key — `null` when the form supplied no
date. `CreateItemInput` no longer declares `dueDate`, and GraphQL rejects an undeclared
field whatever its value, so `createItem` fails for every input. `...rest` additionally
spreads the four quantity fields, because `ItemMutationInput` is
`… & Partial<StockFields>`.

All 23 failures are the same symptom: `TimeoutError: page.waitForURL: Timeout 10000ms
exceeded` inside `ItemPage.save()`, because the app never navigates to `/items/:id`. The
GraphQL error is raised in the browser, so it appears in no server log — which is why the
failure text names a timeout and not the real cause.

**This is exactly the hole task 4 measured and then fixed in only one of the three places
it exists.** Task 4's own Done note records it: *"`tsc` does not excess-property-check a
function **result** assigned to a typed parameter — only a fresh object literal"*. It added
the `ItemInputShape` return-type annotation to `toItemInput` in `importData.ts` and left
the two `as` casts in `useItems.ts` alone. There are exactly two such casts in
`apps/web/src`:

| Cast | Verdict |
|---|---|
| `useItems.ts:79` — `as CreateItemInput` | **the live bug** |
| `useItems.ts:201` — `as UpdateItemInput`, inside `toConfigInput` | safe **by behaviour, not by type** — the line above it is `for (const key of STOCK_FIELD_KEYS) delete input[key]`. The cast would hide a regression here too |

**Measured, not deduced.** Replacing the cast with a mapped return type
`CreateItemInputShape` and running `(cd apps/web && npx tsc -b)` gives:

```
src/hooks/useItems.ts(81,5): error TS2353: Object literal may only specify known
  properties, and 'dueDate' does not exist in type 'CreateItemInputShape'.
```

The experiment was reverted; the branch contains no fix.

### Cause 2 — five E2E seeds still send the five through `UpdateItemInput` / `CreateItemInput`. 5 tests.

| File:line | Input type | Sends |
|---|---|---|
| `e2e/tests/cooking.spec.ts:40` | `UpdateItemInput` | `packedQuantity: 10` |
| `e2e/tests/cooking.spec.ts:49` | `UpdateItemInput` | `packedQuantity: 12` |
| `e2e/tests/item-logs.spec.ts:26` | `UpdateItemInput` | `packedQuantity: 5` |
| `e2e/tests/shopping.spec.ts:70-72` | `CreateItemInput` | `packedQuantity`, `targetQuantity`, `refillThreshold` |
| `e2e/tests/shopping.spec.ts:476` | `CreateItemInput` | `targetQuantity`, `refillThreshold` |

Exact server reply: `Field "packedQuantity" is not defined by type "UpdateItemInput". Did
you mean "packageUnit"?`

**`cooking.spec.ts` and `item-logs.spec.ts` need more than a field rename.** Neither calls
`upsertItemStock` at all — both relied on the deleted `mirrorStockToDefaultLocation` to
turn that `Item` write into a stock row. They need the write moved onto
`upsertItemStock`, which is the rule `e2e/CLAUDE.md` already states under *A seed that
writes an item must also write its stock*. `shopping.spec.ts` already follows its create
with an `upsertItemStock`, so there the five only need removing from the create input.

### Cause 3 — `import-export-cloud.spec.ts` seeds `bulkCreateItems` from the fixture verbatim. 4 tests.

`e2e/tests/settings/import-export-cloud.spec.ts:136-139` passes `{ items:
cloudFixture.items }` straight into `[ItemInput!]!`, and `e2e/fixtures/cloud-backup.json`'s
items carry all four quantities. Server reply: `Field "targetQuantity" is not defined by
type "ItemInput". Did you mean "targetUnit"?`

**The fixture JSON itself is fine and should not be edited.** It is a backup *payload*, and
the app's own import path strips the five correctly — that is what task 4's `ItemInputShape`
guard protects. Only the spec's direct `bulkCreateItems` seed needs to strip them.

### Cause 4 — one genuine environment flake. 1 test.

`cleanup-endpoint.spec.ts:129` failed with `Can't reach database server at
ep-round-surf-…:5432` raised from `prisma.item.findMany()` in `item.resolver.ts:92`. A Neon
connection blip, nothing to do with PR 5. Re-run it alone to confirm.

### What the gate DID prove

- **`location-scoped-writes.spec.ts` passed all 4 tests**, so task 2's move of `checkout`
  and `consumeRecipes` onto `writeStock` is correct against real Postgres, and
  `finalQuantity` re-sourced from the saved row is right. This was the single most important
  thing in PR 5 to confirm and it is confirmed.
- **`settings/locations.spec.ts` passed all 6** and `item-stock-input` / `item-stock-pager`
  passed, so the migrated E2E database and the server code agree. **No failure anywhere was
  a missing column or an unknown Prisma field** — the migration itself is sound.
- `local` 171 and `pwa` 69 unchanged, so nothing in local mode regressed.

### The Verification Gate, every command

| Command | Result |
|---|---|
| `pnpm codegen` | pass |
| `(cd apps/server && pnpm prisma generate)` | pass — client v6.19.3, regenerated from the edited schema |
| `(cd apps/web && pnpm lint)` | exit 0. 4 warnings, all pre-existing in `routes/shopping/index.tsx`, a file this branch never touched |
| root `pnpm build` | exit 0, **0** `error TS` |
| `(cd apps/web && pnpm build-storybook)` | exit 0. `storybook-static/index.json` lists 8 `pages-item-stock` story ids and no stray fixture export |
| `(cd apps/web && pnpm check)` | exit 0 |
| `grep 'TS6385' /tmp/p1i-build-pr5.log` | **0 matches** |
| `pnpm test` | exit 0 — server **347 / 25 files**, web **2283 / 248 files**, `scripts/spec` **57** |
| `(cd apps/server && pnpm typecheck)` | exit 0 — the only command that type-checks `scripts/verify-migration.ts` |

**Both extra commands earned their place.** `prisma generate` is not in the documented gate
and PR 5 edits `schema.prisma`; `pnpm typecheck` is not in it either and task 5 edited
`verify-migration.ts`.

### The three re-counts, measured on the finished branch

| Grep | Count |
|---|---|
| `REMOVED IN PR 5` in `apps/server/src` | **0** |
| `await (mirrorStock\|mirrorStockToDefaultLocation\|mirrorItemStockToItem)(` in `apps/server/src/resolvers` | **0** |
| `stockDualWrite` imported anywhere in `apps/server/src`, `apps/web/src`, `e2e` | **0**. 29 text matches remain and every one is a past-tense comment or doc |

**`Location.isDefault` — 15 lines in non-test resolver and lib files. Split by kind, and
this plan is right that a single total means nothing:**

| Kind | Count | Where |
|---|---|---|
| comments | **6** | `import.resolver.ts:909, :1064`; `itemStock.resolver.ts:121, :257`; `defaultLocation.ts:17, :44` |
| writes | **4** | `import.resolver.ts:945, :1082`; `location.resolver.ts:47`; `defaultLocation.ts:58` |
| reads | **4** | `location.resolver.ts:64`; `defaultLocation.ts:51, :63`; `authz.ts:32` (`select`) |
| type declaration | **1** | `authz.ts:26`, `requireLocationRole`'s return type |

`requireLocationRole` still selects and returns `isDefault`, and **exactly one of its 15
call sites reads it** — `deleteLocation` (`location.resolver.ts:63-64`). Every other call
site discards the result. That is correct, not dead code, and households H3 removes the
column.

### Two more things that still look wrong, neither blocking

1. **The branch is 4 commits behind `origin/main`.** It is 22 ahead of its base `9b809f1b`,
   but `origin/main` is now `92310481` (PR #329, the spec publish token). Those 4 commits
   touch only root `CLAUDE.md`, two testing docs and `scripts/spec/`. The `CLAUDE.md` edit
   is in the *Living Spec Site* section and PR 5's is in *Verification Gate*, so a rebase
   should apply cleanly. Note that `pnpm test`'s `test:spec` leg ran the **pre-#329**
   `publish.test.mjs` here, which is why it reports 57 tests.
2. **Two comments went stale and task 7 missed them.**
   `e2e/tests/cleanup-endpoint.spec.ts:182-183` says *"only `updateItem` mirrors stock to
   the default location"* — that mirror is deleted. And `e2e/helpers/cloudSeed.ts:45` cites
   `apps/server/src/lib/stockDualWrite.ts` by path without saying the file is gone, unlike
   `e2e/CLAUDE.md:295` which does say so. The migration SQL's closing comment also still
   reads *"Task 6 of the plan above writes the runbook … it lands in docs/global/backend/"*
   in the future tense; the runbook exists at
   `docs/global/backend/2026-10-05-deploy-runbook-item-column-drop.md`.

### What this task's own brief got wrong

Its risk list named the wrong failure. It said a cloud failure would be *"a missing column
or an unknown field … the server code and the database must now agree"*. The database and
the server agree perfectly — the migration is fine. What disagree are **the web client and
the GraphQL schema**, and **the E2E seeds and the GraphQL schema**. The brief also expected
the `cloud → cloud` timeout in `import-export-cloud.spec.ts` to be the one thing to watch;
that test failed, but on a GraphQL validation error, not on its timeout.

It also said PR 5 *"should not change any count"*. The collected counts did not change. 33
results did.

**Why no earlier gate could have caught any of this:** nothing type-checks `e2e/` — this
plan's own *Known gaps* table lists it as **issue #322** — and the one web-side defect is
hidden by an `as` cast, which `tsc` does not excess-property-check. Every web unit test
mocks Apollo, so none of them validates a variable against the schema. The cloud E2E run is
the first and only thing in the repo that could see any of it.

---

## Known gaps this PR will leave

| Gap | Owner |
|---|---|
| **Issue #330** — `replace` silently skips the rows it was asked to overwrite. Households excludes it explicitly | #330 |
| **Issue #327** — nine `bulkUpsert*` let one user take ownership of another's row | households H4 |
| **Issue #320** — no real-SQL two-user purge test | households H4/H6 |
| The `clear` and `replace` import strategies have no E2E coverage | — |
| **Issue #322** — nothing type-checks `e2e/` | #322 |
| `defaultLocation.ts` survives PR 5 and dies in households H3 | H3 |
| PR 3b's migrated-data check — nothing has run the new server code against rows the re-key converted | still owed from 3b |
