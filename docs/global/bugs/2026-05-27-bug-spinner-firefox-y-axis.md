# Bug: Loading Spinner Rotates on Y Axis in Firefox (Production Only)

## Bug Description

On production, the `LoadingSpinner` component (and other `animate-spin` uses on SVG icons) rotates around the Y axis in Firefox on macOS — a door-opening/coin-flip effect — instead of the expected Z-axis spin. The same production build renders correctly in Safari on iOS. Local dev server works correctly in all browsers.

## Root Cause

Firefox computes CSS `transform` on SVG elements relative to the SVG viewport reference box by default (`transform-box: view-box`), not the element's own bounding box. When an ancestor has `container-type: size` (which implies `contain: layout size style`), Firefox's compositing path anchors the transform at the SVG viewport edge instead of the element center. The result: `rotate(360deg)` looks like a Y-axis rotation because the effective pivot is off-center.

Safari uses a different SVG compositing path and is unaffected. Local dev works because Vite's dev-mode CSS injection order differs from the production bundle, avoiding the cascade order that triggers the Firefox bug.

Affected elements: all places where `animate-spin` (or any CSS `transform`) is applied directly to a Lucide React SVG icon inside the `container-type: size` layout.

## Fix Applied

Added `[transform-box:fill-box]` to every Lucide SVG icon that has `animate-spin`:
- `apps/web/src/components/shared/LoadingSpinner/LoadingSpinner.tsx` — `<Loader2>`
- `apps/web/src/components/shared/DeleteButton/DeleteButton.tsx` — `<Loader2>`
- `apps/web/src/components/ui/button.tsx` — `<Loader2>` (isLoading state)
- `apps/web/src/components/ui/sonner.tsx` — `<LoaderCircle>`

## Test Added

`apps/web/src/components/shared/LoadingSpinner/index.stories.test.tsx` — new case asserts the rendered SVG's class attribute includes `[transform-box:fill-box]`. Uses `getAttribute('class')` (not `.className`) because SVG elements return `SVGAnimatedString`, not a plain string.

## PR / Commit

Commit `8ccece93` — `fix(spinner): add transform-box:fill-box to fix Firefox SVG rotation axis`
PR: TBD
