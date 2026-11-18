# Bug: a failed refresh after a save shows the save as failed

**Date:** 2026-11-18
**Branch:** `fix/refetch-and-migration-catch`
**Areas:** item, stock, recipe and shelf hooks (`apps/web/src/hooks/useItems.ts`,
`useRecipes.ts`, `useApplyShelfFilterPicks.ts`). Several feature areas, so this doc lives in
`docs/global/bugs/`.

## Bug description

In cloud mode, eight mutation calls use `refetchQueries` with `awaitRefetchQueries: true`.
When the server saves the write but one of the follow-up reads fails (for example a weak
connection), the mutation promise REJECTS. The screen then treats a save that worked as a
save that failed.

| # | Hook (at `938fa2aa`) | What the person sees after a false error | Repeat is |
|---|---|---|---|
| 1 | `useCreateItem`, stock step, `useItems.ts:714` | `NewItemDialog` stays open with no message; `ShelfDetailView` and shopping keep the input and skip the shelf append | **a second item** (the server makes the id) |
| 2 | `useAddItemToLocation`, `useItems.ts:881` | search row hides the error; `NewItemDialog` stays open; Stock tab shows `addFailed` | safe |
| 3 | `useRemoveItemFromLocation`, `useItems.ts:976` | toast `removeFailed` | safe |
| 4 | `useUpdateItem`, stock step, `useItems.ts:1096` | `QuickUpdateDialog` stays open; the item form does not go back | safe |
| 5 | `useApplyUnitSwitch`, `useItems.ts:1206` | the confirm dialog stays open | safe (not fully traced) |
| 6–7 | `useUpdateRecipe`, `useRecipes.ts:223` and `:243` | the recipe items page keeps the input after create + link | **a second item** in `recipes/$id/items.tsx` |
| 8 | `useApplyShelfFilterPicks`, `useApplyShelfFilterPicks.ts:81` | the dialog shows an inline error | safe |

The same bug on the Members page was fixed in households H5b (#385) with `refetchAfterWrite`.

## Root cause

Apollo Client 4.1.6. With `awaitRefetchQueries` set, `markMutationResult` returns
`Promise.all(results)` over the refetches (`core/QueryInfo.js:348-352`), so one failed
refetch rejects the mutation. `client.refetchQueries` also uses `Promise.all`
(`ApolloClient.js:450-458`).

Several callers need the wait (the search tail re-enables a row after it; the shelf filter
dialog works out the axes again from fresh items), so the wait must stay. Only the failure of
the READ must stop counting as a failure of the WRITE.

## Fix applied

A shared helper, `refetchAfterWrite(client, refetches)` in
`apps/web/src/apollo/refetchAfterWrite.ts`, replaces `awaitRefetchQueries` at all 8 sites.
The mutation is sent with no `refetchQueries`, then the hook awaits the helper.

| Entry form | What the helper does |
|---|---|
| a name or a document | `client.refetchQueries({ include })`: only mounted queries are read again |
| `{ query, variables }` | `client.query({ …, fetchPolicy: 'network-only' })`: read even when nothing is mounted, the same as the old `refetchQueries` form |

- Every read has `.catch(() => {})`, and the helper awaits all of them. So the call still
  waits for the reads, a failed read no longer rejects it, and a failed WRITE still rejects.
- `useRefetchAfterWrite()` also returns `isRefetching`. Each changed hook reports
  `isPending: loading || isRefetching`, because under `awaitRefetchQueries` the mutation's
  `loading` stayed true until the reads landed, and the recipe relation tab keeps a badge busy
  on it.
- `PantryData` is still read as `{ query, variables }`, never by name, and each hook's
  `update: evictStockLists` is unchanged.
- The Members hooks (`useHouseholdMembers.ts`) now import the shared helper. No behaviour
  change there.

Rejected: passing `{ query, variables }` into `client.refetchQueries({ include })`. Apollo
runs it at runtime, but the public type `RefetchQueriesInclude` accepts only names and
documents, so it would rest on internal behaviour.

**A trap found while fixing:** `src/test/setup.ts` stubs `useApolloClient`, and the stub's
`query` resolves `{ data: {} }` without reaching `MockedProvider`. A test file that drives
these hooks through `MockedProvider` must unmock `@apollo/client/react`, or its reads are
lost silently. `useItemSearchTailWiring.cloud.test.tsx` went red this way. The stub also got
`refetchQueries`. Recorded in `apps/web/src/hooks/CLAUDE.md`.

## Test added

- "whose refresh fails" describes in `useItemStockWrites.cloud.test.tsx` (create, stock
  update, unit switch) and `useItemLocationMutations.cloud.test.tsx` (add, remove).
- New files `useUpdateRecipe.cloud.test.tsx` (`mutate`, `mutateAsync`, `isPending`) and
  `useApplyShelfFilterPicks.cloud.test.tsx`.
- Each "read fails" test was red before the fix. Each has a control that proves the wait is
  still there.
- Mutation checks, all red then green after restore: removing the helper's `.catch` (8 tests
  red); not awaiting the helper (10 red, all controls); `void` at each `useItems.ts` site one
  at a time (only that site's control red); putting back `awaitRefetchQueries` at one site at
  a time (only that site's test red, including each `useUpdateRecipe` branch alone); dropping
  `|| isRefetching` (the `isPending` test red).
- `pnpm test`: web 3137 / 325 files → **3159 / 327** (both bugs together), server 2111 / 76,
  spec 70.

Not covered: `isPending: loading || isRefetching` is tested for `useUpdateRecipe` only. No
unit test pins the "parked `PantryData` observer" trap; cloud E2E does.

## PR / commit

Commit `0e32675c` on `fix/refetch-and-migration-catch`. PR: *TBD*.
