### Location Management

Location CRUD at `/settings/household/locations`. A **Location** is a place the user stocks things — a home, a second home, a storage unit. It is the scoping unit for all stock-bearing data: every `ItemStock`, `InventoryLog`, and `ShoppingCart` belongs to exactly one location.

**`Location` type** (`packages/types/src/index.ts`): `id`, `name`, `order`, `isDefault?`, `createdAt`, `updatedAt`. `isDefault` is optional and **local only** since households task 3.12: cloud rows never carry it. **Both modes** — local is the Dexie `locations` store (`isDefault` added in v18, see `src/db/CLAUDE.md`); cloud is the Prisma `Location` model behind `apps/server/src/schema/location.graphql`, added in cloud-locations PR 1.

**Local mode has a default location; cloud mode does not** (households task 3.12).

| | Local | Cloud |
|---|---|---|
| Default location | "My Home", `isDefault: true`, id `DEFAULT_LOCATION_ID = 'local'` | none. Rows carry no `isDefault`: the `GetLocations` document stopped selecting it. The server still declares the field until task 3.14 |
| Can a row be deleted? | every row except the default. `LocationList` shows a `Lock` icon instead of the drag handle and a spacer instead of Delete, and `deleteLocation` (Dexie) throws if called anyway | every row, the household's **last** location too (since households H5 task F.7, owner answer O8). Until then the server refused the last one with the error code `LAST_LOCATION` (decision H13). With no location, Pantry, Shopping and Cooking show the empty screen (`NoLocationsGate`, see `routes/CLAUDE.md`) |
| Fallback when the active id names no location | the `isDefault` row, then the first row | the **first** location. The server returns the list by `order` |

`LocationList` locks a row only when `location.isDefault === true`. Never read the flag as a plain boolean: it is `undefined` on every cloud row.

**The list shows every role's view (households H5 task F.3).** The page reads
`useHouseholdLocations()`, not `useLocations()`. In cloud that is the
`householdLocations` query: an owner or manager gets EVERY location of the
household, with `myRole: null` where they have no role; a household member gets the
same list as the switcher. The switcher keeps `useLocations()` (only locations with a
role). What each row shows and allows:

| | Who | Source |
|---|---|---|
| role text ("Organizer", "Participant", "Viewer"; `roles.location.*`) | cloud only (`showRoles`) | the row's `myRole` |
| "No access" (`settings.locations.noAccess`) | cloud, a row with `myRole: null` | the row |
| "No organizer" (`settings.locations.noOrganizer`) | cloud, a row with `hasOrganizer: false` | the row |
| Delete | household `owner` or `manager` (`canManageLocations`) | `usePermissions()` |
| drag handle | every household role (`canReorderLocations`, households H7b decision T78: the order is the person's own), and only while **Sort by** is **Custom** | `usePermissions()` and `useLocationSort()` |
| **Sort by** (`LocationSortSelect`, households H7b task M.4) | everyone. Cloud: Custom, Name, Last updated, Last visited, saved per person (`myLocationSort` / `setLocationSort`). Local: Custom and Name only, in `localStorage['location-sort']` (owner decision O54-B) | `useLocationSort()` |
| Rename | `organizer` of THAT location (`isOrganizerAt`) | `usePermissions()` |
| Add | everyone (the server asks household `member`) | — |
| the name is a link to the people page, `/settings/household/locations/$id`, named "Open {name}" (`settings.locations.open`) | cloud: a household `owner` or `manager` on every row, "No access" rows too (owner decision O24-A); anyone else only where they hold a role. Local: never (no people page, decision T41) | `usePermissions().canOpenLocationPage`, passed as `LocationList`'s `canOpen` (households H5c task H.6) |

**The page sorts the rows itself** (households H7b, decision T81): `useLocationSort().sorted`
calls `sortLocations` (`lib/locationSort.ts`) with the person's sort and the app language
(`zh-TW` names for `tw`). The switcher uses the same hook (owner decision O53-A). In cloud,
each list's `order` is the row's place in the list the server sent, not the cached field
(`useLocations`, `useHouseholdLocations`): both lists share one `Location` entity, and
their positions differ when the settings list holds "No access" rows.

**A reorder sends every row of this list.** Since H5 task F.2 the server refuses a list
that leaves out a location of the household (`BAD_USER_INPUT`), so an owner or manager
with a "No access" row could not reorder until this page moved to `householdLocations`.
Since H7b the order is per person (decision T78): the server saves it for the caller
only, and a household `member` may reorder their own list.
`useReorderLocations` writes the server's answer into `GetLocations` and puts the
cached `GetHouseholdLocations` rows in the order that was sent, because the answer holds
only the caller's own locations. Create, rename and delete refetch
`GetHouseholdLocations` by name.

**Only the NAME is a link, not the whole row** (households H5c task H.6). The drag handle, Rename and Delete stay separate buttons. Only the handle carries the drag listeners: the link must never get them, because dnd-kit's `KeyboardSensor` starts a drag on Space or Enter on any element that has them (a mouse click cannot show it, the `PointerSensor` waits for an 8 px move). The name is underlined at rest, like the links in `MemberList`. An owner's or manager's "No access" row links too: its page shows names and roles, never the location's stock, carts or logs (O24-A). A household `member` never gets a "No access" row from the server; if one came, it would not be a link. Location names render as stored, in the link too.
The role text has a visually hidden prefix, `settings.locations.yourRole` ("Your role:"), so
a screen reader says "Kitchen, Your role: Viewer", not "Kitchen Viewer". The `<ul>` has no
`role="list"`: Biome refuses it (`noRedundantRoles`), so Safari with VoiceOver may not
announce it as a list.

**A refused reorder shows a toast** (`handleReorder`), chosen by the error code. The hook
(`useReorderLocations`) decides what to reload by the same code:

| Error | Toast (`settings.locations.*`) | The hook reloads |
|---|---|---|
| `BAD_USER_INPUT` (the list was not the household's full set) | `reorderError`: "The location list changed. Reloading it now. Try again." | `GetHouseholdLocations` and `GetLocations` |
| `FORBIDDEN` (since H7b: the list holds a location that is no longer in the caller's own list, after a lost role or a lower household role) | `reorderError` | `GetHouseholdLocations`, `GetLocations` and `GetHousehold`. Until H7b this was "no longer an owner or manager", with `reorderFailed` and only `GetHousehold` |
| `OfflineWriteError` | none from the page (the same rule as delete) | nothing |
| anything else (a network error) | `reorderFailed` | nothing |

No toast once the page has unmounted (a `mounted` ref): it would talk about a list the user
no longer sees. The reload still runs. Until the review of H5 task F.4, every refusal except
offline showed "… It has been reloaded …" and reloaded both lists, which was untrue for a
network error or `FORBIDDEN`, and too early even for `BAD_USER_INPUT` (the reload had only
started).

**While the first cloud load runs, the page shows `LoadingSpinner`**, not the empty state.
Before the review of H5 task F.3 it showed "No locations yet" until the list answered.

**A failed delete shows a toast** (`handleDelete` in `index.tsx`). It reads the error code with `hasGraphQLErrorCode` (`src/lib/graphqlErrorCode.ts`), never the message text:

| Error | Toast (`settings.locations.*`) |
|---|---|
| `OfflineWriteError` (cloud, no network) | none from the page. `offlineWriteLink` (`src/apollo/offlineWriteLink.ts`) has already shown `pwa.writeBlocked` before it rejects, so the page returns early instead of adding a second toast |
| anything else (another code such as `FORBIDDEN`, a Dexie error) | `deleteError`: "Could not delete this location. Please try again." |

Until households H5 task F.7 the table had a `LAST_LOCATION` row with its own text
(`deleteLastError`, "You cannot delete your last location. Add another location first.").
F.7 deleted the row and the key. An older server that still answers `LAST_LOCATION` (the
deploy window) gets the general `deleteError`.

Before task 3.12 the page called `deleteLocation.mutate(location.id)` with no `onError`, so a refused delete showed nothing.

`DEFAULT_LOCATION_ID = 'local'` still exists (exported from `@/types`). It is the id of the local default only. In local mode the default is also not derivable from `order`: `LocationList` disables dragging *of* the default row, but dnd-kit's `disabled` only stops that row being picked up — another row dragged above it still displaces it.

**Operations** (`src/db/operations.ts`): `getLocations` (ordered by `order`), `createLocation(name)` (appends after the current max `order`), `updateLocation(id, updates)`, `deleteLocation(id)`, `reorderLocations(orderedIds)`.

**Delete cascade (local).** `deleteLocation` refuses the default location (`if (location.isDefault) throw`), then removes everything scoped to the location being deleted:
- its `itemStocks` rows (`where('locationId')`),
- its `inventoryLogs` (`where('locationId')`),
- its shopping carts (`id` prefixed `${locationId}:`) and every `cartItem` in them,
- finally the `locations` row itself.

Global `Item`s are **not** touched — an item stocked only in the deleted location survives as an orphan (see below). If the deleted location was the active one, `useActiveLocation` falls back to the **`isDefault`** location (local) because the stored id no longer matches any location.

**Delete cascade (cloud).** Postgres `ON DELETE CASCADE` removes the location's `ItemStock` rows and — since PR 3a gave both tables a `locationId` with the same rule — its `Cart` rows (and their `CartItem`s, which cascade from `Cart`) and its `InventoryLog` rows. That matches what local mode deletes. What does NOT match is the client cache: the cloud mutation refetches only the two location lists (`GetLocations`, and `GetHouseholdLocations` by name since H5 task F.3), so `AllCarts` / `AllCartItems` / `ItemLogs` observers can still hold deleted rows. **No reader can reach those rows**, which is why they are not refetched — each of the three is narrowed by location before anything renders it (checked 2026-10-07; this had been recorded as an open gap). That narrowing is by LOCATION and so does not cover a household switch. See the comment on `useDeleteLocation` for why `PantryData` / `ItemStocksForItem` are deliberately left off that list.

**Un-stocking one item** is the narrower counterpart, `removeItemFromLocation(itemId, locationId)` — see the "Orphan items" section below and `src/routes/items/CLAUDE.md` for the Stock-tab UI that calls it.

**Hooks** (`src/hooks/useLocations.ts`): `useLocations` (the switcher's list), `useHouseholdLocations` (this page's list, H5 task F.3), `useCreateLocation`, `useUpdateLocation` (takes `{ id, updates }`), `useDeleteLocation`, `useReorderLocations`; and `usePermissions` (`src/hooks/usePermissions.ts`) for who may drag, delete and rename. **Dual-mode** — local reads/writes Dexie, cloud runs the `GetLocations` / `GetHouseholdLocations` / `CreateLocation` / `UpdateLocation` / `DeleteLocation` / `ReorderLocations` operations. Two cloud-contract details are easy to get wrong: `UpdateLocationInput` is **name-only** (reordering must go through `useReorderLocations`, and the cloud branch throws on an `order` update rather than dropping it), and `reorderLocations` returns `[Location!]!`, whose result the cloud branch writes straight into the `GetLocations` cache entry. A refused reorder refetches both lists by name. See `src/hooks/CLAUDE.md`.

**Active location** (`src/hooks/useActiveLocation.tsx`): a React Context exposing `{ activeLocationId, setActiveLocationId, activeLocation }`, persisted in localStorage under the per-mode key `active-location-id:<mode>`, falling back, when the stored id names none of the loaded ones, to the `isDefault` location in local mode and to the first location in cloud mode. `ActiveLocationProvider` is mounted in `__root.tsx`. It also bootstraps the location's shopping carts (`bootstrapCarts`) whenever the active id changes. See `src/hooks/CLAUDE.md` for the full list of hooks that thread it.

**Route**: `src/routes/settings/household/locations.tsx` (layout) + `src/routes/settings/household/locations/index.tsx` (list) + `src/routes/settings/household/locations/$id.tsx` (the people page of one location, cloud only, below). Toolbar: back button (mobile only, `lg:hidden`, because on desktop the household sidebar has Back) + title + an **Add** button opening `AddNameDialog`. Rename reuses the same `AddNameDialog` with a Save label. Linked from the household sidebar (`src/components/global/Sidebar/HouseholdSidebar.tsx`) and the mobile `/settings` accordion (`src/routes/settings/index.tsx`), both with the `MapPin` icon and `settings.locations.label`/`.description`.

**Components**:
- `src/components/location/LocationList/LocationList.tsx` — the reorderable list. One `Card` per location: drag handle (or `Lock` for the local default) · `MapPin` + name + a "Default" hint · rename (pencil) · delete (trash, absent for the local default). A cloud row is never the default, so every cloud row has a drag handle and a delete button (stories `CloudLocations` and `CloudLastLocation`). Drag-reorder via `@dnd-kit` with `PointerSensor`/`TouchSensor`/`KeyboardSensor`, mirroring `ShelfList`; keyboard instructions live in an `sr-only` paragraph (`settings.locations.dragInstructions`). Names render **as stored** — no `capitalize`, in the row label or the drag overlay. Location names are user-specified and may carry intentional casing ("iHerb pantry", "my Garage"), so they follow the vendor-name exception in the root `CLAUDE.md` "Name Display Convention" rather than the item/tag/recipe title-case rule. This matches `LocationSwitcher`, so the same location reads identically in the sidebar and here.
- `src/components/shared/LocationSwitcher/LocationSwitcher.tsx` — the global active-location selector mounted on the pantry/shopping/cooking toolbars, with a trailing "Manage locations" item linking here. Documented in `src/components/CLAUDE.md`.

**Orphan items.** Removing an item from a location (Stock tab) or deleting a location never deletes the global `Item`. An item with no `ItemStock` rows left is an **orphan**: hidden from the pantry (`getStockedItems` filters on `ItemStock`), still present in the catalog (`getAllItems`), and therefore still findable in the pantry Add combobox — selecting it there re-stocks it via copy-on-add. `deleteItem` remains the only way to remove an item everywhere.

**i18n**: `settings.locations.*` in `src/i18n/locales/{en,tw}.json`.

**Tests**: `src/routes/settings/household/locations/index.test.tsx` (route, local, incl. no role text and no link in local mode), `index.cloud.test.tsx` (route, cloud: deleting the last location, an older server's `LAST_LOCATION` getting the general toast, the general one, no second toast when offline, the roles of H5 task F.3, the reorder refusal and the loading state, and since H5c task H.6 the links: a manager's "No access" row links, a member's links follow their roles, a click opens the people page; Space on the focused name starts no drag and Enter opens the people page, which fails if the link carries the drag listeners; and a reorder still works with links on every row), `components/location/LocationList/LocationList.stories.test.tsx` (story `ManagerWithPeopleLinks`; a list with no `canOpen` has no link), `index.stories.tsx` + `index.stories.test.tsx` (stories + smoke), location operations/cascade in `src/db/operations.test.ts`, E2E in `e2e/tests/location-switcher.spec.ts` and `e2e/tests/settings/locations.spec.ts`.

### The people page of one location (cloud, households H5c task H.5)

`/settings/household/locations/$id` (`$id.tsx`). Plan:
`docs/global/permissions/2026-11-19-households-plan-h5c.md`, Task H.5. Server fields:
`locationPeople`, `setLocationRole`, `removeLocationRole`, `leaveLocation` in
`apps/server/src/schema/location.graphql`. Hooks: `hooks/useLocationPeople.ts`
(`hooks/CLAUDE.md`).

**Local mode has no such page** (decision T41): the URL redirects to the locations list.
It is a household detail page, so it is full-screen on every screen size
(`isFullscreenPage`), with its own **Back to locations** link.

Top to bottom: Back and the location name (as stored, no `capitalize`; `people.unnamed`,
"Location", when the name is not known: a member with no role, an unknown id, or a failed
`GetHouseholdLocations`), a Rename button for an organizer of the location; the **No organizer** note; **People**; **Add person**;
**Leave location**; the **Danger zone** with **Remove all items** (organizers only, households
H6 task J.7).

| Who | Sees |
|---|---|
| household owner or manager | every location's page, also one with No access (owner decision O24-A). A role picker with all three roles and Remove on every row but their own (their own row has the picker only; they use Leave). Add person with all three roles. The No organizer action sentence |
| location organizer who is a household `member` | the people. On a participant or viewer row: a picker with participant and viewer, and Remove. On an organizer row, their own included: nothing (Review Focus 1). Add person with participant and viewer. Rename. Leave |
| location participant or viewer | the people and roles, and Leave (O24-A). No picker, Remove, Add person or Rename |
| anyone else (a household `member` with no role there) | "You do not have access to this location." (`people.noAccess`) and Back. Decided by `locationPeople`'s `FORBIDDEN` |

- **Which control shows comes from `usePermissions().canChangeRole`**, the shared rule
  `canChangeLocationRole` (decision T33). The picker lists the current role plus every role
  the rule allows (`roleChoices` in `components/location/LocationPeopleList`); with no other
  role allowed, the role is plain text. The server checks every write.
- **No organizer** (`hasOrganizer: false` on the `GetHouseholdLocations` row): the title
  `settings.locations.noOrganizer` and `people.noOrganizerNote` for everyone who sees the
  page (O26-A); `people.noOrganizerAction` only for an owner or manager.
- **A role change** shows the picked role at once, and the picker is disabled until the
  change and its reads are done (`pendingRoles`). Before the review of H.5 the picker jumped
  back to the old role until the list was read again, and a second pick could be sent.
- **Add person** shows when the caller may give at least one role. It lists the household
  members (`HouseholdMembers`, read only then) who are not on the people list, in the members
  list's order (T43). With nobody left: `people.noOneToAdd`, and no button. When
  `HouseholdMembers` fails: `people.membersLoadError` and Retry, not silence. The dialog's
  Person select starts on the placeholder `people.choosePerson`.
- **Leave location** shows when `roleAt(id) !== null` (the switcher's list). The only
  organizer's confirm adds `people.leaveOnlyOrganizer` (O25-A). After the leave an owner or
  manager stays on the page, and focus moves to the **People** heading (the Leave button
  is gone); anyone else goes to the list.
- **Remove all items** (households H6 task J.7, decision T55) is in a **Danger zone**
  section at the bottom (`components/location/LocationDangerZone`). It shows to an
  ORGANIZER of this location only (`usePermissions().canRemoveAllItems`), whatever the
  household role: an owner or manager with no role here does not see it. It shows only when
  the page knows the location's stored name, because the confirm asks the person to type it
  exactly (case and spaces). It deletes the stock rows and cart rows of this location; the
  location, its carts, people, roles, logs and the catalog stay. A refused remove keeps the
  dialog open with `common.deleteFailed` inside it. The hook (`useRemoveAllLocationItems`)
  reads every active list again and marks no lost location. Tested in
  `$id.cloud.test.tsx` (*Remove all items*) and the component's own test.
- **States**: the people loading → `LoadingSpinner`; `errorCode === 'FORBIDDEN'` → no access
  (the CODE, not `isError`: after a leave, or a live event after someone else removed the
  caller, Apollo keeps the old rows next to the error; pinned by "user who loses their role
  in another tab sees no access, and no old names"); any
  other failed read → `people.loadError` and **Retry** (`people.retry`).
- **Errors**: a refused write shows one toast, `people.error`, through `showSaveError` (none
  offline). A remove or leave the server answers `false` (already gone, decision T38) shows
  nothing. While a remove or leave runs, its button is replaced by `people.removing` /
  `people.leaving` in an `<output>`. After a Remove, focus moves to the **People** heading.
- **Nothing else of the location is read** (Review Focus 4): the page sends
  `LocationPeople`, and the household-wide `GetHouseholdLocations` and `HouseholdMembers`. An
  owner with No access sees names and roles, never stock, carts or logs.
- **Names render in the server's order** (organizers first, then by name, decision T39).
  The page does not sort again.
- Tests: `$id.cloud.test.tsx` (the real route tree, real Apollo hooks and the REAL
  `usePermissions`, through `MockedProvider` with a spy link that records every operation;
  every fixture holds two organizers, a participant, a viewer and a location the caller has
  no role on), `$id.test.tsx` (local redirect), `components/location/LocationPeopleList/` and
  `components/location/AddLocationPersonDialog/` unit tests. Stories: `OwnerView`,
  `OrganizerView`, `ParticipantView`, `NoOrganizer`, `NobodyToAdd`. **Axe scans and E2E**:
  `e2e/tests/location-people.spec.ts` (cloud, households H5c task H.8), because
  `a11y.spec.ts` runs in `local` and `pwa` only, where this page does not exist. Its tests 8
  and 9 scan, light and dark, this page with No organizer, Add person, the Remove and Leave
  confirms, the name links on the list and the Members page's "No location roles" mark. Its
  tests 1 to 7 cover the page in two browsers on real SQL (see `e2e/CLAUDE.md`).
