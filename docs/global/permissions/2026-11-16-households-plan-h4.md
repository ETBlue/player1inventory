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

### Decisions the owner approved

The design leaves these open. The owner approved all eight defaults on 2026-11-16 ("agree").

| # | Question | Decision (approved 2026-11-16) |
|---|---|---|
| O1 | What does a household **member** see on `/settings/household`? | `ExportCard` as today. `ImportCard` shows its title and the line "Only the owner or a manager can import data." with no file button |
| O2 | `clear` with a file that holds the local "My Home": where does it go? | No dialog. `clearAllData` leaves one location, the new "Home"; "My Home"'s rows go there. A dialog would offer only that one location anyway |
| O3 | Local → cloud copy into a household with only "Home": show the dialog anyway? | Yes, always show it, "Home" selected. One more tap, but the user always sees where the data goes |
| O4 | Local mode imports a cloud backup FILE (not the copy): which location becomes "My Home"? | Today's rule: the file's first location by `order`. The file does not record the active location |
| O5 | How is the importer told about skipped locations? | After the import finishes, a line in the import card: "Skipped, because you cannot edit them: Garage, Attic." Not a blocking dialog |
| O6 | "New location" in the dialog: what name does the field start with? | The name of the file's default location ("My Home"), editable. Created with the existing `createLocation` mutation before the import starts |
| O7 | A household **member** who is the organizer of a location: may they import into that location? | No, as the design says ("owner and manager only"). Recorded here because it may surprise |
| O8 | The new message texts | en: "Some rows in this file belong to another household, so the import was refused. Nothing was imported." (design text). tw: "檔案裡有些資料屬於別的家庭，所以匯入被拒絕了，沒有匯入任何資料". The other two keys change "account" → "household" (帳號 → 家庭) the same way |

Two more, decided on 2026-11-17 after task E.6:

| # | Question | Decision (2026-11-17) |
|---|---|---|
| O9 | A `skip` or `replace` restore of a cloud backup into a new household leaves the user on the household's fresh, empty "Home" (task E.6, *Known gaps*). Delete that "Home" too, or keep it? | **Option B.** Keep it, and move the user off it. After a FINISHED `skip` or `replace` import that brought locations, when the active location holds **no `ItemStock` row**, the active location becomes the backup's first location by `order`. Nothing is deleted. When the active location holds stock, nothing changes. A local file (the "Import into which location?" dialog, O3) never switches: the user already picked where the rows go. `clear` is unchanged (decision 6). See *Follow-up O9 — As built* after task E.6 |
| O10 | The E.5 fallback: on the cloud → local copy, when the cloud active location is not in the payload, the payload's first location by `order` becomes local "My Home" (decision O4's rule) | **Approved as built.** No code change |

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

**As built (2026-11-16).**

- `requireOwnRowOrUnclaimed` takes `targetHouseholdId`. The six tag / vendor call sites pass
  the id `requireCatalogRole` returned. The import helper `requireOwnRowIdsOrUnclaimed` takes it
  as a fourth argument too. The 14 catalog and log call sites pass the `householdId` they
  already read from `requireHousehold(ctx)`; the 4 cart and cart item call sites pass
  `await requireHousehold(ctx)` inline. Task E.3 replaces both with `requireCatalogRole`.
- The `Cart` branch is its own function, `cartVerdict`, so the order of T6 is in one place.
  The helper's other branches share `writableLocationIds(ctx, target)`.
- `UserScopedDelegate`, `UserScopedModel`, `isCartModel` and `userScopedDelegate` are deleted:
  no model is scoped by `userId` any more.
- The `cuid` paragraph and the "belong to no location" wording are corrected in `lib/authz.ts`,
  in `import.resolver.ts` (the helper's comment) and in root `CLAUDE.md`. Root `CLAUDE.md` also
  lists `requireLocationInHousehold` and the new signatures.
- **Existing tests that did not stay green: 20, in 4 files.** Step 7's "every existing test must
  stay green" was wrong; see *What this plan got wrong*. What was changed:
  - `import-ownership-log.resolver.test.ts` (6 red): its `ownedRowFake` store for
    `InventoryLog` now accepts `locationId` in a `where` (`columns`). No assertion changed.
  - `import-ownership-cart.resolver.test.ts` (4 red): `CART_THEIRS` was the bare id
    `no-vendor`. It is now `loc_garage:vendor_theirs` stored at the stranger's location, so the
    location guard still passes it and only the cart-id guard refuses it. One test added: a bare
    id behind an allowed cart is `BAD_USER_INPUT` and nothing is written.
  - `import-cart-location.resolver.test.ts` (8 red, 19 → 16 tests): 7 tests asserted that a
    bare cart id, an id naming a deleted location, or `":vendor"` falls back to the first
    location. They now assert the refusal and that nothing is written. The "does not move an
    existing cart" test now seeds a cart stored away from its id's location and asserts the
    re-import is refused and the row is unchanged.
  - `cart-live-publish.resolver.test.ts` (2 red): the two cart import tests imported a cart of
    ALICE's second household in a batch with her first household's carts. They now use her first
    household only, and one test is added: that batch is refused and publishes nothing.
- One more test than step 5 lists: `locationIdsWithRole(…, { householdId })` still drops a role
  in a household the caller is not a member of (decision H18). Without it, writing
  `{ location: { householdId } }` instead of `{ location: { ...counted.location, householdId } }`
  passed every test.

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

**As built (2026-11-16, with two rounds of review fixes the same day).**

- Server: `apps/server/src/resolvers/importCheck.resolver.ts` (wired in `resolvers/index.ts`),
  the schema in `apps/server/src/schema/import.graphql`, tests in
  `import-check.resolver.test.ts` (54 tests). Web: the `ImportCheck` document in
  `apps/web/src/apollo/operations/import.graphql`, and `checkImportIds`,
  `IMPORT_CHECK_CHUNK_SIZE`, `ImportIdCheck` and `ImportCheckRowIds` in
  `apps/web/src/lib/importData.ts` (6 tests in `importData.test.ts`). `checkImportIds` is not
  called by the import flow; E.4 wires it.
- **The answer is bigger than T1 says.** A review of the first version found three files that
  `importCheck` called fine while a later bulk mutation refused them, after earlier batches were
  written. So the answer is:

  | Field | What it holds | What E.4 does with it |
  |---|---|---|
  | `anotherHousehold` | a catalog id, an `itemRefs` id, or a named or stored location is another household's | write nothing |
  | `blockedLocationIds` | locations the file NAMES (rows, references, cart ids) in the target where the caller is below `participant` | drop every row the file puts there |
  | `renameBlockedLocationIds` | location ROWS of the file that exist in the target where the caller is `participant` but not `organizer` | on `replace`, leave these rows out of `bulkUpsertLocations`; keep the rows at them |
  | `missingLocationIds` | `locationRefs` no location will hold when the import writes | drop every row that points at one |
  | `missingItemIds` | `itemRefs` no item will hold | drop those stock rows |
  | `blockedRows { inventoryLogs itemStocks carts cartItems }` | rows of the file that already exist at a blocked location; a cart stored away from the location its id names | drop exactly those rows |

- **Two new input lists, `locationRefs` and `itemRefs`.** They hold ids the file's rows POINT
  AT but that are not rows of the file: the `locationId` of stock rows and logs, the location
  each cart id names, and the `itemId` of stock rows. The bulk stock, log and cart mutations
  REFUSE such a reference when it names nothing in the target (`requireLocationRole`,
  `cartVerdict`, `requireOwnItemStockRefs`). Only the web can tell a reference from a row,
  because a row and a reference to it may go in two different calls. `locations` holds the
  location ROWS only; a free one is never missing, because the import creates it. The `itemId`
  of logs and cart items, and a cart item's `cartId`, are not sent: those mutations SKIP the
  row, they do not refuse the batch.
- **Catalog ids and locations: two reads each** (`splitByHousehold`). An unscoped
  `findMany({ id: { in } })` says which ids are taken, a second one with `householdId: target`
  says which are in the target. The comparison is in SQL.
- **Stored rows.** The stored location of a log, stock row or cart item (through its cart) the
  file holds is checked too: in another household it sets `anotherHousehold`; in the target and
  not writable it puts the ROW in `blockedRows`. It is not added to `blockedLocationIds`: the
  file does not name it, and the caller may have no role there, so the web has no name to show.
- **Carts (decision T6).** `cartVerdict` reads the cart table when the cart is WRITTEN: after
  the file's locations exist, and with `forClear` after the clear. So `importCheck` reads a cart
  id when its prefix will be writable then:

  | Prefix | Without `forClear` | With `forClear` |
  |---|---|---|
  | a writable location of the target | read | read |
  | another location of the target (viewer, no role) | not read | read |
  | no location has that id | read | read |
  | a location of another household | not read | not read |

  A stored cart away from the location its id names is a blocked row when it is stored in the
  target, and `anotherHousehold` when it is stored outside it. With `forClear` a cart stored in
  the target is deleted by the clear and ignored, so reading a prefix the caller cannot write
  today says nothing about that location's carts. "No location has that id" is a database fact,
  so the web needs to send nothing more for this: the chunk a location row is in does not
  matter. The first version read every cart id before any prefix check; the second read only
  writable prefixes and so missed a stored cart whose prefix the file creates (second review).
  Tests spy on `prisma.cart.findMany`, `findUnique` and `findFirst`.
- **The carts of the file's existing cart items are read by id**, whatever their location, to
  find where each cart item is stored. That read is about the cart id stored on the cart item,
  not an id the file chose, so T6 does not cover it. (The first As built note said "the cart
  table is read only for writable prefixes", which was not true of this read.)
- **Location ids `'local'` and ids with `:`** in `locations` get `BAD_USER_INPUT`, as both
  location imports refuse them since E.3 (decision T12).
- **`forClear: true`.** `clearAllData` deletes every row and location of the target first. So
  nothing is blocked, no row is blocked, nothing needs `organizer`, and an `itemRefs` or
  `locationRefs` id of the target is MISSING unless the file holds that row too.
  `anotherHousehold` is still checked.
- **What `importCheck` leaves to the web:** a log with no `locationId` (`IMPORT_NEEDS_LOCATION`
  since E.3). The server check is given ids only, so it cannot see a missing field.
- **The role check runs before any read and before the size check.** A member's call reads no
  catalog row, and a member who sends 1001 ids gets `FORBIDDEN`, not `BAD_USER_INPUT`. Both are
  tested.
- **An empty file still makes one call.** The call is also the role check, and T17 needs the
  role refusal to come from `importCheck`.
- `stockFake`'s `itemStock` `where` now takes `id` as a string or `{ in }` (pinned in
  `stockFake.test.ts`).
- `live-publish.guard.test.ts` is unchanged and green: `importCheck` is a `Query` field.
- Root `CLAUDE.md` does not mention `importCheck` yet. E.7 step 1 adds it.

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

**As built (2026-11-16).**

- **The role gate** is `const householdId = await requireCatalogRole(ctx, 'manager')` right
  after `requireAuth` in all 22 mutations, BEFORE the empty-batch return. So a member is
  refused even for an empty batch, with no other read. Every helper gets that `householdId`:
  `requireOwnRowIdsOrUnclaimed` (the 4 inline `await requireHousehold(ctx)` from E.1 are
  gone), `resolveLogLocations`, `resolveCartLocations`, `requireOwnLocationIdsOrUnclaimed`,
  `requireOwnItemStockRefs` and `resolveCartItemParents`. The three guard greps still say
  18 / 2 / 2. A block comment, *IMPORT ROLE GATE*, above the resolvers says why once.
- **The helpers keep their names** (`resolveLogLocations`, `resolveCartLocations`). Renaming
  them would have made comments in `apps/web/src/lib/importData.ts`, its test and two E2E
  specs name functions that no longer exist.
- **`IMPORT_NEEDS_LOCATION`** is `extensions: { code: 'BAD_USER_INPUT', reason:
  'IMPORT_NEEDS_LOCATION' }`. T10 said "`BAD_USER_INPUT` (code `IMPORT_NEEDS_LOCATION`)",
  which can be read two ways. E.4 must read `extensions.reason`.
- **`resolveCartLocations`** refuses a bare id before any read, then runs
  `requireLocationRole` and `requireLocationInHousehold` per distinct prefix. It reads no
  location row before the role check (review note 2 of E.1: no `NO_LOCATION` for a bare id,
  no existence oracle; both tested). Its household call is a SECOND copy of the check in
  `cartVerdict`: removing it leaves every test green. Kept, and the comment says so.
- **`requireOwnItemStockRefs`** also checks the location of a STORED stock row whose id the
  file names (role and household). The plan did not ask for it: `bulkUpsertItemStocks`
  updates a row in place and keeps its location, so without it an import into A could
  overwrite a stock row of B.
- **`resolveCartItemParents`** finds the cart among the target's writable locations only
  (`locationIdsWithRole(ctx, 'participant', { householdId })`) and checks the item against
  the target. `householdOfLocation` is no longer read there. This closes the E.1 review
  note 5 case: a row in a cart of the caller's other household is SKIPPED (the reference
  table's rule for `cartId`).
- **`requireOwnLocationIdsOrUnclaimed`** refuses `'local'` and `:` for the whole batch
  before any read, and an existing location of another household with `FORBIDDEN`. The
  "viewer or no role → skipped" row of the design table stays a web job (E.4, through
  `importCheck`'s `blockedLocationIds`); the server still refuses, as step 4 and T2 say.
- **`createVendor`** calls `requireLocationInHousehold` after `requireLocationRole`.
- **`fallbackImportLocation`** and its 5 tests are deleted, with the unused
  `WRITE_LOCATION_ROLES`. `git grep -n fallbackImportLocation -- ':!docs'` returns nothing.
  (It did not when this note was first written: root `CLAUDE.md` and one test comment still
  named it in history notes. The E.3 review found them; both now describe the fallback
  without the function name.)
- **Review fixes (same day).** The empty-batch member test covers all 22 mutations, each
  with a manager control. The test file counts every read of an import's data models
  (`$dataReads`), and both member tests assert it stays empty, so a gate moved below any
  read turns red. Stale comments in `bulkCreateLocations` and `bulkUpsertLocations` said a
  location of another household could still be skipped, renamed or published for; E.3
  refuses it.
- **Tests.** New file `import-role-gate.resolver.test.ts` (72 tests): the member / manager
  pair for each of the 22 mutations, #381 gap 1 for stock and logs, the cart and log
  fallback refusals, and T12. Gap 2 is in `vendor.resolver.test.ts` and
  `catalog-live-publish.resolver.test.ts`. Existing tests changed, with the reason in each:

  | File | Change |
  |---|---|
  | `import.resolver.test.ts` | its `householdMember` mock gains `findUnique` (role `owner`); 10 tests went red without it |
  | `import-ownership-cart.resolver.test.ts` | MEMBER and VIEWER become household `manager`s (as `member`s the gate refused them first, so VIEWER's refusal test would pass with the location check removed); the second-household describe is rewritten with the target pinned, and its "item of the cart location's household" test now expects a skip into `hh_user` and a write into `hh_second` |
  | `import-inventoryLog-location.resolver.test.ts` | the 2 "falls back to the default" tests now expect `IMPORT_NEEDS_LOCATION` with a good row in the batch |
  | `authz.test.ts` | the `fallbackImportLocation` block (5 tests) is deleted |
  | `cart-live-publish`, `stock-live-publish`, `location-live-publish`, `catalog-live-publish` | `run()` can pin the household (review note 4). 9 tests wrote into ALICE's other household and expected that write's event; they now use a location of the target, and new tests assert the refusal (or the skip, for cart items) and that nothing is published |

- **Comments** fixed: `import.resolver.ts` (every fallback mention, `bulkCreateShoppingCarts`,
  `resolveCartLocations`, review note 1), `schema/import.graphql`, `vendor.resolver.ts`,
  four server test headers, `apps/web/src/lib/importData.ts` and its test (two comments
  that said the server falls back), root `CLAUDE.md` (review note 3, a new *import role
  gate* paragraph, the reference table) and `e2e/CLAUDE.md`.
- **E2E specs this breaks (for E.6), found by reading, not by running:**
  `shared-cart.spec.ts`, its two P3 import tests: the importer is a household `member`, so
  the gate refuses them. `cart-id-cross-user-leak.spec.ts` test 1 (bare id; already broken
  since E.1). `settings/import-export-cloud.spec.ts` line ~218 has a comment that says the
  server falls back (the seed itself maps every location, so it should still pass).

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
      `forClear: true` is passed. **Since the E.2 review:** leave the rows that point at the
      default location out of the check too (stock rows, logs, and carts whose id names it).
      Otherwise `checkImportIds` sends the default id as a `locationRefs` reference with no row,
      and the server reports it in `missingLocationIds`.
   2. `anotherHousehold` → throw a typed error the card shows as `importErrorForbidden`.
      Nothing has been sent.
   3. Drop `blockedLocationIds` and every stock row, log, cart and cart item at them. Return
      the dropped location names for O5. **Added by the E.2 review:** also drop
      - every stock row, log and cart that points at a `missingLocationIds` id (a cart through
        its id's prefix), and every cart item in such a cart;
      - every stock row whose `itemId` is in `missingItemIds` (dropped, not refused, the same
        way a log or cart item with a missing item is skipped by the server);
      - exactly the rows named in `blockedRows`, by model.
      The O5 line names the blocked locations the file has a row for. For a missing location,
      or a blocked row stored at a location the file does not name, there is no name: say how
      many rows were skipped instead. Do not ask the server for those names; the caller may
      have no role there.
      **Added by the second E.2 review:** on `replace`, leave every location row in
      `renameBlockedLocationIds` out of the `bulkUpsertLocations` call (it asks `organizer`);
      send its stock rows, logs and carts as usual. And drop, or refuse with
      `IMPORT_NEEDS_LOCATION`'s message, every log with no `locationId` before the check: the
      server refuses such a log for the whole batch since E.3, and `importCheck` cannot see it.
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

**As built (2026-11-16).**

- **`importCloudData(payload, strategy, client, { target, onProgress, session })`** now returns
  `{ skipped: { locationNames, rowCount } }`. `target` is `{ locationId }` or
  `{ newLocationName }` and is kept on the `ImportSession`, so a retry neither asks again nor
  creates a second location. Order of work: `placeDefaultLocation` → `checkImportIds` →
  (`anotherHousehold` → `ImportRefusedError('anotherHousehold')`; a `FORBIDDEN` from the check →
  `ImportRefusedError('role')`) → `clearAllData` on `clear` → the new "Home" or the new location
  → `withoutRefusedRows` → the bulk passes. Nothing is sent before the check resolves; a test
  records queries and mutations in one list and asserts it.
- **`placeDefaultLocation(payload, target)`** upgrades a file with no `itemStocks` key
  (`upgradeLegacyPayload`), gives every log with no `locationId` the target, then maps `'local'`
  in the five fields with `applyLocationRemap`. When the target is already a location row of
  the file, the `'local'` row is dropped instead of making two rows with one id. Calling it
  first with `'local'` and later with the real id gives the same rows and ids; `clear` and
  "New location" use that.
- **The check for `clear` and for "New location"** uses `checkImportIds(…, { omitLocationIds:
  {'local'} })`: the id `'local'` is left out of `locations` and `locationRefs` only. Every ROW
  at it is still sent by its own id, so a row id of another household is still found. (The
  step 2.1 text said to leave the rows out; see *What this plan got wrong*.)
- **"New location"** is created with `createLocation` AFTER the check passes and before the
  first bulk write, so a refused file creates nothing.
- **`needsImportLocation(payload)`** is true for a `'local'` row, no `locations` key, no
  `itemStocks` key, or a log with no `locationId`. So a log always gets a location and never
  reaches the server's `IMPORT_NEEDS_LOCATION`.
- **`withoutRefusedRows(payload, check)`** drops: rows of `blockedLocationIds` (and those
  location rows), rows pointing at `missingLocationIds`, stock of `missingItemIds`, exactly the
  `blockedRows`, and every cart item in a dropped cart. The O5 line names the blocked locations
  the file has a row for; every other dropped row is counted (`rowCount`). Nothing is done for
  `renameBlockedLocationIds` (see *What this plan got wrong*).
- **The dialog's list** comes from `fetchImportTargetLocations` (`GetLocations`, then
  `importCheck` with every location as a `locationRefs` id, leaving out blocked and missing
  ones), wrapped in `hooks/useImportTargetLocations.ts`. No new GraphQL field: a field on
  `Location` would break `GetLocations`, and with it the whole app, during the T9 window.
- **Deleted on the cloud side:** `fetchCloudDefaultLocationId`, `upgradeLegacyPayloadForCloud`,
  `prepareCloudPayload`. **Kept:** `buildLocationRemap`, `applyLocationRemap` and
  `findPayloadDefaultLocationId`, because `importLocalData` still uses them (E.5). The 15 old
  remap tests stay as tests of the local side; 9 cloud tests were rewritten to the new rule
  (they now pass a `target`, and a backup's `isDefault` row keeps its id in cloud).
- **UI.** `ImportLocationDialog` (new: component, `index.ts`, 5 stories, 5 smoke tests, 5
  tests). `ConflictDialog` gets `allowClear` (default `true`) and a `WithoutClear` story.
  `ImportCard` reads `useHousehold()`: `member` → the O1 line, no button; `manager` → no Clear;
  role still loading → button disabled. Errors through `importErrorKind` (T17). The O5 lines
  stay until the next file is picked. Two new stories, `CloudMember` and `CloudManager`.
- **Post-login copy.** `usePostLoginMigration` has a new state `'choosing-location'`, plus
  `chooseLocation(target)`, `cancelLocation()` and `pendingPayload`. Both copy paths ask
  (decision O3) except a stored `clear` (O2). Cancel copies nothing, removes
  `migration-strategy`, and goes back to the prompt. **No `migration-target-location` key:** an
  E2E spec answers the dialog in the page, the same way a person does. `MigrationError` gains
  `role`, and the dialog shows a new key, `settings.postLoginMigration.errorRole`.
- **i18n (O8 and T17),** en and tw: the three "another account" keys now say "household";
  new `importErrorRole`, `memberNotice`, `skippedLocations`, `skippedRows_one/_other`,
  `locationDialog.*` (9 keys) and `postLoginMigration.errorRole`.
- **Tests:** web 2592 / 281 → **2648 / 283**. Server unchanged (1755 / 66).
- **Product choices made in E.4, approved by the owner on 2026-11-16:**

  | # | Choice |
  |---|---|
  | 1 | Cancel in the post-login "Import into which location?" goes back to "Import local data to cloud?" and removes the stored strategy |
  | 2 | A file with no locations: the "New location" name starts empty, and Import stays disabled until a name is typed |
  | 3 | While the household role is loading, the Import button is shown but disabled |
  | 4 | The O5 skipped lines stay until the next file is picked |
  | 5 | The new texts, en and tw, as written in E.4 |
  | 6 | **Choice A:** no extra empty "Home" after a `clear` restore of a cloud backup (built in the review fixes below) |

- **Review fixes (2026-11-16, after the E.4 review):**
  - **A retried `clear` import no longer loses rows.** The bug is older than H4. A retry
    passes the same session, `clearAllData` runs again and deletes the rows of the batches
    already sent, and `runBulkBatches` then skipped those batches as sent. Now the `clear`
    branch calls `session.completedBatchKeys.clear()` right before `ClearAllData`. The old
    test "does not re-send the locations and stock already sent" pinned the bug on `clear`;
    it now runs on `replace`, where skipping is right.
  - **Decision 6 (choice A).** After a FINISHED `clear` import, `deleteHomeIfUnused` deletes
    the fresh "Home" with the normal `deleteLocation` mutation when the import put no
    location row, stock row, log or cart there, and the file brought at least one location
    of its own (so the Home is not the last location; the server would refuse that with
    `LAST_LOCATION`). A local backup puts "My Home" there, so nothing is deleted. The delete
    runs after the last bulk batch and before `resetStore`, so a failed import never
    deletes it. **A failed delete does not fail the import:** every row is written by then,
    and "import failed" would make the user retry a `clear` for an empty location. The
    extra "Home" then stays, and the user can delete it on the locations page. The delete
    sends the household `LOCATION` live event as any delete does (`location.resolver.ts`,
    tested in `location-live-publish.resolver.test.ts`). With the retry fix, a retry clears
    again and makes another fresh Home; the first one is deleted by that clear, so no
    location is deleted twice.
  - **The row drop on the `clear` path is tested** (a `missingItemIds` stock row is in no
    batch), and so is a blocked location on `replace`.
  - **No placeholder cart id reaches the server.** `importCheckPairs` does not send a cart
    id whose prefix is in `omitLocationIds`. Before, `local:vendor_1` was sent: checking it
    proved nothing (the cart is written under the real id), and a cloud location with the
    id `'local'` would have made the file "another household". E.7 adds a runbook check for
    such a location.
  - Tests: web **2648 / 283 → 2659 / 283** (11 new web tests).
- **E2E specs this changes (for E.6), found by reading, not by running:**
  `settings/import-export-cloud.spec.ts` (local → cloud now shows the dialog; the "first
  location" assertions and the comments naming `fetchCloudDefaultLocationId` /
  `buildLocationRemap`), `settings/import-strategies.spec.ts` (its backup's default row: a
  cloud `replace` asks where), `cart-id-cross-user-leak.spec.ts` (a bare cart id: `importCheck`
  now refuses it with `BAD_USER_INPUT` before any write), `shared-cart.spec.ts` (member
  importers, E.3), and every spec that reads the old "another account" text. Comments in
  `e2e/helpers/backupAssertions.ts`, `cloudSeed.ts`, `stockReadback.ts` and `e2e/CLAUDE.md`
  still name `fetchCloudDefaultLocationId`. `data-mode-migration.spec.ts` uses `clear`, so it
  gets no dialog.

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

**As built (2026-11-16).**

- **Server, the five reads.** `locations` (through `visibleLocations`), `inventoryLogs`,
  `allCarts`, `allCartItems` and `allItemStocks` call
  `locationIdsWithRole(ctx, 'viewer', { householdId: await requireHousehold(ctx) })`. Any role
  still counts: an export is a read. The schema doc strings say "one household" now ("every
  log the caller owns" and "whole-account" were wrong since H3a). No schema field changed, so
  no web document changed.
- **What else reads them.** These five are not only the export. `allCarts` feeds the shopping
  page, `locations` is the switcher and the return of `reorderLocations`, and
  `inventoryLogs` / `allItemStocks` / `allCarts` / `allCartItems` are read by `importData.ts`
  to find conflicts. All of them now see one household, which is what the design asks.
  Nobody can be in two households before H5, so no user sees a change yet.
- **Four of the five now call `requireHousehold`** (`locations` already did). So a brand-new
  person whose first request is one of them gets their household and "Home" there (first
  sign-in). One existing test changed for this: `itemStock.resolver.test.ts`, "user with no
  locations reads an empty list", now seeds the `User` row that `ensureUser` writes before any
  resolver runs in the real server. Without it the read failed with
  `ensureHousehold: no User row for this user`.
- **New test file** `apps/server/src/resolvers/export-scope.resolver.test.ts`, 10 tests (2 per
  read). ALICE is owner of hh_a and manager of hh_b. Locations: `loc_a` (hh_a, organizer),
  `loc_a_view` (hh_a, viewer), `loc_a_none` (hh_a, no role), `loc_b` (hh_b, organizer). Each
  location holds one stock row, log, cart and cart item. Target hh_a gives `loc_a` and
  `loc_a_view` only; target hh_b gives `loc_b` only.
- **Web.** `importLocalData(payload, strategy, { activeLocationId, homeLocationId })`
  (`ImportLocalOptions`). `homeLocationId` is used only when the payload holds a location row
  with that id; otherwise the old rule (`findPayloadDefaultLocationId`, decision O4).
  `buildLocationRemap` got a fourth parameter, `payloadDefaultLocationId`, which defaults to
  the old rule. `DataModeCard`'s `doSwitch` and `doSignOut` pass
  `homeLocationId: useActiveLocation().activeLocationId` (the cloud id: that section renders
  only in cloud mode) and still pass the LOCAL active location as `activeLocationId`.
  `ImportCard` passes `{ activeLocationId }` and no `homeLocationId` (O4).
- **The stale comment** at `DataModeCard.tsx` (a cloud export "still carries stock inline")
  is rewritten, not deleted: it now says which id goes where and why, and that the old claim
  stopped being true in PR 4b. Two comments in `importData.ts` that said "Task E.5 changes
  that side" are updated.
- **Web tests.** 3 in `importData.test.ts` (the copy: Home order 0, Garage order 1, home
  Garage → every Garage row on `'local'` in all five fields, Home keeps its id, no third
  location; a file with no home keeps O4; a home id the payload does not hold falls back to
  O4). 2 in `DataModeCard/index.test.tsx`: the switch runs the REAL `importLocalData` and
  reads Dexie back; the sign-out checks the argument. The 3 existing `DataModeCard` tests now
  read `activeLocationId` from the options object.
- **Nothing in `apps/web/src/db/` changed.**
- **Tests:** server 1755 / 66 → **1765 / 67**; web 2659 / 283 → **2664 / 283**; `scripts/spec`
  70, unchanged. Measured with root `pnpm test` before and after, Node 22.17.1.

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

**As built (2026-11-16).**

- **New spec `e2e/tests/settings/import-households.spec.ts`**, cloud only (in `cloud`
  `testMatch` and `local` `testIgnore`), 7 tests, WITH a browser. The plan expected the
  role tests to go through `makeGql` because "the browser user is fixed". It is fixed, but
  `addHouseholdMember` can add the browser's own user (`E2E_USER_ID`) to another person's
  household, as long as it runs before the page's first GraphQL request. So every test
  drives the real import card:

  | Test | What it proves | Plan item |
  |---|---|---|
  | member | O1 line shown, no file button; `bulkCreateItems` and `importCheck` refused with `FORBIDDEN`; nothing written. The member ORGANIZES Home (O7) | 1 |
  | manager | `importCheck(forClear: true)` refused, `forClear: false` answered; conflict dialog has Skip and Replace and no Clear; Replace writes the file | 1, and "a manager does not see Clear & import" |
  | another household | the "another household" message; the user's household has no item AND no vendor; the stranger's item keeps its name | 2 |
  | dialog, pick second | dialog opens with "Home" checked; the backup's default rows land in "Second Pantry", none in Home | 3 |
  | dialog, new location | the name field starts with "Fixture Home" (O6); "Imported Pantry" is created and holds the rows | 3 |
  | blocked location | "Skipped, because you cannot edit them: Garage."; Home's row written, Garage's not (read as the owner) | 4 |
  | clear restore | after "Clear & import" of a cloud backup, the locations are exactly the backup's two; no empty "Home" (decision 6) | decision 6 |

- **Rule 17 in test "another household" needed a VENDOR, not only a new item.** The new
  item travels in the same `bulkCreateItems` call as the foreign item, so that call is
  refused as a whole even without `importCheck`. Vendors go out before items, in their own
  call, so only the vendor can show a write that `importCheck` should have stopped.
- **The cloud → local copy (plan item 7) is a new test in `data-mode-migration.spec.ts`**,
  not in `import-export-local.spec.ts` (the E.5 row below says why). Home is first by
  order, the user is on "Garage", and the two stock rows differ (2 and 7), so "active" and
  "first" give different answers.
- **A production change made for a test.** `DataModeCard` left its whole cloud section out
  in E2E mode, because Sign Out calls `useClerk()` and the E2E build has no
  `ClerkProvider`. So no spec could press Switch. `useClerk()` moved into
  `CloudModeSectionWithClerk`; the E2E build renders `CloudModeSection` with no `signOut`,
  which shows Switch and hides Sign Out. A unit test pins it (`DataModeCard/index.test.tsx`,
  "shows Switch and no Sign Out in cloud mode in the E2E build, without calling Clerk").
- **Existing specs changed:**

  | Spec | Change |
  |---|---|
  | `shared-cart.spec.ts` | a fourth person, `IMPORTER` (household `manager`, `participant` on Home), runs the two P3 imports. Importing as the owner would lose "a person other than the adder merges into the shared cart" |
  | `cart-id-cross-user-leak.spec.ts` | test 1 now pins the bare-id refusal (`BAD_USER_INPUT`) for BOTH households, with a prefixed cart in the same batch (rule 17) and a positive control. The old leak test moved to a new test 2 with a PREFIXED id: B names A's cart id → `FORBIDDEN`, B's cart item skipped. Test 3 unchanged. The header no longer calls it a negative control |
  | `settings/import-export-cloud.spec.ts` | the two local → cloud tests answer "Import into which location?" (one asserts Home is checked). The three restore-into-a-new-household tests now expect the backup's three locations under their OWN ids plus the household's fresh, empty "Home"; "gains no stray default" is renamed and asserts the restored ids equal the file's ids. The default is looked up by NAME |
  | `settings/import-strategies.spec.ts` | the cloud `replace` answers the dialog (asserts Home checked, keeps it). The colliding item, the new item and the #330 name assertion are unchanged |
  | `settings/data-mode-migration.spec.ts` | stale comment; the new copy test |
  | helpers | `backupAssertions.ts`: `expectFixtureLocations` / `expectFixtureStockPerLocation` take `extraLocationNames` and find the default by name; stale remap comments in it, `cloudSeed.ts`, `stockReadback.ts`. `SettingsPage`: `getImportLocationDialog`, `chooseImportLocation` |

- **One unit test** in `ImportCard/index.test.tsx`: a local file import passes exactly
  `{ activeLocationId: 'office' }` (`toStrictEqual`, and the key list), so O4 is pinned for
  files.
- **No spec checked the old "another account" text**; `git grep "another account" e2e`
  finds only test titles of the leak spec, which are renamed.
- **One user in two households is still impossible in E2E** (409). The #381 cases stay
  tested on the fake only.
- **Measured.** Before E.6, on the unchanged tree, the 5 affected cloud specs: **8 failed /
  13 passed** (8.6m). After: those 5 plus the new spec, **30 passed** (11.8m). Unit: web
  2664 / 283 → **2666 / 283**, server **1765 / 67** unchanged, `scripts/spec` **70**.
  `pnpm test:e2e:all`, load average 2.3–3.5: local **178 passed / 6 skipped** (3m37s),
  cloud **153 passed / 7 skipped** (30m45s), pwa **73 passed** (1m33s).
- **Mutation checks**, each run against `--project=cloud`, restored from a copy:

  | Mutation | Red test | Failure |
  |---|---|---|
  | `bulkCreateItems` asks `requireCatalogRole(ctx, 'member')` | member | `Received promise resolved instead of rejected` |
  | `importCloudData` ignores `check.anotherHousehold` | another household | `vendors` received `[{ id: "h4e6-new-vendor" … }]` |
  | the dialog checks nothing at first | dialog, pick second | `toBeChecked … Received: unchecked` |
  | the dialog confirms the first location whatever is picked | dialog, pick second | `Expected: 2 / Received: undefined` |
  | the O5 line is not rendered | blocked location | `getByText('Skipped, because you cannot edit them: Garage.')` not found |
  | `allowClear` is true for a manager | manager | `toHaveCount … Expected: 0 / Received: 1` |
  | `deleteHomeIfUnused` not called | clear restore | received names include `"Home"` |
  | `doSwitch` passes no `homeLocationId` | cloud → local copy | `{ local: 2, <garage>: 7 }` where `{ local: 7, <home>: 2 }` was expected |
  | (unit) ImportCard passes `homeLocationId: activeLocationId` | O4 unit test | `+ "homeLocationId": "office"` |
  | (unit) the E2E build mounts the Clerk wrapper | DataModeCard E2E-build unit test | "Sign Out" button found |

## Follow-up O9 — show the restored pantry (owner decision of 2026-11-17)

**As built (2026-11-17).**

- **The rule lives in `importCloudData`**, in a new function `locationToShowAfterImport`
  (`apps/web/src/lib/importData.ts`). It runs after the last write of `skip` and `replace`,
  before `resetStore`. It returns a location id, and `CloudImportResult` carries it as
  `switchToLocationId`. The key is absent when there is no switch. `ImportCard` passes
  `activeLocationId` in and calls `setActiveLocationId` with the answer, AFTER its own
  `client.resetStore()`. That order is the safe one, and it is kept. It is NOT proven that
  the other order would break anything: `importCloudData` has already reset the store once
  (`resetStoreAfterImport`), so the provider's list may already hold the new location. (The
  first version of this note said the provider "would move the user to the first location
  of the old list". Nobody checked that.) A card test pins the order, not its reason.
- **The user's own choice wins (review fix, 2026-11-17).** If the user picks another
  location in the sidebar while the import runs, the card does not switch. It reads the
  provider's latest active id through a ref and compares it with the id the import started
  with.
- **The switch happens only when all of these are true:**
  - the strategy is `skip` or `replace` (`clear` keeps decision 6 and is never switched);
  - the file did not need "Import into which location?" (`needsImportLocation` is false);
  - the caller passed `activeLocationId` (`usePostLoginMigration` does not; its files are
    local and always need the dialog anyway);
  - the file still has a location after `withoutRefusedRows` left out the refused ones;
  - its first location by `order` (a tie keeps the file's order) is not already the active
    one;
  - the active location holds **no `ItemStock` row**, read from the server.
- **Why "empty" means "no `ItemStock` row".** The pantry lists stock rows only, so no stock
  row is exactly "the pantry shows nothing". Logs and carts do not count: a location with
  only those still shows an empty pantry. A stock row with quantity 0 DOES count: the user
  put the item there, and moving them away from it would be a surprise.
- **Why it is read AFTER the import, not before.** A same-household restore can put rows
  back on the active location (the "same-household backup" tests in
  `import-export-cloud.spec.ts` do exactly that). Read before, that location would look
  empty and the user would be moved away from the rows just restored.
- **How it is read.** A new query document, `ItemStockIdsAtLocation`
  (`apollo/operations/itemStocks.graphql`): the existing `itemStocks(locationId:)` field,
  ids only, `fetchPolicy: 'no-cache'`. No schema change, so no deploy-order rule. The field
  asks `viewer` on the location, which the user has on the location they are looking at. It
  is not in `QUERIES_BY_KIND`: no component watches it.
- **A failed read does not fail the import.** Every row is written by then, the same reason
  as `deleteHomeIfUnused`. The user stays where they are.
- **A local file imported into cloud never switches** (the brief asked to confirm this by
  reading the code). The file needs the dialog (its `'local'` row), the user picks where the
  default rows go, and moving them to another location afterwards would undo that choice.
  If they pick "Home", "Home" then holds stock, so the rule would not switch anyway. If they
  pick another location or a new one, they stay on "Home" and know where the rows went.
- **Tests.** 8 in `importData.test.ts` (`skip` and `replace` switch to the first by ORDER,
  with the file's rows listed in the opposite order; active location with stock → no
  switch; a file with no locations → no switch and no read; the file's first location is
  the active one → no switch; `clear` → Home deleted as before, no switch, no read; a local
  file with a picked target → no switch, no read; a failed read → import resolves, no
  switch). 2 in `ImportCard/index.test.tsx` (the card passes `activeLocationId` and stores
  the named location as the cloud active location; no name → unchanged).
- **E2E.** `import-export-cloud.spec.ts`, the test renamed "user re-importing a cloud
  backup into a new household gets every location back under its own id and is shown the
  first one". It now puts the user on "Home" before the import, and after it checks, with
  no switch by the user, that the switcher says "Fixture Home" and the pantry shows
  "Fixture Item". The precondition is needed: the browser still remembers the OLD
  household's Home id, and the seed renamed that row to "Fixture Home", so the restore
  brings that id back. Without the precondition the page could still hold that id when the
  import starts, and the test would pass with no switch at all. Comments in the same file
  that said the user stays on the empty Home are rewritten.
- **Measured.** Unit: web 2666 / 283 → **2676 / 283**, server **1765 / 67** unchanged,
  `scripts/spec` **70**. `pnpm test:e2e --project=cloud` on `import-export-cloud.spec.ts`
  and `import-households.spec.ts`: **15 passed** (6.8m), load average 3.0–3.7.
- **Mutation checks**, each restored from a copy:

  | Mutation | Red test | Failure |
  |---|---|---|
  | take `locations[0]` instead of sorting by `order` | skip, replace, "first location is the active one" | `loc_b` where `loc_a` was expected |
  | treat any stock read as empty (drop `stocks.length > 0`) | "location that holds stock stays there" | key `switchToLocationId` present |
  | read the active location BEFORE the `skip` writes | skip | the read came before `BulkCreateItemStocks` |
  | drop the `needsTarget` guard | "local file is not switched" | a stock read was made |
  | drop the "same as active" check | "first location is the active one" | `switchToLocationId: 'loc_a'` |
  | rethrow a failed read | "empty-check fails" | the import rejected |
  | read the stock before checking the file has locations | 5 tests, including "no locations" | an extra read |
  | `clear` also runs the rule | "clear is never switched" | key present, a read made |
  | `replace` never runs the rule | replace | `undefined` |
  | (card) `setActiveLocationId` not called | card test 1 | stored id stayed `cloud_home` |
  | (card) `activeLocationId` not passed | card test 1 | options had no `activeLocationId` |
  | (E2E) `setActiveLocationId` not called | the renamed E2E test | `Expected substring: "Fixture Home" / Received string: "Home"` |
  | (card, review fix) switch even when the user picked another location during the import | "user who picks another location while the import runs keeps their choice" | `expected 'loc_kitchen' to be 'cloud_garage'` |
  | (card, review fix) `setActiveLocationId` before `resetStore` | "the switch is made after the card refreshes the Apollo cache" | `expected [ 'loc_kitchen' ] to deeply equal [ 'cloud_home' ]` |

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
     SELECT id FROM "Location" WHERE id = 'local';  -- must return no rows (E.4 review)
     ```
     A non-zero first count means some existing carts (made by the old fallback, see Facts)
     would be refused on re-import. If so, stop and plan a data fix with the owner; do not
     write one in this task.
3. The design: rule 2's "Nothing is written" is now true; mark the H12 stopgap as closed; add a
   short *Result* note for H4. The households plan's phase table and H4 outline link this plan.
   `docs/INDEX.md`. This plan's *As built* notes, *What this plan got wrong* and *Status*.
4. Close the loop on the issues in the PR text: #381 and #361 fixed, #330 kept.
5. The full gate, then `pnpm test:e2e:all`.

**As built (2026-11-17).**

- **Runbook:** a new file, `docs/global/backend/2026-11-17-deploy-runbook-households-h4.md`,
  not a section in another runbook. H4's order rule (server first) is the opposite of H3a's
  (web first), and a separate file keeps that visible. It says which rule wins when both go
  out in one release (H3a's: its failure makes cloud mode unusable, H4's only stops imports),
  gives the three read-only SQL checks (H4-A carts not keyed by their location, H4-B location
  ids `'local'` or with `:`, H4-C the `'local'` row) with a stop rule for each, a table of
  old and new web and server together, and the checks after the deploy. **No SQL was run.**
- **H4-A uses `left(…)`**, not the plan's `id NOT LIKE "locationId" || ':%'`: a location id
  may hold `_` or `%`, which `LIKE` reads as wildcards. It is the same query as H3b-C.
- **Root `CLAUDE.md`:** the households intro names H4 and its runbook; a new paragraph on
  `importCheck`; the guard counts re-measured (18 / 2 / 2, and a fourth grep for the role
  gate: 22); the attach-id table says "target household"; the cloud spec count (33 of 37)
  and a paragraph for `import-households.spec.ts`. `apps/web/src/hooks/CLAUDE.md`: the
  `usePostLoginMigration` paragraph no longer names the deleted `fetchCloudDefaultLocationId`
  and `prepareCloudPayload`. `e2e/CLAUDE.md`: the cloud count table (160).
- **Stale comments fixed:** `upgradeLegacyPayloadForCloud` (no such function; it is
  `upgradeLegacyPayload`) in `import.resolver.ts` and one server test; "another account" in
  the `clear` comment of `lib/importData.ts`.
- **Design:** a *Result (H4)* section under *Import and export*; decision H12 marked closed
  in two places and in *Known gaps*.
- **Measured.** Unit, `pnpm test` from the root: web **2678 / 283** (2676 before the O9 review
  fixes, which added 2 card tests), server **1765 / 67**, `scripts/spec` **70**. `pnpm lint`,
  root `pnpm build` (0 `error TS`, no `TS6385`), `build-storybook` and `pnpm check` all exit 0.
  `pnpm test:e2e:all`, **all three green**, 38m47s in all: local **178 passed / 6 skipped**
  (3m52s), cloud **153 passed / 7 skipped** (33m21s), pwa **73 passed** (1m34s). No flaky test
  and no retry. Load average: 35.4 at the start (a 1-minute spike left by the unit run just
  before; the 15-minute figure was 9.1), 9–12 during `local`, 3.5–5.6 during `cloud`, 4.0 at
  the end. Ports 4001, 5174, 5175 and 5176 were free before the run. Same counts as E.6's run
  (178 / 6, 153 / 7, 73), which is right: O9 and E.7 added no E2E test.

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

- **A `skip` or `replace` restore of a cloud backup into a new household keeps an empty
  "Home"** (found in task E.6). First sign-in makes "Home"; the backup's locations come back
  under their own ids beside it (T16); decision 6 deletes the empty "Home" only after
  `clear`. **The owner decided to keep it (O9, 2026-11-17).** Since then the user is moved
  off it to the backup's first location, so the pantry no longer looks empty. The extra
  "Home" stays in the location list; the user can delete it on the locations page.
- **A "no switch" has two causes that look the same (O9).** The empty-check reads
  `itemStocks(locationId:)`. If the active id is stale (a location the user lost a role on,
  or that was deleted), the read is refused with `FORBIDDEN`; that failure is treated as
  "do not switch", the same answer as "the location holds stock". The code cannot tell the
  two apart, and does not try.
- **The O9 switch can land on an empty location.** The backup's first location by `order`
  may itself hold no stock. That matches the decision (the rule names the first location,
  not the first one with stock).
- **The O9 switch also fires in a same-household restore** when the active location holds
  no stock after the import: the user is moved to the backup's first location even though
  no new household was made. Same rule, same reason.
- **The card calls `resetStore` a second time without the `AbortError` guard.**
  `importCloudData` resets the store through `resetStoreAfterImport`, which ignores an
  `AbortError`; `ImportCard` then calls `client.resetStore()` itself, with no guard. This is
  older than O9. If that second call rejects with `AbortError`, the card shows the error
  state for an import that wrote every row.
- **The O9 switch is per tab.** It is made in the tab that ran the import. Another open tab
  of the same user keeps its own active location (the live `LOCATION` event refetches its
  list, it does not move it).
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
- **A failed post-login copy can make a second "New location".** The copy passes
  `{ target }` to `importCloudData`, not a session. If it fails after `createLocation`, the
  next try asks again and can create another location. `ImportCard` keeps the created id on
  its session and does not have this problem.
- **The empty "Home" delete (decision 6) can race another device.** It is decided from what
  this import sent. If another device puts a row into the fresh Home between the import's
  last batch and the delete, the delete removes that row with the location (the foreign
  keys cascade). The window is one request long.

## What this plan got wrong

Filled in from the task reports and reviews.

| Task | The plan said | What was true |
|---|---|---|
| E.1 | Step 7: "No behaviour change is visible to a one-household user, so every existing test must stay green." | T6 is a behaviour change for one household too. A bare cart id (`no-vendor`), an id naming a deleted location, and `":vendor"` were sent to `fallbackImportLocation` and written. Since E.1 the cart-id guard refuses them, so the batch fails. 20 server tests went red in 4 files and were changed (see *As built*). This is the T10 / T11 behaviour, which the plan puts in E.3; for carts it arrives in E.1. `e2e/tests/cart-id-cross-user-leak.spec.ts` test 1 imports the bare id `no-vendor` and will now get `BAD_USER_INPUT`; E.6 must change it. The web is not affected for a legacy file: `upgradeLegacyPayloadForCloud` gives its carts a location prefix before they are sent |
| E.1 | Step 3: "Update `requireOwnRowIdsOrUnclaimed`", and T4: the call sites "pass the id `requireCatalogRole` returned" | No import mutation calls `requireCatalogRole` before E.3. The 4 cart and cart item import mutations read no household at all. They now pass `await requireHousehold(ctx)` inline; E.3 replaces it |
| E.1 | *Facts*: `cart-live-publish.resolver.test.ts` is not named | That file already has one user (ALICE) in two households, and its two cart import tests imported both households' carts in one batch. They encoded the behaviour #381 calls a bug |
| E.2 | Step 6: mutation "compare a location-scoped row's household to the CALLER's household (`requireHousehold`) instead of the target → the two-household test goes red" | The target IS `requireHousehold(ctx)`: `requireCatalogRole` returns it, and nothing else can choose a household until H7. So that mutation changes nothing. It was run: **31 of 31 green**. The mutation that does test the rule is "drop `householdId: target` from the read of the touched locations": 6 red. A test cannot tell "target" from "caller's household" before H7 |
| E.2 | Step 2: "One unscoped query per model … selecting only `id` and the scope … A row is 'another household' when its household is not the target" | That is a `row.householdId !== target` comparison at a call site, which root `CLAUDE.md` forbids. Built as two reads per catalog model (taken, then scoped by `householdId: target` in SQL), and for locations two reads on the touched set |
| E.2 | Step 2 says nothing about `forClear` beyond the role | A location of the target is not blocked on `clear`: `clearAllData` deletes it first. Returning it as blocked would make E.4 drop rows that the clear import can write. Built: `blockedLocationIds: []` when `forClear` is true |
| E.2 | Step 4 and T1: "the file's ids per model" | Location ids are not only in the location rows. A stock row or log at a location of another household is refused by its mutation even when the file has no row for that location. Since the review fixes they go in their own input list, `locationRefs` (see the next rows) |
| E.2 review | T1: the answer is `{ anotherHousehold, blockedLocationIds }` | Not enough. Three files passed `importCheck` and were then refused by a bulk mutation after earlier batches were written: (1) a location only REFERENCED (cart prefix, log or stock `locationId`) that no row holds, or that `clear` deletes; (2) a stock row's `itemId` of another household, or one no item holds; (3) a row whose id is taken at a blocked location while the file names a writable one. Added `locationRefs` / `itemRefs` inputs and `missingLocationIds`, `missingItemIds` and `blockedRows` answers. E.4 step 2.3 now drops those rows |
| E.2 review | My first As built note: "A location id no row holds is neither: the import will create it" | True only for the file's location ROWS. A reference to a free location is refused by `cartVerdict`, `resolveLogLocations` and `requireOwnItemStockRefs` |
| E.2 review | T6 and step 2: "Cart ids also count their PREFIX location" | My first version read the stored cart for EVERY cart id before checking its prefix, the order T6 forbids, and so told a caller whether a cart id at a location they cannot write is taken. It now reads only cart ids whose prefix is writable in the target |
| E.2 review | Step 5: "a household `member` → `FORBIDDEN`" | That test passes even when the role check runs after the reads. The reviewer moved it and 31 of 31 stayed green. Added: a member's call reads no item row, and a member with 1001 ids gets `FORBIDDEN` |
| E.2 second review | My first review fix: "the cart table is read only for cart ids whose prefix is a writable location of the target, and not at all for `forClear`" | Too narrow. `cartVerdict` runs when the cart is written, after the file's locations are created and after `clearAllData`. A stored cart whose prefix is a location the file creates (case A), or with `forClear` a cart stored in household B under a prefix the file creates again (case B), was never read, so the check said clean and the mutation refused later. Now a free prefix is read always, and a target prefix is read with `forClear`. Prefixes of another household, and target locations the caller cannot write (without `forClear`), are still not read |
| E.2 second review | The As built note: "The cart table is read only for writable prefixes" | Not true: the carts of the file's existing cart items are read by id, whatever their location. The wording now says so |
| E.2 second review | T1 and T8 cover the location role only as `participant` | On `replace` the web sends every existing location row to `bulkUpsertLocations`, which asks `organizer` (H3a task 3.9). A row where the caller is `participant` refuses the whole batch. Added `renameBlockedLocationIds`; E.4 leaves those rows out of the upsert |
| E.2 second review | (E.3 decision T12) | Both location imports refuse `'local'` and ids with `:` for the whole batch since E.3. `importCheck` now refuses them too, with `BAD_USER_INPUT` |
| E.3 | T10: "`BAD_USER_INPUT` (code `IMPORT_NEEDS_LOCATION`)" | Two codes in one place. Built as `extensions.code` `BAD_USER_INPUT` plus `extensions.reason` `IMPORT_NEEDS_LOCATION`. E.4 reads `reason` |
| E.3 | T16 and E.4 step 1: `placeDefaultLocation` maps the id `'local'` in five fields | A backup made before locations existed has logs with NO `locationId`. `upgradeLegacyPayload` gives its carts a prefix but leaves its logs alone, and `applyLocationRemap` leaves them absent on purpose. Since E.3 the server refuses such a log, so a cloud import of an old backup with logs fails until E.4. E.4 must give every log with no location the location the user picked |
| E.3 | Steps 1–6 name the stock, log, cart and location helpers, and T13 names "cart items" | No step names `resolveCartItemParents`, which looked a cart up across EVERY household the caller is in. That is the E.1 review note 5 case. Fixed in E.3: the cart must be at a writable location of the target |
| E.3 | Step 5: "each location → role + `requireLocationInHousehold`; each item → the TARGET household" | Not enough. A stock id already stored at a location of another household passed: the stored row's location was checked by role only, and `bulkUpsertItemStocks` keeps the stored location. Built: the stored row's location gets the household check too |
| E.3 | Step 3: the cart prefix gets "role + household check" in `resolveCartLocations` | `cartVerdict` (E.1) already checks the prefix against the target's writable locations for every cart id. So the household call in `resolveCartLocations` is a second copy: removing it leaves every test green. Kept and labelled |
| E.3 | Files: the live-publish tests "where an import fixture used the fallback" | 9 tests in 4 live-publish files did not use the fallback. They imported rows into ALICE's OTHER household (stock, logs, a location update, a cart item, `createVendor`) and expected that write's event: they encoded the #381 behaviour. And 2 fixtures in `import-ownership-cart.resolver.test.ts` used household `member`s as importers, so the gate refused them before the location check under test |
| E.3 | Step 9: "a stock row at a location of A with an item of B → `FORBIDDEN` (stock) / skipped (log)" | True, and a test can still not tell "target" from "caller's household" (the E.2 row says why). The two-household tests prove the location and the item must be in the same household as the target, which is what #381 asks |
| E.3 | Step 7: `git grep -n fallbackImportLocation` must return nothing outside `docs/` | Its list of files to touch missed `e2e/CLAUDE.md`, four server test headers, and two web comments that described the fallback without naming it |
| E.4 | Step 2.3 (second E.2 review): "on `replace`, leave every location row in `renameBlockedLocationIds` out of the `bulkUpsertLocations` call" | The web never calls `bulkUpsertLocations`. `partitionPayload` puts every location on the CREATE pass and sends `locations: []` on the upsert pass (`importData.ts`, the `replace` branch), and `bulkCreateLocations` asks `participant` only. So nothing is needed; the comment on `withoutRefusedRows` says why. The E.2 row that says "the web sends every existing location row to `bulkUpsertLocations`" was not true either |
| E.4 | Step 2.1: "leave the rows that point at the default location out of the check too" | Leaving the ROWS out would skip rule 2 for their ids: a stock row, log or cart item of another household at the default location would not be found. Built: only the id `'local'` is left out of `locations` and `locationRefs` (`omitLocationIds`); the rows are still sent by id |
| E.4 | Step 1 and T16: delete `buildLocationRemap` and `findPayloadDefaultLocationId` | `importLocalData` still uses both, and `applyLocationRemap`. Only the cloud-side functions are deleted. E.5 owns the local side |
| E.4 | Step 3: "Lists the household's locations where the caller is `participant` or higher" | The web does not know location roles; `GetLocations` lists every location with any role. Built through `importCheck` (`locationRefs`), with no schema change. A new `Location` field would have broken `GetLocations` during the T9 deploy window, not only the import |
| E.4 | O6: "Created with the existing `createLocation` mutation before the import starts" | Created before the CHECK, a refused file would leave a new empty location behind, and "Nothing was imported" would not be true. Built: after the check, before the first write |
| E.4 | Step 3: the dialog is shown for a `'local'` row or no `locations` key | Also needed for a file with no `itemStocks` key (its inline stock goes into the picked location) and for a log with no `locationId` (the E.3 row above). `needsImportLocation` covers all four |
| E.4 | Step 5: the E2E auto-import path "needs a way to pick the location" | It does not. The auto-import now stops at the dialog, which a spec can answer in the page like a person. A key that skips the dialog would test a path no user takes |
| E.4 | Step 2.4: `clear` → `placeDefaultLocation` onto the new "Home" | True for a local file. For a CLOUD backup restored with `clear`, the file has no `'local'`, so every location keeps its id and the new "Home" stays as an extra, empty location. Before E.4 the file's first location was mapped onto it. The owner chose to delete that empty Home after the import (decision 6, choice A); built in the review fixes |
| E.4 review | The first E.4 version's `omitLocationIds` | It left `'local'` out of `locations` and `locationRefs`, but still sent cart ids such as `local:vendor_1` in `carts`. Fixed: a cart id with an omitted prefix is not sent |
| E.4 review | My E.4 report: the clear-retry data loss is a known gap, "not fixed" | The owner wanted it fixed in H4. An existing test ("does not re-send the locations and stock already sent", on `clear`) pinned the bug as the expected behaviour; it now runs on `replace` |
| E.4 review | My E.4 mutation list | No test covered the row drop on the `clear` path: the reviewer replaced it with the bare placed payload and 216 of 216 tests stayed green. Now tested |
| E.5 | T15 and the task title: "the five reads behind the export" | They are not only the export. `allCarts` is the shopping page's read, `locations` is the switcher and `reorderLocations`' return, and four of them are `importData.ts`'s conflict reads. All now give one household. That is right by the design, but it is wider than "export" |
| E.5 | T15 shows the call with `await requireHousehold(ctx)` and says nothing more | Four of the five did not call `requireHousehold` before. Now they can run first sign-in, and a test whose caller had no `User` row failed with `ensureHousehold: no User row for this user` (`itemStock.resolver.test.ts`, fixed by seeding the row) |
| E.5 | Step 2: "Delete the stale comment at `DataModeCard.tsx:78–88`" | Rewritten instead. The copy still passes the local active location as `activeLocationId`, for a payload with no `itemStocks` key, so the code needs a comment that says why |
| E.5 | Step 2 does not say what happens when `homeLocationId` names no location of the payload | Built: the old rule (O4) applies. Without that, the rows of no location move and `ensureDefaultLocationRow` adds an empty "My Home" beside them. Tested, and the guard proved by mutation |
| E.5 | E.6 item 7: "`import-export-local.spec.ts`: the cloud → local copy puts the active location into My Home" | That spec runs in the `local` project only and imports a backup FILE, which keeps O4. The copy runs from `DataModeCard` in CLOUD mode, and no E2E spec drives it today (`data-mode-migration.spec.ts` covers local → cloud only). E.6 needs a new cloud test, not a change to that spec |
| E.6 | Items 1 and 4: "through `makeGql` where no browser is needed"; "if the browser cannot run as M … do it through `makeGql` + the web function" | The browser CAN be a member or manager of another person's household. `addHouseholdMember` accepts `E2E_USER_ID` as the member, if it runs before the page's first GraphQL request (`cleanupCloudData` is REST, so it does not count). All seven new tests drive the real import card |
| E.6 | Item 2: "a file that holds user A's item id AND a new item" | A new ITEM cannot show a write that `importCheck` should have stopped: it is in the same `bulkCreateItems` call as A's item, and that call is refused as a whole anyway. The file needs a new row of an EARLIER entity type. Built with a new vendor, which is sent first, in its own call |
| E.4, E.5 | "E2E specs this changes": only the local → cloud dialog in `import-export-cloud.spec.ts` | Three more tests of that spec broke: the cloud backup restored into a NEW household (export, `/e2e/cleanup`, import). Since T16 the backup's locations come back under their own ids, so the household's fresh "Home" stays as a FOURTH, empty location, and it is the ACTIVE location, so the pantry shows nothing until the user switches. Decision 6 deletes that "Home" only on `clear`; a restore with no conflict runs `skip`. The tests now expect four locations and switch to "Fixture Home". **Open question for the owner:** should the empty fresh "Home" also be deleted after a `skip` restore? (Known gaps) |
| E.6 | Item 7: the cloud → local copy can be tested | `DataModeCard` rendered no cloud section at all in E2E mode (`useClerk()` has no provider there), so no spec could press Switch. A production change was needed: `useClerk()` moved into `CloudModeSectionWithClerk`, and the E2E build gets Switch without Sign Out |
| E.6 | Item 8: test 1 of `cart-id-cross-user-leak.spec.ts` "is refused for BOTH users … it is no longer a negative control" | True, but then the file no longer tested the cross-household cart guard at all: the bare id is refused before that guard runs. The leak test was kept as a new test 2 with a location-prefixed id of the other household (`FORBIDDEN` before the cart table is read; B's cart item skipped) |
| E.6 | Item 6: `data-mode-migration.spec.ts` "now has the dialog" | It does not: it uses `clear`, which never asks (O2), as E.4's own note says. Only a stale comment changed |
| E.6 | Item 2 of the brief: "Any spec that checks the old 'another account' text" | None did. Only two test TITLES in `cart-id-cross-user-leak.spec.ts` said "another account"; both were rewritten |
| O9 | *Known gaps* (E.6): "`import-export-cloud.spec.ts` pins today's behaviour, so a change will turn three tests red on purpose". The O9 brief repeated it: the three tests "pin today's behaviour (the active location staying on Home)" | None of the three asserted the active location. They assert four locations and the stock per location, and `verifyRelations` switches to the location it checks by itself. Option B deletes nothing, so all three stayed green with the new code. Only one of them turned red under a mutation, and only after this follow-up added the switch check to it. So no test had pinned "the user stays on Home" |
| O9 review | My O9 *As built* note: the card must switch AFTER `resetStore`, or "the provider would move the user to the first location of the old list" | Not proven. `importCloudData` has already reset the store once, so the list may hold the new location already. The order is kept as the safe one; the note and the code comment now say only that. The review also found a race the O9 change brought: a location picked in the sidebar during the import was overwritten. Fixed |
| E.7 | Step 2: `SELECT count(*) FROM "Cart" WHERE id NOT LIKE "locationId" \|\| ':%'` | `LIKE` reads `_` and `%` in a location id as wildcards, so the count could be wrong. The runbook uses `left(id, length("locationId") + 1) <> "locationId" \|\| ':'`, the same as H3b-C |
| E.7 | Step 2: "A deploy section for H4 in the next checkpoint runbook" | There is no single checkpoint runbook; each phase has its own file. H4 got its own, because its order rule is the opposite of H3a's |
| O9 | The brief: "if the active location is empty, switch" | Not enough on its own. Read BEFORE the import, a same-household restore that puts rows back on the active location would move the user away from them. It is read after the last write |

## Status

**E.1–E.7 built** (E.1–E.6 on 2026-11-16; the O9 follow-up and E.7 on 2026-11-17). Not
merged, not deployed. Plan
written 2026-11-16 on `feature/households-h4`. The owner approved O1–O8 on 2026-11-16, and
decided O9 and O10 on 2026-11-17 (the empty "Home" after a `skip` restore: keep it, move the
user off it; the E.5 fallback: approved as built).
