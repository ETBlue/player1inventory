### Tag Management

Tag detail page at `/settings/tags/$id` with Info and Items tabs, mirroring vendor detail page pattern.

**Tag detail page**: `src/routes/settings/tags/$id.tsx` — Tabbed layout (Info + Items). Info tab: edit tag name, tag type, and parent tag with Save button. Items tab: combined search+create input with a searchable checklist of all items showing their current tag assignments; saves immediately when a checkbox is clicked (no staged state, no Save button), same pattern as the vendor Items tab. Typing a name that matches no items reveals a `+ Create "<name>"` row — clicking it or pressing Enter creates the item immediately assigned to this tag; pressing Escape clears the input.

**Tag badge visual style**: `TagBadge` uses the tint variant (`${tagType.color}-tint`) — light background, colored border, dark text. On the tags list page, each badge is paired with an X (delete) button whose border and icon color match the badge's border color. This uses `TAG_COLOR_BORDER` and `TAG_COLOR_TEXT` lookup tables (static `Record<TagColor, string>` maps) in `src/routes/settings/tags/index.tsx` to avoid dynamic Tailwind class names that won't survive production builds.

**Tag type modification**: Users can change a tag's type in two ways:
1. **Drag-and-drop** (tags list page `/settings/tags`): Drag tag badges between tag type cards. Saves immediately with 5-second undo toast.
2. **Select dropdown** (tag detail Info tab): Choose tag type from dropdown. Saves with Save button, respects dirty state.

Uses `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` for accessible drag-and-drop.

**Dirty state**: `src/hooks/useTagLayout.tsx` — same pattern as `useVendorLayout`. Navigation guard on parent layout applies only to the Info tab (tag name and type editing); the Items tab has no unsaved state.

**Navigation:**

Back button and post-action navigation use smart history tracking (same pattern as vendor detail pages). After successful save, automatically navigates back to previous page. Uses `useAppNavigation()` hook.

**Entry point:** Click tag badge on tags list page (`/settings/tags`) to navigate to tag detail page.

**Nested tags**: Tags support a `parentId` field. Child tags appear indented under their parent in the list and filter dropdown, with tree connector lines (vertical `border-r` per ancestor level + horizontal connector). The parent selector is a Select in `TagInfoForm` showing tags of the same type. When deleting a parent tag that has children, a cascade-or-orphan dialog appears (cascade deletes children; orphan unsets their parentId). `useTagsWithDepth` computes `depth` for each tag via a depth-first traversal.

**Tag type creation and editing**: "New Tag Type" button opens a top-bar dialog (`TagTypeInfoForm`) instead of an inline input. Edit tag type (name + color) via the pencil icon on each tag type card, also using `TagTypeInfoForm`. Both paths share the same form component.

**`TagTypeInfoForm`** (`src/components/tag/TagTypeInfoForm/index.tsx`) — shared form for creating and editing tag types. Fields: name (first), color (second). Owns local state; exposes `onSave({ name, color })`. Validates that name is non-empty before enabling Save.

**Files:**
- `src/routes/settings/tags/$id.tsx` - Parent layout with tabs and navigation guard
- `src/routes/settings/tags/$id/index.tsx` - Info tab (name, type, parent editing)
- `src/routes/settings/tags/$id/items.tsx` - Items tab
- `src/routes/settings/tags/index.tsx` - Tags list page with drag-and-drop and nested hierarchy
- `src/hooks/useTagLayout.tsx` - Dirty state provider
- `src/components/tag/TagInfoForm/index.tsx` - Presentational form (name, type, parent; owns local state; onSave(data), onDirtyChange, typeReadonly?)
- `src/components/tag/TagTypeInfoForm/index.tsx` - Shared form for tag type create/edit (name, color; owns local state; onSave(data))
