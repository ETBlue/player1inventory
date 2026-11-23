# Bug: "Import local data to cloud?" names no household and ignores the role

**Date:** 2026-11-19
**Branch:** `fix/manual-import-names-household`
**Areas:** the post-login copy (`apps/web/src/hooks/usePostLoginMigration.ts`,
`apps/web/src/components/global/PostLoginMigrationDialog/`) and the households H5b plan's
*Known gaps*. Two areas, so this doc lives in `docs/global/bugs/`.

## Bug description

In cloud mode, when the device has local items and `migration-prompted` is not set,
`PostLoginMigrationDialog` asks "Import local data to cloud?" with **Skip** and **Import**.
This is the copy question that comes WITHOUT a stored strategy (the "manual" prompt, state
`'prompting'`). It is a known gap of households H5b (plan
`docs/global/permissions/2026-11-18-households-plan-h5b.md`, *Known gaps*).

- It does not name the household the copy goes into. Since H5b a person can be in a
  shared household, so "your cloud account" is no longer a true description.
- It does not check the household role. A `member` presses Import, answers
  "Import into which location?", and only then reads the role error from the server.

The stored copy (owner decision O22-A, H5b decision T31) already does both: it asks
"Copy your offline data into {household}?" and offers no copy to a role that cannot copy.

## Root cause

O22-A changed only the `'confirming'` branch. The `'prompting'` branch of
`usePostLoginMigration` does not wait for the household, and the dialog's prompt does not
read `household` or `canCopyInto` at all.

## Fix applied

The question with no stored strategy now asks the same way as the stored copy.

| Part | Where | What it does |
|---|---|---|
| wait for the household | `usePostLoginMigration` (`apps/web/src/hooks/usePostLoginMigration.ts`), prompting branch | `if (!householdLoaded) return` before `getAllItems()`. It stores nothing while it waits, so a person in no household is asked once they are in one. It does not wait for `GetLocations`: only the stored copy does |
| name the household | `PostLoginMigrationDialog.tsx` | title `confirmTitle` ("Copy your offline data into {household}?"), description `confirmDescription`, plus `confirmShared` for a non-owner. Buttons **Don't copy** (`dismiss`) and **Copy here** (`importData('append')`) |
| check the role first | same | `canCopyInto(household.role, 'skip')`. Copy here runs `skip`, so an owner and a manager may copy. A member gets `cannotCopyMember` and one **Done** button (`dismiss`, which sets `migration-prompted`). The location question never opens for a member |
| server is still the last check | unchanged | a refusal still lands in the error dialog with `errorRole` |

**Why a sentence and Done, not a hidden or disabled button.** This is what the stored copy
already does (H5b decision T31): an offer that is sure to fail is worse than a plain
sentence, and a disabled button explains less than a sentence. Done sets
`migration-prompted`, like Don't copy, so a member is not asked on every load.

**No new text.** The question reuses the stored copy's keys. The four keys only the old
dialog used (`settings.postLoginMigration.title`, `description`, `import`, `skip`) are
removed from `en.json` and `tw.json`.

**A manager with `clear` cannot happen on this path.** The question with no stored strategy
always copies with `skip` (`importData` maps `'append'` to `skip`). `canCopyInto` is still
called with the strategy, so a change to that mapping would be read correctly.

**Two other changes in the same commit:**

- The `PostLoginMigrationDialog` tests (`index.test.tsx`) now call `cleanup()` at the start
  of every `afterEach`. Testing Library's own cleanup runs after the file's hooks, so the
  dialog was still mounted while the hook cleared `localStorage` and changed the household.
  "user who joined another household is still asked here", run with the test before it,
  failed 1 run in 3 (and also once on the code before this fix), with the dialog missing or
  marked `aria-hidden`. After the change it passed 15 runs in a row. Which late write caused
  it was not proven.
- `routes/index.stories.test.tsx` carried a comment saying a mutation check proved that
  `MIGRATION_PROMPTED_KEY` keeps the dialog shut on the `Offline` story. Re-run: removing
  that key from `setupOfflineStory` leaves the test green, with and without this fix. The
  comment now calls it a negative control.

## Test added

| Test | File |
|---|---|
| 5 dialog tests: owner (named, no shared line), manager (shared line, copies with `skip`), member (sentence, Done, no location question, `migration-prompted` set), household loading (nothing, then the question), server refuses anyway (`errorRole`) | `apps/web/src/components/global/PostLoginMigrationDialog/index.test.tsx`, describe "the copy question names the household" |
| 3 cloud tests through the REAL `useHousehold` and `useLocations` (`cloudServerStub`): member, manager, server refusal | `.../PostLoginMigrationDialog/index.cloud.test.tsx` (new) |
| 1 hook test: with no skip list, the question waits for the household | `apps/web/src/hooks/usePostLoginMigration.test.ts` |
| stories `Prompting` (now cloud, owner) and `PromptingMember`, with smoke tests | `index.stories.tsx`, `index.stories.test.tsx` |

Web suite: 3295 tests / 335 files before, 3305 / 336 after.

Mutation checks (each in the source, restored from a copy). Counts are from a re-run
after the `cleanup()` change, over the four `PostLoginMigrationDialog` test files and
`usePostLoginMigration.test.ts` (71 tests). The first run, before that change, counted
the flaky "joined another household" test as red in three of them.

| Mutation | Red tests |
|---|---|
| `canPromptCopy = prompting` (no role check) | 3: the member test in each of the three test files |
| title without the household name | 7 |
| hook: the `householdLoaded` wait removed | 1: the new hook test. The dialog's loading test stays green, because the dialog also checks `household !== undefined` |
| `canCopyInto(role, 'clear')` instead of `'skip'` | 5: every manager test, incl. the manager in the "after joining" describe |
| shared line removed | 2: both manager tests |

The two household waits back each other up, so each one alone is pinned by one layer
only: the hook's wait by the hook test, and the dialog's `household !== undefined` by no
test (the hook's wait keeps it from being reached). It also narrows the type for
`canCopyInto`.

The E2E spec `e2e/tests/settings/data-mode-migration.spec.ts` checked that the old title was
not visible. With the old title gone that check would pass on any page, so it now checks
the new heading. E2E was not run by this task.

## PR / commit

- `ee105dd5` fix(migration): name the household in the copy question with no stored strategy
- the commit that adds this doc and marks the gap fixed in
  `docs/global/permissions/2026-11-18-households-plan-h5b.md`, *Known gaps*
