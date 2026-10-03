# Brainstorming — Households: sharing locations and handing over ownership

**Date:** 2026-10-03
**Status:** 🔄 In progress — roles, data model, first-phase hand-over and purge decided; flows decided; screens (Section 3) and import/export still open
**Branch:** `feature/households`
**Builds on:** [Location RBAC](2026-08-29-design-location-rbac.md). This log **changes** that
design: roles no longer live only on a `Location`. See *Decision 3* below.

## The user stories

1. As a location owner, I want to add members to my locations, so that I can share my pantry
   and cart status with my family.
2. As a location owner, I want to transfer ownership when I choose, or have it given to my
   family automatically when my account is deleted, so that my family can still manage the
   location after I pass away.

## Starting point (2026-10-03, `main` at `fbdd8869`)

- The RBAC doc decided three roles on a location (owner / member / viewer). **Nothing is
  built.** `requireLocationRole` in `apps/server/src/lib/authz.ts` still checks `userId` only
  and ignores its `role` argument.
- `Location`, `ItemStock`, `Cart`, `CartItem` and `InventoryLog` belong to a location.
- `Item`, `Tag`, `TagType`, `Vendor`, `Recipe` and `Shelf` belong to a **user** (`userId`).
- There is **no `User` model**. Users exist only in Clerk. The server knows only the Clerk id.
- There is **no account-deletion hook**. `purgeUserData` deletes everything a user owns.
- The RBAC doc left six questions open. The largest was question 1: what gives rights over
  entities that belong to no location (tags, vendors, recipes, shelves).

## Decisions

### Decision 1 — The catalog belongs to a household

**Question.** When a family member opens a shared location, whose items, tags, vendors and
recipes do they see?

Options offered:

| Option | Summary |
|---|---|
| Owner's catalog | The location shows its owner's catalog. Rights come through the location. |
| Catalog moves into each location | Every location has its own items, tags, vendors. |
| Merged catalog | A member sees their own catalog and the owner's, mixed. |

**The user asked:** what happens with "owner's catalog" when ownership is transferred?

**Answer given.** Transfer breaks it. If the owner has *Home* and *Cabin*, both use one
catalog. Giving *Home* away means **copying** every item, tag, vendor, recipe and shelf that
*Home* uses into the new owner's catalog, then re-pointing its stock, carts and logs. That
copy creates duplicates ("Milk" twice), splits the two locations' items apart, and must run
unattended for story 2. If it fails, *Home* points at a deleted catalog.

A fourth option was then offered: a **household** owns the catalog and its locations.
Transfer changes one owner field. Nothing is copied.

**Decided: Household owns the catalog.**

**Why.** It is the only shape where transfer (story 2) is a one-field change instead of a
copy-and-remap job. The cost was accepted: a person with two houses in two households keeps
two catalogs.

This also answers open question 1 of the RBAC doc: tags, vendors, recipes and shelves
belong to the household.

### Decision 2 — Who may claim ownership: a "manager" role

**Question.** What should trigger the automatic hand-over? Options: account deleted *and*
long inactivity (automatic, with warning); account deleted only; members claim after
inactivity.

**The user answered:** if the owner's account is deleted or inactive, **specified members
may claim ownership**. Those members get a new role, about "household manager", with more
rights than other members (invite, remove members, create and delete locations).

**Why.** Someone who dies does not delete their account, so "deleted" alone may never fire.
And the hand-over should go to a person the owner trusted in advance, not to anyone.

### Decision 3 — Two levels of roles (replaces the first role table)

A first table had four household roles: owner, manager, member, viewer. The user approved
it, then **moved one step back and replaced it** with two levels:

**Household roles.** Each role includes all rights of the roles below it.

| Action | Owner | Manager | Member |
|---|---|---|---|
| Delete the household | ✅ | ❌ | ❌ |
| Transfer ownership | ✅ | ❌ | ❌ |
| Assign or remove managers | ✅ | ❌ | ❌ |
| Edit the catalog (items, tags, vendors, recipes, shelves) | ✅ | ✅ | ❌ |
| Invite members, remove members | ✅ | ✅ | ❌ |
| Set any location role (organizer, participant, viewer) on any location | ✅ | ✅ | ❌ |
| Delete a location | ✅ | ✅ | ❌ |
| See the list of all locations | ✅ | ✅ | ❌ (only their own) |
| Create a location (the creator becomes its organizer) | ✅ | ✅ | ✅ |
| Claim ownership when the owner is gone | — | ✅ | fallback, see Decision 6 |

**Location roles.** First version — **replaced on 2026-10-04 by Decision 17**, which adds a
`participant` role between these two.

| Action | Organizer | Viewer |
|---|---|---|
| View stock, cart, logs of this location | ✅ | ✅ |
| Edit stock, cart, check out, cook from this location | ✅ | ❌ |
| Rename the location | ✅ | ❌ |

**Why two levels.** Different family members need different access to different places.
A household-only role cannot say "organizer of *Kitchen*, viewer of *Garage*, no access to
*Office*".

The RBAC doc's role table (owner / member / viewer on a location) is **replaced** by this.

### Decision 4 — Only owner and manager edit the catalog

**Question.** Items, tags, vendors, recipes and shelves belong to the household. An item's
settings (unit, expiration mode) affect every location. Who may edit them? The suggestion
was "anyone who is organizer of at least one location".

**Decided: owner and manager only.**

**Why (user's words, summarised).** Managers are family members who know technology well and
will not break things easily. Members may be elders or children who may not know what their
actions will cause.

**What this means for a member who is an organizer:**

| Action | Allowed |
|---|---|
| Change packed / unpacked / expiry / target / refill at their location | ✅ location data |
| Add an existing item to their location, cart, check out, cook | ✅ |
| Create a new item, or change an item's unit or expiration mode | ❌ ask a manager |
| Create or edit tags, vendors, recipes, shelves | ❌ |

So "create item from search" is hidden for members.

**The user noted:** try this in the first iteration. The rule may change after user feedback.

### Decision 5 — Owner and manager do NOT see location data by default

**Question.** Are owner and manager organizers of every location automatically?

**Decided: no.** They see the list of all locations and manage roles on them. They do **not**
see the stock, cart or logs inside a location until they add themselves (or are added) as
organizer or viewer.

**Why.** Bug tracing. When stock behaves unexpectedly, owner and manager are provably not the
cause unless they were officially added to that location.

**Follow-up decided:** a `LocationRoleLog` table records every location role change — who
acted, whose role, which location, old role, new role, time. Owner and manager can read it.
**Why:** without it, a manager could add themselves, change stock, and remove themselves
with no trace, which defeats the reason for this decision.

### Decision 6 — Small rules, decided together

| # | Question | Decided | Why |
|---|---|---|---|
| a | Who renames a location? | Its organizers. | It is location data. |
| b | Location order | **Per person.** Sort by name, last updated, last visited, or custom order. | Each family member uses the app differently. |
| c | A member with no location role | Sees an empty list. | Matches Decision 5: no role, no data. |
| d | Invite links | Can carry location roles (e.g. "organizer of *Kitchen*"), so the new member sees those locations at once. Only the owner can create an invite that gives `manager`. | A new member is useful right after joining. |
| e | Claim fallback | Managers claim first. If there are no managers, members who are organizer of at least one location can claim. | A household with no manager must still be recoverable. |

Rule (b) needs new storage: `LocationPreference(userId, locationId, customOrder,
lastVisitedAt)`, a per-person sort mode, and a server-kept `Location.dataUpdatedAt` for
"last updated". The shared `Location.order` column goes away.

### Decision 7 — No special default location in cloud

**The user asked:** would it be simpler to create a normal location for every new household,
instead of a special default one?

**Answer: yes, after cloud-locations PR 5.** `isDefault` does five jobs today. Each has a
replacement:

| Job of `isDefault` today | Where | Replacement |
|---|---|---|
| Dual-write bridge mirrors the default's stock to old `Item` columns | `lib/stockDualWrite.ts`, `itemStock.resolver.ts` | None needed. PR 5 deletes the bridge. |
| An old backup with no location puts stock in the default | `import.resolver.ts` | The import asks "Import into which location?" |
| A stale active-location id falls back to the default | `useActiveLocation` | Fall back to the first location the user can open, or the empty list. |
| A cart naming a deleted location falls back to the default (PR 4a) | `cart.resolver.ts` | Fall back to the location the import was told to use. |
| The default cannot be deleted, so a user always has a location | `location.resolver.ts`, `LocationList` | Not needed. An empty household is valid. |

**Decided:** a new household gets one normal location named "Home". Its creator is its
organizer. **Local mode keeps its default location** — local is single-user and out of
scope.

### Decision 8 — Inactivity settings are the owner's choice

> **⏸ Postponed on 2026-10-04 — see Decision 14.** The inactivity trigger, the claim and the
> veto all move to a later cloud-improvement phase. This section is kept as the record of
> what that phase should start from.

**Question.** How should a claim work when the owner is inactive but the account exists?
Offered: fixed 6 months + 30-day veto; owner picks 3 / 6 / 12 months; immediate claim.

**Decided:** the owner sets the period. Then the user widened it: both values are **free
numbers**, not a fixed list.

| Setting | Default | Allowed |
|---|---|---|
| `inactivityMonths` | 6 | 1 to 60 |
| `vetoDays` | 30 | 7 to 365 |

Flow: owner inactive for `inactivityMonths` → a manager claims → the owner is told → the
owner has `vetoDays` to refuse → otherwise the claimant becomes owner.

**Why limits.** Free numbers still need a floor, or an owner could set "0 days" and make the
veto meaningless.

### Decision 9 — Owner deleted with no manager

> **Changed on 2026-10-04 — see Decision 14.** Nobody "claims" in the first phase; eligible
> people are *asked*. The order of who is eligible (managers first, then members) still holds.

**Decided:** managers claim; with no managers, members claim (see Decision 6e); if only
people with no edit rights remain, the household is deleted after 30 days. Until someone
claims, people keep their location rights; only owner-only actions are unavailable.

**Why.** A family that never named a manager should not lose everything. Blocking account
deletion was rejected: it cannot stop a deletion made directly in Clerk, and does not help
the inactivity case.

### Decision 10 — Invite by link

**Decided:** single-use link, expires after 7 days, can be revoked. Shared through any chat
app. **Why:** no email sending needed for invites.

### Decision 11 — Household switcher

**Question.** A person is in several households. How do they move between them?

**Decided:** a separate household switcher above the location switcher. Picking a household
also picks its catalog (Settings › Tags, Vendors, and so on).

The recommended option, "one switcher with locations grouped by household", was not chosen.

### Decision 12 — A `User` model, synced from Clerk

**The user asked:** is a narrow `UserActivity` table better than adding `lastSeenAt` to the
existing `User`? There is no `User` model today, so the real choice was between a narrow
table and a new general one.

**Decided: a new `User` model.** The feature needs more than `lastSeenAt`: member lists need
names, the veto notice needs an email, and account deletion needs a row to mark.

| Field | Source | How it arrives |
|---|---|---|
| `id` | Clerk user id | Already in every request (`ctx.userId`) |
| `displayName`, `email` | Clerk | Clerk webhook `user.created` / `user.updated` |
| `deletedAt` | Clerk | Clerk webhook `user.deleted` |
| `lastSeenAt` | This app | Set on a signed-in request, at most once a day |

**Why a webhook.** A deleted user never sends another request, so without it the server
cannot tell "deleted" from "inactive".

**Why our own `lastSeenAt`.** Clerk's `last_active_at` costs one API call per owner per
check, with rate limits. Our column costs one small update per user per day, and works in
E2E test mode, which skips Clerk.

**Safety net.** If a webhook is lost, the request path creates the missing `User` row from
the Clerk API.

**New setup:** a Clerk webhook secret (Railway env + Clerk dashboard); a way for E2E tests to
create `User` rows, because the E2E header bypass skips Clerk.

### Decision 13 — Sequencing

**Decided:** household work starts **after cloud-locations PR 5 merges**. It changes
`userId` to `householdId` on seven models and removes `isDefault`; PRs 4b, 4c and 5 change
the same code.

### Decision 14 — First phase: ask, don't claim (2026-10-04)

**Context.** The veto in Decision 8 needs email, because an inactive owner will not see an
in-app banner. Clerk does not send our own custom emails, so this means a new email service
(for example Resend or Postmark).

**The user decided:** postpone the whole claim feature — inactivity trigger, claim, veto,
email, `inactivityMonths`, `vetoDays` — to a later cloud-improvement phase. For now the app
**asks** eligible people whether they want to take ownership, and they choose to accept.

**Why (user's words, summarised).** In the near future there will be fewer than 5 users, all
family members. An email service is not worth its cost for that.

**Question.** What makes a hand-over "available" in the first phase?

| Option | Result |
|---|---|
| **A. Account deleted only** | Only the Clerk `user.deleted` webhook starts it. No veto, because nobody is left to ask. Safe without email. |
| B. Deleted, or inactive for N months | Without a veto, a manager could take over from an owner who is only on a long trip, with no warning. |

**Decided: A, account deleted only.**

**Consequence, accepted.** Story 2 ("when I pass away") works only after someone deletes the
owner's Clerk account — the family, or the app admin. Inactivity can return in the later
phase, together with email and the veto.

**First-phase flow:**

1. The Clerk `user.deleted` webhook arrives for a household owner.
2. The household's `ownerId` becomes null.
3. Eligible people see a prompt: "The owner is gone. Do you want to become the owner of
   *<household>*?" — **Accept** / **Not now**. Eligible: managers; if none, members who
   organize at least one location.
4. The first person to accept becomes the owner. The prompt disappears for everyone else.
5. "Not now" hides the prompt for that person. They can still accept later from
   Settings › Household.

The `User` model and the Clerk webhook (Decision 12) are still needed: the webhook is what
starts the flow.

### Decision 15 — Members see read-only Settings pages (2026-10-04)

Members see Settings › Tags, Vendors, Recipes and Shelves as **read-only**. The create, edit
and delete controls are hidden. This answers open point 3.

### Decision 16 — Purging data, by role (2026-10-04)

These replace today's `purgeUserData` ("delete all my data").

| Who | Action | Deletes | Keeps |
|---|---|---|---|
| Owner | **Clear household** | the catalog (items, tags, tag types, vendors, recipes, shelves) and all locations, with everything in them | the household, its members and their household roles |
| Owner | **Delete all locations** | all locations, with their stock, carts, logs and location roles | the catalog, the household, its members |
| Location organizer | **Remove all items from this location** | the location's stock rows **and its cart** | the location, its roles, its **logs**, the catalog |

**Why the cart goes.** Otherwise the cart still lists items that are no longer stocked at the
location.

**Why the logs stay.** Decision 5 hides location data from owners and managers so that history
can show who changed what. Deleting logs would remove that history.

**Every purge is recorded** — who ran it, which action, when — in an activity log that owner
and managers can read. **Why:** without it nothing shows who emptied a location, which is
exactly what bug tracing needs.

### Decision 17 — Three location roles (2026-10-04)

The user added a role between organizer and viewer. Each role includes all rights of the
roles below it.

| Action | Organizer | Participant | Viewer |
|---|---|---|---|
| Read stock, cart, logs | ✅ | ✅ | ✅ |
| Edit pantry, shopping, cooking | ✅ | ✅ | ❌ |
| Leave the location | ✅ | ✅ | ✅ |
| Add or remove household members as participant / viewer | ✅ | ❌ | ❌ |
| Rename the location | ✅ | ❌ | ❌ |
| Remove all items from this location (Decision 16) | ✅ | ❌ | ❌ |

Confirmed details:

- Organizers do **not** make organizers, and cannot remove another organizer. Only owner and
  manager give or remove the organizer role.
- Rename and "remove all items" stay with organizers, not participants.
- A member who creates a location becomes its organizer.

**Why.** An organizer can share their own location with family without asking a manager,
but cannot hand out the right to share it further.

### Decision 18 — Default names (2026-10-04)

| Thing | Default name |
|---|---|
| A new user's household | `<name>'s Household`, for example "ET's Household" |
| A new household's first location | "Home" |

`<name>` is the first name from Clerk; if Clerk has none, the part of the email before `@`.
The name is translated, and the owner can rename the household. Existing users get the same
name when their data moves into a household.

**Why.** The first proposal, "My home", would confuse a person who sees several households in
the switcher: each one would be called "My home".

### Decision 19 — Answers to the Section 2 flow questions (2026-10-04)

| # | Question | Decided |
|---|---|---|
| a | Can a person leave a location? | Yes, anyone, **even its only organizer**. |
| b | A location with no organizer | Keeps working. Owner and manager can give the role to someone. |
| c | Hand-over when no manager and no organizer-member is left | **All** remaining members get the "become owner?" prompt. |
| d | Someone deletes their last household | Show an empty screen with a "Create a household" button. Do not create one by itself. |
| e | Activity log | One `HouseholdActivity` table, replacing `LocationRoleLog`. It records location and household role changes, invites, joins, leaves, removals, ownership transfers and every purge. Owner and managers read it in Settings › Household › Activity. Stock changes stay in `InventoryLog`. |

The rest of Section 2 was approved as presented: first sign-in creates a household and a
"Home" location; invite links carry a household role and optional location roles; the owner
manages managers; transfer needs the receiver to accept, and the old owner becomes manager;
a deleted owner who was the only person deletes the household at once; a deleted non-owner
keeps a `User` row with `deletedAt`, shown as "Deleted user"; only the owner deletes a
household, by typing its name.

## Data model so far (cloud only)

| Model | Fields | Notes |
|---|---|---|
| `User` (new) | `id`, `displayName`, `email`, `lastSeenAt`, `deletedAt` | Decision 12 |
| `Household` (new) | `id`, `name`, `ownerId` (nullable), `ownerGoneAt` | `ownerId` is null after the owner is deleted, until someone accepts. `inactivityMonths` and `vetoDays` are postponed (Decision 14) |
| `HouseholdMember` (new) | `householdId`, `userId`, `role` (`owner` / `manager` / `member`), `joinedAt` | Primary key `(householdId, userId)` |
| `LocationMember` (new) | `locationId`, `userId`, `role` (`organizer` / `participant` / `viewer`) | Decisions 3 and 17 |
| `HouseholdActivity` (new) | actor, action, target, details, time | Decision 19e. Replaces the `LocationRoleLog` of Decision 5 |
| `LocationPreference` (new) | `userId`, `locationId`, `customOrder`, `lastVisitedAt` | Decision 6b |
| `HouseholdInvite` (new) | `id`, `householdId`, `token`, household role, location roles, `createdBy`, `expiresAt`, `usedAt` | Decision 10 |
| `Location`, `Item`, `Tag`, `TagType`, `Vendor`, `Recipe`, `Shelf` | `userId` → `householdId` | `Location` loses `order` and `isDefault`, gains `dataUpdatedAt` |
| `InventoryLog` | gains `authorId` | History shows who made each change |
| `ItemStock`, `Cart`, `CartItem` | no change | Already scoped through `Location` |

**Existing data:** every user gets one household. All their rows move into it, they become
its owner, and they become organizer of all their locations. Nothing changes on screen for a
user who never invites anyone.

**Authorization:** `requireLocationRole(ctx, locationId, role)` keeps its signature; its
body reads `LocationMember`. A new `requireHouseholdRole(ctx, householdId, role)` covers the
catalog and membership. This also fixes issue #273.

**Local mode:** no change. No households, no role checks.

## Still open

1. ~~Section 2, the flows~~ — approved (Decisions 17–19).
2. **Section 3 — the screens**: Settings › Household, the two switchers, read-only pages.
3. ~~Email~~ — postponed with the claim feature (Decision 14).
4. ~~What members see of the catalog~~ — read-only Settings pages (Decision 15).
5. ~~`purgeUserData`~~ — replaced by three role-based purge actions (Decision 16).
6. **Import and export** must learn about households.

## Postponed to a later cloud-improvement phase

- Inactivity as a hand-over trigger, the owner's `inactivityMonths` setting.
- Proactive claims and the veto period, the owner's `vetoDays` setting.
- An email service for the veto notice.
