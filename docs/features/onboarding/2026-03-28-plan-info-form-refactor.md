# InfoForm Refactor — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Fix tag Info tab validation bug and unify the form pattern across Tag, Recipe, and Vendor settings pages. Form components own their field state; route files become thin wrappers.

**Brainstorming log:** `docs/features/onboarding/2026-03-28-brainstorming-tag-info-form.md`

**Bug doc:** `docs/features/onboarding/2026-03-27-bug-tag-info-form-validation.md` *(to be created during Step 1)*

**Prerequisites:** Phase A cloud additions complete on `feature/onboarding`.

**TDD approach:** Write failing test → implement → green. Every step ends with the full verification gate.

---

## Verification Gate (run after every step)

```bash
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-infoform.log
(cd apps/web && pnpm build-storybook)
(cd apps/web && pnpm check)
grep 'TS6385' /tmp/p1i-infoform.log && echo "FAIL: deprecated imports" || echo "OK"
(cd apps/web && pnpm test 2>&1 | tail -20)
```

---

## Step 1 — TagInfoForm: rename, expand, and fix validation bug

**Bug:** `settings/tags/$id` Info tab shows no validation errors when name is empty.

**Files:**
- Rename dir: `apps/web/src/components/tag/TagNameForm/` → `TagInfoForm/`
- Rename: `index.tsx`, `index.stories.tsx`, `index.stories.test.tsx`
- Modify: `apps/web/src/routes/settings/tags/$id/index.tsx`

### Component (`TagInfoForm/index.tsx`)

Replace the entire `TagNameForm` implementation with `TagInfoForm`:

**Props:**
```ts
interface TagInfoFormProps {
  tag: Tag
  tagTypes: TagType[]
  parentOptions: Array<Tag & { depth: number }>
  onSave: (data: { name: string; typeId: string; parentId?: string }) => void
  isPending?: boolean
  onDirtyChange?: (isDirty: boolean) => void
}
```

**Internal state:**
- `name`, `typeId`, `parentId` — `useState`, initialised from `tag`
- `isDirty` — computed: `name !== tag.name || typeId !== tag.typeId || parentId !== tag.parentId`
- `nameError` — `!name.trim() ? t('validation.required') : undefined`
- Fire `onDirtyChange(isDirty)` in a `useEffect` when `isDirty` changes
- On save: call `onSave({ name: name.trim(), typeId, parentId })`, then the route handles navigation

**Fields to render** (same layout as current Info tab):
1. Name `<Input>` with `error={nameError}`
2. Tag type `<Select>` — options from `tagTypes`
3. Parent tag `<Select>` — options from `parentOptions`, indented by depth, with "None" option

**Save button:** `disabled={!!nameError || !isDirty || !!isPending}`

**Delete flow:** keep the cascade-or-orphan `AlertDialog` in the **route file** (`$id/index.tsx`), not in the form component — it is a page-level action, not a form field.

### Route file (`$id/index.tsx`)

Remove all inline form state (`name`, `typeId`, `parentId`, `isDirty`, `nameError`, `handleSave`, change handlers). Replace with:

```tsx
<TagInfoForm
  tag={tag}
  tagTypes={tagTypes}
  parentOptions={tagsWithDepth}
  onSave={(data) => updateTag.mutateAsync({ id: tag.id, ...data }).then(() => goBack())}
  isPending={updateTag.isPending}
  onDirtyChange={registerDirtyState}
/>
```

Keep the delete flow (cascade dialog) unchanged in the route file.

### Stories (`TagInfoForm/index.stories.tsx`)

Replace `TagNameForm` stories with `TagInfoForm` stories. Include:
- `Default` — basic tag, no parent, one tag type
- `WithParentOptions` — tag with siblings available as parent options
- `WithValidationError` — name is empty, error shown
- `Dirty` — name changed but not saved
- `Saving` — `isPending: true`

### Smoke test (`TagInfoForm/index.stories.test.tsx`)

Update to use `TagInfoForm` and assert a key visible element per story.

### Tests

Add unit tests covering the validation behaviour — these should fail before implementation:
- `shows required error when name is empty`
- `does not show error when name has content`
- `save button is disabled when name is empty`
- `save button is disabled when not dirty`
- `calls onSave with trimmed name, typeId, and parentId`
- `calls onDirtyChange(true) when name changes`
- `calls onDirtyChange(false) after save`

**Commit:** `feat(settings/tags): replace TagNameForm with TagInfoForm — local state, onSave(data), validation`

---

## Step 2 — RecipeInfoForm: rename and update props pattern

**Files:**
- Rename dir: `apps/web/src/components/recipe/RecipeNameForm/` → `RecipeInfoForm/`
- Rename: `index.tsx`, `index.stories.tsx`, `index.stories.test.tsx`
- Modify: `apps/web/src/routes/settings/recipes/$id/index.tsx`

### Component (`RecipeInfoForm/index.tsx`)

**Props:**
```ts
interface RecipeInfoFormProps {
  recipe: Recipe
  onSave: (data: { name: string }) => void
  isPending?: boolean
  onDirtyChange?: (isDirty: boolean) => void
}
```

**Internal state:**
- `name` — `useState(recipe.name)`
- `isDirty` — `name !== recipe.name`
- `nameError` — `!name.trim() ? t('validation.required') : undefined`
- Fire `onDirtyChange(isDirty)` in `useEffect` when `isDirty` changes
- On save: call `onSave({ name: name.trim() })`

**Fields:** name `<Input>` with `error={nameError}` + Save button

**Save button:** `disabled={!!nameError || !isDirty || !!isPending}`

### Route file (`$id/index.tsx`)

Remove inline form state. Replace `<RecipeNameForm ...>` with:

```tsx
<RecipeInfoForm
  recipe={recipe}
  onSave={(data) => updateRecipe.mutateAsync({ id: recipe.id, updates: data }).then(() => goBack())}
  isPending={updateRecipe.isPending}
  onDirtyChange={registerDirtyState}
/>
```

### Stories

Replace `RecipeNameForm` stories with `RecipeInfoForm` stories:
- `Default`
- `WithValidationError` — empty name
- `Dirty`
- `Saving`

### Smoke test

Update to use `RecipeInfoForm`.

### Tests

- `shows required error when name is empty`
- `save button is disabled when name is empty`
- `calls onSave with trimmed name`
- `calls onDirtyChange when dirty state changes`

**Commit:** `feat(settings/recipes): replace RecipeNameForm with RecipeInfoForm — local state, onSave(data)`

---

## Step 3 — VendorInfoForm: rename and update props pattern

**Files:**
- Rename dir: `apps/web/src/components/vendor/VendorNameForm/` → `VendorInfoForm/`
- Rename: `index.tsx`, `index.stories.tsx`, `index.stories.test.tsx`
- Modify: `apps/web/src/routes/settings/vendors/$id/index.tsx`

### Component (`VendorInfoForm/index.tsx`)

**Props:**
```ts
interface VendorInfoFormProps {
  vendor: Vendor
  onSave: (data: { name: string }) => void
  isPending?: boolean
  onDirtyChange?: (isDirty: boolean) => void
}
```

Same internal pattern as `RecipeInfoForm` — `name` state, `isDirty`, `nameError`, `onDirtyChange` effect, `onSave(data)` on submit.

**Note on vendor name casing:** vendor names are stored and displayed as-is (no `capitalize`). Do not add `capitalize` class. Do not call `.toLowerCase()` before saving.

### Route file (`$id/index.tsx`)

Remove inline form state. Replace `<VendorNameForm ...>` with:

```tsx
<VendorInfoForm
  vendor={vendor}
  onSave={(data) => updateVendor.mutateAsync({ id: vendor.id, updates: data }).then(() => goBack())}
  isPending={updateVendor.isPending}
  onDirtyChange={registerDirtyState}
/>
```

### Stories

Replace `VendorNameForm` stories with `VendorInfoForm` stories:
- `Default`
- `WithValidationError` — empty name
- `Dirty`
- `Saving`

### Smoke test

Update to use `VendorInfoForm`.

### Tests

Same set as Recipe:
- `shows required error when name is empty`
- `save button is disabled when name is empty`
- `calls onSave with name as-is (no casing change)`
- `calls onDirtyChange when dirty state changes`

**Commit:** `feat(settings/vendors): replace VendorNameForm with VendorInfoForm — local state, onSave(data)`

---

## Step 4 — Cleanup: remove all remaining *NameForm references

Search the entire codebase for any remaining imports or references to `TagNameForm`, `RecipeNameForm`, `VendorNameForm`:

```bash
grep -r "TagNameForm\|RecipeNameForm\|VendorNameForm" apps/web/src --include="*.ts" --include="*.tsx" --include="*.md" -l
```

Fix or remove any found. This should be empty after Steps 1–3, but verify.

Run the full verification gate. If clean, **also run E2E tests**:

```bash
pnpm test:e2e --grep "tags|recipes|vendors|settings|a11y"
```

Fix any failures before committing.

**Commit:** `chore: verify no remaining NameForm references after InfoForm refactor` *(only if there were stray references to clean up; skip if grep is already empty)*

---

## Final E2E check

```bash
pnpm test:e2e --grep "tags|recipes|vendors|settings|a11y"
```

Fix any failures before marking this plan complete.
