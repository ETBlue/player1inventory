# Empty State Consolidation

## Overview

Audit all empty states across the app, create a shared `EmptyState` component, and apply it consistently. Some pages currently show a blank screen with no content or guidance (e.g. Settings > Tags when no tags exist).

## Motivation

Inconsistent empty states create a confusing experience — especially for new users during onboarding. A consistent, informative empty state with a clear CTA (e.g. "Create your first tag") reduces confusion and guides users to the next action.

## Scope

### Audit
Identify all pages/states that show emptiness:
- Settings > Tags (known: no content at all)
- Settings > Vendors
- Settings > Recipes
- Pantry (no items)
- Shopping (no cart items)
- Cooking (no recipes)
- Item detail tabs (no tags, no vendors, no recipes assigned)

### Shared Component
Create `src/components/ui/EmptyState/index.tsx`:

```tsx
interface EmptyStateProps {
  icon?: ReactNode       // optional illustration or icon
  title: string          // e.g. "No tags yet"
  description?: string   // e.g. "Tags help you organize your pantry"
  action?: ReactNode     // e.g. <Button>Create tag</Button>
}
```

### Application
Replace ad-hoc empty handling (blank renders, `null` returns, placeholder text) with `<EmptyState>` across all audited pages.

## Key Design Decisions (from brainstorming)

- **Shared component** — not just copy updates; a reusable `EmptyState` component
- **UI polish scope** — no data model changes; purely presentational
- **Starting point:** Settings > Tags (most broken — no content at all)
- **i18n:** All empty state strings must go through the i18n system

## Open Questions

- Should empty states include an illustration/icon, or text + CTA only?
- What's the CTA for pages where creation happens elsewhere (e.g. Cooking — recipes are created in Settings)?
- Should the `EmptyState` component be added to Storybook with multiple variants?

## Status

🔲 Pending — no implementation plan yet
