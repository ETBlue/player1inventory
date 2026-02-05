# Brainstorming Log: Storybook Setup

**Date:** 2026-02-04

## Initial Request

> I'm about to refine the visual of the UI components. document all components in storybook so that I can easily access them in a list

## Q&A Session

### Q1: Component Scope

Which components should we document in Storybook?

1. UI primitives only - Button, Card, Input, Badge, Dialog, etc. (8 components) (Recommended)
2. All components - UI primitives + domain components (20 components)
3. Domain components only - ItemCard, TagBadge, dialogs (12 components)

**Answer:** 2 (All components)

---

### Q2: Story Organization

How should we organize the stories in Storybook's sidebar?

1. By layer - `UI/Button`, `UI/Card`, `Components/ItemCard`, `Components/TagBadge` (Recommended)
2. Flat list - All components at same level alphabetically
3. By feature - `Tags/TagBadge`, `Tags/TagDetailDialog`, `Inventory/ItemCard`, etc.

**Answer:** 1 (By layer)

---

### Q3: Story Variants

How detailed should each component's stories be?

1. Essential variants - Default state + key interactive states (Recommended)
2. Comprehensive - All props combinations, edge cases, responsive views
3. Minimal - Just one default story per component

**Answer:** 1 (Essential variants)

---

### Q4: Additional Features

Which extras would you like with the Storybook setup?

1. Dark mode toggle - Preview components in light/dark themes (Recommended)
2. Docs addon - Auto-generate documentation from TypeScript props
3. Both dark mode and docs
4. None - Just basic Storybook

**Answer:** 1 (Dark mode toggle)

---

## Design Section Approvals

**Section 1 - Storybook Setup:**
- Dependencies: storybook, @storybook/react-vite, addon-essentials, addon-themes
- Scripts: storybook, build-storybook

**Answer:** yes

---

**Section 2 - Story Organization:**
- Stories colocated with components
- Sidebar: UI/ for primitives, Components/ for domain components

**Answer:** yes

---

**Section 3 - Dark Mode & Story Format:**
- Dark mode toggle using Tailwind's dark class
- CSF3 story format with Meta and StoryObj

**Answer:** yes

---

**Section 4 - Implementation Approach:**
- Install → Initialize → Configure dark mode → UI stories → Component stories
- ~20 story files, ~40-50 individual stories

**Answer:** yes

---

## Final Design

Saved to: `docs/plans/2026-02-04-storybook-setup-design.md`

### Summary

**Scope:** All 20 components (8 UI primitives + 12 domain components)

**Organization:** Layer-based (`UI/` and `Components/`)

**Story detail:** Essential variants (default + key states)

**Extras:** Dark mode toggle for theme preview
