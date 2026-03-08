# Component Folder Reorganization Design

## Problem

`src/components/` has 58 files in a flat structure, making it hard to find the right component to edit.

## Solution

Reorganize by entity type, with per-component subfolders containing `index.tsx`, test files, and story files.

## Structure

```
src/components/
  item/
    ItemCard/        index.tsx + 7 story/test files
    ItemFilters/     index.tsx + stories
    ItemForm/        index.tsx + test + stories
    ItemListToolbar/ index.tsx + stories
    ItemProgressBar/ index.tsx + test + stories
  tag/
    EditTagTypeDialog/ index.tsx + stories
    TagBadge/          index.tsx + stories
    TagDetailDialog/   index.tsx + stories
    TagNameForm/       index.tsx + test + stories
    TagTypeDropdown/   index.tsx + test + stories
  vendor/
    VendorCard/      index.tsx + test + stories
    VendorNameForm/  index.tsx + test + stories
  recipe/
    RecipeCard/      index.tsx + test + stories
    RecipeNameForm/  index.tsx + stories
  ui/                (unchanged — shadcn primitives)
  AddNameDialog/     index.tsx + stories
  ColorSelect/       index.tsx + test + stories
  DeleteButton/      index.tsx + test + stories
  FilterStatus/      index.tsx + test + stories
  Layout/            index.tsx
  Navigation/        index.tsx
  Toolbar/           index.tsx + test + stories
```

## Decisions

- **Entity grouping**: `item/`, `tag/`, `vendor/`, `recipe/` subfolders for domain-specific components.
- **Shared at root**: Cross-cutting custom components (`AddNameDialog`, `Toolbar`, etc.) stay at the `components/` root as per-component folders. This avoids confusion with `ui/` (which is also "shared" but is shadcn primitives).
- **Per-component subfolder**: Each component gets its own folder with `index.tsx`. Consistent rule, especially beneficial for `ItemCard` (8 files).
- **No barrel files**: `index.tsx` is a direct rename of the existing `.tsx` — no re-exports added.
- **Import paths updated directly**: All `@/components/ComponentName` imports updated to `@/components/entity/ComponentName` (or root for shared). CLAUDE.md file paths also updated.
