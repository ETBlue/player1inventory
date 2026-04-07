# Implementation Plan: HSL → OKLCH Color Conversion

**Date:** 2026-04-05
**Branch:** docs-readme-rewrite
**Status:** ✅ Phase A complete, ✅ Phase B complete

---

## Goal

Convert `apps/web/src/design-tokens/theme.css` from HSL to OKLCH in two phases:

- **Phase A**: Mechanical conversion — same visual appearance, new format. Enables contrast reasoning by inspection via the perceptually uniform `L` channel.
- **Phase B**: Palette redesign — adjust `L` values to guarantee WCAG AA compliance (4.5:1 normal text, 3:1 large text). Some colors will shift slightly.

**Format convention:** `oklch(L% C% H)` — L and C both as percentages, H in degrees.
Example: `hsl(40 20% 85%)` → `oklch(86% 3% 84.6)`

**Scope:** Only `theme.css`. No changes to `index.ts`, `shadows.css`, or `borders.css`.

---

## Phase A — Straight Conversion

### Step 1: Install conversion tooling

Add `culori` as a dev dependency (accurate color space math, widely used):

```bash
pnpm add -D culori @types/culori --filter web
```

### Step 2: Write a conversion script

Create `scripts/convert-hsl-to-oklch.ts` at the monorepo root:

```ts
// scripts/convert-hsl-to-oklch.ts
// Usage: npx tsx scripts/convert-hsl-to-oklch.ts
//
// Reads apps/web/src/design-tokens/theme.css, replaces all hsl(...) values
// with their oklch equivalents. Outputs to stdout for review, or patches
// the file in-place with --write flag.

import { parse, formatCss, oklch, clampChroma } from 'culori'
import { readFileSync, writeFileSync } from 'node:fs'

const filePath = 'apps/web/src/design-tokens/theme.css'
const src = readFileSync(filePath, 'utf8')

// Max OKLCH chroma reference value (CSS Color Level 4 defines C% relative to 0.4)
const C_MAX = 0.4

function hslToOklch(hslString: string): string {
  // culori parses CSS color strings natively
  const color = parse(hslString)
  if (!color) return hslString
  const ok = clampChroma(oklch(color), 'oklch')
  if (!ok) return hslString
  const l = (ok.l * 100).toFixed(1).replace(/\.0$/, '')
  const c = ((ok.c / C_MAX) * 100).toFixed(1).replace(/\.0$/, '')
  const h = (ok.h ?? 0).toFixed(1).replace(/\.0$/, '')
  return `oklch(${l}% ${c}% ${h})`
}

const result = src.replace(
  /hsl\(\s*[\d.]+\s+[\d.]+%\s+[\d.]+%\s*\)/g,
  (match) => hslToOklch(match)
)

if (process.argv.includes('--write')) {
  writeFileSync(filePath, result, 'utf8')
  console.log(`Written: ${filePath}`)
} else {
  console.log(result)
}
```

### Step 3: Run and review

```bash
# Preview the output first
npx tsx scripts/convert-hsl-to-oklch.ts | head -80

# Write in-place once satisfied
npx tsx scripts/convert-hsl-to-oklch.ts --write
```

### Step 4: Spot-check key values

After conversion, verify a representative sample in browser DevTools or an OKLCH picker:

| Token | HSL (before) | Expected OKLCH (approx) |
|---|---|---|
| `--background-base` (light) | `hsl(40 20% 85%)` | `oklch(86% 3% 85)` |
| `--importance-primary` (light) | `hsl(180 90% 20%)` | `oklch(40% 24% 196)` |
| `--hue-red` | `hsl(0 84% 60%)` | `oklch(63% 64% 29)` |
| `--status-ok` | `hsl(75 60% 45%)` | `oklch(62% 37% 124)` |
| `--background-elevated` (dark) | `hsl(40 5% 10%)` | `oklch(12% 1% 84)` |

### Step 5: Update CLAUDE.md

In `apps/web/src/design-tokens/CLAUDE.md`, replace all references to HSL with OKLCH:
- "`:root` defines HSL values" → "`:root` defines OKLCH values"
- Any format examples in the doc

### Step 6: Verification gate

```bash
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
(cd apps/web && pnpm build-storybook)
(cd apps/web && pnpm check)
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL" || echo "OK"
```

### Step 7: Commit

```
refactor(design-tokens): convert color values from hsl to oklch
```

---

## Phase B — Palette Redesign for A11y

> Start only after Phase A is committed and the team has had a chance to work with OKLCH values.

### Step 1: Audit contrast pairs

For each semantic text/background pairing, compute the WCAG contrast ratio.

**Phase B audit results (measured via `scripts/audit-contrast.ts` with culori):**

| Pair | Mode | Before | After | Pass |
|---|---|---|---|---|
| `foreground-default` on `background-base` | light | 7.79:1 | 7.79:1 | ✅ |
| `foreground-muted` on `background-base` | light | 4.75:1 | 4.75:1 | ✅ |
| `foreground-emphasized` on `background-base` | light | 12.03:1 | 12.03:1 | ✅ |
| `importance-primary` on `background-base` | light | 2.79:1 ❌ | 4.53:1 | ✅ |
| `importance-secondary` on `background-base` | light | 3.10:1 ❌ | 4.61:1 | ✅ |
| `importance-destructive` on `background-base` | light | 3.59:1 ❌ | 4.62:1 | ✅ |
| `status-ok` on `status-ok-tint` | light | 2.54:1 ❌ | 4.50:1 | ✅ |
| `status-warning` on `status-warning-tint` | light | 2.64:1 ❌ | 4.65:1 | ✅ |
| `status-error` on `status-error-tint` | light | 3.19:1 ❌ | 4.62:1 | ✅ |
| `status-inactive` on `status-inactive-tint` | light | 3.45:1 ❌ | 4.55:1 | ✅ |
| hue-orange on white | light | 4.27:1 ❌ | 5.22:1 | ✅ |
| hue-amber on white | light | 3.14:1 ❌ | 4.93:1 | ✅ |
| hue-green on white | light | 4.48:1 ❌ | 4.63:1 | ✅ |
| hue-teal on white | light | 3.17:1 ❌ | 4.56:1 | ✅ |
| hue-lime on white | light | 3.06:1 ❌ | 4.60:1 | ✅ |
| hue-cyan on white | light | 3.78:1 ❌ | 4.68:1 | ✅ |
| hue-rose on white | light | 3.69:1 ❌ | 5.36:1 | ✅ |
| `foreground-default` on `background-base` | dark | 12.67:1 | 12.67:1 | ✅ |
| `importance-primary` on `background-base` | dark | 9.99:1 | 9.99:1 | ✅ |
| `status-ok` on `status-ok-tint` | dark | 4.32:1 ❌ | 5.00:1 | ✅ |
| `status-warning` on `status-warning-tint` | dark | 3.89:1 ❌ | 5.40:1 | ✅ |
| `status-error` on `status-error-tint` | dark | 3.58:1 ❌ | 5.94:1 | ✅ |
| `status-inactive` on `status-inactive-tint` | dark | 4.01:1 ❌ | 4.61:1 | ✅ |
| All 12 dark hue colors on dark background | dark | all ✅ | all ✅ | ✅ |

### Step 2: Define the L budget

Established target L values per semantic role:

```
Light mode backgrounds:  L ≈ 89% / 95% / 99%  (base / surface / elevated)
Light mode text (AA):    L ≤ 51%  (ensures 4.5:1 on ~89% background)
Hue colors (light):      L = 55%  (universal target — all 12 hues pass on white)
Hue colors (dark):       L = 75%  (universal target — all 12 hues pass on dark bg)
Status colors:           L ≤ 55% on light tints, L ≥ 78% on dark tints

All C values expressed as % (relative to 0.4 max chroma):
  e.g. C=0.1 → 25%,  C=0.2 → 50%,  C=0.4 → 100%
```

### Step 3: Adjust non-compliant values

For each failing token, adjust `L` while preserving `C` and `H` as much as possible to maintain the intended hue character. Apply the same `L` adjustment symmetrically to dark mode.

**Special attention:**
- Yellow (`hsl(48 96% 48%)`) — high chroma yellows are notoriously low contrast on white; L will need to drop to ~55% or below
- Lime — similar issue
- Indigo/purple dark mode tints — may need more chroma reduction

### Step 4: Normalize hue colors to consistent L

All 12 hue "default" colors are normalized: L=55% in light mode, L=75% in dark mode. This satisfies both visual balance and WCAG AA requirements. The universal L was found by testing all 12 hues — L=55% is the highest value at which every hue passes 4.5:1 on white. L=75% is the target for dark mode (all hues pass by a wide margin at L=75%).

### Step 5: Visual QA

- Open Storybook color showcase page in both light and dark modes
- Verify no color looks dramatically different from the current palette
- Run Playwright a11y scan: `pnpm test:e2e --grep "a11y"`

### Step 6: Verification gate

Same as Phase A, plus:

```bash
pnpm test:e2e --grep "a11y"
```

### Step 7: Update CLAUDE.md

Add a note about the a11y-informed L values in the design token documentation.

### Step 8: Commit

```
refactor(design-tokens): adjust oklch L values for wcag aa compliance
```

---

## Files Affected

| File | Phase A | Phase B |
|---|---|---|
| `apps/web/src/design-tokens/theme.css` | ✅ Rewrite all HSL → OKLCH | ✅ Adjust L values |
| `apps/web/src/design-tokens/CLAUDE.md` | ✅ Update format references | ✅ Add a11y L-budget note |
| `scripts/convert-hsl-to-oklch.ts` | ✅ Create | — |
| `apps/web/src/design-tokens/index.ts` | — no change — | — no change — |
| `apps/web/src/design-tokens/shadows.css` | — no change — | — no change — |
| `apps/web/src/design-tokens/borders.css` | — no change — | — no change — |

---

## Non-Goals

- No changes to component files (the CSS variables are consumed via Tailwind utilities, no change there)
- No changes to `index.ts` (exports color names, not raw values)
- No dark-mode structural changes (keep separate `:root` / `.dark` declarations)
- Phase B does not introduce relative color syntax (`oklch(from var(--x) ...)`) — that can be a future optimization
