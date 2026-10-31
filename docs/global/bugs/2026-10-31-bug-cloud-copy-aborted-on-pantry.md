# Bug: a cloud copy started on the pantry reports "The operation was aborted"

**Date:** 2026-10-31
**Branch:** `feature/households` (found by households H1 task 1.8, commit `3b02a62a`)
**Areas:** settings (import), hooks (post-login migration), pantry. More than one area, so this
doc lives in `docs/global/bugs/`.

## Bug description

A local → cloud copy that runs while the pantry (`/`) is on screen shows **"The copy failed: The
operation was aborted."** About 100 ms later that message is replaced by the "Import local data
to cloud?" prompt, so the user never sees the error and is asked again.

The rows **were** copied. Only the final cache refresh failed.

| Path started on the pantry | Result |
|---|---|
| Switch to cloud, strategy "Clear & import" (auto-import after reload) | fails |
| Switch to cloud, strategy "Skip conflicts" | fails |
| The prompt's **Import** button (`importData('append')`) | fails; the prompt comes straight back |
| Strategy "Overwrite conflicts" | not run; same code, failure expected |
| Any of these on `/settings` | works |

**Older than H1.** In production a signed-out user who switches to cloud goes through `/sign-in`,
which sends them to `/`, so the copy already ran on the pantry. H1 made it reachable in E2E,
because the switch now lives in the 👤 sidebar on every page. E2E runs used to reload onto
`/settings`.

## Root cause

Two separate defects.

**1. The cache refresh fails the copy.** `importCloudData` ends with `await client.resetStore()`
(`apps/web/src/lib/importData.ts:2387` clear, `:2483` skip, `:2512` replace). `resetStore()` clears
the cache, then refetches every active query and returns `Promise.all` of the refetches. The
cleared cache makes `useStockedItems()` report `isLoading`, so `PantryListView` takes its early
return `if (isLoading) return <LoadingSpinner />` (`apps/web/src/components/pantry/PantryListView.tsx:245-246`)
and unmounts its subtree. The unmounted components' `ObservableQuery`s lose their last observer,
Apollo tears them down, and their refetch promises reject with Apollo's own
`DOMException("The operation was aborted.", "AbortError")`
(`@apollo/client/core/ObservableQuery.js:1389`, Apollo Client 4.1.6). `Promise.all` rejects, so
`importCloudData` throws.

Proved by mutation: with the spinner early return disabled, the spec passed in 17.4s.

**2. The hook overwrites its own error state.** `usePostLoginMigration`'s effect depends on
`locationsLoaded`. `resetStore` makes `GetLocations` data undefined and then defined again, so
the effect re-runs. The `catch` has already removed `migration-strategy`, and
`migration-prompted` is unset, so the re-run takes the no-strategy branch and calls
`setState('prompting')`, replacing `'error'`. The `autoImportStarted` ref guards only the
stored-strategy branch. No remount happens.

## Fix applied

**A. The cache refresh can no longer fail a finished copy.** A new helper,
`resetStoreAfterImport(client)` in `apps/web/src/lib/importData.ts`, replaces all three
`await client.resetStore()` calls (clear, skip, replace). It awaits `resetStore()` and ignores a
rejection whose `name` is `'AbortError'`. Any other rejection is rethrown, so a real failure
still reaches the user. The views that mount again after the spinner make their own queries.

**B. A failed copy stays failed.** In `apps/web/src/hooks/usePostLoginMigration.ts` the
one-shot ref `autoImportStarted` is now `importStarted`. It is set by both copy paths: when the
auto-import starts and when `importData` starts. The effect returns early once it is set, so the
prompting branch cannot run again and replace `'error'` (or `'importing'`). The `.then` of
`getAllItems()` checks it too, in case an import started while that read was in flight. A
refresh mounts the hook again with a fresh ref, so the user can still retry.

Docs: the `usePostLoginMigration` bullet in `apps/web/src/hooks/CLAUDE.md` described the old
re-run as expected behaviour. It now describes the guard. A comment in
`PostLoginMigrationDialog/index.test.tsx` that explained the old race now says it is gone.

## Test added

| File | Test | What it pins |
|---|---|---|
| `apps/web/src/lib/importData.test.ts` | `user copying to cloud with clear is not told it failed when the cache refresh is aborted` (and the same for `skip` and `replace`) | `resetStore` rejects with `new DOMException('The operation was aborted.', 'AbortError')`; `importCloudData` must resolve |
| same | `user copying to cloud is still told it failed when the cache refresh fails for another reason` | `resetStore` rejects with `new Error('Failed to fetch')`; `importCloudData` must reject. This keeps the filter narrow |
| `apps/web/src/hooks/usePostLoginMigration.test.ts` | `user sees the error of a failed automatic copy, not the prompt again` | auto-import fails, then the cloud location list goes undefined and back; state must stay `'error'` |
| same | `user sees the error of a failed Import press, not the prompt again` | the same for `importData('append')` |
| `e2e/tests/settings/data-mode-migration.spec.ts` (cloud) | existing test, edited | runs the copy on `/`. Its "KNOWN RED SINCE H1" comment is replaced, and it now also checks that "Copy failed" and the prompt are not visible after the success keys are set |

All four new unit tests failed before the fix:

- the three `AbortError` tests: `AssertionError: promise rejected "Error: AbortError: The operation was abor… { session: { …(3) } }" instead of resolving`
- the two hook tests: `Expected: "error" / Received: "prompting"`

Mutation checks, each restored from a saved copy afterwards:

| Mutation | Result |
|---|---|
| (a) the `AbortError` line removed from the helper | 3 unit tests red (`promise rejected … instead of resolving`) |
| (b) the helper swallows every error | the narrow-filter test red: `promise resolved "undefined" instead of rejecting` |
| (c) both `if (importStarted.current) return` lines removed from the hook | 3 hook tests red: the two new ones (`Expected: "error" / Received: "prompting"`) and the older `the location list going unknown and back mid-migration does not start a second copy`, because the old one-shot check now lives in the same guard |
| (c') only `importStarted.current = true` removed from `importData` | 1 red: `user sees the error of a failed Import press, not the prompt again` |
| E2E, (a) applied | `pnpm test:e2e --project=cloud e2e/tests/settings/data-mode-migration.spec.ts` failed: the migration keys poll expected `"prompted": "1"` and received `null`, then `Test timeout of 30000ms exceeded` |

The E2E spec passes with the fix: `1 passed (24.3s)`, and `1 passed (19.8s)` on a second run.

Not tested: a real `ApolloClient` whose watched query is unmounted during the reset. The unit
tests fake `resetStore`'s rejection. The cloud E2E spec is what runs the real mechanism.

## PR / commit

- Fix and tests: `4fa7137d` — `fix(import): a cache refresh aborted on the pantry no longer fails a finished copy`
- Branch `feature/households`. No separate PR; it ships with the households work.

## Related, not fixed here

At 390×844 the switch-strategy dialog's "Clear & import" button is off-screen. `AlertDialogFooter`
(`apps/web/src/components/ui/alert-dialog.tsx`) is a single `flex` row with no wrap, and the
dialog in `DataModeCard.tsx` puts four buttons in it. Older than H1.
