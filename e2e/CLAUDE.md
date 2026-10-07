# E2E — Agent Rules

Playwright specs for the full stack. Structure and authoring conventions live in the
root `CLAUDE.md` → **E2E Test Format**. This file records the *environment* hazards —
each one has already cost a session by presenting as a code regression.

## Only one E2E suite may run on this machine at a time

`pnpm test:e2e` cannot run concurrently in two worktrees (or two agent sessions). The
ports are plain constants in `e2e/constants.ts` — `LOCAL_WEB_PORT 5175`,
`CLOUD_WEB_PORT 5174`, `CLOUD_SERVER_PORT 4001` and `PWA_WEB_PORT 5176` — with no env
override, and every `webServer` entry sets `reuseExistingServer: false`. **There are four
ports, not three.** `PWA_WEB_PORT` arrived with the PWA work and is easy to miss when
checking whether the machine is free. Cloud specs additionally share one
dev database under the same `E2E_USER_ID`, so a concurrent run cross-contaminates rows
even when the ports happen to work out.

**The symptom is not a port error.** Playwright starts, then dozens of specs fail with
`net::ERR_CONNECTION_REFUSED at http://localhost:5175/` because the other run tore the
vite server down mid-flight. That reads as a mass code regression; it is an environment
collision. It happened on 2026-08-27 between two worktrees.

**Before running E2E,** check the ports are free *and stay* free:

```bash
for p in 5175 5174 5176 4001; do lsof -nP -iTCP:$p -sTCP:LISTEN; done
# identify the owner with: ps -o command -p <pid>
```

The process path names which worktree owns it. Wait for a **sustained** quiet window
(~90s of consecutive free checks), not the first free instant, or you race the other
session's next launch. **Never kill the other session's server.** A run showing
`ERR_CONNECTION_REFUSED` is void — re-run it alone before believing any failure.

## A filtered run starts only the servers that project needs

Since 2026-09-24 (issue #302), `e2e/playwright.config.ts` builds its `webServer`
array from the projects named on the command line:

| Command | Servers started |
|---|---|
| `--project=local` | `5175` |
| `--project=cloud` | `5174` + `4001` |
| `--project=pwa` | `5176` (runs `pnpm --filter web build` first) |
| no `--project` | all four |

Before that change Playwright started **all four** servers whatever `--project`
said, because there is no per-project `webServer`. Three local-mode tests ran a
full production build for a PWA preview they never opened.

**The fallback is to start everything.** The config cannot read the selection
with confidence when `--ui` or `--debug` is passed, or when a `--project` value
is not exactly `local`, `cloud` or `pwa` — a glob counts as unrecognised. In
those cases it starts all four, so a parsing mistake costs a slow run and never
a missing server.

**One spec crossed projects, and it had to be fixed for this to be true.**
`a11y.spec.ts` runs in both `local` and `pwa`, and its `offline banner a11y`
block sets `test.use({ baseURL: PWA_WEB_URL })` for its two tests. Under `local`
those two hit port `5176`, which a `--project=local` run no longer starts, and
they failed with `net::ERR_CONNECTION_REFUSED at http://localhost:5176/`. They
now carry a **describe-level** `test.skip` that skips them outside the `pwa`
project. They ran against the same server with the same code in both projects,
so nothing is lost — `pwa` still runs them.

**The skip must be at describe level, not in the test body.** The file's
top-level `beforeEach` also calls `page.goto('/')`, so a body-level
`test.skip(...)` runs after that hook has already hit `5176`. Measured: with the
skip in the body, `--project=local ... --grep "offline banner"` still reported
**2 failed**; with it at describe level, **2 skipped**. Describe level needs
`test.info().project.name` — the callback form of `test.skip` is handed
fixtures, not a `TestInfo`.

**Two consequences for the port check above.** A `--project=local` run leaves
`5174`, `5176` and `4001` free, so seeing them free does not mean nobody is
running E2E. And `pnpm test:e2e:all` (`e2e/run-all.sh`) runs the three projects
one after another, so it touches all four ports over its lifetime but rarely
more than two at a time.

## `pnpm test:e2e:all` runs the three projects in one command

`e2e/run-all.sh` runs `local`, `cloud` and `pwa` as three separate Playwright
invocations. It does three things a plain `a && b && c` gets wrong:

1. It does **not** stop at the first failing project. All three run, and a
   summary table at the end lists each project's result and elapsed time. The
   script exits non-zero if any project failed.
2. It gives each project its own HTML report directory
   (`playwright-report/local`, `/cloud`, `/pwa`) via
   `PLAYWRIGHT_HTML_OUTPUT_DIR`. One shared directory would let run 3 overwrite
   runs 1 and 2.
3. It sets `PLAYWRIGHT_HTML_OPEN=never`, so a failure does not open a browser
   and block a non-interactive run.

Extra arguments are passed to every project run, e.g.
`pnpm test:e2e:all --reporter=line`.

## A stale `generated/graphql.ts` breaks E2E with symptoms that point elsewhere

`apps/web/src/generated/graphql.ts` is gitignored, so a checkout or worktree can carry a
stale copy. When it is stale the app **fails to boot entirely** — `<div id="root">` stays
empty with a single `pageerror`:

```
The requested module '/src/generated/graphql.ts' does not provide
an export named 'useApplyShelfFilterPicksMutation'
```

Nothing in the failure says "codegen". What you see instead:

- `a11y.spec.ts` fails on `landmark-one-main` and `page-has-heading-one` — an empty body
  has no `<main>` and no `<h1>` — *not* on any real violation
- seeds die with `NotFoundError: One of the specified object stores was not found`,
  because `indexedDB.open()` created an empty v1 DB when Dexie never ran

Both look like genuine bugs in whatever you are working on.

**If a page renders nothing, or E2E fails on missing landmarks plus "object store not
found", run `pnpm codegen` from the repo root before investigating anything else.**
`EnterWorktree`'s hook runs it on creation, but the main checkout drifts on its own after
a branch switch. The root `pnpm build` runs codegen too — which is why it catches drift
that `pnpm test`, `pnpm check` and `build-storybook` all miss.

## Cloud E2E is not database-isolated

The `cloud` project runs against whatever `DATABASE_URL` is set in `apps/server/.env` —
normally the **dev database**. There is no dedicated test database.

Isolation is by **row ownership, not by database**: every write is scoped to
`E2E_USER_ID` (`e2e/constants.ts`, `'e2e-test-user'`), and the `/e2e/cleanup` endpoint
(`apps/server/src/index.ts`) runs `deleteMany({ where: { userId } })` per model — it
deletes only that user's rows, never all data. **Do not describe the cleanup endpoint as
wiping the database.**

This was obscured for a while by a leftover `MONGODB_URI` from the MongoDB → Prisma
migration, which made the config *look* isolated. The server never read it (Prisma reads
`DATABASE_URL`/`DIRECT_URL`), so it was inert rather than erroring. Removed in PR #242;
the real invariant is now commented in `e2e/playwright.config.ts`.

**Fixed (2026-08-30, cloud locations PR 1).** The switch is an in-process datasource
override in `apps/server/src/lib/prisma.ts`, not a `webServer` env var: the cloud
`webServer` entry in `e2e/playwright.config.ts` passes no database URL of any kind — it
sets `E2E_TEST_MODE=true` (alongside `PORT` and `CLIENT_ORIGIN`), and when
`prisma.ts` sees that flag it points the runtime Prisma client at `TEST_DATABASE_URL`
(read from `apps/server/.env`, a dedicated Neon branch — see `apps/server/.env.example`)
instead of `DATABASE_URL`. `TEST_DIRECT_URL` has no runtime consumer today — it exists
for Prisma **migrations** against that same branch (`prisma migrate deploy` /
`migrate resolve`, run manually) and will be read by a later task's
`scripts/verify-migration.ts`. Row-ownership scoping under `E2E_USER_ID` still applies on
top of this and `/e2e/cleanup` is unchanged — but a spec that needs a second synthetic
user no longer leaves rows in the dev database. If `E2E_TEST_MODE=true` and
`TEST_DATABASE_URL` is unset, `prisma.ts` throws rather than falling back to
`DATABASE_URL` (covered by `apps/server/src/lib/prisma.test.ts`) — so a missing test
database fails loudly instead of silently writing multi-user fixtures into dev.

## Every cloud spec uses `cleanupCloudData` — since 2026-09-25

`e2e/helpers/cloudTeardown.ts` exports `cleanupCloudData(request)`. It is the only
version of the cloud teardown now. Call it from `beforeEach` and `afterEach`, guarded on
`baseURL === CLOUD_WEB_URL`. The helper does **not** guard itself — without the guard a
local run would fire a cloud cleanup.

Until 2026-09-25, 11 spec files hand-rolled the same request at 19 call sites:

```ts
await request.delete(`${CLOUD_SERVER_URL}/e2e/cleanup`, {
  headers: { 'x-e2e-user-id': E2E_USER_ID },
})
```

**The bodies were identical. The one difference: the hand-rolled version never checked
the response.** A cleanup that stops working — the server is down, or a new model joins
the schema but not the delete list — returned quietly there and the test carried on. Rows
from the last test survived into the next one, and the failure landed much later, in some
other test, looking like an unrelated bug. `cleanupCloudData` throws instead, so the
failure lands on the test that owns the cleanup.

Measured on 2026-09-25 by pointing the helper at a path that 404s
(`/e2e/cleanup-MUTATION-PROOF`) and running one cloud test:

| Version | What the run reported |
|---|---|
| `cleanupCloudData` | `[cloud] item-management.spec.ts:47 user can create an item` failed with `Error: cleanupCloudData: DELETE /e2e/cleanup returned 404 Not Found`, stack pointing at the `afterEach` call site |
| hand-rolled | no cleanup error at all — the run failed one test later, inside `ItemPage.save` on a `waitForURL` timeout, with a page snapshot naming nothing about cleanup |

The section right below this one is a real case of the same failure: `/e2e/cleanup` was
deleting no `Location` rows at all, and the symptom was `cooking.spec.ts` reading `0` on
the Stock tab where the test expected `6`.

**Note the error message hardcodes the literal path `/e2e/cleanup`** rather than printing
the URL it actually called. In the proof above that made the message disagree with the
404 body. It is cosmetic, but do not read the message as proof of which URL was hit.

## `/e2e/cleanup` deletes `Location` and `ItemStock` — since 2026-09-14

Before that date the endpoint deleted 12 models and missed both. The effect was not
visible in a single run, so it went unnoticed:

- `Location` rows stayed in the test database forever. `ensureDefaultLocation`
  (`apps/server/src/lib/defaultLocation.ts`) returns early when the user already has a
  default location, so it never recreated a clean default. Run 2 of a location test saw
  run 1's locations.
- `ItemStock` rows went away by accident, through the `ON DELETE CASCADE` on their
  `itemId`, not because the endpoint asked for them.

Both models are now in the `$transaction` list in `apps/server/src/index.ts`.

**The guard that keeps the three delete lists in step** is
`apps/server/src/resolvers/purge-coverage.test.ts`. Three paths hand-maintain the same
list — `purgeUserData` (`purge.resolver.ts`), `clearAllData` (`import.resolver.ts`) and
`/e2e/cleanup` (`index.ts`). The guard reads resolver source from disk, so a mock cannot
satisfy it.

**It only checks models that declare a `userId`.** `ItemStock` has none, on purpose — it
is scoped through its `Location` (see root `CLAUDE.md` → Authorization). So the
`itemStock` line in those three lists is covered by no test that can fail on the DATA. If
someone deletes that line, the rows still go: both of `ItemStock`'s foreign keys cascade.
Measured 2026-09-25 — with `prisma.itemStock.deleteMany` removed from `index.ts`,
`cleanup-endpoint.spec.ts` still read back an empty `itemStocksForItem`. The line is there
to keep the three lists identical, not because the route needs it.

## `purge-coverage.test.ts` is a SOURCE-TEXT check — what it cannot see

The guard asserts the string `prisma.location.deleteMany(` **appears** in the file. It
never starts the server, never calls the route, and never reads the `where` clause. So
this satisfies the guard, answers HTTP 200, and deletes nothing:

```ts
prisma.location.deleteMany({ where: { userId: someWrongValue } })
```

Measured 2026-09-25 with exactly that mutation on the `location` line of `/e2e/cleanup`:

| Check | Result |
|---|---|
| `purge-coverage.test.ts` | **5 passed** — it cannot see the filter |
| `cleanup-endpoint.spec.ts` | **failed**: `models that deleted nothing: {...,"locations":0}` |

That pair is the reason the spec below exists (issue #319).

## `cleanup-endpoint.spec.ts` — the behavioural guard on `/e2e/cleanup`

`e2e/tests/cleanup-endpoint.spec.ts` (added 2026-09-25, one cloud test) seeds **one row of
every model `/e2e/cleanup` deletes** — all 14 — calls the route, and asserts every returned
count is at least 1, then reads the data back and asserts empty. It is cloud-only and has
no browser: it is in the `cloud` project's `testMatch` and the `local` project's
`testIgnore`, like `location-scoped-writes.spec.ts`.

**The route now returns per-model deleted counts.** `prisma.deleteMany` already returns
`{ count }`; `index.ts` used to throw those away and answer `{ ok: true }`. It now answers
`{ ok: true, deleted: { inventoryLogs, cartItems, carts, itemTags, itemVendors,
recipeItems, itemStocks, items, tags, tagTypes, vendors, recipes, shelves, locations } }`.
The route is mounted only under `E2E_TEST_MODE`, so production is unaffected.

**Order matters for the counts, not only for the deletes.** Every child is deleted before
its parent, so each count is the number of rows that statement removed. Move
`item.deleteMany` above `itemTag.deleteMany` and the `ItemTag` rows go by `ON DELETE
CASCADE` instead, reporting 0.

**`cleanupCloudData` checks the KEYS, never the counts.** It runs in the `beforeEach` and
`afterEach` of every cloud spec, where zero rows is normal and correct — the `beforeEach`
call usually deletes nothing at all. A "count above zero" check there would fail every
clean run. So the helper asserts only that the body carries a numeric count for every key
in its own `CLEANUP_MODEL_KEYS` list, and throws naming the missing model otherwise. The
"at least 1" assertion lives in the spec, which seeds first.

**What the spec proves, and what it does not:**

| Failure | Caught by | Measured 2026-09-25 |
|---|---|---|
| Wrong `where` on a listed model | the spec only | `purge-coverage` 5 passed; spec failed with `"locations":0` |
| A model with a `userId` dropped from the list | both | `purge-coverage` 1 failed / 4 passed; spec failed with `no deleted count for shelves` |
| `ItemStock` dropped from the list | the spec only, and only on the reported COUNT | `purge-coverage` 5 passed; spec failed with `no deleted count for itemStocks`. The rows themselves still went, by cascade. |
| The seed silently writing nothing | the seed assertion, and the count assertion too | `createShelf` removed → failed at `expect(before.shelves).toHaveLength(1)`, before the route was called. The seed assertion is not the only guard here — a dead seed also makes every count 0. What it adds is that the failure names the seed instead of blaming the route. |

**Three models are never read back**: `ItemTag`, `ItemVendor` and `RecipeItem`. GraphQL
exposes them only through `Item.tagIds`, `Item.vendorIds` and `Recipe.items`, and all three
parents are gone by the time the readback runs. Their `deleted` counts are the only check
on them. `ItemStock`'s readback is weak for the cascade reason above; its count is what
speaks for it.

**`Location` is read back LAST, because reading it recreates one.** The `locations` query
runs `ensureDefaultLocation`, so the readback asserts exactly one location and that its id
is neither of the two the spec seeded. `afterEach` deletes that fresh row.

### The consequence: every cloud test now starts with zero locations

Deleting `Location` on cleanup means every cloud test starts with **zero** locations. A
cloud seed that writes stock therefore writes before anything has created a default
location.

**Until 2026-09-16 that write was dropped in silence** (issue #287).
`mirrorStockToDefaultLocation` ended with `if (!locationId) return`. The item was created,
`Item`'s legacy columns were set, and no `ItemStock` row was written. (That function lived in
`apps/server/src/lib/stockDualWrite.ts`, which **cloud locations PR 5 deleted** along with
`Item`'s five legacy columns. The file no longer exists; the consequence in this section's
heading — every cloud test starts with zero locations — is unchanged.) The pantry then showed the item below the "not stocked here"
divider with a quantity of 0, and nothing anywhere reported an error.

This caught `cooking.spec.ts` on 2026-09-14. Measured, not guessed: with `Location` removed
from the cleanup list again, the cloud cooking test **fails on run 1 and passes on run 2** —
run 1's app created the default location, and the old cleanup left it behind for run 2. So
that test had been passing on a leaked row, and would have failed on any genuinely fresh
database.

**The server no longer drops the write.** `ensureDefaultLocation`
(`apps/server/src/lib/defaultLocation.ts`) creates the default location when the user has
none, and every stock write path reaches it — `updateItem`, `bulkCreateItems`,
`bulkUpsertItems`, `checkout` and `consumeRecipes`. Seed order no longer decides whether
stock survives.

**`ensureCloudDefaultLocation(request)` (`e2e/helpers/cloudSeed.ts`) is still there, and
still worth calling first.** It is no longer a workaround: `seedCloudFixture` needs the
default location's id (to map the fixture's default key onto) and its name (to decide
whether to rename it), so the call has its own reason to exist. `cooking.spec.ts` also
still calls it — a seed that guarantees its own preconditions does not depend on server
behaviour to be correct.

## A seed that writes an item must also write its stock — in BOTH modes

The pantry lists **stocked** items, not catalog items. `getStockedItems` filters on
`ItemStock`, so an item with no stock row at the active location is an orphan: in the
catalog, absent from the pantry. A seed that writes only the item is not a smaller seed,
it is a broken one — and the failure lands much later, on a locator timeout for a card
that never rendered.

Both halves of a dual-mode seed need their own fix, and a fix to one half looks like it
worked because the other project's four failures are reported separately:

| Mode | Writes | What to add |
|---|---|---|
| local | `db.transaction('items', 'readwrite')` | `await splitInlineStock(page)` from `helpers/locationSeed.ts`, after the item write |
| cloud | `createItem` over GraphQL | `upsertItemStock` after each `createItem`, with the location id from `ensureCloudDefaultLocation(request)` (`helpers/cloudSeed.ts`) |

`splitInlineStock` touches IndexedDB only and does **nothing** for the cloud branch.

**The cloud half is not a server bug.** The `createItem` resolver
(`apps/server/src/resolvers/item.resolver.ts`) is a single `prisma.item.create` on
purpose — creating a catalog item and stocking it are two operations. The app's
`useCreateItem` hook runs `createItem` then `upsertItemStock` unless `catalogOnly`. A
seed that skips the second call is doing half of what the app does.

Keep the cloud seed parallel. 40 sequential round trips blow the test timeout. Await each
item's own `createItem` before its `upsertItemStock`; different items are independent:

```ts
await Promise.all(names.map(async (name) => {
  const { createItem } = await gql(CREATE_ITEM, { name })
  await gql(UPSERT_STOCK, { itemId: createItem.id, locationId, input: { /* … */ } })
}))
```

This cost 8 failing tests on `main` for weeks — `item-list-state-restore.spec.ts`, 4
local and 4 cloud (issue #280, fixed 2026-09-23). `settings/vendors.spec.ts` already
calls `splitInlineStock`. `settings/recipes.spec.ts` seeds items without stock and is
correct as written, because it asserts only on catalog views (the recipe-detail Items tab
reads `useItems()`), never on the pantry.

## Seeding a fixture that runs in both modes

A spec that seeds data and runs in both the `local` and `cloud` projects describes its
fixture **once, as plain data**, and lets each mode translate it:

| File | Role |
|---|---|
| `e2e/helpers/fixture.ts` | the `Fixture` type — locations, vendors, items, stocks, shelves, recipes |
| `e2e/helpers/localSeed.ts` | `seedLocalFixture(page, fixture)` — writes it to IndexedDB |
| `e2e/helpers/cloudSeed.ts` | `seedCloudFixture(request, fixture)` — writes it through GraphQL |

Both return the same `Record<locationKey, realLocationId>` map.

`e2e/tests/location-not-stocked-here.spec.ts` is the working example.

**A cloud-only spec uses `seedCloudFixture` on its own.**
`e2e/tests/location-scoped-writes.spec.ts` does that. It has no local twin and no
browser: it calls the four location-scoped write mutations through `makeGql` and reads
the result back the same way, because the behaviour it tests is which `locationId` the
server writes a row to. It is listed in the `cloud` project's `testMatch` AND in the
`local` project's `testIgnore` (`e2e/playwright.config.ts`), so it runs in exactly one
project. `settings/import-export-cloud.spec.ts` is configured the same way.

**Entity ids are the same in both modes.** `ItemInput`, `VendorInput`, `ShelfInput` and
`RecipeInput` all declare `id: ID!`, so the bulk import mutations accept the local
fixture's own fixed ids.

**Location ids are the exception.** The import schema has no `LocationInput` until PR 4
of cloud locations, so `createLocation(name:)` returns a server-generated cuid. That is
why `Fixture` references locations by a symbolic `key` (`'HOME'`, `'OFFICE'`) and never
by an id. A spec that hardcoded `'local'` — the local default-location sentinel — would
name nothing at all in cloud mode.

**`seedCloudFixture` reconciles stock; it does not assume — and that is why it needed no
change across two PRs that inverted what the server does.**

`bulkCreateItems` used to call `mirrorStockToDefaultLocation`, so every seeded item arrived
with a stock row at the default location whether the fixture asked for one or not. **That is
no longer true.** Cloud locations PR 4b task 6 deleted the call, and PR 5 removed the five
inline stock fields from `ItemInput` altogether — so `bulkCreateItems` now writes **no stock
row at all**, and step 3 of the seed leaves every item stocked nowhere.

The helper still reads the real stock rows back rather than predicting them, which is
exactly why it is correct under both behaviours. **Do not replace that read-back with an
assumption about what the server did.** It reads, and then:

- `upsertItemStock` for every `(item, location)` pair the fixture lists
- `removeItemFromLocation` for every pair in the database that the fixture does not list

Reconciling against what the database actually holds is what kept this working across both
changes. **Checked at PR 5, as this paragraph used to ask:** with no mirror running, the
reconcile finds nothing to remove and creates every row the fixture lists. No edit to the
loop was needed in 4b or in PR 5 — which is the whole argument for reading state back
instead of predicting it.

**The `cloud` project's `testMatch` is 20 files today** (`e2e/playwright.config.ts`),
up from 13 on 2026-09-23. The five added on 2026-09-24 are `recipes-group.spec.ts`,
`vendors-group.spec.ts`, `shelves.spec.ts`, `item-stock-input.spec.ts` and
`item-stock-pager.spec.ts`. The 19th file is
`cleanup-endpoint.spec.ts`, added 2026-09-27 for issue #319. The 20th is
`cart-id-cross-user-leak.spec.ts`, added 2026-10-03 by cloud locations PR 4b — the first
cloud spec with **two** users, and a labelled negative control rather than coverage.

**Cloud test counts, measured, not quoted:** `--list` reported **97** on 2026-09-24. A full
`--project=cloud` run on 2026-10-04 at `feature/cloud-locations-pr4b` collected **103**. 4b
added 5 of those: 1 for the leak spec and 4 because `import-export-cloud.spec.ts` went
2 → 6. The remaining step from 97 to 98 happened between 2026-09-24 and 4b and is not
attributable from this branch. Re-measure; do not subtract these.

### `consumeAmount` and `targetUnit` — both helpers default to the product values

`FixtureItem` (`e2e/helpers/fixture.ts`) takes both as optional fields. **An omitted
field gives the same item in both modes:**

| Field omitted | Both helpers seed | Matches |
|---|---|---|
| `consumeAmount` | `1` | `createItem` (`consumeAmount ?? 1`), Prisma `@default(1)`, Dexie v16 + v17 |
| `targetUnit` | `'package'` | `createItem` (`targetUnit ?? 'package'`) |

**The field exists on `FixtureItem` so a spec can ask for something else** — a
`'measurement'` item, or a step other than 1. It is not there to paper over a difference
between the modes; there is none.

`seedLocalFixture` used to omit the key entirely, which produced `undefined` — a state
the app never creates. `createItem` defaults to 1, the Dexie v16 upgrade backfills
`undefined` to 1, and v17 backfills 0 and every non-finite value to 1. `seedCloudFixture`
already hardcoded `1` and `'package'`, so **cloud was right and local was the odd one
out.** Fixed 2026-09-24.

**Do not seed `consumeAmount: 0`.** `ItemForm.tsx` line 342 is
`consumeAmount <= 0 ? t('validation.positiveNumber') : undefined`, so a 0 opens the form
with a validation error. For about 24 hours (2026-08-23 to 2026-08-24) both create paths
did default to 0, meaning "unconfigured". The designer reversed that on 2026-08-24 — a new
item must be valid by nature — and the Dexie v17 upgrade migrates those rows to 1.

`consumeAmount` also drives `quantityStep` (`ItemForm.tsx` line 355), which becomes the
`step` attribute of three number inputs (Unpacked line 802, Target Quantity line 921 while
`targetUnit === 'measurement'`, Refill When Below line 956).

Do **not** write that `step` makes a decimal-input test pass. `step` affects validity and
the spinner, not the text the browser keeps while the field has focus. The rounding
`consumeAmount` drives is `roundToStep`, passed as `normalizeOnBlur` (`ItemForm.tsx` lines
277-280 and 806-809), and it runs only on blur.

**`item-stock-input.spec.ts`'s decimal test reaches that rounding since 2026-09-25 (issue
#318).** It used to type `2.5`, assert the text while the field was still focused, and
stop. That version was green at `consumeAmount: 0` and at `1`, and green under both source
mutations measured on 2026-09-24 — including the whole pre-`2fe372a1` shape, the bug the
file exists to guard. It now presses `Tab` as well and asserts the field settles to `3`,
because `roundToStep(2.5, 1)` is `3` — `roundToStep` rounds to the step's decimal places,
not to a multiple of it (`apps/web/src/lib/quantityUtils.ts` line 14).

Measured 2026-09-25 in the `cloud` project, with `normalizeOnBlur` unwired at the Unpacked
call site (`ItemForm.tsx` line 809):

| Spec version | Result |
|---|---|
| before issue #318 | **3 passed** — the rounding never ran, so nothing could see it go |
| after | **1 failed**: `expect(locator).toHaveValue(expected) failed / Expected: "3" / Received: "2.5"` |

So that test now depends on the fixture's `consumeAmount: 1`. It is still not a `step`
test.

### `amountPerPackage` — a spec that asserts a packed total must set it

`FixtureItem` (`e2e/helpers/fixture.ts`) carries an optional `amountPerPackage`, added
2026-10-08 for issue #336 and threaded through **both** seeders:
`seedCloudFixture` writes `item.amountPerPackage ?? null`, and `seedLocalFixture` omits the
key when the field is `undefined` (`Item.amountPerPackage` is optional in Dexie, so an
explicit `undefined` is not the same as an absent key).

**Set it whenever a spec asserts a packed total.** `getPackedTotal`
(`apps/web/src/lib/quantityUtils.ts`) returns the plain sum `packedQuantity +
unpackedQuantity` when `amountPerPackage` is unset or 0, and `packedQuantity +
unpackedQuantity / amountPerPackage` when it is set. **So a fixture that omits it cannot
tell the conversion from the plain sum, and a test of the conversion passes against code
that does not convert.** A non-zero `unpackedQuantity` is needed too, for the same reason.

`e2e/tests/location-scoped-writes.spec.ts` is the only spec using it today. It needed a
**second** fixture, `PACKED_FIXTURE`, rather than an edit to the shared `FIXTURE`: `FIXTURE`
has no `amountPerPackage` and `unpackedQuantity: 0` at both locations, and editing it would
have changed the numbers the file's other tests assert.

The field is **global item configuration**, so `ItemStockInput` has no place for it. It has
to be written with the item.

**Known gap: no local fixture sets it yet**, so `seedLocalFixture`'s pass-through has no
test. The one spec that uses the field is cloud-only.

### Location order is assigned differently in the two modes — keep the default first

| Helper | How it assigns `order` |
|---|---|
| `seedLocalFixture` | `order: index` for **every** location, default included (`localSeed.ts` line 50) |
| `seedCloudFixture` | never creates the default — it reads back the one `ensureDefaultLocation` made at `order: 0` and `continue`s past `isDefault` entries in its creation loop (`cloudSeed.ts` line 106). `createLocation` appends `maxOrder + 1`. |

So only the relative order of the **non-default** locations follows the array in cloud.
Moving the default entry elsewhere in the array is **invisible in cloud** and changes the
page order in local. Measured on 2026-09-24 with `item-stock-pager.spec.ts`: default moved
to the middle gave cloud **4 passed, 1 skipped — unchanged**, and local **1 failed**
(`Previous location` expected disabled, received enabled — the pager opened on page 2).

A fixture that does not list the default first therefore makes the two modes test
different page orders, and only local reports it. **Keep the default location first.**

### `e2e/helpers/stockReadback.ts` — mode-aware stock readback

A cloud run has no IndexedDB. `readRows(page, 'itemStocks')` returns `[]` there, so any
assertion built on it is vacuous — it passes against every implementation.

Use `readStocksForItem(page, request, baseURL, itemId)` or
`readStockAt(page, request, baseURL, itemId, locationId)` instead. Local reads IndexedDB
and filters by `itemId`; cloud queries `itemStocksForItem(itemId)`, the same query the
Stock-tab pager uses (`apps/web/src/hooks/useItemStocks.ts`). Both return the same
`StockRow` shape, because the Dexie row and the GraphQL type use the same key names.

Reach for it in any dual-mode spec that asserts on stock rows rather than on rendered
text. `item-stock-input.spec.ts`, `item-stock-pager.spec.ts` and the two import/export
specs are the users today.

`readLocations(page, request, baseURL)` joined it on 2026-10-04 (cloud locations PR 4b
task 8) and branches the same way: local reads the `locations` store, cloud runs the
`locations` query. **Look a location up by NAME, never by id.** The ids differ between the
modes on purpose — the local default is the `'local'` sentinel, a cloud default is a
server-generated cuid, and the import remap rewrites the payload's default onto whichever
one the destination holds.

### `e2e/helpers/backupAssertions.ts` — the import/export location checks, written once

`import-export-local.spec.ts` and `import-export-cloud.spec.ts` each have their own
`verifyRelations`. The two had **already drifted** — the local copy grew a seventh check for
the shelf that the cloud copy never got — and **neither asserted a location or a quantity at
all**. So every imported item could land in the wrong location, or in NO location, and both
specs still passed. Cloud locations PR 4b made that dangerous: its task 6 deleted
`mirrorStockToDefaultLocation`, the server mirror that used to stock every imported item at
the caller's default location and so hid exactly this failure.

The new checks therefore live in **one** module, not a third copy:

| Export | What it asserts |
|---|---|
| `expectFixtureLocations` | three locations, exactly one default, and that one's name |
| `expectFixtureStockPerLocation` | one stock row per location, each with its own quantities |
| `expectStockNotCollapsedOntoDefault` | the two non-default rows are not sitting on the default |

**Both fixtures describe the same three locations under the same names, with the same three
different quantities.** `e2e/fixtures/local-backup.json`'s default id is the `'local'`
sentinel; `cloud-backup.json`'s is `aaaaaa000000000000000010`. Only the ids differ, so a
fixture resolves a location by name and each direction exercises the remap.

**Do not make those quantities equal, and do not drop to one location.** With one location,
"the location the payload named" and "the caller's default" are the same id; with equal
numbers, "each row kept its own location" and "every row landed on the default" give the
same answer. Either way no assertion in this module can fail.

**The backup's default-location NAME does not survive the import the UI runs, in either
mode.** `ImportCard.tsx` line 111 runs the **`skip`** strategy whenever the payload raises no
conflict, and `skip` means "add what is missing, change nothing that is already there". The
remap has put the backup's default row on the id the destination already holds, so that row
is always the one `skip` leaves alone: local filters it out by `existingIds`, cloud's
`bulkCreateLocations` skips a taken id. Measured 2026-10-04 — a backup whose default was
called "Fixture Home" came back as `[ "Fixture Cabin", "My Home", "Fixture Office" ]` in
both projects. That is why `DESTINATION_DEFAULT_LOCATION_NAME` exists and why the default's
expected name is a parameter rather than a constant in the fixture.

**Reading a cart row's `locationId` COLUMN needs `cartItemCountByItem(itemId, locationId:)`.**
The `Cart` GraphQL type (`apps/server/src/schema/cart.graphql`) exposes `id` and
`lastPurchasedAt` and nothing else, so there is no `locationId` field to select. That query
resolves through `where: { itemId, userId, cart: { locationId } }`, so it reads the column
rather than parsing the id string — which is the whole difference between "the client sent
the right id" and "Postgres wrote the right column".

**A cloud seed must write stock of its own.** `import-export-cloud.spec.ts`'s own
`seedCloudFixture` wrote items and no `ItemStock` rows, and relied on the server mirror. With
that mirror gone both of its tests failed on `getByRole('heading', { name: 'Fixture Item',
level: 3 })`, "element(s) not found" — the item was in the catalog and in no location. See
"A seed that writes an item must also write its stock" above; the same rule applies to a
spec's private seed, not only to `helpers/cloudSeed.ts`.

### The three group specs are NOT location coverage

`shelves.spec.ts`, `vendors-group.spec.ts` and `recipes-group.spec.ts` seed **one**
location. With one location, "count items stocked here" and "count every item" return the
same number, so no location-scoping mutation can go red in them.

They exist to cover badge and total maths — the `N empty` / `N low stock` badges and the
packed total — which had **no** cloud coverage at all before 2026-09-24. Do not count them
toward location coverage. That is what `location-not-stocked-here.spec.ts` and
`location-scoped-writes.spec.ts` are for.

`item-stock-pager.spec.ts` is different: it seeds several locations, and its scoping
mutation did go red.

## Page objects show as steps — call `withSteps(this)`

Since 2026-09-29 every page object ends its constructor with `withSteps(this)`
(`e2e/pages/step.ts`). It wraps each `async` method in `test.step`, so the HTML report —
which non-developers read on the living spec site — shows `Check recipe "Pasta"` instead
of raw locator calls.

- **A new page object must call it too.** Without it, the class still works, but its
  actions vanish from the report.
- **The method name becomes the step name.** `addItemToCart('Milk')` shows as
  `Add item to cart "Milk"`. Name methods as actions a reader understands.
- **String, number and boolean arguments go into the name.** A seed id shows as a raw
  string (`Navigate to "a11y-pager-item"`). Locators and objects are left out.
- **Keep `get…` methods synchronous.** Only `async` methods are wrapped. A sync method
  that returns a `Locator` is left alone; wrapping it would make it return a `Promise`.
- **Create page objects only inside a test or hook.** `test.step` throws anywhere else.
- Arrow-function fields and methods inherited from a parent class are not wrapped.

`SPEC_REPORT=1` (set by `pnpm spec:publish`) turns on `screenshot: 'on'` in the top-level
`use` of `playwright.config.ts`, so every test in the published report has a screenshot.
Normal runs keep `'off'`.

## Nothing lints or type-checks `e2e/`

`pnpm lint` and `pnpm check` scan `apps/web` only, and there is no root `biome.json`.
`pnpm build` does not cover `e2e/` either. The verification gate in root `CLAUDE.md`
therefore says nothing about this directory.

To type-check a file you edited, write a temporary `tsconfig` and run `tsc --noEmit`.
**Scope `include` to the files you are editing.** Four files carry pre-existing errors
that will drown yours:

| File | Pre-existing errors |
|---|---|
| `e2e/playwright.config.ts` | 2 × `TS2580` (no `@types/node`) |
| `e2e/tests/a11y.spec.ts` | 63 × `TS2559` on `AxeOptions` |
| `e2e/tests/settings/import-export-cloud.spec.ts` | 3 × `TS2307` on `node:fs`, `node:path`, `node:url` (no `@types/node`) |
| `e2e/tests/settings/import-export-local.spec.ts` | 4, same cause |

Counts measured 2026-09-29; **74 errors in total** across `e2e/`. The a11y figure was
**39** when this table was written; the file has grown since. The exact error CODES also
depend on the tsconfig you write — `TS2580` and `TS2591` are the same missing-`@types/node`
problem reported under different module settings.

**Do not trust any number here.** Take your own baseline first: run `tsc` on the unchanged
files, keep the output, then diff it against the run after your edit. Root `CLAUDE.md`
makes this a rule, because subtracting a written count has twice produced invented
failures.

Tracked as issue #322 — nothing lints or type-checks this directory, so none of these 74
errors is reported by any command in the verification gate.
