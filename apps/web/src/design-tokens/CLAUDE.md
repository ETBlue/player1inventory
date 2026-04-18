# Design Tokens & Theme System

## Design Tokens

Token system for theme, colors, shadows, and borders:

```
src/design-tokens/
  ├── theme.css      # OKLCH semantic color variables + @theme inline Tailwind mappings
  ├── shadows.css    # Shadow scale
  ├── borders.css    # Border definitions
  ├── index.css      # Imports all
  └── index.ts       # TypeScript exports (colors, statusColors, inventoryStates, backgroundLayers)
```

**Theme system:**
- `:root` defines OKLCH values for light mode semantic colors
- `.dark` overrides for dark mode
- `@theme inline` maps CSS variables to Tailwind utilities (e.g. `bg-background-base`, `text-foreground`, `bg-status-ok`)
- Two-layer approach preserves theming flexibility
- OKLCH format (`oklch(L% C% H)`) enables perceptually uniform contrast reasoning via the L channel
- L% values are calibrated for WCAG AA compliance (minimum 4.5:1 contrast ratio for text)
- All 10 hue colors are normalized to L=65% in light mode and L=75% in dark mode for visual balance and guaranteed AA contrast
- **Removed from prior system:** amber, lime, red, yellow — use orange/green/rose as nearest equivalents

**Background layers:**
Three-level system for surface elevation hierarchy:
- `--background-base` / `bg-background-base`: Base page background
- `--background-surface` / `bg-background-surface`: Toolbars, sticky headers, popovers
- `--background-elevated` / `bg-background-elevated`: Cards, panels, list items

Light mode: L=90% → L=95% → L=98% (progressively lighter in OKLCH)
Dark mode: L=20% → L=30% → L=40% (progressively lighter in OKLCH)

**Token categories:**

### Baseline (background / foreground / accessory)
- `--background-base/surface/elevated` — three elevation layers
- `--foreground-muted/default/emphasized/colorless/colorless-inverse` — text hierarchy
- `--accessory-muted/default/emphasized` — borders and decorative elements
- `--overlay`, `--outline` — overlays and focus rings

### Importance tokens (semantic CTA colors)
Five importance levels, each with three sub-variants:
- `--importance-primary` (base fill color)
- `--importance-primary-foreground` (text on foreground surface)
- `--importance-primary-accessory` (borders, muted fills)

Levels: `primary`, `secondary`, `destructive`, `neutral`

Tailwind classes: `bg-importance-primary`, `text-importance-primary-foreground`, `border-importance-primary-accessory`, etc.

### Status tokens
Four status levels, each with six sub-variants:
- `--status-ok` (base)
- `--status-ok-muted` (progress bar fills, softened fills)
- `--status-ok-foreground` (text on surface)
- `--status-ok-accessory` (borders)
- `--status-ok-accessory-muted` (subtle borders)
- `--status-ok-inverse` (tinted background for status cards)

Levels: `ok`, `warning`, `error`, `inactive`

Tailwind classes: `bg-status-ok`, `bg-status-ok-muted`, `text-status-ok-foreground`, `bg-status-ok-inverse`, etc.

### Hue colors (tag colors)
10 hue presets, each with four sub-variants:
- `--hue-orange` → `bg-orange` (base fill — dark text readable via inverse)
- `--hue-orange-foreground` → `text-orange-foreground` (for text on neutral surface)
- `--hue-orange-accessory` → `border-orange-accessory` (muted border)
- `--hue-orange-inverse` → `bg-orange-inverse` (light tint background)

Hues: orange, brown, green, teal, cyan, blue, indigo, purple, pink, rose

Note: Tailwind utilities drop the `hue-` prefix: `bg-orange`, `text-orange-foreground`, `border-orange-accessory`, `bg-orange-inverse`.

### Inventory state mappings
Defined at the bottom of theme.css using `--color-` prefix for direct Tailwind consumption:
- `--color-inventory-low-stock` → alias for `--color-status-warning`
- `--color-inventory-expiring` → alias for `--color-status-error`
- `--color-inventory-in-stock` → alias for `--color-status-ok`
- `--color-inventory-out-of-stock` → alias for `--color-status-inactive`

## Badge & Button Variant System

**Badge variants** (`src/components/ui/badge.tsx`):
- Hue solid: `orange`, `brown`, `green`, ..., `rose` (10 total)
- Hue inverse: `orange-inverse`, ..., `rose-inverse` (light tint + colored border/text)
- Status solid: `ok`, `warning`, `error`, `inactive`
- Status inverse: `ok-inverse`, `warning-inverse`, `error-inverse`, `inactive-inverse`
- Importance solid: `primary`, `secondary`, `destructive`, `neutral`
- Importance outline: `primary-outline`, ..., `neutral-outline`

**Button variants** (`src/components/ui/button.tsx`):
Importance group: `primary`, `secondary`, `destructive`, `neutral` + `-outline`, `-ghost`, `-link` suffixes (16 variants)
Hue group: `orange`, ..., `rose` + `*-inverse` (20 variants)

**Sizes:** `xs`, `sm`, `default`, `lg`, `icon-xs`, `icon-sm`, `icon`, `icon-lg`

## Usage Examples

```tsx
// Background layers
<div className="bg-background-base">         {/* Page */}
  <div className="bg-background-surface">    {/* Toolbar/header */}
    <div className="bg-background-elevated"> {/* Card/list item */}

// Status-aware components
<Card variant="ok">        {/* bg-status-ok-inverse + green left bar */}
<Card variant="warning">   {/* bg-status-warning-inverse + orange left bar */}
<Card variant="error">     {/* bg-status-error-inverse + red left bar */}
<Card variant="inactive">  {/* bg-status-inactive-inverse + gray left bar */}

// Progress bars use -muted fills (softer than base status color)
<div className="bg-status-ok-muted" />
<div className="bg-status-warning-muted" />

// Tag badges use hue variants (inverse = light tint; solid = bold)
<Badge variant="teal-inverse">Storage</Badge>   {/* light tint bg, colored border */}
<Badge variant="orange">Category</Badge>        {/* bold orange fill */}

// Importance buttons
<Button variant="primary">Save</Button>
<Button variant="neutral-outline">Cancel</Button>
<Button variant="destructive">Delete</Button>

// TypeScript access to token values (for inline styles)
import { colors, statusColors, inventoryStates } from '@/design-tokens'
// colors.orange.default  → 'var(--color-orange)'
// colors.orange.inverse  → 'var(--color-orange-inverse)'
// statusColors.ok        → 'var(--color-status-ok)'
// inventoryStates.inStock → 'var(--color-inventory-in-stock)'
```

## Theme System

Three-state theme system (light/dark/system) with automatic OS preference detection and manual override.

**Hook:**
```tsx
import { useTheme } from '@/hooks/useTheme'

function MyComponent() {
  const { preference, theme, setPreference } = useTheme()
  // preference: 'light' | 'dark' | 'system' (user's choice)
  // theme: 'light' | 'dark' (actual applied theme)
  // setPreference: (pref) => void (updates localStorage and DOM)
}
```

**How it works:**
- Inline script in `index.html` applies theme before React loads (prevents flash)
- Theme stored in localStorage as `theme-preference`
- System preference detected via `matchMedia('(prefers-color-scheme: dark)')`
- `dark` class applied to `<html>` element when dark theme active

**Guidelines:**
- Use semantic Tailwind colors (`bg-background-base`, `text-foreground`, etc.) that adapt to theme
- Avoid hardcoded colors like `bg-white` or `bg-gray-900`
- Test components in both light and dark modes
- Use `dark:` prefix for dark-mode-specific styles only when necessary
