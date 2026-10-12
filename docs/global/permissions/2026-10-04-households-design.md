# Households — sharing locations and handing over ownership

**Date:** 2026-10-04
**Status:** 🔲 Designed, not built
**Branch:** `feature/households`
**Brainstorming log:** [2026-10-03-brainstorming-households.md](2026-10-03-brainstorming-households.md)
(23 decisions, with the reason for each — read it for the *why*; this doc gives the *what*)
**Changes:** [Location RBAC](2026-08-29-design-location-rbac.md). Its binding rule stays. Its
role table is replaced, and its six open questions are answered (see the last section).
**Blocked by:** nothing since 2026-10-08. Cloud-locations PR 5 merged as #332 (see *Sequencing*).
**Fixes when built:** issue #273 (unchecked tag / vendor ids), issue #327 (import takes over
another user's rows).

## Summary

### Where this sits

Cloud mode is single-user today. Every cloud row carries a flat `userId`, and
`requireLocationRole` (`apps/server/src/lib/authz.ts`) ignores its `role` argument. A family
cannot share a pantry, and if the account holder dies, nobody can take over their data.

This design adds **households**. A household owns a catalog (items, tags, vendors, recipes,
shelves) and a set of locations. People join a household, and get a role on each location
separately.

User stories:

1. As a location owner, I want to add members to my locations, so that I can share my pantry
   and cart status with my family.
2. As a location owner, I want to transfer ownership when I choose, or have it given to my
   family automatically when my account is deleted, so that my family can still manage the
   location after I pass away.

### Relation to other work

| Work | Relation |
|---|---|
| Cloud-locations PR 5 (drop `Item`'s stock columns and the dual-write bridge) | ✅ Merged 2026-10-08 (#332). It deleted `lib/stockDualWrite.ts` and two of the `isDefault` reads. |
| Issue #273 | Fixed here. Catalog ids are checked with `requireHouseholdRole`. |
| Issue #327, cart-id leak (`e2e/tests/cart-id-cross-user-leak.spec.ts`) | Fixed here, in the import work (*Import and export*). |
| Issue #330 (`replace` skips rows) | Not part of this. A separate fix. |
| Local mode | Not changed, except for the Settings layout and route moves. |

### What the user gets (once merged AND deployed)

- A household owner or manager can invite family members with a link, and choose what each
  person can do on each location.
- Family members see the shared pantry, cart and cooking pages of the locations they were
  given, and can edit them if they are a participant or organizer.
- An owner can hand the household to someone else. If the owner's account is deleted, the
  family is asked who wants to become the owner, and the first to accept does.
- Owners and managers can see who changed roles, who joined, and who ran a purge.
- Settings is split into a household area and a personal area. Every user sees this change,
  including in local mode.
- Nothing changes on screen for someone who never invites anyone, except the Settings layout.

### What the developer gets

| DX gain | Specifics |
|---|---|
| Fewer ways to get it wrong | `requireLocationRole` and the new `requireHouseholdRole` finally check roles. A resolver that forgets to call them is the one remaining mistake, and the tests below are written to catch it. |
| Less to remember | `Location.isDefault` and its partial unique index go away in cloud, with every fallback that read them (`ensureDefaultLocation` in import, carts and logs). |
| Honest documentation | The RBAC doc's six open questions get answers. |
| A failure that now has a name | Import of a row owned by another household no longer silently takes it over or drops it (#327). |

**DX cost, accepted.** Every route under `/settings/*` moves, so every E2E page object and test
that uses one changes. The data migration touches seven models. Two Clerk-related pieces are
new to run and test: a signed webhook, and E2E users without Clerk.

## Roles

There are two levels. Each role includes every right of the roles below it.

### Household roles

| Action | Owner | Manager | Member |
|---|---|---|---|
| Delete the household | ✅ | ❌ | ❌ |
| Transfer ownership | ✅ | ❌ | ❌ |
| Make a member a manager, or a manager a member | ✅ | ❌ | ❌ |
| Rename the household | ✅ | ❌ | ❌ |
| Clear household / delete all locations (purge) | ✅ | ❌ | ❌ |
| Edit the catalog (items, tags, tag types, vendors, recipes, shelves) | ✅ | ✅ | ❌ (read only) |
| Import data | ✅ | ✅ | ❌ |
| Invite people, remove members | ✅ | ✅ (members only) | ❌ |
| Give or remove **any** location role, on any location, for anyone, including themselves | ✅ | ✅ | ❌ |
| Delete a location | ✅ | ✅ | ❌ |
| See every location's **name** (not its data) | ✅ | ✅ | ❌ |
| Read the activity log | ✅ | ✅ | ❌ |
| Create a location (and become its organizer) | ✅ | ✅ | ✅ |
| Export what they can read | ✅ | ✅ | ✅ |
| Leave the household | ❌ (transfer first) | ✅ | ✅ |

### Location roles

| Action | Organizer | Participant | Viewer |
|---|---|---|---|
| Read stock, cart, logs | ✅ | ✅ | ✅ |
| Edit pantry, shopping, cooking | ✅ | ✅ | ❌ |
| Leave the location | ✅ | ✅ | ✅ |
| Give or remove participant / viewer | ✅ | ❌ | ❌ |
| Rename the location | ✅ | ❌ | ❌ |
| Remove all items from the location (purge) | ✅ | ❌ | ❌ |

### Rules that cross the two levels

- **A household role gives no location data.** Owner and manager see the list of locations and
  manage roles on them, but they see the stock, cart and logs only of locations where they hold
  a location role. This is for bug tracing: unless someone was officially added to a location,
  they cannot have changed its stock.
- Every location role change is written to the activity log, so a manager who adds themselves,
  changes stock, and leaves again is still visible.
- Organizers cannot make organizers, and cannot remove another organizer.
- Anyone can leave a location, even its only organizer. A location with no organizer keeps
  working. Owner and manager see a **No organizer** warning and can give the role to someone.
- Item settings (unit, expiration mode, and the other fields on `Item`) are catalog. Per-location
  stock (packed, unpacked, expiry date, target, refill) is location data. So a participant who
  is only a household member can change stock but cannot create an item.

The member rules (read-only catalog) are a first version. They may change after user feedback.

## Data model (cloud only)

### New models

| Model | Fields | Notes |
|---|---|---|
| `User` | `id` (Clerk id), `displayName`, `email`, `lastSeenAt`, `deletedAt?` | See *Clerk integration* |
| `Household` | `id`, `name`, `ownerId?`, `ownerGoneAt?`, `createdAt`, `updatedAt` | `ownerId` is null after the owner's account is deleted, until someone accepts |
| `HouseholdMember` | `householdId`, `userId`, `role` (`owner` / `manager` / `member`), `joinedAt` | Primary key `(householdId, userId)`. Exactly one `owner` row while `ownerId` is set |
| `LocationMember` | `locationId`, `userId`, `role` (`organizer` / `participant` / `viewer`), `createdAt` | Primary key `(locationId, userId)`. The person must be a `HouseholdMember` of the location's household |
| `HouseholdInvite` | `id`, `householdId`, `token` (unique), `householdRole`, `locationRoles` (JSON list of `{locationId, role}`), `createdBy`, `expiresAt`, `usedAt?`, `usedBy?`, `revokedAt?` | Single use, 7 days |
| `OwnershipOffer` | `householdId`, `toUserId`, `fromUserId?`, `kind` (`transfer` / `handover`), `createdAt`, `dismissedAt?` | `transfer`: the owner offered it. `handover`: the owner's account was deleted. Drives the prompt banner |
| `HouseholdActivity` | `id`, `householdId`, `actorId`, `action`, `targetUserId?`, `locationId?`, `details` (JSON), `createdAt` | See *Activity log* |
| `LocationPreference` | `userId`, `locationId`, `customOrder?`, `lastVisitedAt?` | Per-person location order and last visit |
| `UserPreference` | `userId`, `locationSort` (`name` / `lastUpdated` / `lastVisited` / `custom`) | Per-person sort mode. May be merged into `User` |

### Changed models

| Model | Change |
|---|---|
| `Location` | `userId` → `householdId`. **Drops** `order`, `isDefault` and the partial unique index on `isDefault`. **Adds** `dataUpdatedAt`, set by every write to its stock or cart (see *Writers of `dataUpdatedAt`*) |
| `Item`, `Tag`, `TagType`, `Vendor`, `Recipe`, `Shelf` | `userId` → `householdId`. `Shelf.order` stays shared, because shelves are catalog |
| `InventoryLog` | `userId` stays, and now means **the author**. Its scope comes from `locationId` |
| `Cart` | **Drops** `userId`. A cart belongs to its location and is shared by everyone there. The composite id `${locationId}:${vendorId \| 'no-vendor'}` stays |
| `CartItem` | `userId` stays, and now means **added by**. It stops being a scope: today every cart query filters cart items by `{ cartId, userId }` (`resolvers/cart.resolver.ts`), so in a shared cart each person would see only the items they added. Scope comes from the cart's location. Showing "added by" on screen is for a later phase |
| `ItemStock`, `ItemTag`, `ItemVendor`, `RecipeItem` | No change. Already scoped through a parent |

### Writers of `dataUpdatedAt`

PR 5 added `writeStock` in `apps/server/src/lib/itemStockWrite.ts`, but it is **not** the only
place stock is written. Its own plan says so. Each of these must set `Location.dataUpdatedAt`,
or "sort by last updated" will be wrong for that path:

| Writer | File |
|---|---|
| `writeStock` (used by `upsertItemStock`, `checkout`, `consumeRecipes`) | `lib/itemStockWrite.ts` |
| `applyUnitSwitch` (writes inside its transaction) | `resolvers/itemStock.resolver.ts` |
| `addItemToLocation`, `removeItemFromLocation` | `resolvers/itemStock.resolver.ts` |
| `bulkCreateItemStocks`, `bulkUpsertItemStocks` | `resolvers/import.resolver.ts` |
| every cart and cart item mutation | `resolvers/cart.resolver.ts` |

The plan decides between calling a shared helper from each writer and a database trigger. A
test must list the writers, so that a new one cannot be added without it.

### Migration of existing data

One migration, run once:

1. Create a `User` row for every distinct `userId` in the existing tables.
2. For each user, create a household named `<name>'s Household` (see *Default names*), with the
   user as owner.
3. Move every row from `userId` to that `householdId`.
4. Make the user organizer of every location they had.
5. Copy each location's `order` into the owner's `LocationPreference.customOrder`, and set
   their sort mode to `custom`, so their list looks exactly as before.
6. Drop `isDefault` and its index.

A user who never invites anyone sees the same pantry as before.

### Default names

| Thing | Name |
|---|---|
| A new user's household | `<name>'s Household`, e.g. "ET's Household". `<name>` is the Clerk first name, or the part of the email before `@`. Translated. The owner can rename it |
| A new household's first location | "Home". A normal location, with nothing special about it |

## Authorization

**Role names in code.** `LocationRole` in `apps/server/src/lib/authz.ts` is still
`'viewer' | 'member' | 'owner'`, and resolvers pass `'member'` (for example `checkout`). H3
renames it to `'viewer' | 'participant' | 'organizer'`, so `member` means only the household
role.

The RBAC doc's rule stays: **never write `row.userId === ctx.userId` as an authorization check.**

| Helper | Use |
|---|---|
| `requireLocationRole(ctx, locationId, role)` | Already exists, signature unchanged. The body reads `LocationMember`. `role` is `viewer`, `participant` or `organizer`, and a higher role passes a lower check |
| `requireHouseholdRole(ctx, householdId, role)` | New. Reads `HouseholdMember`. Used for the catalog, members, invites, purges and activity |

Every refusal throws the same `Forbidden` error, whether the row is missing or owned by someone
else, so a caller cannot probe for ids (as `requireLocationRole` does today).

Reads follow the same rules. A query for stock, carts or logs returns only locations where the
caller has a role. A catalog query returns the active household's catalog to every member.
The `itemCountBy*` queries (issue #273) count only within the caller's household.

Local mode has no role checks. Nothing in `apps/web/src/db/` changes for this.

## Flows

### First sign-in

1. The server creates the `User` row.
2. It creates `<name>'s Household` and a location "Home". The user becomes owner, and organizer
   of "Home".

A person who signs up through an invite link gets their own household too, then joins the
inviting one.

### Invite and join

1. An owner or manager opens **Members › Invite** and chooses a household role (`member`, or
   `manager` — owner only) and, optionally, location roles (e.g. organizer of *Kitchen*).
2. The server creates a single-use link that expires after 7 days. It can be revoked until used.
3. The person opens `/join/$token`, signs in, sees the household name, who invited them and
   their roles, and presses **Join**.
4. They now have the household and the given locations.

| Case | Result |
|---|---|
| Already in this household | "You are already in this household." The link is not used up |
| Expired, used or revoked link | "This invite is no longer valid. Ask for a new one." |

### Location roles

- Owner and manager give or remove any location role on any location.
- An organizer gives or removes participant and viewer on their location, choosing from the
  household's members.
- A member who creates a location becomes its organizer.
- Anyone leaves a location from its page.

### Household roles, removal and leaving

| Who | Can do |
|---|---|
| Owner | Change a member to manager or back. Remove anyone |
| Manager | Remove a member. Not the owner, not another manager |
| Manager, member | Leave |
| Owner | Cannot leave; transfer first |

When someone leaves or is removed, their household role and all their location roles in that
household end at once. Everything they created stays. Their logs keep their `userId`, so history
still shows their name.

### Transfer ownership

1. The owner picks a manager or member and presses **Transfer**. This creates an
   `OwnershipOffer` of kind `transfer`.
2. The person sees a banner and presses **Accept** or **Decline**. Nobody becomes owner without
   agreeing.
3. On accept, they become owner and the old owner becomes manager. Location roles do not change.
4. The owner can cancel before it is accepted.

### Owner's account is deleted

The Clerk `user.deleted` webhook arrives for a household owner.

| Household state | Result |
|---|---|
| Owner was the only person | The household and all its data are deleted at once |
| Has managers | `ownerId` becomes null. Each manager gets an `OwnershipOffer` of kind `handover` |
| No managers, some members organize a location | Those members get the offer |
| No managers, no member organizes a location | All remaining members get the offer |

Each person sees: "The owner of *ET's Household* is gone. Do you want to become the owner?" —
**Accept** / **Not now**. The **first** to accept becomes owner, and every other offer is
deleted. "Not now" hides the banner for that person. They can still accept from the Members
page.

Until someone accepts, everyone keeps their own rights. Only owner-only actions are unavailable.

When a person who is **not** an owner is deleted, their household and location roles are
removed. Their `User` row stays with `deletedAt` set, and logs show them as "Deleted user".

Only account deletion starts a hand-over in this phase. See *Postponed*.

### Create and delete a household

- Anyone creates another household from the **Switch to…** dropdown. They become owner, and
  organizer of its first location, "Home".
- Only the owner deletes a household, by typing its name to confirm. Everyone loses access.
- A person with no household sees a screen with a **Create a household** button. The app does
  not create one by itself.

### Checkout with a shared cart

`checkout` (`resolvers/cart.resolver.ts`) was written for one person per account. Its own
comment calls a cart row added during checkout "rare with one account per user". In a shared
cart it is common, and there are two more problems:

| Case | Today | Rule in this design |
|---|---|---|
| Someone adds a row after you opened the cart | The whole checkout fails with `BAD_USER_INPUT` | Checkout buys **only the cart rows the client sent**. Rows added later stay in the cart |
| Two people press checkout at the same time | No transaction. Both add the stock, so the purchase counts **twice** | Checkout runs in **one transaction** that removes the rows it buys. If they are already gone, it fails with "This cart was just checked out. Refresh to see it." |
| Someone changes the stock just before your checkout | The log stores the on-hand total the client computed, which is now wrong, with no error | The **server** computes the total from the saved `ItemStock` row, inside the transaction |

**Why the total moved to the client, and how this keeps that fix.** Parity-followup PR A (issue
#336) moved the log total to the client because the conversion needs `Item.amountPerPackage`,
and the resolver had only the `ItemStock` row. The server can read the `Item` in the same
transaction. The plan must move the conversion rule (`buildCheckoutLogQuantities`,
`apps/web/src/lib/checkoutQuantities.ts`) to code both sides can use, and keep its 6 unit
tests passing against the server version.

`consumeRecipes` sends a client-computed total for the same reason, so it has the same stale
total problem and gets the same fix.

### Purge

These replace today's `purgeUserData`.

| Who | Action | Deletes | Keeps |
|---|---|---|---|
| Owner | Clear household | the catalog and all locations, with everything in them | the household, its members, their household roles |
| Owner | Delete all locations | all locations, with stock, carts, logs and location roles | the catalog, the household, its members |
| Organizer | Remove all items from this location | the location's stock rows and its cart | the location, its roles, its logs, the catalog |

Each asks the person to type the household or location name. Each is written to the activity log.

### Activity log

`HouseholdActivity` records: location role given or removed, household role changed, invite
created or revoked, joined, left, removed, ownership offered, accepted or declined, every purge,
and every import. Each row has who acted, what, on whom or which location, and when. Owner and
managers read it, newest first. Stock changes are not in it — they are in `InventoryLog`.

## Screens

The Settings area is rebuilt in **both** modes.

### Desktop

**Main sidebar.** The top half does not change: app name, location switcher, Pantry, Shopping,
Cooking. At the bottom, **Settings** is replaced by:

1. 🏠 household name — opens the household sidebar
2. 👤 user name — opens the user sidebar

**Household sidebar.** Replaces the main sidebar, with a back button at the top left. Items 1–8
render in the main area.

| # | Item | Route |
|---|---|---|
| 1 | Config: household name, export / import, danger zone | `/settings/household` |
| 2 | Members, invites, leave, transfer owner | `/settings/household/members` |
| 3 | Locations | `/settings/household/locations`, `/settings/household/locations/$id` |
| 4 | Shelves | `/settings/household/shelves` |
| 5 | Vendors | `/settings/household/vendors` |
| 6 | Recipes | `/settings/household/recipes` |
| 7 | Tags | `/settings/household/tags` |
| 8 | Activity | `/settings/household/activity` |
| 9 | Switch to… — dropdown of households plus **Create new** | — |

- The sidebar shown is decided by the URL: any `/settings/household/*` route shows it.
- **Back** goes to the last Pantry, Shopping or Cooking page visited.
- The item-9 dropdown looks as much as possible like the location switcher's dropdown.
- Detail pages (one tag, vendor, recipe, shelf, or an item) stay full-screen with no sidebar, as
  today.
- `/settings` redirects to `/settings/household`.
- The old `/settings/tags`-style routes are **removed with no redirect**. The only production
  user is the developer.

**User sidebar.** Replaces the main sidebar, with a back button. Its content renders **inside the
sidebar**; the main area does not change, and there is no route. Items: user name, email, theme,
language, data mode (sign in / sign out), last sign-in and account created date. Name, email and
dates come from Clerk's `useUser()`.

### Mobile

- The top bar and the bottom bar look the same as today.
- `/settings` is a two-item accordion: 🏠 household (open by default, holding the nine household
  items; 1–8 open their pages, 9 opens the dropdown) and 👤 user (closed by default, its content
  shown inside the accordion).

### Location pages

**List** (`/settings/household/locations`):

- **Sort by** name, last updated, last visited or custom. Drag handles show only for custom.
  The order is personal.
- Each row shows the name and the person's role. Owner and manager also see locations where they
  have no role, marked **No access**, and a **No organizer** warning where it applies.
- **Create location** for everyone. **Delete** for owner and manager.

**One location** (`/settings/household/locations/$id`): name (organizer edits), people and their
roles with **Add person** (organizer, owner, manager), danger zone with **Remove all items**
(organizer), and **Leave location**.

### Location switcher

- Lists only locations where the person has a role, in their own order.
- Shows a **View only** badge for a viewer.
- "Manage locations" links to `/settings/household/locations`.
- With no locations: pantry, shopping and cooking show "You have no locations in this household
  yet" and a **Create a location** button.

### Read-only views

| Who | Sees |
|---|---|
| Member (not manager) | Shelves, Vendors, Recipes and Tags with no add, edit or delete controls. On the item page, catalog fields are read only; the Stock tab stays editable where they are a participant. "Create item" is hidden in search |
| Viewer of a location | No quick-update button, no "add to cart", no checkout, no "cook" |

### Prompts

A banner at the top of the app shows each open `OwnershipOffer`:

- `handover`: "The owner of *ET's Household* is gone. Do you want to become the owner?" —
  **Accept** / **Not now**
- `transfer`: "*ET* wants to make you the owner of *ET's Household*." — **Accept** / **Decline**

### Invite and empty screens

| Route / state | Shows |
|---|---|
| `/join/$token` | household name, who invited you, your roles, **Join** |
| No household | "You are not in any household." **Create a household** |

### Local mode

| Element | Local mode |
|---|---|
| 🏠 item | "My data" |
| 👤 item | "Preferences" |
| Household sidebar | Hides Members, Activity and Switch to |
| User sidebar | Hides name, email and dates |
| Routes | The same as cloud (`/settings/household/...`) |
| Everything else in this doc | Not present |

## Import and export

### Export: everyone exports what they can read

| Part | Included |
|---|---|
| Catalog | Yes |
| Locations, with stock, carts and logs | Only those where the exporter has a location role |
| Members, roles, invites, activity, offers | Never |

### Import: owner and manager only

| A location in the file… | Result |
|---|---|
| does not exist anywhere | Created with its id. The importer becomes its organizer |
| exists in this household, importer is organizer or participant | Its stock, cart and logs are imported, with skip / replace as today |
| exists in this household, importer is viewer or has no role | Skipped. The importer is told which ones |
| exists in **another** household | Copied with a new id (see below). The importer becomes its organizer |

### The new id rule

This **replaces** PR 4b's remap rule (`apps/web/src/lib/importData.ts:371-384`, "keep every
location id, except the file's default, which maps onto the destination's default"). That rule
needs a cloud default, and cloud no longer has one.

The new rule:

1. **Keep every id**, except in the two cases below.
2. **An id that already belongs to another household gets a new id**, for any table: locations,
   items, tags, tag types, vendors, recipes, shelves, carts. Every reference to it is rewritten:
   stock, carts and cart ids, cart items, logs, item tags and vendors, recipe items, shelf
   `itemIds` and `filterConfig`.
3. **The local default location** (id `'local'`) and **a file with no locations** both ask
   "Import into which location?" The household's "Home" is selected first, and **New location**
   is an option. This is one dialog for both cases.

Rule 2 is enforced by the **server**, not trusted from the client. The bulk import resolvers
check ownership of every id they are given. This fixes issue #327 and the cart-id leak: today the
nine `bulkUpsert*` mutations take over another user's row, and the `bulkCreate*` ones silently
drop it.

### Server code this replaces

These still read or write `isDefault` on `main` at `d63bd81f` and go in H3:

| Code | What it does today |
|---|---|
| `lib/defaultLocation.ts` (`ensureDefaultLocation`) | Creates "My Home" for a user with none. Called by the `locations` query and the two import resolvers. Its own comment says it goes in H3 |
| `lib/authz.ts` | `requireLocationRole` selects `isDefault` |
| `resolvers/location.resolver.ts` | `createLocation` writes `isDefault: false`; `deleteLocation` refuses the default |
| `resolvers/import.resolver.ts` | `bulkCreateLocations` / `bulkUpsertLocations` write `isDefault: false`; unknown cart and log locations fall back to `ensureDefaultLocation` |
| `schema/location.graphql`, `schema/import.graphql` | `isDefault: Boolean!` and comments that explain it |

### Copying between local and cloud

| Direction | What happens |
|---|---|
| Local → cloud | Into the user's own household (the one made at first sign-in). The local "My Home" goes where the user picks, as in rule 3 |
| Cloud → local | What the user can read in the **active** household. The **active** location becomes local "My Home"; every other location keeps its id |

Every import is written to the activity log.

## Clerk integration

Clerk stays the only source of truth for who a person is. The `User` table copies what this app
needs.

| Field | Source | How it arrives |
|---|---|---|
| `id` | Clerk | `ctx.userId`, already in every request |
| `displayName`, `email` | Clerk | webhook `user.created`, `user.updated` |
| `deletedAt` | Clerk | webhook `user.deleted` |
| `lastSeenAt` | this app | set on a signed-in request, at most once a day |

- **The webhook** is a new route, `POST /webhooks/clerk`, in `apps/server/src/index.ts`. Clerk
  signs each call with Svix, and the server must verify the signature before doing anything.
  The `user.deleted` event starts the hand-over flow, so a forged call would be serious.
- **Safety net.** If a webhook is lost, the request path creates a missing `User` row, reading
  name and email once from the Clerk API.
- **Setup.** A webhook secret in the Railway env and in the Clerk dashboard.
- **E2E.** The E2E header bypass skips Clerk, so the test server needs a way to create `User`
  rows and to send a fake `user.deleted` event. That route must exist only in E2E test mode,
  like `DELETE /e2e/cleanup`.

`lastSeenAt` is not used in this phase. It is stored now so the postponed inactivity trigger
has data when it is built.

## Postponed to a later cloud-improvement phase

| Postponed | Why |
|---|---|
| Inactivity as a hand-over trigger, with an owner setting (default 6 months, allowed 1–60) | Without a veto, it could hand over the household of an owner who is only on a long trip |
| Proactive claims, with a veto period (default 30 days, allowed 7–365) | The veto must reach an owner who no longer opens the app, which needs email |
| An email service (e.g. Resend or Postmark) | Not worth the cost for fewer than 5 users, all family |

Consequence: in this phase, story 2 works only after someone deletes the owner's Clerk account.

## Sequencing

Household work starts **after cloud-locations PR 5 merges**. It changes `userId` to
`householdId` on seven models and removes `isDefault`, and PR 5 changes the same code.

A suggested split. The plan will fix the final one.

| PR | Contents | User-visible |
|---|---|---|
| H1 | Settings layout and route moves (both modes). No backend change. Can start before PR 5 | Yes: new Settings layout |
| H2 | `User` model, Clerk webhook, `lastSeenAt`, E2E user creation | No |
| H3 | `Household`, `HouseholdMember`, `LocationMember`, the data migration, real role checks in both helpers, read scoping, `isDefault` removed. Fixes #273 | No (one household each) |
| H4 | Import and export: the new id rule, server ownership checks. Fixes #327 | The "Import into which location?" dialog |
| H5 | Invites, join, members page, location people page, switcher filtering, read-only views | **Yes: sharing works** |
| H6 | Transfer, hand-over, offers banner, purges, activity log | Yes: story 2 |
| H7 | Personal location order and sort, household switch and create | Yes |

## Testing notes

The root `CLAUDE.md` rules apply. Points special to this design:

- **Every role test needs a fixture with a second person who has a different role**, and a
  location the caller has **no** role on. With one person, "check the role" and "ignore the
  role" give the same answer, and the test proves nothing.
- **The Prisma fakes must model the new constraints** — `LocationMember` and `HouseholdMember`
  lookups that honour every `where` key, and the primary keys on both. A fake that ignores
  `role` leaves every role check unpinned.
- **Each helper call is mutation-checked**: delete the check, the test goes red.
- **Real SQL.** At least one cloud E2E spec must run two signed-in users against the same
  location, because no unit test runs the resolvers against Postgres.
- **The webhook** needs a test with a bad signature that is refused.

## Known gaps and risks

- **The migration is large.** Seven models change their scope column in one go. It needs the
  same care as PR 3b's cart re-key: a deploy runbook, and a check against a branch of production
  data.
- **The read-only member rules are a first version** and may change after feedback.
- **Hand-over needs a deleted Clerk account.** If nobody deletes it, the family cannot take over.
- **No email.** A person learns of an invite only from the link, and of an offer only by opening
  the app.
- **`UserPreference` may be merged into `User`.** Left for the plan.
- **Household switch shows the previous household's cart — confirmed, must be designed for.**
  `main` now documents this in `apps/web/src/hooks/useLocations.ts` (the comment on
  `useDeleteLocation`). `AllCarts` and `AllCartItems` are safe today only because their readers
  filter by `activeLocationId`. A household switch changes the household, not the location, so
  while `activeLocationId` still names a location of the previous household, its cart passes that
  filter and renders. **Requirement:** a household switch must, in one step, set the active
  location to one in the new household (or none), and clear the household-scoped Apollo cache
  entries (`Player1InventoryCloudCache` is persisted, so the clear must reach it too). A test
  must switch household with a cart in the old one and see no old cart rows.
- **E2E specs that depend on the default location.** `e2e/tests/settings/data-mode-migration.spec.ts`
  and `e2e/tests/settings/import-strategies.spec.ts` (added after this design was first written)
  expect `isDefault`, the name "My Home", and a local → cloud copy that finishes **without** a
  dialog. The helpers `e2e/helpers/backupAssertions.ts` and `e2e/helpers/cloudSeed.ts` find the
  default by its flag. H3 and H4 must rewrite all of them.
- **Issue #330 is pinned on purpose.** `import-strategies.spec.ts:440-459` expects the wrong
  value. Fixing #330 turns it red, and that is expected.
- **A second signed-in user in cloud E2E needs new test support.** The browser always runs as
  one fixed test user (`VITE_E2E_TEST_USER_ID`), and the API takes the user from the
  `x-e2e-user-id` header. A two-user spec needs a browser context per user. There is no
  test route yet to create a `User` row or to send a fake `user.deleted`.
- **H3's migration joins `verify:migration`.** It must be added to the `MIGRATIONS` list in
  `apps/server/scripts/verify-migration.ts`. That script now refuses to run if a test database
  URL equals any other database URL in the environment.
- **H1 touches about 48 route lines in 13 E2E files**, 23 of them in `a11y.spec.ts`. `e2e/` is
  now type-checked and linted inside the root `pnpm build`.
- **H3 breaks a stale browser bundle.** PR 5 was the first PR in the cloud-locations series that
  was not safe for an old bundle, and accepted it. H3 changes the GraphQL scoping and removes
  `isDefault` from the `Location` type, so it is the same kind of change. The plan must say so
  and plan the deploy the same way.

## Answers to the RBAC doc's open questions

| # | Open question in [2026-08-29-design-location-rbac.md](2026-08-29-design-location-rbac.md) | Answer |
|---|---|---|
| 1 | What governs entities with no location (tags, vendors, recipes, shelves)? | The household. Owner and manager edit, members read |
| 2 | Where does the role live? | `HouseholdMember` and `LocationMember` |
| 3 | What is owner-only? | Delete household, transfer ownership, manage managers, rename household, household-wide purges |
| 4 | Invite, join, leave | Invite links; leave a location or a household. See *Flows* |
| 5 | Data on removal | Stays in the household. Logs keep their author |
| 6 | Local mode | Out of scope, confirmed |

The RBAC doc's role table (owner / member / viewer on a location) is replaced by the two tables
in *Roles*.
