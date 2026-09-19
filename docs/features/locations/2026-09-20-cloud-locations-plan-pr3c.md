# Plan — PR 3c: unit switch and the remove cascade

**Date:** 2026-09-20
**Branch:** `feature/cloud-locations-pr3c`
**Worktree:** `.worktrees/feature-cloud-locations-pr3c`
**Base:** `6abd0948`
**Design:** `2026-08-30-cloud-locations-design.md` §2, §8 Amendment
**Brainstorming:** `2026-09-20-brainstorming-pr3c.md`

Four tasks. Each ends with the full verification gate from root `CLAUDE.md`.

## Standing rules

- **Never print a database connection string or a database hostname.**
- `apps/server/.env` is gitignored and stays that way.
- **Never write `row.userId === ctx.userId` as an authorization check.** Route
  through `requireLocationRole` (`apps/server/src/lib/authz.ts`).
- `ItemStock` must never gain a `userId` column.
- **No Prisma migration.** Both items are resolver and client work on tables that
  already exist. If one seems needed, stop and report why.
- **`pnpm verify:migration` needs the user's explicit consent every time.** Do not
  run it. No migration means no reason to.
- Before any Playwright run, check ports 5175, 5174 and 4001 are free and stay
  free for about 90 seconds. **A third worktree (`fix/cors-preview-origins`)
  exists that is not this work** — the ports are shared across all worktrees, so
  another session may be using them. Never kill another session's server.
- **Do not narrow the E2E run with `--grep`.** Pass positional spec paths.
- **8 E2E tests are already red on `main`** — `item-list-state-restore.spec.ts`,
  4 local and 4 cloud, issue #280. Any ninth failure is this branch's.

---

## Task 1 — Teach the Prisma fake to roll back

This comes first because Task 2 cannot be proved without it.

`apps/server/src/test/stockFake.ts` states that it does not model `$transaction`.
PR 2 left it absent on purpose, so no test could make an atomicity claim it had
not earned. Task 1 earns it.

**Step 1.1.** Add `$transaction` to the fake. Snapshot the in-memory state when
it opens; restore that snapshot if the callback throws; keep the writes if it
returns.

Prisma's `$transaction` has **two** forms. Check which ones the resolvers use
before deciding what to support:

- an array of promises — `prisma.$transaction([...])`
- an interactive callback — `prisma.$transaction(async (tx) => { ... })`

`applyUnitSwitch` needs the callback form. Say which you implemented and why.

**Step 1.2.** The snapshot must be a real copy, not a reference. A shallow copy
of an array of objects restores the array but not the objects, so a mutation to a
row survives the rollback. Say how you copied and how you proved it.

### Mutation check (required)

Write a test that starts a `$transaction`, writes, then throws. Assert the state
is unchanged.

Then **break the fake** — make the rollback a no-op — and confirm that test goes
RED. A rollback fake that silently does nothing is worse than no fake, because
every later atomicity test would report as covered.

### Report

- which `$transaction` forms you support
- how you copied the state, and the test that proves a nested object is restored
- the mutation check result

---

## Task 2 — `applyUnitSwitch`

**Step 2.1.** Add the mutation to `apps/server/src/schema/itemStock.graphql`.
Model the input on local's `UnitSwitchBatchInput` (`apps/web/src/types`), which
carries `itemId`, `updates`, `stockConversions` (one per location) and
`recipeUpdates`.

**Step 2.2.** The resolver is **one `prisma.$transaction`** covering the item
update, every stock conversion, and every recipe update. Local does the same over
`items`, `itemStocks` and `recipes`.

**Step 2.3. Authorization — check every location before writing anything.**
`stockConversions` names several locations. Decided 2026-09-20: if the caller
lacks `member` on any one of them, the whole mutation fails with `FORBIDDEN` and
nothing changes. Converting only some leaves the item in mixed units, which is
the corruption the transaction exists to prevent.

Do the checks **before** opening the transaction, so a refusal has written
nothing even if rollback were broken.

This cannot fire today — every location belongs to one user. It is built this way
so RBAC is one function body later.

**Step 2.4.** The client. `apps/web/src/hooks/useItems.ts` around line 928 throws
`LOCAL_ONLY_UNIT_SWITCH` in cloud. Replace with the cloud branch.

**Step 2.5. `buildStockConversions` gates on `isLocal`.** That is why no test
fails on the missing mutation today — the dialog never lists conversions the
cloud branch could not write. Find it, remove the gate, and check what else that
gate was hiding.

### Mutation checks (required)

| # | Mutation | What must go RED |
|---|---|---|
| 1 | Drop the `$transaction`, run the writes in sequence | a test where a later write throws — earlier writes must not survive |
| 2 | Check only the first location's role | a test where the caller lacks a role on the **second** location |
| 3 | Convert only the default location's stock | a test asserting a non-default location's quantities changed |

**Every fixture needs at least two locations with different quantities**, so
"converted every location" is distinguishable from "converted one". A
single-location fixture cannot fail here. This has now caught us three times in
this series — PR 2's fixtures, PR 3a's mock, PR 3b's 218 green tests.

---

## Task 3 — `removeItemFromLocation`'s cloud cascade

**Step 3.1.** The resolver (`apps/server/src/resolvers/itemStock.resolver.ts:153`)
deletes the `ItemStock` row only. Add the same two deletes local does
(`apps/web/src/db/operations.ts:134`):

- inventory logs for that (item, location)
- cart entries for that item in that location's carts

**Cloud cart entries are found through the cart id**, which since PR 3b is
`${locationId}:${vendorId}`. Use `parseCartId` from
`apps/server/src/lib/cartId.ts` — **not** a string prefix. A vendor id containing
`':'` would defeat a prefix match, which is why local's comment says the same.

Local's log filter reads `(log.locationId ?? DEFAULT_LOCATION_ID) === locationId`.
**Cloud's column is `NOT NULL` since PR 3a**, so do not copy the `??` — a
fallback written where NULLs cannot occur misleads the next reader.

**Step 3.2.** One `$transaction` — three deletes that must not half-apply.

**Step 3.3.** Remove the `mode === 'local'` guard on the Stock tab confirmation
line (`apps/web/src/routes/items/$id/stock.tsx:215`) and update its comment,
which explains a state that will no longer exist.

### Mutation checks (required)

| # | Mutation | What must go RED |
|---|---|---|
| 1 | Delete only the stock row, as before | a test asserting the logs and cart entries went too |
| 2 | Match cart ids by string prefix instead of `parseCartId` | a fixture with a vendor id containing `':'` |
| 3 | Delete logs for the item at **every** location | a test asserting another location's logs survived |

Mutation 3 is the one a single-location fixture cannot catch.

---

## Task 4 — Docs, gate, full E2E

**Step 4.1.** Update `cloud-locations-status.md` — PR 3c done, and **PR 3 is now
complete**. Update `docs/INDEX.md`'s short row.

**Step 4.2.** Check every `CLAUDE.md` whose content this changes. At minimum
`apps/web/src/routes/items/CLAUDE.md` (the Stock tab) and the test-double note in
root `CLAUDE.md`, which says the fake does not model transactions — that becomes
false in Task 1.

**Step 4.3.** Full verification gate.

**Step 4.4.** `pnpm test:e2e` — everything, no `--grep`. Expected: the 8 known
issue #280 failures and nothing else.

### Report

- gate results command by command
- E2E counts, failures named individually
- **what PR 4 and PR 5 still owe** — this is the last task of PR 3 as a whole
