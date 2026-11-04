# Bug: tag, tag type and vendor writes do not check whose row they change

**Date:** 2026-11-04
**Branch:** `fix/catalog-write-scope`
**Areas:** server resolvers (`tag.resolver.ts`, `vendor.resolver.ts`). Two feature areas, so this
doc lives in `docs/global/bugs/`.

## Bug description

In cloud mode, seven writes check only that the caller is signed in. They then write with
`where: { id }` alone. Any signed-in user who knows the id of another account's vendor, tag type
or tag can rename or delete it.

| Mutation | File:line (at `e48bbe2f`) | Unscoped write |
|---|---|---|
| `updateVendor` | `apps/server/src/resolvers/vendor.resolver.ts:45-54` | `vendor.update({ where: { id } })` |
| `deleteVendor` | `vendor.resolver.ts:55-74` | the last step, `vendor.delete({ where: { id } })`. Its cart cleanup before it is scoped |
| `updateTagType` | `apps/server/src/resolvers/tag.resolver.ts:33-46` | `tagType.update({ where: { id } })` |
| `deleteTagType` | `tag.resolver.ts:47-57` | the last step, `tagType.delete({ where: { id } })`. Its tag cleanup before it is scoped |
| `updateTag` | `tag.resolver.ts:64-76` | `tag.update({ where: { id } })`, and `typeId` / `parentId` are not checked |
| `deleteTag` | `tag.resolver.ts:77-100+` | `findMany({ parentId })`, `deleteMany({ id: { in } })`, `updateMany({ parentId })`, `delete({ id })` |
| `createTag` | `tag.resolver.ts:58-63` | `typeId` / `parentId` are not checked |

**How serious:** the ids are `cuid()` values, so they cannot be guessed. But nothing in the code
stops the write once an id is known, for example from a shared backup file.

Found 2026-11-03 by the households H3 research. Issue #273 covers the same kind of gap for item
tag and vendor ids, but does not list these.

## Root cause

These resolvers were written before any ownership helper existed, and call `requireAuth(ctx)`
without using the user id it returns. The other catalog resolvers (`item`, `recipe`, `shelf`)
check the row first with `{ id, userId }`.

## Fix applied

Each of the seven mutations now calls `requireOwnRowOrUnclaimed(ctx, model, id)`
(`apps/server/src/lib/authz.ts`) before it writes. No call site compares a `userId`, so
households H3 changes only the helper's body.

| Helper answer | Update mutation | Delete mutation | `typeId` / `parentId` on `createTag` / `updateTag` |
|---|---|---|---|
| `'own'` | writes, as before | deletes, as before | accepted |
| throws `FORBIDDEN` | nothing written | nothing deleted | nothing written |
| `'unclaimed'` | `NOT_FOUND`, same message as before | the old result: `false`, or `true` for `deleteTag` with `deleteChildren` | `BAD_USER_INPUT` (before: a foreign-key error from Postgres) |

Other details:

- `deleteVendor` and `deleteTagType` now check ownership **before** their cleanup. Before,
  a refused call would already have deleted the caller's own carts (or tags) that name the
  other account's id. In `deleteVendor` the check is outside the `try`, so `FORBIDDEN`
  reaches the client instead of becoming `false`.
- A missing id in `deleteVendor`, `deleteTagType` and `deleteTag` now returns at once and
  writes nothing. The return value is the same as before. Before, the scoped cleanup still
  ran for that id.
- `deleteTag`'s descendant walk (`findMany({ where: { parentId, userId } })`) and its
  orphaning `updateMany({ where: { parentId: id, userId } })` now filter by the caller.
  Another account's tag may sit under the caller's tag, because `createTag` did not check
  `parentId`. That tag is no longer deleted or written by the resolver. Postgres still sets
  its `parentId` to null when the parent is deleted (`Tag_parentId_fkey` is
  `ON DELETE SET NULL`).
- `updateTag` with `typeId: null` is left to Prisma, as before (the column is NOT NULL).

## Test added

- `apps/server/src/resolvers/catalog-ownership.resolver.test.ts` — **29 tests**, two users,
  run against the stateful `ownedRowFake`. For each mutation: another account's row is
  refused and left unchanged, the caller's own row still works, and a missing id keeps the
  old result. The fixture holds cross-account rows the old `createTag` allowed (my tag of
  their type, their tag under my tag). Those rows are what make "a refused call changes
  nothing" and "the walk stays in my rows" able to fail.
- `apps/server/src/test/ownedRowFake.ts` gained `update`, `delete`, `updateMany` and a
  `columns` option for extra `where` keys. **4 tests** in `ownedRowFake.test.ts` pin them.
- `tag.resolver.test.ts` and `vendor.resolver.test.ts` mock the helper's two reads and
  expect the new `userId` filter on `deleteTag`'s `updateMany`.

Server tests: **644 / 39 files before, 677 / 40 after**.

Mutation check: each guard was removed or broken in the source, one at a time, and the
new file was run. 16 of 17 mutations turned at least one named test red. The one that
stayed green is removing only `deleteTag`'s `if (scope === 'unclaimed') return …` line. It
gives the same result, because the old code path returns the same values for a missing id.
So it is an equivalent change, not a missing test.

## PR / commit

- `b1c0ebee` — fix(server): check ownership before tag, tag type and vendor writes
- `e28ed118` — docs(claude): name the seven catalog mutations requireOwnRowOrUnclaimed now guards
- PR: not opened yet (branch `fix/catalog-write-scope`, not pushed).

## Not fixed here

- Rows that the old code already allowed may exist in a real database: a tag whose
  `typeId` or `parentId` names another account's row. This fix stops new ones but does
  not find or repair old ones. Because `Tag_typeId_fkey` is `ON DELETE RESTRICT`, such a
  tag still makes the owner's `deleteTagType` return `false`.
- The same kind of unchecked reference exists elsewhere (report only): `createItem` /
  `updateItem` `tagIds` and `vendorIds` (issue #273), `createRecipe` / `updateRecipe`
  `items[].itemId`, `createShelf` / `updateShelf` `itemIds` and `filterConfig` ids, and
  `applyShelfFilterPicks` `addTagIds` / `addVendorIds`.
