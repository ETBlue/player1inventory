# Item Form Reuse Design

**Date:** 2026-02-17
**Status:** Approved

## Goal

Extract the polished item detail form (`src/routes/items/$id/index.tsx`) into a shared `ItemForm` component that is used by both the edit route and the new item route (`src/routes/items/new.tsx`).

## Decisions

- **Approach:** Stateful `ItemForm` component with internal state, configured via props.
- **Tags:** Remove tags from the new item form. Users assign tags after creation from the Tags tab.
- **Stock section:** Only shown in edit mode (new items start at 0 quantities).
- **Expiration split:** Expiration *mode* (date vs. days) and *warning threshold* belong in Item Info. Expiration *value* (actual due date or days count) belongs in Stock Status, since it's dynamic per purchase.

## Component API

**`src/components/ItemForm.tsx`**

```tsx
type ItemFormValues = {
  // Stock fields (edit only)
  packedQuantity: number
  unpackedQuantity: number
  dueDate: string
  estimatedDueDays: string | number

  // Item Info fields
  name: string
  packageUnit: string
  targetQuantity: number
  refillThreshold: number
  consumeAmount: number
  expirationMode: 'date' | 'days'
  expirationThreshold: string | number

  // Advanced fields
  targetUnit: 'package' | 'measurement'
  measurementUnit: string
  amountPerPackage: string | number
}

interface ItemFormProps {
  initialValues?: Partial<ItemFormValues>
  sections?: ('stock' | 'info' | 'advanced')[]  // default: ['info', 'advanced']
  onSubmit: (values: ItemFormValues) => void
  onDirtyChange?: (isDirty: boolean) => void
  submitLabel?: string  // default: 'Save'
}
```

## Section Layout

### Stock Status (edit only)

- Packed Quantity, Unpacked Quantity (2-col grid)
- Pack unpacked button
- Expiration Value: actual date or days count (conditional on `expirationMode` from Item Info)

### Item Info (both)

- Name * (required)
- Package Unit
- Target Quantity, Refill When Below (2-col grid)
- Amount per Consume
- Expiration Mode selector (Specific Date / Days from Purchase)
- Expiration Warning threshold (days)

### Advanced Configuration (both)

- Track in measurement switch
- Measurement Unit, Amount per Package (2-col grid, disabled when switch is off)

## Behavior

### Submit button

- **Edit mode** (`onDirtyChange` provided): disabled when form is clean or validation fails
- **Create mode** (`onDirtyChange` absent): disabled only on validation failure

### Dirty state

- Tracked internally by comparing current values against `initialValues`
- Reported upward via `onDirtyChange(isDirty)` on every change

### Background sync

- A `useEffect` inside `ItemForm` re-syncs all fields from `initialValues` when it changes
- Only syncs when the form is clean (isDirty = false), preserving unsaved user edits
- Necessary for the edit form: quantity changes from +/- buttons on the pantry page update the DB and are reflected here

### Validation

- If `targetUnit === 'measurement'`: both `measurementUnit` and `amountPerPackage` are required
- Validation message shown below submit button when applicable

### Unit conversion

- When toggling measurement tracking switch, all quantity fields auto-convert using `amountPerPackage`
- Affected fields: `unpackedQuantity`, `targetQuantity`, `refillThreshold`, `consumeAmount`

## Route Changes

### Edit route (`src/routes/items/$id/index.tsx`)

```tsx
const { registerDirtyState } = useItemLayout()
const updateItem = useUpdateItem()

const handleSubmit = (values: ItemFormValues) => {
  updateItem.mutate({ id, updates: buildUpdates(values) })
}

return (
  <ItemForm
    initialValues={item}
    sections={['stock', 'info', 'advanced']}
    onSubmit={handleSubmit}
    onDirtyChange={registerDirtyState}
  />
)
```

The `buildUpdates` helper maps `ItemFormValues` to the DB update shape (handles optional fields, type coercions, and the `estimatedDueDays`/`dueDate` mutual exclusion).

### New item route (`src/routes/items/new.tsx`)

```tsx
const createItem = useCreateItem()
const navigate = useNavigate()

const handleSubmit = (values: ItemFormValues) => {
  createItem.mutate(buildCreateData(values), {
    onSuccess: (newItem) => navigate({ to: '/items/$id', params: { id: newItem.id } })
  })
}

return (
  <ItemForm
    onSubmit={handleSubmit}
  />
)
```

The `buildCreateData` helper maps `ItemFormValues` to the create shape (always sets `packedQuantity: 0`, `unpackedQuantity: 0`, `tagIds: []`).

## Files

| File | Action |
|------|--------|
| `src/components/ItemForm.tsx` | Create |
| `src/components/ItemForm.stories.tsx` | Create |
| `src/routes/items/$id/index.tsx` | Replace form JSX with `<ItemForm>` |
| `src/routes/items/new.tsx` | Replace form JSX with `<ItemForm>`, remove tags |

## Storybook Stories

- `CreateMode` — empty form, info + advanced sections only
- `EditMode` — pre-filled with all three sections
- `EditMeasurementMode` — pre-filled with measurement tracking enabled
- `EditValidationError` — measurement switch on, units missing
