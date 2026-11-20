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
| O40 | Asked after J.9, answered 2026-11-20: **"Clear & import" asks for the typed household name too**, the same as every other purge. Built in H6b as task K.0 |
| O41 | Asked after J.9, answered 2026-11-20: **role names keep their capital inside log sentences** ("the Participant role"). They then match the labels on the people page and in the role pickers, and English needs no second set of texts |
| O42 | Asked after K.3, answered 2026-11-20: **A.** After a person DECLINES a hand-over offer, the design's table is applied to everyone ELSE. If nobody else is left, the person who declined gets the offer back already dismissed (no banner; the Members page still lets them take the household). This is what K.3 built |
| O43 | Asked after K.4, answered 2026-11-20: **yes.** When an OWNER's account is deleted, the open invites they made are revoked, the same as for a removed manager (O20) and for a deleted manager or member (K.4). Built as task K.4b |
| O44 | Asked after K.4, answered 2026-11-20: **yes.** If the O36 count of accounts deleted before H6 is not 0, the one-off script runs the same `handOverDeletedAccount` for each of them. With the K.4 review fix, this also deletes a household where no live person is left (O37-A). Goes into K.9's deploy notes |
| O45 | Asked after K.6, answered 2026-11-20: **change the hand-over text.** "The owner of {{household}} deleted their account. Do you want to become the owner?" / 「{{household}} 的擁有者已刪除帳號。你要成為擁有者嗎？」 ("is gone" / 「已經不在了」 can read as "has died"). Built in task K.7b |
| O46 | Asked after K.7, answered 2026-11-20: **keep as built.** While a transfer offer is open, Transfer is hidden; the owner cancels first |
| O47 | Asked after K.7, answered 2026-11-20: **keep as built.** The owner's row says "The owner cannot leave. Transfer ownership first." |
| O48 | Asked after the K.7 review, answered 2026-11-20: **A.** Leave cannot be used until the member list has a fresh answer from the server, so a stale cached list can never hide the O37-A warning. Built in task K.7b |

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

**Review of J.8 (2026-11-20).** One fix, in activity test 2.

- **The sidebar check could pass on the loading state.** `canReadActivity` is `false`
  while the household role loads, so the Activity link is absent then too. The test
  checked "Tags is visible" (not role-gated) and then `toHaveCount(0)` on the Activity
  link, which passed at the first paint. Measured: with `canReadActivity` given to every
  KNOWN role (`!isLoading && householdRole != null` in `permissionsFor`,
  `apps/web/src/hooks/usePermissions.ts`), test 2 **passed** (1 passed, 25.3 s). The
  no-access text still showed, because the server answered `FORBIDDEN`.
- **Fix:** before the absence check, the test waits for the import card's member line
  "Only the owner or a manager can import data." (`ImportCard.tsx`, `role === 'member'`),
  which shows only once `GetHousehold` has answered. With the same mutation the test is now
  **red**: `toHaveCount` `Expected: 0 / Received: 1` at the sidebar link. Restored from a
  copy (`diff -q` clean): green, 1 passed in 24.6 s.
- **Re-run of author mutation 5** (`setLocationRole` publishes nothing): red, the row
  "You gave Bea Member the Participant role on Home" not found within 15 s. It holds.
- After the fix, the three spec files in `cloud` (Node 22.17.1): **11 passed in 4.2 min**,
  load average 1.8 at the start and 1.6 at the end.

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

- [x] Step 1: the docs above. Re-measure every count you write; do not copy one from here.
- [x] Step 2: **the main session**, not a subagent, runs `verify:migration` on the test
  database with the owner's consent (`apps/server/prisma/CLAUDE.md`), and records the result.
  **Done 2026-11-20** by the main session, with the owner's explicit Prisma consent given
  after Prisma's AI-agent warning: `pnpm --filter server verify:migration` against the TEST
  database. Result: "Migration verified.", every line `ok`. The new checks for
  `20261120000000_add_household_activity`:

  | Check | Result |
  |---|---|
  | `"HouseholdActivity"` has exactly 8 columns, with the right types | ok |
  | `"ActivityAction"` holds exactly the 19 values, H6b's included | ok |
  | exactly one foreign key: `householdId` → `Household`, `ON DELETE CASCADE` | ok |
  | no foreign key on `actorId`, `targetUserId` or `locationId` | ok |
  | index `HouseholdActivity_householdId_createdAt_id_idx` on `("householdId", "createdAt" DESC, id)` | ok |
  | a row naming no real actor, target or location is accepted | ok |
  | the optional columns read back `NULL`, and `createdAt` is filled in | ok |
  | an unknown action is refused (`22P02`) | ok |
  | an unknown household is refused (`23503`) | ok |
  | deleting a household deletes its activity rows and keeps another household's | ok |

  The earlier groups passed again too: the household delete across 17 tables, and the
  household lock tests. So J.4's change to the script's copies (the `updateMany` lock and
  `deleteHouseholdData`'s deletes) has now run on real SQL. Also recorded in section 11.2 of
  the H4 runbook and in `apps/server/prisma/CLAUDE.md`.
- [x] Step 3: the full gate from the repo root, every command alone:

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
  re-running anything. **Done 2026-11-20**; the results are in *Status*.
- [x] Step 4: `git status` clean; `git show --stat` for each commit.

---

# Part 2 — H6b: transfer, hand-over, deleted accounts

## Task K.0 — "Clear & import" asks for the typed household name (O40)

**Why:** H6a made every purge ask the owner to type the household name. "Clear & import"
deletes the same catalog as **Clear household** before it imports, but it still confirms with
one click. Owner decision **O40** makes the two the same.

**Files:** `apps/web/src/components/settings/ImportCard/` (and its tests and stories), the
locale files if a new text is needed, the E2E spec that presses "Clear & import" in cloud.

- [x] **Step 1: failing tests.** In cloud, the "Clear & import" confirm is disabled until the
  household name is typed exactly; it is enabled after; the import is not started before.
  Local mode has no household: decide and record what it asks for there (keep today's
  confirm, or the same `DeleteButton` typed mode with no name). Say which in the report.
- [x] **Step 2:** red.
- [x] **Step 3:** reuse `DeleteButton`'s typed-name mode (`confirmName`), as `HouseholdDangerZone` does.
- [x] **Step 4:** green; update every E2E spec that clicks "Clear & import" (grep `e2e/` for it).

**Mutation checks:** the confirm always enabled → the "disabled before typing" test.

**Done 2026-11-20** (commit `d71b15c3`). What was built:

| Place | What it does now |
|---|---|
| `ConflictDialog` | new prop `clearConfirmName`. When set, Clear & import is a `DeleteButton` in typed-name mode: a second confirm opens on top, and its own Clear & import works only when the name is typed exactly. `ImportCard` passes the household name in cloud mode only |
| local mode | **keeps the one-press button.** Local mode has no household, so there is no name to type, and none of the H6a purges exists there either. The rule O40 makes the same is the cloud rule. The local `clear` empties this device only |
| `PostLoginMigrationDialog` | **also changed.** `DataModeCard`'s switch to cloud can store `clear`; after sign-in, Copy here runs `clearAllData` on the household. That is the same purge, so for the owner Copy here now opens the same typed-name confirm (`settings.postLoginMigration.clearConfirmTitle` / `clearConfirmDescription`). `skip` and `replace` copies are unchanged. `DataModeCard`'s own "Clear & import" button stays one press: it runs in LOCAL mode, before sign-in, when no household is known, and it only stores the strategy |
| texts | `settings.import.conflictDialog.clearConfirmDescription`, `settings.postLoginMigration.clearConfirmTitle`, `…clearConfirmDescription`, in `en` and `tw`. The field label reuses `settings.household.danger.typeName` |
| E2E | `SettingsPage.chooseClearAndImport(name | null)`; `import-strategies.spec.ts` (local and cloud; in cloud it also reads back that the seed is still there while the confirm waits), `import-households.spec.ts`, `data-mode-migration.spec.ts` |

Each mutation was made in the source, the named tests went red, the file was restored from a
copy in the scratchpad (`k0-green/`), and `diff -q` was clean:

| # | Mutation (file) | Red |
|---|---|---|
| 1 | `clearConfirmName` ignored, the old one-press button always (`ConflictDialog.tsx`) | 4 web tests: "cannot clear and import until the name is typed exactly" (`expected "vi.fn()" to not be called at all, but actually been called 1 times`), the Enter and Cancel tests and `ClearAsksHouseholdName` (no `Type The Lins to confirm` label). E2E, `cloud`, `import-strategies.spec.ts:280`: red, `getByRole('alertdialog').getByLabel('Type e2e-test-user\'s Household to confirm')`, element(s) not found |
| 2 | the `clear` branch never taken (`PostLoginMigrationDialog.tsx`) | 6: "cannot clear and copy until the name is typed exactly" (`importCloudData` called 1 time), "pressing Copy here has the stored copy run", the two refusal tests, `AskBeforeClear`, the E2E-mode test (no label) |
| 3 | the plan's mutation: the confirm always enabled, `const nameMatches = true` (`DeleteButton.tsx`) | 5: four with `expect(element).toBeDisabled()` / `Received element is not disabled` (both "until the name is typed exactly" tests and both new smoke tests), and the Enter test (`importCloudData` called) |
| 4 | the name passed in local mode too (`clearConfirmName={household?.name ?? 'My data'}`, `ImportCard.tsx`) | 1: "user in local mode clears and imports with one press" (`expected "vi.fn()" to be called 1 times, but got 0 times`) |

Two tests are negative controls and stay green under every mutation above: "user copying with
a stored skip is not asked for the name" and the manager "is not offered Clear & import".

**The gate, 2026-11-20, Node 22.17.1, each command alone:** `pnpm lint` exit 0; `pnpm build`
exit 0, no `TS6385`; `(cd apps/web && pnpm build-storybook)` exit 0, with the story ids
`components-settings-conflictdialog--clear-asks-household-name` and
`components-global-postloginmigrationdialog--ask-before-clear`; `pnpm check` exit 0;
`pnpm test` exit 0: web **3615 / 360** (baseline at `292bcea7`: 3607 / 360), server
**2563 / 83**, `scripts/spec` **70**. E2E: `local` `import-strategies.spec.ts` 2 passed
(4.2s); `cloud` `import-strategies.spec.ts`, `import-households.spec.ts` and
`data-mode-migration.spec.ts` 11 passed (4.4m). The whole `pnpm test:e2e:all` waits for K.9.

---

## Task K.1 — the `OwnershipOffer` table, fakes and cleanup

**Files:** `apps/server/prisma/schema.prisma`, a new migration folder
`<timestamp>_add_ownership_offers/`, `scripts/migrationDeploys.ts`, `scripts/verify-migration.ts`,
`src/test/householdFake.ts`, `householdWorld.ts` and tests, `src/lib/e2eCleanup.ts` and test,
`resolvers/purge-coverage.test.ts`, `e2e/helpers/cloudTeardown.ts`,
`e2e/tests/cleanup-endpoint.spec.ts`, `src/lib/invite.ts` (the T49 comment names the second
model).

- [x] **Step 0:** measure the baseline again (H6a has changed it).
- [x] **Step 1: failing tests.** The fake's `ownershipOffer` store: the unique
  `(householdId, toUserId)` raises `P2002`; `where` keys `id`, `householdId`, `toUserId`,
  `kind`, `dismissedAt: null` are applied and any other key throws. Cleanup: 21 keys; offers
  TO the user and offers of owned households are deleted before `householdMember`.
- [x] **Step 2:** red.
- [x] **Step 3:** schema (T58) and the additive migration. SQL comment: why `toUserId`
  cascades and `fromUserId` has no foreign key.
- [x] **Step 4:** the `last` group; `verify-migration.ts` assertions: the table, the unique
  index, the two foreign keys and their `ON DELETE` rules, no foreign key on `fromUserId`.
- [x] **Step 5:** fakes, cleanup, teardown keys. Full gate. No database command.

**Mutation checks:** the unique index left out of the fake → the `P2002` test;
`ownershipOffer.deleteMany` removed from the cleanup → the key count.

**Done 2026-11-20** (commits `8f3f35d7`, `fba62fcc`). What was built:

| Place | What it does now |
|---|---|
| schema | `enum OfferKind { transfer handover }` and `model OwnershipOffer` as T58. Relation fields: `Household.ownershipOffers`, `User.ownershipOffers` (the offers TO the person) |
| migration | `20261120100000_add_ownership_offers`, written by hand. Its SQL is the same as `prisma migrate diff --from-schema-datamodel <schema at HEAD> --to-schema-datamodel prisma/schema.prisma --script` (compared line by line; no database). In the `last` deploy group, after `add_household_activity` |
| `verify-migration.ts` | `assertOwnershipOffers`: 7 columns, `OfferKind` = `transfer, handover`, exactly two foreign keys (`householdId` → `Household` and `toUserId` → `User`, both `CASCADE`, read from `information_schema`), none on `fromUserId`, the unique pair and the `toUserId` index, `23505` for a second offer to one person in one household, `23503` for an unknown household or person, and the three deletes: the person who MADE an offer goes and the offer stays; the person it is made TO goes and their offers go in both households; a household goes and only its offers go. **Not run**: the main session runs `verify:migration` |
| fake | `householdFake`'s `ownershipOffer` store (create, findUnique, findFirst, findMany, update, updateMany, delete, deleteMany), in `state`; `householdWorld` exposes it |
| `/e2e/cleanup` | 21 models. `ownershipOffer.deleteMany({ where: { OR: [{ householdId: owned }, { toUserId: userId }] } })`, after `householdActivity`, before `householdMember`. The key `ownershipOffers` in both `CLEANUP_MODEL_KEYS` lists |
| `purge-coverage.test.ts` | `ownershipOffer` is kept by `deleteHouseholdData` (a clear keeps the household and its members, so an open offer stays valid). Its cleanup filter is a path exception, like `householdActivity` |
| `cleanup-endpoint.spec.ts` | comments only. No mutation can make an offer before K.3. **Until K.8 seeds one, this spec reports `"ownershipOffers":0` and fails** |
| `invite.ts` | the T49 comment names `OwnershipOffer` |

Each mutation was made in the source, the named tests went red, the file was restored from a
copy in the scratchpad (`k1-green/`), and `diff -q` was clean:

| # | Mutation (file) | Red |
|---|---|---|
| 1 | the plan's: the unique pair left out of the fake (`householdFake.ts`, `checkOfferRow`) | 2: "create raises P2002 on a second offer to the same person in the same household" and "an update that moves an offer onto a taken (householdId, toUserId) raises P2002", both `promise resolved "{ fromUserId: null, …(6) }" instead of rejecting` |
| 2 | the plan's: `ownershipOffer.deleteMany` and its key removed from the cleanup (`e2eCleanup.ts`) | 6: the order test (`expected [ 'read:owners', …(22) ] to deeply equal [ 'read:owners', …(23) ]`), the owns-nothing test, the counts test, the key list against `cloudTeardown.ts`, and two `purge-coverage` tests (`expected [ 'ownershipOffer' ] to deeply equal []`) |
| 3 | the cleanup filter without its `toUserId` half (`e2eCleanup.ts`) | 3: the order test (`ownershipOffer: expected [ [ { where: { …(1) } } ] ] to strictly equal …`), the owns-nothing test, the `purge-coverage` filter form test |
| 4 | `ownershipOffers: { none: {} }` added to `emptyHouseholdWhere` (`invite.ts`, T49) | 31 tests in 2 resolver files, all on `householdFake(Household) was given a where key it does not model: 'ownershipOffers'`. It fails on a THROW, not on a value: the fake has no such key on purpose (see *What this plan got wrong*) |
| 5 | `household.deleteMany` no longer cascades to offers (`householdFake.ts`) | 2: the fake's cascade test and the `householdWorld` test |
| 6 | the offer `where` no longer checked (`householdFake.ts`, `checkOfferWhere`) | 5: the four "throws on the where key …" tests and the `dismissedAt: { lt }` refusal |

**The gate, 2026-11-20, Node 22.17.1, each command alone:** `pnpm lint` exit 0 (13
warnings in `e2e/`, the known ones); `pnpm build` exit 0, no `TS6385`, the server bundle
236.6 KiB and 14 `.graphql` files; `pnpm check` exit 0; `pnpm test` exit 0: web
**3615 / 360** (unchanged), server **2588 / 83** (baseline at `d69080f8`: 2563 / 83),
`scripts/spec` **70**. `build-storybook` was not run: no web file changed. No E2E: the test
database does not have the table yet, so every cloud cleanup would fail until the main
session runs `verify:migration`.

**Review of K.1, 2026-11-20.** No blocking defect. Checked with no database:

| Check | Result |
|---|---|
| `prisma migrate diff --from-schema-datamodel <schema at d69080f8> --to-schema-datamodel prisma/schema.prisma --script` | the same statements as `migration.sql`, comments and blank lines left out (`diff` empty) |
| `verify-migration.ts` | each assertion fails on a wrong migration: RESTRICT or a third foreign key changes the one `fkText` string; a missing unique index fails both the index check and the `23505` check. Every `oo-` row is deleted at the end; no other block uses the prefix. Read only, NOT run |
| "Delete household" | `deleteHousehold` ends with `tx.household.deleteMany`; the offers go by `ON DELETE CASCADE` on `householdId` (the fake models the same) |

One change: a join test for T49, `invite-join.resolver.test.ts` "an ownership offer does not
keep it, and goes with it (H6b decision T49)". It seeds an offer in PAT's empty household and
one in `hh_x`, joins, and checks only `hh_x`'s offer is left. Mutations, each restored from a
copy (`diff -q` clean):

| # | Mutation | Red |
|---|---|---|
| R1 | `ownershipOffers: { none: {} }` added to `emptyHouseholdWhere` (`lib/invite.ts`) | the new test: `AssertionError: expected [ { …(4) } ] to be undefined` (the fake's throw comes back in `res.errors`) |
| R2 | `checkOfferKind(row.kind)` removed from `checkOfferRow` (`householdFake.ts`) | 1: "create throws on a kind that is not in the OfferKind enum" |

**For K.3:** T49's claim "an offer in a one-person household cannot exist" holds only if
`removeMember` and `leaveHousehold` (`removeFromHousehold`) delete the offers TO the person
who goes. K.3 already plans it ("`removeFromHousehold` also deletes offers TO the person",
with a mutation check); this is one more reason it must not be dropped.

---

## Task K.2 — a deleted account does not count

**Files:** `apps/server/src/lib/authz.ts` and `authz.test.ts`,
`resolvers/location.resolver.ts` (`peopleOfLocation`), `resolvers/household.resolver.ts`
(`householdMembers`, `peopleWithLocationRole`), their tests, the fakes if `deletedAt` on the
`user` relation filter is not modelled.

- [x] **Step 1: failing tests** (T61). A household with an organizer whose `User.deletedAt` is
  set and whose member rows still exist (the pre-H6 shape, Y8):
  - `Location.hasOrganizer` is `false` for that location (`locationIdsWithOrganizer`); a
    second location with a live organizer stays `true`;
  - `locationPeople` and `householdMembers` do not list the deleted person;
  - a live organizer next to the deleted one keeps `hasOrganizer: true`.
- [x] **Step 2:** red. **Step 3:** ✅ add `deletedAt: null` to the `user` filter in
  `countedOrganizerIn`, and the same filter to the two lists. **Step 4:** ✅ the full gate.

**Mutation checks:** remove `deletedAt: null` from `countedOrganizerIn` → the `hasOrganizer`
test; from `peopleOfLocation` → its list test. (The owner's 2026-11-17 decision names the
first one; both must go red.)

**Done 2026-11-20** (commit `8989cc7f`). What was built:

| Place | What it does now |
|---|---|
| `countedOrganizerIn` (`lib/authz.ts`) | `user: { deletedAt: null, householdMemberships: { some: { householdId } } }`. `Location.hasOrganizer` is `false` for a location whose only organizer deleted their account |
| `peopleOfLocation` (`location.resolver.ts`) | the same `deletedAt: null` filter. `locationPeople` leaves out a deleted account |
| `householdMembers` (`household.resolver.ts`) | `where: { householdId, user: { deletedAt: null } }`. The Add person list on the location page is built on the web from this list (`AddPersonSection` in `routes/settings/household/locations/$id.tsx`), so it needs no change of its own |
| `roleOfPerson` (`location.resolver.ts`) | NOT changed, on purpose: a role write must see the role row that is really there, so a deleted person's leftover role can still be removed. Its comment says so |
| `householdFake` | models `user: { deletedAt: null }` on `LocationMember` (beside `householdMemberships`) and on `HouseholdMember` (a new key). Only `null` is accepted. The `User` rows come from a new `users` option; `householdWorld` passes `userFake`'s new `readableRows()`. It throws, once per call, when built without `users`, and for a row whose person has no `User` row |
| root `CLAUDE.md` | the `locationIdsWithOrganizer`, `householdMembers` and `locationPeople` rows name the filter |

Tests: 1 in `lib/authz.test.ts` (two locations in one household: one whose only organizer is
deleted, one with a live organizer beside the deleted one; plus a check before the delete), 3
in `location-people.resolver.test.ts` (each deletes ONE person and keeps a live person with
the same role: BOB beside AAA, also "Bob"; VIC on the members list; BEA, the only organizer
of LOC_K, beside NOA on LOC_G), 7 in `householdFake.test.ts`. Server **2589 → 2600** tests,
83 files. Web unchanged at **3615 / 360**.

| # | Mutation (file) | Red |
|---|---|---|
| M1 | `deletedAt: null` removed from `countedOrganizerIn` (`lib/authz.ts`) | 2: the authz test, `expected [ 'loc-a', 'loc-a-view' ] to deeply equal [ 'loc-a' ]`, and "a location whose only organizer deleted their account shows No organizer" (`hasOrganizer` of `loc_kitchen` stays `true`) |
| M2 | `deletedAt: null` removed from `peopleOfLocation` (`location.resolver.ts`) | 1: "user does not see a deleted account among the people of a location", `expected [ 'user_bea:organizer', …(4) ] to deeply equal [ 'user_bea:organizer', …(3) ]` |
| M3 | `user: { deletedAt: null }` removed from `householdMembers` (`household.resolver.ts`) | 1: "user does not see a deleted account on the members list", `expected [ 'user_owen', 'user_aaa', …(6) ] to not include 'user_vic'` |
| M4 | the fake's `accountLive` always returns `true` (`householdFake.ts`) | 7: the 4 tests above and 3 fake tests. A fake that ignores the key lets the resolver tests pass against wrong code |

Each mutation was undone from a saved copy and checked with `diff -q`.

**Review of K.2 (2026-11-20): approved.** No change to the K.2 code. What the review checked:

| Question | Answer |
|---|---|
| Other server reads that list or count people | None needs the filter. `requireHouseholdRole`, `requireLocationRole`, `locationRoleOf`, `locationRolesByLocation` and `shouldDeliver` read the CALLER's own rows; a deleted account cannot sign in. `setHouseholdRole`, `removeMember` and `roleOfPerson` must see a deleted person's row, or it can never be removed. `joinHousehold` reads the joiner's own memberships. `peopleWithLocationRole` only marks people already on the filtered list. `e2eCleanup` and `e2eHouseholds` are test routes |
| Web lists of people | Add person (`AddPersonSection` in `routes/settings/household/locations/$id.tsx`) is built from `householdMembers` minus `locationPeople`. No other source |
| A list with no owner row (a deleted owner) | Nothing crashes. `MemberList` and `memberActions` look at each row on its own; the page reads only `me`. The caller's own role comes from `usePermissions`, not from the list. A manager still sees Remove on `member` rows only |
| The fake | `user: { deletedAt: null }` is the only `deletedAt` value it accepts; `{ not: null }` throws. Prisma treats an `undefined` key as not named, and so does the fake. Re-ran mutation M1: 2 red, as reported. Re-ran the order: reading `deletedAt` BEFORE the membership turns 2 tests red, both with "no User row" throws (`authz.test.ts` "does not count an organizer who left the household (decision H18)" and the fake's own order test). So the order is a workaround for a `userFake` limit (an implied `User` row exists only for a person a member row has named during a read), not a semantic choice. It is harmless: both filters must pass, and a missing row throws, it never gives a wrong answer |

Fixed during the review, not part of K.2 (commit `92588efb`): the Offline story tests of
`routes/shopping/index.stories.test.tsx` and `routes/cooking.stories.test.tsx` asserted
`/hours ago/i` without `waitFor`. The banner reads its sync time in a `useEffect`, after
`findByRole('status')` has already resolved, so the check raced that read and lost under load.
It does not depend on the clock: 2 hours back rounds to "2 hours ago" in any timezone and on
any date. `routes/index.stories.test.tsx` got the same fix in `63f3b919`. Mutation:
`OfflineBanner` made to never show the stored time turns both tests red.

Gaps the review found, for K.4 or the O36 step:

- **A deleted person's leftover rows cannot be removed from the web.** They are hidden from
  the Members page and from the location people page, so there is no Remove button. They
  count for nothing that T61 covers, but they still make the household "not empty" for a
  join, and they keep the "only person" count of `ownerAlone` honest only because the list
  is filtered. K.4's hand-over and the O36 step remove them.
- **An open invite made by a deleted person still works**, and `invitePreview` shows their
  stored name as the inviter. K.4 should decide whether the hand-over revokes them.

---

## Task K.3 — transfer: the offer mutations

**Files:** `apps/server/src/schema/ownership.graphql` (new), `schema/index.ts`,
`resolvers/ownership.resolver.ts` and `ownership.resolver.test.ts` (new), `resolvers/index.ts`,
`resolvers/household.resolver.ts` (texts; `Household.hasOwner`, `.pendingTransfer`),
`lib/household.ts` (`removeFromHousehold` moved here and extended; `startHandover`),
`resolvers/live-publish.guard.test.ts`, `resolvers/purges.resolver.test.ts` (the race, with
the real accept).

- [x] **Step 1: failing tests** (two households; owner, manager, member; a person in both
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
- [x] **Step 2:** red.
- [x] **Step 3:** schema (T58, T59, T65) with comments; the resolvers; the texts in
  `household.resolver.ts`.
- [x] **Step 4:** the five mutations in the live guard: `offerOwnership`,
  `cancelOwnershipOffer`, `acceptOwnershipOffer`, `declineOwnershipOffer` → `publishes`
  `['LOCATION']`; `dismissOwnershipOffer` → `publishesNothing` ("only the caller's own
  banner changes; their other tabs update on the next refetch").
- [x] **Step 5:** `pnpm codegen` (check the output), `oldBundleCompat.test.ts`, the full gate.

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

**Done 2026-11-20** (commit `88e86e02`). Server only: no web document, hook or text changed
(those are K.5 and K.7). What was built:

| Place | What it does now |
|---|---|
| `schema/ownership.graphql` (new, the 15th `.graphql` file) | `enum OfferKind`, `type OwnershipOffer` (`id`, `householdId`, `householdName`, `kind`, `toUserId`, `toName`, `fromName`, `createdAt`, `dismissedAt`; names only, no e-mail), `extend type Household { hasOwner, pendingTransfer }`, `myOwnershipOffers`, and the five mutations. Only additions: `oldBundleCompat.test.ts` stays green |
| `resolvers/ownership.resolver.ts` (new) | the five mutations, `myOwnershipOffers`, and the two `Household` field resolvers. Every write: `lockHouseholdOrForbid` first, then the role and the offer read through `tx`, then the writes, then `recordActivity`. Accept, decline and dismiss read the offer once with the global client, ONLY to learn which household to lock, and again through `tx` after the lock; that second read is the one that counts |
| `lib/handover.ts` (new) | `removeFromHousehold` (moved from `household.resolver.ts`, now also deletes the offers TO the person, and calls `restartHandoverIfNeeded` when it deleted one), `restartHandoverIfNeeded` (T62), `startHandover` (the design's table, live accounts only; K.4 will call it) |
| `lib/authz.ts` | `countedOrganizerIds(householdId, tx)`: the people who organize a location, through `countedOrganizerIn` (H18, T61). The hand-over table reads it |
| `household.resolver.ts` | the texts "Transfer ownership first." (owner leaves) and "Use Transfer ownership." (`setHouseholdRole(role: owner)`); the last live person's leave deletes the household (O37-A, see *What this plan got wrong*). `household`, `renameHousehold` and `createHousehold` return through `householdAnswer` |
| `invite.resolver.ts` | `joinHousehold` returns through `householdAnswer` (a cast; the two new fields come from field resolvers) |
| `live-publish.guard.test.ts` | `offerOwnership`, `cancelOwnershipOffer`, `acceptOwnershipOffer`, `declineOwnershipOffer` in `publishes` (`LOCATION`), `dismissOwnershipOffer` in `publishesNothing`. **81** fields: 78 and 3 (it was 76: 74 and 2) |

Rules the code follows that the plan did not spell out:

| Case | Answer |
|---|---|
| `offerOwnership` to the person who already has the open transfer offer | that offer back; no row, no event (like H5c T38) |
| `offerOwnership` to a member whose account is deleted | `FORBIDDEN`, the same as a non-member (T61) |
| accept, decline or dismiss of an offer deleted BEFORE the request | `FORBIDDEN`, the same as an unknown id. Only an offer that is there before the lock and gone after it gives `OFFER_GONE` (accept) or `false` (decline, dismiss) |
| `OWNERSHIP_ACCEPTED` | `targetUserId` = the old owner (null for a hand-over), `details: { kind }` |
| `OWNERSHIP_OFFERED`, `OWNERSHIP_OFFER_CANCELLED` | `targetUserId` = the person offered, `details: { kind: 'transfer' }` |
| `OWNERSHIP_DECLINED` | `targetUserId` = the owner who offered (null for a hand-over), `details: { kind }` |
| a second dismiss | `true`, keeps the first `dismissedAt` |
| `myOwnershipOffers` order | oldest first by `createdAt`, then `id`, sorted in the resolver (the fake has no `orderBy`) |
| `Household.pendingTransfer` | reads the `role` the parent resolver already read for this caller; `null` unless it is `owner` |

Tests: `ownership.resolver.test.ts` (new, **63**) and 3 in `purges.resolver.test.ts` (the race
with the REAL accept, both orders). Fixture: three households; OWEN owns hh_1, MIA manager,
BOB member, BEA member of hh_1 and manager of hh_2 (acts in hh_1), DEX a member with a deleted
account who organizes a location, YUKI owns hh_2 with an open transfer offer to BEA, hh_3 has
no owner and one live person (PAT). Server **2600 / 83 → 2666 / 84**. Web unchanged at
**3615 / 360**, `scripts/spec` **70**.

| # | Mutation (file) | Red |
|---|---|---|
| M1 | promote before demote in accept (`ownership.resolver.ts`) | 9 (6 in the new file, 3 race tests): the order test fails with `Unique constraint failed: HouseholdMember_one_owner_key — HouseholdMember (hh_1)` |
| M2 | accept skips the "offer still exists" read after the lock | 1: "the first accept wins; the second gets OFFER_GONE", `expected undefined to be 'BAD_USER_INPUT'` (BEA became the owner) |
| M3 | accept leaves the other offers | 4, among them "user can accept the household" and the `OFFER_GONE` race |
| M4 | any member may accept (`toUserId` dropped from both offer reads) | 3: "… cannot accept, decline or dismiss it: the same FORBIDDEN as an unknown id" (owner, manager, stranger) |
| M5 | `removeFromHousehold` keeps the offers to the person (`lib/handover.ts`) | 5: the leave and removal tests, and the three T62 tests |
| M6 | `removeFromHousehold` does not call `restartHandoverIfNeeded` | 2: T62 after a leave and after a removal, `expected [] to deeply equal [ 'hh_1:user_bea:handover:-' ]` |
| M7 | `declineOwnershipOffer` does not call `restartHandoverIfNeeded` | 2: T62 after a decline, and the "nobody else is left" case |
| M8 | the lock after the role read in `offerOwnership` | 1: its order test, `Expected: "lock:hh_1" / Received: "role"` |
| M9 | `startHandover` counts deleted accounts (`deletedAt: null` dropped) | 1: "when nobody else is left …" (DEX got the offer) |
| M10 | the last person's leave never deletes (O37-A) | 1: "household manager who is the last live person deletes it by leaving" |
| M11 | the replace in `offerOwnership` not scoped to the household | 6: hh_2's offer to BEA is deleted |
| M12 | `pendingTransfer` for every role | 2: the manager and member cases |
| M13 | a decline restarts the hand-over WITHOUT skipping the decliner | 2: MIA got her own offer back |
| M14 | accept leaves `ownerGoneAt` set | 3, among them "user can accept a hand-over: ownerGoneAt goes back to null" |

Each mutation was applied by a script to the file, run against `ownership.resolver.test.ts`,
`purges.resolver.test.ts` and `household-members.resolver.test.ts`, and undone from a saved
copy; `diff -q` gave 0 every time. The race tests rest on `serialTransactions(true)`: the fake
has no row lock, so they show that each order ends right, not that Postgres waits (K.8 proves
that on real SQL).

**Review (2026-11-20).** No blocking issue. One test gap, fixed in the review commit:

| Gap | Fix |
|---|---|
| The LAST row of the hand-over table ("no manager, nobody organizes → every member") was reached by no test. Making that branch `return []` left all 840 tests of `src/resolvers` and `src/lib` green: the one test that came near (PAT in hh_3) has nobody else, so `byTable` returns early | New test in `ownership.resolver.test.ts`: "with no other manager and no organizer here, every other live member gets the offer". BEA organizes only LOC_Z of hh_2, DEX (deleted) organizes LOC_2; MIA declines; BEA and BOB get offers, DEX does not |

| # | Mutation | Red |
|---|---|---|
| R1 | the last row of `byTable` returns `[]` (`lib/handover.ts`) | 1, the new test: `expected [ 'hh_1:user_mia:handover:-' ] to deeply equal [ 'hh_1:user_bea:handover:-', …(1) ]` (MIA got her offer back, dismissed) |
| R2 | `countedOrganizerIn` without `location: { householdId }` (`lib/authz.ts`) | in `ownership.resolver.test.ts`, 1, the new test: `expected [ 'hh_1:user_bea:handover:-' ] to deeply equal [ 'hh_1:user_bea:handover:-', …(1) ]`. No earlier K.3 test saw it |
| R3 | `leaveHousehold`'s last-person path without its `tx.user.updateMany` (`household.resolver.ts:414`) | **0 of 1556** in `src/resolvers`. Not a bug: `User.activeHouseholdId` is `onDelete: SetNull`, so the household delete clears the same rows, in the fake and in Postgres. The explicit write is redundant, not wrong |

Server **2666 / 84 → 2667 / 84**.

---

## Task K.4 — the hand-over in `handleClerkEvent`

**Files:** `apps/server/src/lib/clerkWebhook.ts` and `clerkWebhook.test.ts`,
`lib/household.ts` (`startHandover`, `deleteHouseholdData`), `lib/e2eUsers.ts` (comment only),
`src/test/householdWorld.ts` if a `User` store with `deletedAt` is missing.

- [x] **Step 1: failing tests**, one per row of the design's table (T60), each with a SECOND
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
- [x] **Step 2:** red.
- [x] **Step 3:** the branch, through `startHandover` and `deleteHouseholdData`. Update the
  comment of `handleClerkEvent` (it says "H6 adds the household hand-over here").
- [x] **Step 4:** the full gate.

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

**Done 2026-11-20** (commits `9c23604a`, `0d78f5bc`). Server only: no schema, no
migration, no web file. The tests were written FIRST: 15 of the 17 new tests were red
against the old code. The other 2 ("the same event twice" and "an id with no `User` row")
passed against the old code too, because the old code did nothing with households. They
are negative controls; mutations M7 and M8 below are what make them evidence.

| Place | What it does now |
|---|---|
| `lib/clerkWebhook.ts` | `user.deleted`: ONE transaction, run once more on `P2034` (`retryOnceOnConflict`), with the 15 s timeout. Its first write is the `User` upsert (the `lockUser` of T16): `update` writes only `updatedAt`, and `deletedAt` is set only when it is still null, so a repeated event keeps the first date. Then `handOverDeletedAccount`. After the commit, one household-level `LOCATION` per household it returns, through `publishHouseholdChange({ userId: null }, …)`, so no `sourceClientId` |
| `lib/handover.ts` | `handOverDeletedAccount(tx, userId, now)`: reads the person's memberships, `lockHouseholds` on all (sorted), then per household in sorted order reads the role again through `tx`. Manager or member: `removeFromHousehold` + `ACCOUNT_DELETED`. Owner with no other member whose account is live: `deleteHouseholdData` + `household.deleteMany`, no event. Owner with others: their location roles and member row go, `ownerId: null`, `ownerGoneAt: now`, every offer of the household goes, `startHandover` (offers + `HANDOVER_STARTED`). Returns the households that still exist and changed |
| `lib/household.ts` | `retryOnceOnConflict` moved here from `resolvers/invite.resolver.ts`, so a lib file does not import a resolver |
| `lib/publishChange.ts`, `lib/e2eUsers.ts` | comments only |
| `clerkWebhook.test.ts`, `e2eUsers.test.ts` | their `prisma` mock is now the household world, because `user.deleted` opens a transaction. No test changed |

Rules the code follows that the plan did not spell out:

| Case | Answer |
|---|---|
| the `ACCOUNT_DELETED` row | `actorId` = the deleted person (T50), `targetUserId: null`, no `details` (T51 gives no shape) |
| the deleted OWNER's open invites | they stay open. Not decided; see *Owner questions after K.4* below |
| a deleted manager who had the LAST hand-over offer of an ownerless household | `removeFromHousehold` runs T62, so the next people get offers, and the log gets `HANDOVER_STARTED` as well as `ACCOUNT_DELETED`, in the same transaction, same `createdAt` |
| the person left a household between the first read and the lock | that household is skipped |
| `deletedAt` on a repeated event | the first date stays (H2 used to move it to the time of each delivery) |

Tests: `lib/clerkWebhook.handover.test.ts` (new, **17**). Fixture: hh_2 (YUKI owner, BEA
manager, an open transfer offer to BEA, an open invite by BEA) must not change; hh_1 is built
per test with OWEN as owner and DEX, a member whose account is already deleted and who
organizes LOC_1; hh_3 has no owner for the T62 case. Server **2667 / 84 → 2684 / 85**. Web
unchanged at **3615 / 360**, `scripts/spec` **70**.

Each mutation was applied by a script with an exact unique match or a line number, run
against `clerkWebhook.handover.test.ts`, `clerkWebhook.test.ts`, `e2eUsers.test.ts` and
`ownership.resolver.test.ts` (121 tests), and undone from a saved copy; `diff -q` gave 0
every time.

| # | Mutation (file) | Red |
|---|---|---|
| M1 | the "only person" count without `user: { deletedAt: null }` (`handover.ts`) | 1: "the owner was the only LIVE person …", `expected [ 'hh_1', 'hh_2' ] to deeply equal [ 'hh_2' ]` |
| M2 | offers to every candidate when managers exist (`byTable`) | 3: the managers row, the T63 row, and K.3's T62 test |
| M3a | `countedOrganizerIn` without the H18 membership (`authz.ts`) | **0 of 121**. See *What this plan got wrong*: this mutation cannot change the hand-over's answer |
| M3b | `countedOrganizerIn` without `location: { householdId }` | 3: the two "no managers" rows (CAL organizes a location of hh_2) and K.3's last-row test |
| M4 | the hand-over before the `User` upsert (`clerkWebhook.ts`) | 1: the lock-order test, `expected [ 'lock:hh_1', 'lock:hh_2', … ] to deeply equal [ 'user:user_owen', 'lock:hh_1', … ]` |
| M5 | the household delete without `deleteHouseholdData` | 1: "the household and all its data are deleted", `expected [] to deeply equal ArrayContaining{…}`. Red only on the RECORDED calls: the world's `household.deleteMany` cascades the rows itself, so the data assertions alone stay green. K.8 proves the delete on real SQL |
| M6 | `ownerGoneAt` not set | 1: the managers row, `to match object { ownerId: null, …(1) }` |
| M7 | the owner's member row kept (no idempotence guard: a second event hands over again) | 3, among them "the same event twice", `expected { users: …, … } to deeply equal …` |
| M8 | `deletedAt` written on every delivery | 1: "a later delivery keeps the first deletedAt", `expected 2026-11-20T13:00:00.000Z to deeply equal 2026-11-20T12:00:00.000Z` |
| M9 | no retry on `P2034` | 1: "on the first try: one retry, one set of rows", `Error: write conflict` |
| M10 | an event for a deleted household too | 3: both "only person" tests and "the only person of one household and a manager of another" |
| M11 | no `ACCOUNT_DELETED` row | 3 |
| M12 | `lockHouseholds` without `.sort()` (`household.ts`) | 1: the lock-order test, `[ 'user:user_owen', 'lock:hh_2', … ]` (the member rows are seeded hh_2 first on purpose) |
| M13 | the per-household loop in reverse order | 1: the same test, on the order of the two events |

Not proved by any unit test: the role read again AFTER the lock (the fake has no row lock,
so no test can put a change between the two reads), and that Postgres really waits on the
`User` row and the household rows. K.8 runs the hand-over on real SQL.

**K.4 review (2026-11-20).** One fix. The "no other live person" rule ran for the OWNER
only. A deleted manager or member who was the last live person of a household with no live
owner (a hand-over nobody accepted, or an owner whose account was deleted before H6) was
removed, and the household stayed with nobody live in it and no way to get an owner: O37
option C, which the owner rejected. `leaveHousehold` already deletes in that case (O37-A,
K.3). Now `handOverDeletedAccount` checks the live people FIRST, for every role, and deletes
the household with `deleteHouseholdData` when nobody else is live; no event, as for the
owner. Two new tests in `clerkWebhook.handover.test.ts` (an ownerless household; a household
whose owner account was deleted before H6). The existing T62 test (PAT is still live) is the
negative control and stays green. Server tests **17 → 19** in that file.

| # | Mutation (file) | Red |
|---|---|---|
| R1 | the live check only for the owner again: `row.role === 'owner' && !live.some(…)` (`handover.ts`) | 2: both new tests, `expected [ 'hh_1', 'hh_2', 'hh_3' ] to deeply equal [ 'hh_1', 'hh_2' ]` |
| R2 | the owner branch without `tx.locationMember.deleteMany` (`handover.ts`) | 1: the managers row, `expected true to be false` |
| R3 | the event published with a `clientId` (`clerkWebhook.ts`) | 6: every test that expects an event, because the event then carries `sourceClientId` |

The reviewer agrees M3a cannot go red: the table only offers to members of the household,
and every member passes the H18 membership clause on that household's own locations.

**Owner questions after K.4** (nothing below was built; the code keeps the behaviour shown):

| # | Question | What the code does now |
|---|---|---|
| (new, after O42) | When the OWNER's account is deleted and the household is handed over, should the open invites the owner made be revoked, like a removed manager's (O20)? | They stay open. A person can still join with one, and `invitePreview` shows the deleted owner's stored name as the inviter. |
| (new) | Accounts deleted BEFORE this code runs: no event comes again, so their member rows, location roles, open invites and owner rows stay (the K.2 review gaps). Does the O36 step remove them by running the same hand-over for each? | Nothing. T61 hides them from every list and count, but they keep a joiner's household "not empty" (`emptyHouseholdWhere`), their invites still work, and a household whose owner was deleted before H6 keeps `ownerId` set and is never handed over |

---

## Task K.4b — revoke a deleted owner's open invites (owner decision O43)

**Files:** `apps/server/src/lib/handover.ts`, `apps/server/src/lib/clerkWebhook.handover.test.ts`. Commit `17c80c59`.

- [x] **Step 1: failing tests.** New block `a deleted owner's invites (O43)`, 3 tests. Hand-over branch fixture: OWEN's open, used and earlier-revoked invites in hh_1; MIA's open invite in hh_1; OWEN's open invite in hh_2 (OWEN is a manager there); OWEN's open invite in hh_3 (OWEN is not a member); BEA's invite in hh_2. Repeat delivery keeps the first `revokedAt`. Household-deleted branch: a cascade negative control. Result: 2 red, 1 green (the control).
- [x] **Step 2:** in the owner branch of `handOverDeletedAccount`, after the location roles and before the member row: `tx.householdInvite.updateMany({ where: { householdId, createdById: userId, usedAt: null, revokedAt: null }, data: { revokedAt: now } })`. The household-deleted branch needs no write: `HouseholdInvite.household` is `onDelete: Cascade`.
- [x] **Step 3:** the role table in the comment names the revoke in the owner row; the "NOT DONE HERE" item is gone.
- [x] **Step 4: mutation checks**, each red, then restored from a copy:

| Mutation | Red tests |
|---|---|
| `createdById` dropped from the owner-branch `where` | 2 |
| `householdId` dropped | 2 |
| `revokedAt: null` dropped | 1 |
| `usedAt: null` dropped | 1 |
| the owner-branch revoke deleted | 2 |
| the revoke in `removeFromHousehold` deleted | 4 (the hh_2 path stays guarded) |

- [x] **Step 5: gate.** Root `pnpm lint`, `pnpm build` (no `TS6385`), `pnpm check`, `pnpm test`: server 2689 / 85, web 3664 / 361, spec 70.

---

## Task K.5 — web: documents, hooks and permissions for offers

**Files:** `apps/web/src/apollo/operations/ownership.graphql` (new),
`operations/household.graphql` (`hasOwner`, `pendingTransfer` in `GetHousehold`),
`hooks/useOwnershipOffers.ts` and test (new), `hooks/usePermissions.ts` and test,
`hooks/CLAUDE.md`, `apollo/liveUpdates.ts` (comment table), `hooks/refetchPending.cloud.test.tsx`.

- [x] **Step 1: failing tests:** `useMyOwnershipOffers()`; the five write hooks (variables,
  `refetchAfterWrite` of `MyOwnershipOffers`, `GetHousehold`, `HouseholdMembers`; a failed
  refetch does not reject; a shared promise per arguments; `isPending` until the refetch
  lands); `usePermissions().canTransferOwnership` (owner, cloud); `hasOwner` exposed.
- [x] **Step 2:** red.
- [x] **Step 3:** the documents and hooks. `GetHousehold` gains two fields, so **grep every
  `GetHousehold` mock** in the web tests and stories and add them (an Apollo result missing
  a selected field reads back as incomplete: the H5a F.1 trap; `tsc` does not see an untyped
  mock, root `CLAUDE.md`).
- [x] **Step 4:** the full gate.

**Mutation checks:** `awaitRefetchQueries: true` → "a failed refetch does not reject"; no
shared promise → the double-press test; `canTransferOwnership` true for a manager → its test.

**Done 2026-11-20** (`93d6941f`). What was built:

| Part | What |
|---|---|
| `apollo/operations/ownership.graphql` (new) | fragment `OwnershipOfferFields`, query `MyOwnershipOffers`, mutations `OfferOwnership`, `CancelOwnershipOffer`, `AcceptOwnershipOffer`, `DeclineOwnershipOffer`, `DismissOwnershipOffer`. The accept answer selects the same fields as `GetHousehold` |
| `GetHousehold` | `hasOwner` and `pendingTransfer { ...OwnershipOfferFields }` |
| `hooks/useOwnershipOffers.ts` (new) | `useMyOwnershipOffers`, the five write hooks, `isOfferGoneError` |
| `hooks/usePermissions.ts` | `canTransferOwnership`: household `owner`, cloud, not while the role loads |
| `apollo/liveUpdates.ts` | `MyOwnershipOffers` in `CATALOG`; the comment table has its row and `GetHousehold`'s new fields |
| `hooks/CLAUDE.md` | the offer hooks, `useHousehold`'s new fields, `canTransferOwnership`, eighteen `isPending` hooks |
| 40 test and story files | every `GetHousehold` mock carries `hasOwner: true, pendingTransfer: null` |

What each write reads again (the acting tab gets no live event):

| Hook | Reads again | A gone offer |
|---|---|---|
| `offer(userId)`, `cancel()`, `decline(id)`, `dismiss(id)` | `MyOwnershipOffers`, `GetHousehold`, `HouseholdMembers`, as documents (mounted ones only) | decline and dismiss: `false`, lists read anyway |
| `accept(id)` | every active query (`'active'`) | `OFFER_GONE` or `FORBIDDEN`: the three lists, THEN the rejection; any other refusal reads nothing |

`hasOwner` is exposed through `useHousehold().data` (two real-cache tests in
`useOwnershipOffers.test.tsx`), not through `usePermissions`: K.7 reads it as data, and no
right depends on it.

Tests: `hooks/useOwnershipOffers.test.tsx` (new, **35**, real Apollo through
`MockedProvider`, with `GetLocations` mounted as a list that is NOT an offer list), 10 in
`hooks/refetchPending.cloud.test.tsx` (5 hooks × 2), 4 in `hooks/usePermissions.test.tsx`, 1
line in `apollo/liveUpdates.test.ts`. Web **3615 / 360 → 3664 / 361**. Server unchanged at
**2686 / 85**, `scripts/spec` **70**. Measured at `406738e6` before and on the K.5 tree
after, each `pnpm test` run alone. (The "before" run overlapped one `pnpm codegen` of the new
documents; it was fully green, so nothing it could have changed is hidden.)

The hooks were written before their tests in this task, so Step 2's "red" is the mutation
table below, not a first run.

**Mutation checks**, each applied by a script with an exact unique match, run against its
test file, and undone from a saved copy (`diff -q` clean every time):

| # | Mutation (file) | Red |
|---|---|---|
| M1 | decline through the mutation's `refetchQueries` with `awaitRefetchQueries: true`, no `refetchAfterWrite` | 1: "a write that worked resolves when the lists cannot be read again" (decline) |
| M2 | accept without `once` | 1: "a second press while the first runs sends nothing and shares its promise" (accept) |
| M3 | `canTransferOwnership` true for a manager (`usePermissions.ts`) | 1: "household manager: canTransferOwnership false" |
| M3b | `canTransferOwnership` true while the role loads | 1: "cloud allows no transfer while the household role loads, or when it failed" |
| M4 | accept reads only the three lists, not `'active'` | 1: "user can accept an offer, and every list on screen is read again" |
| M5 | a gone accept reads nothing | 2: both "user who accepts a gone offer …" tests (`OFFER_GONE` and `FORBIDDEN`) |
| M6 | `isOfferGoneError` ignores `FORBIDDEN` | 1: the `FORBIDDEN` case of the same test |
| M7 | `offer` reports `isPending: loading` only | 2: both `useOfferOwnership` cases in `refetchPending.cloud.test.tsx` |
| M8 | `MyOwnershipOffers` taken out of `CATALOG` (`liveUpdates.ts`) | 1: "CATALOG refetches every query that selects a catalog field" |
| M9 | dismiss reads nothing after the write | 2: "sends the write once …, then reads the three offer lists again" and "… when the offer is already gone" (dismiss) |

The missing-field trap, measured (the two fields removed from one file at a time, then
restored): `HouseholdNameCard.apollo.test.tsx` **1 of 1 red**; `useActiveLocation.lostAccess.test.tsx`
(18 green, 32 `Missing field 'hasOwner'` warnings), `locations/$id.cloud.test.tsx` (31 green,
166 warnings), `useLocations.test.tsx` (23 green, 5 warnings) and `members.cloud.test.tsx`
(33 green, no warning). So a missing field is usually a warning, not a red test. After K.5
the full web run prints **0** such warnings.

**The gate (K.5), 2026-11-20, Node 22.17.1, each command alone:** `pnpm lint` exit 0;
`pnpm build` exit 0, `grep TS6385` finds nothing; `(cd apps/web && pnpm build-storybook)`
exit 0; `pnpm check` exit 0 (first run: 1 import-order error in `useOwnershipOffers.ts`,
fixed); `pnpm test` exit 0 (numbers above). No E2E (K.8).

**Review (2026-11-20, `838b2f45`).** One bug fixed. Decline and dismiss of an offer that
was already gone rejected with `FORBIDDEN` and read nothing, so the banner kept the offer.
The server reads the offer before its lock (`householdOfMyOffer`) and answers an unknown
id with `FORBIDDEN`. Only an offer that goes between that read and the lock gives
`false`. New helper `answerOffer` in `useOwnershipOffers.ts`: on `isOfferGoneError` it
reads the three offer lists, then rethrows. Accept, decline and dismiss use it.
`isOfferGoneError` is for those three only. For `offer` and `cancel`, `FORBIDDEN` means
"not the owner" or "not a member". 4 new tests. Web 3664 / 361 → 3668 / 361.

| # | Mutation (file) | Red |
|---|---|---|
| R1 | `answerOffer` reads nothing on a gone error | 4: decline, dismiss, and both accept "gone" tests |
| R2 | decline without `answerOffer` | 1: "user who answers a gone offer sees the lists read again, then the refusal" (decline) |

Checked and fine: a person offered their OTHER household gets the `LOCATION` event
(`shouldDeliver` checks membership of the event's household), so the K.6 banner updates
live. The accept answer and `GetHousehold` select the same fields. The 40 mock edits match
the generated type. The 4 files without `hasOwner` stub `useGetHouseholdQuery` with
`data: undefined`. The server schema comment that said "False when it is already gone"
was corrected after the review.

K.6 and K.7: show "no longer open" when Decline or Not now rejects with
`isOfferGoneError`, not only Accept.

---

## Task K.6 — web: the offer banner

Needs owner decision **O39** (texts).

**Files:** `apps/web/src/components/household/OwnershipOfferBanner/` (component, `index.ts`,
stories, smoke, unit test), `routes/__root.tsx`, the locale files, `components/CLAUDE.md`.

- [x] **Step 1: failing tests:** a `handover` offer shows "The owner of {household} is gone.
  Do you want to become the owner?" with **Accept** and **Not now**; a `transfer` offer
  shows "{name} wants to make you the owner of {household}." with **Accept** and
  **Decline**; a dismissed offer does not show; two offers show two banners; Accept then
  shows a short success message; a failed write shows the error and keeps the banner; cloud
  only; nothing in local mode; the banner is a `role="region"` with a label, so axe finds it.
- [x] **Step 2:** red. **Step 3:** the component beside `OfflineBanner` in `__root.tsx`.
- [x] **Step 4:** stories (handover, transfer, two offers, error) and smoke tests; the full
  gate.

**Mutation checks:** dismissed offers shown → its test; **Decline** on a `handover` offer →
the handover test (it must say **Not now**).

**Done 2026-11-20** (`fee8368f`). What was built:

| Part | What |
|---|---|
| `components/household/OwnershipOfferBanner/` (new) | the component, `index.ts`, a unit test (17 tests), 4 stories and their smoke test (4 tests) |
| `routes/__root.tsx` | `{mode === 'cloud' && <OwnershipOfferBanner />}` beside `OfflineBanner`, outside `NoHouseholdGate` |
| `routes/__root.ownershipOffer.test.tsx` (new) | 2 tests: mounted in cloud, not in local |
| `i18n/locales/en.json`, `tw.json` | `ownership.*`, 10 keys each: the 6 O39 texts and 4 new ones (`banner.label`, `gone`, `failed`, `close`) |
| `test/setup.ts` and 4 test files | stubs for `useMyOwnershipOffersQuery` and the accept, decline and dismiss mutation hooks |
| `components/CLAUDE.md` | the banner, the trap with per-file factories, the `<Suspense>` need |

What the banner does after an answer:

| Result | Shows |
|---|---|
| accept worked | the notice `ownership.accepted` with the household name from the server's answer |
| decline or Not now worked | nothing; the offer leaves the list |
| gone: `isOfferGoneError` (accept, decline, Not now), or `false` from decline or Not now | the notice `ownership.gone` |
| `OfflineWriteError` | nothing (the offline link already showed a toast) |
| any other error | `ownership.failed` as `role="alert"` under the offer; the offer stays |

A notice is an `<output>` (role `status`) that takes the focus, with a **Close** button. The
region is a `<section aria-label="Ownership offers">`. While an answer is sent, all buttons
of that offer are disabled.

Tests: web **3668 / 361 → 3691 / 364** (+17 unit, +4 smoke, +2 root). Server unchanged at
**2689 / 85**, `scripts/spec` **70**. Measured at `1eb52de5` before and on the K.6 tree
after, each `pnpm test` run alone. The component was written before its tests in this task,
so Step 2's "red" is the mutation table below, not a first run.

**Mutation checks**, each applied by a script with an exact unique match, run against its
test file, and undone from a saved copy (`diff -q` / `filecmp` clean every time):

| # | Mutation (`OwnershipOfferBanner.tsx` unless named) | Red |
|---|---|---|
| M1 | dismissed offers shown (no `dismissedAt === null` filter) | 3: "one row per open offer … not the dismissed one", "only has a dismissed offer sees no banner", "can say Not now …" |
| M2 | Decline on a `handover` offer (the kind check never matches) | 4: "hand-over offer with Accept and Not now, never Decline", "can say Not now …", both "Not now on an offer that is gone" cases |
| M3 | a gone error is treated as any other error | 4: the four `FORBIDDEN` / `OFFER_GONE` cases (Accept ×2, Decline, Not now) |
| M4 | decline's `false` shows no notice | 1: "Decline on an offer that is gone (false)" |
| M4b | Not now's `false` shows no notice | 1: "Not now on an offer that is gone (false)" |
| M5 | `OfflineWriteError` shows the inline error | 1: "user who is offline sees no second error here" |
| M6 | buttons never disabled | 1: "user cannot press the answers again while one is being sent" |
| M7 | the notice does not take the focus | 7: the accept test and the six "gone" cases |
| M8 | the banner's own `mode !== 'cloud'` check removed | **0 — stays green.** `useMyOwnershipOffers` skips its query in local mode, so the list is empty either way. The check is a second guard; it also keeps the three mutation hooks from mounting in local mode. Recorded, not counted as coverage |
| M9 | `__root.tsx` mounts the banner in local mode too | 1: "is not mounted in local mode" (`__root.ownershipOffer.test.tsx`) |
| M10 | accept shows no notice | 2: "can accept an offer and is told …", "cannot press the answers again …" (its end waits for the notice). The first run also failed 2 unrelated tests at load average ~8; run again alone at ~3, only these 2 |

The "only a dismissed offer" and "local mode" tests check the absence AFTER a probe of the
same query shows the list has loaded (`OfferCountProbe`), so a loading state cannot pass them.

**The gate (K.6), 2026-11-20, Node 22.17.1, each command alone:** `pnpm lint` exit 0 (13
warnings in `e2e/`, the known ones); `pnpm build` exit 0 (first run: exit 2, `TS2322` in the
new test, mock `query` typed `unknown`; fixed to `DocumentNode`), `grep TS6385` finds nothing;
`(cd apps/web && pnpm build-storybook)` exit 0, and `storybook-static/index.json` lists
`components-household-ownershipofferbanner--handover`, `--transfer`, `--two-offers`,
`--accept-fails`; `pnpm check` exit 0 (first run: 3 format errors in the new files, fixed);
`pnpm test` exit 0 (numbers above). The "Could not find client" warning count in the full run
is 6, the same as before. No E2E (K.8).

**Review (2026-11-20, `985ee365`, `aca278d5`).** Approved after two fixes.

1. **Same button names.** With two offers, two buttons were both named "Accept", and nothing
   said which household each was for. Each Accept, Decline and Not now button now has
   `aria-describedby` pointing at its offer text. The name stays the visible word. 1 new test.
2. **False stub comment.** The `setup.ts` comment said every cloud root render reaches the four
   offer hooks. Only the query stub is reached. The stubs return no offer, so the three
   mutation stubs are called by no test. The comment and `components/CLAUDE.md` are corrected.
   The stubs stay.

Web 3691 / 364 → 3692 / 364. Server 2689 / 85. `scripts/spec` 70.

| # | Mutation | Red |
|---|---|---|
| R1 | `setup.ts` query stub throws | 23 in 7 files |
| R2 | `setup.ts` accept stub throws | **0**: not reached (recorded, not coverage) |
| R3 | the 4 per-file query stubs throw | 37 in 4 files |
| R4 | the 4 per-file accept stubs throw | **0**: not reached |
| R5 | M7 again: the notice does not take the focus | 7 |
| R6 | Accept loses `aria-describedby` | 1: "user of a screen reader hears which household each answer is for" |
| R7 | the offer text loses its `id` | 1: the same test |
| R8 | no `setFailed(false)` before an answer | **0**: gap, not tested |
| R9 | Accept not disabled while Not now runs | **0**: gap, not tested |

Checked and fine: the mount outside `NoHouseholdGate` (a person in no household has no
offers); the banner sits in `<main>` like `OfflineBanner`; focus moves to the notice after the
region unmounts and mounts again; the O39 texts match; M8 stays green for the stated reason.
Owner question O45 (the hand-over wording "is gone" / 「已經不在了」, which can read as "has
died") was asked after this review.

---

## Task K.7 — web: the Members page

Needs owner decisions **O37** and **O39**.

**Files:** `components/household/MemberList/MemberList.tsx` and tests and stories,
`routes/settings/household/members.tsx`, `members.cloud.test.tsx`, `members.stories.tsx`, the
locale files, `routes/settings/CLAUDE.md`.

- [x] **Step 1: failing tests:**
  - an owner sees **Transfer ownership** on every other row; it asks first; after it, the row
    shows "Waiting for {name} to accept" and **Cancel**;
  - a person with an offer in this household sees **Become the owner** (also after "Not
    now") and can accept here;
  - with no owner, everyone sees "This household has no owner." and the people with an offer
    see the button;
  - the owner's own row says why they cannot leave ("Transfer ownership first");
  - with O37-A, the LAST person of a household with no owner sees a Leave confirm that says
    the household and its data will be deleted.
- [x] **Step 2:** red. **Step 3:** the controls; `memberActions` gains the transfer column;
  its comment table is updated. **Step 4:** stories and the full gate.

**Mutation checks:** Transfer shown to a manager → its test; the waiting row without Cancel
→ its test; the no-owner note shown when there is an owner → its test.

**Done 2026-11-20** (`96e0f8e1`). What was built:

| Part | What |
|---|---|
| `components/household/MemberList/MemberList.tsx` | `memberActions` returns `canTransfer` (owner, every row but their own). New props `householdName`, `onTransfer`, `onCancelTransfer`, `pendingTransfer`, `transferBusy`, `lastPerson`. A `TransferButton` (an `AlertDialog`, not a `DeleteButton`: nothing is deleted) and a `WaitingForAccept` line with Cancel. While an offer is pending, no row shows Transfer. A pending offer to a person not in the list shows in an extra row, so the owner can still cancel it. The owner's own row says `ownerCannotLeave`. With `lastPerson`, the Leave confirm says `lastLeaveWarning` |
| `routes/settings/household/members.tsx` | reads `useHousehold()` (`name`, `hasOwner`, `pendingTransfer`), `useMyOwnershipOffers()`, the offer, cancel and accept hooks, and `canTransferOwnership`. `OwnershipNotes` above the list: "This household has no owner." and **Become the owner** for an offer of THIS household (filtered by `householdId`; a dismissed offer counts, O42-A). Answers are toasts: `ownership.accepted`, `ownership.gone`, `ownership.failed`, none for `OfflineWriteError`. A cancel that answers `false` shows `ownership.gone`. `lastPerson` is "only me in `householdMembers`" (live accounts only), the server's O37-A rule |
| `i18n/locales/en.json`, `tw.json` | `settings.household.members.*`: 9 new keys, 1 changed (`ownerCannotLeave`) |
| `test/cloudRoleStory.tsx` | `cloudRoleBaseMocks(role, ownership)` and `CloudRolePage`'s `ownership` prop set `hasOwner` and `pendingTransfer` |
| stories | `MemberList`: `AsOwnerWaitingForAccept`, `AsLastPerson`. Page: `OwnerWaitingForAccept`, `NoOwnerBecomeOwner`, `LastPersonLeaves` (with a `play` that opens the Leave confirm) |
| `routes/settings/CLAUDE.md`, `components/CLAUDE.md` | the ownership table on the Members page, the new `MemberList` props |

Texts (O39-A where O39 had them):

| Key (`settings.household.members.`) | English | `tw` |
|---|---|---|
| `transfer` (O39) | Transfer ownership | 轉移擁有權 |
| `transferLabel` (new: the button's name) | Transfer ownership to {{name}} | 把擁有權轉移給 {{name}} |
| `transferConfirm` (O39) | Offer {{household}} to {{name}}? You become a manager when they accept. | 要把 {{household}} 交給 {{name}} 嗎？對方接受後，你會變成管理者。 |
| `waiting` (O39) | Waiting for {{name}} to accept | 等待 {{name}} 接受 |
| `cancelOffer` (O39) | Cancel | 取消 |
| `cancelOfferLabel` (new: the button's name) | Cancel the offer to {{name}} | 取消給 {{name}} 的邀請 |
| `becomeOwner` (O39) | Become the owner | 成為擁有者 |
| `noOwner` (O39) | This household has no owner. | 這個家庭沒有擁有者。 |
| `ownerCannotLeave` (changed; O39 said "Transfer ownership first.") | The owner cannot leave. Transfer ownership first. | 擁有者不能離開。請先轉移擁有權。 |
| `lastLeaveWarning` (O39, O37-A) | You are the last person here. Leaving deletes the household and everything in it. | 你是這裡的最後一個人。離開會刪除這個家庭和裡面的所有東西。 |

Reused: `ownership.banner.transfer`, `ownership.accepted`, `ownership.gone`, `ownership.failed`,
`common.cancel`. O45 (the hand-over wording "is gone") is not touched: the page shows the
"no owner" note for a hand-over, not `ownership.banner.handover`.

Tests: web **3692 / 364 → 3720 / 364** (+28: 10 in `MemberList.test.tsx`, 13 in
`members.cloud.test.tsx`, 2 + 3 smoke tests). One old test changed: the owner note now sits on
the owner's row and the "later version" text is gone (`members.cloud.test.tsx`). Server
unchanged at **2689 / 85**, `scripts/spec` **70**. Measured at `b5d588ac` before and on the
K.7 tree after, each `pnpm test` run alone. The tests were written first and ran red: 31
failing (12 `memberActions` rows, 7 list tests, 12 page tests).

**Mutation checks**, each applied by a script with an exact unique match, run against
`components/household/MemberList` and `routes/settings/household/members*`, and undone from a
saved copy (`filecmp` identical every time):

| # | Mutation (file) | Red |
|---|---|---|
| M1 | `memberActions` gives a manager `canTransfer: true` (`MemberList.tsx`) | 4: three `memberActions` manager rows, "a manager sees no Transfer ownership and no owner note" |
| M1b | the page passes `onTransfer` to every role (`members.tsx`) | **0 — stays green.** `memberActions` is a second guard: a manager's rows have `canTransfer: false`. M1 is what covers that guard. Recorded, not counted as coverage. The page test "household manager sees no Transfer ownership" goes red only when both are broken |
| M2 | the waiting row has no Cancel | 8: 4 list tests, 3 page tests (offer, cancel, cancel `false`), both `…WaitingForAccept` smoke tests |
| M3 | `hasOwner` forced `false` on the page (the note shown with an owner) | 2: "user sees no such note while the household has an owner", "user with a transfer offer sees who offered it …" |
| M4 | Transfer not hidden while an offer is pending | 4: the pending list test, the page offer test, both `…WaitingForAccept` smoke tests |
| M5 | the Leave confirm never gives the warning (`MemberList.tsx`) | 4: the list test, the page test, both last-person smoke tests |
| M5b | the page never marks the last person | 2: the page test, `LastPersonLeaves` |
| M6 | a dismissed offer not offered on the page | 2: the O42 test, `NoOwnerBecomeOwner` |
| M7 | offers not filtered by household | 1: the O42 test (it accepts the OTHER household's offer, and no mock answers that id) |
| M8 | Transfer sends at once, with no confirm | 4: "asks first", "Cancel in the confirm sends nothing", the page offer test, "a refused offer …" |
| M9 | a gone accept treated as any other error | 1: "user whose hand-over offer is gone is told so" |
| M10 | a cancel that answers `false` says nothing | 1: "a cancel that finds no offer …" |
| M11 | **Become the owner** loses `aria-describedby` | 3: the O42 test, the transfer-offer test, `NoOwnerBecomeOwner` |
| M12 | the owner's row loses the cannot-leave text | 2: the list test, "household owner sees no Leave, and the note" |
| M13 | no extra row for a pending offer to a person not in the list | 1: "a pending offer to a person not in the list still shows, with Cancel" |
| M14 | Transfer not disabled while a write runs | 1: "while an offer or a cancel runs, the buttons are off" |
| M15 | **Become the owner** shown with no offer when there is no owner | 1: "user sees "This household has no owner." when nobody owns it" |

The three absence checks ("no such note", "no Become the owner", the manager's "no Transfer")
come after a presence check: a loaded row, or `MyOwnershipOffers` asked at least once.

**The gate (K.7), 2026-11-20, Node 22.17.1, each command alone:** `pnpm lint` exit 0 (4
warnings in `apps/web`, 13 in `e2e/`, the known ones); `pnpm build` exit 0 (first run: exit 2,
`TS2375` in `members.tsx`, `householdName` may be `undefined` under
`exactOptionalPropertyTypes`; fixed in the prop type), `grep TS6385` finds nothing;
`(cd apps/web && pnpm build-storybook)` exit 0, and `storybook-static/index.json` lists
`components-household-memberlist--as-owner-waiting-for-accept`, `--as-last-person`,
`pages-settings-household-members--owner-waiting-for-accept`, `--no-owner-become-owner`,
`--last-person-leaves`; `pnpm check` exit 0 (first run: 1 format error in `members.tsx`,
fixed); `pnpm test` exit 0 (numbers above). No E2E (K.8).

**Review of K.7, 2026-11-20.** Verdict: approve after one fix (`30fe4d5d`).

Bug fixed: the `tw` `transferLabel` was 「把擁有權轉移給 {{name}}」. The button shows
「轉移擁有權」, which was not inside the name, so WCAG 2.5.3 (Label in Name) failed in
Chinese. It is now 「轉移擁有權給 {{name}}」. A new test in `MemberList.test.tsx` checks
`transferLabel` ⊇ `transfer` and `cancelOfferLabel` ⊇ `cancelOffer` in `en` and `tw`.
jsdom renders English only, so no page test could see it. Web 3720 → 3721 / 364.

| # | Mutation | Red |
|---|---|---|
| R1 | `lastPerson = !!me && me.role !== 'owner'` (`members.tsx`) | 6: "a person who is not the last gets the usual leave text" and 5 leave tests |
| R2 | `offer(person.displayName)` (`members.tsx`): the wrong id | 1: "household owner can offer…", `expected +0 to be 1` |
| R3 | the extra row shown even when the person is in the list (`MemberList.tsx`) | 2: "while an offer or a cancel runs, the buttons are off", `OwnerWaitingForAccept` smoke test |
| fix | `tw` `transferLabel` before the fix | 1: `expected '把擁有權轉移給 Mia' to contain '轉移擁有權'` |

M1b staying green is agreed: `memberActions` is the second guard and M1 covers it.

Known gaps found in review:
- A stale cached member list (restored from IndexedDB, shown before the network answer) can
  hide the O37-A warning while the server will delete the household. The window is one round
  trip. Asked as owner question O48.
- The transfer confirm says "Offer  to {name}?" while the household name loads.
- After a refused offer, or a "gone" accept, focus is not moved anywhere.
- Text suggestion (not changed): `cancelOfferLabel` tw 「取消給 {{name}} 的擁有權邀請」, so 邀請
  is not read as an invite link. It fits with O45.

---

## Task K.7b — the hand-over text (O45) and Leave waits for the server (O48)

Needs owner decisions **O45** and **O48** (answered 2026-11-20).

**Files:** `i18n/locales/en.json`, `tw.json`, `OwnershipOfferBanner.test.tsx`,
`OwnershipOfferBanner.stories.test.tsx`, `docs/global/permissions/2026-10-04-households-design.md`
(O45); `hooks/useHouseholdMembers.ts` and its test, `components/household/MemberList/` (list,
test, story, smoke test), `routes/settings/household/members.tsx`, `members.cloud.test.tsx`,
`components/CLAUDE.md`, `hooks/CLAUDE.md`, `routes/settings/CLAUDE.md` (O48).

- [x] **Step 1: failing tests:**
  - the `en` and `tw` hand-over texts are the O45 texts (jsdom renders English only, so the
    tw text is checked through `i18n.getFixedT('tw')`); the banner tests quote the new text;
  - `useHouseholdMembers().isFromServer` is `false` while only the cached list shows, `true`
    after the server answers, `false` after a failed read over a cached list, `true` after the
    first answer with no cache;
  - the page: a cached list of Mona and Mia, the server answers Mona alone (held by
    `createHoldLink`). Before the answer Leave is disabled; after it Mia is gone, Leave works
    and its confirm gives `lastLeaveWarning`. After a failed read Leave stays off;
  - `MemberList` with `leaveDisabled`: Leave shows, cannot be pressed, no confirm.
- [x] **Step 2:** red (7 O45, 3 hook, 2 page, 1 list). **Step 3:** the texts;
  `isFromServer` (the `useLocations` rule: `ready` with data right after `loading` or
  `refetch`); `MemberList.leaveDisabled`; the page passes `!members.isFromServer`.
  **Step 4:** story `AsMemberLeaveWaitsForServer` and its smoke test, the docs, the gate.

**Done 2026-11-20** (`5cb7cfdc` O45, `eed468b5` O48).

| Key / part | What |
|---|---|
| `ownership.banner.handover` (O45) | The owner of {{household}} deleted their account. Do you want to become the owner? / {{household}} 的擁有者已刪除帳號。你要成為擁有者嗎？ |
| `useHouseholdMembers().isFromServer` (O48) | `true` once the server has answered the list in this mount; never back to `false` |
| `MemberList.leaveDisabled` (O48) | Leave shows but cannot be pressed |
| `members.tsx` (O48) | `leaveDisabled={!members.isFromServer}`. Offline, Leave stays off; a leave could not be sent then anyway |

Other buttons were checked for the same risk: Remove, the role change and Transfer on a
stale list only target a person who left, and the server refuses them with an error toast.
None deletes without a warning, so they are unchanged.

Tests: web **3721 / 364 → 3729 / 364** (+8). Server **2689 / 85**, `scripts/spec` **70**.

**Mutation checks** (restored from a saved copy, `diff -q` identical each time):

| # | Mutation | Red |
|---|---|---|
| O45-M1 | `tw` handover set back to 「…已經不在了。…」 | 1: the text test |
| O48-M1 | the page passes `leaveDisabled={false}` | 2: both page O48 tests, `Received element is not disabled` |
| O48-M2 | `isFromServer: !!cloud.data` | 4: 2 hook tests, 2 page tests |
| O48-M3 | `MemberList` ignores `leaveDisabled` | 4: the list test, the smoke test, 2 page tests |
| O48-M4 | the latch reads `networkStatus === ready` only | **0, stays green.** The "ready right after error" case (a cache re-read) is not reachable here. Recorded, not counted |

**The gate (K.7b), 2026-11-20, Node 22.17.1, each command alone:** `pnpm lint` exit 0;
`pnpm build` exit 0, `grep TS6385` finds nothing; `build-storybook` exit 0; `pnpm check` exit 0
(after fixing 1 import order and 2 format errors); `pnpm test` exit 0. No E2E. Known gap: at
load about 6, 2 of 3 runs of the two `OwnershipOfferBanner` test files had 1 failing test (not
captured); the next 7 runs were green. K.9's gate should watch for it.

---

## Task K.8 — E2E: transfer and hand-over on real SQL

**`verify:migration` before K.8, 2026-11-20.** The main session ran it on the TEST database,
with no subagent working, after the owner's consent given after Prisma's warning
("yes, reset the test database and run verify:migration"). Result: **"Migration verified."**,
every line `ok`. That includes the new `assertOwnershipOffers` checks: 7 columns,
`OfferKind` = `transfer, handover`, the two `CASCADE` foreign keys and none on
`fromUserId`, the unique pair and the `toUserId` index, `23505`, `22P02`, the two `23503`
refusals, and the three deletes. The test database now has the `OwnershipOffer` table, so
cloud E2E can run.

**Files:** `e2e/tests/household-ownership.spec.ts` (new), `e2e/pages/MembersPage.ts`,
`e2e/playwright.config.ts`, `e2e/CLAUDE.md`.

Setup: OWNER owns household H with "Home" and "Garage". M joins as `manager`, B as `member`
with 據點王 on Garage (through `createInvite` + `joinHousehold`). A second household H2 of
another user, with the same shape, must stay as it is in every test.

- [x] **Test 1 — `household owner can transfer the household, and the other person accepts`**
  (two browsers): OWNER transfers to M; M's browser shows the banner without a reload; M
  accepts; OWNER's Members page shows OWNER as manager and M as owner; read back through
  `makeGql` with `expect.poll`.
- [x] **Test 2 — `user can decline a transfer`** and the owner sees no waiting row.
- [x] **Test 3 — `manager becomes the owner after the owner's account is deleted`:**
  `POST /e2e/users/<OWNER>/deleted`; M's browser shows the hand-over banner without a
  reload; B (a member) shows none; M accepts; M is owner; `Household.ownerGoneAt` is null
  again.
- [x] **Test 4 — `a deleted organizer no longer counts`:** B's account is deleted; Garage
  shows **No organizer** on the locations list; B is gone from the Members page and from
  Garage's people page.
- [x] **Test 5 — `the household of a deleted only person is deleted with its data`:** a user
  with a tag WITH a tag type, an item, stock, a cart row and a log, alone in their household;
  `POST …/deleted`; every row of theirs is gone (read back through a cleanup-style count or
  `GET /e2e/users/:id`); H2 is untouched. This is the real-SQL proof of T64 and the
  `NoAction` trap.
- [x] **Test 6 — `two people accept a hand-over at once`:** two managers send
  `acceptOwnershipOffer` together through `makeGql`; exactly one is owner, the other gets
  `OFFER_GONE`. (Real Postgres, real row locks: the only place this is proved.)
- [x] Axe scans of the banner (both kinds) and the Members page with an offer, light and
  dark.
- [x] **Cleanup trap:** `/e2e/cleanup` deletes households by the OWNER row. A household whose
  owner was deleted and where nobody accepted has NO owner row, so no cleanup deletes it.
  Every test that deletes an owner ends with an accept (or the only-person delete). If one
  cannot, it deletes the household itself with a direct cleanup call for the accepting
  user. Say which in the spec.
- [x] Run only this spec and `location-people.spec.ts`, `household-invites.spec.ts` in
  `cloud`. Copy `test-results/` aside before any re-run.

**Mutation checks (E2E):** the K.4 "only person" count without `deletedAt` → test 5. With
no other member in the fixture this mutation changes nothing, so the fixture needs a second
member whose account was deleted FIRST; then the mutation turns test 5 red. The accept
without the "still exists" read → test 6; `countedOrganizerIn` without `deletedAt: null` → test 4 only if the hand-over did not
already remove B's rows. **It did**, so test 4 cannot go red on that mutation. Record it as a
negative control, not coverage; K.2's unit test is the proof (the pre-H6 shape).

**Done 2026-11-20** (commits `0df2b901`, `255b8b8c`, `d3893502`). `household-ownership.spec.ts`
has 9 cloud tests: tests 1–6 above, test 7 (not in the plan) `the last person who leaves a
household with no owner deletes it` (O37-A), and tests 8 and 9, the axe scans light and dark
(the banner of both kinds, the Members page with a waiting offer, and the transfer confirm,
with `checkDialogA11y`). Test 2: the owner's open page shows Transfer again, with no waiting
row. Test 3 checks `hasOwner` is true again; `ownerGoneAt` cannot be read (see *What this plan
got wrong*). Tests 5 and 7 use GHOST, a member whose account was deleted first. Every test
ends with an accept, a delete or a live owner, and `rescueOrphans` runs before every cleanup
for a test that fails part way. `cleanup-endpoint.spec.ts` now seeds a real transfer offer,
so all 21 counts are at least 1 (it was red since K.1 on `ownershipOffers: 0`). The `cloud`
project collects **204 tests in 38 files** (195 before); `local` still 189 in 23.

Run: `pnpm test:e2e --project=cloud` on this spec, `cleanup-endpoint.spec.ts`,
`location-people.spec.ts` and `household-invites.spec.ts`: **27 passed in 16.6 min**, 0
flaky, load 1.5–2.5. Test 6 alone with `--repeat-each=3`: 3 passed. Lint, build (no
`TS6385`) and check exit 0. Cost: about 6.5 minutes more in the `cloud` project (each test
38–48 s; budgets 60–90 s).

| # | Mutation | Test | Result | Failure text |
|---|---|---|---|---|
| M1 | `handOverDeletedAccount`'s "live" read without `user: { deletedAt: null }` (`lib/handover.ts:268`) | 5 | red | `toBeNull()` received GHOST's `activeHouseholdId` |
| M2 | `acceptOwnershipOffer` without `if (!offer) throw offerGone()` | 6 | red | `toHaveLength` expected 1, received 2 owners |
| M3 | `countedOrganizerIn` without `deletedAt: null` | 4 | **green**, negative control as planned | passed in 48.7 s |
| M4 | the cleanup's offer delete narrowed to `{ toUserId: userId }` | cleanup-endpoint | red | `models that deleted nothing: {… "ownershipOffers":0 …}` |
| M5 | `offerOwnership` publishes nothing | 1 | red | the transfer banner text not found |
| M6 | `handleClerkEvent` publishes nothing after the hand-over | 3 | red | the hand-over banner text not found |
| M7 | `leaveHousehold`'s "live" read without `deletedAt: null` (`household.resolver.ts:410`) | 7 | red | `toBeNull()` received MIA's `activeHouseholdId` |

M1 and M7 go red only because GHOST is in the fixture. Test 6 asserts `OFFER_GONE`, which
needs both accepts to pass the first read before the first commit; otherwise the answer is
`FORBIDDEN`. Measured 4 of 4 `OFFER_GONE`.

**Not covered by E2E:** "Not now" (`dismissOwnershipOffer`), the T62 restart after a declined
hand-over, Cancel on the waiting row, the "This offer is no longer open." notice, and
`countedOrganizerIn`'s `deletedAt` filter on real SQL (test 4 is a negative control).


**Review of K.8 (2026-11-20).** Commits `2e5d8e35` (spec) and `6ab019ea` (`e2e/CLAUDE.md`).
Four changes to `household-ownership.spec.ts`:

| Change | Why |
|---|---|
| The owner's tab (tests 1, 2) and BEN's tab (test 3) open with `openLive`, and each ends with `stillSameDocument` | A tab's first socket connect refetches nothing (`connects > 1` in `liveUpdates.ts`), so an event sent before its subscription is registered is lost |
| `openLive` waits for the warm-up refetches (`MyOwnershipOffers`, and `GetHousehold` on the Members page) in its own tab AND in the tabs already open | A refetch still in flight in another tab could show the change without a live event |
| Test 6 accepts `OFFER_GONE` or `FORBIDDEN`, fails on any other answer, and adds a `loser answer` annotation | `acceptOwnershipOffer` reads the offer outside the lock first, so `FORBIDDEN` is correct when the loser's first read comes after the winner's commit. M2 can go red only on an `OFFER_GONE` run |
| The dark scans assert the `dark` class on `html` first | A scan of a light page proves nothing about dark mode |

Result: 9 passed in 6.5 min. Test 6 `--repeat-each=3`: 3 passed, 3 × `OFFER_GONE`. M6
re-run on the new test 3: red (the hand-over banner text not found in MIA's tab). Checked
and unchanged: the GHOST fixture leaves nothing behind; no failing path found that leaves a
household with no owner; every delete is scoped to the spec's own ids; the 60–90 s budgets
are mostly hook time (8 user ids cleaned per hook). Gaps: BEN's `noOwnerNote` check alone is
not proved by mutation (M6 goes red first on MIA's banner); test 6 proves the lock only on an
`OFFER_GONE` run.
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

- [x] Step 1: the docs. Re-measure every count. **Done 2026-11-20** (`a90d8772`, `9b43c292`, `e610d508`, `1eff6ec4`): root `CLAUDE.md` (H6b block and Counts table), `apps/server/prisma/CLAUDE.md`, `apps/web/src/routes/settings/CLAUDE.md` (K.8's axe scans), `e2e/CLAUDE.md` (the gate; the cleanup count was already 21 from K.8), the design (*Transfer ownership*, *Owner's account is deleted*, *Sequencing* H6), the phase plan's H6 outline, the H5 and H5c plans' *Known gaps*, `docs/INDEX.md`, and section 12 of the H4 runbook. `components/CLAUDE.md` and `hooks/CLAUDE.md` were already current from K.5–K.7b.
- [x] Step 2: `verify:migration` was NOT run again. The main session ran it before K.8 (top of the K.8 section), and `git log --oneline e0b7f585..HEAD -- apps/server/prisma/` is empty at `5cd82bf4`.
- [x] Step 3: the full gate, then `pnpm test:e2e:all`. Results in *Status*.
- [x] Step 4: `git status` clean; `git show --stat` for each of the four commits.

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
- **No Decline after "Not now"** (K.7). The Members page offers only **Become the owner**.
  A person who dismissed an offer and later wants to decline it has no button: the banner
  hides a dismissed offer. Accepting or leaving still works.
- **No axe scan of the new Members page states yet** (K.7): the waiting row, the
  "no owner" note with **Become the owner**, and the transfer confirm. They belong to K.8's
  cloud spec, because `a11y.spec.ts` does not run in cloud.
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
| J.9 | The header and *Status*: branch `feature/households-h6` | The H6a branch is `feature/households-h6a`. The docs written in J.9 name that branch |
| J.9 | *Facts*: the live guard lists **72** fields, 0 in `publishesNothing` | Root `CLAUDE.md` still said 72 after J.4. Measured in J.9: **76**, 74 in `publishes` and 2 in `publishesNothing` (`recordImport`, `deleteHousehold`). Updated, with the command |
| J.9 (brief) | "the `requireCatalogRole` call count (believed 23)" | 23 is not the call count. It is `grep -c "await requireCatalogRole(ctx, 'manager')" apps/server/src/resolvers/import.resolver.ts`: the 22 bulk import mutations plus `recordImport`. Root `CLAUDE.md` said 22 there. Lines that contain `requireCatalogRole(` outside `lib/authz.ts` and test files, comments included: **63** in 8 resolver files (`import.resolver.ts` 25, 2 of them comments; `tag` 10, `item` 8, `shelf` 8, `recipe` 6, `vendor` 4, `importCheck` 1, `itemStock` 1). Root `CLAUDE.md` now gives the 23 with its command |
| J.6, J.8 | J.6 adds the Activity item to the sidebar; J.8 runs "only these three spec files in `cloud`" | `settings-global-pages.spec.ts` lists every household sidebar link, and nobody ran it in `cloud` after J.6. The first J.9 gate failed there: `cloud` 1 failed / 7 skipped / 187 passed, with `Received + "Activity"` (a value difference, not a timeout). The spec now expects Activity last in cloud. Mutation check: hiding Activity in `HouseholdSidebar.tsx` turns it red with `Expected - "Activity"`. A task that adds a sidebar link must grep `e2e/` for the link list |
| J.9 | Files: the listed docs | Four more stale lines were found by re-measuring: the server build copies **14** `.graphql` files, not 12; the bundle is **236.0 KiB**, not about 129; the `cloud` project covers **37 of 41** spec files, not 36 of 40; and section 10 of the H4 runbook still said H5c was "not merged". All updated |
| K.0 | Files: `ImportCard/`, its tests and stories, "the E2E spec that presses Clear & import in cloud" | The button lives in `ConflictDialog`, not `ImportCard`; `ImportCard` only passes the name. Three E2E specs press it, not one (`import-strategies.spec.ts`, which runs in `local` too, `import-households.spec.ts`, `data-mode-migration.spec.ts`). The plan missed a second path with the same purge: a stored `clear` copy after the switch to cloud (`PostLoginMigrationDialog`), which now asks for the name too. That needed `__root.e2eMigration.test.tsx`, `index.e2eMode.test.tsx` and the migration dialog's stories to change as well |
| K.1 | Step 1: the fake applies `where` keys `id`, `householdId`, `toUserId`, `kind`, `dismissedAt: null` | Applied as listed. The plan did not say which methods K.3 needs, so the store has all eight a resolver may call (`create`, `findUnique`, `findFirst`, `findMany`, `update`, `updateMany`, `delete`, `deleteMany`). `findUnique`, `update` and `delete` take `id` only; a compound `householdId_toUserId` key is not modelled. No `orderBy`: if `myOwnershipOffers` (T65) sorts, K.3 adds it with a test |
| K.1 | T58 does not name the relation fields | `Household.ownershipOffers` and `User.ownershipOffers` (the offers TO the person). K.3 uses these names in any relation filter |
| K.1 | T49: "a test in `invite-join.resolver.test.ts` pins it" (for activity rows, J.1) | No join test was added for offers. The household fake does not model an `ownershipOffers` key at all, so a join that asked it throws in every join test (mutation 4: 31 red). Its failure text names the fake, not the rule, and it stops guarding the day someone models the key in the fake. **The K.1 review added the join test** ("an ownership offer does not keep it, and goes with it"), like J.1's |
| K.1 | Cleanup: "offers TO the user and offers of owned households are deleted before `householdMember`" | Placed right after `householdActivity`. Both foreign keys cascade, so the delete is there for the COUNT, not to unblock anything. An offer the user MADE in another household stays (`fromUserId` has no foreign key) |
| K.1 | `cleanup-endpoint.spec.ts`: "one row seeded, count at least 1" (Global Constraints) | No mutation can make an offer before K.3, and `offerOwnership` needs a second member. The spec's loop over `CLEANUP_MODEL_KEYS` now fails on `"ownershipOffers":0` until **K.8** seeds an offer through the real mutation. Only comments changed; the spec is unrun (no E2E in K.1). The same happened to `householdActivities` between J.1 and J.2 |
| K.1 | Files: no doc | Root `CLAUDE.md` and `e2e/CLAUDE.md` still say `/e2e/cleanup` deletes **20** models (dated, measured after J.1). K.9 must update them to 21, with the count command |
| K.2 | Files: `household.resolver.ts` (`householdMembers`, `peopleWithLocationRole`) | `peopleWithLocationRole` (`hasLocationRole`) was NOT changed. It marks a person who is already on the list; it counts nobody. With `householdMembers` filtered, a deleted person never reaches it, so a filter there could not be proved by a mutation. `roleOfPerson` was left alone too (see the K.2 table) |
| K.2 | "the fakes if `deletedAt` on the `user` relation filter is not modelled" | It was not, and more was missing than the key. `HouseholdMember` had no `user` key at all, and the household fake could not see `User` rows (they live in `userFake`). It got a `users` option, and `userFake` exposes `readableRows()`, which includes the rows `rowForEveryMember` implies |
| K.2 | T61: "the Add person list" gets the same filter | There is no server read for it. The web builds it from `householdMembers` (decision T43), so the `householdMembers` filter covers it. No web file changed, so no story, smoke test or i18n text changed. The activity log already shows "(deleted account)" (J.3, J.6) |
| K.2 | (not in the plan) the order of the two `user` filters in the fake | The fake first read `deletedAt`, then the membership. The H18 test "does not count an organizer who left the household" then threw: that person was removed from every household before any read, so `userFake` had no implied `User` row for them. In Postgres the row exists. The fake now reads the membership first. Both must pass, so the answer is the same. A fake test pins it |
| K.2 | (not in the plan) a deleted OWNER | `householdMembers` hides a deleted owner too. Until K.4's hand-over runs for an account deleted before H6, the Members page of that household shows no owner row. K.4 or K.5 should check that the web copes with a list that has no owner |
| K.3 | Files: `removeFromHousehold` and `startHandover` in `lib/household.ts` | They are in a new file, `lib/handover.ts`. `startHandover` must read organizers through `lib/authz.ts` (H18), and `lib/authz.ts` imports `lib/household.ts`; importing it back would make the import cycle that file already avoids. K.4 imports both from `lib/handover.ts` |
| K.3 | Step 1: "the second accept gets `OFFER_GONE`" | True only for two accepts at the same moment. Accept first reads the offer outside the transaction to know which household to lock. An accept sent AFTER the first one committed finds no offer there and gets `FORBIDDEN`, the same as an unknown id (the plan's own rule for a stranger). Tested both ways |
| K.3 | T62: "the remaining members get new `handover` offers by the same table" after a DECLINE | Applied as written, the table gives the offer straight back to the person who declined (for example the only manager). The code applies the table to everyone ELSE. When nobody else is left, the person gets it back already dismissed, so the banner stays hidden and the Members page still lets them take the household. Not in the plan; the owner may want another rule |
| K.3 | O37-A is "needed before K.3 and K.7", but no K.3 step names it | Built in K.3, in `leaveHousehold`: when no OTHER member with a live account is left, the household is deleted with `deleteHouseholdData`. The rule is "no other live person", not "no owner": a household whose owner's account was deleted before H6 keeps `ownerId` set, and its last live person is also last. The delete writes `User` rows after the household lock, so the leave now retries once on `P2034` and has the 15 s timeout. No activity row and no event when it deletes. The web warning is K.7 |
| K.3 | `Household.hasOwner: Boolean!` added "with the resolvers" | The generated `Household` type now requires `hasOwner`, so the four resolvers that return a `Household` (`household`, `renameHousehold`, `createHousehold`, `joinHousehold`) no longer type-check. They return through `householdAnswer`, one cast in `ownership.resolver.ts`; the field resolvers fill the two new fields |
| K.3 | (not in the plan) the web's own leave text | `apps/web/src/i18n/locales/en.json` (`ownerCannotLeave`) and `members.cloud.test.tsx:429` still say "Handing over the household comes in a later version." The server text changed; the web's is K.7's |
| K.4 | Files: `lib/household.ts` (`startHandover`, `deleteHouseholdData`) | `startHandover` is in `lib/handover.ts` (K.3), and so is the new `handOverDeletedAccount`. Only `deleteHouseholdData`, `lockHouseholds` and now `retryOnceOnConflict` are in `lib/household.ts` |
| K.4 | Mutation check: "'organizes' read without H18 (a removed person's organizer row counts) → the organizer row" | It cannot go red. The table only offers the household to its own MEMBERS, and a member's organizer row on a location of the same household always passes H18. A leftover row of a person who left is ignored anyway, because that person is not a candidate. Measured: 0 of 121 red (M3a). The part of `countedOrganizerIn` the hand-over CAN see is `location: { householdId }` (a member who organizes a location of another household): M3b, 3 red |
| K.4 | Mutation check: "the household delete through `household.delete` alone, no `deleteHouseholdData` → nothing on the fake" | Red here (M5), but only because the test records each `deleteMany` of the catalog models. The world's own household delete cascades the rows, so the data assertions alone stay green, as the plan said |
| K.4 | T60 step 1: "upsert the `User` row with `deletedAt`" | Written as H2 had it, `update: { deletedAt }`, a second delivery moves `deletedAt` to the time of that delivery, so "a second delivery does nothing" is false for the `User` row. The upsert writes only `updatedAt` (still a real `UPDATE`, so still the lock), and `deletedAt` is set only when it is null |
| K.4 | T60: "retried once on `P2034`" | The helper was in `resolvers/invite.resolver.ts`. Moved to `lib/household.ts` (`9c23604a`), so `lib/clerkWebhook.ts` imports no resolver |
| K.4 | (not in the plan) the two older webhook test files | `clerkWebhook.test.ts` and `e2eUsers.test.ts` mocked `prisma` as `{ user }` only. `user.deleted` now opens a transaction, so both failed with `prisma.$transaction is not a function`. Their mock is now the household world; no test changed |
| K.4 | (not in the plan) the K.2 gaps | K.4 removes a deleted person's rows from now on. It does nothing for accounts deleted before it runs (no second event comes). A deleted manager's or member's open invites are revoked (`removeFromHousehold`, O20); a deleted OWNER's stay open. Both are owner questions after K.4 |
| K.0 | Mutation check: "the confirm always enabled" | That mutation lives in the shared `DeleteButton`, so it also proves nothing K.0-specific is wired. Two more were needed to pin the wiring: `ConflictDialog` ignoring the name, and the migration dialog never taking its `clear` branch. Under the first one the first web test failed only on a missing label, so the tests now also check that the first press started nothing (`importCloudData` not called), and fail on that value |
| K.4 | test "with managers: every manager gets a hand-over offer": its Given comment named "an open invite OWEN made" | No such invite was seeded, so the comment claimed coverage that did not exist. Removed in K.4b; K.4b's tests cover owner invites |
| K.4 | (not decided) the owner branch and the owner's open invites | It left them open ("NOT DONE HERE" in the code comment). Decided as O43 and built in K.4b |
| K.4b | testing the household scope of an invite revoke | A fixture where the person's other-household invite is revoked anyway (through `removeFromHousehold`) cannot see a revoke with no `householdId`. K.4b adds an invite in a household the person is no longer in |
| K.5 | Step 1: every write refetches `MyOwnershipOffers`, `GetHousehold`, `HouseholdMembers` | True for four of the five. `accept` reads EVERY active query (`'active'`): becoming the owner changes the caller's household role, and with it the settings locations list (an owner sees every location), the open invites and the activity log, none of which the three cover. Pinned by M4 |
| K.5 | (not in the plan) what a gone offer does on the web | `accept` reads the three lists again on `OFFER_GONE` AND on `FORBIDDEN`, then rejects; `isOfferGoneError` is true for both. The K.3 row above says why both: only a same-moment accept gets `OFFER_GONE`. Decline and dismiss answer `false` and need no special case. K.6 and K.7 show "no longer open" for `isOfferGoneError` |
| K.5 | Files: `liveUpdates.ts` "(comment table)" only | The MAP changed too: `MyOwnershipOffers` is in `CATALOG`. Each offer carries `householdName`, and `renameHousehold` publishes `CATALOG` only, so without it a rename would leave an old name on the banner. Pinned by M8 |
| K.5 | Step 3: "grep every `GetHousehold` mock" | 40 files needed the two fields; `tsc` found 2 of them (the typed mocks). Two literals of type `Household` are NOT `GetHousehold` answers and were left alone: the `JoinHousehold` answer in `join/$token.test.tsx` and the `CreateHousehold` answer in `noHousehold.cloud.test.tsx`. Those documents do not select the new fields |
| K.5 | (not in the plan) `src/test/setup.ts` | Not changed. Its `@/generated/graphql` factory spreads the real module, so the new hooks are real in every test. K.6 must stub `useMyOwnershipOffersQuery` in any test file whose OWN factory replaces the module and renders `__root.tsx` (root `CLAUDE.md`, *A per-file `vi.mock` factory REPLACES …*) |
| K.5 | (not in the plan) `dismissOwnershipOffer` and other tabs | It publishes nothing (the K.3 row), so a person's other open tabs keep the banner until their next read of `MyOwnershipOffers` (a resume, a mount, any `LOCATION` event). Written in the hook's comment; K.6 should not promise more |
| K.5 | (the K.5 row above) "Decline and dismiss answer `false` and need no special case" | False for the common case. An offer already gone when the call arrives is `FORBIDDEN` (`householdOfMyOffer` reads before the lock, and an unknown id is `FORBIDDEN`). `false` is only the race between that read and the lock. Fixed in the review (`838b2f45`): decline and dismiss read the three lists on `isOfferGoneError`, then reject |
| K.3 | `schema/ownership.graphql`: decline and dismiss are "False when it is already gone" | Same mistake in the server schema comment. The resolver header was right. Corrected after the K.5 review |
| K.6 | O39 lists the banner texts | It has no text for the region's label, for "no longer open", for a failed answer, or for closing a notice. 4 keys were added: `ownership.banner.label` ("Ownership offers" / 擁有權邀請), `ownership.gone` ("This offer is no longer open." / 這個邀請已經失效。), `ownership.failed` ("Could not send your answer. Please try again." / 無法送出你的回覆，請再試一次。), `ownership.close` ("Close" / 關閉) |
| K.6 | Files: the component, `__root.tsx`, the locales, `components/CLAUDE.md` | `src/test/setup.ts` and **4** test files with their own `@/generated/graphql` factory needed stubs for `useMyOwnershipOffersQuery` and the 3 answer hooks (`cooking.cloud.test.tsx`, `items/$id/stock.test.tsx`, `settings/household/locations/index.cloud.test.tsx`, `shopping/index.cloud.test.tsx`). Without them **51 tests in 7 files** failed with `Could not find "client"`; 3 of the 7 files have no factory of their own and were fixed by `setup.ts`. Also a new `routes/__root.ownershipOffer.test.tsx` for the mount |
| K.6 | Step 1: "Accept then shows a short success message" | The hooks read the offer list again BEFORE they resolve, so the offer's row is unmounted by the time the answer comes back. The message must live in the banner, not in the row. When the last offer goes, the `<section>` unmounts and mounts again with the notice, so a test that kept the old region element saw nothing (8 tests red at first) |
| K.6 | Step 1: "a failed write shows the error and keeps the banner" | True for a server error. For a GONE offer the banner cannot keep it: the hooks have already read the list without it. That case shows "This offer is no longer open." instead, for Accept, Decline and Not now. An `OfflineWriteError` shows nothing extra (the offline link shows a toast) |
| K.6 | (not in the plan) a test of the banner with `MockedProvider` | It renders an empty `<div />` with no error unless a `<Suspense>` sits inside `MockedProvider`, the same unexplained trap `HouseholdNameCard.apollo.test.tsx` records. The stories have the boundary too |
| K.6 | Mutation check list | The plan's two (dismissed shown, Decline on hand-over) both went red. The banner's own local-mode check cannot go red (M8): the hook already skips the query in local mode |
| K.6 | Step 1: "the banner is a `role="region"` with a label, so axe finds it" | No axe scan includes the banner. No E2E seeds an offer. It needs an a11y scan in K.8 |
| K.6 | The commit and `setup.ts` said the four hook stubs are needed because every cloud root render reaches them | Only the query stub is reached (23 tests in 7 files, plus 37 in the 4 per-file factories). The three mutation stubs are reached by no test |
| K.7 | O39: `ownerCannotLeave` is "Transfer ownership first." | Shown alone on the owner's row, it does not say what it is about. Built as "The owner cannot leave. Transfer ownership first." / 「擁有者不能離開。請先轉移擁有權。」. The owner may change it in the PR |
| K.7 | O39 has one text per button | With several people, "Transfer ownership" and "Cancel" would have the same name on every row. Two keys were added for the buttons' accessible names: `transferLabel` ("Transfer ownership to {{name}}") and `cancelOfferLabel` ("Cancel the offer to {{name}}"). Each holds the visible word (WCAG 2.5.3) |
| K.7 | Step 1: "the LAST person of a household with no owner" sees the warning | The server's rule (K.3) is "no OTHER live person", not "no owner". The page uses "only me in `householdMembers`", which lists live accounts only, so it matches the server. An owner whose account was deleted before H6 keeps `hasOwner: true` and is not in the list: that household's last live person is warned too |
| K.7 | Step 1: the owner "sees Transfer ownership on every other row" | Not while an offer is open. The server REPLACES an open offer (T59), so a second Transfer would work, but the page hides it: one offer at a time is shown, and the owner cancels first. The owner may want Transfer on every row with a confirm that says it replaces the offer |
| K.7 | (not in the plan) a pending offer to a person who is not in the list | Possible when the list was read before they joined or after they left. Without a line for it the owner would have no Transfer (hidden) and no Cancel. An extra row shows "Waiting for {name} to accept" with Cancel |
| K.7 | (not in the plan) what the page shows after an accept, a gone offer or a failed answer | The banner keeps its notices in the banner. The page uses toasts, like every other message on the Members page: `ownership.accepted`, `ownership.gone`, `ownership.failed` (reused from K.6). The button is gone by then, so focus moves to the page heading after an accept, a transfer and a cancel |
| K.7 | (not in the plan) a Decline or Not now on the page | Not built. The page offers only **Become the owner**; saying no is done from the banner. A person who pressed Not now and then wants to decline has no button for it (the banner hides a dismissed offer). See *Known gaps* |
| K.7 | Files: `MemberList` and the page only | `test/cloudRoleStory.tsx` also changed: `CloudRolePage` always answered `GetHousehold` with `hasOwner: true` and no pending offer, so no story could show the new states. It takes an optional `ownership` override now |
| K.7 | `transferLabel` tw 「把擁有權轉移給 {{name}}」 "holds the visible word (WCAG 2.5.3)" | True in English only. In tw the visible 「轉移擁有權」 was not inside the name. Fixed in `30fe4d5d` to 「轉移擁有權給 {{name}}」, with a two-language test |
| K.7 (known gaps) | A stale cached member list can hide the O37-A warning, and "the window is one round trip" | True only when the read works. When the read fails while online, Apollo keeps the cached list with no time limit, and Leave could still be sent. Since K.7b, Leave stays off until a read succeeds |
| K.8 | Test 3: "`Household.ownerGoneAt` is null again" | The column exists (`schema.prisma:392`; accept writes `ownerGoneAt: null`), but no GraphQL field and no E2E route reads it. The test checks `hasOwner` instead. The K.8 brief said the column does not exist; that was wrong too |
| K.8 | Mutation checks: "the fixture needs a second member whose account was deleted FIRST" | No real event makes that state: since K.4 `user.deleted` removes the person from every household. The spec marks GHOST deleted while in no household, then GHOST joins through a real invite (the E2E server checks no Clerk session) |
| K.8 | Test 5: read back "through a cleanup-style count or `GET /e2e/users/:id`" | The deleted person's data cannot be read (`NO_HOUSEHOLD`), and their cleanup counts are the same either way. The readback is GHOST's `User.activeHouseholdId`, which is `onDelete: SetNull` |
| K.8 | Setup: "B as `member` with organizer on Garage" | If OWNER creates Garage, OWNER is its organizer too, and "No organizer" never shows. BEN creates Garage |
| K.8 | Tests with the default budget | Each test takes 38–48 s with hooks (7 users cleaned twice). Test 5 failed at 30 s. Budgets are 60–90 s |
| K.8 | (not in the plan) the O37-A leave | No planned test reached it. Test 7 was added, with GHOST, so M7 can go red |
| K.8 | (not in the plan) `cleanup-endpoint.spec.ts` | Red since K.1 (`ownershipOffers: 0`). It now seeds a real offer to a second member |
| K.8 | Axe list: "the banner (both kinds) and the Members page with an offer" | The transfer confirm dialog was missing. It is scanned with `checkDialogA11y` |
| K.8 | Test 6: "the other gets `OFFER_GONE`" | Only when the second accept's first read runs before the first commit; otherwise `FORBIDDEN`. Measured 4 of 4 `OFFER_GONE` |
| K.8 review | Test 6: "the other gets `OFFER_GONE`", "measured 4 of 4" | `acceptOwnershipOffer` reads the offer outside the lock first, so correct code can answer `FORBIDDEN`. The test now accepts both and records which one ran |
| K.8 review | Tests 1 and 3: "shows … with no reload" on the owner's and BEN's page | Those tabs had no warm-up (a first connect refetches nothing) and no `stillSameDocument`. Both were added |
| K.8 review | The warm-up "cannot show a later step" | It waited for its own tab's refetch only. `CATALOG` also refetches `GetHousehold` and `MyOwnershipOffers` in every other open tab. It now waits for all of them |
| K.8 review | `rescueOrphans`: "each spec user accepts any open offer" | Only MIA, BEN and MAX do. No other spec user ever gets an offer |
| K.8 review | Axe "light and dark" | The dark scans did not check that the page was dark. They do now |
| K.9 | J.9's Counts table: live guard fields "76" with one `awk` command | The command counts the `publishes` list only: 74 at H6a (measured at `c0f096ed`), 78 after H6b. The `publishesNothing` list needs its own command (3 after H6b). Root `CLAUDE.md` now gives both |
| K.9 (brief) | the live guard command gives "around 81" | It gives 78. 81 = 78 in `publishes` + 3 in `publishesNothing` |
| K.9 (brief) | `e2e/CLAUDE.md`: "fix the cleanup model count" | K.8 had already changed all three places to 21. Only the gate result was added |
| K.9 | O44: a one-off script if the O36 count is not 0 | Not written. `apps/server/scripts/` must not import from `src`, so it would need a copy of `handOverDeletedAccount` and its helpers. Runbook 12.6 says it does not exist yet and what it must do |
| K.9 | (not in the plan) the gate's first `pnpm test` | `apps/server/src/lib/e2eUsers.test.ts` failed 9 of 9 with `expected 401 to be 200`, and web did not run. The file passed alone, and the next full `pnpm test`, run alone, passed. Not investigated; recorded in *Known gaps* |

## Status

**Plan written 2026-11-20** on `feature/households-h6`, based on `develop` at `7dbaeca9`.
Owner decisions O32–O39: all A (2026-11-20). H6a (J.1–J.9) comes first.

**H6a built 2026-11-20, tasks J.1 to J.9**, on `feature/households-h6a` (the plan said
`feature/households-h6`), from `develop` at `7dbaeca9`. **Merged into `develop` on 2026-11-20 as #392 (merge `c0f096ed`), not deployed.** The PR ships with H3a–H5c at the next checkpoint release:
server first, then the web (section 11 of the H4 runbook). One additive migration,
`20261120000000_add_household_activity`, proved on the test database by the main session
with the owner's consent (J.9 Step 2).

**The final gate (J.9), 2026-11-20, Node 22.17.1, every command alone:**

| Command | Result |
|---|---|
| `pnpm lint` | exit 0 (13 warnings in `e2e/`, the known ones) |
| `pnpm build` | exit 0, 19s; `grep TS6385` finds nothing. The server bundle is 236.0 KiB and copies 14 `.graphql` files |
| `(cd apps/web && pnpm build-storybook)` | exit 0 |
| `pnpm check` | exit 0 (4 warnings in `apps/web`, 13 in `e2e/`, the known ones) |
| `pnpm test` | exit 0, 97s: web **3607 / 360 files**, server **2563 / 83 files**, `scripts/spec` **70**. At `7dbaeca9` it was 3454 / 347, 2401 / 78 and 70 |
| `pnpm test:e2e:all`, run 1 (at `38b6432c`) | **exit 1**: `local` 178 passed / 11 skipped (3m36s), `cloud` **1 failed** / 7 skipped / 187 passed (50m49s), `pwa` 73 passed (1m33s); 55m58s in all. The failure: `settings-global-pages.spec.ts:216`, `Received + "Activity"` (see *What this plan got wrong*, J.6, J.8). `test-results/` was copied aside before any re-run |
| the fixed spec alone | `cloud` 2 passed (27.4s), `local` 2 passed (3.8s). Mutation (Activity hidden in `HouseholdSidebar.tsx`): red, `Expected - "Activity"`; restored from a copy |
| `pnpm test:e2e:all`, run 2 (at `63a82eee`, with the fix) | **exit 0, no retry**: `local` 178 passed / 11 skipped (3m36s), `cloud` 188 passed / 7 skipped (50m22s), `pwa` 73 passed (1m34s); 55m32s in all. Load average 1.73 at the start, 2.64 at the end |

After the fix, `pnpm check:e2e`, `pnpm lint:e2e` and `pnpm typecheck:e2e` were run again:
exit 0. The rest of the gate was not re-run: the fix changed one `e2e/` spec only.

**H6b built 2026-11-20, tasks K.0 to K.9 (with K.4b and K.7b)**, on `feature/households-h6b`, from `develop` after H6a (#392). **Not merged, not deployed.** One additive migration, `20261120100000_add_ownership_offers`, proved on the test database before K.8. Deploy notes: section 12 of the H4 runbook. Before the release: the O36 count, and the O44 script if the count is not 0.

**The final gate (K.9), 2026-11-20, Node 22.17.1, every command alone, at `5cd82bf4`:**

| Command | Result |
|---|---|
| `pnpm lint` | exit 0 (4 warnings in `apps/web`, 13 in `e2e/`, the known ones) |
| `pnpm build` | exit 0, 21s; `grep TS6385` finds nothing. Server bundle 254.0 KiB, 15 `.graphql` files, start check 4401 in 489 ms |
| `(cd apps/web && pnpm build-storybook)` | exit 0 |
| `pnpm check` | exit 0 |
| `pnpm test` | run 1: exit 1, `e2eUsers.test.ts` 9 × `expected 401 to be 200` (passed alone right after). Run 2, alone: exit 0, web **3729 / 364**, server **2689 / 85**, `scripts/spec` **70**. At H6a: 3607 / 360, 2563 / 83, 70 |
| `pnpm test:e2e:all` | **exit 0 on the first run, no retry, no flaky test**: `local` 178 passed / 11 skipped (3m39s), `cloud` 197 passed / 7 skipped (58m43s), `pwa` 73 passed (1m34s); 63m56s in all. Load 2.70 at the start, 2.81 at the end |

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
| `ownership.banner.handover` | ~~The owner of {{household}} is gone.~~ Replaced by O45: The owner of {{household}} deleted their account. Do you want to become the owner? | ~~{{household}} 的擁有者已經不在了。~~ O45: {{household}} 的擁有者已刪除帳號。你要成為擁有者嗎？ |
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
