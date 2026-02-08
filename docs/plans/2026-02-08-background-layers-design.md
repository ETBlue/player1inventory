# Background Layer System Design

**Date:** 2026-02-08
**Status:** Approved

## Overview

Create a three-layer background system with semantic naming for surface elevation hierarchy within the same z-level (cards, toolbars, tables, etc.).

## Use Case

Surface elevation for visual hierarchy - different elevation levels for UI elements like cards on a page, toolbars, tables that need subtle visual separation without relying on z-index stacking.

## Variable Structure

### Three-Layer System

```css
:root {
  --background-base: 0 0% 100%;      /* Base page (white) */
  --background-surface: 0 0% 95%;    /* Cards, panels (light gray) */
  --background-elevated: 0 0% 90%;   /* Toolbars, raised elements (subtle gray) */
}

.dark {
  --background-base: 0 0% 3.9%;      /* Base page (very dark) */
  --background-surface: 0 0% 10%;    /* Cards, panels (lighter) */
  --background-elevated: 0 0% 15%;   /* Toolbars, raised elements (subtle lighter) */
}
```

### Semantic Aliases

- `--background` → points to `--background-base` (backward compatibility)
- `--card` → points to `--background-surface` (cards are surfaces)

### Migration from Current State

- Current `--background` (100% / 3.9%) → becomes `--background-base`
- Current `--background-elevated` (95% / 10%) → becomes `--background-surface`
- New `--background-elevated` (90% / 15%) → added as highest elevation
- Current `--card` → becomes alias for `--background-surface`

**Key change:** "elevated" becomes the truly most elevated level (not middle layer).

## Tailwind Integration

### Utility Mappings

Update `@theme inline` block in `theme.css`:

```css
@theme inline {
  --color-background: hsl(var(--background-base));
  --color-background-surface: hsl(var(--background-surface));
  --color-background-elevated: hsl(var(--background-elevated));
  --color-card: hsl(var(--background-surface));
  /* ... other existing mappings ... */
}
```

### Available Tailwind Classes

- `bg-background` → base page background
- `bg-background-surface` → cards, panels
- `bg-background-elevated` → toolbars, raised elements
- `bg-card` → same as `bg-background-surface` (alias)

### Migration Strategy

1. Add new variables to `theme.css`
2. Update `@theme inline` mappings
3. Existing `bg-background` and `bg-card` usage continues working (backward compatible)
4. Start using `bg-background-surface` and `bg-background-elevated` in new components
5. Optionally migrate old components over time

**No breaking changes** - all existing classes continue working with clearer semantic meaning.

## Usage Patterns

### When to Use Each Level

**`--background-base` / `bg-background`**
- Page/app background
- Main content area base
- Default body background
- Already applied to `<body>` element

**`--background-surface` / `bg-background-surface` / `bg-card`**
- Card components
- Panel containers
- List items
- Table rows
- Form sections
- Any content that needs subtle lift from the base

**`--background-elevated` / `bg-background-elevated`**
- Sticky headers/toolbars
- Navigation bars
- Floating action buttons
- Elevated cards (card on card)
- Table headers
- Modal/dialog headers
- Any element that should appear "above" regular surfaces

### Visual Hierarchy Example

```
Page (base)
  └─ Card (surface)
       └─ Card header/toolbar (elevated)
```

### Color Progression

**Light mode:** Progressively darker (100% → 95% → 90%)
**Dark mode:** Progressively lighter (3.9% → 10% → 15%)

This creates consistent depth perception across both themes using subtle steps that can be adjusted if needed.

## Implementation Notes

- Start with subtle lightness differences, iterate if needed
- Maintain backward compatibility with existing `--background` and `--card` variables
- All changes confined to `src/design-tokens/theme.css`
- Update CLAUDE.md documentation after implementation
