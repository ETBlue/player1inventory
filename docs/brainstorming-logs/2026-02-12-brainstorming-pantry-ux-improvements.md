# Brainstorming Log: Pantry UX Improvements

**Date:** 2026-02-12
**Branch:** `feature/pantry-ux-improvements`

This log documents two brainstorming sessions for pantry page UX improvements.

---

## Session 1: Filter Behavior Refinements

### Context

User wanted to refine pantry page with focus on:
1. Filter behaviors (to be implemented by AI)
2. Layouts (manual)
3. Colors (manual)

### Questions & Answers

**Q: What specific filter behavior would you like to change?**
Options:
- Change tag count calculation logic
- Change filter combination logic (AND/OR)
- Add filter persistence behavior
- Change how clicking tags on items works

**A:** "when user click on a tag in a pantry item, and when the tag is currently an active filter, remove the tag from filters. also, show all tags when a pantry item has more than 3 tags"

### Decisions

#### 1. Toggle Filter Behavior

**Current behavior:** Clicking a tag on an item always adds it to filters. If already in filter, nothing happens.

**New behavior:** Toggle interaction
- Click unfiltered tag → adds to filter
- Click filtered tag → removes from filter
- If all tags removed from a tag type, remove that tag type from filter state

**Implementation:** Update `handleTagClick` in `src/routes/index.tsx` to check if tag is already filtered and remove it if so.

#### 2. Show All Tags

**Current behavior:** ItemCard shows first 3 tags with `.slice(0, 3)`, displays "+N" badge for remaining tags.

**New behavior:** Show all tags
- Remove 3-tag limit
- Remove "+N" badge
- All tags visible and clickable
- Natural wrapping with `flex-wrap`

**Implementation:** Update `src/components/ItemCard.tsx` to remove `.slice(0, 3)` and "+N" badge logic.

### Rationale

- **Toggle behavior:** More intuitive - users expect clicking an active filter to deactivate it
- **Show all tags:** Better UX - no hidden tags, all tags immediately accessible for filtering
- **Simpler code:** Removing the 3-tag limit reduces complexity

### Design Document

`docs/plans/2026-02-12-pantry-filter-refinements-design.md`

### Implementation

Completed in commit `8002fb3`: "feat(filters): add toggle behavior and show all tags"

---

## Session 2: Item Progress Bar

### Context

User wanted to add visual progress indicator to item cards showing storage/target percentage with warning color when below threshold.

### Questions & Answers

**Q: Where should the progress bar be placed relative to the item title and quantity text?**
Options:
- Replace the quantity text (Recommended)
- Below the quantity text
- Between title and quantity text

**A:** "replace the quantity text, but render target quantity somewhere, so user knows the exact value of what 100% progress stands for"

**Q: Where should the target quantity value be displayed?**
Options:
- In the title line with unit (Recommended)
- At the end of progress bar
- Above the progress bar

**A:** "At the end of progress bar"

**Q: What visual style should the progress bar have?**
Options:
- Filled bar with percentage (Recommended)
- Percentage-only bar
- Segmented bar

**A:** "Segmented bar"

**Q: How should the segments be sized and limited?**
Options:
- One segment = one unit (Recommended)
- Fixed number of segments
- Scaled segments

**A:** "One segment = one unit (Recommended)"

**Q: What should happen when target quantity is very large (e.g., 50+ units)?**
Options:
- Show all segments (Recommended)
- Cap at max segments with scaling
- Switch to continuous bar

**A:** "Switch to continuous bar"

**Q: At what target quantity should it switch from segmented to continuous bar?**
Options:
- 15 units (Recommended)
- 10 units
- 20 units

**A:** "15 units (Recommended)"

**Q: Check if shadcn already provides a progress bar component?**

**A:** Yes - use shadcn/ui Progress component for continuous bar

### Decisions

#### Adaptive Progress Display

**Segmented bar (1-15 units):**
- One segment per unit
- Visual count of discrete items (e.g., "5 out of 8 bottles")
- Each segment: 8px height, rounded corners, small gaps
- Filled segments: Primary color (normal) or orange (warning)
- Empty segments: Background surface color

**Continuous bar (16+ units):**
- Smooth fill bar using shadcn Progress component
- Better for bulk items (e.g., "45/60 eggs")
- Prevents visual clutter with too many segments
- Smooth animation on quantity changes
- Uses Radix UI for accessibility

**Layout:**
```
[Progress bar ==================] 8/12
```

**Warning state:** Orange color when `quantity < refillThreshold`

### Rationale

**Why adaptive display?**
- **Segmented (1-15):** Clear visual count for discrete items. User can quickly see "5 out of 8 bottles" without doing math
- **Continuous (16+):** Prevents overwhelming the card with too many segments. More appropriate for bulk quantities

**Why 15 as threshold?**
- Balances visual clarity with usefulness
- 15 segments still readable without clutter
- Most pantry items have targets < 15 (anecdotal)

**Color scheme:**
- **Primary:** Aligns with theme, normal state
- **Orange:** Matches existing warning card variant and AlertTriangle icon
- **Background surface:** Subtle empty state

**shadcn Progress:**
- Consistent with other UI components
- Built-in accessibility (ARIA attributes)
- Less custom code to maintain

### Design Document

`docs/plans/2026-02-12-item-progress-bar-design.md`

### Implementation

Completed in commit `d3c355c`: "feat(ui): add progress bar to item cards"

Components created:
- `src/components/ui/progress.tsx` - shadcn Progress component
- `src/components/ItemProgressBar.tsx` - Adaptive progress bar with SegmentedProgressBar and ContinuousProgressBar
- Updated `src/components/ItemCard.tsx` - Uses ItemProgressBar instead of text

---

## Overall Improvements Summary

Both sessions focused on improving the pantry page UX through:

1. **Better filter interaction** - Toggle behavior makes filtering more intuitive
2. **Increased tag visibility** - All tags visible without expansion
3. **Visual feedback** - Progress bars provide immediate stock level understanding
4. **Adaptive design** - Progress bar adapts to quantity scale (segmented vs continuous)
5. **Warning clarity** - Orange color reinforces low stock state

These improvements reduce cognitive load and make the pantry management experience more intuitive and visual.
