# Plan: UnitBadge + UnitInline Component Extraction

**Date:** 2026-06-10
**Branch:** refactor/unit-badge
**Brainstorming:** [2026-06-10-brainstorming-unit-badge.md](2026-06-10-brainstorming-unit-badge.md)
**Status:** ✅ Implemented

---

## Goal

Extract two shared components to unify unit label rendering:

- **`UnitBadge`** — bordered pill for card/dialog contexts (ItemCard, GroupCard, QuickUpdateDialog)
- **`UnitInline`** — parenthesized inline text for form label contexts (ItemForm)

---

## Background

Unit labels are currently raw `<span>` elements with inconsistent classes:

| File | Classes |
|------|---------|
| `ItemCard.tsx:219` | `px-1 text-xs text-foreground-muted border-1 border-foreground-muted opacity-75` |
| `GroupCard.tsx:64` | `px-1 text-xs text-foreground-muted border border-foreground-muted` |
| `QuickUpdateDialog.tsx:300` | `px-1 border-1 border-foreground-muted opacity-75` (missing `text-xs text-foreground-muted`) |
| `ItemForm.tsx` (multiple) | `text-xs font-normal` inline label spans |

---

## Phase 1 — A11y Audit + Create Components

### 1.1 A11y audit for `opacity-75`

Check the contrast ratio of `--foreground-muted` at 75% opacity against the card background:

1. Read `apps/web/src/design-tokens/` to find `--foreground-muted` value
2. Read card background token
3. Compute effective color at 75% opacity blended against background
4. Check against WCAG AA threshold for small text (4.5:1)
5. **Decision:** if passes → include `opacity-75` in UnitBadge and document in design guide; if fails → omit it everywhere

### 1.2 Create `UnitBadge`

**File:** `apps/web/src/components/shared/UnitBadge/UnitBadge.tsx`

```tsx
interface UnitBadgeProps {
  unit?: string
}

export function UnitBadge({ unit = 'pack' }: UnitBadgeProps) {
  return (
    <span className="px-1 text-xs text-foreground-muted border border-foreground-muted [opacity-75-if-passes-a11y]">
      {unit}
    </span>
  )
}
```

Also create:
- `index.ts` barrel
- `UnitBadge.stories.tsx` — stories: default (no unit → "pack"), with explicit unit, with long unit string
- `UnitBadge.stories.test.tsx` — smoke test asserting rendered text

### 1.3 Create `UnitInline`

**File:** `apps/web/src/components/shared/UnitInline/UnitInline.tsx`

```tsx
interface UnitInlineProps {
  unit?: string
  placeholder?: string
}

export function UnitInline({ unit, placeholder = 'pack' }: UnitInlineProps) {
  return (
    <span className="text-xs font-normal">({unit ?? placeholder})</span>
  )
}
```

Also create:
- `index.ts` barrel
- `UnitInline.stories.tsx` — stories: with unit, without unit (default "pack"), with placeholder "?"
- `UnitInline.stories.test.tsx` — smoke test asserting rendered text with parens

**Verification gate after Phase 1:**
```bash
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
(cd apps/web && pnpm build-storybook)
(cd apps/web && pnpm check)
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL" || echo "OK"
```

---

## Phase 2 — Replace Usage Sites

### 2.1 Replace in `ItemCard`

**File:** `apps/web/src/components/item/ItemCard/ItemCard.tsx`

Replace lines ~219–221:
```tsx
// Before:
<span className="px-1 text-xs text-foreground-muted border-1 border-foreground-muted opacity-75">
  {unitLabel}
</span>

// After:
<UnitBadge unit={unitLabel} />
```

Add import: `import { UnitBadge } from '@/components/shared/UnitBadge'`

### 2.2 Replace in `GroupCard`

**File:** `apps/web/src/components/shared/GroupCard/GroupCard.tsx`

Replace the hardcoded `"pack"` span:
```tsx
// Before:
<span className="px-1 text-xs text-foreground-muted border border-foreground-muted">
  pack
</span>

// After:
<UnitBadge />
```

### 2.3 Replace in `QuickUpdateDialog`

**File:** `apps/web/src/components/item/QuickUpdateDialog/QuickUpdateDialog.tsx`

Replace lines ~300–302:
```tsx
// Before:
<span className="px-1 border-1 border-foreground-muted opacity-75">
  {unitLabel}
</span>

// After:
<UnitBadge unit={unitLabel} />
```

### 2.4 Replace in `ItemForm`

**File:** `apps/web/src/components/item/ItemForm/ItemForm.tsx`

Replace all inline unit label spans. Mapping:

| Current pattern | Replacement |
|----------------|-------------|
| `<span className="text-xs font-normal">({packageUnit \|\| DEFAULT_PACKAGE_UNIT})</span>` | `<UnitInline unit={packageUnit \|\| undefined} />` |
| `<span className="text-xs font-normal">({targetUnit === 'measurement' ? measurementUnit : packageUnit \|\| DEFAULT_PACKAGE_UNIT})</span>` | `<UnitInline unit={targetUnit === 'measurement' ? measurementUnit : packageUnit \|\| undefined} />` |
| `<span className="text-xs font-normal">({measurementUnit \|\| '?'})</span>` | `<UnitInline unit={measurementUnit \|\| undefined} placeholder="?" />` |

Add import: `import { UnitInline } from '@/components/shared/UnitInline'`

**Note:** Pass `undefined` (not empty string) when the unit is falsy so the component's default/placeholder kicks in correctly.

**Verification gate after Phase 2:**
```bash
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
(cd apps/web && pnpm build-storybook)
(cd apps/web && pnpm check)
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL" || echo "OK"
```

---

## Phase 3 — Documentation

### 3.1 Design guide entry (if `opacity-75` kept)

Add a note to `apps/design/src/content/docs/` explaining that UnitBadge renders at 75% opacity — a deliberate de-emphasis since units are contextual metadata, not primary content. Reference the WCAG contrast audit result.

### 3.2 Update `apps/web/src/components/CLAUDE.md`

Add entries for `UnitBadge` and `UnitInline` under the Shared Components section.

### 3.3 Update `docs/INDEX.md`

Mark this plan as ✅ Implemented when done.

**Final E2E gate:**
```bash
pnpm test:e2e --grep "pantry|shopping|items|a11y"
```

---

## Files Touched

| File | Change |
|------|--------|
| `src/components/shared/UnitBadge/UnitBadge.tsx` | New |
| `src/components/shared/UnitBadge/index.ts` | New |
| `src/components/shared/UnitBadge/UnitBadge.stories.tsx` | New |
| `src/components/shared/UnitBadge/UnitBadge.stories.test.tsx` | New |
| `src/components/shared/UnitInline/UnitInline.tsx` | New |
| `src/components/shared/UnitInline/index.ts` | New |
| `src/components/shared/UnitInline/UnitInline.stories.tsx` | New |
| `src/components/shared/UnitInline/UnitInline.stories.test.tsx` | New |
| `src/components/item/ItemCard/ItemCard.tsx` | Replace unit span |
| `src/components/shared/GroupCard/GroupCard.tsx` | Replace unit span |
| `src/components/item/QuickUpdateDialog/QuickUpdateDialog.tsx` | Replace unit span |
| `src/components/item/ItemForm/ItemForm.tsx` | Replace unit label spans |
| `src/components/CLAUDE.md` | Document UnitBadge + UnitInline |
| `apps/design/src/content/docs/` | Design guide entry (opacity note if applicable) |
| `docs/INDEX.md` | Status update |
