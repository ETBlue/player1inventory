# Brainstorming: Storybook Sidebar & Component File Organization

**Date:** 2026-03-27
**Topic:** Reorganize Storybook sidebar and component files to match a consistent hierarchy

## Problem

Hard to find components in both the codebase and Storybook site. Components are scattered in a flat `components/` directory with inconsistent Storybook `title` values (`Components/Foo`, `Routes/Foo`, `Settings/Foo`, `Recipe/Foo` — no unified top-level hierarchy).

## Questions & Answers

**Q: What hierarchy do you want in the Storybook sidebar?**

A: Organize as:
- Pages (route-based): pantry, shopping, cooking, items, settings
- Components: global / shared / item / tag / vendor / recipe / settings
- UI Library (shadcn/ui primitives)
- Colors (design tokens)

**Q: Should component files be reorganized to match?**

A: Yes — same structure as the Storybook sidebar.

**Q: Where does `LoadingSpinner` go — global or shared?**

A: `shared` (used in multiple places, not a one-time structural component).

**Q: Where does `ColorSelect` go — shared or tag?**

A: `tag` (only used in tag settings).

**Q: Should `ItemCard` nest under `Components/Item/ItemCard/Mode` or stay at `Components/ItemCard/Mode`?**

A: Under the item group: `Components/Item/ItemCard/Mode`.

**Q: `Routes/` → `Pages/`, `UI/` → `UI Library/`, `Design Tokens/Colors` → `Colors/`?**

A: Yes.

**Q: Singular or plural for group names (vendor/vendors, tag/tags, recipe/recipes)?**

A: Singular.

## Decisions

| Topic | Decision |
|---|---|
| Top-level sidebar sections | Pages / Components / UI Library / Colors |
| Components sub-groups | Global / Shared / Item / Tag / Vendor / Recipe / Settings |
| Global components | Layout, Navigation, Sidebar, PostLoginMigrationDialog |
| Shared components | AddNameDialog, DeleteButton, EmptyState, FilterStatus, LoadingSpinner, Toolbar |
| ColorSelect location | Tag group |
| ItemCard sidebar path | Components/Item/ItemCard/Mode |
| Route stories title prefix | Pages/ (was Routes/) |
| UI stories title prefix | UI Library/ (was UI/) |
| Design token story title | Colors (was Design Tokens/Colors) |
| Group name plurality | Singular |
| File structure | Mirrors sidebar hierarchy |
