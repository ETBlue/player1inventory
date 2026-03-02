# Tag Color Redesign Design

**Date:** 2026-03-02

## Goal

Give tag badges the same selected/unselected visual behavior as vendor and recipe badges in `ItemCard`. Simultaneously restructure the color token system to support dark mode and expand the palette.

## Scope

1. CSS token restructure — merge `colors.css` into `theme.css`, add dark mode support
2. Palette expansion — 4 new hues (brown, lime, cyan, rose), all values in HSL
3. `TagColor` enum — remove tint variants, add new hues
4. `ItemCard` — tag badges switch between tint (unselected) and bold (selected) variants
5. `ColorSelect` — show both unselected and selected previews per color option

---

## Section 1 — CSS Token Restructure

**Delete `colors.css` entirely.** Move all hue color variables into `theme.css`.

**Pattern:** follows the existing two-layer approach already used for semantic colors:
- Internal CSS vars live in `:root` / `.dark` (no `--color-` prefix)
- `@theme inline` maps them to `--color-*` to create Tailwind utilities

```css
/* In :root */
--hue-red: hsl(0 90% 60%);
--hue-red-tint: hsl(0 95% 92.5%);

/* In .dark */
--hue-red: hsl(0 90% 60%);       /* bold unchanged (matches status-ok pattern) */
--hue-red-tint: hsl(0 20% 40%);  /* tint becomes dark/muted */

/* In @theme inline */
--color-red: var(--hue-red);
--color-red-tint: var(--hue-red-tint);
```

This preserves all existing Tailwind utilities (`bg-red`, `bg-red-tint`, `text-dark`, `text-tint`, etc.) with no changes to `badge.tsx` or other components.

**`--color-dark` becomes theme-aware** — it is used as text color on tint-background badges, so it must flip in dark mode:

```css
:root  { --color-dark: hsl(45 5% 20%); }  /* dark text for light tint bg */
.dark  { --color-dark: hsl(45 5% 90%); }  /* light text for dark tint bg */
```

`--color-tint` (white, for text on solid badges) stays white in both modes — unchanged.

All values use **HSL format** (no hex).

---

## Section 2 — Palette Expansion

14 hues total (10 existing + 4 new). All values in HSL.

| Color  | Bold (light/dark same) | Tint light       | Tint dark       |
|--------|------------------------|------------------|-----------------|
| red    | hsl(0 90% 60%)         | hsl(0 95% 92.5%) | hsl(0 20% 40%)  |
| orange | hsl(25 95% 55%)        | hsl(25 95% 92.5%)| hsl(25 20% 40%) |
| amber  | hsl(38 95% 55%)        | hsl(38 95% 92.5%)| hsl(38 20% 40%) |
| yellow | hsl(48 95% 55%)        | hsl(48 95% 92.5%)| hsl(48 20% 40%) |
| green  | hsl(142 70% 45%)       | hsl(142 95% 92.5%)| hsl(142 20% 40%)|
| teal   | hsl(174 75% 40%)       | hsl(174 95% 92.5%)| hsl(174 20% 40%)|
| blue   | hsl(217 90% 60%)       | hsl(217 95% 92.5%)| hsl(217 20% 40%)|
| indigo | hsl(239 85% 65%)       | hsl(239 95% 92.5%)| hsl(239 20% 40%)|
| purple | hsl(270 85% 65%)       | hsl(270 95% 92.5%)| hsl(270 20% 40%)|
| pink   | hsl(330 85% 65%)       | hsl(330 95% 92.5%)| hsl(330 20% 40%)|
| brown  | hsl(30 60% 38%)        | hsl(30 95% 92.5%)| hsl(30 20% 35%) |
| lime   | hsl(82 65% 45%)        | hsl(82 95% 92.5%)| hsl(82 20% 40%) |
| cyan   | hsl(186 90% 42%)       | hsl(186 95% 92.5%)| hsl(186 20% 40%)|
| rose   | hsl(350 85% 60%)       | hsl(350 95% 92.5%)| hsl(350 20% 40%)|

`index.ts` gains entries for brown, lime, cyan, rose. The `ColorName` type updates automatically.

---

## Section 3 — TagColor Enum & Data Migration

**`TagColor` enum:** remove all 10 `x-tint` values, add 4 new hues. 20 values → 14.

```ts
export enum TagColor {
  red = 'red', orange = 'orange', amber = 'amber', yellow = 'yellow',
  green = 'green', teal = 'teal', blue = 'blue', indigo = 'indigo',
  purple = 'purple', pink = 'pink',
  brown = 'brown', lime = 'lime', cyan = 'cyan', rose = 'rose',
}
```

**DB migration:** `migrateTagColorTints()` in `operations.ts` — scans all tag types, maps `x-tint` → `x` for any stored tint values. Called once on mount in the tags settings page, alongside the existing `migrateTagColorsToTypes()` call.

---

## Section 4 — ItemCard Tag Badge Behavior

Add `activeTagIds?: string[]` prop to `ItemCard` (mirrors existing `activeVendorIds` / `activeRecipeIds`).

Tag badge variant switches based on filter state:

```tsx
variant={activeTagIds?.includes(tag.id) ? tagType.color : `${tagType.color}-tint`}
```

- **Unselected:** `x-tint` variant → tint background, bold `x` border, dark text
- **Selected:** `x` variant → bold background, bold `x` border, tint text
- **Border** is always the bold `x` color — already true for both variants in `badge.tsx`, no badge changes needed

When `activeTagIds` is not provided (e.g. pantry page where filtering is by tag type, not individual tags), badges render in their current `x-tint` style (unselected appearance by default).

---

## Section 5 — ColorSelect Upgrade

Remove tint options from the select. Show **14 options**, each previewing both states side-by-side:

```
[ ○ tint-badge  ● bold-badge  color-name ]
```

The select trigger also shows both badges for the currently selected color.

This gives users a clear preview of what tags in that color type will look like when unselected vs. selected as a filter.

---

## Files Affected

| File | Change |
|------|--------|
| `src/design-tokens/colors.css` | Delete |
| `src/design-tokens/theme.css` | Add hue vars in `:root`/`.dark`/`@theme inline`; make `--color-dark` theme-aware |
| `src/design-tokens/index.css` | Remove `colors.css` import |
| `src/design-tokens/index.ts` | Add brown/lime/cyan/rose entries |
| `src/types/index.ts` | Update `TagColor` enum |
| `src/db/operations.ts` | Add `migrateTagColorTints()` |
| `src/routes/settings/tags/index.tsx` | Call migration on mount |
| `src/components/ItemCard.tsx` | Add `activeTagIds` prop, update tag badge variant logic |
| `src/components/ColorSelect.tsx` | Show dual-badge preview per color option |
