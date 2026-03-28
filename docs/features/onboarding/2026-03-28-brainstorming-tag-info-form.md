# Brainstorming Log — InfoForm Refactor (Tag, Recipe, Vendor)

**Date:** 2026-03-28
**Topic:** Fix tag Info tab validation errors; refactor TagNameForm → TagInfoForm; apply same pattern to RecipeNameForm and VendorNameForm
**Context:** Bug reported: settings > tags > tag Info tab doesn't show form validation errors. User proposed moving the form implementation to the existing unused `TagNameForm` component and adopting its validation logic. Discussion expanded to a consistent pattern across all three entity Info tabs.

---

## Questions & Answers

**Q1: Is TagNameForm used anywhere in production code?**
A: No. `TagNameForm` is not imported in any production code — only its own stories and smoke tests reference it. It is effectively dead code.

**Q2: What does the current route form (`$id/index.tsx`) lack?**
A: No validation at all. The name `<Input>` has no empty-string check, no error display, and the Save button only checks `!isDirty || isPending`. Three lines would fix the bug directly.

**Q3: What does TagNameForm have that the route form lacks?**
A: Validation pattern:
- `const nameError = !name.trim() ? t('validation.required') : undefined`
- `error={nameError}` prop on `<Input>`
- `disabled={!!nameError || !isDirty || !!isPending}` on Save button

**Q4: Should we just do the 3-line direct fix, or adopt TagNameForm?**
A: The direct fix is simpler, but TagNameForm only handles the name field. The Info tab now has three fields (name, type, parent). Adopting TagNameForm as-is would split the Info tab into two separate form areas, which is awkward.

**Q5: How about transforming TagNameForm into TagInfoForm (covering all three fields)?**
A: Yes — this is the right call:
- Fixes the validation bug (the immediate goal)
- Repurposes the unused component instead of leaving it as dead code or deleting it
- All three fields (name + type + parent) belong together in one form component
- The route file becomes thin — just wires hooks to the component

**Q6: Do `on*Change` callbacks and `isDirty` need to be in props, or can they be local state?**
A: `on*Change` callbacks are unnecessary in props — they're only needed if the parent reacts to individual field changes, which it doesn't. `isDirty` can also be local state inside the component. The parent only needs two things: the committed values on save (via `onSave(data)`) and notification when dirty state changes (via `onDirtyChange`) for the navigation guard (`registerDirtyState`).

**Q7: Should the same pattern apply to recipe and vendor forms?**
A: Yes. Both `RecipeNameForm` and `VendorNameForm` already exist and are used in production (unlike `TagNameForm`). Both currently use the old controlled pattern (parent owns all state, passes `onNameChange`/`isDirty` as props). They should adopt the same new pattern for consistency. Recipe and vendor only have a `name` field each, so their forms stay simple — but the props pattern is unified.

---

## Design Decisions

### Unified props pattern for all three InfoForms

Form components own their field state internally. The route file is thin.

**New pattern:**
```ts
// TagInfoForm
interface TagInfoFormProps {
  tag: Tag                                          // initial values
  tagTypes: TagType[]
  parentOptions: Array<Tag & { depth: number }>     // from useTagsWithDepth
  onSave: (data: { name: string; typeId: string; parentId?: string }) => void
  isPending?: boolean
  onDirtyChange?: (isDirty: boolean) => void        // for navigation guard
}

// RecipeInfoForm (rename from RecipeNameForm)
interface RecipeInfoFormProps {
  recipe: Recipe                                    // initial values
  onSave: (data: { name: string }) => void
  isPending?: boolean
  onDirtyChange?: (isDirty: boolean) => void
}

// VendorInfoForm (rename from VendorNameForm)
interface VendorInfoFormProps {
  vendor: Vendor                                    // initial values
  onSave: (data: { name: string }) => void
  isPending?: boolean
  onDirtyChange?: (isDirty: boolean) => void
}
```

**Route file pattern (all three):**
```tsx
<TagInfoForm
  tag={tag}
  tagTypes={tagTypes}
  parentOptions={tagsWithDepth}
  onSave={(data) => updateTag.mutateAsync({ id: tag.id, ...data })}
  isPending={updateTag.isPending}
  onDirtyChange={registerDirtyState}
/>
```

**Inside the form component:**
- `name`, `typeId`, `parentId` (where applicable) → local `useState`, initialised from the entity prop
- `isDirty` → computed by comparing current state to the entity prop's values
- `nameError` → `!name.trim() ? t('validation.required') : undefined`
- On save: call `onSave(currentData)`, then reset dirty state
- Fire `onDirtyChange(isDirty)` via `useEffect` whenever dirty state flips

### Component renames

| Old | New | Status |
|-----|-----|--------|
| `TagNameForm` | `TagInfoForm` | Unused in production — rename + expand |
| `RecipeNameForm` | `RecipeInfoForm` | Used in production — rename + update props |
| `VendorNameForm` | `VendorInfoForm` | Used in production — rename + update props |

### Validation
- All three: name empty string → `t('validation.required')` error
- Tag only: type and parent are always valid (no additional validation)

---

## Scope Summary

### Tag
1. Rename `TagNameForm/` → `TagInfoForm/`, update component name
2. Extend component to accept and render all three fields: name, type, parent
3. Add name validation (empty string → required error)
4. Adopt new props pattern (local state, `onSave(data)`, `onDirtyChange`)
5. Refactor `settings/tags/$id/index.tsx` Info tab to use `<TagInfoForm>`
6. Update stories and smoke tests

### Recipe
7. Rename `RecipeNameForm/` → `RecipeInfoForm/`, update component name
8. Adopt new props pattern (local state, `onSave(data)`, `onDirtyChange`)
9. Update `settings/recipes/$id/index.tsx` to use new props
10. Update stories and smoke tests
11. Remove all remaining `RecipeNameForm` references

### Vendor
12. Rename `VendorNameForm/` → `VendorInfoForm/`, update component name
13. Adopt new props pattern (local state, `onSave(data)`, `onDirtyChange`)
14. Update `settings/vendors/$id/index.tsx` to use new props
15. Update stories and smoke tests
16. Remove all remaining `VendorNameForm` references
