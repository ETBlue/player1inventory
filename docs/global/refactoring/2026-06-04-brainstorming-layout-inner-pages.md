# Brainstorming: LayoutInnerPages Shared Component

**Date:** 2026-06-04
**Topic:** Extract a shared layout component for level 2+ pages

---

## Questions & Answers

**Q: What is the scope?**
A: Main app (`apps/web`). The design guide documents the layout, but the actual implementation is in the frontend. A shared component ensures the design guide is reflected consistently in code without manual repetition of CSS classes.

**Q: Which pages are level 2+?**
A: All pages except pantry, shopping, cooking, and settings (which have bottom nav / sidebar). Level 2+ pages include all entity detail pages and "new entity" pages.

**Q: What does the shared layout include?**
A: Fixed top bar with:
- Back button (always present)
- Optional entity icon (left of title)
- Page title (flex-1)
- Optional action buttons (right-aligned, no border-bottom)
- Optional nav tabs (with border-bottom, active state, linked to routes)

Scrollable main area beneath the top bar.

**Q: Where does the sidebar appear?**
A: Level 1 only (pantry/shopping/cooking/settings). Not on level 2+ pages.

**Q: Children vs props for dynamic content?**
A: Render children for complex dynamic elements (tabs, actions, main content).

**Q: Do "new" pages share the same structure as detail pages?**
A: Yes — exact same structure.

**Q: Naming for level 1 and level 2+ layouts?**
A: User chose: `LayoutRootPages` (level 1) and `LayoutInnerPages` (level 2+). Only `LayoutInnerPages` is in scope for this branch.

**Q: How does the back button work?**
A: Already implemented in `useAppNavigation.ts`. The `goBack()` function uses `isSamePage()` to skip tab-to-tab navigation within the same entity. Component uses `goBack()` by default; accepts `onBack` override for dirty-state pages.

**Q: Migration order?**
A: TDD. Item pages (new + detail) first. Other pages after confirmation.

---

## Final Decisions

- **Component name:** `LayoutInnerPages`
- **Location:** `src/components/shared/LayoutInnerPages/` (reused across many pages, alongside `Toolbar`)
- **Props API:**
  ```ts
  interface LayoutInnerPagesProps {
    title: ReactNode          // page title
    icon?: ReactNode          // optional entity icon (tags, vendors, recipes have icons)
    onBack?: () => void       // defaults to goBack(); pass handleBackClick for dirty-state pages
    tabs?: ReactNode          // tab links with border-bottom (rendered right of title)
    actions?: ReactNode       // action buttons, right-aligned, no border-bottom
    children: ReactNode       // scrollable main content
  }
  ```
- **Layout CSS:** `h-screen grid grid-rows-[auto_1fr]` (full height, 2 rows: bar + content)
- **Top bar CSS:** `Toolbar` with `w-[100cqw] py-0` override
- **Scroll area CSS:** `overflow-y-auto [container-type:size]`
- **Back button:** Uses `goBack()` from `useAppNavigation('/')`; `lg:w-auto lg:mr-3` for desktop label
