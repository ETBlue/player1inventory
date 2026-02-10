# Tag Management Shortcut Design

**Date:** 2026-02-11

**Goal:** Create direct navigation shortcut between home page (item list) and tag management, eliminating the need to navigate through the settings page.

---

## Problem

Tag type settings are buried under Settings → Tags, requiring two navigation steps. Users need to update tag types frequently while managing items, making this navigation overhead disruptive to their workflow.

---

## Solution

Create a direct shortcut between the home page (item list) and tag management, bypassing the settings intermediary.

**New User Flow:**
```
Home (/) ←→ Tag Management (/settings/tags)
```

**Key Changes:**
1. **Home page**: Add "Manage Tags" button in top toolbar alongside "Add Item"
2. **Tags page**: Back button returns to home instead of settings

**Existing Flow Preserved:**
The Settings → Tags path remains functional for users who navigate from the settings page.

**Benefits:**
- Reduces navigation from 2 clicks to 1 click each direction
- Creates intuitive workflow loop between items and tags
- Maintains existing settings navigation for discoverability

---

## Component Changes

### Home Page (`src/routes/index.tsx`)

**Add "Manage Tags" button in top toolbar:**
- Position: Next to "Add Item" button
- Icon: `Tags` icon from lucide-react
- Label: "Tags"
- Behavior: Navigate to `/settings/tags`
- Styling: `neutral-outline` or `neutral-ghost` variant (secondary action)

**Implementation:**
```tsx
import { Tags } from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'

// In toolbar section:
<Button
  variant="neutral-outline"
  onClick={() => navigate({ to: '/settings/tags' })}
>
  <Tags className="h-4 w-4 mr-2" />
  Tags
</Button>
```

### Tags Page (`src/routes/settings/tags.tsx`)

**Update back button navigation:**

**Current (line 124):**
```tsx
onClick={() => navigate({ to: '/settings' })}
```

**New:**
```tsx
onClick={() => navigate({ to: '/' })}
```

Always return to home page, regardless of how user arrived at tags page. This simplifies logic and matches the primary workflow.

---

## Implementation Details

**Files to Modify:**

1. **`src/routes/index.tsx`** (Home page)
   - Import: `Tags` icon, `useNavigate` hook
   - Add: "Manage Tags" button in toolbar
   - Test: Button navigates to `/settings/tags`

2. **`src/routes/settings/tags.tsx`** (Tags page)
   - Modify: Back button navigation target from `/settings` to `/`
   - Test: Back button returns to home

**No Breaking Changes:**
- Tag management functionality remains unchanged
- Settings page link to tags still works
- All existing CRUD operations preserved
- Database operations unaffected

**Testing Checklist:**
- [ ] Home page displays "Manage Tags" button
- [ ] Button navigates to `/settings/tags`
- [ ] Tags page back button returns to home
- [ ] Tag CRUD operations still work
- [ ] Settings → Tags navigation still works
- [ ] Theme and styling consistent across both routes

**Visual Consistency:**
- Use existing button variants from the codebase
- Match icon sizing and spacing patterns
- Ensure button works in both light and dark themes

---

## Future Considerations

If user needs change, alternative approaches could include:
- Floating action button for tag management
- Inline tag type editing from item cards
- Tag type quick-switch dropdown in navigation

Current solution prioritizes simplicity and minimal code changes while addressing the core workflow issue.
