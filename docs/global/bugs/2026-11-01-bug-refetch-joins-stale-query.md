# Bug: a new tag type does not appear when it is created while the list is still loading

**Date:** 2026-11-01
**Branch:** `feature/households-h2` (found by the H2 E2E gate)
**Areas:** web (Apollo hooks, tags settings page), server (`ensureUser` latency). More than one
area, so this doc lives in `docs/global/bugs/`.

## Bug description

In cloud mode, a tag type created on `/settings/household/tags` sometimes never appears in the
list. The dialog closes, so the create succeeded, but the list stays as it was until the page is
loaded again.

Found by `e2e/tests/settings/tags.spec.ts:453` ("tag type dialog closes after successful creation
via Save button"), cloud project:

| Code | Result, the test alone with `--repeat-each=10` | Time per run |
|---|---|---|
| `main` `4ee2cbee` | 20 of 20 passed | about 3.3 s |
| `feature/households-h2` | 7 of 10 passed | passes about 3 s; every failure 6.5 s |

The failure is always at line 468: `getByRole('heading', { name: 'Protein', level: 2 })` not found
within 5000 ms.

## Root cause

Confirmed by request logs in the browser (2026-11-01). Times are from the test start:

| Failing run | Passing run (the old answer arrived first) |
|---|---|
| +224ms `GetTagTypes` sent | +268ms `GetTagTypes` sent |
| +375ms `CreateTagType` sent | +412ms `CreateTagType` sent |
| +606ms `CreateTagType` answered | +897ms `GetTagTypes` answered, 0 tag types |
| +638ms `GetTagTypes` answered, **0 tag types**. No second `GetTagTypes` is ever sent | +909ms `CreateTagType` answered; +912ms a fresh `GetTagTypes`; +1027ms answered, 1 tag type |

Both requests are released together after `ensureUser`. The `SELECT` runs before the `INSERT`
commits, but its answer arrives after the mutation's.

An older client-side race, which H2's slower first request makes common.

1. `useCreateTagType` (`apps/web/src/hooks/useTags.ts`) refreshes the list only through
   `refetchQueries: [{ query: GetTagTypesDocument }]`. It writes nothing to the cache.
2. Apollo Client 4.1.6 deduplicates identical in-flight operations (`queryDeduplication`, on by
   default). If the page's first `GetTagTypes` is still in flight when the mutation returns, the
   refetch joins that request instead of sending a new one.
3. That first request read the table before the create committed, so it answers `[]`. Nothing
   fetches again.
4. **Why H2 makes it common:** every request now awaits `ensureUserOrLog` before its resolver
   runs. After `/e2e/cleanup` deletes the `User` row, the first requests cost 3 sequential
   queries (`updateMany`, `findUnique`, `create`). Parallel requests share one run (`inFlight`),
   so the first `GetTagTypes` and the `CreateTagType` are released at the same moment. On `main`
   the first query finishes long before the test can click Save.

A real user who opens the page and creates a tag type quickly can hit the same race. Other hooks
that use `refetchQueries` with no cache update may have it too.

## Fix applied

**A new Apollo link, `createStaleReadRetryLink`** (`apps/web/src/apollo/staleReadRetryLink.ts`),
in both clients in `apps/web/src/apollo/client.ts`. In production it sits after
`offlineWriteLink`, so a mutation refused offline is not counted.

- It counts mutation answers, failed ones included.
- When a query answers and a mutation answered after the query was sent, the link drops that
  answer and sends the query again. A refetch that joined the request then gets a fresh answer,
  and the old answer never reaches the cache.
- It stops after `MAX_QUERY_ATTEMPTS` = **5** sends. **Warning:** at the cap the last answer is
  passed on, and it may be old. That needs a save to land during each of 5 sends in a row.
- The counter goes up **before** the mutation's answer is passed on. Apollo sends
  `refetchQueries` synchronously inside that call, so the other order sends every refetch twice.

No hook changed. The audit found 43 `refetchQueries` sites in 9 hook files, all exposed to the
same race, and the link covers all of them. It also stops an old list answer from overwriting a
cache write made by an update.

**Rejected:**

| Option | Why not |
|---|---|
| write the new row into the cache in the mutation's `update` | in all 5 failing runs the old `[]` answer arrived after the mutation and would overwrite it |
| `context: { queryDeduplication: false }` on the refetch | the page's first request still writes `[]` when it arrives. Apollo 4.1.6 `markQueryResult` has no check against an older answer, so it is correct only if the old answer arrives first |
| turn off `queryDeduplication` | `hooks/CLAUDE.md` and `cloudFetchPolicy.cloud.test.tsx` depend on two hooks for one document costing one request |

**Cost:** a query in flight when any mutation answers is sent once more. With no save during a
load, nothing extra is sent.

## Test added

| File | Test | Before the fix |
|---|---|---|
| `apps/web/src/hooks/useTags.cloud.test.tsx` | the create while `GetTagTypes` is in flight, through both real clients | 2 of 2 red: `expected [] to deeply equal [ 'Protein' ]` |
| `apps/web/src/apollo/staleReadRetryLink.test.ts` | sends again; also after a failed mutation; stops at the cap; a refetch sent after the mutation answers is sent once; no request left open after unsubscribe | — |
| `apps/web/src/apollo/client.test.ts` | a mutation refused offline is not counted | — |

Mutation checks, each restored from a saved copy:

| Mutation | Result |
|---|---|
| link removed from both clients | both hook tests red |
| link removed from one client | only that client's case red |
| no count on a mutation answer | 4 red |
| no count on a failed mutation | 1 red |
| cap removed | `expected 4 to be 3` (the cap was 3 then) |
| counter moved after `observer.next` | red: `['Save', 'List', 'List']` |
| old subscription storing | red: `expected 1 to be +0` |
| link placed before `offlineWriteLink` | red: `fetch` called 2 times, not 1 |
| E2E: link removed from the E2E client, `tags.spec.ts:453 --repeat-each=20` | 3 failed, 17 passed |

E2E after the fix: `:453` and `:428`, 20 of 20. The whole `tags.spec.ts` with
`--repeat-each=5`: 65 passed, 5 skipped, 0 failed, 0 flaky.

**Ten repeats can miss this bug.** Before the fix one run of 10 passed 10 of 10, then 15 of 20.

## PR / commit

- `fab1a449` `fix(apollo): send a query again when a save answers while it waits` (the link and the first tests)
- `4849ab51` `fix(apollo): pin the retry link's counter order and close two resend gaps`
- `b888e1ec` `docs(hooks): a shared request can now be sent more than once`
- `7707fccb` `test(apollo): give the held save in the resend test a type tsc accepts`
- Branch `feature/households-h2`; ships with the H2 PR.
