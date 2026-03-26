---
name: Onboarding page brainstorming
description: Full brainstorming session for the onboarding/welcome page feature — flow, content, and architecture decisions
type: brainstorming
date: 2026-03-26
---

# Brainstorming: Onboarding Page

## Context

Phase 2 of portfolio-prep visual improvements. Goal: guide first-time users (or users who just cleared their data) through initial setup so they rarely see empty states.

## Decisions

### Trigger (E — from Phase 1)
- Auto-shown when **all** of items, tags, and vendors are empty
- Also accessible from a future "Clear data / Reset" button in Settings
- Always accessible from Settings as an entry point

### Flow (A)

**Step 1 — Welcome screen** (full-screen)
Three options, listed top to bottom:
1. "Choose from template" → go to Step 2
2. "Upload and import from a previous backup" → open file picker → show progress → show "Start" button on success
3. "Start from scratch" → go directly to pantry page (empty)

**Step 2 — Template overview** (same UI as Step 4/Review)
Two entries:
- `N template items . . . 0 selected >`
- `X template vendors . . 0 selected >`
- [Back] ... [Confirm]

**Step 3A — Template items browser**
- Header: [← Back] N template items selected ... [Select all visible] [Clear selection]
- Filters: [dropdown: All storage ▾] [dropdown: All categories ▾] [🔍 Search icon]
- Optional: [search input row] (toggled by search icon)
- Status: "Showing X of Y items" ... [Clear filter]
- Item list with checkboxes (ItemCard variant: no quantity, no expiration, shows pre-assigned tags)

**Step 3B — Template vendors browser**
- Header: [← Back] N template vendors selected ... [Select all visible] [Clear selection]
- [Search input]
- "Showing X of Y vendors" ... [Clear filter]
- Vendor list with checkboxes (VendorCard variant: no count, no delete)

**Step 4 — Review**
Same UI as Step 2, with updated counts (M selected / Y selected). Same view, not a separate component.

**Step 5 — Done**
- Progress bar shown while creating data, all buttons hidden
- "Get started" button appears on completion → navigates to pantry page

### Layout (B)
Full-screen (no bottom nav, no sidebar)

### Landing after completion (C)
Pantry page

### Pre-defined content (D, F, G)
- 30–50 template items, with pre-assigned tags
- Categories use nested tag types (see architecture section)
- Developer-defined only (not user-configurable)

### Vendor list (E)
Costco, PX Mart, Simple Mart, RT-Mart, Carrefour, I-Mei Food, Lopia, City Super, Mia C'bon, Jasons Market Place, Poya, Nitori, Ikea, Cosmed, Watsons, FamilyMart, 7-Eleven

### Review step (H)
Same as Step 2 UI (O confirmed: same component, updated counts)

### Import alternative (I)
Uses the existing file picker / import flow; embedded in the welcome screen as one of the three options

### Nested tag types (J)
**Option A chosen**: nested structure propagates to the full app, including Settings → Tags UI.

TagType gets an optional `parentId` field:
- `Food` (top-level, no parent)
  - `生鮮`, `熟食`, `零食`, `飲料`, `穀類主食`, `調味料`, `營養補充` (children of Food)
- `Personal Care` → `身體清潔`, `衛生用品`, `身體保養`, `醫療保健`
- `Household` → `家庭清潔`, `廚房耗材`
- `Pet Supplies` (leaf, no children)
- `Baby` (leaf, no children)
- Storage methods (top-level group): `room temperature`, `refrigerated`, `frozen`

### Category filter behavior (K)
Selecting a parent category (e.g. "Food") shows items tagged with **any** of its subtypes.

### Template ItemCard (L)
Shows item name + checkbox + pre-assigned tags. No quantity, no expiration.

### VendorCard (M)
Component exists at `apps/web/src/components/vendor/VendorCard/index.tsx`. Onboarding uses a variant with no count/delete elements.

### Empty data trigger (N)
All three collections empty: items AND tags AND vendors.

### Step 2 / Step 4 (O)
Same UI component. Step 4 is Step 2 re-rendered with updated selection counts after the user browses items/vendors.
