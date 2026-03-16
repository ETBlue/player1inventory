### Vendor Management

Vendor CRUD at `/settings/vendors`. Vendors are separate entities (not tags) used for filtering items in shopping mode.

**Vendor type** (`src/types/index.ts`): `id`, `name`, `createdAt` (minimal, name-only)

**Operations** (`src/db/operations.ts`): `getVendors`, `createVendor`, `updateVendor(id, updates: Partial<Omit<Vendor, 'id'>>)`, `deleteVendor`, `getItemCountByVendor`

**Hooks** (`src/hooks/useVendors.ts`): `useVendors`, `useCreateVendor`, `useUpdateVendor` (takes `{ id, updates }`), `useDeleteVendor`, `useItemCountByVendor` — all dual-mode (local: TanStack Query + Dexie; cloud: Apollo GraphQL)

**Routes**: `src/routes/settings/vendors/index.tsx` — vendor list; `src/routes/settings/vendors/new.tsx` — create new vendor, redirects to detail page after save

**Components**:
- `src/components/vendor/VendorCard/index.tsx` — displays one vendor with a delete button; vendor name links to the detail page. Accepts `itemCount` and `onDelete` (the actual delete operation); wraps `DeleteButton` internally with an `itemCount`-based dialog description
- `src/components/vendor/VendorNameForm/index.tsx` — presentational form component (name input + save button) used by both the new vendor page and the Info tab

**Item counts**: Vendor list displays item count for each vendor (e.g. "Costco · 12 items") using `useVendorItemCounts()` hook.

**Settings link**: `src/routes/settings/index.tsx` (Store icon)

**Assignment UI**: `src/routes/items/$id/vendors.tsx` — Vendors tab in item detail. Click-to-toggle badges, immediate save via `useUpdateItem`. "New Vendor" button inline with badges opens `AddNameDialog` to create and immediately assign a vendor. No Save button (same as tags tab).

**Vendor detail page**: `src/routes/settings/vendors/$id.tsx` — Tabbed layout (Info + Items). Info tab: edit vendor name with Save button. Items tab: combined search+create input with a searchable checklist of all items showing their current vendor assignments; saves immediately when a checkbox is clicked (no staged state, no Save button), same pattern as the Tags tab. Typing a name that matches no items reveals a `+ Create "<name>"` row — clicking it or pressing Enter creates the item immediately assigned to this vendor; pressing Escape clears the input.

**Dirty state**: `src/hooks/useVendorLayout.tsx` — same pattern as `useItemLayout`. Navigation guard on parent layout applies only to the Info tab (vendor name editing); the Items tab has no unsaved state.

**Navigation:**

Back button and post-action navigation use smart history tracking (same pattern as item detail pages). After successful save, automatically navigates back to previous page. Uses `useAppNavigation()` hook.
