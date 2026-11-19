# Bug: "Sign in to join" turns off the "Copy local data?" question for good

**Date:** 2026-11-19
**Branch:** `fix/join-copy-prompt-and-import-timeouts`
**Areas:** the join page (`apps/web/src/routes/join/$token.tsx`) and the post-login copy
(`apps/web/src/hooks/usePostLoginMigration.ts`,
`apps/web/src/components/global/PostLoginMigrationDialog/`). Two areas, so this doc lives
in `docs/global/bugs/`.

## Bug description

A person opens an invite link while the app is in local mode and presses **Sign in to
join** (households H5b task G.7, owner decision O12-A). The button sets the localStorage
key `migration-prompted` to `'1'`, so `PostLoginMigrationDialog` does not offer to copy
their local data into the household they are joining. That was right for that moment.

But the key is global and permanent. On that device the person is never asked again,
in any household. For example, after they leave the household and create their own,
where they are the owner and may copy, the app still does not ask. They can still copy
by hand from Settings (`ImportCard`), but they are not told.

## Root cause

`LocalJoin.handleSignIn` writes `MIGRATION_PROMPTED_KEY`. That key means "this device
has answered the question", and `usePostLoginMigration` returns early on it before it
reads anything else. One key was used for two different things: "never ask again" and
"do not ask in the household being joined".

## Fix applied

The join no longer sets `migration-prompted`. Two narrower rules replace it:

| Rule | Where | What it does |
|---|---|---|
| The question waits on `/join/…` and `/sign-in` | `isCopyPromptPausedPath` in `usePostLoginMigration.ts`; `__root.tsx` passes it to `PostLoginMigrationDialog` as `paused` | the hook does nothing and stores nothing while it is `true`. A brand-new person already has a household of their own on the join page (their first request made it); a copy into it would stop it from being deleted when they join. Clerk reports "signed in" a moment before `/sign-in` leaves for the link, so that page waits too |
| The joined household is skipped | `skipCopyPromptIn(id)` in the join page's `handleJoin`, before `switchToHousehold`; the list is the localStorage key `migration-skip-households` | while the list is not empty, the hook waits for `household.id`. In a listed household it does nothing: no prompt, and no question for a stored copy (the stored strategy stays for a later household). In any other household it runs as before |

`MigrationHousehold` gained `id`. `PostLoginMigrationDialog` passes it from `useHousehold()`.

**What was chosen and why.**

- **Scope the skip to the household id (chosen).** It keeps O12-A exactly: the household
  joined is never offered the copy. Every other household behaves as if no join happened.
  The key is a list, so a second join adds to it. Every tab reads the same localStorage, and
  the join writes it before `switchToHousehold` reloads, so a tab reloaded by
  `HouseholdChangeGuard` sees it too.
- **Drop the flag and rely on `canCopyInto` (rejected).** The prompting path ("Import local
  data to cloud?") reads no role at all. A person invited as `manager` may import, so they
  would be offered, and could run, a copy into the household they joined. A `member` would
  be offered a copy that the server then refuses.
- **Clear `migration-prompted` when the household changes (rejected).** The join itself
  changes the household, so the flag would be cleared on the very reload that lands the
  person in the joined household, and the question would come there.
- **Write the skip from the local "Sign in to join" button (not possible).** In local mode
  the page does not know the household id: `invitePreview` needs a signed-in cloud session.
  So the button writes nothing, and the pause covers the time until Join.

**One behaviour change to know about.** A person who presses "Sign in to join", signs in,
and then leaves the join page WITHOUT joining is asked "Import local data to cloud?" on the
next page, in their own household. Before, they were never asked. They are the owner there,
and the question only asks. If they copy, that household is no longer empty, so a later
join does not delete it, and they end up in two households.

## Test added

| Test | File |
|---|---|
| `user in the household they joined is not asked to copy, even as a manager` | `apps/web/src/hooks/usePostLoginMigration.test.ts` |
| `user who joined a household is asked again in their own household` | same |
| `a stored copy does not ask in the household joined` | same |
| `with a household skipped, nothing is asked until the household is known` | same |
| `nothing is asked on the join and sign-in pages` | same |
| `a broken skip list is read as empty` | same |
| `skipCopyPromptIn` adds each household once; `isCopyPromptPausedPath` | same |
| `user in the household they joined is not asked to copy`, `user who joined another household is still asked here`, `nothing is asked while the dialog is paused` | `apps/web/src/components/global/PostLoginMigrationDialog/index.test.tsx` |
| `user who joins is not asked to copy local data into the joined household` (new); `user can switch to cloud from the join page without copying local data` (now asserts `migration-prompted` stays unset) | `apps/web/src/routes/join/$token.test.tsx` |

Mutation checks, each restored from a copy of the green file:

| Mutation | Red |
|---|---|
| hook: drop `if (skipped.includes(householdId)) return` | 3 |
| hook: drop `if (paused) return` | 3 (the join test too: it renders the real root) |
| hook: drop the wait for `householdId` | 1 |
| join page: drop `skipCopyPromptIn(householdId)` | 1 |
| join page: set `migration-prompted` again in "Sign in to join" | 1 |
| dialog: pass `id: ''` | 1 |
| dialog: pass `paused: false` | 2 |
| `__root.tsx`: pass `paused={false}` | 1 (the hook, unpaused on the join page with no local items, set `migration-prompted`) |

Web suite: 3283 tests / 335 files before, 3295 / 335 after.

## PR / commit

Fix: `54cd417a` on `fix/join-copy-prompt-and-import-timeouts`.
