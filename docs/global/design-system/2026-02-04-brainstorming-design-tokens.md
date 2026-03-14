# Brainstorming Log: Design Tokens

**Date:** 2026-02-04

**Goal:** Introduce hierarchical design token system for better organization and type-safe tag colors.

---

## Context

**Current setup:**
- Tailwind CSS v4 (CSS-first, no config file)
- shadcn/ui with CSS variables for theming
- Existing tokens: colors only (`:root` and `.dark` selectors)
- Tag colors: inline hex values in components

---

## Q&A

**Q1: What problem are you trying to solve with design tokens?**
- Options: Expand beyond colors / Better organization / Multi-brand / Design tool sync / Other
- Answer: **Better organization**
- Rationale: Current CSS variables are flat, want hierarchical structure

**Q2: What aspects need better organization?**
- Options: Just colors / Add spacing/sizing / Add typography / Comprehensive / Custom needs
- Answer: **Colors, shadows, borders, specific tokens** (tag colors, inventory states)
- Rationale: Focused set relevant to current app needs, not overengineering

**Q3: How should token hierarchy be organized?**
- Options: Primitive → Semantic / Component-scoped / Layer-based / Hybrid
- Answer: **Hybrid** (Primitives + semantic + component-specific)
- Rationale: Flexible, supports both base system and domain-specific needs

**Q4: For app-specific tokens (tags, inventory), how should they be defined?**
- Options: Predefined palette / User-customizable / Semantic states / Mix
- Answer: **Mix** (Predefined palette for tags + semantic states for inventory)
- Rationale: Tags need visual variety (preset colors), inventory needs consistent meaning (semantic states)

**Q5: For shadows and borders, what level of control?**
- Options: Simple scale / Component-specific / Elevation system / Minimal
- Answer: **Minimal** (2-3 commonly used values)
- Rationale: Keep simple, avoid over-engineering

**Q6: Where should design tokens be defined?**
- Options: Keep in index.css / Split by category / Single tokens file / TypeScript + CSS
- Answer: Initially interested in **TypeScript + CSS**
- Follow-up: User clarified they're introducing dark/light theme

**TypeScript token exploration:**
- Explained TS tokens approach: define in TS, generate CSS
- Benefits: Type safety, JS access, single source of truth
- Drawbacks: Build complexity, hot-reload issues
- When useful: Need tokens in JS (tag colors!), want type safety

**Q7: Is TypeScript helpful for dark/light theme?**
- Answer: **Not for theme itself** (CSS handles with `:root`/`.dark`)
- **BUT helpful for tag colors** (need JS access for color picker)
- Conclusion: User wants both - reorganize theme + add tag palette

**Q8: Should we use TypeScript tokens or hybrid?**
- Options: TS tokens (generate CSS) / Hybrid (CSS + TS constant) / CSS + TS types
- Answer: **TypeScript tokens** (Option A)
- Rationale: Type-safe, consistent system, tag colors accessible in JS

**Q9: How should tokens be generated/consumed?**
- Explained existing tools: Style Dictionary, Tailwind theme, vanilla-extract, Panda CSS, custom script
- Recommendation: **Tailwind v4 `@theme` + TypeScript constants**
- Answer: **User chose option 2** (Tailwind @theme + TS)
- Rationale: Leverages existing setup, no build step, works with hot reload

**Q10: Should we split CSS files by category?**
- Original: Single `tokens.css`
- Answer: **Yes, split by category**
- Structure: `colors.css`, `shadows.css`, `borders.css`, `states.css`

**Q11: Where does border style go?**
- Context: New tag badge needs dashed/dotted border
- Options: In borders.css / Separate properties / Component-specific / Tailwind utility
- Answer: **Use Tailwind utility** (`border-dashed`)
- Rationale: Border styles rarely need dynamic changes, utilities are cleaner

**Q12: Tag color variants?**
- Context: Need default and inverse versions for all tag colors
- Options: Tint vs. Bold / Background vs. Foreground / Theme-aware
- Answer: **Tint vs. Bold** (Option A)
- Default: Light tint + dark text
- Inverse: Full color + white text

**Q13: Global state system?**
- Suggestion: Global semantic states (normal, ok, warning, error, inactive) that inventory references
- Answer: **Yes, approved**
- Structure: Global primitives → Domain-specific mappings

---

## Decision

**Design token system using Tailwind v4 `@theme` + TypeScript constants**

**File structure:**
```
src/design-tokens/
  ├── colors.css          # Primitives, semantic, tags
  ├── shadows.css         # sm, md, lg
  ├── borders.css         # default, thick
  ├── states.css          # Global + inventory states
  ├── index.css           # Imports all
  └── index.ts            # TypeScript exports
```

**Token hierarchy:**
- Primitives (base palette, tag colors)
- Semantic (theme tokens, global states)
- Domain-specific (inventory states reference global)

**Tag color system:**
- 8-12 preset colors
- Each has default (light tint) + inverse (bold) variant
- Accessible in TypeScript for color picker

**State system:**
- Global: normal, ok, warning, error, inactive
- Inventory: low-stock, expiring, in-stock, out-of-stock
- Inventory states map to global states

**Border styles:** Use Tailwind utilities, not tokens

**Benefits:**
- Type-safe tag colors
- Better organization (hierarchical)
- No build step (Tailwind v4 native)
- Consistent semantic states
