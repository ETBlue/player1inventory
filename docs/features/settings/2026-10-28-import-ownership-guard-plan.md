# Plan — import ownership guard (issue #327)

Date: 2026-10-28
Branch: `fix/import-ownership-guard`, based on `main` at `aafb2d44`
Design: `docs/features/settings/2026-10-28-design-import-ownership-guard.md`
Issue: [#327](https://github.com/ETBlue/player1inventory/issues/327)

## What the user gets

Nothing new to look at. A hand-edited backup can no longer take over another
account's rows, a user's own row is no longer silently dropped, and a failed
post-login copy now shows a message with a Retry instead of closing as if it
had worked or hanging on "Copying…" forever.

New failure the user can hit: an import that names another account's row id is
refused. On the `clear` strategy that refusal arrives after the account has
been emptied. The user is told so in words.

## What the developer gets

| Gain | The specific thing |
|---|---|
| A failure that now has a name | `FORBIDDEN`, instead of a dropped row or a reassigned owner |
| Fewer ways to get it wrong | one function, `requireOwnRowOrUnclaimed` in `lib/authz.ts`, decides account ownership for all nine models |
| One place for RBAC | two seams: `requireLocationRole` for location-scoped data, `requireOwnRowOrUnclaimed` for account-scoped data |
| A test double that can fail | `src/test/ownedRowFake.ts` serves all nine models and is the only place `createMany({ skipDuplicates: true })` is modelled; it throws on a `where` key it does not understand |
| Fewer queries | five `bulkCreate*` mutations lose their per-row `findUnique` |
| Honest documentation | `cart-id-cross-user-leak.spec.ts` flips from "an open hazard" to "the leak is closed" |

Cost: `OwnedModel` is one more hand-maintained list, and a wrong literal
compiles. Per-mutation tests are what catch it.

## Rules every task must follow

1. **Measure your own baseline first.** Run the suite you will touch, write
   down the number, and never subtract from a number in this plan. Measured on
   this worktree on 2026-10-28: server **391 tests / 27 files**, web
   **2313 / 251**, `scripts/spec` **70**.
2. **Mutation check is required.** Break the named line, re-run the named test,
   confirm the named red text, restore, confirm green. Report which mutations
   you ran and that each went red. "I added tests" and "I verified these tests
   fail without the behaviour" are different claims.
3. **Never write `row.userId === ctx.userId`.** Root `CLAUDE.md` forbids it.
4. **Two-user fixtures only.** Every new test file seeds a row of the caller's,
   a row of a stranger's whose id the payload names, and an id no row holds. A
   single-user fixture cannot tell a scoped query from an unscoped one.
5. **No Playwright run inside a task.** The full E2E gate runs once, in task 13.
6. **No schema change in this PR.** No task adds a GraphQL type, field,
   argument or input, so no task runs `pnpm codegen`. If a task thinks it needs
   one, stop and report.
7. **Check `node -v` if you see widespread `localStorage` failures.** This
   machine's default is v25.8.0 and `.node-version` says 22.17.1. The suite
   passes on both, so widespread `localStorage` errors mean something else.
8. **Plain English in every report.** Short sentences, one idea per sentence,
   common words, main point first, tables for more than one item. Keep every
   file path, line number, identifier and number exact.
9. **Say what this plan got wrong.** An agent that silently works around a bad
   instruction leaves the next one to hit it.

Commands, always with an explicit path from the repo root:

```bash
pnpm --filter server test                       # server suite
pnpm --filter web test                          # web suite
pnpm test                                       # both
pnpm lint                                       # ROOT: apps/web/src + e2e/
pnpm typecheck
pnpm build 2>&1 | tee /tmp/p1i-build.log
```

---

## Task 1 — `requireOwnRowOrUnclaimed` in `lib/authz.ts`

**Files**

- `apps/server/src/lib/authz.ts`
- `apps/server/src/lib/authz.test.ts`

**Do**

1. Add `export type OwnedModel` naming the nine models, the private
   `OwnedRowDelegate` interface, `delegateFor(model)` and
   `export async function requireOwnRowOrUnclaimed(ctx, model, id)`. Body and
   doc comment: design decision 1.
2. Try `satisfies Record<OwnedModel, OwnedRowDelegate>` on the delegate table
   first and **report whether `tsc` accepts it**. If it does not, keep the
   single `as unknown as` cast inside `delegateFor` with a comment saying why,
   plus a runtime check that both methods exist.
3. The refusal must be `GraphQLError('Forbidden', { extensions: { code: 'FORBIDDEN' } })`
   — byte-identical to `requireLocationRole:38`, so "not yours" and "does not
   exist" stay indistinguishable.
4. Extend `authz.test.ts`'s `vi.hoisted` mock with `tag` and `item` stores,
   each applying `where` key by key. Add 6 tests, titled `user …` per root
   `CLAUDE.md`:
   - returns `'own'` for the caller's own row
   - returns `'unclaimed'` for an id no row holds
   - throws `/Forbidden/` for another user's row
   - the refusal for another user's row is the same message as for a missing
     id (a negative control — label it as such, it is not evidence)
   - an unauthenticated caller is refused before any lookup
   - `'item'` reads the `item` delegate, not `tag`: an id held only in the
     `tag` store returns `'unclaimed'` for `'item'`

**Mutation check**

| Break | Expect red |
|---|---|
| in `requireOwnRowOrUnclaimed`, change `findFirst({ where: { id, userId } })` to `findFirst({ where: { id } })` | `authz.test.ts` › `user cannot import under another account's row id` — `expected [Function] to throw error matching /Forbidden/ but it didn't` |
| delete `if (!own) throw …` | the same test, same text |
| in `delegateFor`, return `prisma.tag` unconditionally | `authz.test.ts` › the `'item'` routing test — `expected 'own' to be 'unclaimed'` |

**Commands**

```bash
pnpm --filter server test src/lib/authz.test.ts
pnpm --filter server test
pnpm typecheck
```

**Done when** `authz.test.ts` is 4 → 10 tests, the server suite is ≥ 391 + 6,
and all three mutations went red.

---

## Task 2 — `src/test/ownedRowFake.ts`

**Files**

- `apps/server/src/test/ownedRowFake.ts` (new)
- `apps/server/src/test/ownedRowFake.test.ts` (new)

**Do**

Write one generic stateful Prisma double, `createOwnedRowFake<Row extends { id: string; userId: string }>(options?)`,
exposing `findUnique`, `findFirst`, `findMany`, `create`, `createMany`,
`upsert`, `findUniqueOrThrow`, `deleteMany`, plus `state` and `reset(rows)`.

Model every constraint in the design's *The fakes* section. The non-negotiable
ones:

| Constraint | Why |
|---|---|
| `where` applied key by key, `where.x === undefined \|\| row.x === where.x` | a hardcoded `row.userId === where.userId` leaves a scoping test green after the resolver drops the scope |
| **throws** on a `where` key whose shape it does not understand | the `cartItemFake` failure of PR 3c: a dropped relation filter left every test green against a resolver with no scope |
| `id` as a string **or** `{ in: [...] }` | eight closing reads use `{ in: ids }` |
| `create` / `createMany` honour `data.id`, enforce the primary key with `P2002` | a fake that invents ids makes "the payload's ids are preserved" impossible to assert |
| `createMany({ skipDuplicates: true })` skips; without the flag it throws `P2002` | TagTypes, Vendors, Tags and Shelves write this way, and **no existing fake models it** |
| `upsert` keeps `create` and `update` apart, applies `update` with `'key' in data` | this is what makes a `userId` left in `update` visible as a row that changed owner |
| `findUniqueOrThrow` throws `P2025` | four closing reads use it |
| optional `relations` hook | `Item`'s `include: { tags, vendors }`, `Recipe`'s `include: { items }` |

`ownedRowFake.test.ts` pins each of these directly, because several are
unreachable from the resolvers — the reasoning `stockFake.test.ts` records.
Add a file-head comment in the same voice as `stockFake.ts`'s, listing what it
models and what it does not. **Not a test file**, so `tsc` type-checks it.

**Mutation check**

| Break | Expect red |
|---|---|
| in the matcher, change `where.userId === undefined \|\| row.userId === where.userId` to `true` | `ownedRowFake.test.ts` › `findFirst scoped by userId does not return another user's row` — `expected null to be null` fails as `expected { id: 'row_theirs', … } to be null` |
| make the unknown-key branch `return true` instead of throwing | `ownedRowFake.test.ts` › `an unsupported where key is refused, not ignored` — `expected [Function] to throw` |
| make `createMany` dedupe silently with no flag | `ownedRowFake.test.ts` › `createMany without skipDuplicates raises P2002` — `expected [Function] to throw error matching /P2002/` |
| make `upsert` return the existing row untouched | `ownedRowFake.test.ts` › `upsert applies only the keys its update payload carries` — `expected 'Old' to be 'New'` |

**Commands**

```bash
pnpm --filter server test src/test/ownedRowFake.test.ts
pnpm --filter server test
pnpm typecheck
```

---

## Task 3 — repair `import.resolver.test.ts`'s mock

**Files**

- `apps/server/src/resolvers/import.resolver.test.ts`

**Why this is its own task.** The guard calls `findFirst` on nine delegates.
That mock's `vi.mock` factory at lines 9-96 defines `findFirst` on `location`
only, so every one of its 11 tests would die with
`prisma.tag.findFirst is not a function`. This task runs **before** tasks 4-7
so those tasks see a clean baseline.

**Do**

1. Add `findFirst: vi.fn()` to `item`, `tag`, `tagType`, `vendor`, `recipe`,
   `inventoryLog`, `cart`, `cartItem` and `shelf` in the factory.
2. Add the nine entries to the `p` type that starts at line 99.
3. In `beforeEach` (206-210), arm all nine to `mockResolvedValue(null)` and
   arm the matching `findUnique`s to `null` too, so every payload id reads as
   unclaimed and the 11 existing tests keep their current behaviour.
4. Extend the comment at 194-203 to say that these recorders are armed to
   answer "nobody holds this id" for any id, so **no ownership assertion can
   fail in this file either** — the ownership tests live in tasks 4-7's files.
   Name those four files.

**Mutation check** — none. This task adds no behaviour. Say so in the report
rather than inventing one.

**Commands**

```bash
pnpm --filter server test src/resolvers/import.resolver.test.ts
pnpm --filter server test
```

**Done when** that file is still 11 tests green and the server total is
unchanged from task 2's number.

---

## Task 4 — guard Tag, TagType, Vendor and Shelf (8 mutations)

**Files**

- `apps/server/src/resolvers/import.resolver.ts`
- `apps/server/src/resolvers/import-ownership.resolver.test.ts` (new)

**Mutations:** `bulkCreateTags` (504), `bulkCreateTagTypes` (542),
`bulkCreateVendors` (556), `bulkCreateShelves` (890), `bulkUpsertTags` (735),
`bulkUpsertTagTypes` (750), `bulkUpsertVendors` (765), `bulkUpsertShelves` (1044).

**Do**

1. Add `requireOwnRowIdsOrUnclaimed` to `import.resolver.ts`, next to
   `requireOwnLocationIdsOrUnclaimed` (312-326), with the doc comment from
   design decision 1.
2. In each of the 8, call it after `requireAuth` and after the empty-array
   early return, before any write.
3. `bulkCreateTags`: delete the `findMany` at 524-527 and seed `insertedIds`
   from the returned set. Keep `skipDuplicates: true` at 533.
4. `bulkCreateShelves`: rebuild `existingIds` (893-895) from the returned set.
   Keep `skipDuplicates: true`.
5. `bulkCreateTagTypes` and `bulkCreateVendors`: the guard is the only change.
   Add a comment saying `skipDuplicates` can now only skip the caller's own
   rows.
6. All four upserts: take `userId` out of `update`, keep it in `create` — the
   shape `bulkUpsertLocations:1071-1104` uses.
7. All 8 closing `findMany`s (538, 552, 566, 913, 746, 761, 776, 1061): add
   `userId` to the `where`.
8. New test file, modelled on `import-itemStock.resolver.test.ts`. Its
   `vi.mock` factory builds four `ownedRowFake` stores. Fixture per model:
   one row of the caller's, one row of the **stranger's**, and an id no row
   holds. Per model, four tests titled `user …`:
   - `user cannot import a tag under an id another account's row holds` —
     `bulkCreateTags` → `FORBIDDEN`, stranger's row untouched, nothing written
   - the same for `bulkUpsertTags`
   - `user re-importing their own tag still replaces it` — `bulkUpsertTags`
     writes the new name and **does not change `userId`**
   - `user importing a batch with one forbidden row gets no rows written at all`
     — an allowed row placed **ahead** of the forbidden one; nothing on disk

   16 tests minimum. Add the 8 scoped-closing-read tests on top: a stranger's
   row holding an id the payload also names must not appear in the result.

**Mutation check — name the mutation, every time**

| Break | Expect red |
|---|---|
| delete `await requireOwnRowIdsOrUnclaimed(ctx, 'tag', tags)` from **`bulkUpsertTags`** | `import-ownership.resolver.test.ts` › `user cannot take over another account's tag` — `expected undefined to be 'FORBIDDEN'` |
| delete the same call from **`bulkCreateTags`** | › `user cannot import a tag under an id another account's row holds` — same text |
| delete the same call from **`bulkUpsertShelves`** | › `user cannot take over another account's shelf` — same text |
| delete the same call from **`bulkCreateVendors`** | › `user cannot import a vendor under an id another account's row holds` — same text |
| put `userId` back into **`bulkUpsertTags`**' `update` | › `user re-importing their own tag still replaces it` — `expected 'user_stranger' to be 'user_import_test'` on the stored row's `userId` |
| drop `userId` from **`bulkUpsertTagTypes`**' closing `findMany` | › `a tag type the caller does not own is not returned` — `expected [ 'tt_mine', 'tt_theirs' ] to deeply equal [ 'tt_mine' ]` |

Run every row. Do not stop at one. Root `CLAUDE.md` records a case where "break
one of them" was satisfied by the choice that proved nothing.

**Commands**

```bash
pnpm --filter server test src/resolvers/import-ownership.resolver.test.ts
pnpm --filter server test src/resolvers/import.resolver.test.ts
pnpm --filter server test
pnpm typecheck
```

---

## Task 5 — guard Item and Recipe (4 mutations)

**Files**

- `apps/server/src/resolvers/import.resolver.ts`
- `apps/server/src/resolvers/import-ownership-item.resolver.test.ts` (new)

**Mutations:** `bulkCreateItems` (427), `bulkCreateRecipes` (570),
`bulkUpsertItems` (685), `bulkUpsertRecipes` (780).

**Do**

1. Call `requireOwnRowIdsOrUnclaimed(ctx, 'item', items)` /
   `(ctx, 'recipe', recipes)` before each write loop.
2. `bulkCreateItems`: delete the per-row `findUnique` at 434-435, use
   `if (ownIds.has(id)) continue`.
3. `bulkCreateRecipes`: delete the per-row `findUnique` at 576-577, same
   replacement.
4. Both upserts: `userId` out of `update`, kept in `create`.
5. All four closing `findUniqueOrThrow`s (495, 592, 726, 804): add `userId` to
   the `where`, keeping `include`. **Confirm `tsc` accepts the extra filter on
   `findUniqueOrThrow`** and report the answer — `bulkCreateLocations:945`
   proves it for `findUnique`, not for this one. If `tsc` refuses, use
   `findFirstOrThrow({ where: { id, userId }, include })` and say so.
6. New test file. The `vi.mock` factory builds `item` and `recipe`
   `ownedRowFake` stores plus module-local `itemTag` / `itemVendor` /
   `recipeItem` junction stores and a `tag` store (for the `tagIds` filter at
   478-482). Wire the junction stores into `ownedRowFake`'s `relations` hook so
   `include` resolves. Tests per model, mirroring task 4's four, plus:
   - `user importing an item under another account's id keeps their own stock,
     tags and vendors` — nothing on `itemTag` / `itemVendor` either
   - `user re-importing their own item still replaces it and keeps its owner`

**Mutation check**

| Break | Expect red |
|---|---|
| delete the guard from **`bulkUpsertItems`** | `import-ownership-item.resolver.test.ts` › `user cannot take over another account's item` — `expected undefined to be 'FORBIDDEN'` |
| delete the guard from **`bulkCreateItems`** | › `user cannot import an item under an id another account's row holds` — same text |
| delete the guard from **`bulkUpsertRecipes`** | › `user cannot take over another account's recipe` — same text |
| delete the guard from **`bulkCreateRecipes`** | › `user cannot import a recipe under an id another account's row holds` — same text |
| put `userId` back into **`bulkUpsertItems`**' `update` | › `user re-importing their own item still replaces it and keeps its owner` — `expected 'user_stranger' to be 'user_import_test'` |
| drop `userId` from **`bulkUpsertRecipes`**' closing `findUniqueOrThrow` | › `a recipe the caller does not own is not returned` — the returned row's `userId` is the stranger's |

**Commands**

```bash
pnpm --filter server test src/resolvers/import-ownership-item.resolver.test.ts
pnpm --filter server test
pnpm typecheck
```

---

## Task 6 — guard Cart and CartItem (4 mutations)

**Files**

- `apps/server/src/resolvers/import.resolver.ts`
- `apps/server/src/resolvers/import-ownership-cart.resolver.test.ts` (new)

**Mutations:** `bulkCreateShoppingCarts` (631), `bulkCreateCartItems` (662),
`bulkUpsertShoppingCarts` (843), `bulkUpsertCartItems` (873).

**Note.** `bulkCreate/UpsertShoppingCarts` already authorize every `locationId`
through `resolveCartLocations` (207). Only the cart's **own** primary key is
unscoped. Put the new guard **after** `resolveCartLocations`, so a forbidden
location still fails first and the existing 19 tests in
`import-cart-location.resolver.test.ts` keep their current behaviour.

**Do**

1. Add the guard to all four. `'cart'` for the two cart mutations, `'cartItem'`
   for the two cart-item mutations.
2. Delete the per-row `findUnique` at 642-643 (carts) and 668-669 (cart items);
   use `ownIds`.
3. `bulkUpsertShoppingCarts`: `userId` out of `update` (857-860). `locationId`
   stays out of `update` — do not change that.
4. `bulkUpsertCartItems`: `userId` out of `update` (877). **`cartId` and
   `itemId` stay in `update`** — design decision 3 says why, and the comment
   must say it too.
5. No closing read on any of the four. Add a comment to each saying the guard
   is what makes the returned row the caller's, so there is no read here to
   scope.
6. New test file. The `vi.mock` factory needs `stockFake.client.location` (for
   `resolveCartLocations`), `ownedRowFake` for `cart` and `cartItem`, and a
   small scoped `item` store (for the `itemExists` check at 674). Fixture:
   three locations, one the stranger's, copying
   `import-itemStock.resolver.test.ts:112-124`.

**Mutation check**

| Break | Expect red |
|---|---|
| delete the guard from **`bulkUpsertShoppingCarts`** | `import-ownership-cart.resolver.test.ts` › `user cannot take over another account's cart` — `expected undefined to be 'FORBIDDEN'` |
| delete the guard from **`bulkCreateShoppingCarts`** | › `user cannot import a cart under an id another account's row holds` — same text |
| delete the guard from **`bulkUpsertCartItems`** | › `user cannot take over another account's cart item` — same text |
| delete the guard from **`bulkCreateCartItems`** | › `user cannot import a cart item under an id another account's row holds` — same text |
| put `userId` back into **`bulkUpsertCartItems`**' `update` | › `user re-importing their own cart item keeps its owner` — `expected 'user_stranger' to be 'user_import_test'` |

**Commands**

```bash
pnpm --filter server test src/resolvers/import-ownership-cart.resolver.test.ts
pnpm --filter server test src/resolvers/import-cart-location.resolver.test.ts
pnpm --filter server test
pnpm typecheck
```

---

## Task 7 — guard InventoryLog (2 mutations)

**Files**

- `apps/server/src/resolvers/import.resolver.ts`
- `apps/server/src/resolvers/import-ownership-log.resolver.test.ts` (new)
- `apps/server/src/test/inventoryLogFake.ts` (only if you reuse it)

**Mutations:** `bulkCreateInventoryLogs` (598), `bulkUpsertInventoryLogs` (810).

**Note.** Both already authorize every `locationId` through
`resolveLogLocations` (81). Put the new guard **after** it, so the existing 9
tests in `import-inventoryLog-location.resolver.test.ts` keep their behaviour.

**Do**

1. Add the guard with `'inventoryLog'` to both.
2. Delete the per-row `findUnique` at 609-610; use `ownIds`.
3. `bulkUpsertInventoryLogs`: `userId` out of `data` (819-825), added to
   `create` beside `locationId`. `locationId` stays out of `update` — do not
   change that.
4. Neither has a closing read. Add the same comment as task 6 step 5.
5. **Decide and record:** use `ownedRowFake` for `inventoryLog`, or add
   `findFirst` to `inventoryLogFake`. If you extend `inventoryLogFake`, keep
   `matchesLog`'s key-by-key semantics (line 81) and say in your report why a
   second fake was better than reuse.
6. New test file. Needs `stockFake.client.location`, the log fake, and a small
   `item` store.

**Mutation check**

| Break | Expect red |
|---|---|
| delete the guard from **`bulkUpsertInventoryLogs`** | `import-ownership-log.resolver.test.ts` › `user cannot take over another account's inventory log` — `expected undefined to be 'FORBIDDEN'` |
| delete the guard from **`bulkCreateInventoryLogs`** | › `user cannot import a log under an id another account's row holds` — same text |
| put `userId` back into **`bulkUpsertInventoryLogs`**' `update` | › `user re-importing their own log keeps its owner` — `expected 'user_stranger' to be 'user_import_test'` |

**Commands**

```bash
pnpm --filter server test src/resolvers/import-ownership-log.resolver.test.ts
pnpm --filter server test src/resolvers/import-inventoryLog-location.resolver.test.ts
pnpm --filter server test
pnpm typecheck
```

---

## Task 8 — scope the cross-model reference lookups (droppable)

**Files**

- `apps/server/src/resolvers/import.resolver.ts`
- the four test files from tasks 4-7

**This is the one task that may be dropped** if the PR is already too large.
If you drop it, file an issue and say so in the PR's *Known gaps*.

**Do** — copy `requireOwnItemStockRefs:394-397`,
`findFirst({ where: { id, userId }, select: { id: true } })`, at each of:

| Line | Reference | Change |
|---|---|---|
| 478-482 | `bulkCreateItems` tag filter | add `userId` to the `findMany` where |
| 716-719 | `bulkUpsertItems` `tagIds` | add the same scoped filter (there is none today) |
| 489-493, 721-723 | both items' `vendorIds` | add a scoped `vendor.findMany` filter |
| 582-586, 798-802 | both recipes' `items[].itemId` | add a scoped `item.findMany` filter |
| 672-673 | `bulkCreateCartItems` `cartId` | `cart.findFirst({ where: { id: cartId, userId } })` |
| 674-675 | `bulkCreateCartItems` `itemId` | `item.findFirst({ where: { id: itemId, userId } })` |
| 611 | `bulkCreateInventoryLogs` `itemId` | `item.findFirst({ where: { id: itemId, userId } })` |

Keep the existing `continue` for a reference that does not resolve — do **not**
turn these into `FORBIDDEN`. A missing parent is a normal thing in a partial
backup, and `requireOwnItemStockRefs` throws only because `ItemStock` has no
other scope. Say this in a comment.

**Mutation check**

| Break | Expect red |
|---|---|
| drop `userId` from **`bulkCreateCartItems`**' `cartId` lookup | `import-ownership-cart.resolver.test.ts` › `user importing a cart item for another account's cart gets nothing written` — `expected 1 to be 0` on the stored cart-item count |
| drop `userId` from **`bulkCreateItems`**' tag filter | `import-ownership-item.resolver.test.ts` › `user importing an item tagged with another account's tag gets no tag link` — `expected [ 'tag_theirs' ] to deeply equal []` |
| drop `userId` from **`bulkCreateInventoryLogs`**' `itemId` lookup | `import-ownership-log.resolver.test.ts` › `user importing a log for another account's item gets nothing written` — `expected 1 to be 0` |

**Commands**

```bash
pnpm --filter server test
pnpm typecheck
```

---

## Task 9 — rewrite `cart-id-cross-user-leak.spec.ts`

**Files**

- `e2e/tests/cart-id-cross-user-leak.spec.ts`

**Why.** Its first test (lines 120-225) **will go red** once task 6 lands.
Account B calls `bulkCreateShoppingCarts` with `'no-vendor'`, an id account A
already holds, and asserts
`expect(createdForB.bulkCreateShoppingCarts).toEqual([])` at line 166. With the
guard, `makeGql` throws because the response carries errors. This is the
PR's only real-SQL two-user proof, so it must be rewritten, not deleted.

**Do**

1. Rewrite test 1 as the proof the leak is closed:
   - A imports the bare cart id and succeeds (unchanged, lines 149-157).
   - B's same import now **rejects**:
     `await expect(gqlB(BULK_CREATE_CARTS, { carts: [{ id: BARE_CART_ID }] })).rejects.toThrow(/FORBIDDEN/)`
   - A's cart row is untouched: `allCarts` for A still `[BARE_CART_ID]`.
   - B has no cart: `allCarts` for B is `[]` — the same as before, now for the
     right reason.
   - If task 8 landed: B's `bulkCreateCartItems` naming A's cart writes
     nothing. If task 8 was dropped, keep the current assertion and add a
     comment naming the follow-up issue.
2. Rewrite the file's header comment. The three blocks that must change:
   - `WHAT THIS FILE DOES *NOT* PROVE` (lines 25-37)
   - `THIS IS A NEGATIVE CONTROL, AND IT STAYS GREEN AFTER PR 4b` (39-54) —
     delete it. It is no longer a negative control. It has a red-to-green
     transition now, and that is the point.
   - `THE UNDERLYING CLASS OF HOLE IS IS ISSUE #327` (55-60) — rewrite to say
     #327 is closed and name this PR.
3. Leave test 2 (`a location-prefixed cart id gives each account its own cart
   row`, from line 226) alone. Both ids are free, so the guard changes nothing.
4. `cleanupBothUsers` (103-108) in both `beforeEach` and `afterEach` stays —
   `e2e/utils/cloud.ts:12-15` requires it for any extra user.

**Mutation check** — do **not** run Playwright here (rule 5). Instead, read the
spec against the task-6 diff and write down, in your report, which line of the
new spec would fail if the guard in `bulkCreateShoppingCarts` were deleted. The
run happens in task 13.

**Commands**

```bash
pnpm lint:e2e
pnpm typecheck:e2e
```

---

## Task 10 — `isForbiddenImportError` and `ImportCard` copy

**Files**

- `apps/web/src/lib/importData.ts`
- `apps/web/src/lib/importData.test.ts`
- `apps/web/src/components/settings/ImportCard/ImportCard.tsx`
- `apps/web/src/components/settings/ImportCard/index.test.tsx`
- `apps/web/src/i18n/locales/en.json`, `tw.json`

**Do**

1. Export `isForbiddenImportError` from `importData.ts` — design decision 7.
   It must read `extensions.code`, **not** the message text, and the comment
   must say why: Apollo's message for this is the bare word `Forbidden`, which
   the server also sends for "not found" on purpose.
2. Update the comment block at `importData.ts:1869-1873` so it names the whole
   guard family, not just `requireOwnItemStockRefs`, and says what the user is
   told after a failed `clear`.
3. `ImportCard.tsx`: store `errorKind: 'forbidden' | 'other'` on the `error`
   phase (set in the `catch` at 181-193) and pick the i18n key in the render
   (the `phase === 'error'` block at 277-298). The `clear` variant is chosen
   from `importStatus.session.strategy`. Keep the Retry button exactly as it is.
4. Add `settings.import.importErrorForbidden` and
   `settings.import.importErrorForbiddenAfterClear` to **both** `en.json` and
   `tw.json`. Values: design decision 7. Mark the TW values as **drafts** in
   your report — no test asserts a TW string, and the owner rewrites this copy.
5. Tests:
   - `importData.test.ts`: 3 tests on `isForbiddenImportError` — a real
     `new CombinedGraphQLErrors({ errors: [{ message: 'Forbidden', extensions: { code: 'FORBIDDEN' } }] })`
     is true; a plain `new Error('Forbidden')` is **false** (this is the test
     that stops a string match creeping back in); a `BAD_USER_INPUT` error is
     false.
   - `ImportCard/index.test.tsx`: 2 tests. A `FORBIDDEN` rejection on `replace`
     shows the forbidden sentence and the Retry button. The same on `clear`
     shows the after-clear sentence. Drive them with
     `vi.mocked(importCloudData).mockRejectedValueOnce(…)`, the pattern already
     at line 188.
6. **No new story.** Root `CLAUDE.md` records that this phase is reachable only
   through a mocked module, so it gets a `.test.tsx` and not a story. Three
   hand-written fake stories were deleted from this exact component on
   2026-10-13 for that reason.

**Mutation check**

| Break | Expect red |
|---|---|
| change `isForbiddenImportError` to `err instanceof Error && err.message === 'Forbidden'` | `importData.test.ts` › `a plain Error saying Forbidden is not a FORBIDDEN import error` — `expected true to be false` |
| in `ImportCard.tsx`, always use `settings.import.importError` | `ImportCard/index.test.tsx` › `user sees why a cross-account import was refused` — the forbidden sentence is not found; `Unable to find an element with the text` |
| in `ImportCard.tsx`, use `importErrorForbidden` for every strategy | › `user sees that their cloud data was cleared before the refusal` — same shape |

**Commands**

```bash
pnpm --filter web test src/lib/importData.test.ts
pnpm --filter web test src/components/settings/ImportCard
pnpm --filter web test
pnpm lint
```

---

## Task 11 — the post-login migration stops swallowing errors

**Files**

- `apps/web/src/hooks/usePostLoginMigration.ts`
- `apps/web/src/hooks/usePostLoginMigration.test.ts`
- `apps/web/src/components/global/PostLoginMigrationDialog/PostLoginMigrationDialog.tsx`
- `apps/web/src/components/global/PostLoginMigrationDialog/index.test.tsx`
- `apps/web/src/i18n/locales/en.json`, `tw.json`

**Do**

1. `MigrationState` gains `'error'`. The hook returns
   `error: { forbidden: boolean; message: string } | null`.
2. The auto-import `.catch` (lines 99-105) sets `'error'` with the message
   instead of `'done'`. **Keep** `localStorage.removeItem(MIGRATION_STRATEGY_KEY)`
   so the failure cannot loop, and **keep** `MIGRATION_PROMPTED_KEY` unset so a
   refresh can retry. Rewrite the comment to say the state is now `'error'` and
   why both localStorage decisions are unchanged.
3. `importData` (lines 122-129) wraps its body in `try`/`catch` and sets
   `'error'`. This is what removes the unhandled rejection behind
   `PostLoginMigrationDialog.tsx:114`'s `onClick={() => importData('append')}`.
4. `PostLoginMigrationDialog.tsx`: a third `AlertDialog`, open on
   `state === 'error'`, showing `errorTitle` plus `errorForbidden` or
   `errorOther` (interpolating `{{message}}`), with one button calling
   `dismiss()` labelled from `common.done`. Leave the other two dialogs' `open`
   conditions alone.
5. Add `settings.postLoginMigration.errorTitle`, `errorForbidden` and
   `errorOther` to **both** locale files. TW values are drafts — say so.
6. Tests:
   - **`usePostLoginMigration.test.ts:157`, `transitions to done even when
     importCloudData rejects`, goes RED on purpose.** Rewrite it as
     `user sees an error when the automatic copy is refused`: state becomes
     `'error'`, `error.forbidden` is `true`, `MIGRATION_STRATEGY_KEY` is
     removed, `MIGRATION_PROMPTED_KEY` is still null.
   - Add `user sees an error when they press Import and it is refused` — reject
     from the `importData` path and assert state `'error'`.
   - `PostLoginMigrationDialog/index.test.tsx`: 1 test that the error dialog
     renders the forbidden sentence and the dismiss button.
7. **No new story**, for the same reason as task 10.

**Mutation check**

| Break | Expect red |
|---|---|
| put `setState('done')` back in the auto-import `.catch` | `usePostLoginMigration.test.ts` › `user sees an error when the automatic copy is refused` — `expected 'done' to be 'error'` |
| delete the `try`/`catch` from `importData` | › `user sees an error when they press Import and it is refused` — `expected 'importing' to be 'error'` plus an unhandled rejection |
| delete the `state === 'error'` dialog from `PostLoginMigrationDialog.tsx` | `PostLoginMigrationDialog/index.test.tsx` › `user sees why the copy was refused` — `Unable to find an element with the text` |
| delete `localStorage.removeItem(MIGRATION_STRATEGY_KEY)` from the `.catch` | `usePostLoginMigration.test.ts` › the same rewritten test — `expected 'clear' to be null` |

**Commands**

```bash
pnpm --filter web test src/hooks/usePostLoginMigration.test.ts
pnpm --filter web test src/components/global/PostLoginMigrationDialog
pnpm --filter web test src/i18n
pnpm --filter web test
pnpm lint
```

---

## Task 12 — documentation

**Files**

- `docs/features/settings/2026-10-28-design-import-ownership-guard.md`
- `docs/features/settings/2026-10-28-import-ownership-guard-plan.md`
- `docs/INDEX.md`
- `CLAUDE.md` (root)

**Do**

1. Fill in the design doc's open questions with the measured answers:
   - does `satisfies Record<OwnedModel, OwnedRowDelegate>` type-check (task 1)
   - does `findUniqueOrThrow` accept `where: { id, userId }` (task 5)
   - was task 8 done or dropped
2. Update the plan with final counts and any task that diverged.
3. `docs/INDEX.md`: add this row under **Features**, next to the other
   `features/settings/` rows (lines 42-44):

   ```
   | [import-ownership-guard](features/settings/) | 🔲 Pending | Issue #327 — nine `bulkUpsert*` import mutations let one user overwrite and take ownership of another user's row, and nine `bulkCreate*` silently dropped the caller's own row when a stranger held the id. One guard, `requireOwnRowOrUnclaimed` in `apps/server/src/lib/authz.ts`, now decides account ownership for all nine models; `userId` comes out of all nine `update` payloads; the 12 closing reads are scoped. The client half ships with it: two of three `importCloudData` call sites swallowed errors, so the server guard alone would have moved the post-login copy from silently wrong to silently stuck. New shared test double `apps/server/src/test/ownedRowFake.ts`, the only place `createMany({ skipDuplicates: true })` is modelled. `e2e/tests/cart-id-cross-user-leak.spec.ts` flips from a characterisation of an open hazard to the two-user real-SQL proof that it is closed. — [design](features/settings/2026-10-28-design-import-ownership-guard.md) — [plan](features/settings/2026-10-28-import-ownership-guard-plan.md) — issue #327 |
   ```

   Change `🔲 Pending` to `✅ Implemented` only after task 13 passes.
4. Root `CLAUDE.md`, three edits:
   - **Authorization (cloud)**, after the `requireLocationRole` paragraph: name
     `requireOwnRowOrUnclaimed` as the second seam, for account-scoped models
     that belong to no location, and say its body is what changes when
     households or RBAC land.
   - **Write test doubles to model the constraint**: add `ownedRowFake` to that
     list, and record the sixth instance — nine models' ownership was untestable
     because no fake existed for five of them and
     `createMany({ skipDuplicates: true })` was modelled nowhere.
   - the `pnpm test` counts paragraph: the new numbers, dated 2026-10-28, with
     the branch name.
5. Update the comment at `import.resolver.ts:289-302`
   (`requireOwnLocationIdsOrUnclaimed`'s doc). It currently says the other 18
   mutations ship the two holes. They no longer do.

**Mutation check** — none. Documentation. Say so.

**Commands**

```bash
pnpm lint
```

---

## Task 13 — the full gate

**Do** — run every command, from the repo root, with explicit paths. Record
every number.

```bash
pnpm lint
pnpm build 2>&1 | tee /tmp/p1i-build.log
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL: deprecated imports" || echo "OK"
(cd apps/web && pnpm build-storybook)
(cd apps/web && pnpm check)
pnpm test
pnpm test:spec
pnpm test:e2e:all
```

`pnpm test:e2e:all` runs `local`, `cloud` and `pwa` as three separate
invocations. The specs most likely to be affected, in order:

| Spec | Why |
|---|---|
| `e2e/tests/cart-id-cross-user-leak.spec.ts` | rewritten in task 9; this is the proof |
| `e2e/tests/settings/import-strategies.spec.ts` | reaches all nine `bulkCreate*` and `bulkUpsertItems`; its `clear` test already runs near the 30s budget |
| `e2e/tests/settings/import-export-cloud.spec.ts` | cloud → cloud round trip, the one 4a broke at its line 133 |
| `e2e/tests/settings/data-mode-migration.spec.ts` | drives the `clear` strategy through `DataModeCard` |
| `e2e/tests/item-stock-pager.spec.ts` | seeds through the bulk mutations |

All of these import as a single user, so every payload id is the caller's own
and the guard allows them. If one goes red, read the failure before changing
anything — a FORBIDDEN there means the guard refused the caller's own row,
which is a bug in the guard.

**Done when** every command exits 0 and the counts are written down.

---

## E2E coverage for the eight unreached upserts

**Out of scope for this PR. Filed as a follow-up.**

Reached by a cloud spec today: all nine `bulkCreate*`, plus `bulkUpsertItems`
(`import-strategies.spec.ts` replace test, line 345).
**Not reached:** `bulkUpsertTags`, `bulkUpsertTagTypes`, `bulkUpsertVendors`,
`bulkUpsertRecipes`, `bulkUpsertInventoryLogs`, `bulkUpsertShoppingCarts`,
`bulkUpsertCartItems`, `bulkUpsertShelves`. The reason is that file's fixture:
it is built so only `items` conflict (stated at its lines 34-38), so every
other entity's upsert batch is empty.

**Recommendation: follow it up, do not do it here.** Three reasons.

1. The guard's cross-user behaviour **is** proved against real Postgres by
   task 9, for `bulkCreateShoppingCarts`, with two real accounts. The guard is
   one function with one body; the eight unreached upserts call the same
   function with a different model literal.
2. The remaining risk for those eight is the **shape of the `update` payload**,
   and that is pinned key by key by `ownedRowFake.upsert`. A `userId` left in
   `update` turns a named test red in tasks 4-7.
3. The cost is high and lands on a shared file. Making eight more entities
   conflict means rewriting `e2e/fixtures/strategy-backup.json` and
   `seedDestination`, which every test in `import-strategies.spec.ts` reads,
   and lengthening a test that already needed `test.setTimeout(60000)` once in
   this area.

The follow-up issue should say exactly what to change: add one colliding row
per entity to `strategy-backup.json`, seed the matching row in
`seedDestination` under a different name, and assert the destination's value
after `replace`. Give it its own spec file rather than growing
`import-strategies.spec.ts`, so the 30s budget stays with the existing tests.
