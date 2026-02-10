# Color Showcase Storybook Page Design

**Date:** 2026-02-08
**Status:** Approved

## Overview

Create a comprehensive Storybook page that serves as both a developer reference and design documentation for all color-related design tokens in the system.

## Purpose

- **Developer Reference**: Show all available colors with CSS variable names and computed values for easy copy/paste
- **Design Documentation**: Provide visual style guide with usage patterns and guidance for when to use each color

## Page Structure

**Storybook Page:** "Design Tokens / Colors"

Single documentation page organized into four main sections:

1. **Tag Colors** - 10 colors, each showing default + inverse variants stacked
2. **Background Layers** - 3 layers with light/dark comparison
3. **State Colors** - 5 global states + 4 inventory states
4. **Theme Colors** - Semantic colors (primary, secondary, accent, destructive, muted, border, etc.)

## Visual Layout

### Tag Colors Section

Each card displays both variants stacked horizontally:
- **Left swatch**: Light tint (default variant) with dark text
- **Right swatch**: Bold color (inverse variant) with white text
- **Name** (e.g., "Red")
- **CSS Variables** (both `--color-tag-red-light` and `--color-tag-red`)
- **Computed Values** (hex values for both)
- **Usage guidance** (when to use default vs inverse)

**Grid:** 2-column layout

### Other Color Sections

Standard cards showing:
- **Color swatch** (large color box, minimum 80px height)
- **Name** (e.g., "Background Surface")
- **CSS Variable** (e.g., `--background-surface`)
- **Computed Value** (e.g., `hsl(0 0% 95%)`)
- **Usage guidance** (1-2 sentences)

**For theme-adaptive colors** (backgrounds, theme colors):
- Show two swatches side-by-side labeled "Light" and "Dark"
- Display both computed values

**For static colors** (tag colors, most state colors):
- Show single swatch
- Note that color is same in both themes

**Grid:** 3-column layout for better scanning

## Component Architecture

### File Location

`src/stories/Colors.stories.tsx` (using TSX for type safety and programmatic rendering)

### Component Structure

```tsx
// Main story component
export const AllColors = () => (
  <div className="space-y-12 p-8">
    <TagColorsSection />
    <BackgroundLayersSection />
    <StateColorsSection />
    <ThemeColorsSection />
  </div>
)
```

### Reusable Components

**1. ColorSection**
- Wrapper for each category
- Props: `title`, `description`, `children`
- Renders section heading and description

**2. TagColorCard**
- Specialized for tag colors with stacked variants
- Props: `name`, `defaultColor`, `inverseColor`, `usage`
- Renders two color swatches side-by-side
- Shows CSS variable names and computed values

**3. ThemeColorCard**
- For colors that change between themes
- Props: `name`, `cssVar`, `lightValue`, `darkValue`, `usage`
- Renders side-by-side light/dark swatches

**4. SimpleColorCard**
- For colors that don't change
- Props: `name`, `cssVar`, `value`, `usage`
- Renders single swatch

### Data Source

Import directly from `@/design-tokens` and use existing TypeScript exports:
- `tagColors`
- `backgroundLayers`
- `globalStates`
- `inventoryStates`
- Theme colors from theme.css

## Section Content

### 1. Tag Colors Section

**Title:** "Tag Colors"

**Description:** "10-color palette for categorizing items. Each color has a light tint (default) for subtle backgrounds and a bold variant (inverse) for emphasis."

**Colors:** Red, Orange, Amber, Yellow, Green, Teal, Blue, Indigo, Purple, Pink

**Usage Guidance:** "Use default for tag backgrounds with dark text. Use inverse for high-contrast emphasis with white text."

**CSS Variables:**
- Default: `--color-tag-{color}-light`
- Inverse: `--color-tag-{color}`

### 2. Background Layers Section

**Title:** "Background Layers"

**Description:** "Three-level elevation system for creating visual hierarchy and depth."

**Layers:**
- **Base** (`--background-base`): "Main page background. Applied to `<body>` by default."
- **Surface** (`--background-surface`): "Cards, panels, list items. One level above base."
- **Elevated** (`--background-elevated`): "Toolbars, headers, floating elements. Highest elevation."

**Light/Dark Values:**
- Light mode: 100% → 95% → 90% (progressively darker)
- Dark mode: 3.9% → 10% → 15% (progressively lighter)

Show side-by-side light/dark swatches for each layer.

### 3. State Colors Section

**Title:** "State Colors"

**Description:** "Colors for indicating status and user feedback."

**Global States:**
- **Normal** (`--color-state-normal`): "Default neutral state"
- **OK** (`--color-state-ok`): "Success, positive feedback"
- **Warning** (`--color-state-warning`): "Caution, needs attention"
- **Error** (`--color-state-error`): "Critical issues, errors"
- **Inactive** (`--color-state-inactive`): "Disabled or inactive elements"

**Inventory States:**
- **Low Stock** (`--color-inventory-low-stock`): "Item quantity below threshold"
- **Expiring** (`--color-inventory-expiring`): "Item approaching expiration"
- **In Stock** (`--color-inventory-in-stock`): "Item available and sufficient"
- **Out of Stock** (`--color-inventory-out-of-stock`): "Item depleted"

Note: Inventory states map to global states (Warning, Error, OK, Inactive respectively).

### 4. Theme Colors Section

**Title:** "Theme Semantic Colors"

**Description:** "Core theme colors that adapt to light/dark mode."

**Colors:**
- **Primary**: "Main brand color for primary actions"
- **Secondary**: "Secondary actions and accents"
- **Accent**: "Highlighted elements"
- **Destructive**: "Destructive actions (delete, remove)"
- **Muted**: "Subdued backgrounds"
- **Border**: "Default border color"
- **Input**: "Input field borders"
- **Ring**: "Focus ring color"
- **Foreground**: "Primary text color"
- **Background**: "Base background (alias)"
- **Card**: "Card background (alias)"

Show light/dark values side-by-side for each.

## Technical Implementation

### Computing Color Values

Use `getComputedStyle()` to retrieve actual hex/RGB values from CSS variables:

```tsx
const getColorValue = (cssVar: string) => {
  const element = document.createElement('div')
  element.style.color = cssVar
  document.body.appendChild(element)
  const computed = getComputedStyle(element).color
  document.body.removeChild(element)
  return computed // Returns rgb() or hsl()
}
```

### Light/Dark Mode Values

For theme colors and background layers:
1. Create temporary element with `className="dark"` to get dark mode values
2. Get light mode values from default context
3. Display both in the card

### Grid Layout

```tsx
// Tag colors: 2-column grid (each card shows 2 swatches)
<div className="grid grid-cols-2 gap-4">

// Other sections: 3-column grid for better scanning
<div className="grid grid-cols-3 gap-4">
```

### Color Swatch Styling

- **Minimum height**: 80px for visibility
- **Border**: Add border for light colors to show against white backgrounds
- **Text overlay**: Show hex/RGB value directly on swatch
- **Rounded corners**: Use standard border-radius for polish
- **Accessible contrast**: Ensure text on swatches meets WCAG AA standards

### Storybook Configuration

```tsx
const meta: Meta = {
  title: 'Design Tokens/Colors',
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
}
```

## Implementation Notes

- Use programmatic rendering to avoid duplication
- Extract color metadata into constants for maintainability
- Ensure all computed values update when CSS changes
- Add type safety for color names using existing TypeScript types
- Follow existing Storybook story patterns in the project
- Ensure page works in both light and dark mode contexts
