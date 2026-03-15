# Settings Tags E2E Test Design

## Overview

Add end-to-end tests for the full tag management flow: tags list page (`/settings/tags`) and tag detail page (`/settings/tags/$id`).

## File Structure

```
e2e/
  pages/
    settings/
      TagsPage.ts        # Tags list page object (/settings/tags)
      TagDetailPage.ts   # Tag detail page object (/settings/tags/$id)
    SettingsPage.ts      # Existing — keep createTagType() unchanged
  tests/
    settings/
      tags.spec.ts       # All tags e2e tests
```

`SettingsPage.ts` is unchanged — `createTagType()` stays there for reuse by other test files (e.g. cooking). The new page objects handle all tag-specific selectors and actions.

## Page Objects

### `TagsPage.ts`

Methods for the tags list page:

```ts
navigateTo()                          // goto /settings/tags
fillTagTypeName(name)                 // fill the Name input
selectTagTypeColor(color)             // choose color from ColorSelect
clickNewTagType()                     // click "New Tag Type" button
getTagTypeCard(name)                  // locator: card heading h3
clickNewTag(tagTypeName)              // click "New Tag" button inside a type card
fillTagName(name)                     // fill name in AddNameDialog
submitTagDialog()                     // click "Add Tag" in dialog
getTagBadge(name)                     // locator: tag badge by name
clickDeleteTag(name)                  // click X button next to a tag badge
clickDeleteTagType(name)              // click trash icon on a tag type card (aria-label)
confirmDelete()                       // click confirm in delete dialog
dragTagToType(tagName, targetTypeName) // drag badge to another type card
getUndoToast()                        // locator: undo toast
clickUndo()                           // click Undo in the toast
```

### `TagDetailPage.ts`

Methods for `/settings/tags/$id`:

```ts
navigateTo(id)             // goto /settings/tags/${id}
fillName(name)             // fill tag name input on Info tab
selectType(typeName)       // select tag type from dropdown
clickSave()                // click Save button
clickItemsTab()            // click Items tab
getItemCheckbox(name)      // locator: item checkbox by name
toggleItem(name)           // click item checkbox
```

## Test Scenarios

Seven tests in `e2e/tests/settings/tags.spec.ts`:

### Tags List Page

1. **`user can create a tag type`**
   - Given: tags page is empty
   - When: fill name "Protein", click "New Tag Type"
   - Then: card with heading "Protein" appears

2. **`user can add a tag to a tag type`**
   - Given: tag type "Protein" exists (via UI from test 1 pattern, or seed)
   - When: click "New Tag" inside card, fill "Chicken", submit
   - Then: "Chicken" badge appears inside "Protein" card

3. **`user can delete a tag`**
   - Given: tag type + tag seeded via IndexedDB
   - When: click X on badge, confirm dialog
   - Then: badge is gone

4. **`user can delete a tag type`**
   - Given: tag type (no tags) seeded via IndexedDB
   - When: click trash icon, confirm dialog
   - Then: card is gone

5. **`user can move a tag to a different type via drag-and-drop`**
   - Given: two tag types ("A", "B") + one tag under "A" seeded via IndexedDB
   - When: drag the tag badge from type "A" card to type "B" card
   - Then: toast "Moved … to B" appears; badge visible under "B"
   - When: click "Undo"
   - Then: badge moves back under "A"

### Tag Detail Page

6. **`user can edit tag name and type on Info tab`**
   - Given: two tag types + one tag seeded via IndexedDB
   - When: navigate to tag detail, change name to "Dairy", select other type, save
   - Then: updated name and type visible on return to list (or on the detail page)

7. **`user can assign and unassign an item on Items tab`**
   - Given: item + tag type + tag seeded via IndexedDB
   - When: navigate to tag detail Items tab, check item checkbox
   - Then: checkbox is checked (item assigned)
   - When: uncheck the checkbox
   - Then: checkbox is unchecked (item unassigned)

## Setup Strategy

- Tests 1–2: UI-driven setup (simple, 1–2 steps)
- Tests 3–7: `page.evaluate()` IndexedDB seeding — navigate to `/` first so Dexie initialises the schema, then open `indexedDB.open('Player1Inventory')` and use `readwrite` transactions

## Teardown

All tests share the same `afterEach` teardown (clear IndexedDB + localStorage + sessionStorage), matching the pattern in `shopping.spec.ts` and `cooking.spec.ts`.

## Implementation Notes (post-design additions)

**Cloud-mode support added:** The spec was extended to run in both `local` and `cloud` Playwright projects. Key additions:

- `afterEach` is now dual-mode: cloud → `DELETE /e2e/cleanup` with `x-e2e-user-id` header; local → clear IndexedDB/localStorage/sessionStorage
- Tests 3–7 use conditional setup: cloud uses UI-driven flow (navigate + create via app), local uses `page.evaluate()` IndexedDB seeding
- `playwright.config.ts` expanded `testMatch` to include `**/settings/tags.spec.ts` in the cloud project
- `TagsPage` gained a `clickTagBadgeToNavigate()` method for cloud-mode tag detail navigation
- TanStack Router index routes append a trailing slash (`/settings/tags/$id/`) — `waitForURL` must avoid end-anchor regexes; extract ID with `filter(Boolean)`
- Cloud hooks use `mutateAsync` (not `mutate({onSuccess})`): cloud shims ignore the options argument
- Apollo Client freezes cached arrays — use `[...array].sort()` never `array.sort()` in place

## Drag-and-Drop Notes

Use Playwright's `dragTo()` API targeting the tag badge source and the target type card. The `PointerSensor` in the app uses an 8px activation distance — Playwright's `dragTo()` simulates a sufficiently long movement to trigger the drag. If `dragTo()` proves flaky, fall back to manual `mouse.move()` with intermediate steps.
