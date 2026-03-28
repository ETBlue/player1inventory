# Tag Dialogs Refactor — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Reuse `TagInfoForm` in the Add Tag Dialog; introduce a shared `TagTypeInfoForm` component; extract the inline new-tag-type form to a top-bar dialog; fix validation in `EditTagTypeDialog`.

**Brainstorming log:** `docs/features/onboarding/2026-03-28-brainstorming-tag-dialogs.md`

**Prerequisites:** InfoForm refactor complete on `feature/onboarding`.

**TDD approach:** Write failing tests → implement → green. Every step ends with the full verification gate.

---

## Verification Gate (run after every step)

```bash
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-dialogs.log
(cd apps/web && pnpm build-storybook)
(cd apps/web && pnpm check)
grep 'TS6385' /tmp/p1i-dialogs.log && echo "FAIL: deprecated imports" || echo "OK"
(cd apps/web && pnpm test 2>&1 | tail -20)
```

---

## Step 1 — Add `typeReadonly` to TagInfoForm and reuse in Add Tag Dialog

### Part A — `typeReadonly` prop on TagInfoForm

**File:** `apps/web/src/components/tag/TagInfoForm/index.tsx`

Add `typeReadonly?: boolean` to `TagInfoFormProps`. When `true`, render the type `<Select>` with `disabled` attribute.

**Tests** (`TagInfoForm.test.tsx`) — write failing tests first:
- `type select is disabled when typeReadonly is true`
- `type select is enabled when typeReadonly is false or omitted`

**Stories** (`index.stories.tsx`): Add a `TypeReadonly` story showing the disabled type select.
**Smoke test** (`index.stories.test.tsx`): Add smoke test for the new story.

### Part B — Reuse TagInfoForm in Add Tag Dialog

**File:** `apps/web/src/routes/settings/tags/index.tsx`

The Add Tag Dialog currently has its own inline Name + Parent fields (lines 602–685). Replace with `<TagInfoForm>`.

**What to do:**
1. Remove the inline form fields (name input, parent select, submit button) from the dialog body.
2. Construct a template tag when the dialog opens:
   ```ts
   const templateTag: Tag = {
     id: '',
     name: '',
     typeId: addTagDialog,   // addTagDialog holds the typeId that triggered the dialog
     createdAt: new Date(),
     updatedAt: new Date(),
   }
   ```
3. Render inside the dialog body:
   ```tsx
   <TagInfoForm
     tag={templateTag}
     tagTypes={tagTypes}
     parentOptions={tagsWithDepth.filter(t => t.typeId === addTagDialog)}
     typeReadonly={true}
     onSave={(data) => {
       createTag.mutate({ name: data.name, typeId: data.typeId, parentId: data.parentId })
       setAddTagDialog(null)
     }}
     isPending={createTag.isPending}
   />
   ```
4. Remove the `DialogFooter` save button from the dialog — `TagInfoForm` provides its own Save button.
5. Remove now-unused Add Tag Dialog state: `addTagName`, `addTagParentId`, `handleAddTag`, change handlers.

**Note:** `TagInfoForm` manages its own state, so there is no need to reset name/parent when the dialog opens — it initialises from `templateTag` on each render. If the dialog uses a key prop (`key={addTagDialog}`), the form resets automatically when a different type's dialog opens.

**Commit:** `feat(settings/tags): add typeReadonly prop to TagInfoForm; reuse in Add Tag Dialog`

---

## Step 2 — Create TagTypeInfoForm component

**Files:**
- Create: `apps/web/src/components/tag/TagTypeInfoForm/index.tsx`
- Create: `apps/web/src/components/tag/TagTypeInfoForm/TagTypeInfoForm.test.tsx`
- Create: `apps/web/src/components/tag/TagTypeInfoForm/index.stories.tsx`
- Create: `apps/web/src/components/tag/TagTypeInfoForm/index.stories.test.tsx`

### Component

**Props:**
```ts
interface TagTypeInfoFormProps {
  tagType?: TagType          // undefined = create mode; defined = edit mode
  onSave: (data: { name: string; color: TagColor }) => void
  isPending?: boolean
  onDirtyChange?: (isDirty: boolean) => void
}
```

**Internal state:**
- `name` — `useState(tagType?.name ?? '')`
- `color` — `useState(tagType?.color ?? TagColor.blue)`
- `nameError` — `!name.trim() ? t('validation.required') : undefined`
- `isDirty`:
  - Edit mode (`tagType` defined): `name !== tagType.name || color !== tagType.color`
  - Create mode (`tagType` undefined): `name.trim() !== '' || color !== TagColor.blue`
- Fire `onDirtyChange(isDirty)` via `useEffect` when `isDirty` changes
- On save: call `onSave({ name: name.trim(), color })`

**Fields:**
1. Color: `<ColorSelect value={color} onChange={setColor} />` (import from `@/components/ColorSelect`)
2. Name: `<Input value={name} onChange={...} error={nameError} />`
3. Save button: `disabled={!!nameError || !isDirty || !!isPending}`

Follow the field order of the existing inline form (color first, then name).

### Tests — write failing tests first

- `shows required error when name is empty (create mode)`
- `shows required error when name is empty (edit mode)`
- `save button is disabled when name is empty`
- `save button is disabled when not dirty`
- `calls onSave with trimmed name and selected color`
- `calls onDirtyChange(true) when name is entered (create mode)`
- `calls onDirtyChange when color changes (edit mode)`

### Stories

- `CreateMode` — no `tagType` prop, blank form
- `EditMode` — `tagType` with existing name and color
- `WithValidationError` — name cleared to empty
- `Dirty` — name changed
- `Saving` — `isPending: true`

**Commit:** `feat(tags): add TagTypeInfoForm component with local state and validation`

---

## Step 3 — New Tag Type: extract inline form to a top-bar dialog

**File:** `apps/web/src/routes/settings/tags/index.tsx`

### Add "New Tag Type" button to the Toolbar

In the `<Toolbar>` (currently contains only back button + title), add a button on the right side:
```tsx
<Button onClick={() => setNewTagTypeDialog(true)}>
  {t('settings.tags.newTagType')}
</Button>
```

Add i18n keys:
- `en.json`: `"settings.tags.newTagType": "New Tag Type"`
- `tw.json`: `"settings.tags.newTagType": "新標籤類型"`

### Add the dialog

```tsx
<Dialog open={newTagTypeDialog} onOpenChange={setNewTagTypeDialog}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>{t('settings.tags.newTagType')}</DialogTitle>
    </DialogHeader>
    <TagTypeInfoForm
      onSave={(data) => {
        createTagType.mutate(data, { onSuccess: () => setNewTagTypeDialog(false) })
      }}
      isPending={createTagType.isPending}
    />
  </DialogContent>
</Dialog>
```

Add state: `const [newTagTypeDialog, setNewTagTypeDialog] = useState(false)`

### Remove the inline form

Remove the inline form (the `<form>` block above the type cards, roughly lines 525–563 in the current file) and its associated state:
- `newTagTypeName` / `setNewTagTypeName`
- `newTagTypeColor` / `setNewTagTypeColor`
- `handleAddTagType` (or keep it but call it from `TagTypeInfoForm.onSave` — whichever is cleaner)

### Stories and smoke tests

Update `apps/web/src/routes/settings/tags/index.stories.tsx`:
- Add a `WithNewTagTypeDialog` story showing the dialog open
- Update existing stories if the page layout changed (inline form removed)

**Commit:** `feat(settings/tags): replace inline new-tag-type form with top-bar dialog`

---

## Step 4 — EditTagTypeDialog: adopt TagTypeInfoForm (fix validation bug)

**Files:**
- Modify: `apps/web/src/components/tag/EditTagTypeDialog/index.tsx`
- Modify: `apps/web/src/components/tag/EditTagTypeDialog/EditTagTypeDialog.stories.tsx`
- Modify: `apps/web/src/components/tag/EditTagTypeDialog/EditTagTypeDialog.stories.test.tsx`
- Modify: `apps/web/src/routes/settings/tags/index.tsx` (remove controlled form state passed to dialog)

### EditTagTypeDialog component

Replace current controlled-props form with `<TagTypeInfoForm>`.

**New props:**
```ts
interface EditTagTypeDialogProps {
  tagType: TagType | null
  onSave: (data: { name: string; color: TagColor }) => void
  onClose: () => void
  isPending?: boolean
}
```

Inside the dialog body, replace the manual `<Input>` + `<ColorSelect>` with:
```tsx
<TagTypeInfoForm
  tagType={tagType ?? undefined}
  onSave={onSave}
  isPending={isPending}
/>
```

Remove: `name`, `onNameChange`, `color`, `onColorChange` props — the component owns its state now.

### Route file (`settings/tags/index.tsx`)

Remove from the route: `editTagTypeName`, `editTagTypeColor`, `handleEditTagType`, related `useEffect` sync logic.

Update the dialog call site:
```tsx
<EditTagTypeDialog
  tagType={editTagTypeDialog}
  onSave={(data) => updateTagType.mutate({ id: editTagTypeDialog!.id, updates: data })}
  onClose={() => setEditTagTypeDialog(null)}
  isPending={updateTagType.isPending}
/>
```

### Stories

Update `EditTagTypeDialog.stories.tsx`:
- `Default` story now only needs `tagType`, `onSave`, `onClose` props
- Add `WithValidationError` story — show dialog with name cleared to empty (error visible)

### Smoke tests

Update `EditTagTypeDialog.stories.test.tsx` to match new story set.

**Commit:** `feat(settings/tags): refactor EditTagTypeDialog to use TagTypeInfoForm — fixes missing validation`

---

## Final E2E check

```bash
pnpm test:e2e --grep "tags|a11y"
```

Fix any failures before marking this plan complete.
