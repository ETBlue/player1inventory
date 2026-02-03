# Component Extraction for Code Readability

**Goal:** Extract inline components from route files to improve code organization and readability.

**Scope:** Project-wide refactoring focusing on routes with embedded components.

**Architecture:** Flat component structure in `src/components/` with named exports.

---

## Components to Extract

### From `src/routes/settings/tags.tsx` (435 lines)

**TagBadge.tsx** (~15 lines)
- Display tag name with item count badge
- Apply TagType's color with auto-contrast text
- Handle click to open detail dialog
- Uses: `useItemCountByTag` hook, `getContrastTextColor` utility

**TagDetailDialog.tsx** (~55 lines)
- Form to edit tag name
- Display item count (read-only)
- Delete button (opens ConfirmDialog)
- Save/Cancel actions
- Uses: Dialog primitives, `useItemCountByTag` hook

**EditTagTypeDialog.tsx** (~60 lines)
- Form to edit tag type name and color
- Live color preview showing example tag
- Save/Cancel actions
- Uses: Dialog primitives, `getContrastTextColor` utility

**AddTagDialog.tsx** (~40 lines)
- Form to add new tag (name only)
- Inherits color from parent TagType
- Add/Cancel actions
- Uses: Dialog primitives

### From `src/routes/shopping.tsx` (191 lines)

**ShoppingItemWithQuantity.tsx** (~20 lines)
- Fetch current quantity for item using `getCurrentQuantity`
- Pass props to ShoppingItemCard
- Simple data-fetching wrapper

### From `src/routes/index.tsx` (135 lines)

**PantryItem.tsx** (~50 lines)
- Fetch current quantity for item
- Fetch last purchase date
- Calculate estimated due date
- Pass props to ItemCard
- Data aggregation wrapper

---

## File Structure

```
src/components/
├── AddQuantityDialog.tsx      # existing
├── ItemCard.tsx                # existing
├── ItemForm.tsx                # existing
├── Layout.tsx                  # existing
├── Navigation.tsx              # existing
├── ShoppingItemCard.tsx        # existing
├── TagBadge.tsx                # NEW
├── TagDetailDialog.tsx         # NEW
├── EditTagTypeDialog.tsx       # NEW
├── AddTagDialog.tsx            # NEW
├── PantryItem.tsx              # NEW
└── ShoppingItemWithQuantity.tsx # NEW
```

---

## Import/Export Patterns

**Import conventions:**
- UI primitives: `@/components/ui/*`
- Hooks: `@/hooks/*`
- Types: `@/types`
- Utils: `@/lib/utils`

**Export pattern:**
- Named exports (matching existing pattern)
- Example: `export function TagBadge({ ... })`

---

## Expected Results

**Route file size reduction:**
- `tags.tsx`: 435 → ~260 lines (40% reduction)
- `shopping.tsx`: 191 → ~170 lines (11% reduction)
- `index.tsx`: 135 → ~85 lines (37% reduction)

**Benefits:**
- Easier component discovery and navigation
- Clearer separation of concerns
- Route files focus on orchestration
- Smaller files are easier to understand

---

## Implementation Order

1. **TagBadge** - Smallest, no dependencies
2. **TagDetailDialog** - Uses tag data
3. **EditTagTypeDialog** - Independent dialog
4. **AddTagDialog** - Independent dialog
5. **PantryItem** - Simple wrapper
6. **ShoppingItemWithQuantity** - Simple wrapper

---

## Testing Strategy

- Existing tests should continue passing (no behavior changes)
- Visual verification in browser
- No new unit tests needed (component logic unchanged)

---

## Dialog Components - Keep Separate

**Decision:** Keep Dialog and AlertDialog separate (standard shadcn/ui pattern)

- **Dialog** - For forms/editing (dismissable, has X button)
- **AlertDialog** - For confirmations (requires explicit action)
- **ConfirmDialog** - Wrapper around AlertDialog (already extracted)

These serve different UX purposes and should remain distinct.
