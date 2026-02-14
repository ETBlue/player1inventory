# Manual Quantity Input Design

**Date:** 2026-02-14
**Feature:** Allow users to manually type current inventory amounts

## Overview

Users need the ability to manually set current inventory quantities directly, rather than only using Add/Consume buttons. This is useful for:
- Initial inventory setup (bulk entry)
- Corrections after physical inventory counts
- Adjusting quantities when items were consumed/added outside the app

## Design Decisions

### Location

Manual quantity input will be added to the **item detail page** (`/items/$id`) via the existing ItemForm component. This keeps the feature discoverable while avoiding clutter on the main pantry view.

### Approach

Use a **flexible dual-field approach** with separate inputs for packed and unpacked quantities:
- "Packed Quantity" (always visible)
- "Unpacked Quantity" (only for dual-unit items)

This provides direct control while matching the underlying data model.

### Logging

Manual quantity adjustments will **not create inventory log entries**. These are corrections/overrides, not tracked transactions. The Add/Consume buttons remain the primary way to log inventory changes.

### Implementation

Fields will be added directly to the ItemForm component, maintaining consistency with existing form patterns.

## UI/Form Layout

### Field Placement

Add a new "Current Inventory" section to ItemForm:
- Position: After "Amount per Consume" field, before "Expiration" section
- Visual distinction: Add a divider or subtle background tint to separate from other fields

### Fields

**Packed Quantity:**
- Label: "Packed Quantity" or "Packages in Stock"
- Type: Number input
- Validation: Non-negative integer
- Always visible for all items

**Unpacked Quantity:**
- Label: "Unpacked Quantity" or "Loose Amount"
- Type: Number input
- Validation: Non-negative number (decimals allowed)
- Only visible when `targetUnit === 'measurement'` (dual-unit items)
- Show unit label from `measurementUnit` field (e.g., "L", "kg")

### Example Layout

```
Amount per Consume: [1] bottles

--- Current Inventory ---
Packed Quantity: [2] bottles
Unpacked Quantity: [0.5] L

--- Expiration ---
...
```

## Data Flow and Validation

### Saving Values

When user saves the form:
1. Validation runs on both fields
2. Values are written directly to `item.packedQuantity` and `item.unpackedQuantity`
3. `updateItem` mutation updates the database
4. No inventory log entry is created

### Validation Rules

**Packed quantity:**
- Must be non-negative integer (0, 1, 2, ...)
- Error message: "Must be 0 or greater"

**Unpacked quantity:**
- Must be non-negative number (0, 0.5, 1.25, ...)
- Should be less than `amountPerPackage` for dual-unit items
- Error message for negative: "Must be 0 or greater"
- Warning for excess: "Should be less than {amountPerPackage} {measurementUnit}. Consider adding to packed quantity."

### Initial Values

Pre-populate fields with current `item.packedQuantity` and `item.unpackedQuantity` from the database.

### Auto-normalization Decision

**Do not auto-normalize on save.** Show validation warning instead if unpacked ≥ amountPerPackage.

Rationale:
- More predictable and transparent
- Prevents surprising transformations
- User can manually fix or override if needed

## Error Handling and Edge Cases

### Validation Feedback

- Show inline error messages below each field when validation fails
- Use existing form validation pattern from ItemForm (likely React Hook Form)
- Errors prevent form submission

### Empty Fields

- Empty fields are treated as 0
- Placeholder text shows "0" to make this clear
- Matches database schema defaults

### Simple Mode (Package-only)

For items where `targetUnit === 'package'`:
- Only show "Packed Quantity" field
- Hide "Unpacked Quantity" field entirely
- Keeps UI clean and focused

### Save Behavior

- Save button updates the item in database
- Form stays open (matches existing ItemForm behavior)
- Success feedback via toast notification or form state
- TanStack Query automatically invalidates and refetches data

### Interaction with Add/Consume Buttons

Manual quantity fields and Add/Consume buttons are independent:
- Add/Consume buttons use existing `addItem()` and `consumeItem()` logic
- They create inventory logs
- Manual fields provide an alternative for direct corrections

## Testing Strategy

### Unit Tests (Vitest)

Test validation logic in isolation:
- Packed quantity validation (negative values, non-integers)
- Unpacked quantity validation (negative values, exceeds amountPerPackage)
- Empty field handling (defaults to 0)

### Component Tests (React Testing Library)

Test ItemForm component:
- Fields render correctly for dual-unit items
- Fields render correctly for package-only items (unpacked hidden)
- Initial values populate from item data
- Validation errors display properly
- Save button updates database with correct values

### Integration Test

Add to existing test file (e.g., `src/routes/items/$id.test.tsx`):
1. User opens item detail page
2. User edits packed/unpacked quantities
3. User saves form
4. Database updates correctly
5. No inventory log created
6. UI reflects new quantities

### Storybook Stories

Add story to ItemForm showing:
- Dual-unit item with current quantities (e.g., 2 bottles + 0.5L)
- Package-only item with current quantity (e.g., 3 packs)
- Validation error states

### Accessibility

- Verify fields have proper labels
- Verify error messages are associated with fields (aria-describedby)
- Verify keyboard navigation works
- Test with screen reader if possible

## Technical Notes

### Files to Modify

- `src/components/ItemForm.tsx` - Add quantity input fields
- `src/routes/items/$id.tsx` - Verify form integration (likely no changes needed)
- `src/components/ItemForm.stories.tsx` - Add stories for new fields
- `src/routes/items/$id.test.tsx` - Add integration test

### Validation Library

Use existing form validation from ItemForm (likely React Hook Form with Zod or similar schema validation).

### Database Schema

No database changes needed. Uses existing fields:
- `item.packedQuantity` (number)
- `item.unpackedQuantity` (number)
