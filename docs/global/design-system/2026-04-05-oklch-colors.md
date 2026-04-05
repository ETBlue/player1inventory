# Implementation Plan: HSL → OKLCH Color Conversion

**Date:** 2026-04-05
**Branch:** docs-readme-rewrite
**Status:** 🔲 Pending

---

## Goal

Convert `apps/web/src/design-tokens/theme.css` from HSL to OKLCH in two phases:

- **Phase A**: Mechanical conversion — same visual appearance, new format. Enables contrast reasoning by inspection via the perceptually uniform `L` channel.
- **Phase B**: Palette redesign — adjust `L` values to guarantee WCAG AA compliance (4.5:1 normal text, 3:1 large text). Some colors will shift slightly.

**Format convention:** `oklch(L% C H)` — L as percentage, C as decimal, H in degrees.
Example: `hsl(40 20% 85%)` → `oklch(86% 0.012 84.6)`

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

function hslToOklch(hslString: string): string {
  // culori parses CSS color strings natively
  const color = parse(hslString)
  if (!color) return hslString
  const ok = clampChroma(oklch(color), 'oklch')
  if (!ok) return hslString
  const l = (ok.l * 100).toFixed(1).replace(/\.0$/, '')
  const c = ok.c.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')
  const h = (ok.h ?? 0).toFixed(1).replace(/\.0$/, '')
  return `oklch(${l}% ${c} ${h})`
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
| `--background-base` (light) | `hsl(40 20% 85%)` | `oklch(86% 0.012 85)` |
| `--importance-primary` (light) | `hsl(180 90% 20%)` | `oklch(40% 0.096 196)` |
| `--hue-red` | `hsl(0 84% 60%)` | `oklch(63% 0.257 29)` |
| `--status-ok` | `hsl(75 60% 45%)` | `oklch(62% 0.147 124)` |
| `--background-elevated` (dark) | `hsl(40 5% 10%)` | `oklch(12% 0.004 84)` |

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

For each semantic text/background pairing, compute the WCAG contrast ratio:

| Foreground token | Background token | Required ratio | Current L delta |
|---|---|---|---|
| `--foreground-default` | `--background-base` | 4.5:1 | to be measured |
| `--foreground-muted` | `--background-base` | 4.5:1 | to be measured |
| `--importance-primary` | `--background-base` | 4.5:1 | to be measured |
| `--importance-destructive` | `--background-base` | 4.5:1 | to be measured |
| `--status-ok` (on tint) | `--status-ok-tint` | 4.5:1 | to be measured |
| `--status-warning` (on tint) | `--status-warning-tint` | 4.5:1 | to be measured |
| `--status-error` (on tint) | `--status-error-tint` | 4.5:1 | to be measured |
| Each hue color (on white) | white (`oklch(100% 0 0)`) | 4.5:1 | to be measured |
| Dark mode equivalents | — | same | to be measured |

Use a script or [oklch.com](https://oklch.com) / browser DevTools to measure.

### Step 2: Define the L budget

Based on the audit, establish target L values per semantic role that guarantee the contrast budget:

```
Light mode backgrounds:  L ≈ 86% / 92% / 96%  (base / surface / elevated)
Light mode text (AA):    L ≤ 46%  (ensures 4.5:1 on 86% background)
Hue colors (on white):  L ≤ 65%  (heuristic; verify per color)
Status colors (on tint): requires per-pair verification
```

### Step 3: Adjust non-compliant values

For each failing token, adjust `L` while preserving `C` and `H` as much as possible to maintain the intended hue character. Apply the same `L` adjustment symmetrically to dark mode.

**Special attention:**
- Yellow (`hsl(48 96% 48%)`) — high chroma yellows are notoriously low contrast on white; L will need to drop to ~55% or below
- Lime — similar issue
- Indigo/purple dark mode tints — may need more chroma reduction

### Step 4: Normalize hue colors to consistent L

Optionally, align all 14 hue "default" colors to a single L value (e.g. `L=60%`) for visual balance. This is cosmetic, not a11y-required.

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
