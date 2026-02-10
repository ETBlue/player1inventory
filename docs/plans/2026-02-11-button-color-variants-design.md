# Button Color Variants Design

**Date:** 2026-02-11
**Status:** Design Complete

## Overview

Extend the Button component with color variants matching Badge's color palette, enabling tag type filter triggers to display with appropriate colors without replacing Button with Badge.

## Requirements

- Add color variants to Button component to support tag type colors
- Maintain all existing Button functionality (interaction states, accessibility)
- Use Button's existing shadow system for consistency
- Enable TagTypeDropdown to show tag type colors when filters are selected

## Design Decisions

### Visual States

**Unselected state:** `neutral-outline` variant
- Gray border with gray text
- No background fill
- Indicates no active filter for this tag type

**Selected state:** Tag type color variant (e.g., `teal-tint`, `blue-tint`)
- Light colored background with colored border
- Dark text for readability
- Indicates active filter with matching tag type color

**Interaction:** Button-like with hover/focus states
- Maintain shadow effects (`shadow-sm hover:shadow-md`)
- Standard button hover opacity changes
- Full accessibility support (focus rings, keyboard navigation)

**Dropdown indicator:** Keep ChevronDown icon
- Makes it clear the element is interactive and opens a dropdown

## Component Architecture

### Button Component Changes

**File:** `src/components/ui/button.tsx`

Add 20 new variants to `buttonVariants` cva definition:

**Solid variants (10):**
- `red`, `orange`, `amber`, `yellow`, `green`, `teal`, `blue`, `indigo`, `purple`, `pink`
- Style pattern: `border-transparent bg-{color} text-tint shadow-sm hover:shadow-md`

**Tint variants (10):**
- `red-tint`, `orange-tint`, `amber-tint`, `yellow-tint`, `green-tint`, `teal-tint`, `blue-tint`, `indigo-tint`, `purple-tint`, `pink-tint`
- Style pattern: `bg-{color}-tint border-{color} text-dark shadow-sm hover:shadow-md`

### TagTypeDropdown Usage

**File:** `src/components/TagTypeDropdown.tsx`

**Current implementation (line 36):**
```tsx
<Button variant={hasSelection ? 'neutral' : 'neutral-outline'}>
  {tagType.name}
  <ChevronDown />
</Button>
```

**New implementation:**
```tsx
<Button variant={hasSelection ? tagType.color : 'neutral-outline'}>
  {tagType.name}
  <ChevronDown />
</Button>
```

**Behavior:**
- When no tags selected: Shows `neutral-outline`
- When tags selected: Shows color from `tagType.color` property (e.g., `'teal-tint'`)

### Type Safety

**Current state:**
- `TagColor` enum in `src/types/index.ts` already contains all 20 color variants
- `TagType.color` is typed as `TagColor`
- Enum values match the Button variants we're adding

**Type safety guarantee:**
- `TagColor` enum values are compatible with Button variant union type
- TypeScript ensures `tagType.color` contains only valid variant names
- No type definition changes needed

## Implementation Steps

1. **Extend Button component**
   - Add 20 new color variants to `src/components/ui/button.tsx`
   - Follow existing pattern with shadows and opacity

2. **Update TagTypeDropdown**
   - Modify line 36 in `src/components/TagTypeDropdown.tsx`
   - Change variant logic to use `tagType.color` when selected

3. **Add Storybook story**
   - Add `ColorVariants` story to `src/components/ui/button.stories.tsx`
   - Display all 10 solid variants
   - Display all 10 tint variants

4. **Update documentation**
   - Update `CLAUDE.md` to document Button color variants
   - Note usage in tag type filter triggers

5. **Testing**
   - Verify all color variants render correctly in light/dark modes
   - Test interaction states (hover, focus, active, disabled)
   - Verify tag type filters show correct colors when selected
   - Confirm unselected state shows neutral-outline

## Edge Cases

- Invalid `tagType.color` values caught at compile time by TypeScript
- All existing Button usages unaffected (use semantic variants)
- No database changes needed (TagColor enum already has all values)

## Files to Modify

1. `src/components/ui/button.tsx` - Add color variants
2. `src/components/TagTypeDropdown.tsx` - Update variant logic
3. `src/components/ui/button.stories.tsx` - Add ColorVariants story
4. `CLAUDE.md` - Document new Button capabilities

## Benefits

- Maintains Button's robust interaction and accessibility features
- Consistent shadow and hover behavior across all variants
- Type-safe color selection
- Minimal changes to existing code
- No need to make Badge interactive
