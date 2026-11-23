# Bug: a fallback display name "User" is never replaced

Date: 2026-11-24. Found by the owner during step D.11 of the households release
(`docs/global/backend/2026-11-23-households-release-plan.md`), on the join page.

## Bug description

The join page says "User invited you." instead of the inviter's name. The page shows
`invitePreview.invitedByName`, which is the inviter's `User.displayName`. That column holds
`"User"`, the fallback value (`FALLBACK_DISPLAY_NAME` in `apps/server/src/lib/userRow.ts`).

The owner's check (read-only SQL): the row has `displayName = 'User'` and no e-mail, but
the Clerk account has an e-mail. With an e-mail, `userRowFromClerk` would have given the
part before `@`. So the Clerk lookup failed or timed out (3 s) when the row was created.
The same name shows anywhere a person's name is read: the Members page, the location people
page, the activity log, ownership offers.

## Root cause

Confirmed against the code at `e05ec1e7`. The three steps in the stub were right:

1. `newRowValues` in `apps/server/src/lib/userRow.ts` returned
   `{ displayName: 'User', email: null }` when the Clerk lookup threw, timed out
   (`CLERK_LOOKUP_TIMEOUT_MS`, 3 s), or answered `null`. The row was created with those
   values.
2. On an existing row `ensureUser` wrote only `lastSeenAt` (`touchLastSeen`). The comment
   said "It never un-deletes and never renames (plan P13)".
3. Only the Clerk webhook (`user.created`, `user.updated`) wrote the name again. Clerk
   sends `user.created` once, and `user.updated` only when the account changes. So a row
   created with the fallback values kept them for good.

One detail the stub did not say: if the webhook had worked when the account was made,
`user.created` would have written the real name over the fallback (the webhook upserts the
name). So for this row the `user.created` event also did not land, or landed before the
safety net created the row and was then not repeated. The code cannot tell which. Either
way, nothing after that wrote the name.

## Fix applied

`ensureUser` now replaces a fallback name once Clerk answers (`refreshFallbackName` in
`apps/server/src/lib/userRow.ts`):

- The daily touch is `prisma.user.updateManyAndReturn` (Postgres `UPDATE ... RETURNING`)
  instead of `updateMany`, with `select: { displayName, email, deletedAt }`. So the check
  "is this a fallback row?" costs no extra query.
- When the touch changed a row, the source is Clerk (never E2E), the row is not deleted,
  and its `displayName` is `FALLBACK_DISPLAY_NAME`, it asks Clerk again with the same
  `lookupWithTimeout` and timeout.
- When `userRowFromClerk` gives a name that is not the fallback, it writes the name, and
  the email when the stored one is null, with
  `updateMany({ where: { id, displayName: 'User', deletedAt: null } })`. That guard keeps a
  name or a delete the webhook wrote while this request waited for Clerk.
- A Clerk failure, a timeout, an empty reply, or a reply that still gives "User" writes
  nothing. The error is logged by its name only. The next UTC day tries again.
- It runs inside the shared run (`inFlight`), before `remember()`, so parallel requests
  share one Clerk call and `forgetGeneration` works as before.

What each case costs now:

| Case | Before | After |
|---|---|---|
| already seen today in this process | 0 | 0 |
| first request of the day, real name | 1 (`updateMany`) | 1 (`updateManyAndReturn`) |
| first request of the day, fallback name, live row | 1 | 1, plus one Clerk call (up to 3 s), plus 1 `updateMany` when Clerk gives a real name |
| seen today by another process | 2 | 2 (no Clerk call: the touch matches a row once a day, across processes) |
| no row yet | 3 plus one Clerk call | the same |

So the common case costs no extra query. The fallback case is at most once per user per UTC
day, across all processes. Its first request of the day may wait up to 3 s for Clerk, the
same as a new user's first request.

Not changed: the webhook path, the GraphQL schema, the web app.

## Test added

`apps/server/src/lib/userRow.test.ts`, describe `ensureUser replaces a fallback display
name`, 17 tests: a fallback row gets the real name and e-mail; a row never seen; the e-mail
local part when Clerk has no name; a stored e-mail is kept; a real name costs 1 query and no
Clerk call; a deleted fallback row is not touched; a Clerk error, a timeout and an empty
reply leave the row and do not throw, and the log carries no e-mail; a Clerk account that
still gives "User" writes nothing; a second request the same day (same process, and another
process) does not ask Clerk; the next day asks again; E2E mode leaves a row named "User"
alone; a webhook name and a webhook delete written while Clerk was asked are kept; ten
parallel requests ask Clerk once; a database error in the name write is caught by
`ensureUserOrLog`. The existing tests now count `updateManyAndReturn` for the touch.

`apps/server/src/test/userFake.ts` now models the `where` keys `displayName` (plain value)
and `deletedAt` (`null` only), and `updateManyAndReturn` (returns the rows AFTER the write,
with `select`). Any other shape still throws. 6 tests in `userFake.test.ts` pin them.

Server tests: **2934 → 2957** (+23). Web 3963, `scripts/spec` 80, all green.

Mutation checks. Each was made in the source, the two test files were run, and the source
was restored from a copy taken before:

| # | Mutation | Result |
|---|---|---|
| M1 | remove the `refreshFallbackName` call | 12 red |
| M2 | remove `if (source.kind !== 'clerk') return` | 1 red (E2E test: a lookup was tried and logged); `tsc` also fails with `TS2345` |
| M3 | refresh any name, not only the fallback | 3 red |
| M4 | refresh a deleted row | 1 red |
| M5 | drop `displayName` from the write's `where` | 1 red (the webhook name test) |
| M6 | drop `deletedAt` from the write's `where` | 1 red (the webhook delete test) |
| M7 | write even when Clerk gives the fallback | 3 red |
| M8 | never write the e-mail | 2 red |
| M9 | always write the e-mail | 1 red |
| M10 | log the error message instead of its name | 4 red |
| M11 | do not await the refresh | 2 red |
| M12 | do not select `deletedAt` in the touch | 12 red |
| F1 | the fake ignores `displayName` | 2 red |
| F2 | the fake ignores `deletedAt` | 2 red |
| F3 | the fake's `updateManyAndReturn` returns rows from BEFORE the write | 1 red |

## PR / commit

- Fix: `1ede4e29` fix(server): replace a fallback display name once Clerk answers
- Doc: the commit that adds this file
