# Bug: purge/import resolver mocks missing the `shelf` table

**Date:** 2026-08-24
**Issue:** [#250](https://github.com/ETBlue/player1inventory/issues/250)
**Area:** `apps/server` — purge + import resolvers (test-only defect)

## Bug description

Three tests fail on `main` in the server suite:

```
FAIL src/resolvers/purge.resolver.test.ts  > purgeUserData resolver > user can purge all their data and receive deleted counts
FAIL src/resolvers/purge.resolver.test.ts  > purgeUserData resolver > returns zero counts when user has no data
FAIL src/resolvers/import.resolver.test.ts > clearAllData          > user can clear all their data
```

All three surface as `AssertionError: expected [ { …(4) } ] to be undefined`, wrapping
`INTERNAL_SERVER_ERROR: Cannot read properties of undefined (reading 'deleteMany')`.

They were invisible to the documented verification gate, which never ran the server
suite — see companion issue [#251](https://github.com/ETBlue/player1inventory/issues/251).

## Root cause

Both resolvers delete the `shelf` table, but neither test's Prisma mock declares it, so
`prisma.shelf` is `undefined` at call time:

- `src/resolvers/purge.resolver.ts:34` — `prisma.shelf.deleteMany({ where: { userId } })`
- `src/resolvers/import.resolver.ts:511` — same

`purge.resolver.test.ts` mocked eleven models, ending at `vendor` — no `shelf` — and its
`MockPrisma` type had the same omission. `import.resolver.test.ts` contained no `shelf`
reference at all.

The shelf feature added the deletion to both purge paths and never updated the mocks.

**The production code is correct** — shelves genuinely should be purged. This is a
test-only fix.

The deeper defect is structural: each mock is a hand-maintained duplicate of a table list
that lives elsewhere, so every future table addition reintroduces this bug silently.

## Fix applied

Test-only. No resolver behaviour changed.

- `purge.resolver.test.ts` — added `shelf: { deleteMany: vi.fn() }` to the Prisma mock and
  to the `MockPrisma` type alias; extended the `$transaction` mock arrays from 11 to 12
  elements so `shelves.count` destructures correctly; added `shelves` to the
  `PURGE_MUTATION` selection set (it was never requested before, so the resolver's returned
  count went unasserted).
- `import.resolver.test.ts` — added `shelf: { findMany, upsert, deleteMany }` to the mock
  and its type alias; extended the `clearAllData` `$transaction` array from 11 to 12.

## Test added

**1. Direct assertions** — both suites now assert `prisma.shelf.deleteMany` was called with
`{ where: { userId } }`, and `purge.resolver.test.ts` asserts the returned `shelves` count.

**2. Schema-coverage guard** — new `apps/server/src/resolvers/purge-coverage.test.ts` (4
tests). It reads `prisma/schema.prisma` from disk (resolved via `import.meta.url`), parses
out every model declaring a `userId` field, and asserts each one appears as a
`prisma.<model>.deleteMany(` call in **both** resolver sources. Because it checks resolver
*source text*, no mock can satisfy it.

Non-vacuity is asserted explicitly: the parsed model list must deep-equal the expected nine
(`TagType`, `Tag`, `Vendor`, `Item`, `Recipe`, `Cart`, `CartItem`, `InventoryLog`, `Shelf`),
so a broken parser or moved schema fails loudly instead of making the loops iterate zero
times. Junction models (`ItemTag`, `ItemVendor`, `RecipeItem`) have no `userId` and are
deliberately out of scope — they are deleted through parent-relation filters.

### Mutation check

Per **Proving a Test Works**, each behaviour was deleted from the source and the suite
re-run. All three went RED, then green again on restore:

| Mutation | Result | Failing tests |
|---|---|---|
| Remove `prisma.shelf.deleteMany` from `purge.resolver.ts` | 🔴 RED | guard (`expected [ 'Shelf' ] to deeply equal []`) + `user can purge all their data…` |
| Remove `prisma.shelf.deleteMany` from `import.resolver.ts` | 🔴 RED | guard (`clearAllData deletes every user-owned model`) + `user can clear all their data` |
| Remove `prisma.vendor.deleteMany` from `purge.resolver.ts` | 🔴 RED | **guard only** (`expected [ 'Vendor' ] to deeply equal []`) |

The third mutation is the one that justifies the guard: **only the guard caught it.** Every
pre-existing test stayed green while a user-owned table silently stopped being purged —
which would have left rows behind after a "delete all my data" request.

Suite: 93 tests (3 failing) → **97 tests, 0 failing**.

## PR / commit

Branch `fix/server-suite-in-gate`. Companion issue [#251](https://github.com/ETBlue/player1inventory/issues/251)
wires the server suite into the root `pnpm test` so this class of failure cannot hide from
the verification gate again.
