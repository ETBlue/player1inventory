# Storybook Sidebar & Component File Organization

## Goal

Make it easier to find components in both the codebase and the Storybook site by applying a unified hierarchy to both the file system and Storybook `title` values.

## Current State

- Components directory: mostly flat (`src/components/Foo/`) with a few subfolders already created (`item/`, `tag/`, `vendor/`, `recipe/`, `settings/`) but 11 components still at the top level
- Storybook sidebar: inconsistent top-level sections (`Components/`, `Routes/`, `Settings/`, `Recipe/`, `UI/`, `Design Tokens/`)

## Target Structure

### Storybook Sidebar

```
Pages/
  Pantry
  Shopping
  Cooking
  Item/
    New
    Detail/
      (index)
      Tag
      Vendor
      Recipe
      Log
  Settings/
    (index)
    Tag/
      (index)
      Detail/
        (index)
        Item
    Vendor/
      (index)
      New
      Detail/
        (index)
        Item
    Recipe/
      (index)
      New
      Detail/
        (index)
        Item

Components/
  Global/
    Layout
    Navigation
    Sidebar
    PostLoginMigrationDialog
  Shared/
    AddNameDialog
    DeleteButton
    EmptyState
    FilterStatus
    LoadingSpinner
    Toolbar
  Item/
    ItemCard/
      Pantry
      Shopping
      Cooking
      Assignment
      Variants
    ItemFilters
    ItemForm
    ItemListToolbar
    ItemProgressBar
  Tag/
    ColorSelect
    EditTagTypeDialog
    TagBadge
    TagDetailDialog
    TagInfoForm
    TagNameForm
    TagTypeDropdown
    TagTypeInfoForm
  Vendor/
    VendorCard
    VendorInfoForm
    VendorNameForm
  Recipe/
    CookingControlBar
    RecipeCard
    RecipeInfoForm
    RecipeNameForm
  Settings/
    ConflictDialog
    DataModeCard
    ExportCard
    FamilyGroupCard
    ImportCard
    LanguageCard
    SettingsNavCard
    ThemeCard

UI Library/
  AlertDialog
  Badge
  Button
  Card
  Checkbox
  ConfirmDialog
  Dialog
  DropdownMenu
  Input
  Label
  Progress
  Select
  Switch

Colors
```

### File System

```
src/components/
  global/
    Layout/
    Navigation/
    Sidebar/
    PostLoginMigrationDialog/
  shared/
    AddNameDialog/
    DeleteButton/
    EmptyState/
    FilterStatus/
    LoadingSpinner/
    Toolbar/
  item/              ← already exists
    ItemCard/        ← already exists
    ItemFilters/     ← already exists
    ItemForm/        ← already exists
    ItemListToolbar/ ← already exists
    ItemProgressBar/ ← already exists
  tag/               ← already exists
    ColorSelect/     ← move from components/ColorSelect/
    EditTagTypeDialog/
    TagBadge/
    TagDetailDialog/
    TagInfoForm/     ← already exists
    TagNameForm/
    TagTypeDropdown/
    TagTypeInfoForm/ ← already exists
  vendor/            ← already exists
    VendorCard/
    VendorInfoForm/  ← already exists
    VendorNameForm/
  recipe/            ← already exists
    CookingControlBar/
    RecipeCard/
    RecipeInfoForm/  ← already exists
    RecipeNameForm/
  settings/          ← already exists
    ConflictDialog/
    DataModeCard/
    ExportCard/
    FamilyGroupCard/
    ImportCard/
    LanguageCard/
    SettingsNavCard/
    ThemeCard/
  ui/                ← already exists (shadcn/ui, flat files)
```

## Implementation Plan

### Phase A — File moves

Move 11 components from flat `src/components/` into their new subfolders:

| From | To |
|---|---|
| `components/Layout/` | `components/global/Layout/` |
| `components/Navigation/` | `components/global/Navigation/` |
| `components/Sidebar/` | `components/global/Sidebar/` |
| `components/PostLoginMigrationDialog/` | `components/global/PostLoginMigrationDialog/` |
| `components/AddNameDialog/` | `components/shared/AddNameDialog/` |
| `components/DeleteButton/` | `components/shared/DeleteButton/` |
| `components/EmptyState/` | `components/shared/EmptyState/` |
| `components/FilterStatus/` | `components/shared/FilterStatus/` |
| `components/LoadingSpinner/` | `components/shared/LoadingSpinner/` |
| `components/Toolbar/` | `components/shared/Toolbar/` |
| `components/ColorSelect/` | `components/tag/ColorSelect/` |

After each move: update all `import` paths that reference the old location.

### Phase B — Storybook title updates

Update `title` in every `.stories.tsx` file:

| File | Old title | New title |
|---|---|---|
| `routes/index.stories.tsx` | `Routes/Pantry` | `Pages/Pantry` |
| `routes/shopping.stories.tsx` | `Routes/Shopping` | `Pages/Shopping` |
| `routes/cooking.stories.tsx` | `Routes/Cooking` | `Pages/Cooking` |
| `routes/items/new.stories.tsx` | `Routes/Items/NewItem` | `Pages/Item/New` |
| `routes/items/$id/index.stories.tsx` | `Routes/Items/Detail` | `Pages/Item/Detail` |
| `routes/items/$id/tags.stories.tsx` | `Routes/Items/Detail/Tags` | `Pages/Item/Detail/Tag` |
| `routes/items/$id/vendors.stories.tsx` | `Routes/Items/Detail/Vendors` | `Pages/Item/Detail/Vendor` |
| `routes/items/$id/recipes.stories.tsx` | `Routes/Items/Detail/Recipes` | `Pages/Item/Detail/Recipe` |
| `routes/items/$id/log.stories.tsx` | `Routes/Items/Log` | `Pages/Item/Detail/Log` |
| `routes/settings/index.stories.tsx` | `Routes/Settings` | `Pages/Settings` |
| `routes/settings/tags/index.stories.tsx` | `Routes/Settings/Tags` | `Pages/Settings/Tag` |
| `routes/settings/tags/$id/index.stories.tsx` | `Routes/Settings/Tags/Detail` | `Pages/Settings/Tag/Detail` |
| `routes/settings/tags/$id/items.stories.tsx` | `Routes/Settings/TagDetail/Items` | `Pages/Settings/Tag/Detail/Item` |
| `routes/settings/vendors/index.stories.tsx` | `Routes/Settings/Vendors` | `Pages/Settings/Vendor` |
| `routes/settings/vendors/new.stories.tsx` | `Routes/Settings/Vendors/New` | `Pages/Settings/Vendor/New` |
| `routes/settings/vendors/$id/index.stories.tsx` | `Routes/Settings/VendorDetail/Info` | `Pages/Settings/Vendor/Detail` |
| `routes/settings/vendors/$id/items.stories.tsx` | `Routes/Settings/VendorDetail/Items` | `Pages/Settings/Vendor/Detail/Item` |
| `routes/settings/recipes/index.stories.tsx` | `Routes/Settings/Recipes` | `Pages/Settings/Recipe` |
| `routes/settings/recipes/new.stories.tsx` | `Routes/Settings/Recipes/New` | `Pages/Settings/Recipe/New` |
| `routes/settings/recipes/$id/index.stories.tsx` | `Routes/Settings/RecipeDetail/Info` | `Pages/Settings/Recipe/Detail` |
| `routes/settings/recipes/$id/items.stories.tsx` | `Routes/Settings/RecipeDetail/Items` | `Pages/Settings/Recipe/Detail/Item` |
| `components/Layout/Layout.stories.tsx` | `Components/Layout` | `Components/Global/Layout` |
| `components/Navigation/Navigation.stories.tsx` | `Components/Navigation` | `Components/Global/Navigation` |
| `components/Sidebar/index.stories.tsx` | `Components/Sidebar` | `Components/Global/Sidebar` |
| `components/PostLoginMigrationDialog/index.stories.tsx` | `Components/PostLoginMigrationDialog` | `Components/Global/PostLoginMigrationDialog` |
| `components/AddNameDialog/AddNameDialog.stories.tsx` | `Components/AddNameDialog` | `Components/Shared/AddNameDialog` |
| `components/DeleteButton/DeleteButton.stories.tsx` | `Components/DeleteButton` | `Components/Shared/DeleteButton` |
| `components/EmptyState/EmptyState.stories.tsx` | `Components/EmptyState` | `Components/Shared/EmptyState` |
| `components/FilterStatus/FilterStatus.stories.tsx` | `Components/FilterStatus` | `Components/Shared/FilterStatus` |
| `components/LoadingSpinner/index.stories.tsx` | `Components/LoadingSpinner` | `Components/Shared/LoadingSpinner` |
| `components/Toolbar/Toolbar.stories.tsx` | `Components/Toolbar` | `Components/Shared/Toolbar` |
| `components/ColorSelect/ColorSelect.stories.tsx` | `Components/ColorSelect` | `Components/Tag/ColorSelect` |
| `components/item/ItemCard/ItemCard.pantry.stories.tsx` | `Components/ItemCard/Pantry` | `Components/Item/ItemCard/Pantry` |
| `components/item/ItemCard/ItemCard.shopping.stories.tsx` | `Components/ItemCard/Shopping` | `Components/Item/ItemCard/Shopping` |
| `components/item/ItemCard/ItemCard.cooking.stories.tsx` | `Components/ItemCard/Cooking` | `Components/Item/ItemCard/Cooking` |
| `components/item/ItemCard/ItemCard.assignment.stories.tsx` | `Components/ItemCard/Assignment` | `Components/Item/ItemCard/Assignment` |
| `components/item/ItemCard/ItemCard.variants.stories.tsx` | `Components/ItemCard/Variants` | `Components/Item/ItemCard/Variants` |
| `components/item/ItemFilters/ItemFilters.stories.tsx` | `Components/ItemFilters` | `Components/Item/ItemFilters` |
| `components/item/ItemForm/ItemForm.stories.tsx` | `Components/ItemForm` | `Components/Item/ItemForm` |
| `components/item/ItemListToolbar/ItemListToolbar.stories.tsx` | `Components/ItemListToolbar` | `Components/Item/ItemListToolbar` |
| `components/item/ItemProgressBar/ItemProgressBar.stories.tsx` | `Components/ItemProgressBar` | `Components/Item/ItemProgressBar` |
| `components/tag/EditTagTypeDialog/EditTagTypeDialog.stories.tsx` | `Components/EditTagTypeDialog` | `Components/Tag/EditTagTypeDialog` |
| `components/tag/TagBadge/TagBadge.stories.tsx` | `Components/TagBadge` | `Components/Tag/TagBadge` |
| `components/tag/TagDetailDialog/TagDetailDialog.stories.tsx` | `Components/TagDetailDialog` | `Components/Tag/TagDetailDialog` |
| `components/tag/TagNameForm/TagNameForm.stories.tsx` | `Components/TagNameForm` | `Components/Tag/TagNameForm` |
| `components/tag/TagTypeDropdown/TagTypeDropdown.stories.tsx` | `Components/TagTypeDropdown` | `Components/Tag/TagTypeDropdown` |
| `components/tag/TagInfoForm/index.stories.tsx` | `Components/TagInfoForm` | `Components/Tag/TagInfoForm` |
| `components/tag/TagTypeInfoForm/index.stories.tsx` | `Components/TagTypeInfoForm` | `Components/Tag/TagTypeInfoForm` |
| `components/vendor/VendorCard/VendorCard.stories.tsx` | `Components/VendorCard` | `Components/Vendor/VendorCard` |
| `components/vendor/VendorNameForm/VendorNameForm.stories.tsx` | `Components/VendorNameForm` | `Components/Vendor/VendorNameForm` |
| `components/vendor/VendorInfoForm/index.stories.tsx` | `Components/VendorInfoForm` | `Components/Vendor/VendorInfoForm` |
| `components/recipe/CookingControlBar/index.stories.tsx` | `Recipe/CookingControlBar` | `Components/Recipe/CookingControlBar` |
| `components/recipe/RecipeCard/RecipeCard.stories.tsx` | `Components/RecipeCard` | `Components/Recipe/RecipeCard` |
| `components/recipe/RecipeNameForm/RecipeNameForm.stories.tsx` | `Components/RecipeNameForm` | `Components/Recipe/RecipeNameForm` |
| `components/recipe/RecipeInfoForm/index.stories.tsx` | `Components/RecipeInfoForm` | `Components/Recipe/RecipeInfoForm` |
| `components/settings/ConflictDialog/index.stories.tsx` | `Settings/ConflictDialog` | `Components/Settings/ConflictDialog` |
| `components/settings/DataModeCard/index.stories.tsx` | `Settings/DataModeCard` | `Components/Settings/DataModeCard` |
| `components/settings/ExportCard/index.stories.tsx` | `Settings/ExportCard` | `Components/Settings/ExportCard` |
| `components/settings/FamilyGroupCard/index.stories.tsx` | `Settings/FamilyGroupCard` | `Components/Settings/FamilyGroupCard` |
| `components/settings/ImportCard/index.stories.tsx` | `Settings/ImportCard` | `Components/Settings/ImportCard` |
| `components/settings/LanguageCard/index.stories.tsx` | `Settings/LanguageCard` | `Components/Settings/LanguageCard` |
| `components/settings/SettingsNavCard/index.stories.tsx` | `Settings/SettingsNavCard` | `Components/Settings/SettingsNavCard` |
| `components/settings/ThemeCard/index.stories.tsx` | `Settings/ThemeCard` | `Components/Settings/ThemeCard` |
| `components/ui/alert-dialog.stories.tsx` | `UI/AlertDialog` | `UI Library/AlertDialog` |
| `components/ui/badge.stories.tsx` | `UI/Badge` | `UI Library/Badge` |
| `components/ui/button.stories.tsx` | `UI/Button` | `UI Library/Button` |
| `components/ui/card.stories.tsx` | `UI/Card` | `UI Library/Card` |
| `components/ui/checkbox.stories.tsx` | `UI/Checkbox` | `UI Library/Checkbox` |
| `components/ui/confirm-dialog.stories.tsx` | `UI/ConfirmDialog` | `UI Library/ConfirmDialog` |
| `components/ui/dialog.stories.tsx` | `UI/Dialog` | `UI Library/Dialog` |
| `components/ui/dropdown-menu.stories.tsx` | `UI/DropdownMenu` | `UI Library/DropdownMenu` |
| `components/ui/input.stories.tsx` | `UI/Input` | `UI Library/Input` |
| `components/ui/label.stories.tsx` | `UI/Label` | `UI Library/Label` |
| `components/ui/progress.stories.tsx` | `UI/Progress` | `UI Library/Progress` |
| `components/ui/select.stories.tsx` | `UI/Select` | `UI Library/Select` |
| `components/ui/switch.stories.tsx` | `UI/Switch` | `UI Library/Switch` |
| `stories/Colors.stories.tsx` | `Design Tokens/Colors` | `Colors` |

### Phase C — CLAUDE.md and docs updates

Update `src/components/CLAUDE.md` to document the new folder structure.
