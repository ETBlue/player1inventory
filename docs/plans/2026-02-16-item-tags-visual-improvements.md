# Item Tags Visual Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enhance item tags page with Title Case capitalization, visual dividers, and inline tag creation.

**Architecture:** Simple CSS changes for visual improvements, reuse existing AddTagDialog component for tag creation functionality with immediate save behavior.

**Tech Stack:** React, TypeScript, TanStack Router, Tailwind CSS, existing UI components

---

## Task 1: Add Visual Improvements (Title Case + Dividers)

**Files:**
- Modify: `src/routes/items/$id/tags.tsx:60-82`

**Step 1: Add capitalize class to tag type name**

In `src/routes/items/$id/tags.tsx`, change line 60 from:
```tsx
<p className="text-sm font-medium text-foreground-muted mb-1">
```

to:
```tsx
<p className="text-sm font-medium text-foreground-muted mb-1 capitalize">
```

**Step 2: Add dividers between sections**

In `src/routes/items/$id/tags.tsx`, change line 59 from:
```tsx
<div key={tagType.id}>
```

to:
```tsx
<div key={tagType.id} className="first:mt-0 mt-6 first:pt-0 pt-3 first:border-t-0 border-t border-border">
```

**Step 3: Verify visual changes in browser**

Run: `pnpm dev`
Navigate to: Any item's tags page (e.g., `/items/1/tags`)
Expected:
- Tag type names appear in Title Case
- Horizontal divider line with spacing between each tag type section
- First section has no divider

**Step 4: Commit visual improvements**

```bash
git add src/routes/items/\$id/tags.tsx
git commit -m "feat(items): add Title Case and dividers to tags page

- Add capitalize class to tag type names
- Add border-t with spacing between sections"
```

---

## Task 2: Add "Add Tag" Functionality

**Files:**
- Modify: `src/routes/items/$id/tags.tsx:1-89`
- Create: `src/routes/items/$id/tags.test.tsx`

**Step 1: Write the failing test**

Create `src/routes/items/$id/tags.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach } from 'vitest'
import { createMemoryHistory, createRouter } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { routeTree } from '@/routeTree.gen'
import { clearDatabase, createItem, createTag, createTagType } from '@/db/operations'

describe('Tags Tab - Add Tag Functionality', () => {
  beforeEach(async () => {
    await clearDatabase()
  })

  it('user can add a new tag from item tags page', async () => {
    // Given an item and a tag type with no tags
    const tagType = await createTagType({ name: 'categories', color: 'blue' })
    const item = await createItem({
      name: 'Test Item',
      tagIds: [],
      targetQuantity: 2,
      refillThreshold: 1,
    })

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    const router = createRouter({
      routeTree,
      history: createMemoryHistory({
        initialEntries: [`/items/${item.id}/tags`],
      }),
      context: { queryClient },
    })

    render(
      <QueryClientProvider client={queryClient}>
        {router.render()}
      </QueryClientProvider>
    )

    // When user clicks "Add Tag" button
    await waitFor(() => {
      expect(screen.getByText('Categories')).toBeInTheDocument()
    })

    const addButton = screen.getByRole('button', { name: /add tag/i })
    await userEvent.click(addButton)

    // And enters tag name in dialog
    const input = screen.getByLabelText(/name/i)
    await userEvent.type(input, 'dairy')

    // And clicks Add button
    const addDialogButton = screen.getByRole('button', { name: /^add tag$/i })
    await userEvent.click(addDialogButton)

    // Then the new tag appears in the list
    await waitFor(() => {
      expect(screen.getByText('dairy')).toBeInTheDocument()
    })

    // And dialog is closed
    expect(screen.queryByLabelText(/name/i)).not.toBeInTheDocument()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test tags.test.tsx`
Expected: FAIL - "Add Tag" button not found

**Step 3: Add imports for Add Tag functionality**

In `src/routes/items/$id/tags.tsx`, update imports (lines 1-7) to:

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { Plus, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { AddTagDialog } from '@/components/AddTagDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useCreateTag, useItem, useTags, useTagTypes, useUpdateItem } from '@/hooks'
import { useItemLayout } from '@/hooks/useItemLayout'
import { sortTagsByName } from '@/lib/tagSortUtils'
```

**Step 4: Add state and handler for Add Tag dialog**

In `src/routes/items/$id/tags.tsx`, after line 18 (inside TagsTab function), add:

```tsx
const [addTagDialog, setAddTagDialog] = useState<string | null>(null)
const [newTagName, setNewTagName] = useState('')
const createTag = useCreateTag()

const handleAddTag = () => {
  if (addTagDialog && newTagName.trim()) {
    createTag.mutate({
      name: newTagName.trim(),
      typeId: addTagDialog,
    })
    setNewTagName('')
    setAddTagDialog(null)
  }
}
```

**Step 5: Add "Add Tag" button to each section**

In `src/routes/items/$id/tags.tsx`, in the div at line 63 (inside the map), after the closing `})}` of sortedTypeTags.map (line 80), add:

```tsx
<Button
  variant="neutral-ghost"
  size="sm"
  className="h-6 px-2 text-xs"
  onClick={() => setAddTagDialog(tagType.id)}
>
  <Plus className="h-3 w-3 mr-1" />
  Add Tag
</Button>
```

**Step 6: Add AddTagDialog component at the end**

In `src/routes/items/$id/tags.tsx`, after the closing of the main return div (line 87), before the final closing brace, add:

```tsx
<AddTagDialog
  open={!!addTagDialog}
  tagName={newTagName}
  onTagNameChange={setNewTagName}
  onAdd={handleAddTag}
  onClose={() => setAddTagDialog(null)}
/>
```

**Step 7: Run test to verify it passes**

Run: `pnpm test tags.test.tsx`
Expected: PASS - user can add a new tag from item tags page

**Step 8: Run all tests to ensure no regressions**

Run: `pnpm test`
Expected: All tests pass

**Step 9: Commit Add Tag functionality**

```bash
git add src/routes/items/\$id/tags.tsx src/routes/items/\$id/tags.test.tsx
git commit -m "feat(items): add inline tag creation to tags page

- Add 'Add Tag' button to each tag type section
- Reuse AddTagDialog component with immediate save
- Add test coverage for tag creation flow"
```

---

## Task 3: Manual Verification

**Step 1: Test in browser**

Run: `pnpm dev`
Navigate to: Any item's tags page

**Verify:**
1. Tag type names are in Title Case
2. Divider lines with spacing between sections
3. "Add Tag" button appears in each section
4. Clicking "Add Tag" opens dialog
5. Creating a tag works and it appears immediately
6. Dialog closes after creation
7. Can toggle tags on/off as before

**Step 2: Test edge cases**

**Test empty tag name:**
- Click "Add Tag"
- Submit with empty name
- Expected: Nothing happens (validation)

**Test multiple tag types:**
- Verify each section has its own "Add Tag" button
- Verify dialog creates tag in correct tag type

**Step 3: Check accessibility**

- Tab through interface with keyboard
- Verify "Add Tag" button is keyboard accessible
- Verify dialog is keyboard accessible (Enter to submit, Esc to close)

---

## Task 4: Update Documentation

**Files:**
- Modify: `CLAUDE.md:75-82`

**Step 1: Update CLAUDE.md Features section**

In `CLAUDE.md`, update the "3. Tags" section (lines 80-82) from:

```markdown
**3. Tags (`/items/$id/tags`)** - Not yet implemented
- Tag assignment interface
- Changes apply immediately without save button
```

to:

```markdown
**3. Tags (`/items/$id/tags`)**
- Tag assignment interface with Title Case tag type names
- Visual dividers between tag type sections
- Inline tag creation via "Add Tag" buttons
- Changes apply immediately without save button
```

**Step 2: Commit documentation update**

```bash
git add CLAUDE.md
git commit -m "docs(claude): update tags tab documentation

Reflect implemented features: Title Case, dividers, inline tag creation"
```

---

## Final Verification

**Run full test suite:**
```bash
pnpm test
pnpm lint
```

**Check git status:**
```bash
git status
```
Expected: Clean working tree, all changes committed

**Review commits:**
```bash
git log --oneline -4
```
Expected: 4 new commits with clear, scoped messages

---

## Notes

- All changes are in a single file (`tags.tsx`) except for new test file
- Reuses existing `AddTagDialog` component, no new components needed
- Follows existing patterns from settings page for consistency
- Tests use "user can..." naming with Given-When-Then structure per CLAUDE.md
- Immediate save behavior matches existing toggle functionality
