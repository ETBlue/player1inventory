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
- `:root` defines HSL values for light mode semantic colors
- `.dark` overrides for dark mode
- `@theme inline` maps CSS variables to Tailwind utilities (bg-background, text-foreground, etc.)
- Two-layer approach preserves theming flexibility

**Background layers:**
Three-level system for surface elevation hierarchy:
- `--background-base` / `bg-background`: Base page background
- `--background-surface` / `bg-background-surface` / `bg-card`: Cards, panels, list items
- `--background-elevated` / `bg-background-elevated`: Toolbars, headers, elevated elements

Light mode: 100% → 95% → 90% (progressively darker)
Dark mode: 3.9% → 10% → 15% (progressively lighter)

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
import { colors, colorUtils } from '@/design-tokens'

<Badge style={{
  backgroundColor: colors.red.tint,
  color: colorUtils.dark
}}>
  Tag (light tint)
</Badge>

<Badge style={{
  backgroundColor: colors.red.default,
  color: colorUtils.tint
}}>
  Tag (bold)
</Badge>
```

**Button color variants:**

The Button component supports 20 color variants matching the Badge color palette:
- Solid variants (14): red, orange, amber, yellow, green, teal, blue, indigo, purple, pink, brown, lime, cyan, rose
- Tint variants (14): red-tint, orange-tint, amber-tint, yellow-tint, green-tint, teal-tint, blue-tint, indigo-tint, purple-tint, pink-tint, brown-tint, lime-tint, cyan-tint, rose-tint

Usage:
```tsx
<Button variant="teal-tint">Teal Button</Button>
<Button variant="red">Red Button</Button>
```

These variants are used in tag type filter triggers (`TagTypeDropdown`) to display tag type colors when filters are selected.

**Token categories:**
- **Theme**: Semantic colors (background, foreground, primary, card, destructive, etc.) - defined in theme.css
- **Background layers**: base (page, 100% light / 3.9% dark) / surface (cards, 95% light / 10% dark) / elevated (toolbars, 90% light / 15% dark) - defined in theme.css
- **Status colors**: ok, warning, error, inactive (with tint variants) - defined in theme.css
- **Colors**: 14 presets (red, orange, amber, yellow, green, teal, blue, indigo, purple, pink, brown, lime, cyan, rose) - defined in theme.css
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
