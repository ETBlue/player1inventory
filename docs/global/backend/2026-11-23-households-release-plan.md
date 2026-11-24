# Households release plan (H3a to H7b, one checkpoint release)

> **For agentic workers:** this is a release plan, not a code plan. No step here is done by a
> subagent. Every database step and every deploy step is done by the owner, or by the main
> Claude session with the owner's consent for that one command. Steps use checkbox
> (`- [ ]`) syntax for tracking.

**Date written:** 2026-11-23
**Branch:** `docs/households-release-plan`, from `origin/develop` at `a9029f37`
**Goal:** bring every households phase that is merged into `develop` (H3a to H7b) to
production in ONE release, safely, and check it there.
**Approach:** one rehearsal of all seven new migrations on a fresh Neon branch of
production, one full cloud E2E run on Neon, then a deploy with the **server first and the web
second**, held apart by pausing the Cloudflare build. The server keeps a one-release shim, so
`main`'s old web bundle works on the new server.
**Joins these runbooks** (all in this folder): H3a
[`2026-11-11-deploy-runbook-households-h3a.md`](2026-11-11-deploy-runbook-households-h3a.md),
H3b [`2026-11-15-deploy-runbook-households-h3b.md`](2026-11-15-deploy-runbook-households-h3b.md),
H3c-1 and H3c-2 [`2026-11-16-deploy-runbook-households-h3c-1.md`](2026-11-16-deploy-runbook-households-h3c-1.md),
H4 to H7b and the Neon E2E step
[`2026-11-17-deploy-runbook-households-h4.md`](2026-11-17-deploy-runbook-households-h4.md)
(called "the H4 runbook" below).

**How to use this file.** This file gives the ORDER and resolves the conflicts between the
four runbooks. The runbooks keep the detail: the SQL, the expected answers, and the result
cells. When a step here says "H3a 3.4", run the SQL of that section of the H3a runbook and
write the result into that runbook's result cell. Where this file and a runbook disagree,
**this file wins** (see *Conflicts and stale text* below).

**Rule for every step: never paste a database connection string, a database hostname, the
Railway hostname or a secret into a chat, a commit, a document or a screenshot.** Use the
variable names only: `DATABASE_URL`, `DIRECT_URL`, `PROD_COPY_DATABASE_URL`,
`PROD_COPY_DIRECT_URL`, `TEST_DATABASE_URL`, `TEST_DIRECT_URL`. When the main session prints
command output that may hold a host, it filters it with
`grep -viE "postgres(ql)?://|neon\.tech"`.

**Who:** "Owner" is ETBlue, the person with the Railway, Cloudflare, Neon and Clerk
dashboards. "Main session" is the Claude session in the worktree. Never a subagent.

---

## Results (recorded 2026-11-24, step A.3)

**The households release is deployed to production.** Dates are UTC.

| Release PR | `develop` into `main` | Merge | Merged | What went in |
|---|---|---|---|---|
| #403 | "release: households" | `16929909` | 2026-11-23 | households H3a to H7b, the E2E speed plan, #400 (settings layout), #401 (the invite link after sign-up). `develop` was at `e05ec1e7`, the commit B.7 tested |
| #409 | "release: join page, fallback name and page height fixes" | `56d7de3a` | 2026-11-24 | #406, #407, #408. No migration |

| Step | Result |
|---|---|
| B.5 rehearsal | all seven migrations applied on a fresh Neon branch of production; every check as expected; H6b-O36 = 0 |
| B.6 `verify:migration` | 284 lines `ok`, 0 `FAIL:`, "Migration verified." |
| B.7 E2E on Neon | all rows green on `e05ec1e7` |
| D.5 Railway | **Railway did not start the deploy of #403 on its own.** The owner started it by hand. 7 migrations applied, server ready. The cause is not confirmed: the owner thinks the server may have been asleep at the time (Railway sleeping). Release #409 deployed on its own |
| D.6 to D.12 | all passed. D.12 (H6b-O36) = 0 |
| A.2 | replaced: `develop` was deleted on 2026-11-24 |

**Lesson for the next release: after every merge to `main`, check that Railway really
started a new deploy of that commit.** The merge alone does not prove it.

Issues found during the release:

| Issue or PR | What | State |
|---|---|---|
| #402 | item page: assign a new tag or vendor to the item; show a spinner while local data is copied to cloud | open, filed for later |
| #404 | cooking: the quantity bar of a cooked item does not update until the page is opened again. Seen in D.8 (old bundle) and again in D.10 (new bundle) | open |
| #405 | a Cancel button for the "Copy your cloud data to local storage?" dialog | open |
| #406 (merge `5b3e6c7f`) | the join page said "User invited you." Bug doc `docs/global/bugs/2026-11-24-bug-fallback-display-name-never-fixed.md` | fixed in #409 |
| #407 (merge `019299ae`) | a clearer role list on the join page (owner request) | shipped in #409 |
| #408 (merge `b6286e84`) | extra space at the bottom of pages in iOS home-screen mode. Bug doc `docs/global/bugs/2026-11-24-bug-page-height-vh.md` | fixed in #409 |

The owner checked #409 in production: page heights are fixed, the join page cards look
right, and the inviter's real name is shown.

**After this release, PRs still collect in `develop`.** The owner deleted `develop` on
2026-11-24 and brought it back the same day, made again from `main` at `56d7de3a`, so that
several PRs can be tested together on a local server before they go out. Every PR targets
`develop`, and `develop` goes into `main` in batch releases. A merge to `main` deploys:
Cloudflare builds the web, and Railway deploys the server. The rollback Neon branch
`prod-before-households-2026-11-23` is kept until F.1 is deployed (A.4).

---

## Summary

### Where this sits

The households feature was built in phases. H1 and H2 are on `main` and deployed. Since
2026-11-12 every later phase merged into `develop`, which deploys nothing, and the owner
decided on 2026-11-13 that nothing goes to `main` until households is done. It is done now.
So this is the first and only checkpoint release for:

| Merged into `develop`, not deployed | PR |
|---|---|
| H3a (households, roles, migration, scoping) | #375 |
| `chore/build-shared-types` (esbuild bundle, start check) | #376 |
| H3b (shared carts) | #377 |
| H3c-1 and H3c-2 (live updates) | #379, #380 |
| H4 (import and export) | #382 |
| H5a, H5b, H5c (roles in the web, invites, location people) | #384, #385, #391 (and follow-ups #386 to #390) |
| H6a, H6b (activity, purges, transfer, hand-over) | #392, #393 |
| H7a, H7b (household switch, personal location order) | #394, #395 |
| E2E speed plan | #396, #397, #398 |

Measured on 2026-11-23: `origin/main` is `351d22ad`, `origin/develop` is `a9029f37`.
`origin/main` is an ancestor of `origin/develop`, and `develop` is **668** commits ahead
(`git log origin/main..origin/develop --oneline | wc -l`). `main` has **0** commits that
`develop` lacks.

### How it relates to other work

- It blocks nothing that is being built. It must come before the **follow-up release** that
  removes the old-bundle shim (task F.1 below).
- It needs nothing else merged first, except this plan's own PR (into `develop`).

### What the user gets, once merged AND deployed

- A household: a catalog and locations that belong to the household, not to one account.
- Roles: owner, manager, member for the household; organizer, participant, viewer per
  location. Read-only views for weaker roles.
- Invite links, a Members page, leaving, removing, and a screen for a person in no household.
- Shared carts, one row per item, with checkout that refuses a cart that changed.
- Live updates between tabs and devices of one household.
- Import and export that refuse another household's data before writing anything.
- An activity log, purges with typed-name confirmation, ownership transfer, and a hand-over
  when an owner's Clerk account is deleted.
- Switching between households, creating another one, and a personal location order with
  four sorts.

Until someone invites a second person, each user is alone in their household, so most of
this shows only between one person's own tabs and devices.

### What the developer gets

| Gain | Detail |
|---|---|
| Less to remember | one order for the whole release (server first), one numbered checklist, instead of four runbooks that point in two directions |
| Fewer ways to get it wrong | the conflicts between the runbooks are named in one table, with the text that wins |
| A clear end | after this release, `main` and `develop` hold the same code again, and the shim can be removed |
| Cost | one more document to keep in step with the runbooks until the release is done |

---

## The seven new migrations

Measured 2026-11-23 with:

```bash
git ls-tree -d --name-only origin/main apps/server/prisma/migrations/ | sed 's#.*/##' > main.txt
git ls-tree -d --name-only origin/develop apps/server/prisma/migrations/ | sed 's#.*/##' > dev.txt
comm -13 main.txt dev.txt
ls -d apps/server/prisma/migrations/*/ | wc -l     # on develop
```

`origin/main` has **14** migration folders, `origin/develop` has **21**
(`ls -d …/*/` gives 21 on the `develop` checkout). The **7** new ones, in the order Prisma
applies them:

| # | Folder | Phase | Kind |
|---|---|---|---|
| 1 | `20261104000000_add_households` | H3a | tables, backfill, nullable `householdId` |
| 2 | `20261111000000_drop_user_scope` | H3a | locks 18 tables, cleanup, `NOT NULL`, **drops** `userId` and `Location.isDefault` |
| 3 | `20261114000000_shared_carts` | H3b | merges duplicate cart rows, unique index, **drops** `Cart.userId` |
| 4 | `20261118000000_add_household_invites` | H5b | additive |
| 5 | `20261120000000_add_household_activity` | H6a | additive |
| 6 | `20261120100000_add_ownership_offers` | H6b | additive |
| 7 | `20261122000000_add_location_preferences` | H7b | additive, one backfill `UPDATE` |

Railway's release command is `pnpm --filter server exec prisma migrate deploy`
(`railway.toml`, checked 2026-11-23). It applies all seven, each file in its own transaction.

**Warning: after migration 2 commits, `main`'s old server can no longer run.** `main`'s
resolvers filter on `Location.userId` and on `userId` of the catalog models (checked
2026-11-23: `git show origin/main:apps/server/src/resolvers/location.resolver.ts` has
`where: { userId }`; `item.resolver.ts` names `userId` 10 times). Railway keeps the old server
serving while the release command runs, and after a FAILED release command. So:

- In the normal path, the old server fails cloud requests for the few seconds or minutes
  between the commit of migration 2 and the switch to the new server.
- **If migration 3, 4, 5, 6 or 7 fails, cloud mode is down for everyone** until a fixed
  release command succeeds or the database is restored. The runbooks say "the old server
  keeps serving" for those cases (H3b 7.1, H4 9.9, 11.7, 12.7). That is true, but it does not
  work. See conflict C9 and stop rule S3.

---

## The checklist

Three phases: **before the deploy day** (B), **the deploy day** (D), and **after** (A).
Then the **follow-up release** (F).

### Stop rules used below

| Rule | When | What to do |
|---|---|---|
| S1 | any rehearsal answer differs from its expected answer | stop. Do not set a deploy day. The main session finds the cause with the owner |
| S2 | any E2E test fails in B.7 | stop, as in the root `CLAUDE.md` *Verification Gate*. Copy `e2e-results/` aside before any re-run |
| S3 | the release command fails at migration 3 or later (cloud is down, see the warning above) | read the error. Try to fix forward (H3a 7.1: `migrate resolve --rolled-back <name>`, fix, redeploy) for at most the time the owner chose in R5. After that, restore from the branch of D.1 (H3a 7.2, with the changes in *Rollback* below) |
| S4 | the release command fails at migration 1 or 2 | H3a 7.1. The old server and old web still work together (the web is paused), so there is no hurry |
| S5 | a check after the server deploy (D.6 to D.8) fails | do NOT resume the Cloudflare build. Decide with the main session: fix forward, or roll back the server |

---

### Phase B: before the deploy day

#### B.1 Merge this plan, and decide the owner questions

- [x] **Step 1 (owner):** answer R1 to R7 at the end of this file. R1 and R2 change steps
  below. **Answered 2026-11-23: all seven A.**
- [x] **Step 2 (owner):** merge this plan's PR into `develop`. Write down the new `develop`
  tip. Call it the **release commit**. Any later commit into `develop` that changes code
  (not only docs) makes B.6 and B.7 owed again.

Result: this plan merged as #399 (`411a744a`). Two code PRs merged after it: #400
(`4f9f5df8`) and #401 (`e05ec1e7`, the invite link after sign-up). So the release commit is
**`e05ec1e7`**. B.7 ran on it. B.6 ran on `4f9f5df8`, and #401 changed no migration and no
server script (`git diff --stat 4f9f5df8 e05ec1e7 -- apps/server/prisma/migrations apps/server/scripts` is empty).

#### B.2 Check the live web build (H3a 2.1, extended)

**Owner.** The shim was proved against `main`'s documents at `351d22ad`
(`apps/server/src/test/fixtures/main-web-operations/`, `main-server-schema.graphql`).

- [x] **Step 1:** in the Cloudflare Pages dashboard, read the commit SHA of the live
  production deployment of the web.
- [x] **Step 2 (main session, no database):**

  ```bash
  git merge-base --is-ancestor 8465406b <live-sha> && echo "OK: no userId selected"
  git diff <live-sha> 351d22ad -- apps/web/src/apollo/operations/ | wc -l
  ```

Success: the first prints OK, and the second prints `0` (the live bundle sends the same
documents the shim test checks). **If the diff is not 0**, the shim test does not cover the
live bundle. Stop and decide with the main session (run `oldBundleCompat.test.ts` against
the live documents, or redeploy the web from `351d22ad` first).

Result (2026-11-23): live SHA `351d22ad` (confirmed by the owner); OK; diff lines `0`.

#### B.3 Count the devices (H3a 2.2 and H3b 2.1)

- [x] **Owner:** list every browser and home-screen PWA, in cloud mode AND in local mode.
  D.10 visits each one. Local mode matters because the new bundle runs Dexie versions 19 and
  20, which cannot be undone (H3b 1.4).

Result (2026-11-23): the owner said B.3 is done. The device list itself is not recorded.

#### B.4 Settings outside the code

**Owner**, in the dashboards. Copy no value anywhere. Check names only.

| # | Where | What | Success | Source |
|---|---|---|---|---|
| 1 | Cloudflare Pages, web project, Production build variables | add `VITE_GRAPHQL_WS_URL` = `wss://<API host>/graphql`, the same host as `VITE_GRAPHQL_HTTP_URL`. Do not start a build | the name is exact; `wss://`; ends in `/graphql` | H3c-1 2.1 |
| 2 | Railway, server service, variables | `CLERK_WEBHOOK_SIGNING_SECRET` is there (name only) | present | H4 12.4; root `CLAUDE.md` *The `User` row* |
| 3 | Clerk production, Webhooks | the endpoint `POST /webhooks/clerk` exists and sends `user.created`, `user.updated`, `user.deleted` | all three listed | H4 12.4 |
| 4 | Clerk production, Paths / allowed redirects | a same-origin path such as `/join/<token>` is allowed as a redirect after sign-in and sign-up | allowed | H4 9.5 step 1 |
| 5 | Railway, server service | `CLERK_JWT_KEY`: set or not, as R6 decides | as decided | H3c-1 2.3 |
| 6 | Cloudflare Pages, web project, build settings | find the setting that stops automatic production builds from `main` (R1) | the owner knows where it is and that it exists | this plan, R1 |

**Owner checks, 2026-11-23:**

- Row 3: the endpoint exists and sends `user.created`, `user.updated`, `user.deleted` and
  also `user.merged`. The fourth event does no harm: `handleClerkEvent`
  (`apps/server/src/lib/clerkWebhook.ts`) has a `default: return` branch, so the server
  answers 200 and writes nothing. It can stay subscribed or be removed.
- Row 6: done. The owner turned off automatic deployments of `main` in Cloudflare Pages on
  2026-11-23. So D.2 is already done; D.9 turns them back on.

About rows 2 and 3: the repo says both were done for H2. `docs/INDEX.md` says H2 was
"deployed with the webhook secret set", and the H6 plan's *Deploy notes* say the endpoint
sends `user.deleted` "since H2". No doc records the event list as checked in the dashboard.
So the owner checks both again.

About the Preview environment for row 1: not needed. The preview tier is not built, and a
preview cannot sign in to the production Clerk instance (`docs/INDEX.md`, *environments*).

- [ ] **Step 1 (main session, optional, not run):** the "before" socket answer, H3c-1 2.2. Expected
  now: `error: no WebSocket answer`, then `closed 1006`. Type the host by hand; print
  nothing that shows it.

Result: row 3 checked (four events, see above); row 6 done (automatic `main` deployments
off since 2026-11-23); rows 1 and 2 checked by the owner on 2026-11-23 ("all good"); row 4
not recorded as a dashboard check (the sign-up redirect was fixed in code instead, #401, and
the join page was later checked in production); row 5 not set, as R6-A decided; socket
before not recorded (step 1 was not run).

#### B.5 Rehearse all seven migrations on ONE fresh Neon branch of production

**Owner makes the branch. Main session runs the commands, with the owner's consent.**

What the runbooks allow on a copy of production, quoted:

- H3a 3: "**Never point `verify:migration` at this branch.** It drops the schema."
- H4 9.3: "**Only `prisma migrate deploy` and read-only SQL.**" and "**Never run
  `verify:migration` (`scripts/verify-migration.ts`) against a copy of production.** It
  resets its target. Its guard refuses the `PROD_COPY_*` variables, but do not rely on the
  guard."
- `apps/server/prisma/CLAUDE.md`: `verify:migration` "refuses to run unless
  `TEST_DATABASE_URL` *and* `TEST_DIRECT_URL` both resolve … to a different database from
  every other environment variable whose name ends in `_URL`."

So on the rehearsal branch: `prisma migrate deploy`, `migrate status`, `migrate diff`, and
read-only SQL. Nothing else. `verify:migration` and `migrate reset` run only against the
`TEST_*` variables (B.6).

- [x] **Step 1 (owner):** in the Neon console, create a branch of the production branch, at
  the current time, named `prod-rehearsal-households-<date>`. Put its pooled and direct
  connection strings into `PROD_COPY_DATABASE_URL` and `PROD_COPY_DIRECT_URL` in
  `apps/server/.env`. Nowhere else.
- [x] **Step 2 (main session): prove the override** (H3a 3.1). Run `migrate status` with and
  without the override. Record "different" or "same", never a host.

  ```bash
  cd apps/server
  set -a; . ./.env; set +a
  DATABASE_URL="$PROD_COPY_DATABASE_URL" DIRECT_URL="$PROD_COPY_DIRECT_URL" \
    pnpm exec prisma migrate status 2>&1 | grep -viE "postgres(ql)?://|neon\.tech"
  ```

  Success: hosts different, and the pending list is **exactly the seven** folders above. More
  than seven means production is behind `main`: S1.
- [x] **Step 3 (main session): before any migration**, run H3a 3.2 (A, B, C) and H3b 3.2
  (H3b-A to H3b-D). Keep the output.
- [x] **Step 4: park migrations 2 to 7, apply migration 1 only.**

  ```bash
  cd apps/server
  mkdir -p .migration-under-test
  for m in 20261111000000_drop_user_scope 20261114000000_shared_carts \
           20261118000000_add_household_invites 20261120000000_add_household_activity \
           20261120100000_add_ownership_offers 20261122000000_add_location_preferences; do
    mv "prisma/migrations/$m" .migration-under-test/
  done
  DATABASE_URL="$PROD_COPY_DATABASE_URL" DIRECT_URL="$PROD_COPY_DIRECT_URL" pnpm exec prisma migrate deploy
  ```

  Then H3a 3.4 (queries 1 to 6) and H3a 3.5 (the cleanup counts). Any 3.5 count above 0 is
  production data that `drop_user_scope` will change: tell the owner before going on.
- [x] **Step 5: restore and apply migration 2.**

  ```bash
  mv .migration-under-test/20261111000000_drop_user_scope prisma/migrations/
  DATABASE_URL="$PROD_COPY_DATABASE_URL" DIRECT_URL="$PROD_COPY_DIRECT_URL" pnpm exec prisma migrate deploy
  ```

  Then H3a 3.6, except the `migrate diff` row: with migrations 3 to 7 parked, the schema
  differs, and that is expected (H3b 3.3 says the same).
- [x] **Step 6: restore and apply migration 3.** Same pattern with
  `20261114000000_shared_carts`. Then H3b 3.5 (queries 1 to 4, the H3b-B rows by hand, H3b-C
  again), and H4 3 (H4-A, H4-B, H4-C; H4 says to run them after the H3a and H3b
  migrations).
- [x] **Step 7: restore and apply migrations 4 to 7.**

  ```bash
  for m in 20261118000000_add_household_invites 20261120000000_add_household_activity \
           20261120100000_add_ownership_offers 20261122000000_add_location_preferences; do
    mv ".migration-under-test/$m" prisma/migrations/
  done
  git status --short prisma/          # must print nothing
  DATABASE_URL="$PROD_COPY_DATABASE_URL" DIRECT_URL="$PROD_COPY_DIRECT_URL" pnpm exec prisma migrate deploy
  DATABASE_URL="$PROD_COPY_DATABASE_URL" DIRECT_URL="$PROD_COPY_DIRECT_URL" pnpm exec prisma migrate status 2>&1 | grep -viE "postgres(ql)?://|neon\.tech"
  pnpm exec prisma migrate diff --from-url "$PROD_COPY_DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --exit-code
  ```

  Success: deploy exit 0 and four migrations applied; "Database schema is up to date!";
  `migrate diff` exit 0, "No difference detected."
- [x] **Step 8: the read-only checks after all seven.** H4 9.3 (H5b-1 to H5b-4), 11.3 (H6a-1
  to H6a-4), 12.3 (H6b-1 to H6b-4), 14.3 (H7b-1 to H7b-5). Run H7b-4 now: it is true only
  before any server points at the branch. Also the H3a 3.4 queries 1 and 3, and query C of
  H3a 3.2, again.
- [x] **Step 9: the deleted accounts.** H4 12.6 (H6b-O36) and H4 11.6 (all deleted
  accounts), on this branch. Expected 0 for H6b-O36. **If H6b-O36 is not 0**, the one-off
  hand-over script of H4 12.6 does not exist yet. It must be written, reviewed and dry-run
  before the deploy day. S1 until then.
- [x] **Step 10 (owner):** H3a 3.8. Delete the rehearsal branch. Clear
  `PROD_COPY_DATABASE_URL` and `PROD_COPY_DIRECT_URL`.

**Put every parked folder back even if a step fails.** Check with
`git status --short apps/server/prisma/`. A missing folder would be a missing migration on a
later commit.

Record every result in the runbook section it belongs to. Write the date and "rehearsal of
the households release" beside each.

**Result (rehearsal of the households release, 2026-11-23, run by the main session).** The
branch was `prod-rehearsal-households-2026-11-23`. Only `migrate deploy`, `migrate status`,
`migrate diff` and read-only SQL ran on it.

| Step | Result |
|---|---|
| 2 | production, the copy, TEST and the local E2E database are 4 different databases. Exactly the 7 expected migrations were pending |
| 3 | 1 old account had data but no `User` row. 0 duplicate cart rows, 0 bare-id carts |
| 4 | 2 users, 2 households, 2 owner rows; 0 locations without an organizer; all 13 H3a 3.5 cleanup counts 0 |
| 5 | row counts unchanged after `drop_user_scope`, except `User` 1 → 2 (expected). Counts: `User` 2, `Location` 5, `Item` 190, `Tag` 61, `TagType` 3, `Vendor` 23, `Recipe` 9, `Shelf` 13, `ItemStock` 193, `Cart` 42, `CartItem` 7, `InventoryLog` 1549, `ItemTag` 504, `ItemVendor` 401, `RecipeItem` 74 |
| 6 | 0 duplicate pairs; 42 carts, 7 cart items, quantity sum 1; index `CartItem_cartId_itemId_key`; only `CartItem.userId` left; H3b-C 0; H4-A 0, H4-B 0, H4-C no rows |
| 7 | 4 migrations applied; "Database schema is up to date!"; `migrate diff` exit 0, "No difference detected." |
| 8 | H5b-1 to H5b-4, H6a-1 to H6a-4, H6b-1 to H6b-4, H7b-1 to H7b-5: all as expected (values in the H4 runbook, 9.3, 11.3, 12.3, 14.3) |
| 9 | H6b-O36 = 0; H4 11.6 (all deleted accounts) = 0. No hand-over script is needed |
| 10 | the owner deleted the rehearsal branch and cleared `PROD_COPY_*` (2026-11-23) |

The results are written into the H4 runbook. The H3a and H3b runbooks' own result cells for
this rehearsal are not filled; the numbers above are the record.

#### B.6 `verify:migration` on the TEST database

**Main session, with the owner's explicit consent given AFTER Prisma's AI-agent warning**
(`apps/server/prisma/CLAUDE.md`: the reply's exact text goes into
`PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`). Only if R4 says yes.

Why it may be owed: the last run was on 2026-11-22 at `415cbf02` (284 lines `ok`, 0 failed).
No migration changed since (`git log --oneline 415cbf02..HEAD -- apps/server/prisma/` lists
three docs-only commits). But `apps/server/scripts/` changed: `ff681b34` and `7d1b4eb7` (E2E
speed plan S.6) moved the database guard to `src/lib/databaseUrl.ts`, and
`scripts/databaseIsolation.ts` now re-exports it. So the script that guards the drop has not
run since its guard moved.

- [x] **Step 1:**

  ```bash
  pnpm --filter server exec tsx --env-file=<absolute path>/apps/server/.env scripts/verify-migration.ts
  ```

  Success: "Migration verified.", every line `ok`, 0 `FAIL:`. This drops and rebuilds the
  TEST database's schema. It never touches production or its copy.

Result (2026-11-23, main session, with the owner's consent): exit 0, **284 lines `ok`, 0
`FAIL:`**, "Migration verified." Run on a checkout of `4f9f5df8`. #401, merged after it,
changed no migration and no server script.

#### B.7 The whole cloud E2E suite on Neon (H4 15)

**Main session, alone on the machine** (no other E2E run, no `pnpm test`). After B.6, because
`verify:migration` rebuilds the TEST schema the E2E server starts on. On a checkout of the
release commit.

- [x] **Step 1:** `pnpm test:e2e:all:neon`

Success: every row green, 0 failed; the `cloud-neon` row collects the same tests as the last
per-PR `cloud` row (220 on 2026-11-23); the commit is the release commit. Last measured
2026-11-23 at `aa327e69`: 44m33s. Failure: S2.

Result (2026-11-23, main session): commit `e05ec1e7` (the release commit), exit 0, every row
green.

| Row | Result | Time |
|---|---|---|
| `local` | 179 passed, 11 skipped | 3m48s |
| `cloud-neon` (the whole cloud list) | 212 passed, 8 skipped (220 collected, the same as the last per-PR `cloud` row) | 36m13s |
| `pwa` | 73 passed | 1m36s |

The total wall-clock time is not recorded.

#### B.8 One code check on the local stack (H3a 3.7)

**Main session, local dev stack, cloud mode.** H3a 3.7 tests a `replace` import with
name-only conflicts. It tests code, not production data. It was never filled in. Do it once
before the release, as written there, and record the result. Optional only if the owner says
so.

- [x] Result (2026-11-23): the owner ran it on the local dev server and said "it works
  well". The details (shelf names, cart item) are not recorded.

#### B.9 Pick the deploy time

- [x] **Owner:** a time when nobody uses the app, with about two hours free. Tell any other
  user to stop. Have the device list of B.3 at hand.

  Result: the owner chose 2026-11-23 ("available all day today").

---

### Phase D: the deploy day

This is the order of H4 8.3 ("server first, then the web"), with the way to hold the two
apart that R1 chooses. The steps below assume **R1 option A** (pause the Cloudflare build).

- [x] **D.1 (owner): the rollback branch** (H3a 4.1). In Neon, create a branch of production
  at the current time, named `prod-before-households-<date>`. Write the name down. Do not
  skip this because the rehearsal passed.
  Result (2026-11-23): `prod-before-households-2026-11-23`.
- [x] **D.2 (owner): pause the web.** In Cloudflare Pages, turn off automatic production
  builds from `main` (R1-A). The owner already did this on 2026-11-23 (B.4 row 6), so on
  the deploy day only check the setting still shows it off. Success: a push to `main` will
  not start a production build. Result: still off on 2026-11-23.
- [x] **D.3 (owner): Railway stays on automatic deploy from `main`** under R1-A. (H3a 4.2
  turned it off, to make the web go first. That reason is gone: see C1.) Check it is on.
  Result: on (owner, 2026-11-23). It still did not start the deploy; see D.5.
- [x] **D.4 (owner): merge `develop` into `main`** with the method R2 chooses (R2-A: a PR
  from `develop` to `main`, "Create a merge commit"). **Never pass `--delete-branch`:**
  `develop` must stay. Write down the merge commit SHA.
  Result: the main session did it at the owner's request. PR #403, merged 2026-11-23 with a
  merge commit, **`16929909`**. `develop` was at `e05ec1e7` (the B.7 commit), `main` at `351d22ad`. The PR
  added exactly the 7 migrations of B.5.
- [x] **D.5 (owner): watch the Railway deploy.**
  1. The build log ends with the start check passing. `start check FAILED:` means the build
     failed before the release command: no migration ran, the old server serves, the web is
     still paused. Stop and decide with the main session (H3a 4.4).
  2. The release log shows **seven** lines, in this order:

     ```
     Applying migration `20261104000000_add_households`
     Applying migration `20261111000000_drop_user_scope`
     Applying migration `20261114000000_shared_carts`
     Applying migration `20261118000000_add_household_invites`
     Applying migration `20261120000000_add_household_activity`
     Applying migration `20261120100000_add_ownership_offers`
     Applying migration `20261122000000_add_location_preferences`
     ```

  3. If it seems stuck for more than 2 minutes, run the `pg_stat_activity` query of H3a 4.4
     in the Neon SQL Editor on production. `drop_user_scope` and `shared_carts` take table
     locks and set no `lock_timeout`.
  4. A failed release command: S3 or S4.
  5. Wait until Railway shows the new deployment as active.

  Result (2026-11-23): **Railway did not start a deploy for `16929909` on its own.** Its
  GitHub app had made a deployment for every earlier production release (the last one
  `351d22ad`, 2026-11-04), but none for this merge. `railway.toml` had not changed. The
  owner started the deploy by hand in the Railway dashboard. Then: build ok, "7 migrations
  applied", server ready (owner). Time taken: not recorded.

  The cause is not confirmed. The owner thinks the server may have been asleep at the time
  (Railway sleeping). Release #409 on 2026-11-24 deployed on its own. **After every merge to
  `main`, check that Railway started a new deploy of that commit.**
- [x] **D.6 (owner or main session): the socket** (H3c-1 4). Run the H3c-1 2.2 command
  again. Success: `closed 4401 …`. This is the first proof that Railway passes the WebSocket
  upgrade. Failure: H3c-1 7.1. It does not block the release (live updates are extra), but
  write it down.
  Result (2026-11-23, main session): `closed 4401 Unauthorized`. The first proof that
  Railway passes the WebSocket upgrade.
- [x] **D.7 (owner or main session, read-only, in the Neon SQL Editor on production):**
  H3a 5 with query 1 at `LIMIT 8` (all seven new migrations have `finished_at`, none
  `rolled_back_at`), queries 2 to 5, and the H3a 3.5 queries again; H3b 5 (checks 2 to 4).
  Do NOT run H7b-4 here: the new server already moves `dataUpdatedAt`.
  Result (2026-11-23, run by the owner as one 24-row read-only query): all as expected.

  | Check | Result |
  |---|---|
  | the 7 new migrations finished, none rolled back | 7 |
  | users / households / owner rows | 2 / 2 / 2 |
  | locations without an organizer; households without a location; dropped columns still there | 0, 0, 0 |
  | the 13 H3a 3.5 cleanup counts | all 0 |
  | H3b: duplicate pairs; cart index; `userId` columns left | 0; `CartItem_cartId_itemId_key`; `CartItem.userId` |
  | H3b: carts / cart items / quantity sum | 42 / 7 / 1 (the same as the rehearsal) |
  | H3b-C | 0 |

  One row of the query, "migrations unfinished or rolled back (all)", gave 1, not 0. That
  row was written too broadly: it counted the June row of
  `20260609100000_permanent_vendor_carts`, rolled back on 2026-06-13 with
  `migrate resolve --rolled-back` and applied again later. A second query confirmed
  `applied_again_later = true`. Next time, leave out rows whose migration has a later
  finished row.
- [x] **D.8 (owner): the old bundle on the new server** (H4 8.3, *What to check after the
  server deploy, before the web deploy*). On a device that still has the OLD bundle:
  pantry and switcher load; Settings, Locations shows the lock on the first location; a
  checkout raises the stock by the cart amount; cooking one recipe lowers it. Failure: S5.
  Result (2026-11-23): all works. One display bug: after cooking, the quantity bar of the
  cooked item did not update until the page was opened again. The stock was right. Filed as
  #404; it does not block the release.
- [x] **D.9 (owner): resume the web.** Turn automatic production builds back on in
  Cloudflare, and start a production build of `main` at the merge commit (for example
  "Retry deployment" on the latest one, or a new deployment of `main`). Success: the
  production deployment's SHA is the merge commit.
  Result (2026-11-23): done; automatic production builds are on again. The owner said the
  Cloudflare deployment was done; its SHA is not recorded.
- [x] **D.10 (owner): every device of B.3.**
  1. Cloud devices: open the app, accept the update prompt, reload. Last resort:
     `window.__unregisterServiceWorkers()` in the DevTools console. In the network tab, the
     `GetLocations` request must not contain `isDefault` (the new bundle). The 🏠 label shows
     the household name, not "My data" (the server is already new; see C4).
  2. Local-mode devices: accept the update, reload, open Shopping and one cart. DevTools,
     Application, IndexedDB, `Player1Inventory` shows version **200** (H3b 4.1).

  Result (2026-11-23, owner): the 🏠 label shows the household name; `GetLocations` has no
  `isDefault`; IndexedDB is at version 200; local data is still there; Shopping updates after
  checkout (with a short delay). The cooking quantity still does not update in place with the
  new bundle (#404, still open). The owner also asked for a Cancel button on the "Copy your
  cloud data to local storage?" dialog (#405).
- [x] **D.11 (owner): the smoke tests**, on the real account first, then on TEST accounts
  and a TEST household for anything that writes roles, offers or purges. Record each in its
  runbook.

  | Runbook section | What | Notes |
  |---|---|---|
  | H3a 6 | rows 1 to 4, 6, 7 | **replace row 5** with H4 8.4 step 2: the last location CAN be deleted now (C5). Do it only on a test household |
  | H3b 6 | H3b-1 to H3b-5 | — |
  | H3c-1 5 | the WS row, 101, `connection_ack`, `subscribe` | the first real Clerk token on the socket |
  | H3c-1 6 and 9.3 | H3c-1 to H3c-4, P1 to P6 | H3c-5 (60 minutes) optional |
  | H4 5 | the `ImportCheck` request, the role-aware card | do not press **Clear & import** |
  | H4 8.4 | role texts, empty household, vendor | on a test household |
  | H4 9.5 step 2, 9.6, 9.7 | invite return after sign-in and sign-up; invite, join, leave on two devices; Copy link fallback | 9.7 may be done on a local build |
  | H4 10.3 | location people page, live role changes | — |
  | H4 11.5 | activity row, danger zone | do NOT purge real data |
  | H4 12.5 | transfer ownership and accept | do NOT delete a real account |
  | H4 13.3 | switch, stale tab, Create new | needs one TEST person in two TEST households |
  | H4 14.5 | personal order, the four sorts | — |

  Result (2026-11-23 and 2026-11-24, owner): done. The result of each row above is not
  recorded. What was found:

  | Found | Fixed by |
  |---|---|
  | the join page said "User invited you." (a fallback display name that was never replaced) | #406, merge `5b3e6c7f`; bug doc `docs/global/bugs/2026-11-24-bug-fallback-display-name-never-fixed.md` |
  | the owner asked for a clearer role list on the join page | #407, merge `019299ae` |
  | extra space at the bottom of pages in iOS home-screen mode | #408, merge `b6286e84`; bug doc `docs/global/bugs/2026-11-24-bug-page-height-vh.md` |

  All three went to production in release #409 (`develop` into `main`, merge `56d7de3a`,
  2026-11-24, no migration; Railway started on its own). The owner checked in production:
  page heights fixed, join page cards good, the inviter's real name shown.

- [x] **D.12 (main session, read-only, with consent): deleted accounts again.** H4 12.6 says
  to count H6b-O36 again right after the server deploy, and also says "never on production
  itself". So the owner makes a new Neon branch of production now, the main session runs
  H6b-O36 there, and the owner deletes that branch. Expected 0.
  Result (2026-11-24): **0**. The owner ran the query in the Neon SQL Editor on a fresh
  branch of production, not the main session (that saved passing a connection string). No
  hand-over script is needed.

---

### Phase A: after the deploy

- [ ] **A.1 (owner): the first days.** Watch:

  | Where | What to look for |
  |---|---|
  | Railway logs | Prisma errors (`P2022`, `P2025`, `P2034`), `ensureUserOrLog` error names |
  | Clerk dashboard, webhook log | `user.*` events answered `2xx`, not 400 or 500 |
  | browser DevTools, WS tab | close codes `4401` on a signed-in tab (H3c-1 7.2), `1013` repeating |
  | the app | a tab that reloads again and again (H4 13.4), the `HouseholdChangedNotice` after every load |

- [x] **A.2 (owner): bring `develop` level with `main`.** **Replaced (2026-11-24).** Under R2-A, `main` has one merge
  commit that `develop` lacks. Fast-forward `develop` to `main`
  (`git push origin origin/main:develop`, a fast-forward, no force) or open a PR, as R3
  decides. Check `git log origin/develop..origin/main --oneline` prints nothing.

  What happened instead: on 2026-11-24 the owner first deleted `develop` (it had no commit
  that `main` lacked; no Cloudflare or Railway setting was tied to it, owner checked). Later
  the same day the owner asked for it back, to test several PRs together on a local server
  before a batch release. It was made again from `main` at `56d7de3a`, so `develop` and
  `main` were level again. PRs target `develop`; `develop` goes into `main` in batch
  releases.
- [x] **A.3 (main session): docs.** Fill every `TBD` the rehearsal and the deploy wrote. Mark
  the households rows in `docs/INDEX.md` as deployed, with the date and the merge SHA. Close
  issue #359 (it stays open "until H3a merges and deploys").
  Result (2026-11-24): this file, the H4 runbook, `docs/INDEX.md` and the root `CLAUDE.md`
  are updated on `docs/households-release-results`. Issue #359 is left for the owner to
  close. A value the session record does not hold is written as "not recorded".
- [ ] **A.4 (owner): keep the rollback branch** of D.1 until F.1 is deployed, then delete
  it. Status 2026-11-24: `prod-before-households-2026-11-23` is kept.

---

### Rollback

The runbooks' rollback text was written for "web first". With server first, these rules hold
(see C7 and C8):

| Situation | What to do |
|---|---|
| a release command failed | S3 or S4. The web is still paused, so the old web stays live |
| the server is live and wrong, the web still paused | roll back the server only after the database is restored (D.1 branch, H3a 7.2), because migrations 1 to 3 are not reversible and `main`'s server cannot run on the new schema |
| both are live and wrong | **roll back the web first or together**, never the server alone: a new bundle on an old server fails every location query (H4 8.2, 14.4). Then H3a 7.2 |
| local-mode devices after a web rollback | their Dexie database is at version 20 and the old bundle cannot open it (H3b 1.4). Tell those devices NOT to accept the update prompt of the rolled-back web, so they keep the new bundle in their cache |

A restore from D.1 loses every write made after D.1.

---

### Phase F: the follow-up release (remove the old-bundle shim)

**Only after every device of B.3 shows the new bundle** (D.10), and as R7 decides.

- [ ] **F.1 (a normal code PR, by a subagent like any code task):** remove, together, as the
  H4 runbook 8.3 *Removing the shim* and the root `CLAUDE.md` *Old-bundle shim* list:
  - `Location.isDefault` and its resolver, with `firstLocationIdOf` in
    `apps/server/src/resolvers/location.resolver.ts`, the `firstLocationIds` entry of
    `RequestCache` (`apps/server/src/context.ts`) and its `delete` in `forgetLocationRoles`
    (`apps/server/src/lib/authz.ts`);
  - `CheckoutItemInput.itemId`, with `cartItemId` back to `ID!`, and `checkoutInputShape` and
    `fromOldCheckoutInput` in `apps/server/src/resolvers/cart.resolver.ts`;
  - `ConsumeRecipesItemInput.packedQuantity`, `.unpackedQuantity` and `.quantity`;
  - `apps/server/src/test/fixtures/main-web-operations/`,
    `apps/server/src/test/fixtures/main-server-schema.graphql` and
    `apps/server/src/test/oldBundleCompat.test.ts`;
  - the tests that name the shim (`cart-checkout.resolver.test.ts`,
    `location-roles.resolver.test.ts`, `recipe-consume.resolver.test.ts`,
    `mutationRoleCache.test.ts`; `git grep -n "release after households" -- apps/server/src`
    lists them).

  Measured 2026-11-23: `git grep -n "@deprecated" -- apps/server/src/schema/` finds **5**
  fields (1 in `cart.graphql`, 1 in `location.graphql`, 3 in `recipe.graphql`).
- [ ] **F.2:** the follow-up release only removes fields that the households bundle does not
  send (the shim test's check 4 proves that no current web document selects a deprecated
  field). Once every device has the households bundle, no deployed bundle sends them, so the
  web and the server may deploy in any order. It deploys like a normal release.
- [ ] **F.3:** also owed to that release, not a shim: the shared `Location.order` "stays
  until the release after households" (H4 14.6 *Known gaps*). Decide then whether to retire
  it; it is not a must.

---

## Conflicts and stale text between the runbooks

| # | Where | It says | Now true | Which text wins |
|---|---|---|---|---|
| C1 | H3a 0, 1.3, 4.2, 4.3, 4.5; H3b 0 and 4.2; H4 2.2; H3c-1 0 | the web goes first; turn off Railway's automatic deploy so the web can go first; deploy the server "at once" after the web | owner decision 2026-11-17, option 4: **the server goes first**, with the shim (H4 8.3). H3a and H3b carry a note at the top saying so; H3c-1 0 and H4 2.2 still argue for web first | H4 8.3 and this plan |
| C2 | H4 8.3 *The order* | "1. Deploy the server … 2. Then merge `develop` into `main`" | Railway deploys from `main`, so the server cannot deploy from `main` before `main` has the code. No runbook says how to deploy the server before the merge | this plan, R1 |
| C3 | H3b 1.2 | "there is no order that keeps checkout and cooking working the whole time" | with the shim, an old bundle checks out and cooks on the new server (H4 8.3 table). With the web paused, there is no "new web, old server" gap | H4 8.3 |
| C4 | H3a 4.3 step 5 | the 🏠 label shows "My data" after the web update, because the server is old | the server is new by then; the label shows the household name | this plan, D.10 |
| C5 | H3a 6 row 5 | deleting the last location "is refused with a message" | since H5a (F.7) the last location CAN be deleted (`LAST_LOCATION` is gone) | H4 8.4 step 2 |
| C6 | H3a 7.2 step 3 | "The new web bundle works with the old server … so the web can stay" | false since H4: a new bundle on an old server fails `importCheck`, and since H5a every location query (`myRole`) | H4 8.2 and this plan, *Rollback* |
| C7 | H3b 7.2 | local-mode devices "must stay on the new bundle" | only possible if they do not accept the rolled-back bundle's update prompt | this plan, *Rollback* |
| C8 | H4 9.9, 10.4, 11.7, 12.7, 13.4, 14.6 | "roll back the web FIRST (or together)" | still true; H3a 7.2 does not say it | H4 |
| C9 | H3b 7.1 row `shared_carts`; H4 9.9, 11.7, 12.7 first rows | a failed later migration leaves the old server serving, "yes, for the old server" | the old server serves but cannot work: `drop_user_scope` already dropped the `userId` columns it filters on. Cloud is down until fixed | this plan, warning and S3 |
| C10 | H3a 3.1 step 4; H3b 3.1; H4 9.2, 11.2, 12.2, 14.2 | exactly 2, 3, 4, 5, 6, 7 pending migrations; 2 to 7 release lines; `LIMIT 4` to `LIMIT 8` | **seven** pending, **seven** lines, `LIMIT 8` (measured above) | H4 14.2 and this plan |
| C11 | H3a 3.3 and H3b 3.3 | park one or two migrations | with seven, park six, then restore in three steps | this plan, B.5 |
| C12 | H4 11.6 | the deleted-account count runs "On production, read-only" | H4 12.6 says "Never on production itself" | 12.6 (a copy of production); this plan B.5 step 9 and D.12 |
| C13 | H4 12, 13, 14 headers | H6b, H7a, H7b "NOT merged and NOT deployed" | all three are merged into `develop` (#393, #394, #395), not deployed | the root `CLAUDE.md` |
| C14 | H4 12.6 last paragraph; `apps/server/prisma/CLAUDE.md` (*It also proves two things*) | "`apps/server/scripts/` must not import from `src`" | since E2E speed plan S.6, two scripts import `src/lib/databaseUrl.ts`, a file that imports nothing (root `CLAUDE.md`, *The no-overlap trick*). The reason for not writing the hand-over script is weaker, not gone: the script would still need many `src` files | the root `CLAUDE.md` |
| C15 | `docs/INDEX.md`, the `permissions` row | "At that release the web must deploy before the server"; "H7 not started" | server first; H7a and H7b are merged | this plan; A.3 updates it |
| C16 | H3a header | "The rehearsal results below are from 2026-11-12" | still true, but they cover two migrations on production as it was then. B.5 replaces them for this release | this plan |
| C17 | H3c-1 2.1 step 4 | add the WS variable to Preview too, optional | the preview tier is not built and cannot sign in | this plan, B.4 |

---

## Owner questions

**R1. How does the server go live before the web?** (C2)

| Option | What |
|---|---|
| **A (Recommended)** | Pause Cloudflare's automatic production builds (B.4 row 6, D.2). Merge `develop` into `main`. Railway deploys the server from `main` and runs the migrations. Check (D.6 to D.8). Then resume Cloudflare and build `main` (D.9) |
| B | Point the Railway service at `develop` for one deploy, deploy, check, then merge into `main` and point Railway back at `main` |
| C | Deploy the server with the Railway CLI from a local checkout of `develop` |
| D | Merge and let both deploy at once |

Reason: A deploys both parts from the same commit on `main`, and keeps the old web live if
the server fails, which is the state the shim test covers. B and C need a setting or a local
tool that is easy to leave in the wrong state; C can deploy local files that are not in git.
D gives a "new web, old server" gap in which every location query fails (H4 8.2). A depends
on Cloudflare having a pause setting; the owner checks it in B.4. If it does not exist, B is
the next choice.

**Answer (2026-11-23): A.** Cloudflare has the setting; the owner turned automatic
`main` deployments off the same day (B.4 row 6).

**R2. How does `develop` go into `main`?**

| Option | What |
|---|---|
| **A (Recommended)** | A PR from `develop` to `main`, merged with "Create a merge commit". No `--delete-branch` |
| B | A fast-forward push: `git push origin origin/develop:main` (no PR) |
| C | "Rebase and merge" or "Squash and merge" on the PR |

Reason: the repo's rule "rebase, never merge" is for a FEATURE branch taking in `main`; it
does not cover a release into `main`. A gives one reviewable PR and one clear deploy commit,
like every PR in this repo, and keeps all 668 commits. B gives identical SHAs but no PR record,
and may be refused by branch protection. C rewrites or squashes 668 commits, so `develop` and
`main` would no longer share history, and every later release would conflict.

**Answer (2026-11-23): A.**

**R3. What happens to `develop` after the release?**

| Option | What |
|---|---|
| **A (Recommended)** | Fast-forward `develop` to `main` (A.2) and keep it as the integration branch for the follow-up release only. After F.1 is deployed, decide whether to keep it |
| B | Delete `develop`; new work branches from `main` again |
| C | Keep `develop` as the permanent integration branch |

Reason: F.1 still needs a short checkpoint (the shim goes only after every device updated).
The 2026-11-13 decision ("no changes go to `main` until households is done") ends with this
release, so the long-term choice is a new decision, not this plan's.

**Answer (2026-11-23): A.**

**R4. Run `verify:migration` on the TEST database again before the release (B.6)?**

| Option | What |
|---|---|
| **A (Recommended)** | Yes, once, before B.7 |
| B | No. The last run (2026-11-22, `415cbf02`) is enough |

Reason: no migration changed since, but its database guard moved to `src/lib/databaseUrl.ts`
(S.6) after that run. One run proves the moved guard and the seven migrations together. It
costs a few minutes and Prisma's consent step.

**Answer (2026-11-23): A.**

**R5. If the release command fails at migration 3 or later (S3), how long do we try to fix
forward before restoring the D.1 branch?**

| Option | What |
|---|---|
| **A (Recommended)** | 30 minutes |
| B | 2 hours |
| C | No limit: always fix forward |

Reason: in that state cloud mode is down for everyone (C9), and nobody can write, so a
restore loses almost nothing. A short limit keeps the outage short. Local mode keeps
working the whole time.

**Answer (2026-11-23): A.**

**R6. Set `CLERK_JWT_KEY` on Railway?** (H3c-1 2.3)

| Option | What |
|---|---|
| **A (Recommended)** | Not now |
| B | Set it before the deploy |

Reason: it is optional. Without it, a socket token check fetches Clerk's keys, and a failure
closes with `1013` and retries. Not setting it removes one way to get it wrong (H3c-1 7.2:
a wrong key gives `4401` on every tab). It can be added later if `1013` repeats.

**Answer (2026-11-23): A.**

**R7. When does the follow-up release (F.1) go out?**

| Option | What |
|---|---|
| **A (Recommended)** | When every device of B.3 shows the new bundle (checked by the owner), and at least one week after the deploy |
| B | As soon as the owner's own devices are updated |

Reason: the shim is the only thing that keeps an un-updated device working. The owner is the
only user today, so B is safe if B.3's list is complete; A leaves time to find a device the
list missed.

**Answer (2026-11-23): A.**

---

## Known gaps and risks

| Gap or risk | Detail |
|---|---|
| Old server down during the release command | after migration 2 commits, `main`'s server cannot run (C9). Short in the normal path; an outage if a later migration fails (S3, R5) |
| Locks with no `lock_timeout` | `drop_user_scope` locks 18 tables; `shared_carts` locks `CartItem`. A long-open old-server transaction makes the release wait (H3a 4.4) |
| The start check never ran on Railway | the build fails safely if it fails there (H3a 4.4) |
| WebSocket upgrade on Railway never tested | D.6 is the first check; the app works without it (H3c-1 8) |
| A real Clerk token on the socket never tested | D.11, H3c-1 5 is the first check |
| One server process only | the live event bus is in memory. Do not scale Railway to two instances (H3c-1 8) |
| Local-mode Dexie 19 and 20 cannot be undone | never run on a real device before D.10 (H3b 1.4) |
| Deleted accounts before H6 | if H6b-O36 is not 0, a one-off script is owed and does not exist (H4 12.6) |
| A `user.deleted` during the deploy | an old server only sets `deletedAt`; D.12 catches it |
| Old-bundle windows | an old bundle has no household guard, no no-household screen and no stale-tab header (H4 9.8, 13.2). Short, because D.10 updates every device |
| `isDefault` follows the shared order | an old bundle may show its lock on a location that is not first in a person's own list (H4 14.4). No data is lost |
| H3a 3.5 counts can move | production may change between the rehearsal and the deploy; D.7 runs them again |
| Results only on the rehearsal branch | B.5 proves the migrations on production as it is that day, not on deploy day. Keep B.5 and D close together |
| Known product gaps carried into production | listed in each runbook's *Known gaps* (for example H4 12.7, 13.4, 14.6) and in the H5 to H7 plans. None blocks the release |
