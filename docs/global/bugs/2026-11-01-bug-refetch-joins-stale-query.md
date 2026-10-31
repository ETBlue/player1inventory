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

*Investigation result, not yet confirmed by measurement.*

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

*TBD*

## Test added

*TBD*

## PR / commit

*TBD*
