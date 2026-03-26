# Brainstorming — Form Validation UX

**Date:** 2026-03-27

---

## User Request

Show validation errors for all forms — render error messages under invalid form inputs so user can see why the Save button is disabled.

---

## Clarifying Q&A

**Q1: When should errors appear?**
A: Immediately on page load (always visible).

**Q2: On blur for individual fields?**
A: No blur — errors show immediately.

**Q3: Should invalid inputs get a visual error state (red border)?**
A: Yes — red border/ring on the input + text message below.

**Q4: Introduce a validation library (react-hook-form + zod) or keep manual validation?**
A: Manual. Validation rules already exist; the cost of introducing a library is mostly refactoring, not new capability.

---

## Approaches Considered

**A — Derive errors inline at render time** *(chosen)*
Compute errors as a derived `const` from current field values. Pass `error` prop to each field. No separate state, always in sync.

**B — Track errors in component state**
Store `errors: Record<string, string>` in state, recompute via useEffect. Rejected: errors are fully derivable from values, so state is redundant complexity.

**C — Add `error` prop to Input only, no shared pattern**
Minimal change to shared components, but no consistency — each form invents its own logic independently.

---

## Final Decisions

1. Approach A — inline derivation, no new state
2. No validation library — keep existing manual validation
3. `Input` component gets `error?: string` prop that renders red border + message below
4. All 5 forms updated: ItemForm, VendorNameForm, RecipeNameForm, TagNameForm, AddNameDialog
5. Existing `validationMessage` block below Save in ItemForm removed (superseded)
