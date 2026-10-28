# Design — import ownership guard (issue #327)

Date: 2026-10-28
Branch: `fix/import-ownership-guard`, based on `main` at `aafb2d44`
Issue: [#327](https://github.com/ETBlue/player1inventory/issues/327)
Plan: `docs/features/settings/2026-10-28-import-ownership-guard-plan.md`

## The problem

`apps/server/src/resolvers/import.resolver.ts` has 18 bulk import mutations that
do not check who owns a row id.

| Family | What happens today |
|---|---|
| 9 `bulkUpsert*` | `where: { id }` is unscoped and `update` carries the caller's `userId`. One user overwrites another user's row **and takes ownership of it**. |
| 9 `bulkCreate*` | The existence check is unscoped. A stranger's row counts as "already exists", so the caller's own row is **silently dropped**. |
| 8 closing `findMany` | Unscoped, so the stranger's row is returned to the caller. |

Ids are `cuid()` so they cannot be guessed. They can be known: a shared backup
file carries its author's row ids. The attack is to edit a backup JSON so a row
carries the victim's id, then import it.

Four sibling mutations are already correct and are the reference:
`bulkCreateLocations` (934), `bulkCreateItemStocks` (1000),
`bulkUpsertLocations` (1065), `bulkUpsertItemStocks` (1140).

## What the user gets

Nothing new to look at. Two things that were wrong become right, and one silent
failure gains a message.

| Before | After |
|---|---|
| A hand-edited backup could take over another account's items, carts, logs, recipes and shelves, with their children. | The import is refused with `FORBIDDEN` and nothing is written. |
| A user whose backup held a stranger's row id lost that row on import, with no error and no count. | The import is refused and the user is told. |
| The post-login copy failed silently. The dialog either closed as if it had worked, or stayed stuck on "Copying…" forever. | The user sees an error message and can retry. |

The second row is the honest part. The refusal is a **new** failure the user can
hit — see *The `clear` strategy stays destructive* below.

## What the developer gets

| Gain | The specific thing |
|---|---|
| A failure that now has a name | `FORBIDDEN` with the message `Forbidden`, instead of a dropped row or a reassigned owner. |
| Fewer ways to get it wrong | One function, `requireOwnRowOrUnclaimed` in `lib/authz.ts`, is the only place account ownership is decided. There is no `row.userId === ctx.userId` anywhere. |
| One place for RBAC | Two seams instead of N call sites: `requireLocationRole` for location-scoped data, `requireOwnRowOrUnclaimed` for account-scoped data. |
| A test double that can fail | `src/test/ownedRowFake.ts`, one generic stateful fake serving all nine models, and the **only** place `createMany({ skipDuplicates: true })` is modelled. It throws on a `where` key it does not understand, so a relation filter can never be dropped on the floor. |
| Fewer queries | The pre-pass returns the ids the caller already owns, so five `bulkCreate*` mutations lose their per-row `findUnique`. |
| Honest documentation | `cart-id-cross-user-leak.spec.ts` stops being a characterisation of an open hazard and becomes the proof that the hazard is closed. |

Cost: one more hand-maintained list. `OwnedModel` in `lib/authz.ts` names the
nine models, and each call site passes a string literal. A literal that does
not match the write below it compiles. Every mutation gets its own test, which
is what catches that.

## Decisions

### 1. The guard helper

Two functions, two homes.

**`lib/authz.ts`** gains the authorization seam:

```ts
export type OwnedModel =
  | 'item' | 'tag' | 'tagType' | 'vendor' | 'recipe'
  | 'inventoryLog' | 'cart' | 'cartItem' | 'shelf'

/** The two reads the guard needs on a model with an `id` and a `userId`. */
interface OwnedRowDelegate {
  findUnique(args: { where: { id: string }; select: { id: true } }):
    Promise<{ id: string } | null>
  findFirst(args: { where: { id: string; userId: string }; select: { id: true } }):
    Promise<{ id: string } | null>
}

function delegateFor(model: OwnedModel): OwnedRowDelegate {
  // Resolved PER CALL, not captured at module load, so a test that swaps a
  // method on the mocked `prisma` after import still sees its own swap.
  return (prisma as unknown as Record<OwnedModel, OwnedRowDelegate>)[model]
}

export async function requireOwnRowOrUnclaimed(
  ctx: Context,
  model: OwnedModel,
  id: string,
): Promise<'own' | 'unclaimed'> {
  const userId = requireAuth(ctx)
  // UNSCOPED on purpose, and only `id` is selected. "Is this primary key
  // taken" is not an authorization question and has no user to scope by.
  const taken = await delegateFor(model).findUnique({
    where: { id },
    select: { id: true },
  })
  if (!taken) return 'unclaimed'
  // The AUTHORIZATION decision, SCOPED IN SQL. Never a comparison of a
  // fetched row's `userId` against the caller's — root CLAUDE.md forbids it.
  const own = await delegateFor(model).findFirst({
    where: { id, userId },
    select: { id: true },
  })
  // Same wording and code as `requireLocationRole`'s refusal, and for the same
  // reason: "not yours" must be indistinguishable from "does not exist", or
  // the mutation becomes a probe for other accounts' row ids.
  if (!own) {
    throw new GraphQLError('Forbidden', { extensions: { code: 'FORBIDDEN' } })
  }
  return 'own'
}
```

Three cases per id: mine → `'own'`, somebody else's → throws, nobody's →
`'unclaimed'`. The "somebody else's" case cannot be returned, so a call site
cannot ignore it.

**`import.resolver.ts`** gains the per-batch loop, next to
`requireOwnLocationIdsOrUnclaimed` (312-326) and shaped the same way:

```ts
async function requireOwnRowIdsOrUnclaimed(
  ctx: Context,
  model: OwnedModel,
  rows: readonly { id: string }[],
): Promise<Set<string>> {
  const own = new Set<string>()
  const checked = new Set<string>()
  for (const { id } of rows) {
    if (checked.has(id)) continue
    checked.add(id)
    if ((await requireOwnRowOrUnclaimed(ctx, model, id)) === 'own') own.add(id)
  }
  return own
}
```

Three properties, copied from the three helpers already in the file:

- Each **distinct** id is checked once, not once per row.
- The whole check runs **before** the write loop. None of the 18 uses
  `prisma.$transaction`, so a throw from inside leaves earlier rows on disk.
- It reads nothing it does not need. One query for a free id, two for a taken
  one.

Call it after `requireAuth` and after the empty-array early return, before the
write loop — the same position as line 937 and line 1068.

#### How it stays RBAC-shaped for the six models that are not location-scoped

`Item`, `Tag`, `TagType`, `Vendor`, `Recipe` and `Shelf` belong to no location.
Location RBAC
(`docs/global/permissions/2026-08-29-design-location-rbac.md`) says nothing
about them, and the shape they will take is not decided — a household scope is
the likely answer and is being explored on another branch.

So the guard is written so that question has exactly **one** place to be
answered. No call site compares a `userId`. Every call site says "this id must
be one I may write", and `requireOwnRowOrUnclaimed`'s body is what decides.
When account scope changes, that body changes:
`where: { id, userId }` becomes `where: { id, household: { members: { some: { userId } } } }`
or whatever lands, and the 18 call sites do not move.

That is the same contract `requireLocationRole` already carries, written down
next to it in the same file.

### 2. One helper for all nine models

One helper. Not nine.

The nine models are the same shape: a `userId` column, and `id` as their only
unique key. The only thing that differs is the Prisma delegate.

The delegate is chosen by a **string literal model name**, resolved through
`delegateFor`. The narrow `OwnedRowDelegate` interface is what keeps the two
calls type-checked; the cast from `prisma` to
`Record<OwnedModel, OwnedRowDelegate>` happens **once**, inside `delegateFor`.

Two alternatives were rejected:

| Rejected | Why |
|---|---|
| Pass `prisma.tag` itself as a parameter | `prisma[model]` is a union of nine generated delegate types. Calling a method on that union is a known TypeScript failure ("none of those signatures are compatible with each other"). Passing the delegate explicitly at each call site avoids the union but then nothing checks that the delegate matches the model the write uses either. |
| Nine per-model helpers | Nine copies of the same three-case logic, each able to be wrong in a way nothing catches. |

**Unverified, and task 1 must settle it:** whether
`satisfies Record<OwnedModel, OwnedRowDelegate>` type-checks against the real
generated delegates. Prisma 6.19.3's `findUnique` is
`findUnique<T extends TagFindUniqueArgs>(args: SelectSubset<T, TagFindUniqueArgs>)`,
a generic method, and assignability to a non-generic target signature should
instantiate `T` from the target. It is likely to work and it was not measured.
If `tsc` rejects it, keep the single `as unknown as` cast in `delegateFor` with
a comment, and add a runtime check that both methods exist.

**The remaining risk, named:** a wrong model literal
(`requireOwnRowIdsOrUnclaimed(ctx, 'tag', shelves)`) compiles. Each of the 18
mutations therefore gets its own test, and each guard's deletion must turn a
**named** test red.

### 3. The `userId` key in all nine `update` payloads

**It comes out of `update` in all nine. It stays in `create`.**

This copies `bulkUpsertLocations` (1071-1104), which omits `userId` and
`isDefault` from `update` on purpose. A row's owner is not something an import
may rewrite, and leaving it out means a future edit that drops the pre-check
cannot reassign a row by accident.

Six of the nine share one `data` object between `create` and `update`. Those
are split: `data` is built without `userId`, and `create` adds it.

```ts
// before
const data = { ...rest, userId }
return prisma.tag.upsert({ where: { id }, create: { id, ...data }, update: data })

// after
const data = { ...rest }
return prisma.tag.upsert({
  where: { id },
  create: { id, ...data, userId },
  update: data,              // NO userId — see bulkUpsertLocations
})
```

**`bulkUpsertCartItems` keeps `cartId` and `itemId` in `update`.** Only `userId`
comes out. Local `importCartItems` does a Dexie `bulkPut`, which replaces the
whole row including both columns, so dropping them here would make cloud
`replace` disagree with local `replace`. This differs on purpose from
`bulkUpsertItemStocks`, which drops its two parents — there the pair is the
row's identity and a backup cannot legally move it.

**`bulkUpsertInventoryLogs` and `bulkUpsertShoppingCarts` already keep
`locationId` out of `update`** (lines 829-833 and 862-865). That stays. Only
`userId` is removed, and `create` gains it next to `locationId`.

### 4. The three existence-check shapes

The pre-pass returns the set of ids the caller already owns, which is exactly
what every `bulkCreate*` needs. After the guard, an id is one of two things:
in the set (the caller's own row, skip it) or not taken at all (free to write).
A stranger's id never reaches the write loop.

| Shape | Mutations | Change |
|---|---|---|
| per-row `findUnique({ where: { id } })` then `continue` | Items (434), Recipes (576), InventoryLogs (609), ShoppingCarts (642), CartItems (668) | Delete the per-row query. `if (ownIds.has(id)) continue`. One query per batch instead of one per row. |
| pre-read `findMany({ where: { id: { in: ids } } })` then filter | Tags (524), Shelves (895) | Delete the pre-read and filter on `ownIds`. For Tags, seed the topological `insertedIds` set from `ownIds` (524-527). |
| no check at all — `createMany({ skipDuplicates: true })` | TagTypes (551), Vendors (565), Tags' write (533) | No filter is added. The guard is the only change. After it, `skipDuplicates` can only skip the caller's **own** rows, which is the correct "skip conflicts" behaviour. |

`bulkCreateShelves` also writes with `createMany({ skipDuplicates: true })`
(896-913) behind an `existingIds` filter. The filter is rebuilt from `ownIds`
and `skipDuplicates` stays.

### 5. The closing reads

| Kind | Mutations | Change |
|---|---|---|
| closing `findMany` (8) | Tags 538, TagTypes 552, Vendors 566, Shelves 913, UpsertTags 746, UpsertTagTypes 761, UpsertVendors 776, UpsertShelves 1061 | Add `userId` to the `where`: `findMany({ where: { id: { in: ids }, userId } })`. |
| closing `findUniqueOrThrow` (4) | Items 495, Recipes 592, UpsertItems 726, UpsertRecipes 804 | Add `userId`: `findUniqueOrThrow({ where: { id, userId }, include: … })`. |
| **no closing read (6)** | InventoryLogs 626, ShoppingCarts 657, CartItems 677, UpsertInventoryLogs 838, UpsertShoppingCarts 868, UpsertCartItems 885 | **No change.** They return the row the write itself returned. The guard is what makes that row the caller's own. |

The scoped reads are defence in depth, not the guard: after the pre-pass no
stranger's row can be in range. They are added anyway for the reason
`bulkCreateLocations:945` records — an unscoped read makes a skip mean two
different things, and a future edit that drops the pre-check then has nothing
catching it.

Each of the six with no closing read gets a comment saying so, because "there
is no read here to scope" is otherwise indistinguishable from "somebody forgot
to scope it". Their mutation check is on the guard, not on a read: delete the
guard and the returned row is the stranger's.

`where: { id, userId }` on `findUnique` is already in use at
`bulkCreateLocations:945`, so it is type-legal in Prisma 6.19.3. Whether
`findUniqueOrThrow` accepts the same extra filter is **unverified**; task 5
must confirm it with `tsc`. `FindUniqueOrThrowArgs.where` is the same
`WhereUniqueInput` type, so it should.

**No scoped `upsert` `where`.** No code in this repo does one and its runtime
behaviour was not verified. The four correct mutations pre-check and then
`upsert` on `{ id }` with a narrowed `update`, and this PR copies that proven
shape. Do not change the nine `upsert` `where` clauses.

### 6. The `clear` strategy stays destructive. Accepted, with mitigation.

The problem: on the `clear` strategy, `clearAllData` runs **first** (importData.ts:2290),
then the uploads begin. A `FORBIDDEN` from the guard arrives **after** the
account has been emptied. The user's cloud data is gone and the import stops.

`importData.ts:1869-1873` already records this for `requireOwnItemStockRefs`.
This PR widens it from 2 mutations to 20.

**Decision: accept it. Mitigate on the client. Do not fix it here.**

Three reasons.

1. The window is narrow. After `clearAllData` the caller owns no rows, so every
   payload id is either unclaimed (allowed) or **a stranger's**. A `FORBIDDEN`
   on `clear` therefore means the file really does carry another account's row
   ids. It cannot be triggered by the user's own data.
2. The alternative is worse than it looks. A pre-validation pass needs a new
   GraphQL query, and `pnpm codegen` is all-or-nothing across both outputs, so
   the schema change and its web documents cannot be split. That is a separate
   PR.
3. The failure stops being silent. Before this PR an emptied account plus a
   swallowed error left the migration dialog stuck or falsely "done". After it,
   the user reads what happened — see decision 7.

What the user is told after a failed `clear`, exactly:

> Some rows in this file belong to another account, so the import was refused.
> Your cloud data was already cleared before that happened. Your backup file is
> unchanged.

Recorded as a **known gap** in the PR, and filed as a follow-up: validate the
whole payload's ids before `clearAllData` runs.

### 7. The client fix for the two swallowing paths

Three call sites, three behaviours today:

| Call site | Today | After |
|---|---|---|
| `ImportCard.tsx:169` | shown — `catch` at 182-188, UI at 277-298 with a Retry button | kept; the copy stops printing the raw word `Forbidden` |
| `usePostLoginMigration.ts:92` (auto-import) | `.catch(() => {…})` at 99-105 clears the strategy key and sets `done`. No toast, no message | new `'error'` state, message shown in a dialog, with Retry |
| `usePostLoginMigration.ts:127` (`importData`), called from `PostLoginMigrationDialog.tsx:114` as `onClick={() => importData('append')}` | no catch, not awaited, so an unhandled rejection leaves the dialog stuck on `importing` | same `'error'` state and dialog |

**One place detects the refusal.** `importData.ts` gains:

```ts
import { CombinedGraphQLErrors } from '@apollo/client/errors'

/**
 * Whether an import error is the server refusing a row that belongs to another
 * account (`FORBIDDEN` from `requireOwnRowOrUnclaimed`, `requireLocationRole`
 * or `requireOwnItemStockRefs`).
 *
 * Reads `extensions.code`, NOT the message text. Apollo's `message` for this is
 * the bare word `Forbidden`, which is also what the server sends for "not
 * found" on purpose, and matching on it would break the day the copy changes.
 */
export function isForbiddenImportError(err: unknown): boolean {
  return (
    CombinedGraphQLErrors.is(err) &&
    err.errors.some((e) => e.extensions?.code === 'FORBIDDEN')
  )
}
```

`importCloudData`'s existing `catch` (2425-2429) rethrows the error object
itself when it is an `Error`, and `CombinedGraphQLErrors` extends `Error`, so
the class survives to all three call sites.

**`usePostLoginMigration` gains an error state.** `MigrationState` gains
`'error'`, and the hook returns `error: { forbidden: boolean; message: string } | null`.

- The auto-import `.catch` sets `'error'` instead of `'done'`. It keeps removing
  `MIGRATION_STRATEGY_KEY` (so the failure cannot loop) and keeps
  `MIGRATION_PROMPTED_KEY` unset (so a refresh can retry). Only the state and
  the message change.
- `importData` wraps its body in `try`/`catch` and sets `'error'`.

**`PostLoginMigrationDialog` gains an error dialog**, open on `state === 'error'`,
with the message and one button that calls `dismiss()`. The prompting dialog's
`open` condition stays `'prompting' || 'importing'`, so the two never show at
once.

**New i18n keys**, in `en.json` **and** `tw.json` (the parity test in
`apps/web/src/i18n/locales/locales.test.ts` enforces it):

| Key | English |
|---|---|
| `settings.postLoginMigration.errorTitle` | `Copy failed` |
| `settings.postLoginMigration.errorForbidden` | `Some rows in your local data belong to another cloud account, so the copy was refused. Nothing was copied. Your local data is unchanged.` |
| `settings.postLoginMigration.errorOther` | `The copy failed: {{message}}` |
| `settings.import.importErrorForbidden` | `Some rows in this file belong to another account, so the import was refused. Nothing was imported.` |
| `settings.import.importErrorForbiddenAfterClear` | `Some rows in this file belong to another account, so the import was refused. Your cloud data was already cleared before that happened. Your backup file is unchanged.` |

The error dialog's button reuses `common.done` rather than adding a key, per
`apps/web/src/i18n/CLAUDE.md`.

`ImportCard` stores an `errorKind: 'forbidden' | 'other'` on its `error` phase
and picks the key in the render. The `clear` variant is chosen from
`importStatus.session.strategy`.

**No story for the error state.** It is reachable only by making
`importCloudData` reject, which needs `vi.mock`, and a story cannot
`vi.mock`. That is the precedent root `CLAUDE.md` records for `ImportCard`'s own
error phase: it lives in `index.test.tsx`, not in a story. Three hand-written
fake stories were deleted for exactly this on 2026-10-13. Do not add new ones.

### 8. The three junction tables

`RecipeItem` (`@@id([recipeId, itemId])`, schema.prisma:142),
`ItemTag` (`@@id([itemId, tagId])`, 110) and
`ItemVendor` (`@@id([itemId, vendorId])`, 113) have composite primary keys and
no `id` of their own.

**They need no guard of their own.** Every write to them is a `createMany`
keyed by the parent id — `recipeId` or `itemId` — and that parent is guarded.
After the guard the parent row is the caller's own, so no row on these tables
can be stolen and none can be attached to a stranger's parent.

**The other side of each pair is a different question, and it is open today.**
The second id in each pair is never scoped:

| Reference | Where | Today |
|---|---|---|
| `ItemTag.tagId` | `bulkCreateItems:478-482` | unscoped `tag.findMany({ where: { id: { in: tagIds } } })` |
| `ItemTag.tagId` | `bulkUpsertItems:716-719` | no check at all |
| `ItemVendor.vendorId` | both item mutations | no check at all |
| `RecipeItem.itemId` | both recipe mutations | no check at all |
| `CartItem.cartId` and `.itemId` | `bulkCreateCartItems:672-675` | unscoped `findUnique` on each |
| `InventoryLog.itemId` | `bulkCreateInventoryLogs:611` | unscoped `findUnique` |

The harm is smaller than the row steal — every read path is user-scoped, so the
caller cannot see the referenced row — but it writes a cross-account edge, and
success-versus-`P2003` makes the mutation a probe for which ids exist.
`cart-id-cross-user-leak.spec.ts` demonstrates the worst of it: account B's
`CartItem` rows end up inside account A's `Cart`.

**Decision: scope these six lookups, in one separable task (plan task 8).**
`requireOwnItemStockRefs:394-397` already sets the pattern —
`findFirst({ where: { id: itemId, userId }, select: { id: true } })`. It is the
same class of hole and it is cheap. It is the one task that can be dropped if
the PR gets too large; the design records it either way.

Not fixed, and noted: `bulkUpsertItems:721-723` calls
`itemVendor.createMany` with **no** `skipDuplicates` and no existence check, so
an unknown `vendorId` raises an unhandled `P2003`. Pre-existing, out of scope.

## The schema does not change

No new GraphQL type, field, argument or input. `pnpm codegen` output is
unchanged, so nothing in this PR has to be kept in one commit for codegen's
sake.

## Tests

### Why new files

`apps/server/src/resolvers/import.resolver.test.ts` cannot hold these tests.
Its 11 tests run against bare `vi.fn()` call recorders built in a `vi.mock`
factory at lines 8-99, and its `beforeEach` at 206-210 does
`p.location.findFirst.mockResolvedValue(DEFAULT_LOCATION)` (line 208), which
answers "yes, that row is yours" for **any** id. Its own comment at 194-203
says no ownership assertion can fail there. `vi.mock` is per file.

**That file will go RED anyway, and it must be repaired.** Its mock defines no
`findFirst` on `item`, `tag`, `tagType`, `vendor`, `recipe`, `inventoryLog`,
`cart`, `cartItem` or `shelf`, so `requireOwnRowOrUnclaimed` will throw
`prisma.tag.findFirst is not a function`. Plan task 3 adds the nine recorders,
their entries in the `p` type, and arms them to resolve `null` so the ids read
as unclaimed. Its 11 tests then pass unchanged.

The four correct files are the templates. The best is
`apps/server/src/resolvers/import-itemStock.resolver.test.ts` (25 tests), which
combines `stockFake` with a purpose-built scoped `item` store. The others:
`import-location.resolver.test.ts` (16), `import-cart-location.resolver.test.ts`
(19), `import-inventoryLog-location.resolver.test.ts` (9).

### The fakes — honest sizing

| Fake | State today | What this PR does |
|---|---|---|
| `src/test/ownedRowFake.ts` | **does not exist** | **Written from scratch.** One generic stateful store serving all nine models. |
| `stockFake.ts` | `location`, `itemStock`, `$transaction` (438-476) | unchanged — reused for `location` in the cart and log test files |
| `inventoryLogFake.ts` | `inventoryLog` only; `matchesLog` already applies `where.userId` (81) | add `findFirst`; otherwise unchanged. Or use `ownedRowFake`; task 7 picks and records which. |
| `cartItemFake.ts` | exports **no client**, only `cartItemMatches` (77) | unchanged. The cart test file uses `ownedRowFake` for `cartItem`. |
| `shoppingFake.ts` | `vendor.create` ignores `data.id` and generates `vendor-${++seq}` (106-107); no `vendor.upsert`, no `vendor.createMany`, no `vendor.findUnique` | **unchanged.** Do not extend it. The vendor tests use `ownedRowFake`, which honours `data.id`. `shoppingFake` stays as `cartBootstrap.test.ts` needs it. |

**`createMany({ skipDuplicates: true })` support goes in one shared place:
`ownedRowFake`.** `shoppingFake.cart.createMany` already models it (139-155)
and stays where it is; nothing else does.

`ownedRowFake` must model these constraints, each for a reason root `CLAUDE.md`
already records:

- `where` applied **key by key**, Prisma's own semantics
  (`where.x === undefined || row.x === where.x`), with `id` as a string or
  `{ in: [...] }`. Never a hardcoded `row.userId === where.userId`.
- **it throws on a `where` key it does not understand**, instead of ignoring it.
  That is the `cartItemFake` failure of PR 3c, where a dropped `cart` relation
  filter left every test green against a resolver with no location scope.
- `create` and `createMany` **honour `data.id`** and enforce the primary key
  with `P2002`. A fake that invents an id makes "the payload's ids are
  preserved" impossible to assert.
- `createMany({ skipDuplicates: true })` skips a duplicate id; without the flag
  it throws `P2002`.
- `upsert` keeps `create` and `update` **apart** and applies `update` key by
  key with `'key' in data`, not `data.key !== undefined`. That is what makes a
  `userId` left in `update` visible as a row that changed owner — the
  `shoppingFake.cart.upsert` failure of PR 4a task 4.
- `findUniqueOrThrow` throws `P2025` when nothing matches.
- an optional `relations` hook so `Item`'s `include: { tags, vendors }` and
  `Recipe`'s `include: { items }` resolve out of junction stores the test file
  owns.

It gets its own `ownedRowFake.test.ts`, because several of these constraints are
unreachable from the resolvers and an unreachable guard invites deletion as
dead code. That is the reasoning `stockFake.test.ts` already records.

### Every guard needs a two-user fixture

A single-user fixture cannot tell a scoped query from an unscoped one. Each new
test file seeds, at minimum:

- a row of the caller's that the payload names (so "replace mine" still works)
- a row of a **stranger's** whose id the payload names (the only thing that can
  tell the guard from no guard)
- an id no row holds (so "free to create" still works)

For the cart and log files, also three locations with one belonging to the
stranger, copying `import-itemStock.resolver.test.ts`'s fixture comment at
112-124.

## Real-SQL coverage

A cloud E2E spec reaches all nine `bulkCreate*` plus `bulkUpsertItems`
(`import-strategies.spec.ts` replace test, line 345). The other **eight**
upserts are reached by no spec: that file's fixture is built so only `items`
conflict (stated at its lines 34-38), so every other entity's upsert batch is
empty.

**`e2e/tests/cart-id-cross-user-leak.spec.ts` goes RED when the guard lands,
and that is the best news in this PR.** Its first test has account B call
`bulkCreateShoppingCarts` with the id `'no-vendor'`, which account A already
holds, and asserts `expect(createdForB.bulkCreateShoppingCarts).toEqual([])`
(line 166). With the guard that call throws `FORBIDDEN`, so the assertion fails.
The file is rewritten to assert the refusal instead. It then stops being a
characterisation of an open hazard — which is what its own comment at lines
39-54 says it is — and becomes the two-user real-SQL proof that the leak is
closed. Its doc comment at 12-15 already requires
`cleanupCloudData(request, thatUserId)` in both `beforeEach` and `afterEach`,
and `cleanupBothUsers` (lines 103-108) already does it.

Two-user cloud testing works through `e2e/utils/cloud.ts:17-36`,
`makeGql(request, userId = E2E_USER_ID)`, which sends `x-e2e-user-id`.

## Known gaps after this PR

1. The `clear` strategy can still empty an account and then refuse the import.
   Mitigated by a message, not fixed. Follow-up: validate ids before
   `clearAllData`.
2. No real-SQL coverage for eight of the nine upserts. See the plan's closing
   section.
3. A wrong `OwnedModel` literal compiles. Only the per-mutation tests catch it.
4. `bulkUpsertItems`' unguarded `itemVendor.createMany` can still raise an
   unhandled `P2003`.
5. Whether `@updatedAt` columns keep a payload's `updatedAt` is still
   unresolved, as `bulkCreateLocations`' comment at 963-973 records. Untouched
   here.
