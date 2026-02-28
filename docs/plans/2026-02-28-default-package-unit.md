# Default Package Unit Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the hardcoded `'units'` fallback with a shared `DEFAULT_PACKAGE_UNIT = 'pack'` constant so the default label is consistent and configurable in one place.

**Architecture:** Add the constant to `src/types/index.ts` (co-located with the `Item` interface that owns `packageUnit`). Update `ItemCard`, `ItemForm`, and the inventory log tab to import and use it. `cooking.tsx` intentionally uses `''` and is left alone.

**Tech Stack:** TypeScript, React 19, Vitest + React Testing Library

---

### Task 1: Add constant, fix tests, update all source files

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/components/ItemCard.tsx`
- Modify: `src/components/ItemCard.test.tsx` (line 54–64)
- Modify: `src/components/ItemForm.tsx`
- Modify: `src/routes/items/$id.log.tsx`

---

**Step 1: Update the failing test expectation**

In `src/components/ItemCard.test.tsx`, find the test at around line 54:

```ts
it('returns "units" when no package unit defined', () => {
```

Change it to:

```ts
it('returns default unit when no package unit defined', () => {
```

Also change the assertion at around line 64:

```ts
  expect(displayUnit).toBe('units')
```

to:

```ts
  expect(displayUnit).toBe('pack')
```

**Step 2: Run the test to confirm it fails**

```bash
pnpm test --run src/components/ItemCard.test.tsx
```

Expected: **FAIL** — `expected 'units' to be 'pack'`

---

**Step 3: Add the constant to `src/types/index.ts`**

Add this line immediately before the `export interface Item` declaration:

```ts
export const DEFAULT_PACKAGE_UNIT = 'pack'
```

---

**Step 4: Update `src/components/ItemCard.tsx`**

Add `DEFAULT_PACKAGE_UNIT` to the import from `@/types`:

```ts
import type { Item, Recipe, Tag, TagType, Vendor } from '@/types'
```
→
```ts
import { DEFAULT_PACKAGE_UNIT } from '@/types'
import type { Item, Recipe, Tag, TagType, Vendor } from '@/types'
```

Find line ~147:
```tsx
: (item.packageUnit ?? 'units')}
```
Replace with:
```tsx
: (item.packageUnit ?? DEFAULT_PACKAGE_UNIT)}
```

---

**Step 5: Update `src/components/ItemForm.tsx`**

Add `DEFAULT_PACKAGE_UNIT` to the import from `@/types`. Then replace all five occurrences of `|| 'pack'` with `|| DEFAULT_PACKAGE_UNIT`.

The five occurrences are all of the form:
```tsx
: packageUnit || 'pack'}
```
or
```tsx
({packageUnit || 'pack'})
```

Use search-and-replace: `|| 'pack'` → `|| DEFAULT_PACKAGE_UNIT` across the entire file (only affects `ItemForm.tsx` — safe to replace all).

---

**Step 6: Update `src/routes/items/$id.log.tsx`**

Add `DEFAULT_PACKAGE_UNIT` to the import from `@/types`. Then find:
```tsx
{item?.packageUnit ?? 'units'}
```
Replace with:
```tsx
{item?.packageUnit ?? DEFAULT_PACKAGE_UNIT}
```

---

**Step 7: Run all tests**

```bash
pnpm test --run
```

Expected: **503 tests pass** (or more if any new ones were added), 0 failures.

---

**Step 8: Commit**

```bash
git add src/types/index.ts src/components/ItemCard.tsx src/components/ItemCard.test.tsx src/components/ItemForm.tsx "src/routes/items/\$id.log.tsx"
git commit -m "feat(item-card): add DEFAULT_PACKAGE_UNIT constant, replace 'units' fallback with 'pack'"
```
