# Cooking Page — Sort, Search URL Params, and Expand/Collapse All

## Overview

Add user-controlled recipe sorting, move search state to URL params, and add an expand/collapse all button to the cooking page. A new `CookingControlBar` component encapsulates all search and sort controls.

## Data Model

Add `lastCookedAt?: Date` to the `Recipe` type (`src/types/index.ts`). This field is optional — existing records remain valid without migration data transforms.

Update `src/db/operations.ts`: when the user presses Done, set `lastCookedAt = new Date()` on every recipe included in the cooking session.

A new Dexie schema version is required to register the field. No data transformation needed.

## URL Params

Three new search params on the cooking route:

| Param | Values | Default |
|-------|--------|---------|
| `?sort` | `name` \| `recent` \| `count` | `name` |
| `?dir` | `asc` \| `desc` | `asc` |
| `?q` | string | `""` |

Read/written via TanStack Router's `useSearch` / `useNavigate`.

## `CookingControlBar` Component

**Location:** `src/components/recipe/CookingControlBar/index.tsx`

**Responsibility:** All search and sort UI, fully self-contained. Reads/writes `?sort`, `?dir`, and `?q` directly via router hooks.

### Row layout

```
Row 1: [Sort ▾] [↑↓ Direction] [Expand/Collapse All] [flex-1] [🔍 Search toggle]
Row 2: [search input .......................] [+ Create | × clear]   ← conditional
```

### Props

```ts
interface CookingControlBarProps {
  allExpanded: boolean
  onExpandAll: () => void
  onCollapseAll: () => void
}
```

Expand/collapse state lives in the parent (`cooking.tsx`) as `expandedRecipeIds: Set<string>`.

### Expand/Collapse All button

Single toggle button. Shows "expand all" icon when any recipe is collapsed (`!allExpanded`); shows "collapse all" icon when all are expanded. Uses `ChevronsDownUp` / `ChevronsUpDown` (or equivalent) Lucide icons.

### Sort dropdown

`<Select>` with three options:
- **Name** (`name`) — alphabetical
- **Recent** (`recent`) — most recently cooked
- **Item Count** (`count`) — number of ingredients

### Sort direction button

Icon-only button (`ArrowUp` / `ArrowDown`), toggles `?dir` between `asc` and `desc`.

### Search visibility

Internal state, initialized to `true` when `?q` is non-empty on mount. Toggle button opens/closes Row 2. Pressing Escape clears `?q` but keeps Row 2 open. User must click the search toggle button to close Row 2.

### Search input row (Row 2)

Same behavior as current implementation:
- `+ Create` button shown when `?q` is non-empty and no exact recipe title match exists → navigates to `/settings/recipes/new?name=<query>`
- `× clear` button shown when an exact title match exists → clears `?q`
- Pressing Enter with no exact match navigates to create

## Sorting Logic in `cooking.tsx`

The `sortedRecipes` memo reads `?sort` and `?dir` and applies:

| Sort | Logic |
|------|-------|
| `name` | `localeCompare`, case-insensitive |
| `recent` | by `lastCookedAt`; `undefined` sorts last regardless of direction |
| `count` | by `recipe.items.length` |

Direction (`asc`/`desc`) applies to all three sort options.

Default (`name` asc) matches current hardcoded behavior — page looks unchanged on first visit.

## Integration in `cooking.tsx`

```tsx
<Toolbar>...</Toolbar>
<CookingControlBar
  allExpanded={expandedRecipeIds.size === recipes.length}
  onExpandAll={() => setExpandedRecipeIds(new Set(recipes.map(r => r.id)))}
  onCollapseAll={() => setExpandedRecipeIds(new Set())}
/>
{/* recipe list */}
```

Remove search toggle button and search input row from current toolbar JSX — they move into `CookingControlBar`.

## Files Affected

| File | Change |
|------|--------|
| `src/types/index.ts` | Add `lastCookedAt?: Date` to `Recipe` |
| `src/db/operations.ts` | Update `lastCookedAt` on Done; new Dexie schema version |
| `src/routes/cooking.tsx` | Read URL params for sort; integrate `CookingControlBar`; remove search state/JSX |
| `src/components/recipe/CookingControlBar/index.tsx` | New component |
| `src/components/recipe/CookingControlBar/index.stories.tsx` | Storybook stories |
| `src/routes/cooking.test.tsx` | Update tests for new sort/search behavior |
| `src/routes/cooking.stories.tsx` | Update stories for new toolbar layout |
