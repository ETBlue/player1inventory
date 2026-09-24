# Plan — cloud E2E for the Stock tab and the group views (issue #284)

**Date:** 2026-09-24
**Issue:** #284
**Status:** ✅ Implemented

## Goal

Add five existing local-only specs to the `cloud` project, so **13 more tests** run
against real Postgres.

| Spec | Tests moving to cloud | Difficulty |
|---|---|---|
| `e2e/tests/recipes-group.spec.ts` | 2 | Easy |
| `e2e/tests/vendors-group.spec.ts` | 2 | Easy |
| `e2e/tests/shelves.spec.ts` | 2 | Easy |
| `e2e/tests/item-stock-input.spec.ts` | 3 | Medium |
| `e2e/tests/item-stock-pager.spec.ts` | 4 of 5 | Medium |
| **Total** | **13** | |

The `cloud` project's `testMatch` goes from 13 files to 18.

## Background

Issue #284 asked for a GraphQL seed helper so cloud E2E could cover location
surfaces. That helper shipped on 2026-09-14 (`e2e/helpers/cloudSeed.ts`), along
with `fixture.ts`, `localSeed.ts` and `cloudTeardown.ts`, and three location
specs joined the cloud project.

Four items were left open. One of them is already done: the two skipped
`location-not-stocked-here` cases and the two `!isCloud` terms in
`shopping/index.tsx` and `cooking.tsx` were removed by PR 3b Task 4. The issue's
own comment is stale on that row.

This plan closes the rest, except the teardown refactor, which gets its own PR.

## Why these five, and what they add

`location-not-stocked-here.spec.ts` already runs in cloud and covers the "not
stocked here" divider on all three group views. It checks only the divider text,
the fact that the sunk group still renders, and DOM order. It never checks a
badge, a count, or a total — its `STOCK_DEFAULTS` are chosen on purpose to keep
badge text out of the way (`fixture.ts` lines 61-63).

So badge and total maths has **zero** cloud coverage today.

| Spec | What it adds in cloud |
|---|---|
| `shelves.spec.ts` | The `1 empty` and `1 low stock` badges on a shelf card, including the boundary rule that `quantity === refillThreshold` counts as low. The packed total `5 / 9` and the `pack` unit. |
| `vendors-group.spec.ts` | The `1 empty` badge on a **vendor** card. Proves vendor grouping sums stock health from `ItemStock` rows in cloud. |
| `recipes-group.spec.ts` | The `1 empty` badge on a **recipe** card. |
| `item-stock-input.spec.ts` | The number inputs on the Stock tab, against real per-location stock rows. |
| `item-stock-pager.spec.ts` | The all-locations pager: add to a location, page between locations, re-add after removal, and the single-location case. |

2 of the 6 group tests (`vendors-group` test 2, `recipes-group` test 1) mostly
repeat what the reference spec already proves. They come along in the same file
and cost nothing extra.

## What stays local-only, and why

**`item-stock-pager.spec.ts` test 2** — "user can remove an item from a location
and lose only that location's logs and cart entries" (line 177).

Leave it local-only. Replace its skip reason with the real one.

Converting it is by far the most expensive job in this plan, and it would
duplicate cloud coverage that already exists:

| | |
|---|---|
| Pager test 2 | "user can remove an item from a location and **lose only that location's** logs and cart entries" |
| `location-scoped-writes.spec.ts:254` (cloud, real SQL, passing) | "user can remove an item from one location and **the other location keeps** its stock, logs and cart entries" |

Same behaviour, stated from opposite sides.

What converting it would have cost:

1. Three entity types `Fixture` has no field for — `inventoryLogs` (line 193),
   `shoppingCarts` (line 215), `cartItems` (line 219).
2. A hand-written cloud seed path for them. The bulk import **cannot** place a
   log or a cart at a non-default location: `InventoryLogInput`
   (`apps/server/src/schema/import.graphql` lines 49-58) has no `locationId`
   field, and `bulkCreateInventoryLogs` hardcodes
   `locationId: await ensureDefaultLocation(userId)`
   (`apps/server/src/resolvers/import.resolver.ts` line 238).
   `bulkCreateShoppingCarts` does the same at line 261. A cloud seed would have
   to use `addInventoryLog(..., locationId:)` and
   `vendorCart(vendorId, locationId)` + `addToCart` instead.
3. Four IndexedDB readbacks needing GraphQL twins (lines 256, 259, 262, 267).

## Traps found while surveying — read before starting

### 1. `consumeAmount: 0` is load-bearing in `item-stock-input.spec.ts`

That spec seeds `consumeAmount: 0` on purpose (line 93, with a comment).
`ItemForm.tsx` line 355 reads it: `consumeAmount === 0` makes the number input
`step="any"`, anything above makes it `step={consumeAmount}`.

`Fixture` has **no** `consumeAmount` field. `seedCloudFixture` hardcodes `1`
(`cloudSeed.ts` line 144) and `seedLocalFixture` writes nothing.

**So moving that spec onto `Fixture` as it stands silently changes the seed, and
the fixture stops testing the decimal input it was written for — while still
passing.** `FixtureItem` needs an optional `consumeAmount` first, honoured by
both seed helpers. Task 1 added it.

The same applies to `targetUnit: 'package'` (line 89), which local does not write
and cloud hardcodes.

**CORRECTED AFTER TASK 1.** An earlier version of this trap said a locally
seeded item with no `consumeAmount` reaches the form as `1`, because
`ItemForm`'s `DEFAULT_VALUES.consumeAmount` is `1` (`ItemForm.tsx` line 85).
That is wrong. Those defaults only apply when `initialValues` leaves the key
out, and both item routes always supply it:

- `apps/web/src/routes/items/$id/index.tsx` line 61 — `consumeAmount: item.consumeAmount ?? 0`
- `apps/web/src/routes/items/$id/stock.tsx` line 61 — the same

So the real starting state, for a fixture that sets neither field, is:

| Field omitted | Local reaches the form as | Cloud reaches the form as |
|---|---|---|
| `consumeAmount` | `0` → `step="any"` | `1` → `step="1"` |
| `targetUnit` | `undefined` | `'package'` |

**The two modes already disagree.** Task 1 preserved that on purpose rather than
changing behaviour for existing fixtures. A converted spec that cares about
either value must set it explicitly — setting `consumeAmount: 0` and
`targetUnit: 'package'` is what makes the modes match.

**CORRECTED AGAIN AFTER TASK 5 — the premise of this trap is false.**

Task 5 ran the mutation this plan asked for: set `consumeAmount: 1` in the
fixture and run the decimal test in cloud. **It stayed green.** So
`consumeAmount: 0` is NOT what makes that test pass, and the plan's mutation
check item 3 cannot be satisfied as written.

Why: `step` on an `<input type="number">` affects validity and the spinner, not
the text the browser keeps while the field has focus. The rounding that
`consumeAmount` drives is `roundToStep(n, consumeAmount)`, passed as
`normalizeOnBlur` (`ItemForm.tsx` lines 277-280 and 806-809). It runs only when
the field is left, and the decimal test never blurs.

**What survives.** Setting `consumeAmount` and `targetUnit` explicitly is still
right, because it keeps the two modes seeding the same data. That was always the
real reason. The claim that the decimal test depends on it was wrong.

**A separate finding worth its own work.** Task 5 mutated the source two ways,
including restoring the literal pre-`2fe372a1` code this file exists to guard.
The decimal test (test 3) **stayed green under both**. Test 1 went red under
both. So test 1 is what pins the swallowed-keystroke bug, and test 3 proves
something narrower: while the field is focused, the controlled component keeps
the exact text typed. Task 5 recorded this in a comment above test 3.

Making test 3 a real guard — blur the field and assert the rounding, or assert
`step` directly — is **not** part of this plan. Task 7 should record it as owed.

Two more corrections from task 1:

- `ItemForm.tsx` lives at `apps/web/src/components/item/ItemForm/ItemForm.tsx`,
  not under `routes/items/`.
- `consumeAmount` feeds `quantityStep`, which three inputs use: Unpacked (line
  802) and Refill When Below (line 956) always, and Target Quantity (line 921)
  only while `targetUnit === 'measurement'`. Packed does not use it.

### 2. Location order is assigned differently in the two modes

`item-stock-pager.spec.ts` test 3 asserts pager page order — `My Home` →
`Office` → `Storage` (lines 294-318).

- `seedLocalFixture` writes `order: index` for every location (`localSeed.ts`
  line 50).
- Cloud is different: the default location keeps its own order, and
  `createLocation` appends `maxOrder + 1`
  (`apps/server/src/resolvers/location.resolver.ts` lines 40-42).

The two agree **only if the fixture lists the default location first.** Put a
comment in the converted fixture saying so.

**CORRECTED AFTER TASK 6 — the rule holds, but the failing project is the
opposite of what this said.** Task 6 moved the default location to the middle of
the array and ran both projects:

| Project | Result |
|---|---|
| `cloud` | **4 passed, 1 skipped — unchanged, green** |
| `local` | **1 failed** — `Previous location` expected disabled, received enabled. The pager opened on page 2. |

Cloud is insensitive because `seedCloudFixture` **never creates** the default
location. It reads back the one `ensureDefaultLocation` already made at
`order: 0` (`apps/server/src/lib/defaultLocation.ts` line 52) and skips
`isDefault` entries in its creation loop (`cloudSeed.ts` line 106). So the
array position of the default is discarded before `createLocation` is reached,
and only the relative order of the **non-default** locations follows the array.

Local is the sensitive one: `seedLocalFixture` writes `order: index` for every
location, default included.

So reordering the array is **invisible in cloud** and makes the two modes test
different page orders, with only local reporting it. That is worse than a plain
failure, not better. Keep the default first.

### 3. The three group specs seed no location at all

`shelves.spec.ts`, `vendors-group.spec.ts` and `recipes-group.spec.ts` write
items with inline stock and then call `splitInlineStock(page)`, which writes to
`DEFAULT_LOCATION_ID = 'local'` (`locationSeed.ts` lines 11, 137). They rely on
Dexie's `on('populate')` to create "My Home".

Moving to `Fixture` means adding one location entry with `isDefault: true`, and
`splitInlineStock` goes away. That also removes the hardcoded `'local'` id,
which names nothing in cloud.

### 4. Five IndexedDB readbacks need GraphQL twins

The two stock specs read rows back to assert, which a cloud run cannot do.

| Spec | Line | Reads | Cloud query to use |
|---|---|---|---|
| `item-stock-pager` | 170 | `readRows(page, 'itemStocks')` | `itemStocksForItem(itemId)` |
| `item-stock-input` | 168-172 | `readRows(page, 'itemStocks')` inside `expect.poll` | `itemStocksForItem(itemId)` |
| `item-stock-input` | 245-250 | `readRows(page, 'itemStocks')` | `itemStocksForItem(itemId)` |

Lines 256, 259, 262 and 267 of `item-stock-pager` belong to test 2, which stays
local-only, so they need nothing.

## Tasks

Do them in this order. Each task ends with its own verification run.

**Only one E2E suite may run on this machine at a time.** Never run two
Playwright invocations in parallel.

### Task 1 — add `consumeAmount` and `targetUnit` to `FixtureItem`

Add both as optional fields to `FixtureItem` in `e2e/helpers/fixture.ts`.
Honour them in `seedLocalFixture` and `seedCloudFixture`. Keep the current
behaviour when a fixture does not set them, so no existing spec changes
behaviour. Say in a comment why `consumeAmount` matters (`ItemForm.tsx` line
355).

No spec changes in this task. Prove nothing broke: run `--project=local` and
`--project=cloud` for `location-not-stocked-here.spec.ts`, which is the heaviest
current user of both helpers.

### Task 2 — `recipes-group.spec.ts` to cloud

Rewrite its two `page.evaluate` + `indexedDB.open` seeds as one `Fixture`.
Add a default location. Use `seedLocalFixture` / `seedCloudFixture` and
`cleanupCloudData`, guarded on `baseURL === CLOUD_WEB_URL`. Follow
`location-not-stocked-here.spec.ts` as the pattern. Add the file to the `cloud`
project's `testMatch`.

### Task 3 — `vendors-group.spec.ts` to cloud

Same shape as Task 2. `FixtureItem.vendorIds` already exists and
`seedCloudFixture` already passes it (`cloudSeed.ts` line 133).

### Task 4 — `shelves.spec.ts` to cloud

Same shape. This one asserts badge maths (`1 empty`, `1 low stock`) and a
packed total (`5 / 9`, `pack`), so the fixture quantities must be carried over
exactly. The boundary case at line 82 — `quantity === refillThreshold` counts as
low — is the point of the test; do not round it away.

### Task 5 — `item-stock-input.spec.ts` to cloud

Move its `seedRows` fixture onto `Fixture`, using the new `consumeAmount: 0` and
`targetUnit: 'package'` fields. Replace the two `readRows` assertions with a
mode-aware readback: IndexedDB in local, `itemStocksForItem` over GraphQL in
cloud. Drop the three `test.skip` guards.

### Task 6 — `item-stock-pager.spec.ts`, 4 of its 5 tests to cloud

Move the fixture onto `Fixture`. Keep the default location **first** in the
`locations` array, with the comment from trap 2. Replace the `readRows` call at
line 170 with a mode-aware readback.

**Leave test 2 local-only.** Keep its `test.skip`, and replace its reason string
`'local-mode fixture: seeds IndexedDB'` with the real reason: the cloud case is
already covered by `location-scoped-writes.spec.ts:254`, and the bulk import
cannot place a log or a cart at a non-default location. Drop the skip from the
other four.

### Task 7 — documentation

- `e2e/CLAUDE.md` — record the new `Fixture` fields and why `consumeAmount`
  matters; record the location-order difference between the two modes.
- `docs/INDEX.md` — add this plan, status ✅.
- Flip this plan's status to ✅ and add a "Corrections found while running this
  plan" table recording everything the plan got wrong.
- Comment on issue #284 with what landed and what is left, then close it.

## Verification

Each task runs the specs it touched in **both** projects, then the final phase
runs the whole gate.

Expected counts after all tasks:

| Project | Before | Predicted | **Measured 2026-09-24** |
|---|---|---|---|
| local | 170 passed, 5 skipped | 170 passed, 3 skipped | **170 passed, 5 skipped** (3m16s) |
| cloud | 76 passed, 6 skipped | 89 passed, 6 skipped | **89 passed, 7 skipped** (9m08s) |
| pwa | 69 passed | 69 passed | **69 passed** (1m25s) |

Whole gate: `pnpm test:e2e:all`, **13m49s**, all three projects PASS.

**Two of the three predictions were wrong on the skip counts.**

- **local stayed at 5 skips, not 3.** The plan's own reasoning contradicted its
  table: `item-stock-input`'s and `item-stock-pager`'s skips fire on
  `baseURL === CLOUD_WEB_URL`, so they never counted in `local` to begin with.
  Removing them could not lower a number they never raised. Local's 5 are
  `a11y.spec.ts`'s 2 offline-banner cases (skipped outside `pwa`),
  `shopping.spec.ts` lines 496 and 536 (`cloud mode only`), and
  `settings/tags.spec.ts` line 154 (an unconditional `test.skip`).
- **cloud went to 7 skips, not 6.** `item-stock-pager.spec.ts` test 2 stays
  local-only, and that skip now fires in `cloud` where the whole file used to be
  absent. 96 cloud tests = 89 passed + 7 skipped.

Cloud gains 13: 2 + 2 + 2 + 3 + 4.

Full gate at the end: `pnpm test:e2e:all`, plus lint, the root `pnpm build` with
the `TS6385` grep, `build-storybook`, `pnpm check` and the root `pnpm test`.

## Mutation checks required

A green test proves nothing on its own. For each converted spec, prove the cloud
half can fail:

1. **Badge maths** (`shelves`, `vendors-group`, `recipes-group`): change the
   fixture so the item that should be empty is stocked, and confirm the `1 empty`
   assertion goes red in the **cloud** project.
2. **Per-location stock** (`item-stock-pager`): the fixture must stock the item
   at a location that is **not** the active one, or "count stock here" and "count
   all stock" give the same answer and the test passes against code that ignores
   location entirely. This is the standard trap in this repo — see root
   `CLAUDE.md`, *Proving a Test Works*.
3. **`consumeAmount`** (`item-stock-input`): set it to `1` in the fixture and
   confirm the decimal-input test goes red. If it stays green, the assertion is
   not testing what its comment claims.

   **RESULT: it stayed green.** Measured in task 5. See the correction at the
   end of trap 1. The assertion was not testing what its comment claimed, and
   the comment has been rewritten to say what was measured.

Report which mutations ran and that each went red.

### CORRECTED AFTER TASK 2 — mutate the SOURCE, not only the fixture

Task 2 ran the fixture change above and reported, correctly, that it proves
less than a mutation check should. Root `CLAUDE.md`, *Proving a Test Works*,
says to delete or invert the behaviour **in the source**. A fixture change
proves the assertion reads the seeded value. It does not prove that deleting
the app code under test makes the test fail.

**From task 3 on, run both.**

| Check | What it changes | What it proves |
|---|---|---|
| Fixture sensitivity | the seeded quantity | the assertion reads the value the cloud seed wrote, through the cloud path |
| **Source mutation** | the app code that computes the number | the test fails when the behaviour it names is gone |

For the three group views the badge number comes from `getOutOfStockCount`.
**Mutate the DEFINITION, not the call site:**

| View | `getOutOfStockCount` defined at |
|---|---|
| `apps/web/src/components/pantry/RecipeGroupView.tsx` | line **50** |
| `apps/web/src/components/pantry/VendorGroupView.tsx` | line **41** |
| `apps/web/src/components/pantry/ShelfGroupView.tsx` | line **71** |

Force it to return `0`. The `N empty` badge should disappear and the cloud test
should go red. Restore afterwards and confirm green.

**CORRECTED AFTER TASK 4.** An earlier version of this section gave lines 102,
92 and 223 — those are the **call sites**, where the value is passed as the
`outOfStockCount` prop. For `ShelfGroupView.tsx` that is worse than imprecise:
line 223 is `renderUnsortedCard`, which uses a **different** function,
`getUnsortedOutOfStockCount` (defined at line 126). Mutating there changes only
the Unsorted card, and the test **stays green** — a mutation that proves nothing
while looking like proof.

Two more notes from the tasks that ran:

- **A fixture mutation and a source mutation can produce identical failure
  text.** Both make `getByText('1 empty')` time out. A report must name the file
  and line it changed; the error message alone does not identify which check ran.
- **The repo root has no `tsconfig.json`**, so a temporary type-check config
  cannot `extend` one. Write a standalone config with its own `compilerOptions`.

The badge is rendered by `apps/web/src/components/shared/GroupCard/GroupCard.tsx`.
Line 100 builds the label text, but the `> 0` guard on line **96** is what decides
whether the badge renders at all — that guard is what makes the mutation go red.

**Task 2 is owed this check.** Task 7 must run it for `recipes-group.spec.ts`
and record the result, or say plainly that it was not run.

**RAN IN TASK 7 — it went red.** `getOutOfStockCount` in
`apps/web/src/components/pantry/RecipeGroupView.tsx` line 50 was replaced with
`const getOutOfStockCount = (_recipeId: string) => 0`, then
`pnpm test:e2e --project=cloud e2e/tests/recipes-group.spec.ts` was run:

```
1 failed
  [cloud] › e2e/tests/recipes-group.spec.ts:200:1 › user sees out-of-stock badge on recipe group card
  Locator: getByText('1 empty')
  Expected: visible
  Timeout: 5000ms
  Error: element(s) not found
1 passed (25.5s)
```

The source was restored and the same command re-run: **2 passed (20.5s)**. The
other test in the file (line 188, "user sees recipe group card") does not assert
the badge, so it correctly stayed green under the mutation.

### What these three group specs cannot catch

They seed **one** location. With one location, "count items stocked here" and
"count every item" return the same number, so no location-scoping mutation can
go red in them. That is fine — they exist to cover badge and total maths, which
has no cloud coverage at all today. Location scoping is covered by
`location-not-stocked-here.spec.ts` and `location-scoped-writes.spec.ts`.

Do not describe these three specs as location coverage. Task 7 should say this
in `e2e/CLAUDE.md`.

---

## Corrections found while running this plan

Every task found something the plan got wrong. This table is the summary; the
`CORRECTED AFTER TASK n` blocks above carry the detail and the measurements.

| # | Found in | What the plan said | What is true |
|---|---|---|---|
| 1 | Task 1 | A locally seeded item with no `consumeAmount` reaches the form as `1`, because `ItemForm`'s `DEFAULT_VALUES.consumeAmount` is `1`. | Those defaults apply only when `initialValues` leaves the key out, and both item routes always supply it (`routes/items/$id/index.tsx` line 61 and `routes/items/$id/stock.tsx` line 61, both `item.consumeAmount ?? 0`). Local reaches the form as `0` → `step="any"`; cloud as `1` → `step="1"`. **The two modes already disagreed.** |
| 2 | Task 1 | `ItemForm.tsx` lives under `routes/items/`. | It lives at `apps/web/src/components/item/ItemForm/ItemForm.tsx`. |
| 3 | Task 1 | `consumeAmount` feeds one input. | It feeds `quantityStep`, which three inputs use: Unpacked (line 802) and Refill When Below (line 956) always, Target Quantity (line 921) only while `targetUnit === 'measurement'`. Packed does not use it. |
| 4 | Task 2 | Mutation check = change the fixture. | A fixture change proves only that the assertion reads the seeded value. Root `CLAUDE.md` asks for a **source** mutation. From task 3 on both were run. |
| 5 | Task 4 | Mutate `getOutOfStockCount` at `RecipeGroupView.tsx:102`, `VendorGroupView.tsx:92`, `ShelfGroupView.tsx:223`. | Those are the **call sites**. The definitions are at lines **50**, **41** and **71**. `ShelfGroupView.tsx:223` is worse than imprecise: it is `renderUnsortedCard`, which uses a different function, `getUnsortedOutOfStockCount` (line 126). Mutating there changes only the Unsorted card and **the test stays green** — a mutation that looks like proof and is not. |
| 6 | Task 5 | `consumeAmount: 0` is load-bearing in `item-stock-input.spec.ts`; setting it to `1` makes the decimal test go red. | **It stayed green.** `step` affects validity and the spinner, not the text the browser keeps while the field has focus. The rounding `consumeAmount` drives is `roundToStep`, passed as `normalizeOnBlur` (`ItemForm.tsx` lines 277-280 and 806-809), and it runs only on blur — which that test never does. Setting both fields explicitly is still right, but for the other reason: it keeps the two modes seeding the same data. |
| 7 | Task 5 | Test 3 (decimal input) is what guards the pre-`2fe372a1` swallowed-keystroke bug. | Test 3 stayed green under **both** source mutations, including the literal pre-`2fe372a1` code. **Test 1** went red under both. Test 3 proves something narrower: while the field is focused, the controlled component keeps the exact text typed. |
| 8 | Task 6 | Reordering the `locations` array so the default is not first breaks the **cloud** run. | The opposite. Cloud is **insensitive** — `seedCloudFixture` never creates the default, it reads back the one `ensureDefaultLocation` made at `order: 0` and skips `isDefault` entries in its creation loop. Local is the sensitive one (`order: index` for every location). Measured: default moved to the middle gave cloud **4 passed, 1 skipped — unchanged** and local **1 failed**. The rule "keep the default first" stands; only the reason changed, and the silent case is worse than a plain failure. |
| 9 | Task 4 | — | A fixture mutation and a source mutation produce **identical** failure text (both time out on `getByText('1 empty')`). A report must name the file and line it changed; the error message alone does not identify which check ran. |
| 10 | Task 4 | — | The repo root has **no** `tsconfig.json`, so a temporary type-check config for `e2e/` cannot `extend` one. Write a standalone config with its own `compilerOptions`. |
| 11 | Task 7 | local would end at 170 passed / **3** skipped. | It ended at 170 passed / **5** skipped — unchanged from the baseline. The plan's own next sentence already said why: those skips fire on `baseURL === CLOUD_WEB_URL` and never counted in `local`. |
| 12 | Task 7 | cloud would end at 89 passed / **6** skipped. | 89 passed / **7** skipped. `item-stock-pager.spec.ts` test 2 stays local-only, and its skip now fires in `cloud` where the whole file used to be absent. |
| 13 | Follow-up, 2026-09-24 | Corrections 1 and 6 said "the two modes disagree" about an omitted `consumeAmount` / `targetUnit`, and left both helpers as they were. | Symmetric wording, asymmetric fact. `seedCloudFixture` wrote `1` and `'package'`, which **matches the product** — `createItem` writes `consumeAmount ?? 1` and `targetUnit ?? 'package'`, Prisma declares `@default(1)`, Dexie v16 backfills `undefined` to 1 and v17 backfills 0 to 1. `seedLocalFixture` wrote no key at all, giving `undefined`, a state the app never creates. **Cloud was right; local was wrong.** `seedLocalFixture` now defaults the same way. `item-stock-input.spec.ts` also seeded `consumeAmount: 0`, which `ItemForm.tsx` line 342 marks invalid — changed to 1. |

### Corrections to Task 7's own brief

| What the brief said | What is true |
|---|---|
| "`e2e/CLAUDE.md` says the cloud `testMatch` is 13 files. Find and fix every stale count in this file." | `e2e/CLAUDE.md` carried **no** `testMatch` file count at all. The only stale counts were in the root `CLAUDE.md` (the `13 files today` paragraph and the `82 in cloud across 13 spec files` line). The count was **added** to `e2e/CLAUDE.md` as new information, not fixed. |
| "The specs still not in cloud: `unified-item-search`, `onboarding`, `settings/shelves`, `settings-global-pages`, `settings/import-export-local`." | Correct as far as it goes, but the full set of the 7 files outside the cloud `testMatch` also includes `a11y.spec.ts` (runs in `local` + `pwa`) and `pwa-offline.spec.ts` (`pwa` only). Neither is a candidate for cloud. |

## Still owed

### 1. `item-stock-input.spec.ts` test 3 is not a guard

The decimal-input test stayed green under both source mutations task 5 ran,
including the literal pre-`2fe372a1` code the file exists to guard. Test 1 is
what pins that bug.

To make test 3 a real guard, either blur the field and assert the rounding, or
assert the `step` attribute directly. Not done, and not part of this plan.

### 2. Seven spec files run in no cloud project

Verified against `e2e/playwright.config.ts` on 2026-09-24 — 25 spec files in
`e2e/tests/`, 18 in the cloud `testMatch`:

| Spec | Why it is not in cloud |
|---|---|
| `unified-item-search.spec.ts` | no cloud awareness; needs a cloud fixture written from nothing |
| `onboarding.spec.ts` | not attempted |
| `settings/shelves.spec.ts` | not attempted |
| `settings-global-pages.spec.ts` | not attempted |
| `settings/import-export-local.spec.ts` | local mode is what it tests; `settings/import-export-cloud.spec.ts` is its cloud twin |
| `a11y.spec.ts` | runs in `local` and `pwa`; a cloud copy would scan the same markup |
| `pwa-offline.spec.ts` | `pwa` only, by design |

### 3. Deliberately left local-only: `item-stock-pager.spec.ts` test 2

"user can remove an item from a location and lose only that location's logs and
cart entries". Two reasons, both verified:

1. The cloud case is already covered by `location-scoped-writes.spec.ts` line
   254, stated from the other side: "the other location keeps its stock, logs
   and cart entries".
2. The bulk import **cannot** seed a log or a cart at a non-default location.
   `InventoryLogInput` (`apps/server/src/schema/import.graphql`) has no
   `locationId` field; `bulkCreateInventoryLogs` (`import.resolver.ts` line 238)
   and `bulkCreateShoppingCarts` (line 261) both hardcode
   `ensureDefaultLocation(userId)`.

### 4. Deliberately deferred: the cloud teardown refactor

11 spec files still hand-roll a raw `request.delete(...)` against the
`/e2e/cleanup` endpoint, across **19 call sites**, instead of calling
`cleanupCloudData` from
`e2e/helpers/cloudTeardown.ts`. Counted on 2026-09-24:

| | Files | Call sites |
|---|---|---|
| hand-rolled `request.delete(.../e2e/cleanup)` | 11 | 19 |
| already on `cleanupCloudData` | 9 | — |

(`a11y`, `item-management`, `onboarding`, `cooking`, `item-logs`,
`item-list-state-restore`, `shopping`, `settings/import-export-cloud`,
`settings/vendors`, `settings/recipes`, `settings/tags`.)

It gets its own PR. Folding it in here would bury a real failure in a large
diff with no test behind it.
