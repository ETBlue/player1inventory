# Design Tokens & Theme System

## Design Tokens

Token system for theme, colors, shadows, and borders:

```
src/design-tokens/
  ├── theme.css      # Shadcn semantic colors (background, primary, etc.)
  ├── shadows.css    # Shadow scale
  ├── borders.css    # Border definitions
  ├── index.css      # Imports all
  └── index.ts       # TypeScript exports
```

**Theme system:**
- `:root` defines OKLCH values for light mode semantic colors
- `.dark` overrides for dark mode
- `@theme inline` maps CSS variables to Tailwind utilities (bg-background, text-foreground, etc.)
- Two-layer approach preserves theming flexibility
- OKLCH format (`oklch(L% C% H)`) enables perceptually uniform contrast reasoning via the L channel
- L% values are calibrated for WCAG AA compliance (minimum 4.5:1 contrast ratio for text)
- All 12 hue colors are normalized to L=55% in light mode and L=75% in dark mode for visual balance and guaranteed AA contrast

**Background layers:**
Three-level system for surface elevation hierarchy:
- `--background-base` / `bg-background`: Base page background
- `--background-surface` / `bg-background-surface` / `bg-card`: Cards, panels, list items
- `--background-elevated` / `bg-background-elevated`: Toolbars, headers, elevated elements

Light mode: L≈89% → L≈95% → L≈99% (progressively lighter in OKLCH)
Dark mode: L≈22% → L≈33% → L≈42% (progressively lighter in OKLCH)

**Usage:**
```tsx
// Theme colors (from theme.css)
<div className="bg-background text-foreground">
<Button className="bg-primary text-primary-foreground">

// Background layers
<div className="bg-background"> {/* Page base */}
  <Card> {/* Uses bg-card internally (alias for surface layer) */}
    <CardHeader className="bg-background-elevated">
      Toolbar
    </CardHeader>
  </Card>
</div>

// Tag colors (from theme.css)
import { colors } from '@/design-tokens'

<Badge style={{
  backgroundColor: colors.orange.tint,
}}>
  Tag (light tint)
</Badge>

<Badge style={{
  backgroundColor: colors.orange.default,
}}>
  Tag (bold)
</Badge>
```

**Button color variants:**

The Button component supports 24 color variants matching the Badge color palette:
- Solid variants (12): orange, brown, amber, lime, green, teal, cyan, blue, indigo, purple, pink, rose
- Tint variants (12): orange-tint, brown-tint, amber-tint, lime-tint, green-tint, teal-tint, cyan-tint, blue-tint, indigo-tint, purple-tint, pink-tint, rose-tint

Usage:
```tsx
<Button variant="teal-tint">Teal Button</Button>
<Button variant="orange">Orange Button</Button>
```

These variants are used in tag type filter triggers (`TagTypeDropdown`) to display tag type colors when filters are selected.

**Token categories:**
- **Theme**: Semantic colors (background, foreground, primary, card, destructive, etc.) - defined in theme.css
- **Background layers**: base (page, 100% light / 3.9% dark) / surface (cards, 95% light / 10% dark) / elevated (toolbars, 90% light / 15% dark) - defined in theme.css
- **Status colors**: ok, warning, error, inactive (with tint variants, each color-specific e.g. `text-status-error-tint`) - defined in theme.css
- **Colors**: 12 presets (orange, brown, amber, lime, green, teal, cyan, blue, indigo, purple, pink, rose) - defined in theme.css
- **Color variants**: tint (light background) / default (bold, high contrast)
- **Inventory states**: lowStock, expiring, inStock, outOfStock - defined in theme.css
- **Shadows**: sm, md, lg - defined in shadows.css
- **Borders**: default (1px), thick (2px) - defined in borders.css

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
- Existing `:root` and `.dark` CSS variables in `src/index.css` handle colors

**Component variants:**
```tsx
// Card component supports status-aware variants with left indicator bar
<Card variant="default">   // elevated background, no status indicator
<Card variant="ok">        // green tint background with green left bar
<Card variant="warning">   // orange tint background with orange left bar
<Card variant="error">     // red tint background with red left bar
<Card variant="inactive">  // gray tint background with gray left bar
```

**Guidelines:**
- Use semantic Tailwind colors (`bg-card`, `text-foreground`, etc.) that adapt to theme
- Avoid hardcoded colors like `bg-white` or `bg-gray-900`
- Test components in both light and dark modes
- Use `dark:` prefix for dark-mode-specific styles when needed
