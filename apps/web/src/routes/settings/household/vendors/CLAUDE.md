### Vendor Management

Vendor CRUD at `/settings/household/vendors`. Vendors are separate entities (not tags) used for filtering items in shopping mode.

**Vendor type** (`src/types/index.ts`): `id`, `name`, `createdAt` (minimal, name-only)

**Operations** (`src/db/operations.ts`): `getVendors`, `createVendor`, `updateVendor(id, updates: Partial<Omit<Vendor, 'id'>>)`, `deleteVendor`, `getItemCountByVendor`

**Cart lifecycle side effect:** `createVendor` also creates a permanent shopping cart with `id = vendor.id`. `deleteVendor` also deletes that cart and all its cart items. This enforces the 1:1 vendor↔cart invariant. In cloud mode, the same logic runs in the server's `vendor.resolver.ts`.

**Hooks** (`src/hooks/useVendors.ts`): `useVendors`, `useCreateVendor`, `useUpdateVendor` (takes `{ id, updates }`), `useDeleteVendor`, `useItemCountByVendor` — all dual-mode (local: TanStack Query + Dexie; cloud: Apollo GraphQL)

**Routes**: `src/routes/settings/household/vendors/index.tsx` — vendor list. Its New button opens `NewVendorDialog`, which goes to the detail page after save

**Components**:
- `src/components/vendor/VendorCard/index.tsx` — displays one vendor with a delete button; vendor name links to the detail page. Accepts `itemCount` and `onDelete` (the actual delete operation; return its promise, so `DeleteButton` can show a failed delete); wraps `DeleteButton` internally with an `itemCount`-based dialog description
- `src/components/vendor/VendorInfoForm/index.tsx` — presentational form component (name input + save button) used by both the new vendor page and the Info tab

**Item counts**: Vendor list displays item count for each vendor (e.g. "Costco · 12 items") using `useVendorItemCounts()` hook.

**Settings link**: the household sidebar (`src/components/global/Sidebar/HouseholdSidebar.tsx`) and the mobile `/settings` accordion (`src/routes/settings/index.tsx`), both with the `Store` icon

**Assignment UI**: `src/routes/items/$id/vendors.tsx` — Vendors tab of the item page (its own tab since 2026-11-24; it was under a Relation tab before). Click-to-toggle badges, immediate save via `useUpdateItem`. "New Vendor" button inline with badges opens `AddNameDialog` to create and immediately assign a vendor. No Save button (same as tags tab).

**Vendor detail page**: `src/routes/settings/household/vendors/$id.tsx` — Tabbed layout (Info + Items). Info tab: edit vendor name with Save button. Items tab: combined search+create input with a searchable checklist of all items showing their current vendor assignments; saves immediately when a checkbox is clicked (no staged state, no Save button), same pattern as the Tags tab. Typing a name that matches no items reveals a `+ Create "<name>"` row — clicking it or pressing Enter creates the item inline (no dialog) and immediately assigns it to this vendor; pressing Escape clears the input.

The Items tab is a **global** assignment surface: rows carry `showStock={false}`, order is assigned-then-unassigned with no active/inactive split, and create-from-search calls `useCreateItem({ catalogOnly: true })` directly so the new item is stocked in no location. See `settings/CLAUDE.md` for the three rules.

**Dirty state**: `src/hooks/useVendorLayout.tsx` — same pattern as `useItemLayout`. Navigation guard on parent layout applies only to the Info tab (vendor name editing); the Items tab has no unsaved state.

**Navigation:**

Back button and post-action navigation use smart history tracking (same pattern as item detail pages). After successful save, automatically navigates back to previous page. Uses `useAppNavigation()` hook.

### What a household member sees (cloud, households H5 task F.5)

A household `member` may read the catalog but not change it. The server checks every write (`requireCatalogRole`); the page only hides what would fail. All of it reads `usePermissions()` (`src/hooks/usePermissions.ts`). Local mode is unchanged.

- **List page:** no New Vendor and no delete. A `ReadOnlyNote` above a non-empty list says "Only a household owner or manager can add or change these." (`settings.catalogReadOnly`). An empty list says the same instead of "Create your first vendor to get started!".
- **Info tab:** the name is `readOnly`, no Save, no Delete, and the note "Only a household owner or manager can change this." (`settings.catalogReadOnlyItem`).
- **Items tab:** the checkboxes are disabled. They still show which items carry the vendor.

- **While the role is not known** (`usePermissions().roleKnown` is `false`: `GetHousehold` is loading, or it failed with nothing cached), the write controls are hidden too, but no note shows. The note would be untrue for an owner.
- **The Info form waits for the role before it mounts** (`isLoading`). Its name field has `autoFocus={!readOnly}`, and React focuses only on mount, so a form mounted read-only while the role loads would never take the focus for an owner. If the role cannot be read, the form shows read only, with no note.
- **Search on the Items tab:** a member gets no `+ Create`, and a line under the search row says why: `items.createReadOnly` ("Only a household owner or manager can create a new item."). Same trigger as the button: a search with no exact match.
- **Tests:** `routes/settings/household/catalogReadOnly.test.tsx` (list), `catalogDetailReadOnly.test.tsx` and `catalogInfoRoleArrives.test.tsx` (Info tab), `catalogItemsReadOnly.test.tsx` (Items tab). Each role test has a member and a manager who differ only in the household role.
