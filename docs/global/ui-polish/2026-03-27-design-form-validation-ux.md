# Form Validation UX — Design Doc

**Branch:** `feature/form-validation-ux`
**Date:** 2026-03-27
**Status:** 🔲 Pending

---

## Goal

Show validation error messages under invalid form inputs so users understand why the Save button is disabled. Errors are shown immediately on page load using the existing manual validation logic — no new validation library introduced.

---

## Design Decisions

- **Approach:** Derive errors inline at render time (no separate errors state)
- **Trigger:** Errors visible immediately on page load
- **Display:** Error message text below the field + red border/ring on the input
- **Library:** None — keep existing manual validation logic

---

## 1. `Input` Component Changes

**File:** `src/components/ui/input.tsx`

Add an `error?: string` prop. When set:
- Apply `border-destructive focus-visible:ring-destructive` to the input element
- Render `<p className="text-sm text-destructive mt-1">{error}</p>` below the input

```tsx
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string
}
```

---

## 2. Error Derivation Pattern

Each form computes an `errors` object as a derived `const` from current field values (no state). The Save button's `disabled` condition unifies with this object.

```ts
const errors = {
  name: !name.trim() ? t('validation.required') : undefined,
}

const isValid = Object.values(errors).every(v => !v)
// button: disabled={!isDirty || !isValid || isPending}
```

For **ItemForm**, additional fields:
```ts
const errors = {
  name: !name.trim() ? t('validation.required') : undefined,
  measureUnit: trackMeasurement && !measureUnit ? t('validation.required') : undefined,
  consumeAmount: trackMeasurement && consumeAmount <= 0 ? t('validation.positiveNumber') : undefined,
}
```

The existing `validationMessage` block below the Save button in `ItemForm` is removed — superseded by field-level messages.

---

## 3. i18n Strings

Add to both `en.json` and `tw.json`:

**EN:**
```json
"validation": {
  "required": "This field is required.",
  "positiveNumber": "Must be greater than 0."
}
```

**TW:**
```json
"validation": {
  "required": "此欄位為必填。",
  "positiveNumber": "必須大於 0。"
}
```

---

## 4. Scope — Forms to Update

| Form | File | Fields with errors |
|---|---|---|
| ItemForm (new + edit) | `src/components/item/ItemForm/index.tsx` | name (required), measureUnit (required when tracking), consumeAmount (must be > 0 when tracking) |
| VendorNameForm | `src/components/vendor/VendorNameForm/index.tsx` | name (required) |
| RecipeNameForm | `src/components/recipe/RecipeNameForm/index.tsx` | name (required) |
| TagNameForm | `src/components/tag/TagNameForm/index.tsx` | name (required) |
| AddNameDialog | `src/components/AddNameDialog/index.tsx` | name (required) |

---

## Implementation Order

1. Update `Input` component — add `error` prop, visual error state, error message rendering
2. Add i18n strings (en + tw)
3. Update simple name forms (VendorNameForm, RecipeNameForm, TagNameForm, AddNameDialog)
4. Update ItemForm — derive errors object, thread to fields, remove old `validationMessage` block

**Verification gate** after each step: `pnpm lint`, `pnpm build`, `pnpm build-storybook`, `pnpm check`.

**Final phase:** `pnpm test:e2e --grep "items|vendors|recipes|tags|settings|a11y"`
