# Dialog Visual Consistency Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Standardize footer button placement (cancel left, confirm right) and header visual style (border separator, matching title/description text styles) across all Dialog and AlertDialog components.

**Architecture:** Changes are made at the base component level (`dialog.tsx`, `alert-dialog.tsx`) so all current and future dialogs inherit the correct behavior automatically. Two callsites that previously hacked around inconsistent defaults are cleaned up.

**Tech Stack:** React, Tailwind CSS v4, Radix UI, shadcn/ui, Vitest, Storybook

---

### Task 1: Update base `dialog.tsx` styles

**Files:**
- Modify: `src/components/ui/dialog.tsx`

**Step 1: Update `DialogFooter` class**

In `DialogFooter` (line 80), change:
```tsx
'flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2',
```
to:
```tsx
'flex justify-between gap-2',
```

**Step 2: Update `DialogHeader` class**

In `DialogHeader` (line 66), change:
```tsx
'flex flex-col space-y-1.5 text-center sm:text-left',
```
to:
```tsx
'flex flex-col space-y-1.5 text-center sm:text-left border-b border-accessory-default pb-2',
```

**Step 3: Update `DialogTitle` class**

In `DialogTitle` (line 94), change:
```tsx
className={cn('text-base font-semibold leading-none', className)}
```
to:
```tsx
className={cn('font-semibold', className)}
```

**Step 4: Run tests**

```bash
pnpm test
```
Expected: all tests pass (no logic changed, only classNames)

**Step 5: Commit**

```bash
git add src/components/ui/dialog.tsx
git commit -m "style(dialog): align DialogFooter, DialogHeader, DialogTitle with AlertDialog"
```

---

### Task 2: Update base `alert-dialog.tsx` footer style

**Files:**
- Modify: `src/components/ui/alert-dialog.tsx`

**Step 1: Update `AlertDialogFooter` class**

In `AlertDialogFooter` (line 65), change:
```tsx
<div className={cn('flex gap-2', className)} {...props} />
```
to:
```tsx
<div className={cn('flex justify-between gap-2', className)} {...props} />
```

**Step 2: Run tests**

```bash
pnpm test
```
Expected: all tests pass

**Step 3: Commit**

```bash
git add src/components/ui/alert-dialog.tsx
git commit -m "style(alert-dialog): use justify-between in AlertDialogFooter"
```

---

### Task 3: Clean up `DeleteButton.tsx`

The `flex-1` spacer div was a workaround for `AlertDialogFooter` not spreading buttons. Now that the footer uses `justify-between`, it is redundant.

**Files:**
- Modify: `src/components/DeleteButton.tsx`

**Step 1: Remove the spacer**

In `DeleteButton.tsx` (line 72), remove this line:
```tsx
<div className="flex-1" />
```

The footer now looks like:
```tsx
<AlertDialogFooter>
  <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
  <AlertDialogAction
    variant="destructive"
    onClick={handleConfirm}
    disabled={isDeleting}
  >
    {isDeleting ? 'Deleting...' : confirmLabel}
  </AlertDialogAction>
</AlertDialogFooter>
```

**Step 2: Run tests**

```bash
pnpm test
```
Expected: all tests pass

**Step 3: Commit**

```bash
git add src/components/DeleteButton.tsx
git commit -m "refactor(delete-button): remove redundant flex-1 spacer"
```

---

### Task 4: Clean up `TagDetailDialog.tsx`

The `className="flex justify-between"` on `DialogFooter` was a workaround. Now that `DialogFooter` defaults to `flex justify-between gap-2`, the override is redundant.

**Files:**
- Modify: `src/components/TagDetailDialog.tsx`

**Step 1: Remove the className override**

In `TagDetailDialog.tsx` (line 61), change:
```tsx
<DialogFooter className="flex justify-between">
```
to:
```tsx
<DialogFooter>
```

**Step 2: Run tests**

```bash
pnpm test
```
Expected: all tests pass

**Step 3: Commit**

```bash
git add src/components/TagDetailDialog.tsx
git commit -m "refactor(tag-detail-dialog): remove redundant DialogFooter className override"
```

---

### Task 5: Update Storybook stories

**Files:**
- Modify: `src/components/ui/dialog.stories.tsx`
- Modify: `src/components/ui/alert-dialog.stories.tsx`

**Step 1: Update `dialog.stories.tsx`**

The `WithForm` story has only a single "Save changes" button, which would now appear left-aligned. Add a Cancel button so it demonstrates the intended two-button pattern:

Change the `WithForm` footer from:
```tsx
<DialogFooter>
  <Button>Save changes</Button>
</DialogFooter>
```
to:
```tsx
<DialogFooter>
  <Button variant="neutral-outline">Cancel</Button>
  <Button>Save changes</Button>
</DialogFooter>
```

The `Default` story already has `[Cancel] [Save]` — no change needed.

**Step 2: Update `alert-dialog.stories.tsx`**

The `Destructive` story uses inline Tailwind classes for the destructive button instead of the `variant` prop. Update to use the proper variant (consistent with how `DeleteButton` does it):

Change:
```tsx
<AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
  Delete
</AlertDialogAction>
```
to:
```tsx
<AlertDialogAction variant="destructive">
  Delete
</AlertDialogAction>
```

**Step 3: Visually verify in Storybook**

```bash
pnpm storybook
```

Open Storybook and check:
- `UI/Dialog` → Default: header has bottom border, Cancel is left, Save is right
- `UI/Dialog` → WithForm: Cancel is left, Save changes is right
- `UI/AlertDialog` → Default: Cancel is left, Continue is right, spread apart
- `UI/AlertDialog` → Destructive: Cancel is left, Delete (destructive red) is right

**Step 4: Commit**

```bash
git add src/components/ui/dialog.stories.tsx src/components/ui/alert-dialog.stories.tsx
git commit -m "docs(stories): update dialog and alert-dialog stories for new footer layout"
```
