# Plan — households H4, import and export

Design: [2026-10-04-households-design.md](2026-10-04-households-design.md), sections *Import and
export*, *Authorization*, *Local mode* and *Known gaps and risks*.
Phase plan: [2026-10-31-households-plan.md](2026-10-31-households-plan.md) (the *H4 — Import and
export* outline, and decision H12 in the [H3a plan](2026-11-04-households-plan-h3a.md)).
The two plans before this one, with their *What this plan got wrong* tables:
[H3c-2](2026-11-16-households-plan-h3c-2.md) and [H3b](2026-11-14-households-plan-h3b.md). Read
both tables first.

Branch `feature/households-h4`, worktree `.worktrees/feature-households`, from `develop` at
`28e84d91` (after #380), plus the docs commit `dbd1eb73`. The PR goes into `develop`. Nothing
deploys until a checkpoint release.

Task numbers are `E.n`, so they are not confused with H3a's `3.n`, H3b's `B.n`, H3c's `C.n` /
`D.n`, or the decision numbers.

**Goal:** an import writes only into the importer's own household, only an owner or a manager
can import, and a refused import writes nothing at all. Every id in a file is kept, except the
local default location, which goes where the user picks. An export holds the catalog and the
locations the exporter has a role on, in the active household only.

**Execution:** `superpowers:subagent-driven-development`. One fresh subagent per task, a review
between tasks, the full gate after each task (root `CLAUDE.md`, *Verification Gate*), and
`pnpm test:e2e:all` once at the end. Every brief passes down the plain-English rule, the report
structure, and asks what this plan got wrong.

## What the user gets

Once merged **and deployed**:

- **Copying local data into cloud asks "Import into which location?"** The household's first
  location ("Home" for most people) is selected. **New location** is also offered. Today the
  local "My Home" lands on the first location with no question.
- **Importing a backup that names rows of another household is refused, and nothing is
  written.** Today the refusal comes per batch of 50 rows, so the rows sent before the refused
  batch stay written, and the message "Nothing was imported" is not true.
- **The message says "another household"**, not "another account".
- **A manager sees only "Skip conflicts" and "Replace matches".** "Clear & import" is for the
  owner only. A household member cannot import at all (see decision O1).
- **A location in the file where the importer has only a viewer role, or no role, is skipped,
  and the importer is told which ones.** Today the whole import fails with `Forbidden`.
- **Copying cloud data to local mode puts the ACTIVE location into local "My Home".** Today the
  first location by order goes there.

Until H5 (invites) every person is alone in their household, so the role gate and the skipped
locations cannot happen to a real user yet. The dialog and the new messages are visible at once.

## What the developer gets

- **One scope for every import check: the target household.** `requireOwnRowOrUnclaimed` takes
  the target household id. `InventoryLog` is checked through its location, like `Cart` and
  `CartItem`. No import check reads `userId` any more.
- **`fallbackImportLocation` is deleted** (decision H12 is closed). No import row is put into a
  location the user did not choose.
- **Issue #381 is fixed:** a person in two households cannot attach one household's item to the
  other household's location through an import, and `createVendor` cannot put its cart in the
  other household. Both are tested with one user in two households.
- **Issue #361 is fixed:** a cart id must start with `${locationId}:`, and the location check
  runs before anything looks the id up.
- **Honest comments:** the "ids are `cuid()`" argument and the "nine models that belong to no
  location" wording are corrected in `lib/authz.ts` and root `CLAUDE.md`.
- **Costs:**
  - One new GraphQL query (`importCheck`) and one new web component (the location dialog), each
    with tests and, for the component, stories.
  - An import makes one or more extra requests before it writes (the check, in chunks of 1000
    ids).
  - The local → cloud copy has one more step for the user (the dialog).
  - A **deploy-order window** (decision T9): a new web bundle against an old server cannot
    import, because the old server has no `importCheck`.
  - About six E2E specs change, and one new cloud spec joins.

## Facts this plan is built on (checked 2026-11-16 at `dbd1eb73`)

Line numbers drift. Each task re-reads the code before it trusts a line here.

| Fact | Where |
|---|---|
| `requireOwnRowOrUnclaimed(ctx, model, id)`: catalog models check `{ id, householdId: await requireHousehold(ctx) }`; `cart` / `cartItem` check `locationIdsWithRole(ctx, 'participant')` across **every** household; `inventoryLog` still checks `{ id, userId }` | `apps/server/src/lib/authz.ts:369`, body `:394–429`, `cartRowAtWritableLocation` `:430` |
| For a cart, the unscoped `findUnique({ where: { id } })` runs FIRST, then the location check | `authz.ts:378–388` |
| The comment says "What protects the ids is that they are `cuid()` and cannot be guessed" | `authz.ts:413–420`. Also root `CLAUDE.md`, *Authorization (cloud)* |
| `OwnedModel` is documented as "nine models that … belong to no location". `Cart`, `CartItem` (through its cart) and `InventoryLog` all have a location | `authz.ts:236–249`, `:326`; root `CLAUDE.md` |
| Only `Cart.id` has no `@default(cuid())`. Every imported row keeps the id in the file: `crypto.randomUUID()` from local mode (`apps/web/src/db/operations.ts:76` and others), a server cuid from cloud, or anything at all in a hand-edited file. The local default location's id is the fixed string `'local'` | `apps/server/prisma/schema.prisma:157`; `apps/web/src/db/index.ts:323` |
| `cartIdFor` / `parseCartId` live in `@p1i/types`. `parseCartId` splits on the FIRST colon, so a location id with a `:` makes a cart id ambiguous. `LocationInput.id` is stored verbatim | `packages/types/src/index.ts:163`, `:175`. (Issue #361 still names `apps/server/src/lib/cartId.ts`, deleted by `chore/build-shared-types`) |
| `fallbackImportLocation(ctx)`: the caller's first writable location; called from `resolveLogLocations` and `resolveCartLocations` | `authz.ts:180`; `import.resolver.ts:92`, `:219` |
| `resolveCartLocations` sends a cart whose named location does not exist to the fallback location, but KEEPS the cart id. So a stored cart can have an id whose prefix is not its `locationId` | `import.resolver.ts:240–258`, and the create at `:1340` |
| `requireOwnLocationIdsOrUnclaimed` THROWS for an existing location where the caller lacks the role (design says: skip and tell) | `import.resolver.ts:348–371` |
| Gap 1 of #381: `requireOwnItemStockRefs` checks the item against `requireHousehold(ctx)`; the two log imports check the item against the caller's `householdId` | `import.resolver.ts:526`, `:538`; `:1273`, `:1755` |
| Gap 2 of #381: `createVendor` runs `requireCatalogRole` and `requireLocationRole`, but never checks the location is in the catalog's household | `apps/server/src/resolvers/vendor.resolver.ts:35–70` |
| No bulk import mutation checks a household role. Only `clearAllData` does (`owner`) | `import.resolver.ts:2321`; the comment at `:928–931` says role gating is H4 |
| Guard counts: 18 × `requireOwnRowIdsOrUnclaimed(ctx`, 2 × `requireOwnLocationIdsOrUnclaimed(ctx`, 2 × `requireOwnItemStockRefs(ctx` | measured with the three `grep -c` lines in root `CLAUDE.md` |
| Six direct calls of `requireOwnRowOrUnclaimed` outside imports: `vendor.resolver.ts:77`, `:98`; `tag.resolver.ts:68`, `:87`, `:128`, `:152` | `git grep -n "requireOwnRowOrUnclaimed(ctx"` |
| Imports publish live events in `finally` (`withCatalogEvent` `:887`, `publishChange` for stock, log and cart imports). The guard test has every `Mutation` field in `publishes` | `import.resolver.ts`; `apps/server/src/resolvers/live-publish.guard.test.ts:52`, `:156` |
| Web: the resume key is already `${mode}:${entityType}:${i}` (#330, fixed by #350) | `apps/web/src/lib/importData.ts:2524` |
| Web: PR 4b's remap rule — `findPayloadDefaultLocationId` `:444`, `buildLocationRemap` `:505`, `applyLocationRemap` `:558`, `fetchCloudDefaultLocationId` `:625`, `prepareCloudPayload` `:703`. On `clear` the payload is prepared AFTER `clearAllData` (`:2640–2668`) | `apps/web/src/lib/importData.ts` |
| Web: a refused batch throws, but the batches already sent stay written. The comment at `:2160–2180` says a pre-write id check "needs a new GraphQL query, so it is a separate PR" | `importData.ts` |
| Web: entity order is tagTypes, tags, vendors, locations, items, itemStocks, recipes, inventoryLogs, shoppingCarts, cartItems, shelves | `importData.ts:2203–2460` |
| Web: the three refusal strings say "another account" / "另一個帳號" | `apps/web/src/i18n/locales/en.json:702`, `:717`, `:718`; `tw.json` same lines |
| Web: the caller's household role is already on `GetHousehold` (`household { id name role }`) | `apps/web/src/apollo/operations/household.graphql` |
| Web: `ImportCard` offers skip / replace / clear to everyone; `ConflictDialog` has three buttons | `apps/web/src/components/settings/ImportCard/ImportCard.tsx:229–244`; `ConflictDialog.tsx` |
| Web: the cloud → local copy (`doSwitch`, `doSignOut`) passes the LOCAL active location, used only for a legacy file. Its comment says a cloud export "still carries stock inline" and sends no `itemStocks`. That is stale since PR 4b | `apps/web/src/components/settings/DataModeCard/DataModeCard.tsx:78–122` |
| The export reads `inventoryLogs`, `allCarts`, `allCartItems`, `allItemStocks` and `locations` use `locationIdsWithRole(ctx)` with no household filter, so after H5 they would include a second household's locations | `inventoryLog.resolver.ts:80`, `cart.resolver.ts:206`, `itemStock.resolver.ts:100`, `location.resolver.ts:44` |
| `ensureHousehold` picks the household with `findFirst({ where: { userId } })` and no `orderBy`. With two households the answer is not fixed. Tests must set it through `ctx.requestCache.householdId` | `apps/server/src/lib/household.ts:134` |
| The server JSON body limit is 1 MB | `apps/server/src/index.ts:50` |
| E2E: `addHouseholdMember` adds a household role and location roles, but refuses a member already in a household (409). So no E2E spec can put ONE user in TWO households | `apps/server/src/lib/e2eHouseholds.ts`; `e2e/helpers/cloudUsers.ts:128` |
| E2E specs that exist: `settings/import-export-cloud.spec.ts`, `settings/import-export-local.spec.ts`, `settings/import-strategies.spec.ts`, `settings/data-mode-migration.spec.ts`, `cart-id-cross-user-leak.spec.ts` (imports a BARE `'no-vendor'` cart id) | `e2e/tests/` |

## Decisions made in this plan

### Technical decisions

| # | Decision | Why |
|---|---|---|
| T1 | **A new read-only query, `importCheck`, runs before the first write** (and before `clearAllData`). It takes the file's ids per model and returns `{ anotherHousehold: Boolean!, blockedLocationIds: [ID!]! }`. When `anotherHousehold` is true the web stops: nothing is written. `blockedLocationIds` are locations of the target household where the caller is below `participant`; the web drops them and their rows, and says so after the import | Design rule 2 says "Nothing is written". The per-mutation guards cannot give that: the web sends about 11 entity types in batches of 50, and each mutation is checked alone. The comment at `importData.ts:2176` already names this query as the fix |
| T2 | **The per-mutation guards stay.** `importCheck` is a convenience for the web, not a check the server trusts | A client can skip `importCheck`. Two imports can also run at the same time |
| T3 | `importCheck` takes ids in chunks of at most **1000** per call. The web unions the answers | The server's JSON body limit is 1 MB |
| T4 | **`requireOwnRowOrUnclaimed(ctx, model, id, targetHouseholdId)`** — the target household becomes an explicit fourth argument. The import helper and the six tag / vendor call sites pass the id `requireCatalogRole` returned | The design asks for "the **target** household". Today it is `requireHousehold(ctx)`, which is not a fixed answer once a person has two households. An explicit argument is what H7's household switch will fill in. The call sites change mechanically; their behaviour does not |
| T5 | New scopes in that body: catalog `{ id, householdId: target }`; `InventoryLog` `{ id, locationId: { in: writable } }`; `CartItem` `{ id, cart: { locationId: { in: writable } } }`, where `writable = locationIdsWithRole(ctx, 'participant', { householdId: target })`. `Cart`: see T6 | Design table in *Authorization*. `InventoryLog.userId` stays as the AUTHOR and is never a scope again |
| T6 | **`Cart` (#361):** parse the id. No colon → `BAD_USER_INPUT`. Prefix not in `writable` → `FORBIDDEN`, **before** any lookup of the cart id. Only then the unscoped "is the id taken" read, and "own" means `{ id, locationId: prefix }` | A caller with no role on the location never learns whether a cart id is free or taken (design, *Authorization*, first bullet) |
| T7 | `locationIdsWithRole(ctx, role, { householdId })` gets an optional household filter. New helper **`requireLocationInHousehold(ctx, locationId, householdId)`**: one scoped `location.findFirst({ where: { id, householdId } })`, `FORBIDDEN` when null | Root `CLAUDE.md` forbids `row.householdId === …` at a call site. The comparison happens in SQL, inside `lib/authz.ts` |
| T8 | **Role gate:** every one of the 22 bulk mutations and `importCheck` starts with `requireCatalogRole(ctx, 'manager')`, which also returns the target household. `clearAllData` keeps `owner`. `importCheck` takes `forClear: Boolean` and asks `owner` when it is true | Design, *Import: owner and manager only*, and Decision 27 |
| T9 | **Deploy order:** the server must be live before the web bundle that calls `importCheck`. H4's runbook section says so. If H4 ships in the same checkpoint as H3a (which needs web before server), the import is broken for the minutes between the two deploys, and the runbook says that too | An unknown query fails GraphQL validation. The import is the only thing that breaks; no data is written by a refused import |
| T10 | **`fallbackImportLocation` is deleted.** A log with no `locationId` → `BAD_USER_INPUT` (code `IMPORT_NEEDS_LOCATION`). A bare cart id → `BAD_USER_INPUT`. `InventoryLogInput.locationId` stays OPTIONAL in the schema (only its comment changes) | The web now always sends a location (the dialog picks one). Making the field required would fail a cached old bundle's whole document; a clear `BAD_USER_INPUT` is a smaller break |
| T11 | **`resolveCartLocations` loses its unscoped `location.findUnique`.** A named location that does not exist is refused with `FORBIDDEN`, like any location without a role | Locations are now always uploaded before carts (entity order), so a missing location means a hand-edited file. This also removes the "ACCEPTED COST" oracle its comment describes |
| T12 | The two location imports refuse an id equal to `'local'`, or containing `:`, with `BAD_USER_INPUT` | `'local'` is every local install's default id; the first account to upload it would own it for everybody. A `:` breaks `parseCartId` |
| T13 | **Location-scoped import rows (stock, logs, carts, cart items) must sit at a location of the target household** (`requireLocationInHousehold`), and their item is checked against the target household. That closes #381 gap 1 | With the location in the target household, "the caller's household" and "the location's household" are the same one, so the item check cannot be wrong. The test still needs one user in two households |
| T14 | `createVendor` adds `requireLocationInHousehold(ctx, locationId, householdId)` after `requireLocationRole` (#381 gap 2) | Same helper, same refusal |
| T15 | **The five reads behind the export get the household filter:** `locations`, `inventoryLogs`, `allCarts`, `allCartItems`, `allItemStocks` use `locationIdsWithRole(ctx, role, { householdId: await requireHousehold(ctx) })` | Design: cloud → local copies "what the user can read in the **active** household". Without it, after H5 an export of household A would hold B's locations, and importing that file back into A would be refused as "another household". `locations` is also the switcher, which is the right list for it too (catalog and locations of one household) |
| T16 | The remap becomes one small function, `placeDefaultLocation(payload, targetLocationId)`: the id `'local'` → the chosen location, in the same five fields as today's `applyLocationRemap` (location rows, stock, logs, cart ids, cart item cart ids). A file with no locations is upgraded with `upgradeLegacyPayload(payload, targetLocationId)`. `buildLocationRemap`, `findPayloadDefaultLocationId` (cloud side), `fetchCloudDefaultLocationId` and `prepareCloudPayload` are deleted | Design rule 1: keep every id except case 3. When the local "My Home" row lands on an existing location id, `bulkCreateLocations` skips it (an own row), so the existing location keeps its name |
| T17 | **Errors on the web:** a `FORBIDDEN` from `importCheck` means the role gate (new key `settings.import.importErrorRole`); `anotherHousehold: true` and a `FORBIDDEN` from a bulk mutation mean "another household" (`importErrorForbidden`); `importErrorForbiddenAfterClear` stays for the race where the refusal comes after the clear | The role refusal and the id refusal share the code `FORBIDDEN`. The web can tell them apart only by which call failed |
| T18 | Local mode: no role checks, no `importCheck`, nothing in `apps/web/src/db/` changes. `importLocalData` gets an option `homeLocationId`: the payload location that becomes local "My Home". The cloud → local copy passes the cloud ACTIVE location. A cloud backup FILE imported in local mode keeps today's rule (O4) | Design, *Copying between local and cloud* and *Local mode* |

### Decisions that need the owner's OK

The design leaves these open. Each is a default the plan will build unless the owner says
otherwise. They are also listed in the report.

| # | Question | Recommended default **(needs owner OK)** |
|---|---|---|
| O1 | What does a household **member** see on `/settings/household`? | `ExportCard` as today. `ImportCard` shows its title and the line "Only the owner or a manager can import data." with no file button |
| O2 | `clear` with a file that holds the local "My Home": where does it go? | No dialog. `clearAllData` leaves one location, the new "Home"; "My Home"'s rows go there. A dialog would offer only that one location anyway |
| O3 | Local → cloud copy into a household with only "Home": show the dialog anyway? | Yes, always show it, "Home" selected. One more tap, but the user always sees where the data goes |
| O4 | Local mode imports a cloud backup FILE (not the copy): which location becomes "My Home"? | Today's rule: the file's first location by `order`. The file does not record the active location |
| O5 | How is the importer told about skipped locations? | After the import finishes, a line in the import card: "Skipped, because you cannot edit them: Garage, Attic." Not a blocking dialog |
| O6 | "New location" in the dialog: what name does the field start with? | The name of the file's default location ("My Home"), editable. Created with the existing `createLocation` mutation before the import starts |
| O7 | A household **member** who is the organizer of a location: may they import into that location? | No, as the design says ("owner and manager only"). Recorded here because it may surprise |
| O8 | The new message texts | en: "Some rows in this file belong to another household, so the import was refused. Nothing was imported." (design text). tw: "檔案裡有些資料屬於別的家庭，所以匯入被拒絕了，沒有匯入任何資料". The other two keys change "account" → "household" (帳號 → 家庭) the same way |

## Rules every task brief must pass down

The eight rules in the phase plan apply: plain English, the report structure with "what did
this plan get wrong", Node 22.17.1, this worktree only, measure your own baseline,
mutation-check every new test, check commits with `git show`, and run the verification gate.
H3a's rules 9, 10 and 12 and H3b's rules 13–15 apply too. Copy all of them into every brief.

Three more for H4:

16. **Every scoping fixture has a second household.** A location or item of household B, and a
    caller who is a member of B as well as A where the test is about "target household". A
    one-household fixture cannot tell "the caller's household" from "the target household" or
    "the location's household" (issue #381 says this in its own words). Pin the target with
    `ctx.requestCache.householdId`, because `ensureHousehold` picks one of two households at
    random.
17. **A "nothing was written" test needs something that WOULD be written.** Every refusal
    fixture holds at least one new, unclaimed row next to the refused one. With only refused
    rows, "refused as a whole" and "refused row by row" give the same result.
18. **Do not touch a database.** Read-only data checks for the deploy (task E.7) are written
    as SQL in the runbook. The main session runs them, with the owner's consent.

## Task E.1 — `lib/authz.ts`: the target household

**Files:** `apps/server/src/lib/authz.ts`, `authz.test.ts`; the six call sites in
`tag.resolver.ts` and `vendor.resolver.ts`; `import.resolver.ts` (`requireOwnRowIdsOrUnclaimed`
only); `catalog-ownership.resolver.test.ts`, `import-ownership*.resolver.test.ts` where they
call the helper; the fakes if a new `where` shape needs them (`ownedRowFake` `columns`,
`cartFake`).

1. `locationIdsWithRole(ctx, role, options?: { householdId?: string })` (T7). With a
   household, the `where` adds `location: { householdId }` next to the decision H18 filter.
2. `requireLocationInHousehold(ctx, locationId, householdId)` (T7).
3. `requireOwnRowOrUnclaimed(ctx, model, id, targetHouseholdId)` with the scopes of T5 and the
   cart order of T6. Update `requireOwnRowIdsOrUnclaimed` and the six direct call sites.
4. Rewrite the comments: the "cuid" paragraph (it is true for row ids made by the server or by
   `crypto.randomUUID()`; it is NOT true for `Cart.id`, which is derived, nor for an id a
   hand-edited file chooses; for carts the protection is now the location check that runs
   first), and "belong to no location" (say: "that `requireLocationRole` alone cannot decide,
   because an import must tell a free id from a taken one").
5. Tests, each with one user in households A and B and a stranger household C:
   - catalog row of B, target A → `FORBIDDEN`; target B → `'own'`.
   - `InventoryLog` at a location of A where the caller is `viewer` → `FORBIDDEN`; at a
     location of B where the caller is `organizer`, target A → `FORBIDDEN`; same, target B →
     `'own'`. A log another member WROTE (other `userId`) at a writable location → `'own'`.
   - `Cart` with a bare id → `BAD_USER_INPUT`; with a prefix of C's location → `FORBIDDEN`
     and the cart table is NOT read (spy on `cart.findUnique`); a stored cart whose `locationId`
     differs from its prefix → `FORBIDDEN`.
   - `CartItem` in a cart at B's location, target A → `FORBIDDEN`.
   - `requireLocationInHousehold`: B's location, household A → `FORBIDDEN`.
6. **Mutation checks** (copy the green file aside first):
   - In the catalog branch, replace `targetHouseholdId` with `await requireHousehold(ctx)` →
     the "target A, row of B" test goes red (only when `requestCache` pins B as the caller's
     household; write the fixture that way).
   - Drop `{ householdId }` from the `writable` call for `InventoryLog` → the "organizer in B,
     target A" log test goes red.
   - Move the cart `findUnique` above the prefix check → the "cart table is not read" test goes
     red.
   - Drop `locationId: prefix` from the cart "own" `where` → the mismatched-prefix test goes red.
7. Gate. No behaviour change is visible to a one-household user, so every existing test must
   stay green. Report any that did not.

## Task E.2 — the `importCheck` query, end to end

**Files:** `apps/server/src/schema/import.graphql`; `import.resolver.ts` (a new `Query` part)
or a new `importCheck.resolver.ts`; resolver index; a new `import-check.resolver.test.ts`;
`apps/web/src/apollo/operations/import.graphql`;
`apps/web/src/lib/importData.ts` (a `checkImportIds(client, payload, { forClear })` function,
with tests in `importData.test.ts`). **Schema and web document in ONE commit** (codegen is
all-or-nothing).

1. Schema:
   ```graphql
   input ImportCheckInput {
     items: [ID!]  tags: [ID!]  tagTypes: [ID!]  vendors: [ID!]  recipes: [ID!]  shelves: [ID!]
     locations: [ID!]  inventoryLogs: [ID!]  carts: [ID!]  cartItems: [ID!]  itemStocks: [ID!]
   }
   type ImportCheck {
     anotherHousehold: Boolean!
     blockedLocationIds: [ID!]!
   }
   extend type Query { importCheck(ids: ImportCheckInput!, forClear: Boolean): ImportCheck! }
   ```
2. Resolver: `requireCatalogRole(ctx, forClear ? 'owner' : 'manager')` gives the target (T8).
   One unscoped query per model, `where: { id: { in } }`, selecting only `id` and the scope
   (`householdId`, or `locationId`, or for cart items the cart's `locationId`). Cart ids also
   count their PREFIX location. A row is "another household" when its household is not the
   target. A location of the target where `locationIdsWithRole(ctx, 'participant', { householdId:
   target })` does not include it goes to `blockedLocationIds`. Refuse more than 1000 ids in one
   call with `BAD_USER_INPUT` (T3).
3. No live event: it is a query. The guard test reads `Mutation` fields only; confirm it stays
   green and its count is unchanged.
4. Web: `checkImportIds` chunks the ids (1000 per call), unions the answers, and returns
   `{ anotherHousehold, blockedLocationIds }`. Not called yet by the import flow; E.4 wires it.
5. Tests (server), fixture with households A (target) and B, the caller a member of both, plus
   stranger C:
   - an id of B's item → `anotherHousehold: true`; the same file with only A's and unclaimed
     ids → `false`.
   - a cart id whose prefix is C's location, with no cart row yet → `anotherHousehold: true`.
   - a log at A's location where the caller is `viewer` → that location in `blockedLocationIds`,
     `anotherHousehold: false`.
   - a household `member` → `FORBIDDEN`; a `manager` with `forClear: true` → `FORBIDDEN`.
   - 1001 ids → `BAD_USER_INPUT`.
6. **Mutation checks:** compare a location-scoped row's household to the CALLER's household
   (`requireHousehold`) instead of the target → the two-household test goes red; drop the
   prefix lookup for carts → the cart-prefix test goes red; ask `manager` when `forClear` is
   true → the clear test goes red.

## Task E.3 — the server import rules: role gate, no fallback, #381

**Files:** `import.resolver.ts`; `vendor.resolver.ts`; `authz.ts` (delete
`fallbackImportLocation`); `import.graphql` (comment on `InventoryLogInput.locationId` only); the
import test files (`import.resolver.test.ts`, `import-cart-location`, `import-inventoryLog-location`,
`import-itemStock`, `import-location`, `import-ownership*`); `authz.test.ts` (delete the
`fallbackImportLocation` block); a vendor test file; `stock-live-publish` /
`cart-live-publish` / `location-live-publish` / `catalog-live-publish` tests where an import
fixture used the fallback.

1. Role gate (T8): `const householdId = await requireCatalogRole(ctx, 'manager')` as the first
   check of all 22 bulk mutations. Pass it to `requireOwnRowIdsOrUnclaimed` and to every helper
   below. Re-count the three guard greps; they must still say 18 / 2 / 2.
2. `resolveLogLocations` (T10, T13): no fallback; a row without `locationId` →
   `BAD_USER_INPUT`, code `IMPORT_NEEDS_LOCATION`; each distinct location →
   `requireLocationRole(…, 'participant')` then `requireLocationInHousehold(…, householdId)`.
   The log's item is checked against `householdId` (now the location's household too).
3. `resolveCartLocations` (T10, T11): bare id → `BAD_USER_INPUT`; the prefix location →
   role + household check; no unscoped `location.findUnique`. Rewrite its long comment: the
   three "unclaimed" payload shapes it lists are now refused or handled by the web.
4. `requireOwnLocationIdsOrUnclaimed` (T12): refuse `'local'` and ids with `:`; an existing
   location of another household → `FORBIDDEN` (as now, through `requireLocationRole`); add
   `requireLocationInHousehold` so a location the caller holds in household B cannot be
   renamed by an import targeted at A.
5. `requireOwnItemStockRefs` (T13): each location → role + `requireLocationInHousehold`; each
   item → `{ id, householdId }` with the TARGET household. Closes #381 gap 1 for stock; step 2
   closes it for logs.
6. `createVendor` (T14): `requireLocationInHousehold(ctx, locationId, householdId)` after the
   role check, before any write. Closes #381 gap 2. Fix the comment at `vendor.resolver.ts:61–66`,
   which describes the gap.
7. Delete `fallbackImportLocation` and every comment that names it (`git grep -n
   fallbackImportLocation` must return nothing outside `docs/`).
8. Live events: check that no publish moved. A refused call writes nothing and publishes
   nothing, as before. `live-publish.guard.test.ts` stays green with the same field count.
9. Tests (rule 16 and rule 17 fixtures):
   - each of the 22 mutations refuses a household `member` with `FORBIDDEN` and writes nothing
     (a table-driven test is fine if every row calls the resolver); a `manager` passes.
   - **#381 gap 1:** the caller is in A (target) and B. A stock row and a log row at a location
     of B, item of A → `FORBIDDEN`, nothing written. A stock row at a location of A with an item
     of B → `FORBIDDEN` (stock) / skipped (log).
   - **#381 gap 2:** `createVendor` in A with a location of B → `FORBIDDEN`, no vendor and no
     cart row.
   - a log with no `locationId` → `IMPORT_NEEDS_LOCATION`, and the other new log in the same
     batch is NOT written.
   - a bare cart id → `BAD_USER_INPUT`; a cart prefix naming a location that does not exist →
     `FORBIDDEN`.
   - a location id `'local'` and `'a:b'` → `BAD_USER_INPUT`.
10. **Mutation checks:**
    - remove `requireCatalogRole(ctx, 'manager')` from `bulkCreateItems` → its member test red
      (and repeat for one location-scoped mutation, `bulkCreateInventoryLogs`).
    - remove `requireLocationInHousehold` from `requireOwnItemStockRefs` → the gap 1 stock test
      red; from `resolveLogLocations` → the gap 1 log test red. Name which line was removed.
    - remove it from `createVendor` → the gap 2 test red.
    - put the fallback back in `resolveLogLocations` (send a row with no location to any
      location) → the `IMPORT_NEEDS_LOCATION` test red.

## Task E.4 — the web: id rule, location dialog, role-aware import

**Files:** `apps/web/src/lib/importData.ts` (+ tests); a new
`apps/web/src/components/settings/ImportLocationDialog/` (`ImportLocationDialog.tsx`,
`index.ts`, stories, `.stories.test.tsx`, `.test.tsx`); `ImportCard.tsx` (+ tests, stories if
the API changes); `ConflictDialog.tsx` (an `allowClear` prop, + stories); 
`PostLoginMigrationDialog.tsx`, `usePostLoginMigration.ts` (+ tests); `en.json`, `tw.json`;
`apps/web/src/hooks/CLAUDE.md` and `apps/web/src/components/CLAUDE.md` (import parts).

1. `placeDefaultLocation` (T16) replaces the cloud remap. Delete the dead functions and their
   tests. Keep `${mode}:${entityType}:${i}` in `runBulkBatches` untouched; the
   `importData.test.ts` test that pins it must stay green.
2. `importCloudData(payload, strategy, client, { targetLocationId, onProgress, session })`.
   Order of work:
   1. `checkImportIds` (E.2) on the payload as it will be sent (after `placeDefaultLocation`).
      For `clear`, the default row is left out of the check (it goes to the new "Home") and
      `forClear: true` is passed.
   2. `anotherHousehold` → throw a typed error the card shows as `importErrorForbidden`.
      Nothing has been sent.
   3. Drop `blockedLocationIds` and every stock row, log, cart and cart item at them. Return
      the dropped location names for O5.
   4. Then the existing flow (`clear` → `clearAllData` → `placeDefaultLocation` onto the new
      "Home" (O2) → `bulkCreate`; `skip` / `replace` as today).
3. `ImportLocationDialog`: shown when the file has a location with id `'local'`, or has no
   `locations` key (decision rule 3). Lists the household's locations where the caller is
   `participant` or higher, the first one selected; a "New location" option with a name field
   (O6), created through the existing `createLocation` before the import. Not shown on `clear`
   (O2). Stories: default, with "New location" chosen, with a long location name.
4. `ImportCard` in cloud: read the role from `useHousehold()`. `member` → O1. `manager` →
   `ConflictDialog` with `allowClear={false}`. `owner` → as today. After a finished import with
   skipped locations → the O5 line. Errors per T17.
5. Post-login migration (local → cloud): the same dialog before the copy (O3). The E2E
   auto-import path (`migration-strategy` key) needs a way to pick the location; the task
   decides how (for example a `migration-target-location` key set by the spec) and writes it
   down.
6. i18n (O8): the three keys say "another household" in `en.json` and `tw.json`; new keys for
   the dialog, `importErrorRole`, the member line (O1) and the skipped line (O5).
7. Tests:
   - `placeDefaultLocation`: a local file → every `'local'` (location row, stock, log, cart id
     prefix, cart item cart id) becomes the target, other ids unchanged; a pre-v15 file → stock
     synthesised at the target; a cloud file with no `'local'` → unchanged.
   - `importCloudData`: `anotherHousehold: true` → **no** mutation sent at all (the mock
     records zero `bulk*` calls), with a file that also holds new rows (rule 17); a blocked
     location → its rows are not in any batch, the other location's rows are.
   - `ImportCard`: member sees no file button; manager's conflict dialog has no Clear button;
     a role refusal shows `importErrorRole`, an id refusal shows `importErrorForbidden`.
   - the dialog: first location pre-checked (assert the mechanism, not only the outcome).
8. **Mutation checks:**
   - send the batches before `checkImportIds` resolves → the "no mutation sent" test red.
   - stop dropping a blocked location's logs → the blocked-location test red.
   - pass `allowClear` as `true` for a manager → the manager test red.
   - map `'local'` in location rows but not in cart ids → the cart-id case red.

## Task E.5 — export scope and the cloud → local copy

**Files:** `location.resolver.ts`, `inventoryLog.resolver.ts`, `cart.resolver.ts`,
`itemStock.resolver.ts` (+ their tests); `DataModeCard.tsx` (+ tests); `importData.ts`
(`importLocalData`'s `homeLocationId`, + tests); `exportData.ts` only if needed.

1. The five reads (T15) filter by the caller's household.
2. `importLocalData(payload, strategy, { activeLocationId, homeLocationId })` (T18). The cloud
   → local copy (`doSwitch`, `doSignOut`) passes the cloud ACTIVE location as `homeLocationId`.
   A file import in local mode passes none, and the old "first by order" rule picks it (O4).
   Delete the stale comment at `DataModeCard.tsx:78–88`.
3. Tests:
   - each of the five reads: the caller has roles on a location of A and of B, household A →
     only A's rows. (Rule 16.)
   - the copy: a cloud payload with Home (order 0) and Garage (order 1), active Garage → Garage's
     stock lands on `'local'`, Home keeps its id.
4. **Mutation checks:** drop the household filter from `allItemStocks` → its test red; pass
   no `homeLocationId` from `doSwitch` → the copy test red (Home lands on `'local'` instead).
5. Local mode: run the local import tests unchanged. Nothing in `apps/web/src/db/` changes
   (H3a rule 11).

## Task E.6 — E2E

**Files:** a new `e2e/tests/settings/import-households.spec.ts` (cloud only: in `cloud`
`testMatch` and `local` `testIgnore`); `import-export-cloud.spec.ts`, `import-export-local.spec.ts`,
`import-strategies.spec.ts`, `data-mode-migration.spec.ts`, `cart-id-cross-user-leak.spec.ts`;
helpers (`backupAssertions.ts`, `cloudSeed.ts`, page objects for the dialog).

New spec, through `makeGql` where no browser is needed:

1. **Role gate:** a second user is added as household `member`, then as `manager` (two tests,
   two users). The member's `bulkCreateItems` → `FORBIDDEN`, item count unchanged. The
   manager's passes. `importCheck(forClear: true)` as manager → `FORBIDDEN`.
2. **Refusal, nothing written:** user B imports, in the browser, a file that holds user A's item
   id AND a new item. The page shows the "another household" message. B's items are read back:
   the new item is NOT there. A's item keeps its name.
3. **Location dialog:** a local backup into cloud. The dialog is visible and the first location
   is checked. The test picks the second location; the stock is read back
   (`e2e/helpers/stockReadback.ts`) at that location. A second test picks "New location".
4. **Blocked location:** owner A shares location "Garage" with manager M as `viewer`. M imports a
   file with stock at Garage and at M's own location: Garage's rows are skipped, the other rows
   land, and the skipped line names Garage. If the browser cannot run as M (the browser user is
   fixed, and `addHouseholdMember` refuses a user already in a household), do it through
   `makeGql` + the web function, and say so in the report.

Existing specs:

5. `import-strategies.spec.ts`: keep the colliding item **and** the new item, and the last
   assertion of `user can replace the matching rows and keep everything else` (the #330 guard).
   Add the dialog step where the file is a local one.
6. `data-mode-migration.spec.ts`, `import-export-cloud.spec.ts`: the local → cloud copy now has
   the dialog. Rename tests whose title says "stray default" if the words no longer fit.
7. `import-export-local.spec.ts`: the cloud → local copy puts the active location into "My Home".
8. `cart-id-cross-user-leak.spec.ts`: a bare cart id is now refused for BOTH users with
   `BAD_USER_INPUT`. Rewrite its header; it is no longer a negative control.
9. **Mutation checks** (name each in the report): skip the `importCheck` call in
   `importCloudData` → test 2 red (the new item appears); make the dialog pre-check nothing →
   test 3 red; drop `requireCatalogRole` from `bulkCreateItems` → test 1 red.
10. Run the new spec alone several times, then the whole `cloud` project. Copy `test-results/`
    aside before any re-run.

## Task E.7 — docs, runbook and the final gate

1. Root `CLAUDE.md`, *Authorization (cloud)*: the new body of `requireOwnRowOrUnclaimed`, the
   corrected cuid paragraph (#361), "belong to no location" corrected, the role gate, the 22
   imports' new checks, `importCheck`, `fallbackImportLocation` gone, #381 closed. Re-count the
   three guard greps.
2. A deploy section for H4 in the next checkpoint runbook (or a new file if there is none yet):
   - **Server before web** (T9), and how that fits with H3a's "web before server".
   - Read-only SQL for the main session to run on the rehearsal branch, with the owner's
     consent (rule 18):
     ```sql
     SELECT count(*) FROM "Cart" WHERE id NOT LIKE "locationId" || ':%';  -- carts T6 would refuse
     SELECT count(*) FROM "Location" WHERE id = 'local' OR id LIKE '%:%';  -- ids T12 refuses
     ```
     A non-zero first count means some existing carts (made by the old fallback, see Facts)
     would be refused on re-import. If so, stop and plan a data fix with the owner; do not
     write one in this task.
3. The design: rule 2's "Nothing is written" is now true; mark the H12 stopgap as closed; add a
   short *Result* note for H4. The households plan's phase table and H4 outline link this plan.
   `docs/INDEX.md`. This plan's *As built* notes, *What this plan got wrong* and *Status*.
4. Close the loop on the issues in the PR text: #381 and #361 fixed, #330 kept.
5. The full gate, then `pnpm test:e2e:all`.

## Out of scope

- **The activity log.** The design says "every import is written to the activity log". That
  is H6, which builds `HouseholdActivity`.
- **Copying rows from one household into another.** Postponed by the design (*Postponed*). A
  backup of household A cannot be imported into household B while A still holds its rows; it is
  refused (rule 2).
- **The household switch** (which household is "active"). H7. Until then the target is
  `requireHousehold(ctx)`.
- **Two people in one browser** (a browser context per user). H5.

## Known gaps (expected after this plan)

- **One user in two households is tested only with fakes.** The E2E route refuses a user who is
  already in a household, so no real-SQL test of #381 exists until H5 adds invites.
- **`importCheck` tells a manager whether an id belongs to another household.** That is the
  same answer the `FORBIDDEN` / `'unclaimed'` difference already gives; it is now one query for
  many ids. It needs the `manager` role. Recorded, not changed.
- **A race between `importCheck` and the writes** (another import, or a role change) can still
  refuse a batch after earlier batches were written. The per-mutation guards keep the data
  safe; the message is then `importErrorForbidden` or `…AfterClear`.
- **Carts stored by the old fallback** may have an id whose prefix is not their location. The
  runbook counts them (E.7); no data fix is planned until the count is known.

## What this plan got wrong

Filled in from the task reports and reviews.

| Task | The plan said | What was true |
|---|---|---|

## Status

🔲 **Not started.** Plan written 2026-11-16 on `feature/households-h4`. The owner decisions
O1–O8 are open.
