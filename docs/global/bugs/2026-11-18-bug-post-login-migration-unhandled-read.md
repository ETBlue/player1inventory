# Bug: the "copy local data?" check fails with an unhandled rejection

**Date:** 2026-11-18
**Branch:** `fix/refetch-and-migration-catch`
**Area:** `apps/web/src/hooks/usePostLoginMigration.ts` (cloud sign-in, data mode). Recorded
as a known gap in households H5b (#385).

## Bug description

`usePostLoginMigration` calls `getAllItems().then(...)` with no `.catch`
(`usePostLoginMigration.ts:201` at `938fa2aa`). In cloud mode, when the local IndexedDB read
fails (a closed or blocked database, a private window that refuses IndexedDB), the promise
rejects with nothing to catch it. The browser reports an unhandled rejection. No prompt shows,
and `migration-prompted` is not set.

The effect runs again when one of its dependencies changes (`isLoaded`, `isSignedIn`,
`locationsLoaded`, `householdLoaded`), so one page load can report several unhandled
rejections.

The code is from `4bd17a75` (2026-03-12).

## Root cause

A missing `.catch`. The other promise chains in the file (`confirmCopy`, `importData`,
`chooseLocation`) handle their errors and keep `migration-prompted` unset "so a refresh can
retry".

## Fix applied

`getAllItems()` now has a `.catch` that logs with `console.error` (the style of the hooks
folder). The catch sets no state, so the hook stays `'idle'`. It does NOT set
`migration-prompted`, so the next run of the effect, or the next page load, tries again,
like the other catches in the file.

## Test added

In `apps/web/src/hooks/usePostLoginMigration.test.ts`:

- a failed local read is logged, the state stays `'idle'`, the key stays unset, and no
  unhandled rejection is reported (a `unhandledrejection` listener);
- "user is asked to copy once a later local read works". This one passed on the old code
  too. It is a control that the retry still works, not proof of the fix.

Mutation checks, all red then green: removing the `.catch` (red on
`expected [ Error: IndexedDB is blocked ] to deeply equal []`); setting the key in the catch
(the key check and the retry test red); not logging (the log check red).

## PR / commit

Commit `430fbde9` on `fix/refetch-and-migration-catch`. PR: *TBD*.
