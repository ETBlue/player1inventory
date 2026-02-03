# Tag System Improvements Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve the tag management UX with unified colors per tag type, auto-contrast text, and proper edit/delete dialogs.

**Architecture:** Move color from Tag to TagType, add utility for text contrast, create reusable ConfirmDialog, enhance tags.tsx with edit dialogs.

**Tech Stack:** React, TanStack Query, shadcn/ui AlertDialog, Dexie.js

---

## Data Model Changes

**Current:**
```ts
interface Tag {
  id: string
  name: string
  typeId: string
  color?: string  // per-tag color
}

interface TagType {
  id: string
  name: string
}
```

**New:**
```ts
interface Tag {
  id: string
  name: string
  typeId: string
  // color removed - inherited from TagType
}

interface TagType {
  id: string
  name: string
  color?: string  // shared by all tags under this type
}
```

**Migration:** On first load, copy first tag's color to its parent TagType if TagType has no color.

---

## Text Color Utility

Add to `src/lib/utils.ts`:

```ts
export function getContrastTextColor(hexColor: string): 'white' | 'black' {
  const hex = hexColor.replace('#', '')
  const r = parseInt(hex.slice(0, 2), 16) / 255
  const g = parseInt(hex.slice(2, 4), 16) / 255
  const b = parseInt(hex.slice(4, 6), 16) / 255
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return luminance > 0.5 ? 'black' : 'white'
}
```

---

## ConfirmDialog Component

New reusable component wrapping shadcn/ui AlertDialog:

```ts
interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel?: string  // default: "Delete"
  onConfirm: () => void
  destructive?: boolean  // default: true
}
```

---

## UI Layout

**TagType Card:**
```
┌─────────────────────────────────────────────────┐
│ [Color dot] Category Name         [Edit] [Del]  │
├─────────────────────────────────────────────────┤
│ [Dairy (3)] [Frozen (5)] [Produce (12)] [+ Add] │
└─────────────────────────────────────────────────┘
```

**Edit TagType Dialog:**
- Name (text input)
- Color (color picker + hex input)

**Tag Detail Dialog (on tag click):**
- Name (editable)
- Item count (informational)
- Delete button (with confirmation if items use this tag)
- Save/Cancel buttons

**Add Tag Dialog:**
- Name only (no color picker - inherits from TagType)

---

## Files to Change

**New files:**
- `src/components/ui/alert-dialog.tsx` - via `npx shadcn@latest add alert-dialog`
- `src/components/ui/confirm-dialog.tsx` - Reusable confirmation wrapper

**Modified files:**
- `src/types/index.ts` - Move color from Tag to TagType
- `src/lib/utils.ts` - Add `getContrastTextColor()`
- `src/db/operations.ts` - Add `getItemCountByTag()`, `migrateTagColorsToTypes()`
- `src/hooks/useTags.ts` - Add `useItemCountByTag()` hook
- `src/routes/settings/tags.tsx` - New dialogs, layout, remove confirm()

---

## Tasks

### Task 1: Update Data Model
- Modify `src/types/index.ts`: remove `color` from Tag, add `color` to TagType
- Update `src/db/operations.ts`: modify `createTagType()` to accept color
- Add migration function `migrateTagColorsToTypes()`

### Task 2: Add Text Contrast Utility
- Add `getContrastTextColor()` to `src/lib/utils.ts`
- Add tests for the utility function

### Task 3: Add AlertDialog and ConfirmDialog
- Run `npx shadcn@latest add alert-dialog`
- Create `src/components/ui/confirm-dialog.tsx`

### Task 4: Add Item Count Query
- Add `getItemCountByTag()` to `src/db/operations.ts`
- Add `useItemCountByTag()` to `src/hooks/useTags.ts`

### Task 5: Update Tags Page
- Add Edit TagType dialog with name and color
- Add Tag Detail dialog with name edit, item count, delete
- Update Add Tag dialog to remove color picker
- Update Add TagType section to include color picker
- Replace all `confirm()` with ConfirmDialog
- Update tag badges to show item count
- Apply text contrast color to badges
- Run migration on page load
