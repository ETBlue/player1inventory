# Delete Button Repositioning Design

**Date:** 2026-02-24
**Status:** Approved

## Overview

Reposition delete buttons across the app to declutter top bars and provide a consistent, subtle delete action pattern.

## Goals

- **Declutter top bars** - Keep top bars focused on navigation only
- **Consistent delete pattern** - Same visual style and confirmation across all pages
- **Subtle but accessible** - Delete buttons available but not prominent

## Approach

Create a shared `DeleteButton` component that handles both the button UI and confirmation dialog. Use it consistently across all detail pages (Info tabs) and on tag badges in the tags list page.

## Component Architecture

### DeleteButton Component

**Location:** `src/components/DeleteButton.tsx`

**Props:**
```tsx
interface DeleteButtonProps {
  onDelete: () => void | Promise<void>
  trigger: ReactNode  // String or icon element
  buttonVariant?: ButtonProps['variant']
  buttonSize?: ButtonProps['size']
  buttonClassName?: string
  dialogTitle?: string
  dialogDescription?: ReactNode
  confirmLabel?: string  // defaults to "Delete"
}
```

**Behavior:**
- Clicking the trigger opens a confirmation dialog
- Dialog displays user-provided title and description (full JSX flexibility)
- User must confirm or cancel
- Calls `onDelete` callback on confirmation
- Handles loading state during async deletion

**Usage examples:**

```tsx
// Text button at bottom of Info tab
<DeleteButton
  trigger="Delete Tag"
  buttonVariant="ghost"
  buttonClassName="text-destructive hover:text-destructive hover:bg-destructive/10"
  dialogTitle="Delete Tag?"
  dialogDescription={
    <>
      Are you sure you want to delete <strong>{tag.name}</strong>?
      {itemCount > 0 && (
        <p className="mt-2 text-sm text-muted-foreground">
          This tag will be removed from {itemCount} item{itemCount !== 1 ? 's' : ''}.
        </p>
      )}
    </>
  }
  onDelete={handleDelete}
/>

// Icon button on tag badge
<DeleteButton
  trigger={<X className="h-3 w-3" />}
  buttonVariant="ghost"
  buttonSize="icon"
  buttonClassName="h-4 w-4 p-0 ml-1 hover:bg-destructive/20"
  dialogTitle="Delete Tag?"
  dialogDescription={<>Are you sure?</>}
  onDelete={handleDelete}
/>
```

## Integration Points

### 1. Item Detail Page
**File:** `src/routes/items/$id/index.tsx`

- Remove delete button from top bar
- Add DeleteButton at bottom of Info tab form (below Save button)

### 2. Tag Detail Page
**File:** `src/routes/settings/tags/$id/index.tsx`

- Remove delete button from top bar (currently `<button>` with Trash2 icon)
- Add DeleteButton at bottom of Info tab form

### 3. Vendor Detail Page
**File:** `src/routes/settings/vendors/$id/index.tsx`

- Currently has NO delete button
- Add DeleteButton at bottom of Info tab form

### 4. Recipe Detail Page
**File:** `src/routes/settings/recipes/$id/index.tsx`

- Currently has NO delete button
- Add DeleteButton at bottom of Info tab form

### 5. Tags List Page
**File:** `src/routes/settings/tags/index.tsx`

- Add DeleteButton to each tag badge within tag type cards
- Positioned at the right edge of each badge

### Layout Pattern for Info Tabs

```
[Form fields...]

[Save button]
[Delete button] ← subtle, below save
```

## Visual Design

### Info Tab Forms (Items, Tags, Vendors, Recipes)

```tsx
<DeleteButton
  trigger="Delete [Type]"  // e.g., "Delete Tag", "Delete Vendor"
  buttonVariant="ghost"
  buttonClassName="text-destructive hover:text-destructive hover:bg-destructive/10"
  // ... dialog props
/>
```

**Styling:**
- Ghost variant for subtlety
- Destructive text color
- Gentle destructive background on hover
- Full text label for clarity
- `mt-4` or `mt-6` gap from Save button

### Tag Badges (Tags List Page)

```tsx
<DeleteButton
  trigger={<X className="h-3 w-3" />}
  buttonVariant="ghost"
  buttonSize="icon"
  buttonClassName="h-4 w-4 p-0 ml-1 hover:bg-destructive/20"
  // ... dialog props
/>
```

**Styling:**
- Icon-only (X icon)
- Tiny size to fit within badge
- Minimal padding
- `ml-1` or `ml-2` gap from tag name

## Confirmation Dialog Pattern

Uses shadcn `AlertDialog` component with consistent structure:

```tsx
<AlertDialog>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>{dialogTitle}</AlertDialogTitle>
      <AlertDialogDescription>
        {dialogDescription}
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction
        className="bg-destructive text-destructive-foreground"
        onClick={onDelete}
      >
        {confirmLabel ?? "Delete"}
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

**Features:**
- Destructive action styling on confirm button
- Cancel button as default/safe action
- Focus trap and keyboard navigation (Esc to cancel, Enter to confirm)
- Full JSX flexibility for dialog content (title, description)

**Example with cascade warning:**

```tsx
dialogTitle="Delete Tag?"
dialogDescription={
  <>
    Are you sure you want to delete <strong>{tag.name}</strong>?
    {itemCount > 0 && (
      <p className="mt-2 text-sm text-muted-foreground">
        This tag will be removed from {itemCount} item{itemCount !== 1 ? 's' : ''}.
      </p>
    )}
  </>
}
```

## Testing

### DeleteButton Component Tests

- Renders trigger button with correct variant/styling
- Opens dialog on click
- Calls onDelete callback when confirmed
- Cancels without calling onDelete
- Handles async onDelete (loading state)
- Keyboard navigation (Esc to cancel, Enter to confirm)

### Integration Tests (Each Page)

- Delete button appears in correct location (bottom of Info tab or on badge)
- Delete button removed from top bar (items, tags pages)
- Clicking delete shows confirmation dialog with correct content
- Confirming deletion removes the item and navigates/updates appropriately
- Canceling deletion keeps item intact

### Visual Regression (Storybook)

- DeleteButton stories showing both text and icon variants
- Different dialog content examples (simple, with cascade warning)
- Loading state story

### Manual Testing Checklist

- [ ] All detail pages: delete button at bottom of Info tab
- [ ] Tags list page: X button on each badge
- [ ] Top bars: no delete buttons remaining
- [ ] All confirmations use consistent dialog style
- [ ] Cascade warnings show correct item counts

## Files to Modify

**New:**
- `src/components/DeleteButton.tsx` - Shared delete button component
- `src/components/DeleteButton.stories.tsx` - Storybook stories
- `src/components/DeleteButton.test.tsx` - Component tests

**Modified:**
- `src/routes/items/$id/index.tsx` - Remove top bar delete, add to Info tab
- `src/routes/settings/tags/$id/index.tsx` - Remove top bar delete, add to Info tab
- `src/routes/settings/vendors/$id/index.tsx` - Add delete to Info tab
- `src/routes/settings/recipes/$id/index.tsx` - Add delete to Info tab
- `src/routes/settings/tags/index.tsx` - Add delete to tag badges

## Success Criteria

- ✅ Top bars contain only navigation elements (back button, title, tabs)
- ✅ All delete actions use the same DeleteButton component
- ✅ All confirmations use the same AlertDialog pattern
- ✅ Delete buttons are subtle but accessible
- ✅ Tag badges show always-visible X buttons
- ✅ All tests pass
