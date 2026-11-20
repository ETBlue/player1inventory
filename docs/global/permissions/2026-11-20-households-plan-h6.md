# Households H6 (transfer, hand-over, purges, activity) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** an owner can hand the household to another person, and the household keeps
working when the owner's Clerk account is deleted. An owner can clear the household or
delete all its locations, and an organizer can empty one location. Owners and managers can
read a log of who changed what in the household. A deleted account stops counting as an
organizer.

**Architecture:** two migrations, both additive: `HouseholdActivity` (H6a) and
`OwnershipOffer` (H6b). One helper, `recordActivity(tx, entry)` in a new
`apps/server/src/lib/activity.ts`, writes a log row INSIDE the transaction of the change it
describes. Two new purge mutations (`deleteAllLocations`, `removeAllLocationItems`) and the
existing `clearAllData` take the household lock first and check the role after it. Five
offer mutations take the household lock first, like H5b's member writes. The `user.deleted`
branch of `handleClerkEvent` (`apps/server/src/lib/clerkWebhook.ts`) runs one transaction
that marks the account deleted, removes the person from every household, and starts the
hand-over where they were the owner. The web gets an Activity page, two danger zones and an
offer banner.

**Tech Stack:** React 19, TanStack Router and Query, Apollo 4, Dexie (web); Express 5, Apollo
Server 4, Prisma 6, Postgres on Neon (server); Vitest, Playwright, Biome.

**Spec:** [2026-10-04-households-design.md](2026-10-04-households-design.md), sections
*Household roles* (table), *Rules that cross the two levels*, *Data model* (`OwnershipOffer`,
`HouseholdActivity`), *Transfer ownership*, *Owner's account is deleted*, *Create and delete a
household*, *Purge*, *Activity log*, *Screens* (*Desktop* item 8, *Location pages*,
*Prompts*), *Clerk integration*, *Testing notes*. Phase plan:
[2026-10-31-households-plan.md](2026-10-31-households-plan.md), *H6*. Earlier plans this one
continues: [H3a](2026-11-04-households-plan-h3a.md) (decisions H10, H15, H17, the owed
`clearAllData` lock), [H5](2026-11-17-households-plan-h5.md) (*Known gaps*: the deleted
organizer), [H5b](2026-11-18-households-plan-h5b.md) (decisions T11, T14–T16, T19, T21, T30;
*Known gaps*: the raw `P2025`), [H5c](2026-11-19-households-plan-h5c.md) (owner decision O29;
*Known gaps*: deleted accounts in the people lists, **Remove all items**).

Branch `feature/households-h6`, worktree `.worktrees/feature-households`, from `develop` at
`7dbaeca9` (after #391, which merged H5c). Each PR goes into `develop`. Nothing deploys until
the checkpoint release that ships H3a–H6 together.

**Names in this file.** H6 is split in two PRs if the owner agrees (owner decision **O32**):
**H6a** tasks are `J.n`, **H6b** tasks are `K.n`. (H5a used `F.n`, H5b `G.n`, H5c `H.n`. The
letter `I` is skipped because it looks like `1` and `l`.) Technical decisions continue from
H5c: `T46…`. Owner decisions continue from H5c: `O32…`. Disagreements with the code are
`Y1…` (H5 used `D…`, H5b `E…`, H5c `X…`). Outside this file, write "H6 decision T46".

---

## Global Constraints

Every task brief passes these down (see also *Rules every task brief must pass down*).

- Local mode has no roles, no offers and no activity log. The Activity page and both danger
  zones are cloud only. Nothing in `apps/web/src/db/` changes.
- Never write `row.userId === ctx.userId` or `row.householdId === …` as an authorization
  check. Every server check goes through `apps/server/src/lib/authz.ts` (or, for the owner
  check inside a locked transaction, `requireHouseholdRole(ctx, householdId, role, tx)`).
  Marking the caller's own row (`isMe`) is not a check.
- **A location role counts only while the person is a member of the location's household
  (decision H18).** Every new read of `LocationMember` uses the builders in `lib/authz.ts`.
- **One lock order (H5b decision T16):** the `User` row (`lockUser`) before any household row
  (`lockHouseholds`, sorted by id). A write that deletes a household also writes every `User`
  row whose `activeHouseholdId` names it (`onDelete: SetNull`), so it retries ONCE on Prisma's
  `P2034` (`retryOnceOnConflict`, `resolvers/invite.resolver.ts`).
- **Every write that changes who belongs where, or who owns what, takes the household lock
  FIRST** (`lockHouseholdOrForbid`, `lib/household.ts`), then reads every role through `tx`.
  A role read before the lock can be stale by the time the write runs (the H3a owed item,
  decision T52).
- **The activity row is written in the SAME transaction as the change.** A log row exists if
  and only if the change committed (decision T47).
- Every new `Mutation` field goes into `publishes` or `publishesNothing` in
  `apps/server/src/resolvers/live-publish.guard.test.ts`. Today: **72** fields, all in
  `publishes`. Count them again before you add any.
- **Do not break the old-bundle shim.** `apps/server/src/test/oldBundleCompat.test.ts` must
  stay green. H6 only ADDS types, fields, queries and mutations. Do not change or remove an
  existing field, argument or input field.
- A server schema change and the web documents that use it: this plan adds fields only, so a
  new web document may come in a later task than its schema. If a task must change an
  existing type, it goes in ONE commit with every document that uses it (root `CLAUDE.md`,
  *`pnpm codegen` is all-or-nothing*).
- **A new model that belongs to a household must be considered for `emptyHouseholdWhere`**
  (`lib/invite.ts`). Neither new model is added there, on purpose (decision T49); the comment
  above that function must say so.
- **A new model must join `/e2e/cleanup`** (`lib/e2eCleanup.ts`, `CLEANUP_MODEL_KEYS`, and
  `e2e/helpers/cloudTeardown.ts`), `purge-coverage.test.ts` (the filter text) and
  `e2e/tests/cleanup-endpoint.spec.ts` (one row seeded, count at least 1).
- **A new migration must join a group** in `apps/server/scripts/migrationDeploys.ts` and get
  assertions in `apps/server/scripts/verify-migration.ts` (`apps/server/prisma/CLAUDE.md`).
  **No subagent runs a database command.** The main session runs `verify:migration` with the
  owner's consent.
- Node 22.17.1 (`.node-version`). Node 25 breaks the web suite.
- Feature test titles start with `user can …` / `user sees …`. Role tests that really set up a
  role use the role name (`household manager cannot …`).
- Household, location and person names render as stored, never `capitalize`.
- `tw` texts use the app's existing words: 家庭, 據點, 擁有者, 管理者, 成員, and the location
  roles 據點王 (organizer), 搬運工 (participant), 圍觀的 (viewer). Use 「對方」 for "they".
- Plain English in every comment, doc, commit and report.

## Review Focus

The cases most likely to hurt a real person first. Each has its test in the task named.

1. **A purge deletes another household's rows, or another location's rows.** Each purge
   filter is scoped to one household or one location. A real-SQL test with two households and
   two locations fails when one scope is dropped. (J.4 unit tests, J.8 E2E.)
2. **A former owner clears or renames the household after a transfer.** The owner check
   runs AFTER the household lock, and the transfer takes the same lock, so the two cannot
   interleave. (J.4 order tests for `clearAllData`, `deleteAllLocations` and
   `renameHousehold`; K.3 order test for the accept.)
3. **The owner's account is deleted and nobody can take over.** Every row of the design's
   hand-over table gives the right people an offer, and the first accept wins. A second accept
   at the same moment gets a clear refusal, not a second owner. (K.4, K.8.)
4. **A household whose only person deleted their account is deleted with ALL its data, and
   nothing else is.** It has tags with tag types, items, stock and logs. Another household
   with the same shape survives. (K.4, K.8 real SQL.)
5. **A deleted organizer still counts.** A location whose only organizer deleted their
   account shows **No organizer**. (K.2, K.8.)
6. **The activity log shows a person a location they may not see.** The log shows names only,
   to owners and managers only. A household `member` gets `FORBIDDEN`. (J.3.)

---

## Summary

### Where this sits

| Phase | State |
|---|---|
| H1, H2 | ✅ merged into `main`, deployed |
| H3a, H3b, H3c-1, H3c-2, H4 | ✅ merged into `develop`, not deployed |
| H5a, H5b, H5c | ✅ merged into `develop` (#384, #385, #391), not deployed |
| **H6** | this plan: H6a (activity log, purges, danger zones) and H6b (transfer, hand-over, deleted accounts) |
| H7 | personal location order, household switch and create from "Switch to…" |

After H5 a family can share a household. Three things are still missing. Nobody can stop
being the owner, so if the owner's Clerk account is deleted, nobody can rename the household,
make a manager, or clear it, ever again (design, story 2). The only purge is the `clear`
step of an import, and it has no screen of its own. And nobody can see who gave whom a role,
although the design says every role change is logged.

### Relations

- **Blocked by:** nothing. H5c is merged (#391).
- **Blocks:** the checkpoint release, if the owner wants H6 in it. H7 does not need H6.
- **H6a before H6b** (owner decision **O32**): H6b's offers write activity rows, so the
  table and the helper must exist first.
- **Deploy order:** each part has one additive migration and new GraphQL fields. So the
  **server deploys before the web**, the rule for the whole households release (H4 runbook,
  section 8.3). No new env value. The Clerk webhook endpoint already sends `user.deleted`
  (H2).

### What the user gets (once merged AND deployed)

**H6a:**

- **Settings › Household › Activity** (owner and manager, cloud only): a list, newest first,
  of role changes, invites, joins, leaves, removals, purges and imports, with who did it and
  when.
- **A danger zone on the household page** (owner only): **Clear household** (the catalog and
  every location go; "Home" comes back), **Delete all locations** (the catalog stays), and
  **Delete household** if the owner chooses O38-A. Each asks the owner to type the household
  name.
- **A danger zone on a location's page** (organizer only): **Remove all items** deletes the
  location's stock rows and the rows in its carts. The location, its roles and its logs stay.

**H6b:**

- **Transfer ownership** on the Members page. The other person sees a banner and accepts or
  declines. On accept they become owner, and the old owner becomes manager.
- **When the owner's Clerk account is deleted**, the household keeps working. Managers (or
  the people the design's table names) see "The owner of {household} is gone. Do you want to
  become the owner?" The first to accept becomes owner.
- **A household whose only person deleted their account is deleted**, with its data.
- **A deleted account no longer counts** as an organizer, so its locations show **No
  organizer**, and it no longer shows on the Members page, the people page or in Add person.

### What the developer gets

| DX gain | Specifics |
|---|---|
| Fewer ways to get it wrong | One helper, `recordActivity(tx, entry)`, writes every log row, inside the transaction of the change. A log row that names a change that did not commit cannot happen |
| Fewer ways to get it wrong | Every owner-only write reads the owner role AFTER the household lock: `clearAllData`, `renameHousehold`, `deleteAllLocations`, the delete of the household (O38) and the offer writes. The H3a owed item is closed |
| Fewer ways to get it wrong | One ordered delete for "all the data of a household", `deleteHouseholdData(tx, householdId)` in `lib/household.ts`, shared by `clearAllData`, the household delete and the hand-over. Today `clearAllData` holds the only copy of the order |
| A failure that now has a name | `deleteLocation` and `clearAllData` answer `FORBIDDEN` instead of Prisma's raw `P2025` when the household was deleted after `requireHousehold` found it (the H5b known gap) |
| Real-SQL coverage | The first E2E of the `user.deleted` hand-over through `POST /e2e/users/:id/deleted`, and the purge test with two households extended to the two new purges |
| Honest documentation | The H5 and H5c known gaps about deleted accounts are closed, and the texts "Handing over the household is not possible yet" and "comes later" go |

**Costs, stated plainly:**

- Two more tables and two more migrations in `verify-migration.ts`, which someone must run
  by hand with the owner's consent.
- `/e2e/cleanup` grows from 19 to 21 models, and `cleanup-endpoint.spec.ts` seeds two more.
- About nine more `Mutation` fields in the live guard. Most publish a household-level
  `LOCATION`, which refetches every active query in every open tab of the household. These
  writes are rare.
- Every logged write gains one `INSERT`. Two writes that were not transactions
  (`createInvite`, `revokeInvite`) become interactive transactions, which hold a pooled
  connection for the length of the callback.
- The activity table grows without limit (decision T48, *Known gaps*).

---

## Facts this plan is built on (checked 2026-11-20 at `7dbaeca9`)

Line numbers drift. Each task re-reads the code before it trusts a line here.

| Fact | Where |
|---|---|
| `Household` already has `ownerId String?` (`onDelete: SetNull`) and `ownerGoneAt DateTime?`. Nothing reads or writes `ownerGoneAt` today. `ownerId` mirrors the owner's `HouseholdMember` row (decision H15) | `apps/server/prisma/schema.prisma:380–410` |
| `HouseholdMember_one_owner_key` allows at most one `owner` row per household. Zero is allowed | `schema.prisma:411–432`; migration `20261104000000_add_households` |
| The `user` side of `HouseholdMember`, `LocationMember` and `HouseholdInvite.createdBy` has no `onDelete` (Restrict). Production never deletes a `User` row | `schema.prisma:421–486` |
| `Tag.type` is `onDelete: NoAction`. `clearAllData` deletes `tag` before `tagType` | `schema.prisma:62`; `import.resolver.ts:2330–2331` |
| `handleClerkEvent` `user.deleted` only upserts `deletedAt`. Its comment says "H6 adds the household hand-over here" | `apps/server/src/lib/clerkWebhook.ts:52–82` |
| `POST /e2e/users/:id/deleted` calls `handleClerkEvent` directly, so the hand-over will run in E2E too | `apps/server/src/lib/e2eUsers.ts:94–102`; `index.ts:64` |
| `publishHouseholdChange(ctx, kinds, householdId)` reads only `ctx.clientId` from the context. The webhook has no request context, so it can pass `{ userId: null }` | `lib/publishChange.ts:109–127`; `src/context.ts:76–87` |
| `shouldDeliver` delivers a household-level event to MEMBERS of the household. After a household is deleted it has no members, so an event about the delete reaches nobody | `resolvers/live.resolver.ts`; H5b *Known gaps* |
| `countedOrganizerIn(householdId)` checks the organizer's household membership only, not `User.deletedAt`. `locationIdsWithOrganizer` reads it for `Location.hasOrganizer` | `apps/server/src/lib/authz.ts:323–356` |
| `countedLocationRole(userId)` (the caller's own role) does not check `deletedAt` either. A deleted person cannot sign in, so it does not matter for the caller | `authz.ts:100–105` |
| `clearAllData` calls `requireHouseholdRole(…, 'owner')` BEFORE its transaction, then `lockHousehold` (an `update`, raw `P2025` when the household is gone). It deletes 15 tables in order and re-creates "Home" with an `organizer` row (H3a decision H17) | `apps/server/src/resolvers/import.resolver.ts:2307–2352` |
| `deleteLocation` checks `manager` before its transaction and uses `lockHousehold` (raw `P2025`) | `resolvers/location.resolver.ts:401–440` |
| `renameHousehold` checks `owner`, then one `update`, no lock | `resolvers/household.resolver.ts:199–210` |
| `setHouseholdRole` refuses `role: owner` with "Handing over the household is not possible yet."; `leaveHousehold` refuses the owner with "The owner cannot leave. Handing over the household comes later." Both take `lockHouseholdOrForbid` first and read the role through `tx` | `household.resolver.ts:244–330` |
| `removeFromHousehold(tx, householdId, userId)` deletes the person's `LocationMember` rows of that household, revokes their open invites there, deletes their member row. Private to `household.resolver.ts` | `household.resolver.ts:129–142` |
| `createInvite` and `revokeInvite` are NOT transactions: one `create` / one `updateMany` | `resolvers/invite.resolver.ts:208–250`, `:438–455` |
| `joinHousehold` runs in `retryOnceOnConflict(() => prisma.$transaction(…))` | `invite.resolver.ts:325–425` |
| H5c's three role writes run in one transaction each, lock first (`lockAndReadRoles`), publish after | `location.resolver.ts:205–245`, `:514–610` |
| `emptyHouseholdWhere` lists every household-owned model that makes a household "not empty". A new model not listed there does not stop the join's delete | `apps/server/src/lib/invite.ts:100–160` |
| `/e2e/cleanup` deletes 19 models in an array `$transaction`, reading owned households by the `HouseholdMember` owner row | `apps/server/src/lib/e2eCleanup.ts:40–175` |
| The live guard lists **72** `Mutation` fields in `publishes`, 0 in `publishesNothing` | `resolvers/live-publish.guard.test.ts:54–179` |
| On the web, `LOCATION` refetches every active query (`'all'`) | `apps/web/src/apollo/liveUpdates.ts:104–114` |
| A `JSON` scalar exists | `apps/server/src/schema/schema.graphql:1` |
| The household config page shows `HouseholdNameCard`, `ExportCard`, `ImportCard`; its comment says "The danger zone arrives with the purges in H6" | `apps/web/src/routes/settings/household/index.tsx` |
| `HouseholdSidebar` lists the household items; its comment says Activity (H6) is added by the phase that builds it. The mobile accordion is in `routes/settings/index.tsx` | `components/global/Sidebar/HouseholdSidebar.tsx:19–92`; `routes/settings/index.tsx:55–80` |
| `OfflineBanner` renders inside `Layout` in `__root.tsx`, cloud only. A new banner goes beside it | `apps/web/src/routes/__root.tsx:139–141` |
| `/settings/household/locations/$id` (H5c) is cloud only and has no danger zone yet | `routes/settings/household/locations/$id.tsx` |
| `purge-two-households.spec.ts` exists (H3a decision H10) and runs in `cloud` only | `e2e/tests/`; `e2e/playwright.config.ts:206–207`, `:265–266` |
| `migrationDeploys.ts` has four groups; the `last` group must stay last | `apps/server/scripts/migrationDeploys.ts:31–60` |
| `verify-migration.ts` keeps COPIES of `lockHousehold` and of `clearAllData`'s statements for `assertHouseholdLock`. A change to them in `src` must change the copy | `apps/server/prisma/CLAUDE.md`, *It also proves two things that are not migrations* |
| Test baseline: **not measured** by this plan's author (the brief allowed docs only). J.1 Step 0 measures it | — |

## Where the design and the outline disagree with the code

| # | The design or outline says | The code today | What this plan does |
|---|---|---|---|
| Y1 | Design, *Owner's account is deleted*: a deleted non-owner shows in logs as "Deleted user" | `handleClerkEvent` keeps the stored name on purpose: "so logs can still name the person" (`clerkWebhook.ts:51–52`, H2) | Owner decision **O35** |
| Y2 | Design, *Household roles*: "Delete the household" is an owner right; *Create and delete a household* describes it | No phase in the design's *Sequencing* table builds it. H7's row names switch and create only | Owner decision **O38** |
| Y3 | Design, *Purge*: *Delete all locations* keeps nothing of the locations | `clearAllData` re-creates "Home" (H17, kept by H5a O5). The design does not say whether *Delete all locations* does too | Owner decision **O34** |
| Y4 | Design, *Activity log*: "every import" is logged | An import is up to 22 mutations, sent in batches of 50. The server cannot tell where one import ends | Owner decision **O33** |
| Y5 | Design, *Purge*: "Each asks the person to type the household or location name" | — | The web asks. The server does not take the name (decision T56) |
| Y6 | Design, `OwnershipOffer`: `householdId`, `toUserId`, `fromUserId?`, `kind`, `createdAt`, `dismissedAt?` | No `id`, so a mutation cannot name one offer | Decision T58: an `id` and a unique `(householdId, toUserId)` |
| Y7 | Design, `HouseholdActivity.actorId`: "who acted" | The hand-over is started by a webhook, not a request | Decision T50: the actor is the deleted person. No foreign key on `actorId` or `targetUserId` |
| Y8 | Phase plan, H6: the deleted-organizer fix "belongs with the `user.deleted` hand-over branch" | Right for the future: the hand-over removes the deleted person's rows, so H18 hides them. But the H3a migration made a household for EVERY `User` row, deleted ones too (`add_households/migration.sql:134`), and accounts deleted before H6 deploys keep their rows | Decision T61 (a `deletedAt: null` filter as well) and owner decision **O36** |
| Y9 | H3a plan, owed to H6: move `clearAllData`'s owner check inside the transaction, after the lock, and make the transfer take the same lock | Still as before at `7dbaeca9` (`import.resolver.ts:2315`) | Decision T52, task J.4 |
| Y10 | H3a plan: `renameHousehold` reads the role, then writes with no lock; "H6 decides whether that matters" | Still so | It matters once a transfer exists. Decision T52 |
| Y11 | H5b *Known gaps*: `deleteLocation` and `clearAllData` can throw a raw `P2025` | Still so | Fixed in J.4 (`lockHouseholdOrForbid`), because J.4 rewrites `clearAllData`'s start anyway |
| Y12 | Design: the hand-over table counts "the only person" | A household can hold members whose accounts are already deleted (Y8) | Decision T60: only members with `deletedAt: null` count as people |
| Y13 | Design, *Rules that cross the two levels*: "Every location role change is written to the activity log" | A join gives location roles from the invite; `createLocation` gives its creator `organizer`; `clearAllData` gives the caller `organizer` on the new "Home" | Decision T51 says which of these are logged |
| Y14 | Design, `HouseholdActivity.details` (JSON) | The web needs typed fields to build a translated sentence | Decision T53: typed optional fields in GraphQL; JSON in Postgres |
| Y15 | Design, *Screens › Local mode*: local mode has none of this | `clearAllData`'s twin in local mode is the import `clear` | No local danger zone. Recorded in *Known gaps* |

## Gaps folded in from earlier plans

| Gap | From | Goes to |
|---|---|---|
| A deleted organizer still counts for `Location.hasOrganizer` (owner decision 2026-11-17: must be fixed) | H5 *Known gaps*; phase plan *H6* | **K.2**, **K.4**, **K.8** |
| A deleted account still shows in Add person and on the people page | H5c *Known gaps* | **K.2**, **K.4** |
| Role changes are not logged (O29-A: H6 logs from the day it ships) | H5c O29 | **J.2** |
| **Remove all items** (location danger zone) | H5c *Known gaps*; design *Location pages* | **J.4**, **J.7** |
| A real-SQL purge test with two households for the new purges | Phase plan *H6* | **J.8** |
| `clearAllData`'s owner check before the lock | H3a plan, owed to H6 | **J.4** |
| `renameHousehold` and the hand-over race | H3a plan | **J.4** |
| `deleteLocation` / `clearAllData` raw `P2025` | H5b *Known gaps* | **J.4** |
| The owner cannot leave ("comes later"); `setHouseholdRole` refuses `owner` ("not possible yet") | H5b G.5 texts | **K.3**, **K.7** |

Not folded in, on purpose:

- A person in two households writing into the wrong one (H5b O21, owed to **H7**).
- Any household switch, "Switch to…", or creating a second household (**H7**).
- The old-bundle shim removal (the release after households).
- Inactivity as a hand-over trigger, claims with a veto, e-mail (design, *Postponed*).

---

## Decisions

### Technical decisions (made in this plan)

| # | Decision | Why | Rejected |
|---|---|---|---|
| T46 | **Model `HouseholdActivity`**: `id String @id @default(cuid())`, `householdId` (relation, `onDelete: Cascade`), `actorId String` (plain string, no relation), `action ActivityAction` (a Prisma enum), `targetUserId String?` (plain), `locationId String?` (plain, no relation), `details Json?`, `createdAt DateTime @default(now())`. `@@index([householdId, createdAt(sort: Desc), id])` | A log must outlive the location and the person it names, so neither is a foreign key (a deleted location would cascade or block). `/e2e/cleanup` deletes `User` rows; a foreign key from a log row in ANOTHER household would block that delete. The enum makes a typo fail at `tsc` (decision H14) | A relation to `Location` (`SetNull` loses which location it was); a free-text `action` |
| T47 | **`recordActivity(tx, entry)` in `apps/server/src/lib/activity.ts`** is the only writer. It takes the transaction client, never the global `prisma`. Every logged change runs inside an interactive transaction, so `createInvite` and `revokeInvite` become one | A log row for a write that rolled back would be a false record; a write with no row would hide a change. One helper keeps the shape the same everywhere | Writing the row after the commit (a crash between the two loses it); a Postgres trigger (cannot see the actor) |
| T48 | **No retention limit and no delete of log rows**, except with the household (cascade) | A family app writes a few rows a week. A limit is easy to add later; a lost row cannot come back | A 1-year limit now |
| T49 | **Neither new model joins `emptyHouseholdWhere`.** A joiner's own household with only log rows or offers is still "empty", and its rows go with it by cascade. The comment above `emptyHouseholdWhere` says so, and a test in `invite-join.resolver.test.ts` pins it | A log row is not data the person would lose. An offer in a one-person household cannot exist (nobody to offer to) | Adding them (a person who once cleared their empty household could never have it removed at a join) |
| T50 | **The actor of a hand-over row is the deleted person.** Rows the webhook writes have `actorId` = the deleted user's id | Every row has an actor, so the page never needs a "system" case | A nullable `actorId` |
| T51 | **What is logged** (the `ActivityAction` enum): `LOCATION_ROLE_SET` (`details: { from, to }`), `LOCATION_ROLE_REMOVED`, `LOCATION_LEFT`, `HOUSEHOLD_ROLE_CHANGED` (`{ from, to }`), `INVITE_CREATED` (`{ householdRole }`), `INVITE_REVOKED`, `MEMBER_JOINED` (`{ householdRole, locationRoles: [{ locationId, locationName, role }] }`), `MEMBER_LEFT`, `MEMBER_REMOVED`, `HOUSEHOLD_CLEARED`, `LOCATIONS_DELETED` (`{ count }`), `LOCATION_ITEMS_REMOVED` (`{ stockRows, cartRows }`), `IMPORT` (O33), and in H6b `OWNERSHIP_OFFERED`, `OWNERSHIP_OFFER_CANCELLED`, `OWNERSHIP_DECLINED`, `OWNERSHIP_ACCEPTED` (`{ kind }`), `HANDOVER_STARTED` (`{ offeredTo: [userId] }`), `ACCOUNT_DELETED`. NOT logged: `createLocation`'s organizer row for its creator, `createHousehold`, the organizer row `clearAllData` gives on the new "Home" (part of `HOUSEHOLD_CLEARED`), renames, item and stock writes (those are in `InventoryLog`) | The design's list, made exact. The design's reason for logging role changes is bug tracing: a person who gave themselves a role. A creator's own role on a new, empty location traces nothing | Logging every location write (noise; stock already has `InventoryLog`) |
| T52 | **Owner-only writes check the owner role AFTER the household lock, through `tx`**: `clearAllData`, `renameHousehold`, `deleteAllLocations`, the household delete (O38-A) and every offer write. All lock with `lockHouseholdOrForbid`, so a household deleted since `requireHousehold` gives `FORBIDDEN`, not `P2025`. `deleteLocation` moves to `lockHouseholdOrForbid` too and reads its `manager` role through `tx` | A transfer (K.3) and a hand-over (K.4) take the same lock, so an old owner's write either commits before the transfer or is refused after it. The H3a owed item | Keeping the check before the lock and accepting the race |
| T53 | **GraphQL shape of a log row**: `type HouseholdActivityEntry { id: ID! action: ActivityAction! createdAt: String! actorName: String! actorIsMe: Boolean! targetName: String locationName: String fromRole: String toRole: String householdRole: HouseholdRole count: Int }`. `locationName` is read from `details` (stored at write time), never from `Location`, because the location may be gone. Names come from `User.displayName` (O35 for deleted accounts) | Typed fields let the web build one translated sentence per action. A JSON blob would need its own checking on the web | Exposing `details` as `JSON` |
| T54 | **`householdActivity(before: ID, first: Int): [HouseholdActivityEntry!]!`** in a new `resolvers/activity.resolver.ts`. Owner or manager of the caller's household (`requireHouseholdRole(ctx, householdId, 'manager')`); anyone else `FORBIDDEN`. Newest first by `(createdAt, id)`. `first` defaults to 50, at most 200. `before` is an entry id: the page after it. An unknown or foreign `before` gives `BAD_USER_INPUT` | The design: owner and managers read it, newest first. A cursor by id is stable when new rows arrive | Offset paging (rows shift when new ones arrive) |
| T55 | **Two new purge mutations.** `deleteAllLocations: Boolean!` (owner; `deleteMany` of the household's locations, which cascades stock, logs, carts and role rows; the catalog stays). `removeAllLocationItems(locationId: ID!): Boolean!` (organizer of that location, through `requireLocationRole`, and the location must be in the caller's household; deletes the location's `ItemStock` rows and the `CartItem` rows of its carts; keeps `Cart` rows, so `lastPurchasedAt` stays; keeps logs and roles). Each writes its activity row in its transaction. `false` when there was nothing to delete, with no row and no event | The design's table. Keeping the `Cart` row keeps "last purchased" on the shopping page; an empty cart is what `vendorCart` would make again anyway | Deleting `Cart` rows too |
| T56 | **The typed-name confirm is in the web only.** The server checks the role, not the name | The role is the real guard. A name check on the server adds a second error path for nothing a stale tab could not also type | Passing `confirmName` and comparing on the server |
| T57 | **Events.** `deleteAllLocations` and the household delete publish household-level `LOCATION`. `removeAllLocationItems` publishes `STOCK` and `CART` at that location. `clearAllData` keeps `LOCATION` + `CATALOG`. The web's `HouseholdActivity` query is listed under `LOCATION` (already `'all'`), `CATALOG` and `STOCK` in `QUERIES_BY_KIND`'s comment table, so an open Activity page updates for every logged change | Every logged write already publishes one of those kinds | A new `ChangeKind` (an enum value is a "dangerous" change for `oldBundleCompat.test.ts`, and the web already refetches on the existing kinds) |
| T58 | **Model `OwnershipOffer`** (H6b): `id String @id @default(cuid())`, `householdId` (`onDelete: Cascade`), `toUserId` (relation to `User`, `onDelete: Cascade`), `fromUserId String?` (plain), `kind OfferKind` (`transfer` / `handover`), `createdAt`, `dismissedAt DateTime?`. `@@unique([householdId, toUserId])`, `@@index([toUserId])` | A mutation names one offer by `id`. One offer per person per household keeps "first accept wins" simple. `Cascade` on `toUserId` keeps `/e2e/cleanup` working; production never deletes a `User` row | The design's key-less shape |
| T59 | **Transfer.** `offerOwnership(userId: ID!): OwnershipOffer!` (owner; target must be a member and not the caller; deletes any other open `transfer` offer of the household first: at most one at a time). `cancelOwnershipOffer: Boolean!` (owner; `false` when none). `acceptOwnershipOffer(id: ID!): Household!` and `declineOwnershipOffer(id: ID!): Boolean!` (only the offer's `toUserId`). `dismissOwnershipOffer(id: ID!): Boolean!` sets `dismissedAt` (the banner's "Not now"; the offer stays). Accept of a `transfer`: the old owner's row becomes `manager` FIRST, then the caller's row `owner`, then `Household.ownerId` (the partial unique index refuses two owners in between), then every offer of the household is deleted. Location roles do not change. Accept and decline act on the OFFER's household, which may be the caller's other household | The design's flow, step by step. Demote-then-promote is the only order the unique index allows | A transfer with no accept |
| T60 | **Hand-over on `user.deleted`** (`handleClerkEvent`), ONE transaction, retried once on `P2034`: 1. upsert the `User` row with `deletedAt` (it is the first `User` write, so it is the `lockUser` of T16); 2. read the person's memberships; 3. `lockHouseholds` on all of them, sorted; 4. per household: a manager or member → `removeFromHousehold` (moved to `lib/household.ts`, now also deletes offers TO the person) and an `ACCOUNT_DELETED` row; the owner → if no OTHER member with `deletedAt: null` remains, `deleteHouseholdData` and delete the household; else delete the owner's role rows and member row, set `ownerId: null` and `ownerGoneAt: now`, delete every offer of the household, create `handover` offers by the design's table, counting only members with `deletedAt: null`, and write `HANDOVER_STARTED`. 5. After the commit, one household-level `LOCATION` per household that still exists. A second delivery of the same event finds no membership and does nothing | The design's table, made atomic and safe to repeat (Svix retries). "Only person" ignores members whose own accounts are deleted (Y12) | Running the hand-over lazily on the next request (nobody may sign in for weeks) |
| T61 | **A deleted account does not count as an organizer**: `countedOrganizerIn` adds `user: { …, deletedAt: null }`. `peopleOfLocation` (H5c), `householdMembers` and the Add person list apply the same filter | The hand-over removes the rows for every deletion from now on. The filter covers rows from before H6 (Y8) and any webhook that is delayed. It is the owner's 2026-11-17 decision in its own words | Relying on the hand-over alone |
| T62 | **When a hand-over's offers all disappear** (each offered person left, was removed, or deleted their account) and the household still has no owner, the remaining members get new `handover` offers by the same table, in the same transaction as the change that removed the last offer. A shared helper, `startHandover(tx, householdId)`, does it for T60 and here | Otherwise a household can be left with no owner and nobody who can take it | Waiting for someone to ask |
| T63 | **A pending `transfer` offer when the owner's account is deleted is dropped**, and the design's table decides who gets a `handover` offer | One rule. The person who had the transfer offer gets a hand-over offer anyway when the table names them | Giving them priority |
| T64 | **`deleteHouseholdData(tx, householdId)`** in `lib/household.ts`: the ordered `deleteMany` list of `clearAllData` (logs, cart items, carts, recipe items, recipes, item tags, item vendors, stock, items, tags, tag types, vendors, shelves, locations), then the caller deletes or keeps the household. `clearAllData` calls it and then re-creates "Home". The `verify-migration.ts` copy of `clearAllData`'s statements is updated to match | One order for three callers. `Tag.type` is `NoAction`; the explicit order deletes tags first, so the cascade from `household.delete` never has to | Relying on `household.delete`'s cascade (not proved on real SQL with tags and tag types) |
| T65 | **Web: offers.** One query, `myOwnershipOffers: [OwnershipOffer!]!` (offers TO the caller in every household they are in, dismissed ones too, with `householdName` and `fromName`). `Household` gains `hasOwner: Boolean!` and `pendingTransfer: OwnershipOffer` (owner only, else `null`). The banner shows offers with `dismissedAt: null`; the Members page shows **Accept** for every offer of this household. Write hooks refetch with `refetchAfterWrite`, never `awaitRefetchQueries` (H5c T37) | The banner must show an offer from the person's OTHER household too: accepting does not switch households | One query per household |

### Owner decisions

Questions **O32–O39** are at the end of this file, under *Owner questions*. Each task names the
ones it needs. **The owner answered "all A" on 2026-11-20.** So the plan as written, which uses
the recommended option everywhere, is the decided plan:

| Question | Answer |
|---|---|
| O32 | A. Two PRs: H6a (J.1–J.9), then H6b (K.1–K.9) |
| O33 | A. One log row per import, through `recordImport` |
| O34 | A. No new "Home" after "Delete all locations" |
| O35 | A. The stored name with "(deleted account)" after it |
| O36 | A. Count deleted accounts before the release; a one-off script only if the count is not 0 |
| O37 | A. The last person leaving an ownerless household deletes it, after a warning |
| O38 | A. "Delete the household" is built in H6a, in the household danger zone |
| O39 | A. The texts as written; the owner may still correct them in the PR |

---

## File map

| File | Task | Change |
|---|---|---|
| `apps/server/prisma/schema.prisma`, `prisma/migrations/2026112…_add_household_activity/` (new) | J.1 | `HouseholdActivity`, `ActivityAction` |
| `apps/server/scripts/migrationDeploys.ts`, `scripts/verify-migration.ts` | J.1, J.4, K.1 | the two migrations in the `last` group; assertions; the `clearAllData` copy |
| `apps/server/src/lib/activity.ts` (+ test, new) | J.1 | `recordActivity` |
| `apps/server/src/test/householdFake.ts`, `householdWorld.ts` (+ tests) | J.1, K.1 | `householdActivity` and `ownershipOffer` stores that apply every `where` key and throw on an unknown one |
| `apps/server/src/lib/e2eCleanup.ts` (+ test), `e2e/helpers/cloudTeardown.ts`, `resolvers/purge-coverage.test.ts`, `e2e/tests/cleanup-endpoint.spec.ts` | J.1, K.1 | 20, then 21 models |
| `apps/server/src/lib/invite.ts` | J.1 | the T49 comment |
| `resolvers/location.resolver.ts`, `household.resolver.ts`, `invite.resolver.ts`, `import.resolver.ts` (+ their tests) | J.2 | activity rows in every write T51 names |
| `apps/server/src/schema/activity.graphql` (new), `resolvers/activity.resolver.ts` (+ test, new), `resolvers/index.ts`, `schema/index.ts` | J.3 | the query |
| `apps/server/src/lib/household.ts` (+ test) | J.4, K.3, K.4 | `deleteHouseholdData`; `removeFromHousehold` moved here; `startHandover` |
| `import.resolver.ts`, `location.resolver.ts`, `household.resolver.ts`, `schema/location.graphql`, `schema/household.graphql` | J.4 | lock order, two purges, the household delete (O38) |
| `resolvers/live-publish.guard.test.ts` | J.4, J.2 (O33), K.3 | new fields |
| `apps/web/src/apollo/operations/*.graphql`, `apps/web/src/hooks/useHouseholdActivity.ts`, `usePurges.ts` (new, + tests), `hooks/usePermissions.ts`, `apollo/liveUpdates.ts` | J.5 | documents, hooks, `canReadActivity`, `canPurgeHousehold`, `canRemoveAllItems(locationId)` |
| `apps/web/src/routes/settings/household/activity.tsx` (new, + cloud test, local test, stories, smoke), `components/household/ActivityList/` (new) | J.6 | the page |
| `components/global/Sidebar/HouseholdSidebar.tsx`, `routes/settings/index.tsx` (+ tests, stories) | J.6 | Activity item, cloud only, owner and manager |
| `apps/web/src/components/settings/HouseholdDangerZone/` (new), `routes/settings/household/index.tsx`, `components/location/LocationDangerZone/` (new), `routes/settings/household/locations/$id.tsx` | J.7 | the danger zones |
| `apps/web/src/lib/importData.ts`, `components/settings/ImportCard/` | J.5 (O33-A) | `recordImport` at the end of an import |
| `apps/web/src/i18n/locales/en.json`, `tw.json` | J.6, J.7, K.6, K.7 | the O39 texts |
| `e2e/tests/household-activity-purges.spec.ts` (new), `e2e/tests/purge-two-households.spec.ts`, `e2e/pages/HouseholdPage.ts`, `e2e/pages/ActivityPage.ts` (new), `e2e/playwright.config.ts` | J.8 | the E2E |
| `prisma/migrations/2026112…_add_ownership_offers/` (new) | K.1 | `OwnershipOffer`, `OfferKind` |
| `apps/server/src/lib/authz.ts` (+ test), `location.resolver.ts`, `household.resolver.ts` | K.2 | `deletedAt: null` (T61) |
| `apps/server/src/schema/ownership.graphql` (new), `resolvers/ownership.resolver.ts` (+ test, new) | K.3 | five mutations, `myOwnershipOffers`, `Household.hasOwner`, `.pendingTransfer` |
| `apps/server/src/lib/clerkWebhook.ts` (+ test) | K.4 | the hand-over |
| `apps/web/src/apollo/operations/ownership.graphql` (new), `hooks/useOwnershipOffers.ts` (new, + test), `hooks/usePermissions.ts` | K.5 | |
| `apps/web/src/components/household/OwnershipOfferBanner/` (new), `routes/__root.tsx` | K.6 | the banner |
| `components/household/MemberList/MemberList.tsx`, `routes/settings/household/members.tsx` (+ tests, stories) | K.7 | Transfer, Cancel, Accept, the no-owner note, the owner's Leave text |
| `e2e/tests/household-ownership.spec.ts` (new), `e2e/pages/MembersPage.ts`, `e2e/playwright.config.ts` | K.8 | the E2E |
| docs (below) | J.9, K.9 | |

---

# Part 1 — H6a: activity log, purges, danger zones

## Task J.1 — the `HouseholdActivity` table, `recordActivity`, fakes and cleanup

**Files:** `apps/server/prisma/schema.prisma`, a new migration folder
`apps/server/prisma/migrations/<timestamp>_add_household_activity/migration.sql`,
`apps/server/scripts/migrationDeploys.ts`, `scripts/verify-migration.ts`,
`apps/server/src/lib/activity.ts` and `activity.test.ts` (new), `src/test/householdFake.ts`,
`householdWorld.ts` and their tests, `src/lib/e2eCleanup.ts` and `e2eCleanup.test.ts`,
`resolvers/purge-coverage.test.ts`, `e2e/helpers/cloudTeardown.ts`,
`e2e/tests/cleanup-endpoint.spec.ts`, `src/lib/invite.ts`, `resolvers/invite-join.resolver.test.ts`.

- [x] **Step 0: measure the baseline.** On the unmodified tree, `pnpm test` from the repo
  root. Record web, server and `scripts/spec` counts. Count the live guard fields. If the web
  suite fails, check `uptime` and re-run the failing file alone before calling it real.
- [x] **Step 1: write the failing tests.**
  - `activity.test.ts`: `recordActivity(tx, entry)` writes one row through the `tx` it was
    given (a spy on the global client sees no call); it refuses an entry with no
    `householdId` or no `actorId` (a thrown `Error`, not a row with `undefined`, which Prisma
    reads as "no filter" elsewhere and as a missing column here).
  - fake tests: the `householdActivity` store applies `householdId`, `createdAt` (`lt`, `lte`),
    `id` and `OR` keys used by T54's cursor, and THROWS on any other key; `orderBy` on
    `[createdAt desc, id desc]`; `take`.
  - `e2eCleanup.test.ts`: 20 keys; the new `householdActivity.deleteMany` runs before
    `household.deleteMany` with `{ householdId: owned }`.
  - `purge-coverage.test.ts`: the filter text of the new call.
  - `invite-join.resolver.test.ts`: a joiner's own household that holds only activity rows
    is still deleted at the join (T49).
- [x] **Step 2:** run: red.
- [x] **Step 3: schema and migration** (T46). The migration creates the enum, the table, the
  foreign key to `Household` with `ON DELETE CASCADE`, and the index. It is additive: no
  backfill, no guard (`apps/server/prisma/CLAUDE.md`, *Adding a NULLABLE column*). Write in
  the SQL comment why `actorId`, `targetUserId` and `locationId` have no foreign key.
- [x] **Step 4:** add the migration to the `last` group of `migrationDeploys.ts`, after
  `20261118000000_add_household_invites`. In `verify-migration.ts`: the table exists; its
  columns and nullability are as T46; the foreign key to `Household` is `CASCADE`; there is
  NO foreign key from `actorId`, `targetUserId` or `locationId` (read from
  `information_schema`, not with `LIKE '%Id%'`: the H3a rehearsal trap); a row inserted then
  its household deleted leaves no row.
- [x] **Step 5:** `lib/activity.ts`, the fakes, the cleanup (20 models), the comment above
  `emptyHouseholdWhere` (T49), `cloudTeardown.ts`'s key list, and one seeded row in
  `cleanup-endpoint.spec.ts` (written through a real logged mutation, for example
  `createInvite`, once J.2 exists; until then the E2E step waits for J.8).
- [x] **Step 6:** `pnpm --filter server exec prisma validate`, `pnpm codegen`, the full gate.
  **Do not run** `prisma migrate dev`, `verify:migration` or any command that reaches a
  database. Report that `verify:migration` is owed to the main session (J.9).

**Mutation checks** (copy each file aside first; restore from the copy):

| Mutation | Must go red |
|---|---|
| `recordActivity` writes through the global `prisma` | the spy test |
| the fake ignores an unknown `where` key | the fake's throw test |
| `householdActivity.deleteMany` removed from the cleanup | `e2eCleanup.test.ts` key count |
| `householdActivity: { none: {} }` added to `emptyHouseholdWhere` | the T49 join test |

**E2E:** none in this task (the cleanup row is checked in J.8).

---

## Task J.2 — log the writes that exist today

Needs owner decision **O33** (imports).

**Files:** `resolvers/location.resolver.ts`, `household.resolver.ts`, `invite.resolver.ts`,
`import.resolver.ts`, their test files (`location-people.resolver.test.ts`,
`household-members.resolver.test.ts`, `invite.resolver.test.ts`, `invite-join.resolver.test.ts`,
`clearAllData.resolver.test.ts`), and with O33-A `schema/import.graphql` and
`live-publish.guard.test.ts`.

- [x] **Step 1: failing tests.** One per write in T51, through the resolver, on
  `householdWorld`:
  - `setLocationRole` (add and change), `removeLocationRole`, `leaveLocation`: one row each,
    with the right action, actor, target, `locationId`, and `details.locationName` and
    `{ from, to }`. **No row** when nothing changed (the H5c T38 cases: the same role again,
    no role row).
  - `setHouseholdRole`: a row with `{ from, to }`; none for the same role.
  - `removeMember`, `leaveHousehold`, `joinHousehold` (with its location roles in `details`),
    `createInvite`, `revokeInvite` (none when it answers `false`).
  - `clearAllData`: one `HOUSEHOLD_CLEARED` row, written AFTER the deletes (so the clear does
    not delete it; the table has no `location` relation, so it is not in the delete list
    either).
  - **Atomicity:** for one write per resolver file, make the step after `recordActivity`
    throw; the change AND the log row are both absent (the fake's `runInTransaction`
    rollback).
  - **Refusals log nothing:** a `FORBIDDEN` `setLocationRole` writes no row.
  - `joinHousehold`: the retry on `P2034` writes ONE row, not two.
  - With **O33-A**: `recordImport(counts: ImportCountsInput!): Boolean!` (owner or manager,
    `requireCatalogRole(ctx, 'manager')`), one `IMPORT` row with the counts in `details`; a
    `member` gets `FORBIDDEN`.
- [x] **Step 2:** red.
- [x] **Step 3:** wrap `createInvite` and `revokeInvite` in `prisma.$transaction(async (tx)
  => …)`. Keep their reads and answers as they are; publish after the commit, as now.
- [x] **Step 4:** add `recordActivity(tx, …)` to each write, inside its transaction, after
  the change and before the callback returns. Read display names for `details` only where
  T53 needs them stored (`locationName`); person names are read at query time.
- [x] **Step 5 (O33-A):** the `recordImport` mutation and its input; add it to
  `publishesNothing` with the reason "writes only an activity row; the import's own
  mutations already published".
- [x] **Step 6:** `pnpm codegen` (check the output: `grep -c recordImport
  apps/server/src/generated/graphql.ts`), `oldBundleCompat.test.ts`, the full gate.

**Mutation checks:**

| Mutation | Must go red |
|---|---|
| `recordActivity` moved after the transaction in `setLocationRole` | the atomicity test |
| `setHouseholdRole` logs also when the role did not change | its "no row for the same role" test |
| `revokeInvite` logs before checking `count` | its "`false` writes no row" test |
| `joinHousehold` logs outside the retried callback | the `P2034` test |
| `clearAllData` writes the row before the deletes | the `HOUSEHOLD_CLEARED` test, if the deletes ever reach the table; otherwise note it as unreachable, not as coverage |

**Mutation checks run (2026-11-20).** Each file was copied aside first and restored from the
copy (`diff -q` clean, green again after each).

| Mutation | Result |
|---|---|
| `setLocationRole` writes its row in a second transaction after the first one commits | **red**: "the role change and its row roll back together when the log write fails" (`activity-writes.resolver.test.ts`) |
| `setHouseholdRole` logs also when the role did not change | **red**: "the same household role again writes no row" |
| `revokeInvite` logs before checking `count` | **red**: "a revoke that answers false writes no row" |
| `joinHousehold` logs in a second transaction after the retried one | **red**: "the join and its row roll back together when the log write fails", and the existing P2034 test "a first attempt … the join succeeds once" (it counts 3 `$transaction` calls, not 2). The new "a join retried after P2034 writes ONE MEMBER_JOINED row" test **stays green**: see *What this plan got wrong* |
| `clearAllData` writes the row right after the lock, before the deletes | **red**: "household owner can clear the household: every delete is scoped to it, lock first, Home last" (the `log` event is no longer last). The HOUSEHOLD_CLEARED content test stays green, because no delete reaches the log table: that is expected, not coverage |
| `createInvite` logs through the global `prisma`, not `tx` | **red**: the `afterEach` spy check ("householdActivity.create through the global client: expected 1 to be +0") on the INVITE_CREATED test, and the invite atomicity test |
| `recordImport` asks `requireHousehold` instead of `requireCatalogRole(ctx, 'manager')` | **red**: "household member cannot record an import, even as the organizer of a location, and nothing is logged" |

**Review of J.2 (2026-11-20).** Three more mutations, run by the reviewer the same way:

| Mutation | Result |
|---|---|
| `removeLocationRole` writes its row before the `from === null` check | **red**: "removing a role nobody has answers false and writes no row" (and the one-row test) |
| `recordImport` accepts a negative count (`value < 0` dropped) | **red**: "refuses a negative count with BAD_USER_INPUT, and writes no row" |
| `recordImport` takes the caller's FIRST owner or manager membership instead of `requireCatalogRole` | **stayed green** with the test as committed. Its title said "not another one they own", but YUKI owned only hh_x, so any household of YUKI's was the right one. The test now makes YUKI a manager of hh_h too and records once with each household active. The same mutation is now **red**: `expected [ 'hh_x', 'hh_x' ] to deeply equal [ 'hh_x', 'hh_h' ]` |

**E2E:** none (J.8). `e2e/tests/cleanup-endpoint.spec.ts` expects `householdActivities >= 1`.
Since this task `createInvite` writes an `INVITE_CREATED` row, so the spec should pass now. It
is unrun until J.8.

---

## Task J.3 — the `householdActivity` query

**Files:** `apps/server/src/schema/activity.graphql` (new), `schema/index.ts`,
`resolvers/activity.resolver.ts` and `activity.resolver.test.ts` (new), `resolvers/index.ts`.

- [x] **Step 1: failing tests** (two households; an owner, a manager, a member; a location the
  caller has no role on; a deleted-account actor):
  - `user sees the household's activity, newest first` (owner and manager);
  - a `member` → `FORBIDDEN`; another household's rows never appear;
  - paging: `first: 2`, then `before:` the last id gives the next two; an id of another
    household → `BAD_USER_INPUT`; `first` above 200 is cut to 200;
  - two rows with the same `createdAt` keep a stable order (`id` breaks the tie);
  - `locationName` comes from `details`, also after the location is deleted;
  - names: `actorName` from `User.displayName`, `actorIsMe` for the caller; a deleted
    account's name per O35;
  - no e-mail anywhere in the answer (the user read `select`s `id`, `displayName`,
    `deletedAt` only).
- [x] **Step 2:** red.
- [x] **Step 3:** schema (T53, T54) with plain-English comments; the resolver; names through
  `displayNamesOf` (extend it to return `deletedAt` too, or add a sibling; do not add a third
  private copy).
- [x] **Step 4:** `pnpm codegen` (check the output), `oldBundleCompat.test.ts`, the full gate.

**Mutation checks:** drop the `householdId` filter → "another household's rows never
appear"; ask `member` instead of `manager` → the member test; drop `id` from `orderBy` → the
tie test; read `locationName` from `Location` → "after the location is deleted".

**Mutation checks run (2026-11-20).** All in `activity.resolver.test.ts` (24 tests). Each file
was copied aside first and restored from the copy (`diff -q` clean, 24 of 24 green again after
each).

| Mutation | Result |
|---|---|
| the `householdId` filter dropped from the page read | **red**, 9 tests, among them "another household's rows never appear" and "household manager in two households sees only the household they act in" |
| `requireHouseholdRole(…, 'member')` instead of `'manager'` | **red**: "household member cannot read the activity, even as the organizer of a location", and "household member who owns another household reads only that one, when acting in it" |
| the household is the caller's FIRST owner or manager membership, not `requireHousehold` | **red**, 3 tests: the two-households manager test and both member tests |
| `id` dropped from `orderBy` | **red**, 6 tests, among them "two rows with the same createdAt keep one order, with id breaking the tie" |
| the cursor uses `createdAt < cursor` only (the same-time branch dropped) | **red**: "paging one row at a time crosses two rows with the same createdAt without losing one" |
| the cursor row is read without `householdId` | **red**: "an id of another household's row is BAD_USER_INPUT" |
| no cap at 200 | **red**: "first defaults to 50, and a first above 200 is cut to 200" |
| `first` of 0 or less accepted | **red**: "first of 0 or less is BAD_USER_INPUT" |
| `locationName` read from the `Location` table (by `locationId`) | **red**: "user sees the location's name as it was when the change was logged, also after the location is deleted" |
| `deleted` always `false` in `accountNamesOf` | **red**: "user sees a deleted account's stored name, marked as deleted" |
| `email` added to `accountNamesOf`'s select | **red**: "reads names with id, displayName and deletedAt only, and answers no e-mail" |
| `actorIsMe` always `false` | **red**: "user sees who acted, and whether it was them" |
| `importCounts` always `null` | **red**, 2 tests |

**Review of J.3 (2026-11-20).** Two mutations stayed GREEN against the 24 tests above. One test
was added and one was extended (24 → 25 in the file). Each mutation was run on a copy-restored file
(`diff -q` clean after each).

| Mutation | Before the review | After |
|---|---|---|
| the cursor as ONE condition, `createdAt <= cursor AND id < cursor` (no `OR`) | **green**, 24 of 24: in the fixture the ids follow the time order, so the wrong cursor gives the same pages | **red**: "paging orders by time first, and uses the id only between rows of the same time" (the newest row has the smallest id) |
| `importCounts` read for every action, not only `IMPORT` | **green**: no non-`IMPORT` row carried `details.counts` | **red**: "details of the wrong shape give null fields, not an error" (a `LOCATIONS_DELETED` row with `counts`) |
| the cursor's first branch `lte` instead of `lt` (repeats the cursor row's time) | **red**, 3 tests | **red**, 3 tests |
| `targetIsMe` always `false` | **red**, 1 test | — |
| `actorDeleted` read from the target's account | **red**, 1 test | — |
| a missing `User` row gives `actorDeleted: false` | **red**, 1 test | — |
| `targetName` read from the actor's account | **red**, 2 tests | — |

**E2E:** none (J.8).

---

## Task J.4 — server: purges and the lock order

Needs owner decisions **O34** and **O38**.

**Files:** `apps/server/src/lib/household.ts` and `household.test.ts`,
`resolvers/import.resolver.ts`, `resolvers/location.resolver.ts`,
`resolvers/household.resolver.ts`, `schema/location.graphql`, `schema/household.graphql`,
`resolvers/clearAllData.resolver.test.ts`, a new `resolvers/purges.resolver.test.ts`,
`resolvers/location.resolver.test.ts`, `resolvers/live-publish.guard.test.ts`,
`scripts/verify-migration.ts` (the copy of `clearAllData`).

- [x] **Step 1: failing tests.**
  - **Lock order (T52)**, for `clearAllData`, `renameHousehold`, `deleteAllLocations`,
    `deleteLocation` and (O38-A) `deleteHousehold`: `lockHouseholdOrForbid` is the FIRST
    call of the transaction, before the role read; the role read goes through `tx` (the
    H5c `tx.depth` counter in `location-people.resolver.test.ts` is the model). A household
    deleted after `requireHousehold` found it → `FORBIDDEN`, not `P2025`.
  - **Race (Review Focus 2):** with `serialTransactions(true)`, start a role change that
    demotes the caller from owner (in J.4 use a direct store write inside a locked
    transaction; K.3 repeats it with the real accept), and only after it holds the lock,
    start `clearAllData` → `FORBIDDEN`, nothing deleted. Note in the test that the ORDER test
    is what proves the lock (the H5b G.5 trap).
  - **`deleteAllLocations`:** owner only (`manager` → `FORBIDDEN`); every location of THIS
    household goes, with its stock, logs, carts, cart rows and role rows; the catalog stays;
    the OTHER household's locations stay; one `LOCATIONS_DELETED` row with `count`; one
    household-level `LOCATION` event after the commit; with O34-A no new location; a
    household with no location → `false`, no row, no event.
  - **`removeAllLocationItems`:** organizer only (`participant`, a household owner with no
    role → `FORBIDDEN`); a location of another household → `FORBIDDEN`; deletes that
    location's `ItemStock` rows and the `CartItem` rows of its carts; KEEPS its `Cart` rows
    (with `lastPurchasedAt`), its logs, its role rows, the catalog, and every row of a
    SECOND location of the same household; one `LOCATION_ITEMS_REMOVED` row; `STOCK` and
    `CART` events at that location only; nothing to delete → `false`, no row, no event.
  - **`deleteHouseholdData`:** deletes every household-owned row of one household and none of
    another, with a tag that has a tag type (the `NoAction` case); `clearAllData` still
    re-creates "Home" with the caller as `organizer`.
  - **(O38-A) `deleteHousehold`:** owner only; deletes the household and all its data; every
    other member is then in no household (their next request: `NO_HOUSEHOLD`) or in their
    other household; retried once on `P2034`, the T16 exception (the household delete writes
    other people's `User.activeHouseholdId`).
- [x] **Step 2:** red.
- [x] **Step 3:** `deleteHouseholdData` in `lib/household.ts` (T64), moved out of
  `clearAllData`. Update the copy in `verify-migration.ts` (`assertHouseholdLock`) so it is
  still the code that runs.
- [x] **Step 4:** the lock order in the five writes; the two (three with O38-A) mutations
  with comments naming this plan; their `publishes` entries.
- [x] **Step 5:** `pnpm codegen`, `oldBundleCompat.test.ts`, the full gate.

**Mutation checks:**

| Mutation | Must go red |
|---|---|
| `clearAllData` checks the owner before the lock again | its order test and the race test |
| `deleteAllLocations` deletes by `location.deleteMany({})` with no household filter | "the other household's locations stay" |
| `removeAllLocationItems` deletes by `{ cart: { location: { householdId } } }` | "a second location of the same household keeps its cart rows" |
| `removeAllLocationItems` also deletes `Cart` rows | "keeps its `Cart` rows" |
| `removeAllLocationItems` also deletes logs | "keeps its logs" |
| `removeAllLocationItems` asks `participant` | the participant test |
| `deleteHouseholdData` deletes `tagType` before `tag` | nothing on the fake (it has no `NoAction`). Say so; J.8 and K.8 prove it on real SQL |
| `lockHousehold` instead of `lockHouseholdOrForbid` in `deleteLocation` | "deleted household → `FORBIDDEN`" |

**Done 2026-11-20** in three commits: `d82faa59` (the shared delete), `7d8927a9` (the lock
order), `a6e1dd17` (the three new mutations). Tests: `lib/deleteHouseholdData.test.ts` (new),
`resolvers/purges.resolver.test.ts` (new, 54 tests), and edits to
`clearAllData.resolver.test.ts`, `location.resolver.test.ts`, `purge-coverage.test.ts`,
`live-publish.guard.test.ts` and `test/userFake.test.ts`. Server suite **2500 / 81 → 2561 /
83**. Web suite **3454 / 347**, no web change. The live guard holds **76** fields: 74 in
`publishes`, 2 in `publishesNothing`.

**Mutation checks run.** Each file was copied aside first, broken, run, restored from the
copy and compared with `diff -q`. Every row went red on an assertion, not on a load error.

| # | Mutation | Red |
|---|---|---|
| 1 | `deleteHouseholdData` deletes `tagType` before `tag` | 3 tests in `deleteHouseholdData.test.ts`, with `P2003 … Tag_typeId_fkey`. The plan said nothing on the fake could see this; the new table fake models NoAction, so it can |
| 2 | `deleteHouseholdData`: `item.deleteMany({})` | "deletes every data row of one household and none of the other", and the `purge-coverage` filter check |
| 3 | `clearAllData` checks the owner before the lock again | 5: its order test, "nothing reads the household role through the global client", the race test, and the two refusal tests in `clearAllData.resolver.test.ts` (they now expect the lock first) |
| 4 | `lockHousehold` instead of `lockHouseholdOrForbid` in `deleteLocation` | 3: "deleted household → FORBIDDEN", the order test, and the lock test in `location.resolver.test.ts` |
| 5 | `renameHousehold` reads the role before the lock | 3: its order test, the global-read test, the race test |
| 6 | `deleteAllLocations` deletes by `location.deleteMany({})` | 3, among them "the other household keeps all of its rows" |
| 7 | `removeAllLocationItems` deletes cart rows by `{ cart: { location: { householdId } } }` | 4, among them "a second location of the same household keeps its stock rows and cart rows" |
| 8 | `removeAllLocationItems` also deletes `Cart` rows | "keeps the location, its carts with their last purchase date, …" |
| 9 | `removeAllLocationItems` also deletes logs | the same test |
| 10 | `removeAllLocationItems` asks `participant` | "location participant cannot remove all items" |
| 11 | `removeAllLocationItems` finds the location by `id` only (no `householdId`) | "location organizer of a location in another household cannot empty it from the household they act in" |
| 12 | `LOCATION_ITEMS_REMOVED` stored without `locationName` | 2 |
| 13 | `deleteHousehold` without `retryOnceOnConflict` | both `P2034` tests |
| 14 | `deleteHousehold` clears `User.activeHouseholdId` AFTER the lock | "writes the User rows that name the household BEFORE it takes the household lock" |
| 15 | `deleteAllLocations` reads the owner role before the lock | its order test and its global-read test |
| 16 | `deleteHousehold` without `deleteHouseholdData` (only the household delete and its cascade) | 2: "deletes the catalog through deleteHouseholdData" and the `purge-coverage` check. The "all its data" test stays GREEN for this one: the fake cascades locations from the household, as Postgres does. Only the `Tag.type` NoAction case needs the explicit list, and real SQL (J.8) proves that |

**Review of J.4 (2026-11-20).** One fix. `deleteHousehold` wrote other people's `User` rows
(step 1, before the lock) BEFORE it checked that the caller is the owner. A refusal rolled
the write back, but a manager or member still took those row locks, and could push another
person's `joinHousehold` (which holds its own `User` row and then wants this household's
lock) into `P2034`. Nothing ever committed. The fix adds an EARLY owner check with the
global client, before the transaction. The check after the lock, through `tx`, stays and is
still the one that counts: a role read early can be stale only in the safe direction. The
test "no household role read on the global client" in `purges.resolver.test.ts` now expects exactly one
early read for `deleteHousehold` and none for the other four writes.

| # | Mutation (review) | Red |
|---|---|---|
| R1 | `removeAllLocationItems`: `itemStock.deleteMany({ where: { location: { householdId } } })` | 4, among them "a second location of the same household keeps its stock rows and cart rows" (`expected [ 's_z' ] to include 's_p'`) |
| R2 | `deleteHouseholdData`: `tag.deleteMany({})` | 4: the scope test and the rows test in `deleteHouseholdData.test.ts`, the `clearAllData` scope test, and "deletes the catalog through deleteHouseholdData" |
| R3 | `deleteHouseholdData`: `inventoryLog.deleteMany({ where: {} })` | 12 or more across the four files (some on the purges fake, which throws on a `where` it does not model) |
| R4 | `deleteHousehold` without the early owner check | 3: "household manager / member is refused before any transaction, so no User row is ever written" (`$transaction` was called 1 time) and the global-read test |
| R5 | `deleteHousehold` with the early check but WITHOUT the check through `tx` | 2: its order test and "deleteHousehold by an owner who is demoted at the same moment is refused". So the early check does not make the real one redundant |

**E2E:** none (J.8).

---

## Task J.5 — web: documents, hooks and permissions

**Files:** `apps/web/src/apollo/operations/activity.graphql` (new),
`operations/locations.graphql`, `operations/household.graphql`, `operations/import.graphql`
(O33-A), `hooks/useHouseholdActivity.ts` and `hooks/usePurges.ts` (new, with tests),
`hooks/usePermissions.ts` and its test, `hooks/CLAUDE.md`, `apollo/liveUpdates.ts` (the
comment table), `apollo/cloudCache.ts` (a field policy), `lib/importData.ts` and its test
(O33-A), `hooks/refetchPending.cloud.test.tsx`.

- [x] **Step 1: failing tests** (`MockedProvider`):
  - `useHouseholdActivity()` returns entries, `isLoading`, `errorCode` (`FORBIDDEN` told
    apart from a network error), `loadMore()` (sends `before:` the last id and appends) and
    `hasMore` (false when a page has fewer than `first` rows);
  - `useDeleteAllLocations`, `useRemoveAllLocationItems(locationId)`, `useClearHousehold`
    (calls `ClearAllData`), and with O38-A `useDeleteHousehold`: the right variables; a
    refetch with `refetchAfterWrite`; a failed refetch does NOT reject; a second call while
    the first runs shares the first promise; `isPending` stays true until the refetch lands
    (`refetchPending.cloud.test.tsx`);
  - `usePermissions`: `canReadActivity` (owner, manager); `canPurgeHousehold` (owner);
    `canRemoveAllItems(locationId)` (organizer there); local mode: all `false`;
  - O33-A: after the last batch of an import, `recordImport` is called once with the counts;
    a failed `recordImport` does not fail the import (it is a log, not data).
- [x] **Step 2:** red.
- [x] **Step 3:** the documents and hooks. `householdActivity` gets `merge` and `keyArgs`
  so "Load more" appends and a refetch after a live event replaces the first page (pin it in
  `apollo/client.test.ts`, as H5c pinned `locationPeople`).
- [x] **Step 4:** the full gate.

**Mutation checks:** `awaitRefetchQueries: true` in one purge hook → "a failed refetch does
not reject"; `canReadActivity` true for a member → its test; `loadMore` without `before` →
the paging test; the field policy removed → the `client.test.ts` test.

**Done (2026-11-20).** Web suite **3454 / 347 → 3519 / 349** (+65 tests, 2 new files:
`hooks/useHouseholdActivity.test.tsx`, `hooks/usePurges.test.tsx`). Server suite unchanged
at **2563 / 83**; no server change. What was built:

| Part | Where | Note |
|---|---|---|
| 5 documents | `operations/activity.graphql` (new, `HouseholdActivity`), `locations.graphql` (`DeleteAllLocations`, `RemoveAllLocationItems`), `household.graphql` (`DeleteHousehold`), `import.graphql` (`RecordImport`) | `HouseholdActivity` selects every field of `HouseholdActivityEntry`, `importCounts` included |
| the page policy | `apollo/cloudCache.ts`, `mergeActivityPage` | `keyArgs: false`. "Load more" (`before`) adds its page after that row; a late page whose `before` row is gone is dropped. A first page (a refetch) keeps the rows below its last row, or replaces the list when it shares no row with it. Rows are matched by `id`, never by `createdAt` |
| `useHouseholdActivity()` | `hooks/useHouseholdActivity.ts` | `errorCode`, `hasMore`, `loadMore()` (never rejects, one at a time), `isLoadingMore`, `loadMoreFailed`, `refetch` |
| 4 purge hooks | `hooks/usePurges.ts` | `useClearHousehold`, `useDeleteAllLocations`, `useRemoveAllLocationItems(locationId)`, `useDeleteHousehold` |
| `refetchAfterWrite(client, 'active')` | `apollo/refetchAfterWrite.ts` | a new form: every active query, each read awaited on its own, never rejects. The three purge hooks use it |
| `createOncePerKey()` | `lib/oncePerKey.ts` (new) | the double-press guard, moved out of `useLocationPeople.ts`; that file and `usePurges.ts` both use it |
| `moveToCurrentHousehold(client)` | `hooks/useHouseholdMembers.ts` | moved out of `useLeaveHousehold`; `useDeleteHousehold` uses it too |
| 3 permissions | `hooks/usePermissions.ts` | `canReadActivity` (owner, manager), `canPurgeHousehold` (owner), `canRemoveAllItems(id)` (organizer there) |
| `recordImport` | `lib/importData.ts` | once per finished cloud import, before `resetStore`, with `countRowsSent` of the payloads the bulk passes walked. A failure is logged with `console.warn` and swallowed |
| live updates | `apollo/liveUpdates.ts` | `HouseholdActivity` in `CATALOG`, `STOCK` and `CART` |

**Decisions made here:**

- **The lost-access mark is in the hooks, not in J.7.** `useClearHousehold`,
  `useDeleteAllLocations` and `useDeleteHousehold` call `expectLocationLoss()` (every seen
  location) before the write and take the mark back when the write fails, as
  `useDeleteLocation` and the `clear` import do. `useRemoveAllLocationItems` marks nothing:
  the location stays. So J.7 needs no `expectLocationLoss` call of its own.
- **`useDeleteHousehold` moves the device itself.** After the write it runs
  `moveToCurrentHousehold`, the same steps as `leave()`: `switchToHousehold(id, { to: '/' })`
  for the other household, or `forgetHousehold()` and `location.replace('/')` for the
  no-household screen. Both clear the in-memory Apollo cache and `Player1InventoryCloudCache`.
  J.7 only shows the dialog and calls `deleteHousehold()`.
- **The purges read every ACTIVE query again** (`'active'`), not a named list. A purge
  changes the pantry, the carts, the switcher, the members' `hasLocationRole` and the log at
  once, the same as the household-level `LOCATION` event does for other tabs. Skipped
  (standby) queries are not read, so a `PantryData` parked on `'local'` sends nothing.
- **`recordImport` lives in `lib/importData.ts`**, not in `ImportCard`. So the sign-in copy
  (`usePostLoginMigration`, which also calls `importCloudData`) is logged too, and there is
  one call site. It runs after the last batch and the last follow-up write (`UpdateShelf`,
  `UpdateRecipe`, `DeleteLocation`), before `resetStore`. An import that fails in a batch is
  not logged. A failed `recordImport` does not fail the import: the rows are written, and a
  person told "the import failed" would run it again.
- **`hasMore`** is remembered by the id of the last row when a short page came. A refetch
  that replaces the list changes the last row, so "Load more" shows again.

**Mutation checks run (2026-11-20).** Each file was copied aside first, broken, run, restored
from the copy and compared with `diff -q`. Every row went red on an assertion, not on a load
error.

| # | Mutation | Red |
|---|---|---|
| 1 | `useDeleteAllLocations` with `refetchQueries` and `awaitRefetchQueries: true`, no `refetchAfterWrite` (the plan's check) | "a purge that worked resolves when the lists cannot be read again" (it rejected with the `INTERNAL_SERVER_ERROR` of the read) |
| 2 | `canReadActivity` true for any known role (the plan's check) | "household member: canReadActivity false, canPurgeHousehold false" |
| 3 | `loadMore` sends no `before` (the plan's check) | 3: "the next page is asked after the last row" (`expected { first: 50 } to deeply equal { before: 'act-0951', first: 50 }`), the end-of-log test, the failed Load more test |
| 4 | the `householdActivity` field policy removed (the plan's check) | 4 in `client.test.ts` and "user can load more" in the hook test. The "replace" and "drop" tests stay green: the default policy also replaces. They are negative controls |
| 5 | `mergeActivityPage` replaces the list on every first page | 3, among them "user sees a new row on top after a refetch, and keeps the pages already loaded" (`expected [ 'x', 'a' ] to deeply equal [ 'x', 'a', 'b', 'c', 'd' ]`) |
| 6 | `recordImport` rethrows its error | "user whose import worked is not told it failed when the log cannot be written" |
| 7 | `recordImport` not called on `replace` | "user's replace import is logged once …" (`expected [] to have a length of 1`) |
| 8 | `replace` counts `toCreate` only, not `toUpsert` | the same test: the stock rows go to the upsert pass, so `itemStocks` differs |
| 9 | `useClearHousehold` without `expectLocationLoss` | 2: "no lost-access toast …" and "a refused purge takes the mark back" |
| 10 | `useDeleteHousehold` without `moveToCurrentHousehold` | 4: the move, the no-household screen, the failed read, the double press |
| 11 | `useRemoveAllLocationItems` without the `once` guard | "a second press while the first runs sends nothing and shares its promise" |
| 12 | `refetchAfterWrite(…, 'active')` awaits the `Promise.all` instead of each read | "reads every mounted query again, and waits for a slow one when another fails" |
| 13 | `canRemoveAllItems` asks `participant` | 3: the three "canRemoveAllItems follows the location role only" rows |
| 14 | `useRemoveAllLocationItems` reads nothing after the write | 3: "every list on screen is read again" and both `refetchPending` rows of that hook |
| 15 | `useClearHousehold` reports `isPending: loading` (no `isRefetching`) | both `refetchPending` rows of that hook |
| 16 | `HouseholdActivity` taken out of `QUERIES_BY_KIND.STOCK` | "STOCK refetches the two stock queries and the activity log" |

**E2E:** none.

---

## Task J.6 — web: the Activity page and the sidebar item

Needs owner decisions **O35** and **O39**.

**Files:** `apps/web/src/routes/settings/household/activity.tsx` (new),
`activity.cloud.test.tsx`, `activity.test.tsx` (local redirect), `activity.stories.tsx`,
`activity.stories.test.tsx`; `components/household/ActivityList/` (`ActivityList.tsx`,
`index.ts`, stories, smoke test, unit test); `components/global/Sidebar/HouseholdSidebar.tsx`
and its tests and stories; `routes/settings/index.tsx` and its tests;
`lib/layoutRules.ts` if needed; the locale files; `routes/settings/CLAUDE.md`,
`components/CLAUDE.md`.

- [x] **Step 1: failing tests.**
  - `user sees who changed what in the household, newest first`: one row per action of
    T51, each a full sentence from the O39 texts, with names as stored (no `capitalize`);
  - an entry whose location is deleted still shows its stored name;
  - **Load more** appends; it is gone when `hasMore` is false;
  - a `FORBIDDEN` (a member, or a manager demoted in another tab) shows the no-access state
    with a link back, not an endless spinner; a network error shows Retry;
  - local mode redirects to `/settings/household`;
  - the sidebar and the mobile accordion show **Activity** to an owner or manager in cloud
    only, as item 8 (after Tags), and not to a member;
  - empty log: "Nothing has happened here yet."
- [x] **Step 2:** red.
- [x] **Step 3:** the page, the component, the sidebar item, the texts.
- [x] **Step 4:** stories (owner with every action, empty, loading, no access, error) and
  smoke tests that assert a real sentence, not `container.firstChild`.
- [x] **Step 5:** the full gate.

**Mutation checks:** the page passes every entry to a generic text (no per-action sentence)
→ the per-action test; the sidebar item shown in local mode → its local test; the item shown
to a member → its member test.

**E2E:** none (J.8; `a11y.spec.ts` has no `cloud` project, so the page's axe scans go into
J.8's cloud spec, as H5c did).

**Done (2026-11-20).** Web suite **3519 / 349 → 3562 / 356** (+43 tests, 7 new files).
Server suite unchanged at **2563 / 83**; no server change. What was built:

| Part | Where | Note |
|---|---|---|
| the page | `routes/settings/household/activity.tsx` | cloud only; local mode goes to `/settings/household`. No access (`errorCode === 'FORBIDDEN'`, old rows hidden), spinner, error with Retry, empty, list, **Load more** (only while `hasMore`, off while `isLoadingMore`), a failed page's message. Focus goes to the first new row after Load more |
| the list | `components/household/ActivityList/` | `ActivityList` and `activitySentence(entry, t)`: one i18next key per action, fallbacks for `null` fields and an unknown action |
| the sidebar item | `components/global/Sidebar/HouseholdSidebar.tsx` | eighth, after Tags; `cloudOnly` and `readsActivity` (`usePermissions().canReadActivity`) |
| the mobile card | `routes/settings/index.tsx` | eighth, after Tags, the same rule |
| `formatDateTime` | `lib/formatDate.ts` | the date and the time; `''` for an invalid date (Intl throws for it) |
| texts | `i18n/locales/en.json`, `tw.json` | `settings.household.activity.*`, 38 keys each. The O39 texts (`locationsDeleted` as `_other`) plus 13 new ones (listed in the J.6 report) |
| the hook fix | `hooks/useHouseholdActivity.ts` | see below |

**Decisions made here:**

- **The H6b actions get their O39 texts now**, not "Unknown". The enum already holds all 19
  values (J.1, J.3), so the texts cost nothing and K.* needs no web change for them.
- **`LOCATIONS_DELETED` has `_one` and `_other`.** "deleted all 1 locations" reads badly, so
  `_one` says "deleted the only location". A `null` count uses a sentence with no number.
- **"You" for the caller.** `actorIsMe` gives "You", `targetIsMe` gives "you" (`tw` 你). O39
  has no text for it.
- **The hook fix, from the J.5 review.** A short first page now marks the end too, and the
  end is kept per Apollo client (`oldestIdByClient`, a module `WeakMap`), so a remount with
  the whole list in the cache keeps it. Safe because log rows are never deleted and ids are
  `cuid()`. The comment "A first page shorter than a full page is the whole log" is now true.
- **`refetchWritePolicy: 'merge'` on the query.** Found while writing the test for the fix:
  Apollo's default for a refetch is `overwrite`, which gives the field policy no old list.
  So until now every live event or write dropped the pages "Load more" had added, and J.5's
  "the pages already loaded stay" was not true. J.5's `client.test.ts` tests write through
  the cache directly, not through `refetch`, so they could not see it.

**Mutation checks run (2026-11-20).** Each file was copied aside first, broken, run,
restored from the copy and compared with `diff -q`. Every row went red on an assertion.

| # | Mutation | Red |
|---|---|---|
| 1 | `refetchWritePolicy: 'merge'` removed | "a short first page still means the end after a refetch adds new rows on top" (`expected … to have a length of 55 but got 50`) |
| 2 | the effect that marks a short list's last row as the end does nothing | the same test (`expected true to be false`, on `hasMore`) |
| 3 | the end not kept per client (state only) | "the end of the log is remembered when the page is opened again" |
| 4 | every entry gets the generic `unknownAction` text (the plan's check) | 7 in `ActivityList.test.tsx` (the per-action test, the tw word order, the fallbacks) and the `EveryAction` smoke test |
| 5 | the sidebar item shown in local mode (the plan's check) | "user in local mode does not see Activity" (sidebar) |
| 6 | the sidebar item shown to a member (the plan's check) | "household member does not see Activity" (sidebar) |
| 7 | the accordion card shown in local mode | "user in local mode does not see Activity" (accordion) |
| 8 | the accordion card shown to a member | "household member does not see Activity" (accordion) |
| 9 | no access read from `isError && errorCode` | "household manager demoted in another tab sees the no-access text, not the old rows" |
| 10 | Load more never disabled | "Load more is off while the next page loads" |
| 11 | no focus move after Load more | "focus moves to the first new row after Load more" |
| 12 | no "(deleted account)" | 4: the per-action test, the deleted-account test, the tw test, the `DeletedAccount` smoke test |
| 13 | Load more shown when `hasMore` is false | "user can load more, and Load more is gone at the end of the log" and the empty-log test |

**Review of J.6 (2026-11-20).** One bug found and fixed. A person who had been a manager on
this device, and is now a household `member`, saw the old log rows when they opened the
page by URL. The rows came from the Apollo cache (it is stored in IndexedDB), and
`cache-and-network` shows cached data at once. They stayed on screen until the server
answered `FORBIDDEN`, and for good when the device was offline (a network error gives no
`errorCode`). The page now also shows the no-access text when `usePermissions()` knows the
household role and it is below manager (`roleKnown && !canReadActivity`). A role still
loading does not hide the rows. Review mutation checks:

| # | Mutation | Result |
|---|---|---|
| R1 | the role check removed from the page (the bug) | **red**: "household member never sees rows still in the cache, before or without an answer from the server" |
| R2 | `roleKnown &&` dropped from the role check | **red**: "user sees the rows while the household role is still loading" |
| R3 | `mergeActivityPage` always replaces on a first-page read | **red**: 2 hook tests ("a short first page still means the end …", "the end of the log is remembered …") |
| R4 | `roleName` reads the location ladder for a household role too | **red**: 2 in `ActivityList.test.tsx` (the per-action test, the "You" test) |

---

## Task J.7 — web: the danger zones

Needs owner decisions **O34**, **O38** and **O39**.

**Files:** `apps/web/src/components/settings/HouseholdDangerZone/` (new: component,
`index.ts`, stories, smoke, unit test), `routes/settings/household/index.tsx` and
`index.cloud.test.tsx`, `index.stories.tsx`; `components/location/LocationDangerZone/` (new,
same set), `routes/settings/household/locations/$id.tsx` and `$id.cloud.test.tsx`,
`$id.stories.tsx`; the locale files; `routes/settings/CLAUDE.md`,
`routes/settings/household/locations/CLAUDE.md`, `lib/seenLocations.ts` (see below).

- [x] **Step 1: failing tests.**
  - The household page shows the danger zone to the OWNER only, in cloud only. Each button
    opens a confirm with a text field; the confirm button stays disabled until the field
    equals the household name exactly (case and spaces as stored); Enter does nothing while
    it is disabled.
  - **Clear household** calls `ClearAllData`; **Delete all locations** calls
    `DeleteAllLocations`; with O38-A **Delete household** calls `DeleteHousehold` and then
    the app shows the no-household screen or the person's other household (the H5b gate and
    guard).
  - A failed write shows the error text and keeps the dialog open; a second press sends
    one mutation.
  - The location page shows **Remove all items** to an organizer of that location only; the
    confirm asks for the location name; after it, the pantry of that location is empty and
    its logs are still on the item log tab.
  - **No lost-access toast** for the person's own **Delete all locations** or **Delete
    household**: mark the locations with `expectLocationLoss` (`lib/seenLocations.ts`, H5c
    H.7) before the write, and take the mark back when it fails, exactly as the `clear`
    import does.
- [x] **Step 2:** red.
- [x] **Step 3:** the components and texts. Reuse the existing confirm dialog pattern
  (`DeleteButton` or the dialog the H5c page uses); do not build a third confirm.
- [x] **Step 4:** stories and smoke tests; the full gate.

**Mutation checks:** the confirm enabled on a case-insensitive match → the exact-match test;
the zone shown to a manager → the owner-only test; `expectLocationLoss` not called → the "no
toast" test; **Remove all items** shown to a participant → its test.

**Done 2026-11-20.** Each mutation was made in the source, the named tests went red on an
assertion (not a `ReferenceError` or a syntax error), the file was restored from a copy, `diff
-q` was clean, and the tests were green again.

| # | Mutation (file) | Red |
|---|---|---|
| 1 | `typed.toLowerCase() === confirmName?.toLowerCase()` (`DeleteButton.tsx`) | 6: the exact-match test and Enter test of `DeleteButton.test.tsx`, the three "after typing the household name exactly" tests of `HouseholdDangerZone.test.tsx`, the location one in `LocationDangerZone.test.tsx` |
| 2 | `typed.trim() === confirmName` (`DeleteButton.tsx`) | 1: "user cannot confirm until the name is typed exactly as stored" (the trailing-space step) |
| 3 | `e.preventDefault()` removed from the typed-name confirm (`DeleteButton.tsx`) | 6: the two "dialog stays open" tests in `DeleteButton.test.tsx`, the failure tests of both zones, `ClearFails` and `RemoveFails` smoke tests |
| 4 | the zone reads `canManageMembers` instead of `canPurgeHousehold` (`HouseholdDangerZone.tsx`) | 2: "household manager does not see the danger zone" in the component test and in `index.cloud.test.tsx` |
| 5 | Remove all items reads `canEditLocation` instead of `canRemoveAllItems` (`LocationDangerZone.tsx`) | 4: "location participant does not see Remove all items" (component and page), the local-mode test, and the existing "location participant sees the people and Leave, and no other control" |
| 6 | `expectingLoss` marks nothing (`const takeBack = () => {}`, `hooks/usePurges.ts`) | 6 in `usePurges.test.tsx`: the "no lost-access toast" and "takes the mark back" tests of the three purges that delete locations. J.7 adds no call of its own (the hooks mark), so this J.5 test is the guard |
| 7 | `<HouseholdDangerZone />` removed from `routes/settings/household/index.tsx` | 4: the owner tests in `index.cloud.test.tsx` and `CloudOwner` in `index.stories.test.tsx` |

The gate after J.7 (Node 22.17.1): web **3604 tests in 360 files**, server **2563 in 83**,
`scripts/spec` 70. J.7 added 40 web tests and 4 files (the baseline 3564 / 356 is that
difference, not a separate run). The known flaky `routes/shopping/index.stories.test.tsx`
(Offline) failed once at load average 16 and passed alone and in the next full run. Commits
`3c893dea` (`DeleteButton`'s typed-name mode) and `542afb2b` (the danger zones).

**Review of J.7 (2026-11-20).** Two fixes, each with a test that went red without it.

| Finding | Fix | Mutation | Red |
|---|---|---|---|
| The confirm label showed the name with HTML's normal white space, so `the  Lin home ` (two spaces inside, one at the end) showed as `the Lin home`. The match is exact, so the person could never type the name. The server trims only the ends of a household name; an imported location name is not trimmed at all | `whitespace-pre-wrap` on the label (`DeleteButton.tsx`) | the class removed | 1: "user sees the spaces of the name as stored, so a name with double spaces can be typed" (`DeleteButton.test.tsx`) |
| "while one purge runs, no other purge can be started" set only `clear` as pending, so `running = clearing` alone passed it | the test now runs once for each of the three hooks | `const running = clearing` (`HouseholdDangerZone.tsx`) | 2: the `deleteAll` and `deleteHousehold` cases. Before the change: 0 |

Two more checks by the reviewer, both red as expected: `e.preventDefault()` also on the PLAIN
path of `DeleteButton` → 1, "user sees a message when the delete fails" (so the old path is
still pinned); all three purge buttons always on → 1, the `clear` case of the test above.

**E2E:** none (J.8).

---

## Task J.8 — E2E: purges with two households, the danger zones and the Activity page

**Files:** `e2e/tests/purge-two-households.spec.ts`, `e2e/tests/household-activity-purges.spec.ts`
(new), `e2e/pages/HouseholdPage.ts` and `e2e/pages/ActivityPage.ts` (new or extended; each
method cites the aria-label and the source line; the constructor ends with `withSteps(this)`),
`e2e/tests/cleanup-endpoint.spec.ts`, `e2e/playwright.config.ts` (`cloud` `testMatch`, `local`
`testIgnore`), `e2e/CLAUDE.md`.

Read `e2e/CLAUDE.md` first: ports, the 409 order, `forgetDeletedHousehold` after a mid-test
cleanup, `cleanupCloudData` for every user AND for `E2E_USER_ID`.

- [x] **`purge-two-households.spec.ts` gains two tests** (real SQL, no browser, through
  `makeGql`). Household A has "Home" and "Garage", each with stock, a cart row and a log, and
  a tag WITH a tag type. Household B has the same shape.
  - `deleteAllLocations` as A's owner: A has no location; A's catalog is still there; B's
    locations, stock, carts and logs are all still there.
  - `removeAllLocationItems(Home)` as A's organizer: Home has no stock and no cart rows, but
    its `Cart` rows and logs are still there; Garage is untouched; B is untouched.
  - **Mutation check on real SQL:** drop the household (or location) scope from each purge's
    stock delete, run, see it red with "B's rows are gone" (or "Garage's"), restore.
- [x] **`household-activity-purges.spec.ts`** (two browsers, `newUserContext`):
  1. `household owner sees role changes in the activity log`: the owner gives B a role on
     the people page; the Activity page shows "{owner} gave {B} the 搬運工 role on Home" (or
     the English text) without a reload in a SECOND tab of the owner.
  2. `household member cannot open the activity page`: B (a member) does not see the item,
     and the URL shows the no-access state.
  3. `household owner can clear the household after typing its name`: the button is
     disabled until the name is typed; after it, the catalog is empty and "Home" exists.
  4. `location organizer can remove all items from a location`: the pantry is empty, the
     item log tab still shows the log.
  5. With O38-A, `household owner can delete the household`: B's browser shows the
     no-household screen on B's next request (it gets no live event: the household has no
     members left, see *Known gaps*).
  6. Axe scans of the Activity page and of both danger-zone dialogs, light and dark.
- [x] `cleanup-endpoint.spec.ts`: seed one activity row (through a logged mutation) and
  expect a count of at least 1 for the new key.
- [x] Run only these three spec files in `cloud`. Copy `test-results/` aside before any re-run.

**Mutation checks (E2E):** the purge scopes above; `recordActivity` removed from
`setLocationRole` → test 1; the confirm enabled always → test 3 (assert the button is
disabled BEFORE typing).


**Done 2026-11-20** (Node 22.17.1, `--project=cloud`, the three spec files only). The
first run was green: **11 passed in 3.8 min** (load average 2.8). After the mutations, the
same run again: **11 passed in 3.9 min** (load average 2.8 at the end). After the seed
gained the tag with a tag type (for mutation 8), once more: **11 passed in 4.1 min**. The new file has 7
tests, not 6: the axe scans are two tests, light and dark. `cloud` now lists **195 tests in
37 files**; `local` still collects 189 in 23 (the new file is in its `testIgnore`).

| File | Change |
|---|---|
| `e2e/tests/purge-two-households.spec.ts` | 2 tests in a new `describe`. Each household has Home and Garage, each with a stock row, a cart row and a log, and an item with a tag that has a tag type. One snapshot query (`allItemStocks`, `allCarts`, `allCartItems`, `inventoryLogs`, the catalog) read before and after |
| `e2e/tests/household-activity-purges.spec.ts` | new, 7 tests, two browsers (OWNER and BEA, a member who joins with no location role) |
| `e2e/pages/HouseholdPage.ts`, `e2e/pages/ActivityPage.ts` | new |
| `e2e/pages/LocationPeoplePage.ts` | gained the location danger zone (Remove all items and its typed-name confirm) |
| `e2e/tests/cleanup-endpoint.spec.ts` | reads the `INVITE_CREATED` row back before the cleanup, and names `householdActivities >= 1` on its own line |
| `e2e/playwright.config.ts` | the new file in `cloud`'s `testMatch` and `local`'s `testIgnore` |

**Mutation checks on real SQL.** Each was made in the source, run as `<file>:<line>`,
restored from a copy, and checked with `diff -q`. `test-results/` was copied aside before
every re-run. **No mutation could match rows outside this spec's two households**: on the
shared test database, a delete with its scope simply dropped would delete every household's
locations or stock. So each "dropped scope" was replaced by a WIDER scope that still names
only this spec's users.

| # | Mutation (`apps/server/src/resolvers/location.resolver.ts` unless named) | Red |
|---|---|---|
| 1 | `deleteAllLocations`: `where: { OR: [{ householdId }, { household: { members: { some: { userId: { startsWith: 'e2e-test-user-2-purge-' } } } } }] }` (A's AND B's locations) | purge test 1, "B's rows are still there": B's `locations` received `[]` |
| 2 | `removeAllLocationItems`: the stock delete scoped to the household, `{ location: { householdId } }` | purge test 2, "Garage is untouched": Garage's `stock` received `[]` |
| 3 | `removeAllLocationItems`: the cart-row delete also matches B's household (`OR` with `{ cart: { location: { household: { members: { some: { userId: 'e2e-test-user-2-purge-b' } } } } } }`) | purge test 2, "B's rows are still there": B's `allCartItems` received `[]` |
| 4 | `setLocationRole` writes no activity row (`recordActivity` never called) | activity test 1: the row "You gave Bea Member the Participant role on Home" not found |
| 5 | `setLocationRole` publishes nothing | activity test 1, the same line: the row did not arrive without a reload |
| 6 | `nameMatches` always `true` (`apps/web/src/components/shared/DeleteButton/DeleteButton.tsx`) | activity test 3, the first `toBeDisabled()` (before typing): `unexpected value "enabled"` |
| 7 | `removeAllLocationItems` also deletes the location's logs | activity test 4: the log tab's entry not found |
| 8 | `deleteHouseholdData` deletes tag types BEFORE tags (`apps/server/src/lib/household.ts`) | activity tests 3 and 5: the confirm stays open with "Could not delete. Please try again." (`Tag.type` is NoAction). This is the real-SQL proof the J.4 table asked for; the seed carries a tag with a tag type for it |

Not mutated: activity test 2 (member, no access) and test 5 (delete household, the
no-household screen). Both were covered by mutation in the web unit tests of J.6 and J.5;
here they are only run.

---

## Task J.9 — H6a docs, deploy notes and the final gate

**Files:** root `CLAUDE.md` (an H6a paragraph after the H5c one: the table, `recordActivity`,
the query, the purges, the lock order, the live guard count, the cleanup count),
`apps/server/prisma/CLAUDE.md` (the migration count in `migrationDeploys.ts`, the
`clearAllData` copy), `e2e/CLAUDE.md`, `apps/web/src/routes/CLAUDE.md`, `hooks/CLAUDE.md`,
`components/CLAUDE.md`, `routes/settings/CLAUDE.md`, `routes/settings/household/locations/CLAUDE.md`,
the design (*Purge*, *Activity log*, *Sequencing* row H6), the phase plan's H6 outline,
`docs/INDEX.md`, the H4 runbook (a new **section 11, H6a**: one additive migration, server
first, checks after deploy), and this plan's *What this plan got wrong* and *Status*.

- [ ] Step 1: the docs above. Re-measure every count you write; do not copy one from here.
- [ ] Step 2: **the main session**, not a subagent, runs `verify:migration` on the test
  database with the owner's consent (`apps/server/prisma/CLAUDE.md`), and records the result.
- [ ] Step 3: the full gate from the repo root, every command alone:

  ```bash
  pnpm lint
  pnpm build 2>&1 | tee /tmp/p1i-build.log
  (cd apps/web && pnpm build-storybook)
  pnpm check
  grep 'TS6385' /tmp/p1i-build.log && echo "FAIL: deprecated imports found" || echo "OK: no deprecated imports"
  pnpm test
  pnpm test:e2e:all
  ```

  Never the bare `pnpm test:e2e`, never `--grep`. Copy `test-results/` aside before
  re-running anything.
- [ ] Step 4: `git status` clean; `git show --stat` for each commit.

---

# Part 2 — H6b: transfer, hand-over, deleted accounts

## Task K.1 — the `OwnershipOffer` table, fakes and cleanup

**Files:** `apps/server/prisma/schema.prisma`, a new migration folder
`<timestamp>_add_ownership_offers/`, `scripts/migrationDeploys.ts`, `scripts/verify-migration.ts`,
`src/test/householdFake.ts`, `householdWorld.ts` and tests, `src/lib/e2eCleanup.ts` and test,
`resolvers/purge-coverage.test.ts`, `e2e/helpers/cloudTeardown.ts`,
`e2e/tests/cleanup-endpoint.spec.ts`, `src/lib/invite.ts` (the T49 comment names the second
model).

- [ ] **Step 0:** measure the baseline again (H6a has changed it).
- [ ] **Step 1: failing tests.** The fake's `ownershipOffer` store: the unique
  `(householdId, toUserId)` raises `P2002`; `where` keys `id`, `householdId`, `toUserId`,
  `kind`, `dismissedAt: null` are applied and any other key throws. Cleanup: 21 keys; offers
  TO the user and offers of owned households are deleted before `householdMember`.
- [ ] **Step 2:** red.
- [ ] **Step 3:** schema (T58) and the additive migration. SQL comment: why `toUserId`
  cascades and `fromUserId` has no foreign key.
- [ ] **Step 4:** the `last` group; `verify-migration.ts` assertions: the table, the unique
  index, the two foreign keys and their `ON DELETE` rules, no foreign key on `fromUserId`.
- [ ] **Step 5:** fakes, cleanup, teardown keys. Full gate. No database command.

**Mutation checks:** the unique index left out of the fake → the `P2002` test;
`ownershipOffer.deleteMany` removed from the cleanup → the key count.

---

## Task K.2 — a deleted account does not count

**Files:** `apps/server/src/lib/authz.ts` and `authz.test.ts`,
`resolvers/location.resolver.ts` (`peopleOfLocation`), `resolvers/household.resolver.ts`
(`householdMembers`, `peopleWithLocationRole`), their tests, the fakes if `deletedAt` on the
`user` relation filter is not modelled.

- [ ] **Step 1: failing tests** (T61). A household with an organizer whose `User.deletedAt` is
  set and whose member rows still exist (the pre-H6 shape, Y8):
  - `Location.hasOrganizer` is `false` for that location (`locationIdsWithOrganizer`); a
    second location with a live organizer stays `true`;
  - `locationPeople` and `householdMembers` do not list the deleted person;
  - a live organizer next to the deleted one keeps `hasOrganizer: true`.
- [ ] **Step 2:** red. **Step 3:** add `deletedAt: null` to the `user` filter in
  `countedOrganizerIn`, and the same filter to the two lists. **Step 4:** the full gate.

**Mutation checks:** remove `deletedAt: null` from `countedOrganizerIn` → the `hasOrganizer`
test; from `peopleOfLocation` → its list test. (The owner's 2026-11-17 decision names the
first one; both must go red.)

---

## Task K.3 — transfer: the offer mutations

**Files:** `apps/server/src/schema/ownership.graphql` (new), `schema/index.ts`,
`resolvers/ownership.resolver.ts` and `ownership.resolver.test.ts` (new), `resolvers/index.ts`,
`resolvers/household.resolver.ts` (texts; `Household.hasOwner`, `.pendingTransfer`),
`lib/household.ts` (`removeFromHousehold` moved here and extended; `startHandover`),
`resolvers/live-publish.guard.test.ts`, `resolvers/purges.resolver.test.ts` (the race, with
the real accept).

- [ ] **Step 1: failing tests** (two households; owner, manager, member; a person in both
  households):
  - `household owner can offer the household to a member` → one `transfer` offer, one
    `OWNERSHIP_OFFERED` row, one `LOCATION` event; a second offer to someone else REPLACES
    the first (T59); an offer to the owner themselves or to a non-member → `BAD_USER_INPUT` /
    `FORBIDDEN`; a manager → `FORBIDDEN`.
  - `cancelOwnershipOffer` → the offer goes, `OWNERSHIP_OFFER_CANCELLED`; none open → `false`,
    no row, no event.
  - `user can accept the household` → the old owner is `manager`, the caller is `owner`,
    `Household.ownerId` is the caller, every offer of the household is gone, location roles
    are unchanged, `OWNERSHIP_ACCEPTED`. The order demote-then-promote is pinned by a fake
    that enforces "at most one owner row" (the partial unique index).
  - Accept of a `handover` offer (rows made by hand in the test; K.4 makes them for real):
    the first accept wins; the second gets `BAD_USER_INPUT` with `extensions.reason`
    `OFFER_GONE` and nothing changes; `ownerGoneAt` goes back to `null`.
  - Only the offer's `toUserId` may accept, decline or dismiss; anyone else gets the SAME
    `FORBIDDEN` as an unknown id.
  - Accept of an offer in the caller's OTHER household (`world.setActiveHousehold` on the
    first one) works and changes that household, not the active one.
  - `declineOwnershipOffer` → the offer goes, `OWNERSHIP_DECLINED`. A declined or dismissed
    `handover` offer: dismiss keeps it (`dismissedAt` set); decline deletes it, and if it was
    the last one, `startHandover` makes new ones (T62).
  - **The leave rule changes:** the owner still cannot leave, now with "Transfer ownership
    first." `setHouseholdRole(role: owner)` stays `BAD_USER_INPUT`, now with "Use Transfer
    ownership." `removeFromHousehold` also deletes offers TO the person; removing the last
    `handover` recipient calls `startHandover` (T62).
  - **The race (Review Focus 2):** `acceptOwnershipOffer` holds the lock; then
    `clearAllData` by the OLD owner → `FORBIDDEN`, nothing deleted. And the other order:
    the clear commits first, then the accept works on the cleared household.
  - Every write takes `lockHouseholdOrForbid` first and reads through `tx` (the `tx.depth`
    counter).
  - `Household.hasOwner` and `.pendingTransfer` (owner only; a manager gets `null`).
  - `myOwnershipOffers`: offers to the caller in every household; another person's offers
    never.
- [ ] **Step 2:** red.
- [ ] **Step 3:** schema (T58, T59, T65) with comments; the resolvers; the texts in
  `household.resolver.ts`.
- [ ] **Step 4:** the five mutations in the live guard: `offerOwnership`,
  `cancelOwnershipOffer`, `acceptOwnershipOffer`, `declineOwnershipOffer` → `publishes`
  `['LOCATION']`; `dismissOwnershipOffer` → `publishesNothing` ("only the caller's own
  banner changes; their other tabs update on the next refetch").
- [ ] **Step 5:** `pnpm codegen` (check the output), `oldBundleCompat.test.ts`, the full gate.

**Mutation checks:**

| Mutation | Must go red |
|---|---|
| promote before demote in accept | the one-owner fake test |
| accept skips the "offer still exists" read | "the second accept gets `OFFER_GONE`" |
| accept leaves the other offers | "every offer is gone" |
| any member may accept | "only `toUserId` may accept" |
| `removeFromHousehold` keeps offers to the person | its test |
| `startHandover` not called when the last offer goes | the T62 test |
| the lock after the role read in `offerOwnership` | its order test |

---

## Task K.4 — the hand-over in `handleClerkEvent`

**Files:** `apps/server/src/lib/clerkWebhook.ts` and `clerkWebhook.test.ts`,
`lib/household.ts` (`startHandover`, `deleteHouseholdData`), `lib/e2eUsers.ts` (comment only),
`src/test/householdWorld.ts` if a `User` store with `deletedAt` is missing.

- [ ] **Step 1: failing tests**, one per row of the design's table (T60), each with a SECOND
  household that must not change:
  - the owner was the only person → the household and all its data are gone (a tag with a
    tag type, an item, stock, a log, a cart row); the other household is untouched;
  - the owner was the only LIVE person (the other member's account is already deleted, Y12)
    → the same;
  - with managers → `ownerId: null`, `ownerGoneAt` set, one `handover` offer per manager,
    none to members, `HANDOVER_STARTED` with the list; the owner's role rows and member row
    are gone;
  - no managers, some members organize a location (a counted organizer) → offers to those
    members only;
  - no managers, nobody organizes → offers to every remaining member;
  - a pending `transfer` offer is dropped (T63);
  - a deleted MANAGER or MEMBER → their member row, location roles and open invites go,
    offers TO them go (and T62 runs when it was the last one), `ACCOUNT_DELETED`; the
    owner's household is otherwise unchanged;
  - a person who owns household A and is a manager in household B → both handled, in one
    transaction, households locked in sorted order AFTER the `User` row;
  - **idempotent:** the same event twice → the second run changes nothing and writes no row;
  - an id with no `User` row → the row is created deleted (H2, P13) and nothing else;
  - `P2034` on the first try → one retry, one set of rows;
  - events: one household-level `LOCATION` per household that still exists, after the
    commit, with no `sourceClientId`;
  - the webhook HTTP handler still answers 200 / 400 / 500 as before (the existing tests).
- [ ] **Step 2:** red.
- [ ] **Step 3:** the branch, through `startHandover` and `deleteHouseholdData`. Update the
  comment of `handleClerkEvent` (it says "H6 adds the household hand-over here").
- [ ] **Step 4:** the full gate.

**Mutation checks:**

| Mutation | Must go red |
|---|---|
| count members without `deletedAt: null` for "only person" | the "only LIVE person" test |
| offer to members when managers exist | the managers row |
| "organizes" read without H18 (a removed person's organizer row counts) | the organizer row, with a leftover row in the fixture |
| households locked before the `User` row | the lock-order test |
| the household delete through `household.delete` alone, no `deleteHouseholdData` | nothing on the fake. Say so; K.8 proves it on real SQL |
| `ownerGoneAt` not set | the managers row |
| no idempotence guard (offers created again) | the "same event twice" test |

---

## Task K.5 — web: documents, hooks and permissions for offers

**Files:** `apps/web/src/apollo/operations/ownership.graphql` (new),
`operations/household.graphql` (`hasOwner`, `pendingTransfer` in `GetHousehold`),
`hooks/useOwnershipOffers.ts` and test (new), `hooks/usePermissions.ts` and test,
`hooks/CLAUDE.md`, `apollo/liveUpdates.ts` (comment table), `hooks/refetchPending.cloud.test.tsx`.

- [ ] **Step 1: failing tests:** `useMyOwnershipOffers()`; the five write hooks (variables,
  `refetchAfterWrite` of `MyOwnershipOffers`, `GetHousehold`, `HouseholdMembers`; a failed
  refetch does not reject; a shared promise per arguments; `isPending` until the refetch
  lands); `usePermissions().canTransferOwnership` (owner, cloud); `hasOwner` exposed.
- [ ] **Step 2:** red.
- [ ] **Step 3:** the documents and hooks. `GetHousehold` gains two fields, so **grep every
  `GetHousehold` mock** in the web tests and stories and add them (an Apollo result missing
  a selected field reads back as incomplete: the H5a F.1 trap; `tsc` does not see an untyped
  mock, root `CLAUDE.md`).
- [ ] **Step 4:** the full gate.

**Mutation checks:** `awaitRefetchQueries: true` → "a failed refetch does not reject"; no
shared promise → the double-press test; `canTransferOwnership` true for a manager → its test.

---

## Task K.6 — web: the offer banner

Needs owner decision **O39** (texts).

**Files:** `apps/web/src/components/household/OwnershipOfferBanner/` (component, `index.ts`,
stories, smoke, unit test), `routes/__root.tsx`, the locale files, `components/CLAUDE.md`.

- [ ] **Step 1: failing tests:** a `handover` offer shows "The owner of {household} is gone.
  Do you want to become the owner?" with **Accept** and **Not now**; a `transfer` offer
  shows "{name} wants to make you the owner of {household}." with **Accept** and
  **Decline**; a dismissed offer does not show; two offers show two banners; Accept then
  shows a short success message; a failed write shows the error and keeps the banner; cloud
  only; nothing in local mode; the banner is a `role="region"` with a label, so axe finds it.
- [ ] **Step 2:** red. **Step 3:** the component beside `OfflineBanner` in `__root.tsx`.
- [ ] **Step 4:** stories (handover, transfer, two offers, error) and smoke tests; the full
  gate.

**Mutation checks:** dismissed offers shown → its test; **Decline** on a `handover` offer →
the handover test (it must say **Not now**).

---

## Task K.7 — web: the Members page

Needs owner decisions **O37** and **O39**.

**Files:** `components/household/MemberList/MemberList.tsx` and tests and stories,
`routes/settings/household/members.tsx`, `members.cloud.test.tsx`, `members.stories.tsx`, the
locale files, `routes/settings/CLAUDE.md`.

- [ ] **Step 1: failing tests:**
  - an owner sees **Transfer ownership** on every other row; it asks first; after it, the row
    shows "Waiting for {name} to accept" and **Cancel**;
  - a person with an offer in this household sees **Become the owner** (also after "Not
    now") and can accept here;
  - with no owner, everyone sees "This household has no owner." and the people with an offer
    see the button;
  - the owner's own row says why they cannot leave ("Transfer ownership first");
  - with O37-A, the LAST person of a household with no owner sees a Leave confirm that says
    the household and its data will be deleted.
- [ ] **Step 2:** red. **Step 3:** the controls; `memberActions` gains the transfer column;
  its comment table is updated. **Step 4:** stories and the full gate.

**Mutation checks:** Transfer shown to a manager → its test; the waiting row without Cancel
→ its test; the no-owner note shown when there is an owner → its test.

---

## Task K.8 — E2E: transfer and hand-over on real SQL

**Files:** `e2e/tests/household-ownership.spec.ts` (new), `e2e/pages/MembersPage.ts`,
`e2e/playwright.config.ts`, `e2e/CLAUDE.md`.

Setup: OWNER owns household H with "Home" and "Garage". M joins as `manager`, B as `member`
with 據點王 on Garage (through `createInvite` + `joinHousehold`). A second household H2 of
another user, with the same shape, must stay as it is in every test.

- [ ] **Test 1 — `household owner can transfer the household, and the other person accepts`**
  (two browsers): OWNER transfers to M; M's browser shows the banner without a reload; M
  accepts; OWNER's Members page shows OWNER as manager and M as owner; read back through
  `makeGql` with `expect.poll`.
- [ ] **Test 2 — `user can decline a transfer`** and the owner sees no waiting row.
- [ ] **Test 3 — `manager becomes the owner after the owner's account is deleted`:**
  `POST /e2e/users/<OWNER>/deleted`; M's browser shows the hand-over banner without a
  reload; B (a member) shows none; M accepts; M is owner; `Household.ownerGoneAt` is null
  again.
- [ ] **Test 4 — `a deleted organizer no longer counts`:** B's account is deleted; Garage
  shows **No organizer** on the locations list; B is gone from the Members page and from
  Garage's people page.
- [ ] **Test 5 — `the household of a deleted only person is deleted with its data`:** a user
  with a tag WITH a tag type, an item, stock, a cart row and a log, alone in their household;
  `POST …/deleted`; every row of theirs is gone (read back through a cleanup-style count or
  `GET /e2e/users/:id`); H2 is untouched. This is the real-SQL proof of T64 and the
  `NoAction` trap.
- [ ] **Test 6 — `two people accept a hand-over at once`:** two managers send
  `acceptOwnershipOffer` together through `makeGql`; exactly one is owner, the other gets
  `OFFER_GONE`. (Real Postgres, real row locks: the only place this is proved.)
- [ ] Axe scans of the banner (both kinds) and the Members page with an offer, light and
  dark.
- [ ] **Cleanup trap:** `/e2e/cleanup` deletes households by the OWNER row. A household whose
  owner was deleted and where nobody accepted has NO owner row, so no cleanup deletes it.
  Every test that deletes an owner ends with an accept (or the only-person delete). If one
  cannot, it deletes the household itself with a direct cleanup call for the accepting
  user. Say which in the spec.
- [ ] Run only this spec and `location-people.spec.ts`, `household-invites.spec.ts` in
  `cloud`. Copy `test-results/` aside before any re-run.

**Mutation checks (E2E):** the K.4 "only person" count without `deletedAt` → test 5. With
no other member in the fixture this mutation changes nothing, so the fixture needs a second
member whose account was deleted FIRST; then the mutation turns test 5 red. The accept
without the "still exists" read → test 6; `countedOrganizerIn` without `deletedAt: null` → test 4 only if the hand-over did not
already remove B's rows. **It did**, so test 4 cannot go red on that mutation. Record it as a
negative control, not coverage; K.2's unit test is the proof (the pre-H6 shape).

---

## Task K.9 — H6b docs, deploy notes and the final gate

**Files:** root `CLAUDE.md` (an H6b paragraph: the table, the five mutations, the hand-over,
the deleted-account rule, the live guard count, the cleanup count), `apps/server/prisma/CLAUDE.md`,
`e2e/CLAUDE.md`, `routes/settings/CLAUDE.md`, `components/CLAUDE.md`, `hooks/CLAUDE.md`, the
design (*Transfer ownership*, *Owner's account is deleted*, *Sequencing* row H6), the phase
plan's H6 outline, the H5 and H5c plans' *Known gaps* (mark the deleted-account items fixed,
with a link here), `docs/INDEX.md`, the H4 runbook (a new **section 12, H6b**: one additive
migration, server first, the O36 count before the release, checks after deploy), and this
plan's *What this plan got wrong* and *Status*.

- [ ] Step 1: the docs. Re-measure every count.
- [ ] Step 2: the main session runs `verify:migration` with the owner's consent.
- [ ] Step 3: the full gate from the repo root (the same block as J.9 Step 3), then
  `pnpm test:e2e:all`.
- [ ] Step 4: `git status` clean; `git show --stat` for each commit.

---

## Deploy notes

| Part | Migration | Order | Env / Clerk |
|---|---|---|---|
| H6a | `add_household_activity` (additive: one enum, one table) | server before web (the new bundle selects `householdActivity` and calls the new purges) | none |
| H6b | `add_ownership_offers` (additive: one enum, one table) | server before web (the new bundle selects `myOwnershipOffers`, `Household.hasOwner`, `.pendingTransfer`) | none new. The Clerk endpoint must send `user.deleted`, which it does since H2. `CLERK_WEBHOOK_SIGNING_SECRET` must be set (it is, since H2) |

- **Before the release, count accounts that are already deleted** (owner decision O36):
  `SELECT count(*) FROM "User" WHERE "deletedAt" IS NOT NULL;` on production (read-only).
  The H3a migration gave each of them a household, and no hand-over has run for them.
- **An old bundle and H6.** `main`'s bundle selects none of the new fields, so it keeps
  working. `oldBundleCompat.test.ts` must list exactly the known breaking and dangerous
  changes after each part.
- **The webhook runs the hand-over in production only after the server deploy.** A
  `user.deleted` that arrives during the deploy window is handled by whichever server answers
  it. An old server only sets `deletedAt`; the O36 step covers that account too.
- **Runbook sections:** section 11 (H6a) and section 12 (H6b) of
  [the H4 runbook](../backend/2026-11-17-deploy-runbook-households-h4.md). After the server
  deploy: on a device with the new bundle, give a role and see it on the Activity page; as
  a test owner, transfer to a second test account and accept.

## Rules every task brief must pass down

- Plain English (short sentences, common words, main point first), in code comments, docs,
  commits and the report. `tw` texts use 據點王 / 搬運工 / 圍觀的 and 擁有者 / 管理者 / 成員.
- The report shape from root `CLAUDE.md`, *Pull Requests and Agent Reports*, and an explicit
  section: **what this plan got wrong**.
- Node 22.17.1. The full gate after each task. Copy files aside before a mutation; never
  `git checkout --` to undo one; never bare `git stash`.
- **No database command in a subagent.** No `prisma migrate dev`, no `verify:migration`, no
  `migrate reset`. `prisma validate` and `prisma generate` are fine.
- Every role test has a second person with a different role and a location the caller has
  no role on. A test that needs one person in two households to act in one of them sets
  `User.activeHouseholdId` (`world.setActiveHousehold`), not a `requestCache` pin.
- Every new mutation is in the live guard, with its test of the published event.
- Every logged write has a test that its log row and its change commit or roll back together.
- Do not change or remove an existing GraphQL field, argument or input field. Run
  `oldBundleCompat.test.ts`.
- A write hook refetches with `refetchAfterWrite`, never `awaitRefetchQueries`.
- After each commit, `git show <sha> -- <file> | grep '<a line you added>'` (lint-staged can
  rewrite a staged file).
- The web suite has one known flaky story test under load
  (`routes/shopping/index.stories.test.tsx`, Offline). Check `uptime` and re-run it alone
  before you call it a regression.

## Known gaps (expected after H6)

- **A household-level event about a deleted household reaches nobody.** `shouldDeliver`
  checks membership, and the members went with the household. Other members' open tabs
  learn on their next request (the H5b household guard and no-household gate). The same as
  H5b's removal gap.
- **The activity table has no size limit** (T48).
- **Imports are logged from the client's own counts** (O33-A). A changed web client could
  send any numbers. The 22 import mutations still check every row; only the log text could
  be wrong.
- **No local mode danger zone.** Local mode still clears through the import `clear`.
- **The hand-over needs a deleted Clerk account.** Inactivity, claims and e-mail are
  postponed (design).
- **"Not now" is per offer, not per tab.** `dismissOwnershipOffer` publishes nothing, so the
  person's other tabs keep the banner until their next refetch.
- **Race proofs on real SQL:** only the double accept (K.8 test 6) runs on Postgres. The
  lock order of every other write is proved by call order in unit tests, as in H5b and H5c.
- **Accounts deleted before H6** keep their rows until the O36 step runs. T61's filter hides
  them as organizers and in the lists, but their households are not handed over.
- Carried over, still open: the old-bundle shim removal, the keyboard gap on `role="button"`
  badges, O21 (H7), and the other items in the H5, H5b and H5c plans' *Known gaps*.

## What this plan got wrong

Filled in from the task reports and reviews.

| Task | The plan said | What was true |
|---|---|---|
| J.1 | The T49 mutation check adds `householdActivity: { none: {} }` to `emptyHouseholdWhere` | The relation field on `Household` is named `activities` (the plan named none). The mutation used `activities: { none: {} }`. The fake models that key, so the test fails on the VALUE (`hh_p` is kept), not on an unknown-key throw |
| J.1 | The fake applies `householdId`, `createdAt` (`lt`, `lte`), `id` and `OR` | T54's cursor also needs `id: { lt }` (rows with the same `createdAt`). Two new `where` kinds were added to `src/test/whereKeys.ts`, which the file map did not name: `dateCompare` (a `Date`, `{ lt }`, `{ lte }`) and `idCursor` (a string, `{ in }`, `{ lt }`) |
| J.1 | `purge-coverage.test.ts`: "the filter text of the new call" | Two more edits were needed. `householdActivity` joins `clearAllData`'s `kept` list (a clear must keep the log), and its `/e2e/cleanup` filter is a path EXCEPTION, not a `MODEL_PATHS` entry: a `MODEL_PATHS` entry would make the guard demand that `clearAllData` delete the log too |
| J.1 | T51 lists the H6b actions "in H6b"; K.1 does not say who adds them to the enum | J.1's migration creates all 19 values, H6b's included. So K.1 needs no `ALTER TYPE … ADD VALUE` (a value added that way cannot be used in the same transaction) |
| J.1 | `cleanup-endpoint.spec.ts`: one seeded row, "written through a real logged mutation, for example `createInvite`, once J.2 exists" | The spec already calls the real `createInvite`. Once J.2 makes it log `INVITE_CREATED`, the activity row is seeded with no new step. Between J.1 and J.2 the spec reports `"householdActivities":0` and would fail. Only comments were changed; it is unrun until J.8 |
| J.2 | Step 1: the tests go in the five existing test files | Most went into ONE new file, `resolvers/activity-writes.resolver.test.ts`, with one fixture for every write in three resolver files. Only the `clearAllData` tests (in `clearAllData.resolver.test.ts`, which already records each delete) and the P2034 test (in `invite-join.resolver.test.ts`, next to its helper) went into existing files. One existing test had to change: `location-people.resolver.test.ts` T42 lists every model `removeLocationRole` touches, and `householdActivity` is now one of them |
| J.2 | Atomicity: "make the step after `recordActivity` throw" | `recordActivity` is the LAST step of every callback, so there is no step after it. The tests make the log write itself fail (`householdActivity.create` rejects once) and check that the change is gone too. That catches a log row moved out of the transaction. A second check, a spy on the GLOBAL client's `householdActivity.create` in `afterEach`, catches a write that forgets `tx` |
| J.2 | The `joinHousehold` mutation check: "logs outside the retried callback" must turn the `P2034` test red | The new one-row `P2034` test stays green for that mutation. The fake's rollback restores the whole store, and a log written once, after the retry, still gives one row. What turns red is the join atomicity test, and the existing `P2034` test, which counts `$transaction` calls. The one-row test is kept as a check of the result, not as proof of where the call sits |
| J.2 | T51 gives `LOCATION_ROLE_REMOVED` and `LOCATION_LEFT` no `details` | T53 needs `locationName` for every row about a location, and `fromRole` reads well for a removal. Both store `{ locationName, from }`. `INVITE_REVOKED`, `MEMBER_REMOVED` and `MEMBER_LEFT` store no `details` |
| J.2 | `recordImport(counts: ImportCountsInput!)` names no fields | `ImportCountsInput` has 11 required `Int!` fields named after the backup file's keys: `items`, `tags`, `tagTypes`, `vendors`, `recipes`, `shelves`, `locations`, `itemStocks`, `inventoryLogs`, `shoppingCarts`, `cartItems`. A negative or non-integer count is `BAD_USER_INPUT`. The row stores `details: { counts }` |
| J.3 | T53: `HouseholdActivityEntry` with `actorName`, `targetName` and the other fields; O35-A says a deleted account shows "(deleted account)" | T53 had no way to say that an account is deleted. The entry has `actorDeleted: Boolean!` and `targetDeleted: Boolean`; the web adds the localized text. Also `targetIsMe`, so the web can say "you" for the target as it can for the actor. An actor or target with no `User` row (only after `/e2e/cleanup`) gives the name `""` and `deleted: true` |
| J.3 | T53: `count: Int` is the only number | `IMPORT` stores 11 counts in `details.counts`. The entry has `importCounts: ActivityImportCounts`, a type with the same 11 `Int!` fields as `ImportCountsInput`. A count missing from the stored row is 0; `details.counts` that is not an object gives `null` |
| J.3 | T53 names `action: ActivityAction!` but no task adds the enum to GraphQL | J.3's `schema/activity.graphql` adds `enum ActivityAction` with all 19 values, H6b's included, the same list as the Prisma enum. So a stored `action` is always a valid GraphQL value, and the generated type matches Prisma's. (The whole enum is new since `main`, so `oldBundleCompat.test.ts` does not see it either way.) |
| J.3 | T51 says `LOCATION_ITEMS_REMOVED` stores `{ stockRows, cartRows }`; T53 has only `count` | J.3 exposes `count` from `details.count` only. **J.4 must decide**: store `count` too, or add fields. Today such a row would show `count: null` |
| J.3 (review) | The J.3 row above: "J.4 must decide: store `count` too, or add fields" for `LOCATION_ITEMS_REMOVED` | The O39 text for that action is "{{actor}} removed all items from {{location}}". It uses NO number, but it needs `{{location}}`. So J.4 must store `details: { locationName }` on that row (it may keep `stockRows` and `cartRows` too; nothing reads them). Stored as T51 says, the row gives `locationName: null` and the sentence has no location. No new GraphQL field is needed. The same check for `MEMBER_JOINED`: its O39 text is "{{actor}} joined the household", so its `locationRoles` need no field either |
| J.3 | T53 does not say what `MEMBER_JOINED`'s `locationRoles` become | Not exposed. The entry carries `householdRole` only. If the Activity page should list the joiner's location roles, J.5/J.6 needs a new field |
| J.3 | T54: `first` defaults to 50, at most 200 | It did not say what 0 or a negative number does. Both are `BAD_USER_INPUT` |
| J.3 | Step 3: "extend `displayNamesOf` to return `deletedAt` too, or add a sibling" | A sibling, `accountNamesOf` in `lib/household.ts`, selects `{ id, displayName, deletedAt }`. `displayNamesOf` is unchanged, so its callers in three resolver files and their tests do not move |
| J.3 | The cursor compares `id` | `id` is compared as text. Postgres uses the column's collation for both `ORDER BY` and `<`, so the two agree. The fake uses JavaScript string order for both. The order among rows with the same `createdAt` is by cuid, not by insert order, and no test expects insert order |
| J.4 | T57: "the household delete publishes household-level `LOCATION`" | That event reaches nobody: `shouldDeliver` checks membership, and after the commit the household has no members. `deleteHousehold` publishes nothing and is in `publishesNothing`, with that reason. The owner's own tab gets `true` and must leave on its own (J.7: clear the Apollo cache and go to the next household or the no-household screen). Other members' open tabs find out on their next request, through the household guard or `NoHouseholdGate` |
| J.4 | T55 / T57: `removeAllLocationItems` publishes `STOCK` and `CART` | It publishes only the kinds that changed rows: a location with stock rows and no cart rows sends `STOCK` only. The guard lists both kinds, as for other writes that send a kind only when it changed |
| J.4 | T51: `LOCATION_ITEMS_REMOVED` stores `{ stockRows, cartRows }` | It stores `{ locationName, stockRows, cartRows }`, as the J.3 review row asked. `householdActivity` reads `locationName` |
| J.4 | T55: `deleteAllLocations` is "`deleteMany` of the household's locations, which cascades" | Kept as one `deleteMany`. The test fake had no cascade from a location to logs, carts and cart rows, so `purges.resolver.test.ts` models it itself |
| J.4 | T55 does not say how `removeAllLocationItems` checks its role | It takes the household lock first and reads the location and the role through `tx` (`locationRoleOf(ctx, id, tx)`), like the H5c role writes. So an organizer demoted at the same moment is refused. Cost: `Household.updatedAt` moves on every call |
| J.4 | T60 / T16: a household delete writes other people's `User` rows, so it "retries once on `P2034`" | `deleteHousehold` also clears every `User.activeHouseholdId` that names the household BEFORE it takes the household lock, so the usual order (User rows, then households) holds. The cascade would make the same writes after the lock. The retry stays for other writers. `userFake` gained the `activeHouseholdId` where key for this |
| J.4 (review) | T52: the owner check runs AFTER the household lock, through `tx`. Combined with the J.4 row above (clear `User.activeHouseholdId` BEFORE the lock), that put a write of other people's rows before ANY role check | `deleteHousehold` also checks the owner role early, outside the transaction, so a manager or member is refused before step 1. The check after the lock stays. Any later write that must touch `User` rows before the household lock (K.4's hand-over runs as the webhook, not a person, so it is not affected) needs the same early check |
| J.4 | Step 1: the `deleteHouseholdData` test "with a tag that has a tag type"; the mutation table: "`tagType` before `tag`: nothing on the fake" | A small table fake in the new `lib/deleteHouseholdData.test.ts` models `Tag.type` as NoAction, so that mutation goes red there (P2003). Real SQL in J.8 is still the proof for Postgres |
| J.4 | Facts: `verify-migration.ts` keeps a copy of `lockHousehold` | No code calls `lockHousehold` any more: its last two callers moved to `lockHouseholdOrForbid`. The function is kept for its long comment, with a note that says so. The script's copy is now the `updateMany` form, and both copied bodies read the household role after the lock. **That script change is unrun** (no subagent runs a database command) |
| J.4 | `purge-coverage.test.ts` reads `clearAllData`'s body | It now reads `deleteHouseholdData`'s body (the path is labelled after the helper), and two new tests check that `clearAllData` and `deleteHousehold` hold no data delete of their own and call the helper |
| J.5 | File map: the J.5 files | Four more files changed: `apollo/refetchAfterWrite.ts` (a new `'active'` form, for the purges), `lib/oncePerKey.ts` (new; the double-press guard moved out of `useLocationPeople.ts`), `hooks/useHouseholdMembers.ts` (`moveToCurrentHousehold`, moved out of `useLeaveHousehold` for `useDeleteHousehold`), and `apollo/liveUpdates.test.ts` |
| J.5 | T57: `HouseholdActivity` is listed under `CATALOG` and `STOCK` | Also under `CART`: `removeAllLocationItems` sends only the kinds that changed (the J.4 row), so a location with cart rows and no stock sends `CART` alone. Two gaps stay: a `STOCK` or `CART` event is LOCATION-level, so an owner or manager with no role on that location does not get it, and their open Activity page shows the "removed all items" row only on its next read. `recordImport` publishes nothing, so an import's log row can come after the import's own events |
| J.5 | File map: `recordImport` in `lib/importData.ts` and `components/settings/ImportCard/` | Only `lib/importData.ts` changed. `importCloudData` is shared by `ImportCard` and the sign-in copy (`usePostLoginMigration`), so both are logged from one call site. `ImportCard` needs nothing |
| J.5 | J.7 Step 1: J.7 calls `expectLocationLoss` before **Delete all locations** and **Delete household** | The hooks do it (`usePurges.ts`), and also for **Clear household**. J.7 needs no call of its own |
| J.5 | J.7 Step 1: after **Delete household** "the app shows the no-household screen or the person's other household" | `useDeleteHousehold` does the move (`moveToCurrentHousehold`, as `leave()`), and it clears the Apollo cache and `Player1InventoryCloudCache`. J.7 shows the dialog only |
| J.5 | Step 3: "a refetch after a live event replaces the first page" and keeps the pages loaded (the decisions list: "new rows go on top, and the pages already loaded stay") | Not true until J.6. Apollo's `refetch` uses `refetchWritePolicy: 'overwrite'` by default, so the field policy got no old list and every live event or write dropped the "Load more" pages. J.5's `client.test.ts` tests wrote to the cache directly, not through `refetch`. J.6 set `refetchWritePolicy: 'merge'` on the query and pinned it with a hook test |
| J.6 | Files: the sidebar item in `HouseholdSidebar.tsx` "and its tests and stories" | `usePermissions` in the sidebar needs a `QueryClientProvider` (local mode reads the location list through TanStack Query). The existing `HouseholdSidebar.test.tsx` and `HouseholdSidebar.stories.tsx` had none and failed until one was added. New tests went into two new files, `HouseholdSidebar.activity.test.tsx` and `routes/settings/index.activity.test.tsx`, which replace `usePermissions` with `permissionsFor` |
| J.6 | O39 lists the texts | It has no text for the caller ("You"), for a missing name, location or role, for an unknown action, for one deleted location, or for the page's errors and link back. 13 texts were added; see the J.6 report |
| J.6 | Files: no shared fixtures | The page story and the list story need the same 19 rows, and a named export in a `.stories.tsx` becomes a broken story. They live in a new module, `src/test/activityFixtures.ts` |
| J.6 | Facts: "use the app's date helpers" | `formatDate` shows no time. A log row needs one, so `formatDateTime` was added beside it |
| J.6 (review) | Step 1: "a `FORBIDDEN` … shows the no-access state"; the page read only the server's answer | With `cache-and-network`, rows cached during an earlier manager session showed until `FORBIDDEN` arrived, and for good offline. The page also checks the known household role (`usePermissions().canReadActivity`) |
| J.5 | Step 1: `loadMore()` and `hasMore` | The hook also needed `isLoadingMore`, `loadMoreFailed` (a failed page must not reject, and must not hide the rows shown) and `refetch` (the page's Retry). `useDeleteHousehold` has an `isPending` of its own: it has no refetch, and it stays true until the move starts |
| J.7 | Step 3: reuse `DeleteButton` or the H5c dialog, "do not build a third confirm" | `DeleteButton` could not do it as it was: `AlertDialogAction` closes the dialog on click, and a failure was a toast. The brief asked for a dialog that stays open with the error. `DeleteButton` gained a typed-name mode (`confirmName`, `confirmNameLabel`, `disabled`): an exact-match field, the dialog open while the delete runs, the error inside it as `role="alert"`. Plain callers are unchanged |
| J.7 | Files: `lib/seenLocations.ts`; Step 1: mark the locations with `expectLocationLoss` | Nothing changed there. The hooks mark (the J.5 rows above). The "no toast" mutation was run on `usePurges.ts` against J.5's tests |
| J.7 | Step 1: "after it, the pantry of that location is empty and its logs are still on the item log tab"; "Delete household … then the app shows the no-household screen" | A web unit test cannot show either: the server does the delete, and the move is `useDeleteHousehold`'s (pinned in `usePurges.test.tsx`). The page tests check that the right mutation is sent once and that the dialog closes. Both screens are left to J.8 (tests 4 and 5) |
| J.7 | O39: `…danger.removeAllDescription` "The location, its people and its logs stay." | The brief asked that the text say the catalog stays too: "The location, its people, its logs and the catalog stay." `…deleteLocationsDescription` also says "No new location is made." (O34-A). O39 had no title for the location's zone: `settings.locations.danger.title` was added. The location confirm reuses `settings.household.danger.typeName` |
| J.7 | Files: `$id.stories.tsx` | Unchanged: its `OrganizerView` already shows the zone; its smoke test now checks for Remove all items. `routes/settings/household/index.stories.tsx` gained `CloudOwner` |
| J.7 (review) | Step 1: "the confirm button stays disabled until the field equals the household name exactly (case and spaces as stored)" | Exact spaces need the label to SHOW them. HTML folds runs of spaces and drops a trailing one, so a name like `a  b` could never be confirmed. The label now has `whitespace-pre-wrap` |
| J.8 | Files: `e2e/pages/HouseholdPage.ts` "new or extended" | It did not exist; it is new. The location danger zone sits on the people page, so `e2e/pages/LocationPeoplePage.ts` (not in the file list) was extended for Remove all items |
| J.8 | Mutation check: "drop the household (or location) scope from each purge's stock delete" | On the shared test database a dropped scope deletes every household's rows, which the brief forbade. Each mutation WIDENED the scope to this spec's two users instead. Also, `deleteAllLocations` has no stock delete: it deletes the locations, and the stock goes by cascade. Its mutation widened the location delete |
| J.8 | `cleanup-endpoint.spec.ts`: "expect a count of at least 1 for the new key" | The spec already checked every key of `CLEANUP_MODEL_KEYS` with one loop, so the key was covered since J.1. J.8 added a readback of the `INVITE_CREATED` row before the cleanup and an explicit line for the key |
| J.8 | Test 1: "{owner} gave {B} the 搬運工 role on Home" | The owner reads their own row, so the actor is "You" (`actorIsMe`), and the E2E build is English: "You gave Bea Member the Participant role on Home" |
| J.8 | Test 6: one axe test | Two tests, light and dark, like `location-people.spec.ts`. The new file has 7 tests |
| J.8 (brief) | `CLAUDE.md` and `e2e/CLAUDE.md` say the cleanup route deletes 19 models | 20 (`HouseholdActivity`, J.1). Counted from the distinct `prisma.<model>.deleteMany` in `lib/e2eCleanup.ts`. Updated |

## Status

**Plan written 2026-11-20** on `feature/households-h6`, based on `develop` at `7dbaeca9`.
Owner decisions O32–O39: all A (2026-11-20). H6a (J.1–J.9) comes first.

---

## Owner questions

Each question has a recommended option, marked **(Recommended)** and listed first. The task
that needs the answer is named in brackets.

**O32 — One PR or two?** (needed before J.1)

- **A. Two PRs (Recommended).** H6a: activity log, purges, danger zones (J.1–J.9). Then H6b:
  transfer, hand-over, deleted accounts (K.1–K.9). Each has one migration.
- B. One PR with all eighteen tasks.
- C. Three PRs: activity log, purges, ownership.

Reason: each half is about the size of H5c, and H6b's offers need H6a's log table first.

**O33 — How is an import written to the activity log?** (needed before J.2)

- **A. One row per import (Recommended).** When an import finishes, the web calls a new
  mutation `recordImport` with the counts it imported. Only an owner or manager may call it.
- B. One row per batch the server writes (an import of 1000 items can give 20 or more rows).
- C. Imports are not logged. Only a `clear` import shows, as "cleared the household".

Reason: one readable line per import. The counts come from the person's own browser, which
is fine for a log in a family app; every imported row is still checked by the server.

**O34 — After "Delete all locations", is a new "Home" made?** (needed before J.4 and J.7)

- **A. No (Recommended).** The household has no location. Pantry, Shopping and Cooking show
  "You have no locations in this household yet" with **Create a location** (built in H5a).
- B. Yes, like "Clear household": a new "Home", with the person who deleted as its 據點王.

Reason: the button says "delete all locations", and the empty screen already lets the
person start again in one click.

**O35 — How does a deleted account show in the activity log?** (needed before J.3 and J.6)

- **A. The stored name with "(deleted account)" after it (Recommended)**, for example
  "Mia (deleted account) left the household".
- B. "Deleted user" only, as the design says. The stored name is never shown again.

Reason: the server already keeps the name so that logs can name the person (H2), and in a
family the name tells you who it was. B hides more, if that matters more to you.

**O36 — Accounts that were deleted before H6 deploys** (needed before K.9, for the runbook)

The H3a migration gave every account a household, deleted accounts too. No hand-over has run
for them.

- **A. Count them before the release (Recommended).** If the count is 0, nothing more. If it
  is not 0, stop and add a one-off script that runs the same hand-over for each of them,
  then release.
- B. Write and test the one-off script in H6b now, and run it at every release.
- C. Do nothing. Their households stay as they are, with no owner who can sign in.

Reason: with fewer than five users, the count is most likely 0. A script nobody needs is
code to test and keep.

**O37 — The last person leaves a household that has no owner** (needed before K.3 and K.7)

This can happen after a hand-over that nobody accepted.

- **A. The household and all its data are deleted, after a warning (Recommended).** The same
  rule as an owner who was the only person.
- B. Refused. The last person must accept the hand-over first, and then, as owner, cannot
  leave either.
- C. Allowed. The household stays, with nobody in it, forever.

Reason: B traps the person, and C leaves data nobody can ever reach.

**O38 — "Delete the household" is in the design, but in no phase** (needed before J.4 and
J.7)

- **A. Build it in H6a, in the household danger zone (Recommended).** Owner only, after
  typing the household name. Everyone loses access; each person then sees their other
  household or the "You are not in any household" screen.
- B. Build it in H7, with "Switch to…" and "Create new".
- C. Do not build it yet.

Reason: it is a purge like the other two, it needs the same confirm and the same tests, and
the no-household screen it needs already exists (H5b).

**O39 — The new texts** (needed by J.6, J.7, K.6 and K.7; the owner may also correct them in
the PR)

English first, then the first `tw` version.

| Key (proposed) | English | `tw` |
|---|---|---|
| `settings.household.activity.title` | Activity | 動態 |
| `…activity.description` | Who changed what in this household | 誰在這個家庭裡改了什麼 |
| `…activity.empty` | Nothing has happened here yet. | 這裡還沒有任何動態。 |
| `…activity.loadMore` | Load more | 載入更多 |
| `…activity.noAccess` | Only the owner and managers can see the activity. | 只有擁有者和管理者可以看到動態。 |
| `…activity.locationRoleSet` | {{actor}} gave {{target}} the {{role}} role on {{location}} | {{actor}} 把 {{location}} 的{{role}}角色給了 {{target}} |
| `…activity.locationRoleRemoved` | {{actor}} removed {{target}} from {{location}} | {{actor}} 把 {{target}} 移出了 {{location}} |
| `…activity.locationLeft` | {{actor}} left {{location}} | {{actor}} 離開了 {{location}} |
| `…activity.householdRoleChanged` | {{actor}} made {{target}} {{role}} | {{actor}} 把 {{target}} 設為{{role}} |
| `…activity.inviteCreated` | {{actor}} created an invite for a {{role}} | {{actor}} 建立了一個{{role}}的邀請 |
| `…activity.inviteRevoked` | {{actor}} revoked an invite | {{actor}} 撤銷了一個邀請 |
| `…activity.memberJoined` | {{actor}} joined the household | {{actor}} 加入了家庭 |
| `…activity.memberLeft` | {{actor}} left the household | {{actor}} 離開了家庭 |
| `…activity.memberRemoved` | {{actor}} removed {{target}} from the household | {{actor}} 把 {{target}} 移出了家庭 |
| `…activity.householdCleared` | {{actor}} cleared the household | {{actor}} 清空了家庭 |
| `…activity.locationsDeleted` | {{actor}} deleted all {{count}} locations | {{actor}} 刪除了全部 {{count}} 個據點 |
| `…activity.locationItemsRemoved` | {{actor}} removed all items from {{location}} | {{actor}} 移除了 {{location}} 的所有物品 |
| `…activity.import` | {{actor}} imported data | {{actor}} 匯入了資料 |
| `…activity.ownershipOffered` | {{actor}} offered the household to {{target}} | {{actor}} 想把家庭交給 {{target}} |
| `…activity.ownershipOfferCancelled` | {{actor}} took back the offer to {{target}} | {{actor}} 收回了給 {{target}} 的交接 |
| `…activity.ownershipDeclined` | {{actor}} declined to become the owner | {{actor}} 拒絕成為擁有者 |
| `…activity.ownershipAccepted` | {{actor}} became the owner | {{actor}} 成為了擁有者 |
| `…activity.handoverStarted` | {{actor}}'s account was deleted. The household needs a new owner | {{actor}} 的帳號已刪除，家庭需要新的擁有者 |
| `…activity.accountDeleted` | {{actor}}'s account was deleted | {{actor}} 的帳號已刪除 |
| `…activity.deletedAccount` (O35-A) | {{name}} (deleted account) | {{name}}（已刪除的帳號） |
| `settings.household.danger.title` | Danger zone | 危險區域 |
| `…danger.clear` | Clear household | 清空家庭 |
| `…danger.clearDescription` | Deletes the catalog and every location with everything in it. A new "Home" is made. People and their household roles stay. | 刪除目錄和所有據點及其內容，並建立新的「Home」。成員和他們的家庭角色會保留。 |
| `…danger.deleteLocations` | Delete all locations | 刪除所有據點 |
| `…danger.deleteLocationsDescription` | Deletes every location with its stock, carts, logs and roles. The catalog stays. | 刪除所有據點及其庫存、購物車、紀錄和角色。目錄會保留。 |
| `…danger.deleteHousehold` (O38-A) | Delete household | 刪除家庭 |
| `…danger.deleteHouseholdDescription` | Deletes the household and everything in it. Everyone loses access. | 刪除家庭和裡面的所有東西。所有人都會失去存取權。 |
| `…danger.typeName` | Type {{name}} to confirm | 請輸入 {{name}} 以確認 |
| `settings.locations.danger.removeAll` | Remove all items | 移除所有物品 |
| `…danger.removeAllDescription` | Deletes this location's stock and the items in its carts. The location, its people and its logs stay. | 刪除這個據點的庫存和購物車裡的物品。據點、人員和紀錄會保留。 |
| `ownership.banner.handover` | The owner of {{household}} is gone. Do you want to become the owner? | {{household}} 的擁有者已經不在了。你要成為擁有者嗎？ |
| `ownership.banner.transfer` | {{name}} wants to make you the owner of {{household}}. | {{name}} 想讓你成為 {{household}} 的擁有者。 |
| `ownership.accept` | Accept | 接受 |
| `ownership.notNow` | Not now | 稍後再說 |
| `ownership.decline` | Decline | 拒絕 |
| `ownership.accepted` | You are now the owner of {{household}}. | 你現在是 {{household}} 的擁有者了。 |
| `settings.household.members.transfer` | Transfer ownership | 轉移擁有權 |
| `…members.transferConfirm` | Offer {{household}} to {{name}}? You become a manager when they accept. | 要把 {{household}} 交給 {{name}} 嗎？對方接受後，你會變成管理者。 |
| `…members.waiting` | Waiting for {{name}} to accept | 等待 {{name}} 接受 |
| `…members.cancelOffer` | Cancel | 取消 |
| `…members.becomeOwner` | Become the owner | 成為擁有者 |
| `…members.noOwner` | This household has no owner. | 這個家庭沒有擁有者。 |
| `…members.ownerCannotLeave` | Transfer ownership first. | 請先轉移擁有權。 |
| `…members.lastLeaveWarning` (O37-A) | You are the last person here. Leaving deletes the household and everything in it. | 你是這裡的最後一個人。離開會刪除這個家庭和裡面的所有東西。 |

Role names in the sentences reuse `roles.household.*` and `roles.location.*`.
