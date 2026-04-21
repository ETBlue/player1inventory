# Design Guide Content Plan

**Date:** 2026-04-14
**Site:** `apps/design/` → `design.player1inventory.etblue.tw`
**Scope:** Fill in the 16 existing placeholder pages + add 5 new pages (21 total)

---

## Overview

This plan covers the content of the public-facing design guide. It does not cover the technical scaffold (already built in PR #183). Each phase maps to a section of the site.

### New pages to add (requires `astro.config.mjs` sidebar update)
- `tokens/effects.mdx` — border radius, shadows, elevation
- `tokens/theming.mdx` — light/dark mode strategy
- `tokens/layout.mdx` — grid system, breakpoints
- `patterns/navigation.mdx` — navbar, sidebar, tabs, breadcrumbs
- `patterns/error-states.mdx` — error messages, validation states
- `patterns/shelf-items.mdx` — items tab within shelf detail: assignment modes, item list view
- `principles.mdx` — top-level design principles (new top-level sidebar entry)
- `governance.mdx` — naming conventions, review process, versioning

---

## Phase 1 — Principles

**Goal:** Define the design philosophy that guides decisions when rules don't exist.

### Page: `principles.mdx` (new)
- 3–5 named principles, each with a short rationale
- Examples: "Clarity over cleverness", "Accessible by default", "Fast to scan"
- Place as the first sidebar entry (before Tokens)

---

## Phase 2 — Tokens

**Goal:** Document all visual primitives. These are the foundation everything else inherits from.

### Page: `tokens/colors.mdx` (has live swatches — add written guidance)
- Semantic token groups: `--background-*`, `--foreground-*`, `--importance-*`, `--status-*`, `--hue-*`
- When to use each group
- How primitive tokens (`--hue-blue-50`) relate to semantic tokens (`--importance-primary`)
- Dark mode behavior

### Page: `tokens/typography.mdx` (has live scale — add written guidance)
- Font family: Rosario (variable 300–700)
- Type scale steps and their intended use cases
- Line height and weight rules
- When to use each step

### Page: `tokens/spacing.mdx` (placeholder)
- Spacing scale (4px base: 4, 8, 12, 16, 24, 32, 48, 64…)
- Named steps and their semantic meaning (compact, default, loose)
- Usage rules: when to use which step

### Page: `tokens/motion.mdx` (placeholder)
- Duration tokens (fast, default, slow)
- Easing curves and their intent
- When to use animation vs. no animation (reduced motion)

### Page: `tokens/effects.mdx` (new)
- Border radius tokens and their usage (none, sm, md, lg, full)
- Shadow/elevation scale
- Elevation semantics: which surfaces sit at which level

### Page: `tokens/theming.mdx` (new)
- Light/dark mode token switching strategy
- How tokens map to themes (`[data-theme='dark']` overrides)
- Rules for adding new tokens (must define both modes)

### Page: `tokens/layout.mdx` (new)
- Grid system (columns, gutters, margins)
- Responsive breakpoints (mobile, tablet, desktop) with pixel values
- Page layout templates used in the app

---

## Phase 3 — Components

**Goal:** Document each UI building block with variants, states, anatomy, and accessibility notes.

For each component page, include:
- Live demo (React island)
- Anatomy (labeled diagram or description of parts)
- Variants and sizes
- States: default, hover, focus, active, disabled, loading, error
- Do / Don't examples
- Accessibility notes (ARIA role, keyboard behavior)
- Link to Storybook story

### Page: `components/button.mdx` (has live demo — add anatomy, do/don't, a11y)
### Page: `components/badge.mdx` (placeholder)
- User-color badges (tags) vs. system-color badges (vendor/recipe) — visual differentiation rules
- Badge click behavior rules across views (consistent interaction model)

### Page: `components/card.mdx` (placeholder)

---

## Phase 4 — Patterns

**Goal:** Document higher-level compositions and interaction behaviors.

### Page: `patterns/forms.mdx` (placeholder)
- Form layout and field spacing
- Inline vs. submit validation behavior
- Required vs. optional field conventions
- Loading state during submission

### Page: `patterns/empty-states.mdx` (placeholder)
- When to show an empty state
- Anatomy: illustration, headline, body, CTA
- Variations: first-time empty, filtered empty, error empty

### Page: `patterns/filter-pipeline.mdx` (placeholder)
- Filter bar anatomy
- Active filter chip behavior
- Combining multiple filters
- Clearing all filters

### Page: `patterns/navigation.mdx` (new)
- Navbar structure and behavior
- Sidebar navigation (when to use vs. top nav)
- Tabs vs. segmented controls
- Breadcrumbs

### Page: `patterns/error-states.mdx` (new)
- Inline field errors (timing, placement, wording)
- Form-level errors (top-of-form summary)
- Page-level errors (404, 500, network)
- Toast/alert errors (transient vs. persistent)

### Page: `patterns/object-detail.mdx` (new)
- Applies to all objects: item, tag, vendor, recipe, shelf
- Top bar anatomy and visuals for object detail pages
- Background elevation relative to list pages
- Back behavior: unsaved changes dialog, when to show
- Location history management on tab switch
- Toolbar consistency rules: button placement and available actions across all object types
- Layout and spacing grid: consistent structure when navigating between object types
- Shelf-specific: dual-tab structure (Info + Items tab); Info tab follows standard form behavior

### Page: `patterns/shelf-items.mdx` (new)
- Items tab anatomy within shelf detail view
- Two assignment modes: filter-based (auto-assigns matching items), selection (manually chosen items)
- Visual differentiation of assignment mode in the shelf header/toolbar
- How item count and current assignment mode surface in the shelf card and detail header
- Toolbar actions in the Items tab context (configure filter, add/remove items)
- Empty state per assignment mode (no items matched filter, no items selected)

### Page: `patterns/search-and-create.mdx` (new)
- Search input behavior (when to show, debounce, clear)
- Creating a new object from a search result
- Consistency rules across item/tag/vendor/recipe/shelf

### Page: `patterns/object-cards.mdx` (new)
- Object card anatomy in settings pages
- Delete button position and behavior
- Differentiation between object types (item/tag/vendor/recipe/shelf) in list vs. detail views
- Shelf list in settings: card layout, spacing, and available actions consistent with other object lists
- Shelf card: surfaces item count and active assignment mode (filter / selection)

---

## Phase 5 — Accessibility

**Goal:** Document a11y requirements as first-class design constraints.

### Page: `accessibility/overview.mdx` (placeholder)
- Why a11y is baked in, not bolted on
- WCAG level target (AA)
- Testing tools and process

### Page: `accessibility/color-contrast.mdx` (placeholder)
- Contrast ratios for text, UI components, icons
- Which token combinations pass/fail
- Known exceptions and how they're handled

### Page: `accessibility/keyboard-navigation.mdx` (placeholder)
- Focus order principles
- Custom focus styles (token-based)
- Keyboard interactions for each component type
- Skip links

---

## Phase 6 — Voice & Tone

**Goal:** Define the written language of the UI so copy feels consistent across features.

### Page: `voice-tone/overview.mdx` (placeholder)
- Tone principles (e.g. direct, friendly, never condescending)
- How tone shifts by context (error vs. success vs. onboarding)

### Page: `voice-tone/copy-guidelines.mdx` (placeholder)
- Capitalization rules (title case vs. sentence case, by context)
- Button labels (action-first, concise, no "click here")
- Input labels and placeholder text conventions
- Error message wording patterns (what went wrong + what to do)
- Empty state copy patterns
- Confirmation dialog wording

---

## Phase 7 — Governance

**Goal:** Explain who maintains the design system and how it evolves.

### Page: `governance.mdx` (new)
- Naming conventions (tokens, components, files)
- How to propose a new component or token
- Review process
- Versioning strategy
- Who owns what

---

## Sidebar changes required (`astro.config.mjs`)

Add to sidebar:
1. `{ label: 'Principles', slug: 'principles' }` — before Tokens
2. Under Tokens: `effects`, `theming`, `layout`
3. Under Patterns: `navigation`, `error-states`, `object-detail`, `shelf-items`, `search-and-create`, `object-cards`
4. `{ label: 'Governance', slug: 'governance' }` — after Voice & Tone

---

## Out of scope
- zh-TW translations
- Figma file or design handoff artifacts
- Automated token sync with Style Dictionary
- Storybook cross-linking (deferred from PR #183)
