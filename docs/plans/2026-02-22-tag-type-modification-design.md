# Tag Type Modification Design

**Date:** 2026-02-22
**Feature:** Allow users to modify the tag type of a tag

## Overview

Enable users to change which tag type a tag belongs to. This allows reorganizing tags as the taxonomy evolves, without needing to delete and recreate tags or reassign them to items.

## User Experience

### Two Interaction Points

**1. Tags List Page** (`/settings/tags`)
- **Drag-and-drop:** Drag a tag badge from one tag type card and drop it into another
- **Immediate save:** No confirmation needed, saves instantly
- **Undo toast:** Shows "Moved [Tag Name] to [Type Name]. Undo?" for 5 seconds
- **Visual feedback:** Tag becomes semi-transparent while dragging, drop zones highlight on hover

**2. Tag Detail Info Tab** (`/settings/tags/$id`)
- **Select dropdown:** "Tag Type" field above the name field
- **Explicit save:** Changes via the existing Save button (respects dirty state)
- **No undo toast:** User explicitly clicked Save, can use back button if needed

## Architecture

### Technology Choices

**Drag-and-drop library:** @dnd-kit
- Core: `@dnd-kit/core`
- Sortable: `@dnd-kit/sortable`
- Utilities: `@dnd-kit/utilities`

**Rationale:**
- Modern, well-maintained React library
- Excellent accessibility (keyboard navigation, screen readers)
- Touch device support
- Good TypeScript support
- ~30KB bundle size (acceptable for the UX improvement)
- MIT license

**Alternatives considered:**
- Pragmatic drag and drop (newer, smaller, but less mature)
- Native HTML5 drag-and-drop (accessibility concerns)
- Dropdown-only approach (less intuitive UX)

### Component Structure

**Tags List Page:**
```
<DndContext>
  {tagTypes.map(tagType => (
    <Card> {/* Tag type container */}
      <SortableContext items={tags}>
        {tags.map(tag => (
          <SortableItem id={tag.id}>
            <TagBadge /> {/* Draggable */}
          </SortableItem>
        ))}
      </SortableContext>
    </Card>
  ))}
  <DragOverlay /> {/* Visual feedback during drag */}
</DndContext>

<UndoToast /> {/* Bottom-center, 5s timeout */}
```

**Tag Detail Info Tab:**
```
<form>
  <Label>Tag Type</Label>
  <Select value={typeId} onChange={setTypeId}>
    {tagTypes.map(type => <option>{type.name}</option>)}
  </Select>

  <Label>Name</Label>
  <Input value={name} onChange={setName} />

  <Button disabled={!isDirty}>Save</Button>
</form>
```

### Component Decisions

**TagNameForm component:**
- Keep it focused on name-only (don't extend it)
- Compose the full form (name + type) directly in the Info tab
- Maintains component simplicity and reusability

## Data Flow

### Drag-and-Drop Flow (List Page)

1. User drags tag badge from Card A to Card B
2. `onDragEnd` event fires with `{ active, over }` data
3. Extract `tagId` from `active.id` and `newTypeId` from `over.id`
4. Store undo state: `{ tagId, previousTypeId: tag.typeId, newTypeId }`
5. Call `updateTag.mutate({ id: tagId, updates: { typeId: newTypeId } })`
6. TanStack Query updates cache, UI re-renders immediately
7. Show undo toast with 5-second timer
8. If undo clicked:
   - Call `updateTag.mutate({ id: tagId, updates: { typeId: previousTypeId } })`
   - Dismiss toast
9. If timeout expires, clear undo state

### Select Dropdown Flow (Info Tab)

1. User changes tag type dropdown
2. `setTypeId(newValue)` updates local state
3. `isDirty` becomes true (enables Save button)
4. User clicks Save
5. `handleSave` calls `updateTag.mutate({ id, updates: { name, typeId } })`
6. On success: navigate back via `goBack()`
7. No undo toast (user explicitly saved)

### Database & Cache

- `updateTag` operation already supports partial updates (no changes needed)
- IndexedDB updates immediately (optimistic update)
- TanStack Query invalidates `['tags']` cache
- All components observing tags re-render with updated data
- **Items are unaffected** - they reference `tagId`, not `typeId`

### Edge Cases

- **Drag to same type:** No-op, don't show toast
- **Undo timer active, user drags again:** Clear previous undo state
- **Multiple rapid drags:** Each gets its own undo state (last toast shown)

## Error Handling

### Drag-and-Drop Errors

**Invalid drop target:**
- User drops outside valid tag type Card → no-op, tag animates back
- Handled automatically by @dnd-kit collision detection

**Update mutation fails:**
- Show error toast: "Failed to move tag. Please try again."
- Tag stays in original position (optimistic update reverted)
- Undo state cleared

**Undo fails:**
- Show error toast: "Failed to undo. Please refresh the page."
- Don't retry automatically (could cause loops)

### Info Tab Errors

**Update fails on Save:**
- Same as existing behavior for name updates
- `updateTag.isPending` prevents duplicate saves
- On error: stay on page, show error

**Tag deleted while editing:**
- Component already handles: `if (!tag) return null`
- User sees empty page (acceptable)

### Validation

**Tag type doesn't exist:**
- Select dropdown only shows existing tag types
- Can't select invalid typeId

**DB errors:**
- IndexedDB operations are synchronous
- Errors caught by TanStack Query mutation handlers
- Show generic error toast

### Recovery

- All errors are transient (no permanent bad state)
- User can refresh page to reset
- Data remains consistent (mutations are atomic)

## Testing Strategy

### Unit Tests

**Data operations** (`src/db/operations.test.ts`):
- Already covered: `updateTag` with typeId change
- Verify tag moves to new type
- Verify items keep their tagIds (no cascade)

### Integration Tests

**Tags List Page** (`src/routes/settings/tags.test.tsx`):
- Test drag-and-drop flow:
  - Mock @dnd-kit events
  - Simulate drag tag from Type A to Type B
  - Verify `updateTag` called with correct typeId
  - Verify undo toast appears
  - Verify undo functionality
  - Verify toast dismisses after timeout
- Test invalid drop (drop outside valid zone)
- Test drag to same type (no-op)

**Tag Detail Info Tab** (`src/routes/settings/tags/$id.test.tsx` - new file):
- Test tag type select field renders
- Test changing tag type marks form dirty
- Test Save button updates both name and typeId
- Test navigation after save
- Test dirty state guard prevents navigation

### Component Tests

**TagBadge draggable:**
- Test badge renders with draggable attributes
- Test drag event handlers attached

### Manual Testing

- Drag-and-drop feel (smooth animations, cursor feedback)
- Undo toast timing (5 seconds feels right?)
- Keyboard accessibility (tab to badges, keyboard drag support)
- Touch device support (drag works on mobile)
- Multiple rapid operations (no race conditions)

### Storybook Stories

**Tags List Page:**
- Story with multiple tag types and draggable tags
- Demonstrate drag-and-drop interaction

**Tag Info Tab:**
- Story showing tag type select dropdown
- Multiple tag types in dropdown

## Implementation Notes

### Files to Modify

**Tags List Page:**
- `src/routes/settings/tags/index.tsx` - add drag-and-drop logic

**Tag Detail Info Tab:**
- `src/routes/settings/tags/$id/index.tsx` - add tag type select field

**Dependencies:**
- `package.json` - add @dnd-kit packages

### Files to Create

**Tests:**
- `src/routes/settings/tags/$id.test.tsx` - tag detail info tab tests

**Storybook:**
- Update existing stories to demonstrate new functionality

### No Changes Needed

- `src/db/operations.ts` - `updateTag` already supports this
- `src/hooks/useTags.ts` - existing hooks work as-is
- `src/components/TagNameForm.tsx` - keep name-only

## Visual Design

### List Page Drag States

**Default:**
- Tag badges as they currently appear

**Dragging:**
- Active tag: 50% opacity
- Cursor: grabbing
- Drag overlay: full opacity badge following cursor

**Drop Zone:**
- Tag type Card border: highlighted (use `border-primary` color)
- Valid drop: green highlight
- Invalid drop: red highlight

**After Drop:**
- Tag animates smoothly to new position in target Card

### Info Tab Form

**Field Order:**
1. Tag Type (select dropdown)
2. Name (text input)
3. Save button

**Dropdown:**
- Label: "Tag Type"
- Options: All tag types, sorted alphabetically
- Display: Tag type name with color indicator dot

## Success Criteria

- Users can drag tags between tag types on the list page
- Users can change tag type via dropdown on detail page
- Undo toast appears after drag-and-drop for 5 seconds
- Undo functionality works correctly
- No data loss or corruption
- Accessible via keyboard
- Works on touch devices
- All tests pass
