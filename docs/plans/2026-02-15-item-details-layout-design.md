# Item Details Page Layout Redesign

**Date:** 2026-02-15
**Status:** Approved

## Overview

Restructure the item details page (`/items/$id`) to improve usability with a fixed top bar and optimized form field layout. Group related fields in horizontal rows and replace expiration mode toggle buttons with a dropdown select.

## Goals

1. Keep navigation and primary actions always visible via fixed top bar
2. Reduce vertical scrolling by grouping related fields horizontally
3. Improve form scannability with logical field groupings
4. Prepare architecture for future tab navigation (item history, count, settings)

## Component Structure

### Route Component (`/items/$id.tsx`)

**Responsibilities:**
- Render fixed top bar with navigation and action buttons
- Render ItemForm component with proper spacing
- Handle navigation, deletion, and form submission

**Fixed Top Bar Elements:**
- Back button (`<ArrowLeft>`) - navigates to `/`
- Item name (read-only text, truncated if long)
- History button (`<History>`) - links to `/items/$id/log`
- Delete button (`<Trash2>`) - shows confirmation, deletes item

**Layout:**
```
[Back Icon] [Item Name] .............. [History Icon] [Delete Icon]
```

**Styling:**
- `position: fixed` at top of viewport
- `bg-background-elevated` - toolbar/header elevation
- Full width with horizontal padding (`p-4`)
- Bottom border (`border-b`)
- High z-index to stay above scrolling content

### ItemForm Component

**Responsibilities:**
- Render editable form fields
- Handle form validation and submission
- Keep save button at bottom (no change to submission flow)

**Changes:**
- Group fields into horizontal rows
- Replace expiration mode buttons with dropdown
- Remove "Current Inventory" section heading
- Maintain existing validation and state management

## Form Field Layout

**Top to bottom:**

1. **Name field** (full-width)
   - Editable input for item name

2. **Package info row** (3 equal-width fields)
   - Package Unit
   - Measurement Unit
   - Amount per Package

3. **Track target switch** (full-width, conditional)
   - Only shown when measurement unit is set
   - "Track target in measurement" switch with label

4. **Target/consumption row** (3 equal-width fields)
   - Target Quantity
   - Refill When Below
   - Amount per Consume

5. **Inventory row** (2 equal-width fields)
   - Packed Quantity
   - Unpacked Quantity

6. **Expiration row** (3 equal-width fields)
   - Expiration Mode (dropdown select)
   - Expiration value (date or number input, conditional)
   - Expiration Warning Threshold

7. **Tags section** (full-width)
   - Current tag selection UI unchanged

8. **Save button** (full-width)
   - "Save Changes" button at bottom

**Row Implementation:**
- Use CSS Grid or Flexbox with `gap-4` for spacing
- Equal-width columns within each row
- Fields remain as rows on all screen sizes (no responsive breakpoints)
- Visual spacing adjustments to be done manually after implementation

## Expiration Mode Dropdown

**Replace toggle buttons with Select component:**

Current implementation uses two Button elements for mode selection. Replace with shadcn/ui Select component.

**Select Options:**
- Value: `"date"`, Label: `<Calendar /> Specific Date`
- Value: `"days"`, Label: `<Clock /> Days from Purchase`

**Icons:**
- `Calendar` from lucide-react for specific date mode
- `Clock` from lucide-react for days from purchase mode

**Behavior:**
- When mode is "date": show date input for `dueDate`
- When mode is "days": show number input for `estimatedDueDays`
- Conditional rendering logic remains the same, triggered by Select value

## Spacing and Layout

**Fixed Top Bar:**
- Height: Auto (content + padding), approximately 64px
- Padding: `p-4` to match page padding
- Border: `border-b` for visual separation

**Main Content Area:**
- Padding-top: `pt-20` or `pt-24` (80-96px) to clear fixed bar
- Side padding: `p-4` to match page padding

**Form Spacing:**
- Maintain existing `space-y-6` between sections
- Row gaps: `gap-4` for spacing between fields within rows
- Keep existing helper text and error message styling

**Scroll Behavior:**
- Top bar stays fixed at viewport top
- Form content scrolls beneath the fixed bar
- Tags section and save button scroll with content

## Future Considerations

This architecture supports planned tab navigation:
- Top bar will house tab controls for: item details (current), item history, item count, item settings
- Form content area remains scrollable below fixed tab bar
- Tab state managed at route level

## Technical Notes

**Modified Files:**
- `src/routes/items/$id.tsx` - Add fixed top bar, adjust layout
- `src/components/ItemForm.tsx` - Group fields in rows, replace expiration mode UI

**No Breaking Changes:**
- Form submission flow unchanged
- All existing validation and state management preserved
- Component props remain compatible

## Success Criteria

- [ ] Fixed top bar renders with all navigation/action buttons
- [ ] Top bar displays current item name (read-only)
- [ ] Main content has proper padding-top to avoid overlap
- [ ] All field rows render with equal-width columns
- [ ] Expiration mode dropdown works with Calendar/Clock icons
- [ ] Form validation and submission work unchanged
- [ ] Tags section and save button remain at bottom
- [ ] Layout works on mobile and desktop (rows stay as rows)
