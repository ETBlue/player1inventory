# Toolbar: New Vendor and New Recipe Pages Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace raw inline div headers with the shared `<Toolbar>` component on the New Vendor and New Recipe pages, and align New Vendor's back navigation to use `useAppNavigation`.

**Architecture:** Pure refactor — no logic changes, no new components. Replace `<div className="flex items-center gap-2">` with `<Toolbar>` in two route files. Add `useAppNavigation` to the vendor page for consistent smart back nav.

**Tech Stack:** React, TanStack Router, `src/components/Toolbar.tsx`, `src/hooks/useAppNavigation.ts`

---

### Task 1: Apply Toolbar to New Vendor Page

**Files:**
- Modify: `src/routes/settings/vendors/new.tsx`

**Step 1: Open the file and read it**

Read `src/routes/settings/vendors/new.tsx` to confirm current state before editing.

**Step 2: Update imports**

Add two imports at the top of the file:

```tsx
import { Toolbar } from '@/components/Toolbar'
import { useAppNavigation } from '@/hooks/useAppNavigation'
```

**Step 3: Add `goBack` from `useAppNavigation`**

Inside `NewVendorPage`, add this line after the existing hooks:

```tsx
const { goBack } = useAppNavigation('/settings/vendors')
```

Remove the `useNavigate` call if it is no longer needed after this change. Check: `navigate` is only used in `handleSave`'s `onSuccess`, so keep `useNavigate` and its import — only the back button usage changes.

**Step 4: Replace the raw div header with `<Toolbar>`**

Replace:

```tsx
<div className="flex items-center gap-2">
  <Button
    variant="neutral-ghost"
    size="icon"
    onClick={() => navigate({ to: '/settings/vendors' })}
  >
    <ArrowLeft className="h-5 w-5" />
  </Button>
  <h1 className="text-2xl font-bold">New Vendor</h1>
</div>
```

With:

```tsx
<Toolbar>
  <Button
    variant="neutral-ghost"
    size="icon"
    onClick={goBack}
  >
    <ArrowLeft className="h-5 w-5" />
  </Button>
  <h1 className="text-2xl font-bold">New Vendor</h1>
</Toolbar>
```

**Step 5: Verify the file compiles**

Run: `pnpm build`
Expected: No TypeScript or build errors.

---

### Task 2: Apply Toolbar to New Recipe Page

**Files:**
- Modify: `src/routes/settings/recipes/new.tsx`

**Step 1: Open the file and read it**

Read `src/routes/settings/recipes/new.tsx` to confirm current state before editing.

**Step 2: Add the Toolbar import**

Add this import:

```tsx
import { Toolbar } from '@/components/Toolbar'
```

**Step 3: Replace the raw div header with `<Toolbar>`**

Replace:

```tsx
<div className="flex items-center gap-2">
  <Button variant="neutral-ghost" size="icon" onClick={goBack}>
    <ArrowLeft className="h-5 w-5" />
  </Button>
  <h1 className="text-2xl font-bold">New Recipe</h1>
</div>
```

With:

```tsx
<Toolbar>
  <Button variant="neutral-ghost" size="icon" onClick={goBack}>
    <ArrowLeft className="h-5 w-5" />
  </Button>
  <h1 className="text-2xl font-bold">New Recipe</h1>
</Toolbar>
```

Back navigation already uses `useAppNavigation` — no change needed.

**Step 4: Verify the file compiles**

Run: `pnpm build`
Expected: No TypeScript or build errors.

---

### Task 3: Run tests and commit

**Step 1: Run tests**

Run: `pnpm test`
Expected: All tests pass. No test changes are needed — existing tests don't assert on toolbar markup.

**Step 2: Commit**

```bash
git add src/routes/settings/vendors/new.tsx src/routes/settings/recipes/new.tsx
git commit -m "refactor(new-pages): apply Toolbar component and align back navigation"
```
