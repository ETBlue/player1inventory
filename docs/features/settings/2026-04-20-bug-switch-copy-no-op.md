---
# Bug: Switch→Copy flow does nothing (cloud mode)

## Bug description

In settings, cloud mode: clicking "Switch..." → "Copy" (copy cloud data to local) neither copies the data nor switches the app to local mode.

## Root cause

Same `AlertDialogAction` + `onOpenChange` state-race as the previously-fixed sign-out dialogs.

Both the **family-warn dialog** and the **copy dialog** in the Switch flow chain to a subsequent dialog via `AlertDialogAction`. Radix fires `onClick` first (sets next state), then fires `onOpenChange(false)` via `DialogPrimitive.Close`. React batches both writes; `onOpenChange`'s `setSwitchFlow('idle')` runs last and overwrites the transition state. The next dialog never opens.

Affected: `apps/web/src/components/settings/DataModeCard/DataModeCard.tsx`
- Family-warn dialog `onOpenChange` (line ~157) — chains to `'copy'` via `AlertDialogAction`
- Copy dialog `onOpenChange` (line ~179) — chains to `'conflict'` via `AlertDialogAction`

## Fix applied

Removed `onOpenChange` from family-warn dialog and copy dialog in `DataModeCard.tsx`. Same pattern as the previously-fixed sign-out dialogs. All state transitions driven by button `onClick` handlers; no `onOpenChange` needed on chaining dialogs.

## Test added

Two regression tests added to `index.test.tsx`:
- `shows copy dialog when user clicks Continue in family-warn dialog`
- `shows conflict dialog when user clicks Copy in the copy dialog`

## PR / commit

Commit `a76f896` — `fix(settings): remove onOpenChange race from switch dialogs`
