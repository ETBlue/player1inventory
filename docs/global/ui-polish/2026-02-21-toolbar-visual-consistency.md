# Toolbar Visual Consistency Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a shared `Toolbar` wrapper component and apply it to the pantry, shopping, vendor list, and tags page toolbars so they all share the same visual style.

**Architecture:** A new `Toolbar` component in `src/components/` provides consistent styling (`bg-background-surface`, `border-b-2 border-accessory-default`, `px-3 py-2`). `PantryToolbar` is refactored to use it; shopping, vendor list, and tags pages replace their bare `<div>` toolbars with `<Toolbar>`. No logic changes — purely visual/structural.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, Vitest + React Testing Library, Storybook

---

### Task 1: Create the `Toolbar` component

**Files:**
- Create: `src/components/Toolbar.tsx`
- Create: `src/components/Toolbar.stories.tsx`
- Create: `src/components/Toolbar.test.tsx`

**Step 1: Write the failing test**

Create `src/components/Toolbar.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Toolbar } from './Toolbar'

describe('Toolbar', () => {
  it('renders children', () => {
    render(<Toolbar><button>Click me</button></Toolbar>)
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument()
  })

  it('applies base toolbar classes', () => {
    const { container } = render(<Toolbar>content</Toolbar>)
    const div = container.firstChild as HTMLElement
    expect(div.className).toContain('bg-background-surface')
    expect(div.className).toContain('border-b-2')
    expect(div.className).toContain('px-3')
  })

  it('merges extra className', () => {
    const { container } = render(<Toolbar className="justify-between">content</Toolbar>)
    const div = container.firstChild as HTMLElement
    expect(div.className).toContain('justify-between')
    expect(div.className).toContain('bg-background-surface')
  })
})
```

**Step 2: Run test to verify it fails**

```bash
cd /Users/etblue/Code/GitHub/player1inventory/.worktrees/feature-toolbar-visual-consistency
pnpm test src/components/Toolbar.test.tsx
```

Expected: FAIL — "Cannot find module './Toolbar'"

**Step 3: Write the `Toolbar` component**

Create `src/components/Toolbar.tsx`:

```tsx
import { cn } from '@/lib/utils'

interface ToolbarProps {
  children: React.ReactNode
  className?: string
}

export function Toolbar({ children, className }: ToolbarProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-2 border-b-2 border-accessory-default bg-background-surface',
        className,
      )}
    >
      {children}
    </div>
  )
}
```

**Step 4: Run test to verify it passes**

```bash
pnpm test src/components/Toolbar.test.tsx
```

Expected: PASS — 3 tests pass

**Step 5: Create the Storybook story**

Create `src/components/Toolbar.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react'
import { Filter, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Toolbar } from './Toolbar'

const meta = {
  title: 'Components/Toolbar',
  component: Toolbar,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Toolbar>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    children: (
      <>
        <Button size="icon" variant="neutral-ghost" aria-label="Filter">
          <Filter />
        </Button>
        <span className="flex-1" />
        <Button>
          <Plus />
          Add item
        </Button>
      </>
    ),
  },
}

export const WithJustifyBetween: Story = {
  args: {
    className: 'justify-between',
    children: (
      <>
        <span className="font-bold text-lg">Page Title</span>
        <Button>
          <Plus />
          New
        </Button>
      </>
    ),
  },
}
```

**Step 6: Commit**

```bash
git add src/components/Toolbar.tsx src/components/Toolbar.stories.tsx src/components/Toolbar.test.tsx
git commit -m "feat(toolbar): add shared Toolbar wrapper component"
```

---

### Task 2: Refactor `PantryToolbar` to use `Toolbar`

**Files:**
- Modify: `src/components/PantryToolbar.tsx`

**Step 1: Read the current file**

Open `src/components/PantryToolbar.tsx` and locate line 54:
```tsx
<div className="flex items-center gap-2 px-3 py-2 border-b-2 border-accessory-default bg-background-surface">
```

**Step 2: Apply the change**

Replace the outer `<div>` with `<Toolbar>`:

1. Add import at top of file (after existing imports):
   ```tsx
   import { Toolbar } from '@/components/Toolbar'
   ```

2. Replace:
   ```tsx
   <div className="flex items-center gap-2 px-3 py-2 border-b-2 border-accessory-default bg-background-surface">
   ```
   With:
   ```tsx
   <Toolbar>
   ```

3. Replace the matching closing `</div>` with `</Toolbar>`.

**Step 3: Run existing tests**

```bash
pnpm test
```

Expected: All tests pass. (No functional change — visual only.)

**Step 4: Commit**

```bash
git add src/components/PantryToolbar.tsx
git commit -m "refactor(toolbar): use shared Toolbar in PantryToolbar"
```

---

### Task 3: Update shopping page toolbar

**Files:**
- Modify: `src/routes/shopping.tsx`

**Step 1: Read the current toolbar div**

Open `src/routes/shopping.tsx` and find line 148:
```tsx
<div className="flex items-center gap-2 flex-wrap">
```
This is the toolbar wrapper. It ends at line 213 with `</div>`.

**Step 2: Apply the change**

1. Add import at the top (after other component imports):
   ```tsx
   import { Toolbar } from '@/components/Toolbar'
   ```

2. Replace:
   ```tsx
   <div className="flex items-center gap-2 flex-wrap">
   ```
   With:
   ```tsx
   <Toolbar className="flex-wrap">
   ```

3. Replace the matching closing `</div>` (the one after the cart action buttons `</div>`) with `</Toolbar>`.

**Step 3: Run existing shopping tests**

```bash
pnpm test src/routes/shopping.test.tsx
```

Expected: All tests pass.

**Step 4: Commit**

```bash
git add src/routes/shopping.tsx
git commit -m "feat(toolbar): apply Toolbar styling to shopping page"
```

---

### Task 4: Update vendor list page toolbar

**Files:**
- Modify: `src/routes/settings/vendors/index.tsx`

**Step 1: Read the current toolbar div**

Open `src/routes/settings/vendors/index.tsx` and find the toolbar div (around line 45):
```tsx
<div className="flex items-center justify-between">
```

**Step 2: Apply the change**

1. Add import at the top:
   ```tsx
   import { Toolbar } from '@/components/Toolbar'
   ```

2. Replace:
   ```tsx
   <div className="flex items-center justify-between">
   ```
   With:
   ```tsx
   <Toolbar className="justify-between">
   ```

3. Replace the matching closing `</div>` with `</Toolbar>`.

   Note: The inner `<div className="flex items-center gap-2">` (containing back button + title) stays unchanged.

**Step 3: Run existing vendor tests**

```bash
pnpm test src/routes/settings/vendors.test.tsx
```

Expected: All tests pass.

**Step 4: Commit**

```bash
git add src/routes/settings/vendors/index.tsx
git commit -m "feat(toolbar): apply Toolbar styling to vendor list page"
```

---

### Task 5: Update tags page toolbar

**Files:**
- Modify: `src/routes/settings/tags.tsx`

**Step 1: Read the current toolbar div**

Open `src/routes/settings/tags.tsx` and find the toolbar div (around line 121):
```tsx
<div className="flex items-center gap-2">
```
This contains the back button and the "Tags" heading.

**Step 2: Apply the change**

1. Add import at the top:
   ```tsx
   import { Toolbar } from '@/components/Toolbar'
   ```

2. Replace:
   ```tsx
   <div className="flex items-center gap-2">
   ```
   With:
   ```tsx
   <Toolbar>
   ```
   (No extra className needed — `Toolbar` already includes `gap-2`.)

3. Replace the matching closing `</div>` with `</Toolbar>`.

**Step 3: Run existing tags tests**

```bash
pnpm test src/routes/settings/tags.test.tsx
```

Expected: All tests pass.

**Step 4: Commit**

```bash
git add src/routes/settings/tags.tsx
git commit -m "feat(toolbar): apply Toolbar styling to tags page"
```

---

### Task 6: Final verification

**Step 1: Run full test suite**

```bash
pnpm test
```

Expected: All tests pass.

**Step 2: Build check**

```bash
pnpm build
```

Expected: Build succeeds with no TypeScript errors.

**Step 3: Verify visually in browser**

```bash
pnpm dev
```

Navigate to each page and confirm toolbar looks consistent:
- `/` (Pantry) — surface background, bottom border, padding ✓
- `/shopping` — same ✓
- `/settings/vendors` — same ✓
- `/settings/tags` — same ✓

Fixed nav bars (item/vendor detail pages) should be unchanged.

**Step 4: Commit if any final fixes needed, then move to PR**

Once satisfied, follow the `superpowers:finishing-a-development-branch` skill to create the PR.
