# Context-Aware Navigation Design

**Date:** 2026-02-20
**Status:** Approved

## Overview

Enhance the app's back button navigation to be context-aware across all pages. Users should return to their previous page (pantry vs shopping) rather than following hardcoded routes. Additionally, back buttons should skip tab navigation within the same logical page (item detail tabs, vendor detail tabs).

## Goals

1. **Context-aware back navigation** - Back buttons respect where the user came from (shopping vs pantry vs settings)
2. **Hierarchical navigation** - Back button skips tab switches within the same page (treats tabs as one logical level)
3. **Vendor management access** - Add "Manage vendors..." option in shopping page's vendor dropdown
4. **Sensible fallbacks** - When navigation history is empty, use logical default destinations

## Navigation Rules & Architecture

### Enhanced useAppNavigation Hook

**Current signature:**
```typescript
useAppNavigation() → { goBack }
```

**Enhanced signature:**
```typescript
useAppNavigation(fallbackPath?: string) → { goBack }
```

**Navigation Logic:**
1. Load history from sessionStorage
2. **Filter out same-page entries** - Remove consecutive entries that belong to the same logical page
3. Find previous page that's different from current page
4. Navigate to that page, or fallback if no valid previous page exists

**Same-page detection rules:**
- **Item detail:** `/items/$id`, `/items/$id/tags`, `/items/$id/vendors`, `/items/$id/log` → all treated as same page
- **Vendor detail:** `/settings/vendors/$id`, `/settings/vendors/$id/items` → same page
- **Other pages:** Each route is a separate page

**Example Flow:**
```
History: ['/', '/items/123', '/items/123/tags', '/items/123/log']
Current: /items/123/log

Filter same-page: ['/', '/items/123', '/items/123/tags', '/items/123/log']
                   ↓
                   ['/']  (everything else filtered as same-page)

Result: Back → goes to '/' (pantry)
```

### Page-Specific Fallback Rules

| Page | Current Behavior | New Behavior | Fallback Path | Why |
|------|-----------------|--------------|---------------|-----|
| Item detail (any tab) | Uses `goBack()` | Add fallback | `/` | Main use case is pantry |
| Vendor detail (any tab) | Uses `goBack()` | Add fallback | `/settings/vendors` | Logical parent |
| Vendor list | Hardcoded `/settings` | Use `goBack('/settings')` | `/settings` | Primary access point |
| Tag list | Hardcoded `/` | Use `goBack('/settings')` | `/settings` | Primary access point |

## Component Changes

### 1. Enhanced useAppNavigation Hook

**File:** `src/hooks/useAppNavigation.ts`

**Changes:**
- Add optional `fallbackPath` parameter to hook signature
- Implement `isSamePage(path1, path2)` helper function
- Filter navigation history to remove same-page tab switches
- Use fallback path when no valid previous page exists

**Same-page detection logic:**
```typescript
function isSamePage(path1: string, path2: string): boolean {
  // Item detail pages: /items/:id/*
  const itemMatch1 = path1.match(/^\/items\/([^/]+)/)
  const itemMatch2 = path2.match(/^\/items\/([^/]+)/)
  if (itemMatch1 && itemMatch2 && itemMatch1[1] === itemMatch2[1]) {
    return true
  }

  // Vendor detail pages: /settings/vendors/:id/*
  const vendorMatch1 = path1.match(/^\/settings\/vendors\/([^/]+)/)
  const vendorMatch2 = path2.match(/^\/settings\/vendors\/([^/]+)/)
  if (vendorMatch1 && vendorMatch2 && vendorMatch1[1] === vendorMatch2[1]) {
    return true
  }

  return false
}
```

### 2. Vendor List Page

**File:** `src/routes/settings/vendors/index.tsx`

**Current:** Hardcoded `navigate({ to: '/settings' })` (line 41)
**New:** Use `goBack('/settings')` from `useAppNavigation('/settings')`

**Changes:**
```typescript
// Add hook
const { goBack } = useAppNavigation('/settings')

// Update back button (line 41)
// Before: onClick={() => navigate({ to: '/settings' })}
// After:  onClick={goBack}
```

### 3. Tag List Page

**File:** `src/routes/settings/tags.tsx`

**Current:** Hardcoded `navigate({ to: '/' })` (line 125)
**New:** Use `goBack('/settings')` from `useAppNavigation('/settings')`

**Changes:**
```typescript
// Add hook
const { goBack } = useAppNavigation('/settings')

// Update back button (line 125)
// Before: onClick={() => navigate({ to: '/' })}
// After:  onClick={goBack}
```

### 4. Item Detail Page

**File:** `src/routes/items/$id.tsx`

**Current:** Already uses `useAppNavigation()` (line 43)
**New:** Add fallback path

**Changes:**
```typescript
// Before (line 43)
const { goBack } = useAppNavigation()

// After
const { goBack } = useAppNavigation('/')
```

### 5. Vendor Detail Page

**File:** `src/routes/settings/vendors/$id.tsx`

**Current:** Already uses `useAppNavigation()` (line 35)
**New:** Add fallback path

**Changes:**
```typescript
// Before (line 35)
const { goBack } = useAppNavigation()

// After
const { goBack } = useAppNavigation('/settings/vendors')
```

## New Feature: Vendor Management Access from Shopping

### Shopping Page Vendor Dropdown

**File:** `src/routes/shopping.tsx`

**Current behavior:**
- Vendor Select dropdown shows "All vendors" + list of vendors with counts
- Selecting a vendor filters the item list
- No way to manage vendors from this page

**New behavior:**
- Add "Manage vendors..." option at the **top** of the dropdown (before "All vendors")
- Clicking it navigates to `/settings/vendors`
- This creates navigation history: `/shopping` → `/settings/vendors`
- Back button from vendor list will return to `/shopping` (context-aware!)

**Implementation:**

Add new SelectItem at the beginning of SelectContent (after line 158):

```typescript
<SelectContent>
  <SelectItem value="__manage__" className="font-medium">
    Manage vendors...
  </SelectItem>
  <SelectItem value="all">All vendors</SelectItem>
  {vendors.map((v) => (
    <SelectItem key={v.id} value={v.id}>
      {v.name} ({vendorCounts.get(v.id) ?? 0})
    </SelectItem>
  ))}
</SelectContent>
```

Handle the selection in `onValueChange`:

```typescript
onValueChange={(v) => {
  if (v === '__manage__') {
    navigate({ to: '/settings/vendors' })
    // Reset selection to current vendor or 'all' so dropdown doesn't show "Manage vendors..."
    return
  }
  setSelectedVendorId(v === 'all' ? '' : v)
}}
```

**Note:** Need to handle dropdown visual state - after navigating to vendor management, the Select value should remain at the current filter selection, not show "Manage vendors..." when user returns.

## Testing Strategy

### Unit Tests

**New test file:** `src/hooks/useAppNavigation.test.ts`

**Test cases:**
1. **Same-page detection**
   - Item detail tabs (`/items/123` and `/items/123/tags`) are detected as same page
   - Vendor detail tabs (`/settings/vendors/abc` and `/settings/vendors/abc/items`) are same page
   - Different pages are not treated as same page

2. **History filtering**
   - Tab navigation within same page is filtered from history
   - Cross-page navigation is preserved in history
   - Empty history after filtering uses fallback path

3. **Fallback behavior**
   - When no history exists, uses provided fallback path
   - When fallback not provided, defaults to `/`

### Integration Tests

**Update existing test files:**

**`src/routes/settings/vendors.test.tsx`:**
- Back button navigates to `/settings` when no history
- Back button navigates to `/shopping` when coming from shopping page

**`src/routes/settings/tags.test.tsx`** (new file needed):
- Back button navigates to `/settings` when no history
- Back button navigates to `/shopping` when coming from shopping page
- Back button navigates to `/` when coming from pantry page

**`src/routes/items/$id.test.tsx`** (already exists):
- Back button skips tab navigation history
- Back from any tab goes to previous app page (pantry/shopping)
- Falls back to `/` when no valid history exists

**`src/routes/shopping.test.tsx`:**
- "Manage vendors..." option appears in vendor dropdown
- Clicking "Manage vendors..." navigates to `/settings/vendors`
- Vendor filter functionality still works as before
- Dropdown visual state doesn't get stuck on "Manage vendors..."

### Manual Testing Scenarios

**Scenario 1: Shopping → Vendor List → Vendor Detail → Back → Back**
- Navigate to shopping page
- Click "Manage vendors..." in dropdown
- Click on a vendor name
- Click back button → should go to vendor list
- Click back button again → should go to shopping page

**Scenario 2: Pantry → Item → Tags tab → Log tab → Back**
- Navigate to pantry
- Click on an item
- Click Tags tab
- Click Log tab
- Click back button → should skip tabs and go directly to pantry

**Scenario 3: Shopping → Tag List (via Edit button) → Back**
- Navigate to shopping page
- Show filters
- Click "Edit" button next to tag filters
- Click back button → should return to shopping page

**Scenario 4: Direct URL access to `/items/123/tags` → Back**
- Enter URL directly in browser: `/items/123/tags`
- Click back button → should fall back to `/` (pantry)

**Scenario 5: Settings → Vendor List → Back**
- Navigate to settings page
- Click on "Vendors" (Store icon)
- Click back button → should return to settings page

**Scenario 6: Settings → Tag List → Back**
- Navigate to settings page
- Click on "Tags" (Tags icon)
- Click back button → should return to settings page

## Edge Cases & Error Handling

### Empty or Cleared History

**Problem:** User clears browser storage or accesses page directly via URL
**Solution:** Fallback paths provide sensible defaults

### Same-page Detection False Positives

**Problem:** Regex might incorrectly match different pages
**Solution:** Use strict regex patterns with anchors (`^` and specific path structure)

### Browser Back Button

**Problem:** Users might expect browser back button to behave the same way
**Solution:** This design only affects in-app back buttons. Browser back button will continue to work through full history including tabs. This is acceptable - in-app back is for navigation hierarchy, browser back is for undo.

### Navigation History Growth

**Problem:** History array could grow unbounded
**Solution:** Already handled - `useAppNavigation` limits history to last 50 entries (MAX_HISTORY_SIZE)

## Implementation Notes

1. **Order of changes:** Implement hook changes first, then update component usages
2. **Testing:** Run existing tests after hook changes to ensure no regressions
3. **Deployment:** This is a UX enhancement with no database changes, safe to deploy incrementally
4. **User impact:** Improved navigation experience, no breaking changes

## Summary

This design enhances back button navigation to be context-aware while maintaining simple, predictable behavior:

- **Hierarchical navigation** - Back skips tab switches within same page
- **Context preservation** - Back remembers where you came from (shopping/pantry/settings)
- **Smart fallbacks** - Sensible defaults when history is unavailable
- **Vendor management access** - Easy access to vendor settings from shopping page

The implementation reuses the existing `useAppNavigation` hook with minimal changes, making it a low-risk enhancement that significantly improves UX.
