# Design: Use ItemCard in Tag and Recipe Items Pages

Date: 2026-02-23

## Goal

Replace the custom JSX item lists on the tag items page and recipe items page with `ItemCard`, matching the rich display already used on the shopping page (quantity, status bar, tags, expiration).

## ItemCard Prop Changes

Unify mode-specific behavior props into generic, mode-agnostic props:

| Old prop | New prop |
|---|---|
| `cartItem?: CartItem` | `isChecked?: boolean` |
| `onToggleCart?: () => void` | `onCheckboxToggle?: () => void` |
| `onUpdateCartQuantity?: (qty: number) => void` | `onAmountChange?: (delta: number) => void` |
| `onConsume?: () => void` | folded into `onAmountChange` |
| `onAdd?: () => void` | folded into `onAmountChange` |
| _(new)_ | `controlAmount?: number` |

Mode union extended:

```ts
mode?: 'pantry' | 'shopping' | 'tag-assignment' | 'recipe-assignment'
```

### Right-side rendering logic (driven by props, not mode)

- `controlAmount !== undefined` → show `−/controlAmount/+` (shopping and recipe style)
- `controlAmount === undefined` + `onAmountChange` present → show simple `−/+` (pantry style; minus delta uses `-(item.consumeAmount ?? 1)`)
- Neither → no right-side controls

### Left-side rendering logic

- `onCheckboxToggle` present → show checkbox driven by `isChecked`
- Absent → no checkbox

## Pages Updated

### Shopping page

Swap to new unified API:

```tsx
<ItemCard
  isChecked={!!cartItem}
  controlAmount={cartItem?.quantity}   // undefined when not in cart → hides controls
  onCheckboxToggle={() => handleToggleCart(item)}
  onAmountChange={(delta) => handleUpdateCartQuantity(item, (cartItem?.quantity ?? 0) + delta)}
  ...
/>
```

### Pantry page / PantryItem

Swap to new unified API:

```tsx
<ItemCard
  onAmountChange={(delta) => handleAmountChange(item, delta)}
  // ItemCard internally passes -(item.consumeAmount ?? 1) for minus, +1 for plus
  ...
/>
```

### Tag items page (`/settings/tags/$id/items.tsx`)

Replace custom JSX with ItemCard. New data requirements:

- `useTagTypes()` — new hook call needed
- `getCurrentQuantity(item)` — computed from item fields, no extra hook

```tsx
<ItemCard
  mode="tag-assignment"
  item={item}
  quantity={getCurrentQuantity(item)}
  tags={item.tagIds.map(tid => tagMap[tid]).filter(Boolean)}
  tagTypes={tagTypes}
  isChecked={isAssigned(item.tagIds)}
  onCheckboxToggle={() => handleToggle(item.id, item.tagIds)}
  onConsume={() => {}}
  onAdd={() => {}}
/>
```

No `controlAmount` or `onAmountChange` — right-side controls hidden.

### Recipe items page (`/settings/recipes/$id/items.tsx`)

Replace custom JSX with ItemCard. New data requirements:

- `useTags()` — new hook call needed
- `useTagTypes()` — new hook call needed
- `getCurrentQuantity(item)` — computed from item fields

```tsx
<ItemCard
  mode="recipe-assignment"
  item={item}
  quantity={getCurrentQuantity(item)}
  tags={item.tagIds.map(tid => tagMap[tid]).filter(Boolean)}
  tagTypes={tagTypes}
  isChecked={isAssigned(item.id)}
  onCheckboxToggle={() => handleToggle(item.id, item.consumeAmount ?? 1)}
  controlAmount={isAssigned(item.id) ? getDefaultAmount(item.id) : undefined}
  onAmountChange={(delta) => handleAmountChange(item.id, delta)}
  onConsume={() => {}}
  onAdd={() => {}}
/>
```

`controlAmount` is `undefined` when not assigned → hides amount controls. Matches the pattern of cart controls in shopping mode.

## Data Flow Summary

| Page | isChecked | controlAmount | onCheckboxToggle | onAmountChange |
|---|---|---|---|---|
| Shopping | `!!cartItem` | `cartItem?.quantity` | toggle cart | update cart qty |
| Pantry | — | — | — | consume/add |
| Tag items | `isAssigned` | — | toggle tag assignment | — |
| Recipe items | `isAssigned` | recipe amount (when assigned) | toggle recipe assignment | update recipe amount |
