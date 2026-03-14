# Vendor CRUD Design

**Date:** 2026-02-18
**Status:** Approved

## Overview

Add full CRUD (create, read, update, delete) for vendors in a dedicated settings page at `/settings/vendors`. Vendors are used for filtering items in shopping mode. This feature covers vendor management only — item-to-vendor assignment is out of scope.

## Decisions

- **Fields:** Name only (minimal, matches existing `Vendor` type)
- **Scope:** Vendor management only, no item assignment UI
- **Location:** `/settings/vendors` — mirrors the existing tags CRUD pattern
- **Pattern:** Follow `settings/tags.tsx` and related components as the template

## Data Layer

No schema migration needed. The vendors Dexie table already exists (schema v3) with `id` and `name` indexed. The `Vendor` type is already defined in `src/types/index.ts`.

### New database operations (`src/db/operations.ts`)

```ts
createVendor(name: string): Promise<Vendor>
updateVendor(id: string, name: string): Promise<void>
deleteVendor(id: string): Promise<void>
```

`getVendors()` already exists.

### New query hooks (`src/hooks/useVendors.ts`)

Extend the existing `useVendors` hook file with:

```ts
useCreateVendor()   // useMutation, invalidates vendor query on success
useUpdateVendor()   // useMutation, invalidates vendor query on success
useDeleteVendor()   // useMutation, invalidates vendor query on success
```

## UI / Routes

### Settings index update

Add a "Vendors" link card to `src/routes/settings/index.tsx` alongside the existing "Tags" card.

### New route: `src/routes/settings/vendors.tsx`

- **Header:** "Vendors" heading + "New Vendor" button
- **List:** One `VendorCard` per vendor; empty state when no vendors exist
- **Create:** "New Vendor" button opens `VendorFormDialog` with blank input
- **Edit:** Edit button on each card opens `VendorFormDialog` pre-filled
- **Delete:** Delete button opens confirmation dialog before removal

### New components (`src/components/`)

**`VendorCard.tsx`**
- Displays vendor name
- Edit button (pencil icon) and Delete button (trash icon)
- Props: `vendor: Vendor`, `onEdit: () => void`, `onDelete: () => void`

**`VendorFormDialog.tsx`**
- Shared dialog for create and edit
- Single `Input` for vendor name + Save / Cancel buttons
- Props: `vendor?: Vendor` (undefined = create mode, vendor = edit mode), `open`, `onOpenChange`
- Validation: name must be non-empty

### Storybook stories

- `src/components/VendorCard.stories.tsx`
- `src/components/VendorFormDialog.stories.tsx`

## Testing

### Database operation tests (`src/db/operations.test.ts`)

- `user can create a vendor`
- `user can update a vendor name`
- `user can delete a vendor`
- `user can list all vendors`

### Route integration tests (`src/routes/settings/vendors.test.tsx`)

- `user can see the vendor list`
- `user can create a vendor via the form`
- `user can edit a vendor name`
- `user can delete a vendor with confirmation`
- `user can see empty state when no vendors exist`

## Out of Scope

- Item-to-vendor assignment UI (items already store `vendorIds[]`, this can be added later)
- Vendor fields beyond name (URL, address, notes)
- Vendor deduplication or merge logic
