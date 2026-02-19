# Vendor Form Reuse Design

**Date:** 2026-02-19

## Goal

Replace the `VendorFormDialog` create dialog with a dedicated `/settings/vendors/new` route, and extract a shared `VendorNameForm` component used by both the new-vendor page and the existing Info tab.

## Motivation

- The edit-mode code in `VendorFormDialog` is dead (editing now lives on the vendor detail page)
- A dedicated route is more consistent with the rest of the app (items use `/items/new`)
- Extracting `VendorNameForm` eliminates duplication between the create flow and the Info tab

## Approach: Shared VendorNameForm Component

Extract a presentational `VendorNameForm` component. Both the new-vendor page and the Info tab own their own state and pass it down.

## Routes & Components

| What | From | To |
|---|---|---|
| "New Vendor" button | opens `VendorFormDialog` | navigates to `/settings/vendors/new` |
| `VendorFormDialog` | create + dead edit code | deleted |
| `$id/index.tsx` form | inline name input | uses `VendorNameForm` |
| New: `VendorNameForm` | — | shared presentational component |
| New: `vendors/new.tsx` | — | new-vendor page using `VendorNameForm` |

### VendorNameForm props

```tsx
interface VendorNameFormProps {
  name: string
  onNameChange: (name: string) => void
  onSave: () => void
  isDirty: boolean
  isPending?: boolean
}
```

Pure presentational — no hooks, no data fetching. Renders a name input and Save button inside a `<form>` with `onSubmit` (supports Enter key).

## Data Flow

### New vendor page (`/settings/vendors/new`)

- Manages local `name` state
- `isDirty = name.trim() !== ''`
- On save: `createVendor.mutate(name, { onSuccess: (vendor) => navigate({ to: '/settings/vendors/$id', params: { id: vendor.id } }) })`
- On back: navigates to `/settings/vendors/`
- No dirty-state guard — navigating away silently discards unsaved input

### Info tab (`$id/index.tsx`)

- Same behavior as today (`savedAt` sentinel, dirty = name changed from DB)
- Delegates rendering to `VendorNameForm`
- No behavior change

## Error Handling & Edge Cases

- **Empty name**: Save disabled when `name.trim() === ''` (new page) or name unchanged (Info tab) — both as `isDirty = false`
- **Pending state**: Save disabled while mutation pending via `isPending` prop
- **`createVendor` return value**: Hook must pass the created vendor to `onSuccess` for post-create navigation; update if needed

## Files

- **Create**: `src/components/VendorNameForm.tsx`
- **Create**: `src/routes/settings/vendors/new.tsx`
- **Modify**: `src/routes/settings/vendors/index.tsx` — remove `VendorFormDialog`, change "New Vendor" to navigate
- **Modify**: `src/routes/settings/vendors/$id/index.tsx` — use `VendorNameForm`
- **Delete**: `src/components/VendorFormDialog.tsx`
- **Modify**: `src/hooks/useVendors.ts` — ensure `createVendor` returns created vendor
