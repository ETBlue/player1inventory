# Component Folder Reorganization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reorganize `src/components/` from 58 flat files into entity-typed subfolders with per-component folders, improving navigability.

**Architecture:** Group by entity (`item/`, `tag/`, `vendor/`, `recipe/`), shared cross-cutting components stay at the root. Each component gets its own subfolder with `index.tsx` (renamed from `ComponentName.tsx`); story and test files keep their full names inside that folder. No barrel files — just direct path changes.

**Tech Stack:** TypeScript, React, Vitest, Storybook — no new dependencies.

---

## Final Structure

```
src/components/
  item/
    ItemCard/        index.tsx + 7 story/test files
    ItemFilters/     index.tsx + stories
    ItemForm/        index.tsx + test + stories
    ItemListToolbar/ index.tsx + stories
    ItemProgressBar/ index.tsx + test + stories
  tag/
    EditTagTypeDialog/ index.tsx + stories
    TagBadge/          index.tsx + stories
    TagDetailDialog/   index.tsx + stories
    TagNameForm/       index.tsx + test + stories
    TagTypeDropdown/   index.tsx + test + stories
  vendor/
    VendorCard/      index.tsx + test + stories
    VendorNameForm/  index.tsx + test + stories
  recipe/
    RecipeCard/      index.tsx + test + stories
    RecipeNameForm/  index.tsx + stories
  ui/                (unchanged — shadcn primitives)
  AddNameDialog/     index.tsx + stories
  ColorSelect/       index.tsx + test + stories
  DeleteButton/      index.tsx + test + stories
  FilterStatus/      index.tsx + test + stories
  Layout/            index.tsx
  Navigation/        index.tsx
  Toolbar/           index.tsx + test + stories
```

## Import Changes Summary

**Absolute imports that need updating** (entity-specific components only):
- `@/components/ItemCard` → `@/components/item/ItemCard`
- `@/components/ItemFilters` → `@/components/item/ItemFilters`
- `@/components/ItemForm` → `@/components/item/ItemForm`
- `@/components/ItemListToolbar` → `@/components/item/ItemListToolbar`
- `@/components/ItemProgressBar` → `@/components/item/ItemProgressBar`
- `@/components/EditTagTypeDialog` → `@/components/tag/EditTagTypeDialog`
- `@/components/TagBadge` → `@/components/tag/TagBadge`
- `@/components/TagDetailDialog` → `@/components/tag/TagDetailDialog`
- `@/components/TagNameForm` → `@/components/tag/TagNameForm`
- `@/components/TagTypeDropdown` → `@/components/tag/TagTypeDropdown`
- `@/components/VendorCard` → `@/components/vendor/VendorCard`
- `@/components/VendorNameForm` → `@/components/vendor/VendorNameForm`
- `@/components/RecipeCard` → `@/components/recipe/RecipeCard`
- `@/components/RecipeNameForm` → `@/components/recipe/RecipeNameForm`

**Shared root components — no import path change needed:**
`AddNameDialog`, `ColorSelect`, `DeleteButton`, `FilterStatus`, `Layout`, `Navigation`, `Toolbar` — paths unchanged, only internal structure changes.

**Relative imports in story/test files:**
All stories and tests use relative imports like `from './ComponentName'`. After moving to a per-component folder alongside `index.tsx`, these must become `from '.'`. Exception: fixture imports like `from './ItemCard.stories.fixtures'` stay unchanged (fixture file is in the same folder).

---

### Task 1: Move `item/` components

**Files:**
- Create: `src/components/item/ItemCard/index.tsx` (renamed from `ItemCard.tsx`)
- Create: `src/components/item/ItemFilters/index.tsx`
- Create: `src/components/item/ItemForm/index.tsx`
- Create: `src/components/item/ItemListToolbar/index.tsx`
- Create: `src/components/item/ItemProgressBar/index.tsx`

**Step 1: Create directories and move files**

```bash
mkdir -p \
  src/components/item/ItemCard \
  src/components/item/ItemFilters \
  src/components/item/ItemForm \
  src/components/item/ItemListToolbar \
  src/components/item/ItemProgressBar

# ItemCard (8 files)
mv src/components/ItemCard.tsx src/components/item/ItemCard/index.tsx
mv src/components/ItemCard.test.tsx src/components/item/ItemCard/ItemCard.test.tsx
mv src/components/ItemCard.stories.fixtures.tsx src/components/item/ItemCard/ItemCard.stories.fixtures.tsx
mv src/components/ItemCard.assignment.stories.tsx src/components/item/ItemCard/ItemCard.assignment.stories.tsx
mv src/components/ItemCard.cooking.stories.tsx src/components/item/ItemCard/ItemCard.cooking.stories.tsx
mv src/components/ItemCard.pantry.stories.tsx src/components/item/ItemCard/ItemCard.pantry.stories.tsx
mv src/components/ItemCard.shopping.stories.tsx src/components/item/ItemCard/ItemCard.shopping.stories.tsx
mv src/components/ItemCard.variants.stories.tsx src/components/item/ItemCard/ItemCard.variants.stories.tsx

# ItemFilters (2 files)
mv src/components/ItemFilters.tsx src/components/item/ItemFilters/index.tsx
mv src/components/ItemFilters.stories.tsx src/components/item/ItemFilters/ItemFilters.stories.tsx

# ItemForm (3 files)
mv src/components/ItemForm.tsx src/components/item/ItemForm/index.tsx
mv src/components/ItemForm.test.tsx src/components/item/ItemForm/ItemForm.test.tsx
mv src/components/ItemForm.stories.tsx src/components/item/ItemForm/ItemForm.stories.tsx

# ItemListToolbar (2 files)
mv src/components/ItemListToolbar.tsx src/components/item/ItemListToolbar/index.tsx
mv src/components/ItemListToolbar.stories.tsx src/components/item/ItemListToolbar/ItemListToolbar.stories.tsx

# ItemProgressBar (3 files)
mv src/components/ItemProgressBar.tsx src/components/item/ItemProgressBar/index.tsx
mv src/components/ItemProgressBar.test.tsx src/components/item/ItemProgressBar/ItemProgressBar.test.tsx
mv src/components/ItemProgressBar.stories.tsx src/components/item/ItemProgressBar/ItemProgressBar.stories.tsx
```

**Step 2: Fix relative imports inside moved story/test files**

Story and test files imported their component via `from './ComponentName'`. Now they're in the same folder as `index.tsx`, so update to `from '.'`.

In `src/components/item/ItemCard/ItemCard.test.tsx`:
- Replace `from './ItemCard'` → `from '.'`

In each `ItemCard.*.stories.tsx`:
- Replace `from './ItemCard'` → `from '.'`
- Leave `from './ItemCard.stories.fixtures'` unchanged (fixture file is in the same folder)

In `src/components/item/ItemForm/ItemForm.test.tsx` and `ItemForm.stories.tsx`:
- Replace `from './ItemForm'` → `from '.'`

In `src/components/item/ItemListToolbar/ItemListToolbar.stories.tsx`:
- Replace `from './ItemListToolbar'` → `from '.'`

In `src/components/item/ItemFilters/ItemFilters.stories.tsx`:
- Replace `from './ItemFilters'` → `from '.'`

In `src/components/item/ItemProgressBar/ItemProgressBar.test.tsx` and `ItemProgressBar.stories.tsx`:
- Replace `from './ItemProgressBar'` → `from '.'`

---

### Task 2: Move `tag/` components

**Files:**
- Create: `src/components/tag/EditTagTypeDialog/index.tsx`
- Create: `src/components/tag/TagBadge/index.tsx`
- Create: `src/components/tag/TagDetailDialog/index.tsx`
- Create: `src/components/tag/TagNameForm/index.tsx`
- Create: `src/components/tag/TagTypeDropdown/index.tsx`

**Step 1: Create directories and move files**

```bash
mkdir -p \
  src/components/tag/EditTagTypeDialog \
  src/components/tag/TagBadge \
  src/components/tag/TagDetailDialog \
  src/components/tag/TagNameForm \
  src/components/tag/TagTypeDropdown

# EditTagTypeDialog (2 files)
mv src/components/EditTagTypeDialog.tsx src/components/tag/EditTagTypeDialog/index.tsx
mv src/components/EditTagTypeDialog.stories.tsx src/components/tag/EditTagTypeDialog/EditTagTypeDialog.stories.tsx

# TagBadge (2 files)
mv src/components/TagBadge.tsx src/components/tag/TagBadge/index.tsx
mv src/components/TagBadge.stories.tsx src/components/tag/TagBadge/TagBadge.stories.tsx

# TagDetailDialog (2 files)
mv src/components/TagDetailDialog.tsx src/components/tag/TagDetailDialog/index.tsx
mv src/components/TagDetailDialog.stories.tsx src/components/tag/TagDetailDialog/TagDetailDialog.stories.tsx

# TagNameForm (3 files)
mv src/components/TagNameForm.tsx src/components/tag/TagNameForm/index.tsx
mv src/components/TagNameForm.test.tsx src/components/tag/TagNameForm/TagNameForm.test.tsx
mv src/components/TagNameForm.stories.tsx src/components/tag/TagNameForm/TagNameForm.stories.tsx

# TagTypeDropdown (3 files)
mv src/components/TagTypeDropdown.tsx src/components/tag/TagTypeDropdown/index.tsx
mv src/components/TagTypeDropdown.test.tsx src/components/tag/TagTypeDropdown/TagTypeDropdown.test.tsx
mv src/components/TagTypeDropdown.stories.tsx src/components/tag/TagTypeDropdown/TagTypeDropdown.stories.tsx
```

**Step 2: Fix relative imports inside moved story/test files**

In each `tag/*/` story and test file:
- Replace `from './TagBadge'` → `from '.'`
- Replace `from './TagDetailDialog'` → `from '.'`
- Replace `from './TagNameForm'` → `from '.'`
- Replace `from './TagTypeDropdown'` → `from '.'`
- Replace `from './EditTagTypeDialog'` → `from '.'`

---

### Task 3: Move `vendor/` components

**Files:**
- Create: `src/components/vendor/VendorCard/index.tsx`
- Create: `src/components/vendor/VendorNameForm/index.tsx`

**Step 1: Create directories and move files**

```bash
mkdir -p \
  src/components/vendor/VendorCard \
  src/components/vendor/VendorNameForm

# VendorCard (3 files)
mv src/components/VendorCard.tsx src/components/vendor/VendorCard/index.tsx
mv src/components/VendorCard.test.tsx src/components/vendor/VendorCard/VendorCard.test.tsx
mv src/components/VendorCard.stories.tsx src/components/vendor/VendorCard/VendorCard.stories.tsx

# VendorNameForm (3 files)
mv src/components/VendorNameForm.tsx src/components/vendor/VendorNameForm/index.tsx
mv src/components/VendorNameForm.test.tsx src/components/vendor/VendorNameForm/VendorNameForm.test.tsx
mv src/components/VendorNameForm.stories.tsx src/components/vendor/VendorNameForm/VendorNameForm.stories.tsx
```

**Step 2: Fix relative imports inside moved story/test files**

In each `vendor/*/` story and test file:
- Replace `from './VendorCard'` → `from '.'`
- Replace `from './VendorNameForm'` → `from '.'`

---

### Task 4: Move `recipe/` components

**Files:**
- Create: `src/components/recipe/RecipeCard/index.tsx`
- Create: `src/components/recipe/RecipeNameForm/index.tsx`

**Step 1: Create directories and move files**

```bash
mkdir -p \
  src/components/recipe/RecipeCard \
  src/components/recipe/RecipeNameForm

# RecipeCard (3 files)
mv src/components/RecipeCard.tsx src/components/recipe/RecipeCard/index.tsx
mv src/components/RecipeCard.test.tsx src/components/recipe/RecipeCard/RecipeCard.test.tsx
mv src/components/RecipeCard.stories.tsx src/components/recipe/RecipeCard/RecipeCard.stories.tsx

# RecipeNameForm (2 files)
mv src/components/RecipeNameForm.tsx src/components/recipe/RecipeNameForm/index.tsx
mv src/components/RecipeNameForm.stories.tsx src/components/recipe/RecipeNameForm/RecipeNameForm.stories.tsx
```

**Step 2: Fix relative imports inside moved story/test files**

In each `recipe/*/` story and test file:
- Replace `from './RecipeCard'` → `from '.'`
- Replace `from './RecipeNameForm'` → `from '.'`

---

### Task 5: Move shared root components to per-component folders

These components stay at the root of `src/components/` — only their internal structure changes. Import paths do NOT change.

**Files:**
- Create: `src/components/AddNameDialog/index.tsx`
- Create: `src/components/ColorSelect/index.tsx`
- Create: `src/components/DeleteButton/index.tsx`
- Create: `src/components/FilterStatus/index.tsx`
- Create: `src/components/Layout/index.tsx`
- Create: `src/components/Navigation/index.tsx`
- Create: `src/components/Toolbar/index.tsx`

**Step 1: Create directories and move files**

```bash
# AddNameDialog (2 files)
mkdir src/components/AddNameDialog
mv src/components/AddNameDialog.tsx src/components/AddNameDialog/index.tsx
mv src/components/AddNameDialog.stories.tsx src/components/AddNameDialog/AddNameDialog.stories.tsx

# ColorSelect (3 files)
mkdir src/components/ColorSelect
mv src/components/ColorSelect.tsx src/components/ColorSelect/index.tsx
mv src/components/ColorSelect.test.tsx src/components/ColorSelect/ColorSelect.test.tsx
mv src/components/ColorSelect.stories.tsx src/components/ColorSelect/ColorSelect.stories.tsx

# DeleteButton (3 files)
mkdir src/components/DeleteButton
mv src/components/DeleteButton.tsx src/components/DeleteButton/index.tsx
mv src/components/DeleteButton.test.tsx src/components/DeleteButton/DeleteButton.test.tsx
mv src/components/DeleteButton.stories.tsx src/components/DeleteButton/DeleteButton.stories.tsx

# FilterStatus (3 files)
mkdir src/components/FilterStatus
mv src/components/FilterStatus.tsx src/components/FilterStatus/index.tsx
mv src/components/FilterStatus.test.tsx src/components/FilterStatus/FilterStatus.test.tsx
mv src/components/FilterStatus.stories.tsx src/components/FilterStatus/FilterStatus.stories.tsx

# Layout (1 file)
mkdir src/components/Layout
mv src/components/Layout.tsx src/components/Layout/index.tsx

# Navigation (1 file)
mkdir src/components/Navigation
mv src/components/Navigation.tsx src/components/Navigation/index.tsx

# Toolbar (3 files)
mkdir src/components/Toolbar
mv src/components/Toolbar.tsx src/components/Toolbar/index.tsx
mv src/components/Toolbar.test.tsx src/components/Toolbar/Toolbar.test.tsx
mv src/components/Toolbar.stories.tsx src/components/Toolbar/Toolbar.stories.tsx
```

**Step 2: Fix relative imports inside moved story/test files**

In each shared component's story and test files:
- Replace `from './AddNameDialog'` → `from '.'`
- Replace `from './ColorSelect'` → `from '.'`
- Replace `from './DeleteButton'` → `from '.'`
- Replace `from './FilterStatus'` → `from '.'`
- Replace `from './Toolbar'` → `from '.'`

---

### Task 6: Update all absolute imports throughout the codebase

**Files to modify:** All files in `src/routes/` and `src/components/` that import the entity-specific components.

**Step 1: Run sed replacements for item components**

```bash
# In the project root, run these sed commands on all .tsx and .ts files:

find src -name "*.tsx" -o -name "*.ts" | xargs sed -i '' \
  "s|@/components/ItemCard'|@/components/item/ItemCard'|g" \
  "s|@/components/ItemFilters'|@/components/item/ItemFilters'|g" \
  "s|@/components/ItemForm'|@/components/item/ItemForm'|g" \
  "s|@/components/ItemListToolbar'|@/components/item/ItemListToolbar'|g" \
  "s|@/components/ItemProgressBar'|@/components/item/ItemProgressBar'|g"
```

**Step 2: Run sed replacements for tag components**

```bash
find src -name "*.tsx" -o -name "*.ts" | xargs sed -i '' \
  "s|@/components/EditTagTypeDialog'|@/components/tag/EditTagTypeDialog'|g" \
  "s|@/components/TagBadge'|@/components/tag/TagBadge'|g" \
  "s|@/components/TagDetailDialog'|@/components/tag/TagDetailDialog'|g" \
  "s|@/components/TagNameForm'|@/components/tag/TagNameForm'|g" \
  "s|@/components/TagTypeDropdown'|@/components/tag/TagTypeDropdown'|g"
```

**Step 3: Run sed replacements for vendor and recipe components**

```bash
find src -name "*.tsx" -o -name "*.ts" | xargs sed -i '' \
  "s|@/components/VendorCard'|@/components/vendor/VendorCard'|g" \
  "s|@/components/VendorNameForm'|@/components/vendor/VendorNameForm'|g" \
  "s|@/components/RecipeCard'|@/components/recipe/RecipeCard'|g" \
  "s|@/components/RecipeNameForm'|@/components/recipe/RecipeNameForm'|g"
```

**Step 4: Verify no old `@/components/Item`, `@/components/Tag`, `@/components/Vendor`, `@/components/Recipe`, `@/components/EditTag` imports remain**

```bash
grep -r "@/components/Item\|@/components/Tag\|@/components/Vendor\|@/components/Recipe\|@/components/EditTag" src/ --include="*.tsx" --include="*.ts"
```

Expected: No output. If any appear, update them manually.

---

### Task 7: Verify tests pass

**Step 1: Run all tests**

```bash
pnpm test
```

Expected: All tests pass with no import resolution errors.

If tests fail with "Cannot find module", check:
1. The relative import in the failing file (story/test) — should be `from '.'` not `from './ComponentName'`
2. The absolute import — should have the new entity subfolder path

**Step 2: Fix any remaining import issues**

Use the error messages to identify which files still have old import paths and fix them manually.

---

### Task 8: Verify build passes

**Step 1: Run production build**

```bash
pnpm build
```

Expected: Build completes with no errors. TypeScript should resolve all `index.tsx` files correctly.

---

### Task 9: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Update component paths in CLAUDE.md**

Search CLAUDE.md for references to the old flat paths and update to new paths. Key sections to update:

- **Shared Components** section: Update file paths like `src/components/Toolbar.tsx` → `src/components/Toolbar/index.tsx`
- **Features** section: Update paths like `src/components/ItemForm.tsx` → `src/components/item/ItemForm/index.tsx`
- **Custom Hooks** section: No component paths, no change needed

Use Grep to find all component path references:
```bash
grep -n "src/components/" CLAUDE.md
```

Update each occurrence to use the new subfolder structure. For entity-specific components, add the entity subfolder. For shared components, add the component's own folder (`/index.tsx`).

---

### Task 10: Commit

**Step 1: Stage all changes**

```bash
git add -A
git status  # verify: only moves, import fixes, and CLAUDE.md changes
```

**Step 2: Commit**

```bash
git commit -m "refactor(components): reorganize into entity subfolders with per-component folders"
```
