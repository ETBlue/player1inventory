# Design Tokens Design

**Goal:** Introduce hierarchical design token system for better organization and type-safe tag colors.

**Status:** Designed

---

## Why Design Tokens

**Problems solved:**
1. Better organization - Current CSS variables are flat
2. Type-safe tag colors - Tag system needs predefined palette accessible in JS
3. Consistent states - Global semantic states for inventory/cart features
4. Dark/light theme improvements - Better structured theme tokens

---

## Approach

**Tailwind v4 `@theme` + TypeScript constants**

- Leverage existing Tailwind v4 CSS-first approach
- Use `@theme` directive for token definitions
- TypeScript constants reference CSS variables for type safety
- No build step, works with hot reload

**Not using:**
- Style Dictionary (overkill for single platform)
- vanilla-extract (too different from current setup)
- Custom build script (unnecessary complexity)

---

## Token Organization

**Hierarchy:**
```
Primitives → Semantic → Component-specific + App-specific
```

**File structure:**
```
src/design-tokens/
  ├── colors.css          # Color primitives, semantic, tags
  ├── shadows.css         # Shadow tokens
  ├── borders.css         # Border tokens
  ├── states.css          # Global + inventory state tokens
  ├── index.css           # Imports all token files
  └── index.ts            # TypeScript exports
```

**Import chain:**
```css
/* src/design-tokens/index.css */
@import './colors.css';
@import './shadows.css';
@import './borders.css';
@import './states.css';

/* src/index.css */
@import './design-tokens/index.css';
/* ... existing styles */
```

---

## Token Categories

### Colors (colors.css)

**Structure:**
1. Primitives - Base palette (grays, tag colors)
2. Semantic - Theme tokens (primary, secondary, etc.)
3. Tag variants - Default (tint) + Inverse (bold)

**Tag colors (8-12 preset):**
- Red, Orange, Amber, Yellow
- Green, Teal, Blue, Indigo
- Purple, Pink

**Each tag color has:**
- Base color (bold background)
- Light tint (default background)
- Text colors: dark for tints, white for bold

**Example:**
```css
@theme {
  /* Tag base colors */
  --color-tag-red: #ef4444;
  --color-tag-red-light: #fee2e2;

  /* Text colors */
  --color-tag-text-bold: #ffffff;
  --color-tag-text-default: #18181b;
}
```

**TypeScript:**
```ts
export const tagColors = {
  red: {
    default: 'var(--color-tag-red-light)',
    inverse: 'var(--color-tag-red)',
  },
  // ...
} as const

export const tagTextColors = {
  default: 'var(--color-tag-text-default)',
  inverse: 'var(--color-tag-text-bold)',
} as const
```

### Shadows (shadows.css)

**Minimal approach - 3 values:**
```css
@theme {
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1);
}
```

### Borders (borders.css)

**Minimal approach - 2 widths:**
```css
@theme {
  --border-width-default: 1px;
  --border-width-thick: 2px;

  --border-default: var(--border-width-default) solid var(--color-border);
  --border-thick: var(--border-width-thick) solid var(--color-border);
}
```

**Border styles:** Use Tailwind utilities (`border-dashed`, `border-dotted`)

### States (states.css)

**Global semantic states (primitives):**
```css
@theme {
  --color-state-normal: var(--color-gray-500);
  --color-state-ok: #22c55e;
  --color-state-warning: #f59e0b;
  --color-state-error: #ef4444;
  --color-state-inactive: var(--color-gray-400);
}
```

**Inventory states (semantic, reference global):**
```css
@theme {
  --color-inventory-low-stock: var(--color-state-warning);
  --color-inventory-expiring: var(--color-state-error);
  --color-inventory-in-stock: var(--color-state-ok);
  --color-inventory-out-of-stock: var(--color-state-inactive);
}
```

**TypeScript:**
```ts
export const globalStates = {
  normal: 'var(--color-state-normal)',
  ok: 'var(--color-state-ok)',
  warning: 'var(--color-state-warning)',
  error: 'var(--color-state-error)',
  inactive: 'var(--color-state-inactive)',
} as const

export const inventoryStates = {
  lowStock: 'var(--color-inventory-low-stock)',
  expiring: 'var(--color-inventory-expiring)',
  inStock: 'var(--color-inventory-in-stock)',
  outOfStock: 'var(--color-inventory-out-of-stock)',
} as const
```

---

## Usage Examples

**Tag with preset color:**
```tsx
import { tagColors, tagTextColors } from '@/design-tokens'

<Badge
  style={{
    backgroundColor: tagColors.red.default,
    color: tagTextColors.default
  }}
>
  Dairy
</Badge>
```

**Inventory state indicator:**
```tsx
import { inventoryStates } from '@/design-tokens'

<span style={{ color: inventoryStates.lowStock }}>
  Low stock
</span>
```

**Shadow and border:**
```tsx
import { shadows } from '@/design-tokens'

<Card style={{ boxShadow: shadows.md }}>
  {/* content */}
</Card>
```

---

## Benefits

1. **Type safety** - Autocomplete for tag colors, states
2. **Better organization** - Hierarchical structure (primitives → semantic)
3. **Consistency** - Global states referenced by domain features
4. **No build step** - Works with Tailwind v4 hot reload
5. **Accessibility** - Proper contrast with default/inverse variants
6. **Maintainable** - Clear file separation by category

---

## Migration Strategy

1. Create `src/design-tokens/` folder structure
2. Define tokens in CSS files
3. Create TypeScript exports
4. Update existing components to use tokens
5. Remove inline hex colors from tag system
6. Document token usage in Storybook
