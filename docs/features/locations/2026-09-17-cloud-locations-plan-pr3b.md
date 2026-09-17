# Plan — PR 3b: the cart re-key

**Date:** 2026-09-17
**Branch:** `feature/cloud-locations-pr3b`
**Worktree:** `.worktrees/feature-cloud-locations-pr3b`
**Design:** `2026-08-30-cloud-locations-design.md` §4.6, §4.7, §5, §8 Amendment
**Brainstorming:** `2026-09-17-brainstorming-pr3b.md`
**Status:** `cloud-locations-status.md`

Six tasks. Each ends with the full verification gate from root `CLAUDE.md`.

## What makes this PR different

It re-keys a **primary key**. Everything else follows from that.

**The migration and the cart resolvers cannot land in separate commits that each
pass their own gate.** `cart.resolver.ts` looks a cart up by the bare
`vendorId ?? 'no-vendor'`. After the re-key that lookup finds nothing, falls into
its `create` branch, and silently makes a duplicate cart under the old shape. The
TypeScript build stays green — `Cart.id` is a `String` either way — so nothing
catches it except tests. Task 1 therefore carries both.

**The deploy window is accepted, not engineered away** (decided 2026-09-17).
Production has one user and 13 `CartItem` rows. Task 6 writes the runbook.

## Standing rules

- **Never print a database connection string or a database hostname** into a
  report, a commit, a doc, or quoted output.
- `apps/server/.env` is gitignored and stays that way.
- **Never write `row.userId === ctx.userId` as an authorization check.** Route
  through `requireLocationRole` (`apps/server/src/lib/authz.ts`).
- `ItemStock` must never gain a `userId` column.
- **Never point `pnpm verify:migration` at a production copy.** It opens with
  `migrate reset`. It is written for `TEST_DATABASE_URL`.
- Read `apps/server/prisma/CLAUDE.md` before touching a migration.
- Before any Playwright run, check ports 5175, 5174 and 4001 are free and stay
  free for about 90 seconds. Never kill another session's server.
- **Do not narrow the E2E run with `--grep`.** It silently skips whole spec
  files. Pass positional spec paths, or run everything.
- **8 E2E tests are already red on `main`** — `item-list-state-restore.spec.ts`,
  4 local and 4 cloud, issue #280. That is the baseline. Any ninth failure is
  yours.

---

## Task 1 — The migration and the cart resolvers, together

### Step 1.1 — Make the id helpers usable from the server

`cartIdFor` and `parseCartId` already exist in `packages/types/src/index.ts:158-174`
and handle a vendor id containing `':'` by splitting on the first colon only.

Check whether `apps/server` can import from `@p1i/types` today. If it can, use
them. If it cannot, say so and decide — a second copy of this logic on the server
is a real risk, because the two would drift and the splitting rule is subtle.

### Step 1.2 — The migration

Two phases, in this order. **The order is the whole correctness argument.**

**Phase A — split the shared `'no-vendor'` cart (design §5).** For each distinct
`userId` among `CartItem`s pointing at `'no-vendor'`, create
`${theirDefaultLocationId}:no-vendor` and repoint their rows.

This must run **before** phase B. If the re-key runs first, every user's cart
items on the shared row are dragged into whichever user happens to own it.

**Phase B — the re-key.** `CartItem` first, so it can still join on the old id:

```sql
ALTER TABLE "CartItem" DROP CONSTRAINT "CartItem_cartId_fkey";
UPDATE "CartItem" ci SET "cartId" = c."locationId" || ':' || c."id"
  FROM "Cart" c WHERE ci."cartId" = c."id";
UPDATE "Cart" SET "id" = "locationId" || ':' || "id";
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_cartId_fkey"
  FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE CASCADE;
```

**Add a guard**, as PR 3a's migration did. After phase B, no `Cart.id` may lack a
`':'`, and no `CartItem.cartId` may point at a missing `Cart`. Raise with a
readable message naming what was left behind. PR 3a proved the guard earns its
place: with it, `P0001` naming the affected users; without it, a bare `23502`.

**Add the migration to the `MIGRATIONS` list in
`apps/server/scripts/verify-migration.ts`**, and add assertions for it. The script
parks migrations by name; a missing name means `migrate reset` replays this
migration against a database that lacks what it needs. PR 3a hit this.

### Step 1.3 — The cart resolvers

`apps/server/src/resolvers/cart.resolver.ts`. Every cart id becomes
`cartIdFor(locationId, vendorId)`. `vendorCart` gains a `locationId`; so does
anything else that names a cart.

**Authorization.** A caller-supplied `locationId` goes through
`requireLocationRole`. Reads want `viewer`, writes want `member`.

Two of the four `PR 3b:` markers are here — `cart.resolver.ts:16` and the
`checkout` one. Remove a marker only when you have done what it names.

### Multi-user fixture — the only thing that tests the split

**A production rehearsal cannot exercise phase A.** Measured 2026-09-16:
production has **0 accounts** with a `CartItem` on the shared row. The split loop
will do nothing there.

So the synthetic fixture must have **at least two users with cart items on
`'no-vendor'`**, each with their own default location, plus a third user with
none. After the migration:

| Assertion |
|---|
| Each user's items point at **their own** `${locationId}:no-vendor` |
| No user's items moved to another user's cart |
| The original shared `'no-vendor'` row no longer exists under that id |
| Cart and cart-item **counts** are unchanged |

### Mutation checks (required)

| # | Mutation | What must go RED |
|---|---|---|
| 1 | Run phase B before phase A | the multi-user split assertions |
| 2 | Update `Cart` before `CartItem` in phase B | the FK / orphan assertion |
| 3 | Delete the guard | prove the message gets worse, as PR 3a did — report both texts |
| 4 | `vendorCart` looks up the bare id again | a resolver test |

---

## Task 1 result — `verify:migration` passed, 2026-09-18

Run against `TEST_DATABASE_URL`, the dedicated test Neon branch. All three
migrations applied, **41 assertions green**.

**It needed the user's explicit consent.** Prisma's AI guardrail blocks an agent
from running `migrate reset` without `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`.
The user granted it for this one run, for `TEST_DATABASE_URL` only. **That consent
does not carry to any other command or any other target.** Ask again next time.

**The script's own guard is good but has one gap.** It compares by parsed host +
pathname, not raw string, and checks both `TEST_*` vars against both dev vars. It
does **not** check against `PROD_COPY_DATABASE_URL`. That was verified by hand
before the run — all three hosts are distinct. Worth closing in a later PR.

The assertions that carry weight for this PR:

| Assertion | What it catches |
|---|---|
| cart count is 4 seeded + 1 from the split = 5 | an unchanged count means phase A did nothing |
| user-l gets a NEW `${their own locationId}:no-vendor` | the split ran at all |
| user-l's items are NOT in user-k's cart | phase B running before phase A |
| every `Cart.id` is exactly `${own locationId}:${original id}` | a missed row **and** a doubled prefix — a `startsWith` test sees neither |
| user-l's new cart opens `NULL` `lastPurchasedAt` | the §5 leak itself: the timestamp belonged to user-k |
| BOTH of user-l's items move | a split that moved only the first row |

**Two assertions are labelled in the script as structural invariants that cannot
go red on their own**, and say so in their own text. They are sanity checks, not
evidence. Do not count them.

## Task 2 — Vendor carts, at the right time

Local mode decides this and cloud copies it. `createVendor`
(`apps/web/src/db/operations.ts:968`) pre-creates the cart for the **active
location only**. Other locations come from `bootstrapCarts` (`operations.ts:864`)
when the active location changes. The comment there says explicitly that this is
**not** done lazily from a read path.

`vendor.resolver.ts:19` is the third `PR 3b:` marker.

Cloud needs the same two halves: a cart at vendor-creation time for the caller's
active location, and something equivalent to `bootstrapCarts`. Decide where the
second half lives and say why.

### Mutation check

Delete the bootstrap half. A test that creates a vendor, switches location, and
expects that vendor's cart to exist there must go RED.

---

## Task 3 — Real `locationId` for the three write paths

| Site | Today |
|---|---|
| `checkout` (`cart.resolver.ts`) | the caller's default location |
| `consumeRecipes` (`recipe.resolver.ts`) | the caller's default location |
| `mirrorItemStockToItem` (`lib/stockDualWrite.ts`) | the caller's default location |

`checkout` can read the location from the cart it is checking out, once Task 1
lands. `consumeRecipes` cannot — `ConsumeRecipesInput` carries no location, so it
needs one, which means a schema change and a client change together.

This closes the limitation PR 3a shipped: a checkout made while viewing the
Garage is currently logged against the Kitchen.

`grep -rn "PR 3b:" apps/server/src` must return **0** when this task is done.

### Mutation check

Make `checkout` write the default location again. A test that checks out at a
non-default location and reads the log back there must go RED.

---

## Corrections found while running this plan

### Task 3's instruction to change `mirrorItemStockToItem` was wrong

The plan listed it as a site that should move from "the caller's default location"
to "the location actually being written". **Following that would introduce a bug.**
It was not done, and the reasoning was checked three ways:

1. It writes the **reverse** direction — one location's `ItemStock` back onto
   `Item`'s five legacy columns. Those columns exist for a browser on a stale
   bundle, which renders **one number per item** and has no location concept. The
   default location's stock is the only value correct to show it. A Garage edit
   mirrored there would report the Garage's numbers as the Kitchen's.
2. Its only call site (`itemStock.resolver.ts:109`) is already guarded by
   `if (location.isDefault)`. The function never took the default as a *fallback* —
   the call site chooses, correctly.
3. `stockDualWrite.ts` carried **no `PR 3b:` marker**. The four markers were in
   `vendor.resolver.ts` (1), `cart.resolver.ts` (2) and `recipe.resolver.ts` (1).
   The plan's own gate — "grep returns 0" — never pointed at this function.

What that file did need was comment repair. Its "NOT LOCATION-AWARE, AND
DELIBERATELY SO" section became false the moment `checkout` and `consumeRecipes`
started passing real locations.

### Every pre-existing test stayed green through Task 3, and that is the finding

All 218 of them. Not a pass — a measurement. Every older checkout test uses a cart
at the default location, and every older cooking test omits `locationId`. For
those fixtures "the cart's location" and "the caller's default location" are the
**same string**, so they cannot tell the two implementations apart.

Only the new test groups can. That is written into both groups' comment headers so
nobody later counts the old ones as coverage of this behaviour.

This is the same shape as PR 3a's call-recorder finding and PR 2's one-location
fixtures. It keeps recurring because a single-location fixture is the natural
thing to write.

### Three negative controls are named as such

`running bootstrapCarts twice creates nothing the second time` stays green under
the "create nothing" mutation — removing a create cannot add a duplicate.
`a cart at the Kitchen still writes the Kitchen` and `an explicit Kitchen still
writes the Kitchen` stay green under their mutations, because they assert the
default location, which is what the mutation forces. All three are controls, not
evidence, and say so.

### Owed before the deploy

No server unit test runs against real SQL, and **no cloud E2E spec names
`checkout`, `consumeRecipes` or `bootstrapCarts`** — the cloud `testMatch` covers
12 files, none of them shopping or cooking. `bootstrapCarts` uses
`createMany({ skipDuplicates: true })`, which the fake models but real Postgres
has never executed in this repo. **One manual smoke test is owed** for those three
paths before the production deploy. Task 6's runbook must say so.

## Task 4 — Web client, and the two bypasses

**Step 4.1.** `apps/web/src/hooks/useShoppingCart.ts` — 537 lines, 16 `isCloud`
branches. Cloud cart ids become composite.

**Step 4.2. Writes resolve the location at call time.** Use
`useCloudLocationId()`. On a fresh cloud session the active id is the `'local'`
sentinel until `GetLocations` resolves; a read self-corrects, a write gets
`FORBIDDEN` and is lost. This cost PR 2 thirteen E2E specs.

**Step 4.3. Reads need the gate.** `useCloudLocationKnown()`
(`apps/web/src/hooks/useCloudLocationKnown.ts`) — PR 3a needed this the moment it
made `locationId` required, or a read in the fresh-session window gets
`FORBIDDEN` and Apollo parks it as a live observer.

**Step 4.4. Cache keys.** Any cloud query scoped by location needs `locationId`
in its `keyArgs`, or switching location serves another location's cart from
cache. PR 3a added three entries in `apps/web/src/apollo/client.ts`.

**Step 4.5. Remove the two `!isCloud` partition bypasses:**

| Site | Code |
|---|---|
| `apps/web/src/routes/shopping/index.tsx:166` | `!isCloud && (vendorCartCounts.get(vendorId)?.count ?? 0) === 0` |
| `apps/web/src/routes/cooking.tsx:180` | `!isCloud && getAvailableRecipeItems(recipe).length === 0` |

**Step 4.6.** Remove the two `test.skip` guards in
`e2e/tests/location-not-stocked-here.spec.ts` that those bypasses forced, and add
the spec's remaining cases to the cloud run. Their skip reason names PR 3b.

### Mutation check

Restore one bypass. The cloud E2E case that Step 4.6 unskipped must go RED.

---

### Task 4 — four findings worth keeping

**1. A bug the unit tests could not see, and E2E caught.** The first cloud
bootstrap effect listed `locations` in its dependency array. `useLocations()` maps
its cloud result, so that array has a new identity every render: effect → mutation
→ `AllCarts` refetch → render → effect, without end.

**All 7 unit tests passed against 92 calls**, because every assertion used
`toContain`. `/shopping` never reached `networkidle` and the cloud E2E case timed
out. Fixed with a derived boolean plus a ref, and pinned by a test that goes red at
`expected [...92 entries] to have a length of 1`.

`toContain` cannot see "and 91 more". Assert the count when the count is the thing
that matters.

**2. `pnpm codegen` cannot check an input-object field.** A missing field
*argument* fails GraphQL validation, so codegen catches it. A missing field of an
*input object* is valid in the document and fails one stage later, while coercing
the variable. So `ConsumeRecipesInput.locationId` is checked by `tsc`
(`TS2741`), not by codegen, and the runtime error is `BAD_USER_INPUT` rather than
`GRAPHQL_VALIDATION_FAILED`.

**3. The `e2e/` seeds are a caller class no static check can reach.** They build
GraphQL as plain template literals, so neither codegen nor `tsc` sees them. Three
`createVendor` seeds in `shopping.spec.ts` broke, plus two that created items with
no `ItemStock` row — which only started mattering once the cloud stocked-here gate
went live. Only Playwright found them.

**4. The plan said two bypasses; five had to go.** Removing only `isUnstockedHere`
and `isRecipeUnstockedHere` would have left them partitioning on numbers that are
not location-scoped. The three feeding them also lost their mode branch:
`useVendorCartCounts.ts` (a global tally plus a hard-coded `inactiveCount: 0`),
`cooking.tsx`'s `availableItemIds`, and `shopping/index.tsx`'s `cartForVendor`,
which still built the bare cloud cart id. A fifth in `shopping/$vendorId.tsx` was
false for the same reason.

**Cache-key mutation repeated PR 3a's result exactly.** The hook-level test stays
green because `cache-and-network` refetches on every switch; the cache-level test
in `apollo/client.test.ts` goes red. Not reshaped to force a red.

### A gap recorded, not fixed

`useDeleteLocation`'s cloud branch refetches only `GetLocations`. Since PR 3a both
`Cart.locationId` and `InventoryLog.locationId` cascade, so the database does
delete the rows — but `AllCarts`, `AllCartItems` and `ItemLogs` observers can still
hold deleted ones. Outside Task 4's scope. `removeItemFromLocation`'s per-item
cascade stays PR 3c's, as its own comment says.

## Task 5 — Rehearsal against a production copy

The copy is already in place and checked (2026-09-17). Confirm again before
writing — `prisma migrate status` with and without the override must report
**different hosts**. A silent fallback applies the migration to the dev database
and still prints success.

**This copy does not have PR 3a's migration**, because production has not been
deployed yet. So `migrate deploy` applies **both** `20260916000000` and this PR's.
That is realistic — it is what the real deploy will do — but record the before
state accordingly.

**Before state:** counts, and a **sha256 of each sorted id set** — `Cart.id`,
`CartItem.id`, `CartItem.cartId`. PR 3a used hashes so "unchanged" was provable.
Here the cart hashes **must change**, which is the opposite of PR 3a. Record both
values.

**Assertions after:**

| Assertion |
|---|
| Every `Cart.id` contains `':'` |
| Every `CartItem.cartId` names an existing `Cart` |
| Cart and cart-item counts unchanged |
| Every cart's `locationId` prefix matches its own id |
| No cart belongs to a location owned by another user |

**Name which assertions cannot fail on this data.** Production has one user, so
the cross-user ones are trivially satisfied, and **phase A will do nothing** —
zero accounts have items on the shared row. Say that plainly. The multi-user
fixture from Task 1 is what tests the split.

Tell the user to delete the Neon branch afterwards.

---

### Task 5 result — run 2026-09-18. PASSED.

The env override was proved first: `prisma migrate status` with and without it
reported **different hosts**. Both migrations then applied to the copy —
`20260916000000` (PR 3a) and `20260917000000` (this PR), because production has
not been deployed yet. That is realistic; it is what the real deploy does.

**The hashes moved where they should.** This is the opposite of PR 3a, where the
proof was that nothing changed.

| Set | Rows | Before | After | Expected |
|---|---|---|---|---|
| `Cart.id` | 37 | `2f459450498737da` | `a95da980bc85c0b3` | **changed** — re-keyed |
| `CartItem.cartId` | 13 | `d8fa5adb55a18fd7` | `ef345b98ff1f8625` | **changed** — repointed |
| `CartItem.id` | 13 | `d321211b1b04b290` | `d321211b1b04b290` | **unchanged** — rows move, not recreated |

The third row matters most. A changed `CartItem.id` would mean the migration
deletes and recreates rows rather than updating them, which loses anything not
explicitly copied.

Cart shapes went from `1` literal `'no-vendor'` and `0` with a colon, to `0` and
`37`. Counts unchanged: 37 carts, 13 cart items, 173 items, 1374 logs.

| Assertion | Result |
|---|---|
| `Cart.id` values without a colon | 0 |
| Rows still under the literal `'no-vendor'` | 0 |
| `CartItem` pointing at a missing `Cart` | 0 |
| `Cart.id` not equal to `locationId:original` | 0 |
| **Cart ids with a doubled location prefix** | 0 |

The doubled-prefix check exists because the design's original SQL would have
produced exactly that on the carts phase A creates. Task 1 caught it in review;
this confirms the fix against real data.

**What it does not prove.** Two assertions cannot fail — the cross-user ones,
because production has one user. And **phase A did no work at all**: zero accounts
had items on the shared row. So this rehearsal covers the **re-key** at real scale
and says nothing about the **split**. The split is covered only by the 13-user
fixture in `verify:migration`, where user-l's two items moving into their own new
cart is the assertion that proves it ran.

## Task 6 — Docs, runbook, gate, full E2E

**Step 6.1. The deploy runbook.** A new doc, or a section in the status doc.
It must name: the exact order, the expected downtime, how to tell it worked, and
the rollback. The rollback is the hard part — a re-key has no `migrate down`, so
say honestly what recovery looks like (restore from a Neon branch taken
immediately before).

**Step 6.2.** Update `cloud-locations-status.md`, `docs/INDEX.md`, and any
`CLAUDE.md` whose content this changes.

**Step 6.3.** Full verification gate.

**Step 6.4.** `pnpm test:e2e` — everything, no `--grep`. Expected: the 8 known
issue #280 failures and **nothing else**, minus any cases Step 4.6 unskipped,
which must now pass.

### Report

- gate results command by command
- E2E counts, with the failures named individually
- what PR 3c and PR 4 still owe
