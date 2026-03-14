# Background Layer System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement three-layer background system (base/surface/elevated) with semantic naming for surface elevation hierarchy.

**Architecture:** Refactor existing `theme.css` to introduce new layer variables while maintaining backward compatibility through aliases. No breaking changes to existing components.

**Tech Stack:** CSS custom properties, Tailwind CSS v4 `@theme inline`

---

## Task 1: Add New Background Layer Variables

**Files:**
- Modify: `src/design-tokens/theme.css:2-24` (light mode)
- Modify: `src/design-tokens/theme.css:26-48` (dark mode)

**Step 1: Add three-layer system to :root**

Replace the current `:root` block with:

```css
/* Base theme variables (light mode) */
:root {
  /* Background layers */
  --background-base: 0 0% 100%;        /* Base page (white) */
  --background-surface: 0 0% 95%;      /* Cards, panels (light gray) */
  --background-elevated: 0 0% 90%;     /* Toolbars, raised elements (subtle gray) */

  /* Aliases for backward compatibility */
  --background: var(--background-base);
  --card: var(--background-surface);

  /* Other semantic colors */
  --foreground: 0 0% 3.9%;
  --card-foreground: 0 0% 3.9%;
  --popover: 0 0% 100%;
  --popover-foreground: 0 0% 3.9%;
  --primary: 0 0% 9%;
  --primary-foreground: 0 0% 98%;
  --secondary: 0 0% 96.1%;
  --secondary-foreground: 0 0% 9%;
  --muted: 0 0% 96.1%;
  --muted-foreground: 0 0% 45.1%;
  --accent: 0 0% 96.1%;
  --accent-foreground: 0 0% 9%;
  --destructive: 0 84.2% 60.2%;
  --destructive-foreground: 0 0% 98%;
  --border: 0 0% 89.8%;
  --input: 0 0% 89.8%;
  --ring: 0 0% 3.9%;
  --radius: 0.5rem;
}
```

**Step 2: Add three-layer system to .dark**

Replace the current `.dark` block with:

```css
/* Dark mode overrides */
.dark {
  /* Background layers */
  --background-base: 0 0% 3.9%;        /* Base page (very dark) */
  --background-surface: 0 0% 10%;      /* Cards, panels (lighter) */
  --background-elevated: 0 0% 15%;     /* Toolbars, raised elements (subtle lighter) */

  /* Aliases for backward compatibility */
  --background: var(--background-base);
  --card: var(--background-surface);

  /* Other semantic colors */
  --foreground: 0 0% 98%;
  --card-foreground: 0 0% 98%;
  --popover: 0 0% 3.9%;
  --popover-foreground: 0 0% 98%;
  --primary: 0 0% 98%;
  --primary-foreground: 0 0% 9%;
  --secondary: 0 0% 14.9%;
  --secondary-foreground: 0 0% 98%;
  --muted: 0 0% 14.9%;
  --muted-foreground: 0 0% 63.9%;
  --accent: 0 0% 14.9%;
  --accent-foreground: 0 0% 98%;
  --destructive: 0 62.8% 30.6%;
  --destructive-foreground: 0 0% 98%;
  --border: 0 0% 14.9%;
  --input: 0 0% 14.9%;
  --ring: 0 0% 83.1%;
}
```

**Step 3: Verify dev server still runs**

Run: `pnpm dev`
Expected: Server starts without errors, page loads correctly

**Step 4: Commit the layer variables**

```bash
git add src/design-tokens/theme.css
git commit -m "refactor(tokens): add three-layer background system

- Add background-base/surface/elevated variables
- Maintain backward compatibility with aliases
- Light mode: 100% → 95% → 90%
- Dark mode: 3.9% → 10% → 15%

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 2: Update Tailwind Utility Mappings

**Files:**
- Modify: `src/design-tokens/theme.css:50-71` (@theme inline block)

**Step 1: Add new utility mappings**

Update the `@theme inline` block to include new background utilities:

```css
/* Map to Tailwind utilities */
@theme inline {
  --color-background: hsl(var(--background));
  --color-background-surface: hsl(var(--background-surface));
  --color-background-elevated: hsl(var(--background-elevated));
  --color-foreground: hsl(var(--foreground));
  --color-card: hsl(var(--card));
  --color-card-foreground: hsl(var(--card-foreground));
  --color-popover: hsl(var(--popover));
  --color-popover-foreground: hsl(var(--popover-foreground));
  --color-primary: hsl(var(--primary));
  --color-primary-foreground: hsl(var(--primary-foreground));
  --color-secondary: hsl(var(--secondary));
  --color-secondary-foreground: hsl(var(--secondary-foreground));
  --color-muted: hsl(var(--muted));
  --color-muted-foreground: hsl(var(--muted-foreground));
  --color-accent: hsl(var(--accent));
  --color-accent-foreground: hsl(var(--accent-foreground));
  --color-destructive: hsl(var(--destructive));
  --color-destructive-foreground: hsl(var(--destructive-foreground));
  --color-border: hsl(var(--border));
  --color-input: hsl(var(--input));
  --color-ring: hsl(var(--ring));
}
```

**Step 2: Verify Tailwind classes are available**

Create a temporary test component or check browser devtools:
- `bg-background` should work (aliased to base)
- `bg-background-surface` should work (new)
- `bg-background-elevated` should work (new)
- `bg-card` should work (aliased to surface)

Expected: All classes generate correct CSS

**Step 3: Commit the utility mappings**

```bash
git add src/design-tokens/theme.css
git commit -m "refactor(tokens): add Tailwind utilities for background layers

- Add bg-background-surface utility
- Add bg-background-elevated utility
- Maintain bg-background and bg-card aliases

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 3: Export TypeScript Constants

**Files:**
- Modify: `src/design-tokens/index.ts`

**Step 1: Add background layer exports**

Add new constants to the exports (append to existing file):

```typescript
// Background layers (CSS variable names for programmatic use)
export const backgroundLayers = {
  base: 'var(--background-base)',
  surface: 'var(--background-surface)',
  elevated: 'var(--background-elevated)',
} as const

// Aliases for backward compatibility
export const backgroundAliases = {
  background: 'var(--background)',
  card: 'var(--card)',
} as const
```

**Step 2: Verify TypeScript builds**

Run: `pnpm build`
Expected: Build completes without TypeScript errors

**Step 3: Commit the TypeScript exports**

```bash
git add src/design-tokens/index.ts
git commit -m "refactor(tokens): export background layer constants

- Add backgroundLayers object with base/surface/elevated
- Add backgroundAliases for backward compatibility

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 4: Update Documentation

**Files:**
- Modify: `CLAUDE.md` (Design Tokens section)

**Step 1: Update CLAUDE.md Design Tokens section**

Replace the "Design Tokens" section in CLAUDE.md with updated content:

```markdown
## Design Tokens

Token system for theme, colors, shadows, and borders:

```
src/design-tokens/
  ├── theme.css      # Shadcn semantic colors (background, primary, etc.)
  ├── colors.css     # Tag colors + state colors
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
  <Card className="bg-background-surface"> {/* Or bg-card */}
    <CardHeader className="bg-background-elevated">
      Toolbar
    </CardHeader>
  </Card>
</div>

// Tag colors (from colors.css)
import { tagColors, tagTextColors } from '@/design-tokens'

<Badge style={{
  backgroundColor: tagColors.red.default,
  color: tagTextColors.default
}}>
  Tag
</Badge>
```

**Token categories:**
- **Theme**: Semantic colors (background, foreground, primary, card, destructive, etc.)
- **Background layers**: base (page) / surface (cards) / elevated (toolbars)
- **Tag colors**: 10 presets (red, orange, amber, yellow, green, teal, blue, indigo, purple, pink)
- **Tag variants**: default (light tint) / inverse (bold)
- **State colors**: Global states + inventory mappings (low-stock, expiring, in-stock, out-of-stock)
- **Shadows**: sm, md, lg
- **Borders**: default (1px), thick (2px)
```

**Step 2: Verify documentation renders correctly**

Open CLAUDE.md and check that markdown renders correctly

Expected: No broken formatting, code blocks display properly

**Step 3: Commit documentation update**

```bash
git add CLAUDE.md
git commit -m "docs(tokens): update background layer documentation

- Add three-layer background system documentation
- Include usage examples and hierarchy
- Document light/dark mode progression

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 5: Visual Verification

**Files:**
- N/A (manual testing)

**Step 1: Start dev server and test both themes**

Run: `pnpm dev`

**Step 2: Verify light mode layers**

In browser:
1. Open DevTools → Elements
2. Find elements with `bg-background`, `bg-card`, `bg-background-surface`
3. Check computed styles show correct HSL values:
   - `bg-background`: `hsl(0 0% 100%)` (white)
   - `bg-background-surface` or `bg-card`: `hsl(0 0% 95%)` (light gray)
4. Visually confirm subtle elevation differences

Expected: Layers show progressive darkening in light mode

**Step 3: Verify dark mode layers**

In browser:
1. Toggle to dark mode using theme switcher
2. Check computed styles:
   - `bg-background`: `hsl(0 0% 3.9%)` (very dark)
   - `bg-background-surface` or `bg-card`: `hsl(0 0% 10%)` (lighter)
3. Visually confirm subtle elevation differences

Expected: Layers show progressive lightening in dark mode

**Step 4: Test new utility classes**

In browser DevTools console, test that new utilities work:
```javascript
// Should apply correctly without errors
document.body.className = 'bg-background-elevated'
document.body.className = 'bg-background-surface'
document.body.className = 'bg-background' // back to normal
```

Expected: Classes apply without console errors, visual changes visible

**Step 5: Document verification results**

No commit needed - this is manual verification step

---

## Completion Checklist

- [ ] Three-layer variables added to :root and .dark
- [ ] Backward compatibility aliases working (--background, --card)
- [ ] Tailwind utilities mapped and available
- [ ] TypeScript exports added
- [ ] CLAUDE.md documentation updated
- [ ] Visual verification in both light and dark modes
- [ ] Dev server runs without errors
- [ ] Build completes without errors

## Notes

- All changes are backward compatible - existing code continues working
- New utilities (`bg-background-surface`, `bg-background-elevated`) available for new components
- Optional migration of existing components can happen incrementally
- Design allows iteration on lightness values if needed
