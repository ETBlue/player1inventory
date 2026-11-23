### Settings layout

Since households phase H1, every settings page except `/settings` itself lives under `/settings/household`
(plan: `docs/global/permissions/2026-10-31-households-plan.md`).

| Route | File | What it shows |
|---|---|---|
| `/settings` | `settings/index.tsx` | Desktop: `<Navigate to="/settings/household">`. Mobile: an accordion with two items. The household item (open), labelled by `HouseholdLabel`, holds six `SettingsNavCard` links, seven in cloud mode: **Members** is second there (households H5b task G.9). An owner or manager in cloud mode gets an eighth, **Activity**, after Tags (households H6 task J.6, `usePermissions().canReadActivity`). Cloud mode also ends the list with **Switch to…** (`HouseholdSwitcher variant="card"`, households H7 task L.4), for every household role; it is a menu, not a link. "Preferences" (closed) holds `UserSettingsPanel`. |
| `/settings/household` | `settings/household/index.tsx` | Title "General" (`settings.household.general.label`, the label of its own sidebar link, in both modes, since 2026-11-23; it was `HouseholdLabel` before), then `HouseholdNameCard` (cloud only), `ExportCard`, `ImportCard` and, for the cloud owner only, `HouseholdDangerZone` (households H6 task J.7: Clear household, Delete all locations, Delete household, each confirmed by typing the household name exactly as stored) |

**The household name (households H3a task 3.13).** In cloud mode the 🏠 sidebar link, the
household sidebar heading (next to the Back icon, on desktop) and the mobile accordion
trigger all show the household's name. Local mode has no household and keeps "My data"
(`settings.household.title`); cloud mode shows "My data" too while the name loads. All three
render `HouseholdLabel` (see `components/CLAUDE.md`). The household page's own `<h1>` showed
it too until 2026-11-23; it now says "General", like the other household pages, which title
themselves with their sidebar label. The name is shown as stored, with no
`capitalize`. Only the household `owner` can rename it, in `HouseholdNameCard`; the server
checks the role too (`renameHousehold`, `apps/server/src/resolvers/household.resolver.ts`).
Tests: `settings/household/index.cloud.test.tsx` (the page title is "General", not the
name; the name card and the sidebar heading show the name with no `capitalize`); the local
tests stay in `index.test.tsx` and `settings/index.test.tsx`.
| `/settings/household/members` | `settings/household/members.tsx` | Cloud only (local mode: `<Navigate to="/settings/household">`). Every person and their household role; Invite, open invites, role control, Remove and Leave by role. See *The Members page* below. |
| `/settings/household/activity` | `settings/household/activity.tsx` | Cloud only (local mode: `<Navigate to="/settings/household">`). The household activity log, for an owner or manager. See *The Activity page* below. |
| `/settings/household/{locations,shelves,vendors,recipes,tags}` | `settings/household/<section>/index.tsx` | The five list pages. Each has its own Back button on mobile only (`lg:hidden`). |
| `/settings/household/<section>/<id>…` | detail pages | Full-screen on every screen size |

On desktop the sidebar switches to `HouseholdSidebar` on `/settings/household` and the five
list pages. Theme, language, data mode and the account card are in `UserSettingsPanel`,
which desktop shows in the user sidebar (the 👤 button). Which pages are full-screen is
decided by `isFullscreenPage(pathname, { desktop })` in `src/lib/layoutRules.ts`. See
`components/CLAUDE.md` (`Navigation`, `Sidebar`) for the full table.

### The Members page (cloud, households H5b task G.9)

Plan: `docs/global/permissions/2026-11-18-households-plan-h5b.md`, Task G.9. Server fields: `apps/server/src/schema/household.graphql`.

| Household role | Sees |
|---|---|
| owner | every person; on every other row the role control (`member` ↔ `manager`), Remove and **Transfer ownership**; **Invite someone** (member or manager); every open invite with Copy link and Revoke; `ownerCannotLeave` on their own row instead of Leave |
| manager | every person; Remove on `member` rows; Leave on their own row; Invite (member only, O3-A); the `member` invites, Copy link and Revoke |
| member | every person and role, no e-mail; Leave on their own row; no invites (O13-A) |

- The rights come from `usePermissions()` (`canManageMembers`, `isHouseholdOwner`); which ROW gets which button is `memberActions` in `components/household/MemberList`. The server checks every write.
- An owner who is the only person sees the `alone` note: joining another household through an invite deletes this one when it holds no data (decision T21). The page cannot see whether the household holds data.
- Errors: one toast, `settings.household.members.error`; none for an `OfflineWriteError`.
- A revoke that answers `false` refetches the list and shows no message.
- Leave and Remove cannot be confirmed twice while one runs: "Leaving…" / "Removing…" replace the button (review of G.9). After a Remove focus moves to the page heading, after a Revoke to the **Open invites** heading, because the button that had focus goes away.
- A failed invites read shows `invitesLoadError`, not "No open invites.".
- **"No location roles"** (households H5c task H.6, owner decision O28-A): an owner or manager (`canManageMembers`) sees `noLocationRoles` and a link, **Give a location role** (`giveLocationRole`), on the row of a person with `hasLocationRole: false` (a person who joined with no location role, O14-A). The link goes to Settings › Locations; the role is given on a location's page with **Add person**. A member sees no mark: they cannot give a location role.
- Leave: see `useLeaveHousehold` in `hooks/CLAUDE.md`.
- **Ownership (households H6b task K.7).** Hooks: `hooks/useOwnershipOffers.ts`. Components: `MemberList` (`components/CLAUDE.md`).

  | Who | Sees |
  |---|---|
  | owner (`canTransferOwnership`) | **Transfer ownership** on every other row. It asks first: "Offer {household} to {name}? You become a manager when they accept." After it, that row says "Waiting for {name} to accept" with **Cancel**, and no row offers a transfer (one offer at a time; `GetHousehold.pendingTransfer`). A Cancel that answers `false` (the person answered first) shows the toast `ownership.gone`. A refused write shows `members.error`. Focus moves to the page heading after either |
  | everyone, when `GetHousehold.hasOwner` is `false` | "This household has no owner." above the list |
  | a person with an open offer for THIS household | **Become the owner** above the list, described by the text above it: the "no owner" note for a hand-over, `ownership.banner.transfer` for a transfer. `MyOwnershipOffers` holds offers of every household, so the page filters by `householdId`. A dismissed offer ("Not now") counts, also after a decline that left nobody else (owner decision O42-A). Toasts: `ownership.accepted`, `ownership.gone` (`isOfferGoneError`), `ownership.failed`; none for an `OfflineWriteError` |
  | the last live person | the Leave confirm says `lastLeaveWarning`: leaving deletes the household and everything in it (owner decision O37-A). "Last" is "only me in `householdMembers`", which lists live accounts only, the same rule as the server's `leaveHousehold` |
  | everyone with Leave | Leave shows but cannot be pressed until the server has answered `householdMembers` in this visit (`useHouseholdMembers().isFromServer`; households H6b task K.7b, owner decision O48). The first list may be the cache restored from IndexedDB; if the last other person left since, that list would hide `lastLeaveWarning` while the server deletes the household. Offline, Leave stays off; a leave could not be sent then anyway |

  The page has no Decline and no Not now: a person answers no from the banner (`OwnershipOfferBanner`).
- Mobile: not full-screen, like Locations; the page has its own Back button (`lg:hidden`).
- Tests: `members.cloud.test.tsx` (the real route tree, real Apollo hooks, `MockedProvider`; every fixture holds all three roles), `members.test.tsx` (local mode), `components/household/MemberList/MemberList.test.tsx` (every caller × row pair), `lib/copyText.test.ts`. Stories: `Owner`, `Manager`, `Member`, `WithOpenInvites`, `InviteDialogOpen`, `OwnerSeesNoLocationRoles`, and since K.7 `OwnerWaitingForAccept`, `NoOwnerBecomeOwner`, `LastPersonLeaves` (`CloudRolePage`'s `ownership` prop sets `hasOwner` and `pendingTransfer`). The axe scans (light and dark) belong to G.10's cloud spec, because `a11y.spec.ts` does not run in cloud. Since households H6b task K.8, `household-ownership.spec.ts` scans the waiting row and the transfer confirm (light and dark). The "no owner" note with **Become the owner** is not scanned yet.

### The Activity page (cloud, households H6 task J.6)

Plan: `docs/global/permissions/2026-11-20-households-plan-h6.md`, Task J.6. Hook: `useHouseholdActivity` (`hooks/CLAUDE.md`). List: `ActivityList` (`components/CLAUDE.md`).

| State | What shows |
|---|---|
| `errorCode === 'FORBIDDEN'` (a member, or a manager demoted in another tab), OR the household role is known and below manager (`usePermissions()`: `roleKnown && !canReadActivity`) | `noAccess` and a link back to `/settings/household`. The old rows are NOT shown. Read from `errorCode`, never `isError`: after a demote Apollo keeps the old rows and `isError` stays `false`. The role check was added in the J.6 review: rows from an earlier manager session can stay in the Apollo cache (stored in IndexedDB), and `cache-and-network` showed them until the FORBIDDEN arrived, or for good when offline. A role still loading does not hide the rows; the server decides |
| loading | the spinner |
| any other error, or no data | `loadError` and **Retry** (`refetch`) |
| rows | `ActivityList`, then **Load more** while `hasMore`, off while `isLoadingMore`. A failed page shows `loadMoreError` (role `status`) and the rows stay; **Load more** tries again |
| no rows | `empty`: "Nothing has happened here yet." |

- After "Load more", focus moves to the first new row, because the button may be gone (end of the log). An empty page moves focus to the page heading.
- The sidebar and the mobile accordion list the page only for `canReadActivity`. The server is the real check.
- Mobile: not full-screen, like Members; its own Back button (`lg:hidden`).
- Tests: `activity.cloud.test.tsx` (the hook replaced, each state), `activity.test.tsx` (local mode), `components/household/ActivityList/ActivityList.test.tsx` (every action, tw word order, fallbacks), `components/global/Sidebar/HouseholdSidebar.activity.test.tsx`, `routes/settings/index.activity.test.tsx`. Stories (real route, real hook): `Owner`, `Empty`, `Loading`, `NoAccess`, `LoadError`. The axe scans (light and dark) belong to J.8's cloud spec, because `a11y.spec.ts` does not run in cloud.

### The Items tabs are global assignment pages

Settings entities (tags, vendors, recipes, shelves) are **global**, and so are the
four `…/$id/items` assignment tabs that attach items to them. Since issue #247
part 2 those tabs neither read nor write the active location's stock.

Three rules, all four tabs alike
(`settings/household/{tags,vendors,recipes}/$id/items.tsx`, `settings/household/shelves/$shelfId/items.tsx`):

1. **No stock is rendered.** Each passes `showStock={false}` to `ItemCard`,
   which suppresses all four stock-derived renderings — the quantity text
   (which carries the unit as a trailing word), the `ItemProgressBar`, the
   **severity card tint** and the **inactive dimming**. The last two are styling rather than content and are
   exactly what a partial gate misses: a card still tinted red or still dimmed
   is still leaking one location's state onto a global page. See
   `components/CLAUDE.md`.

2. **Two buckets, not four.** Rows are ordered *assigned, then unassigned*, each
   keeping the toolbar's sort order. There is deliberately **no** active/inactive
   split: "inactive" is `targetQuantity === 0`, which stayed per-location after
   the v16 field move (see `src/db/CLAUDE.md`), so it has no global meaning here.
   Worse, `useItems()` joins the **active** location, so an item stocked only
   elsewhere arrives zeroed and a bare `isInactive()` would sink it — the
   `stockId` trap documented in `lib/quantityUtils.ts`. Removing the bucketing
   removed four instances of that trap; do not reintroduce `isInactive` on these
   pages.

3. **Create-from-search creates globally and stocks nowhere.** Typing a name
   that matches nothing offers `+ Create "<name>"`; the new item lands in the
   catalog attached to this entity, with **no `ItemStock` row in any location**.
   **All four tabs create inline — none of them opens a dialog.** Each holds its
   own `useCreateItem({ catalogOnly: true })` and its `handleCreateFromSearch`
   creates the global item, then writes the relation (tags/vendors append to the
   item's `tagIds`/`vendorIds`, recipes append a `RecipeItem`, shelves append to
   `shelf.itemIds`), wrapped in a `try/catch` that leaves the search input
   populated for retry. `catalogOnly` stays opt-in on the hook because the
   pantry's Add flow (`NewItemDialog`) must keep stocking here. The created item
   is an intentional **orphan** — already a supported state: `getAllItems`
   surfaces it with `ZERO_STOCK` and no `stockId`, `getStockedItems` (and
   therefore the pantry) excludes it, and the Add combobox finds it.

   Field values are identical on all four tabs, and **none of them passes
   `consumeAmount` at all**. The shelves-vs-others divergence (shelves `0`, the
   other three `1`) was reconciled by *deletion*: every interactive create path
   omits the field so the single default in `createItem` (`db/operations.ts`)
   governs, with the cloud resolver
   (`apps/server/src/resolvers/item.resolver.ts`) matching it.

   **The default is `1` (designer ruling, 2026-08-24).** It was briefly `0`
   (ruling of 2026-08-23, commit `6302ee97`): a brand-new item was created
   *unconfigured* so `ItemForm`'s `consumeAmount > 0` validation opened it on
   "Must be greater than 0." as a "still needs setting up" signal. Having hit
   that validation in practice the designer reversed it — a new item must be
   **valid by nature**, so both defaults are now `1` and a fresh item opens
   clean. Keep it in exactly those two places; do not reintroduce a literal
   `consumeAmount` at any call site to express it.

   **`ItemForm`'s `consumeAmount > 0` validation stays** — 0 is still a legal
   stored value (set explicitly, restored from a backup, or carried by an item
   created while the 0 default was live) and still means "no step size", shown
   honestly. See `routes/items/CLAUDE.md`.

   One knock-on lives on the recipes tab: it attaches the new item with
   `defaultAmount: newItem.consumeAmount || 1`. `defaultAmount: 0` means
   "optional, unchecked" in cooking, so without the `|| 1` an ingredient
   carrying a 0 would silently do nothing. Redundant for the new default, but
   still load-bearing for a 0 from any other source. The `|| 1` matches the
   sibling `handleToggle` path, which already had it.

**The select-existing asymmetry is closed.** Until the tags/vendors/recipes tabs
went inline they mounted `NewItemDialog`, whose *select-existing* path stocks the
chosen item in the active location via `useAddItemToLocation()` — the one
remaining way a Settings page wrote location state. Removing the dialog removed
that path, so no Settings tab reads or writes `ItemStock` any more. The pantry's
Add dialog still stocks on select-existing, which is correct there.

### Catalog-only create is live in cloud too (PR 2)

The three rules above are fully mode-agnostic since cloud-locations PR 2. `catalogOnly`
skips the `ItemStock` write in **both** modes: no new GraphQL affordance was needed, because
`useCreateItem`'s cloud branch runs `createItem` and then simply omits the follow-up
`upsertItemStock` the pantry's Add flow performs. The obligation recorded here — "when cloud
gains `Location`/`ItemStock`, the tabs must not silently resume stocking every
Settings-created item in a default location" — is discharged, and pinned by a cloud test.

`useAddItemToLocation` also became dual-mode in PR 2, so the select-existing path the
Settings tabs deliberately do **not** mount would now write cloud stock as well. That does
not change these tabs: none of them mounts `NewItemDialog`, which is what closes the
asymmetry described above, and the guard is structural (no dialog) rather than a mode
branch.

### The shelf list row shows a filter count

`settings/household/shelves/index.tsx`'s `SortableShelfRow` renders its `CardMetadata` as
`<type icon> N filters · M items` — the item count stays last, separated by the
muted `·` span idiom `components/shared/GroupCard/GroupCard.tsx` uses between its
own metadata segments. Strings on this page are hardcoded English, not i18n.

**The filter count is selected OPTIONS, not axes.** It comes from
`countSelectedFilters()` (`lib/shelfUtils.ts`) — `tagIds.length +
vendorIds.length + recipeIds.length`, i.e. exactly the badges the user toggled on
the Filters tab. It is deliberately **not** `deriveFilterAxes().length`, which
collapses every tag of one tag type into a single axis and would report 2 where
three badges are lit. A filter shelf whose `filterConfig` is absent, `{}`, or
all-empty reads 0 and still renders "0 filters" — it is still a filter shelf.
Fields are normalised with `?? []` (not destructuring defaults) because a
restored backup can carry `null` on any of the three arrays; see
`matchesFilterConfig` for the same trap.

**Selection shelves omit the count entirely.** Membership there is manual, so a
"0 filters" would be noise rather than information. The virtual "Unsorted" row is
untouched. Plurals follow the surrounding style: `filterCount === 1 ? 'filter' :
'filters'`.

The pantry `ShelfList` / `GroupCard` surface is unrelated and unchanged — the
filter count lives only on the settings page row.

### Shelves for a household member (cloud, households H5 task F.5)

There is no shelves `CLAUDE.md`, so the member rules are here. A household `member` gets no Add shelf, no delete and no drag handles on `/settings/household/shelves`, with the `settings.catalogReadOnly` note above the list. The shelf Info tab is read only with the `settings.catalogReadOnlyItem` note. The Items tab checkboxes are disabled. On a filter shelf's Filters tab every badge (tag, vendor, recipe) shows what is selected, is `aria-disabled`, and a press writes nothing. No note shows while `usePermissions().roleKnown` is `false`. Tests: `routes/settings/household/catalogReadOnly.test.tsx`, `catalogDetailReadOnly.test.tsx`, `catalogItemsReadOnly.test.tsx`.

### Shelf filters tab shows global counts

`settings/household/shelves/$shelfId/filters.tsx` renders ` (N)` after every tag, vendor
and recipe badge, so the user can see how many items each filter option selects.
The counts come from the map-shaped hooks `useTagItemCounts()`,
`useVendorItemCounts()` and `useRecipeItemCounts()` (`src/hooks/CLAUDE.md`) —
per-id helpers like `getItemCountByTag` are one async query each and cannot be
called in a badge loop.

**The tag count expands descendants.** The shelf tag filter selects a tag *and
all its descendants* (`lib/shelfUtils.ts`, `getTagAndDescendantIds`), so a
direct-assignment count would report 0 for a parent tag that in fact selects a
dozen items. `useTagItemCounts()` runs the same expansion; vendors and recipes
have no hierarchy and count plain membership.

These are **per-entity** counts ("how many items carry this tag"), not a preview
of the composed filter — whose real semantics are OR-within-tag-type,
AND-between-types.

### Cascade Deletion

Deleting a tag, tag type, or vendor automatically cleans up all item references:

- **Delete tag** → removes tag from all item `tagIds` arrays (+ bumps `updatedAt`)
- **Delete tag type** → deletes all child tags (which cascade to items), then deletes the type
- **Delete vendor** → removes vendor from all item `vendorIds` arrays (+ bumps `updatedAt`)
- **Delete location** → deletes that location's `ItemStock` rows, its `inventoryLogs`, and its carts + cart items; in local mode the location flagged `isDefault` cannot be deleted. Cloud has no default location (households task 3.12): any location can be deleted, the household's last one too since households H5 task F.7 (before, the server refused it with `LAST_LOCATION`). Global `Item`s survive — see `settings/household/locations/CLAUDE.md`

**Local mode:** Cascade logic lives in `src/db/operations.ts` (`deleteTag`, `deleteTagType`, `deleteVendor`). The hooks (`useDeleteTag`, `useDeleteTagType`, `useDeleteVendor`) also invalidate the `['items']` query cache after deletion.

**Cloud mode:** Cascade is handled server-side in the GraphQL resolvers (`apps/server/src/resolvers/tag.resolver.ts`, `vendor.resolver.ts`) using Prisma `deleteMany` / `updateMany` — no extra client-side cleanup needed.

**Count helpers** for confirmation dialogs: `getItemCountByTag`, `getItemCountByVendor`, `getTagCountByType` in `src/db/operations.ts`; corresponding hooks `useItemCountByTag`, `useItemCountByVendor`, `useTagCountByType`.
