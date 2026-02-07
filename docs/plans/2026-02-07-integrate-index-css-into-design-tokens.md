# Integrate src/index.css into Design Tokens

**Date:** 2026-02-07

**Goal:** Consolidate all CSS design tokens in `src/design-tokens/` directory, fix broken shadcn/ui theme utilities, and establish clear organization between shadcn semantic colors and custom design tokens.

**Problem:** The current setup has broken `bg-background`, `text-foreground`, and similar utilities. These classes are applied but have no effect because the `:root` variables in `src/index.css` are not mapped to Tailwind utilities using `@theme inline`.

**Approach:** Move shadcn theme variables from `src/index.css` to `src/design-tokens/theme.css` with proper `@theme inline` mapping, and consolidate state colors into `colors.css`.

---

## Current State Analysis

**Broken utilities:**
- Components use classes like `bg-background`, `bg-card`, `text-foreground`
- These classes are applied to HTML but have no CSS rules
- Background only appears because of direct `body` CSS rule

**Why utilities don't work:**
```css
/* Current in src/index.css */
:root {
  --background: 0 0% 100%;  /* Just a CSS variable, no utilities generated */
}
```

**What's missing:**
```css
@theme inline {
  --color-background: var(--background);  /* Creates bg-background utility */
}
```

**File organization issue:**
- Shadcn theme in `src/index.css` (separate from design tokens)
- Custom tokens in `src/design-tokens/`
- No clear organization principle

## Design

### 1. File Structure

**New structure:**
```
src/design-tokens/
  ├── theme.css          # NEW: Shadcn semantic colors
  ├── colors.css         # UPDATED: Tag colors + state colors (merged)
  ├── shadows.css        # Existing: Shadow tokens
  ├── borders.css        # Existing: Border tokens
  ├── index.css          # UPDATED: Import all tokens
  └── index.ts           # Existing: TypeScript exports

src/
  └── index.css          # UPDATED: Simplified entry point
```

**Removed:**
- `src/design-tokens/states.css` - Merged into colors.css

### 2. theme.css Content

**Location:** `src/design-tokens/theme.css`

**Purpose:** Shadcn/ui semantic color system with light/dark mode support

**Structure:** Three sections
1. `:root` - Light mode HSL values
2. `.dark` - Dark mode overrides
3. `@theme inline` - Tailwind utility mappings
4. `body` - Base styling

**Full content:**
```css
/* Base theme variables (light mode) */
:root {
  --background: 0 0% 100%;
  --foreground: 0 0% 3.9%;
  --card: 0 0% 100%;
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

/* Dark mode overrides */
.dark {
  --background: 0 0% 3.9%;
  --foreground: 0 0% 98%;
  --card: 0 0% 3.9%;
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

/* Map to Tailwind utilities */
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
}

/* Apply base colors to body */
body {
  background-color: hsl(var(--background));
  color: hsl(var(--foreground));
}
```

**Key design decisions:**

1. **Two-layer approach** - `:root` for values, `@theme inline` for utilities
   - Preserves HSL theming flexibility
   - Follows shadcn/ui pattern
   - Clear separation of concerns

2. **@theme inline** - Maps CSS variables to Tailwind color utilities
   - `--background` → `--color-background` → `bg-background`, `text-background`
   - All semantic colors get proper utilities
   - Fixes broken setup

3. **Dark mode** - Standard `.dark` class override pattern
   - Consistent with theme system
   - Simple to understand and maintain

### 3. Updated colors.css

**Location:** `src/design-tokens/colors.css`

**Changes:** Merge state colors from `states.css`

**Updated content:**
```css
@theme {
  /* Tag base colors (bold backgrounds) */
  --color-tag-red: #ef4444;
  --color-tag-orange: #f97316;
  --color-tag-amber: #f59e0b;
  --color-tag-yellow: #eab308;
  --color-tag-green: #22c55e;
  --color-tag-teal: #14b8a6;
  --color-tag-blue: #3b82f6;
  --color-tag-indigo: #6366f1;
  --color-tag-purple: #a855f7;
  --color-tag-pink: #ec4899;

  /* Tag light tints (default backgrounds) */
  --color-tag-red-light: #fee2e2;
  --color-tag-orange-light: #ffedd5;
  --color-tag-amber-light: #fef3c7;
  --color-tag-yellow-light: #fef9c3;
  --color-tag-green-light: #dcfce7;
  --color-tag-teal-light: #ccfbf1;
  --color-tag-blue-light: #dbeafe;
  --color-tag-indigo-light: #e0e7ff;
  --color-tag-purple-light: #f3e8ff;
  --color-tag-pink-light: #fce7f3;

  /* Tag text colors */
  --color-tag-text-bold: #ffffff;
  --color-tag-text-default: #18181b;

  /* Global state colors */
  --color-state-normal: #a3a3a3;
  --color-state-ok: #22c55e;
  --color-state-warning: #f59e0b;
  --color-state-error: #ef4444;
  --color-state-inactive: #d4d4d4;
}

/* Inventory-specific state mappings */
:root {
  --color-inventory-low-stock: var(--color-state-warning);
  --color-inventory-expiring: var(--color-state-error);
  --color-inventory-in-stock: var(--color-state-ok);
  --color-inventory-out-of-stock: var(--color-state-inactive);
}

/* Dark mode state override */
.dark {
  --color-state-inactive: #666666;
}
```

**Rationale:**
- Consolidates all color-related tokens
- State colors are semantically about colors
- Reduces number of files
- Easier to discover and maintain

### 4. Updated design-tokens/index.css

**Location:** `src/design-tokens/index.css`

**Changes:**
- Add `@import './theme.css'` as first import
- Remove `@import './states.css'` (merged into colors)

**Updated content:**
```css
@import './theme.css';      /* Shadcn base theme - first */
@import './colors.css';     /* Custom colors + states */
@import './shadows.css';    /* Shadows */
@import './borders.css';    /* Borders */
```

**Import order rationale:**
1. Theme first - establishes base semantic colors
2. Custom tokens after - build on top of theme

### 5. Updated src/index.css

**Location:** `src/index.css`

**Changes:** Remove all theme content (moved to design-tokens/)

**New minimal content:**
```css
@import 'tailwindcss';
@import './design-tokens/index.css';
```

**What was removed:**
- All `:root` variables → `design-tokens/theme.css`
- All `.dark` variables → `design-tokens/theme.css`
- `body` styles → `design-tokens/theme.css`

**Result:** Clean entry point focused on imports only

### 6. File Deletions

**Remove:** `src/design-tokens/states.css`

**Reason:** Content merged into `colors.css`

## Implementation Steps

1. Create `src/design-tokens/theme.css` with shadcn theme + `@theme inline`
2. Update `src/design-tokens/colors.css` to include state colors
3. Update `src/design-tokens/index.css` to import theme first, remove states
4. Update `src/index.css` to minimal imports only
5. Delete `src/design-tokens/states.css`
6. Update `src/design-tokens/index.ts` TypeScript exports if needed
7. Test that `bg-background` utilities now work correctly
8. Verify light/dark mode switching
9. Update CLAUDE.md documentation

## Benefits

1. **Fixes broken utilities** - `bg-background`, `text-foreground`, etc. now generate proper CSS
2. **Single source of truth** - All design tokens in `design-tokens/` directory
3. **Clear organization** - Shadcn theme (semantic) vs. custom tokens (specific) separated
4. **Follows best practices** - Uses `@theme inline` for Tailwind v4 utility generation
5. **Maintains flexibility** - Two-layer approach (`:root` + `@theme inline`) preserves HSL theming
6. **Better discoverability** - Everything design-related in one directory
7. **Reduced files** - States merged into colors, cleaner structure
8. **Consistent patterns** - All tokens use `@theme` directive

## Documentation Updates

**CLAUDE.md changes needed:**

1. Update Design Tokens section structure:
   ```markdown
   ## Design Tokens

   Token system for theme, colors, shadows, borders, and states:

   ```
   src/design-tokens/
     ├── theme.css      # Shadcn semantic colors (background, primary, etc.)
     ├── colors.css     # Tag colors + state colors
     ├── shadows.css    # Shadow scale
     ├── borders.css    # Border definitions
     ├── index.css      # Imports all
     └── index.ts       # TypeScript exports
   ```
   ```

2. Add theme.css explanation:
   ```markdown
   **Theme system:**
   - `:root` defines HSL values for light mode
   - `.dark` overrides for dark mode
   - `@theme inline` maps to Tailwind utilities (bg-background, text-foreground, etc.)
   - Two-layer approach preserves theming flexibility
   ```

3. Update token categories to mention states in colors:
   ```markdown
   **Token categories:**
   - **Theme**: Semantic colors (background, foreground, primary, card, etc.)
   - **Tag colors**: 10 presets with light tints
   - **State colors**: Global states + inventory mappings
   - **Shadows**: sm, md, lg
   - **Borders**: default (1px), thick (2px)
   ```

## Testing Checklist

- [ ] `bg-background` utility applies background color
- [ ] `text-foreground` utility applies text color
- [ ] All shadcn theme utilities work (bg-card, bg-primary, etc.)
- [ ] Light mode displays correctly
- [ ] Dark mode displays correctly
- [ ] Theme switching works (light ↔ dark)
- [ ] Tag color utilities still work (bg-tag-red, etc.)
- [ ] State color utilities still work (bg-state-warning, etc.)
- [ ] No broken styles in components
- [ ] Build succeeds without errors
- [ ] No console errors in browser

## Migration Notes

This is a **refactoring** with no functional changes to the UI:
- Same colors
- Same theme behavior
- Same component APIs

The change is purely organizational and fixes the broken utility generation.
