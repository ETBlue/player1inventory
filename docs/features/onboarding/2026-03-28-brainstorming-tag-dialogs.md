# Brainstorming Log — Tag Dialogs & Form Validation

**Date:** 2026-03-28
**Topic:** Reuse TagInfoForm in Add Tag Dialog; introduce TagTypeInfoForm; extract new-tag-type inline form to a dialog
**Context:** Three related improvements to `settings/tags/index.tsx` — all driven by form consistency and the InfoForm pattern established in the previous refactor.

---

## Questions & Answers

**Q1: Readonly type field in Add Tag Dialog — how to display?**
A: Same component as current (a `<Select>`), just **disabled**. Pass `typeReadonly?: boolean` prop to `TagInfoForm`; when true, the type Select renders as `disabled`.

**Q2: EditTagTypeDialog validation — is the button currently disabled or does it show error text?**
A: Neither. Currently there is **no validation at all** in EditTagTypeDialog — the Save button is always enabled and no error message is rendered. This is a bug.

**Q3: New tag type dialog fields — same as inline form (color + name)?**
A: Yes — same two fields. Extract them into a shared `TagTypeInfoForm` component used by both the new-tag-type dialog and the EditTagTypeDialog.

**Q4: Moving inline form to dialog — is the extra click intentional?**
A: Yes. Reduce visual clutter; discoverability via a "New Tag Type" button in the top bar is sufficient.

---

## Design Decisions

### 1. TagInfoForm — add `typeReadonly` prop

Add `typeReadonly?: boolean` to `TagInfoFormProps`. When `true`, the type `<Select>` renders with `disabled` attribute (same component, just non-interactive). Default: `false`.

In the Add Tag Dialog, pass:
- A template tag object with `{ id: '', name: '', typeId: fixedTypeId, ... }` as the `tag` prop
- `typeReadonly={true}`
- `parentOptions` filtered to the fixed `typeId`
- `onSave` calls `createTag.mutate({ name, typeId, parentId })`

`isDirty` inside TagInfoForm works naturally — template tag has `name: ''`, so any name entry makes it dirty.

### 2. TagTypeInfoForm — new shared component

New component: `apps/web/src/components/tag/TagTypeInfoForm/index.tsx`

**Props:**
```ts
interface TagTypeInfoFormProps {
  tagType?: TagType          // undefined = create mode; defined = edit mode
  onSave: (data: { name: string; color: string }) => void
  isPending?: boolean
  onDirtyChange?: (isDirty: boolean) => void
}
```

**Internal state:**
- `name` — `useState(tagType?.name ?? '')`
- `color` — `useState(tagType?.color ?? defaultColor)` (use the same default as the current inline form)
- `isDirty`:
  - Edit mode: `name !== tagType.name || color !== tagType.color`
  - Create mode: `name.trim() !== '' || color !== defaultColor` (anything entered = dirty)
- `nameError` — `!name.trim() ? t('validation.required') : undefined`
- Fire `onDirtyChange(isDirty)` via `useEffect`
- On save: call `onSave({ name: name.trim(), color })`

**Fields:** color `<ColorSelect>` + name `<Input error={nameError}>` + Save button
**Save button:** `disabled={!!nameError || !isDirty || !!isPending}`

### 3. New Tag Type Dialog

Replace the inline form (color + name above the type cards) with a `<Dialog>` triggered by a **"New Tag Type" button in the top bar** (right side, next to the title).

Dialog contents: `<TagTypeInfoForm onSave={handleAddTagType} isPending={createTagType.isPending} />`

On save: call `createTagType.mutate({ name, color })`, close dialog.

### 4. EditTagTypeDialog — adopt TagTypeInfoForm

Replace the current controlled-props approach (`name`, `onNameChange`, `color`, `onColorChange`, `onSave` passed from parent) with:

```tsx
<TagTypeInfoForm
  tagType={tagType}
  onSave={(data) => updateTagType.mutate({ id: tagType.id, updates: data })}
  isPending={updateTagType.isPending}
/>
```

The dialog wrapper (`EditTagTypeDialog`) becomes a thin shell — just the `<Dialog>` chrome around `<TagTypeInfoForm>`.

Remove the controlled form state (`name`, `color`, change handlers) from the parent route — the component owns it.

---

## Scope Summary

1. Add `typeReadonly?: boolean` prop to `TagInfoForm`; update stories/tests
2. Reuse `TagInfoForm` in the Add Tag Dialog (disable type field, pass template tag)
3. Create `TagTypeInfoForm` component (name + color, local state, validation, shared)
4. Add "New Tag Type" button to top bar; replace inline form with a dialog using `TagTypeInfoForm`
5. Refactor `EditTagTypeDialog` to use `TagTypeInfoForm` (fix validation bug)
6. Remove controlled form state from parent route for both dialogs
