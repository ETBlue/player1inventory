---
# Bug: Auto-migration skipped when migration-prompted already set

## Bug description

In Settings → local mode → "Switch..." → "Yes, copy data" → any strategy button: no HTTP request is sent and the "Copying local data to cloud…" progress dialog never appears.

## Root cause

`doEnableSwitch()` in `DataModeCard.tsx` stores the `migration-strategy` key in localStorage but does NOT clear the `migration-prompted` key.

In `usePostLoginMigration`, the guard `if (localStorage.getItem(MIGRATION_PROMPTED_KEY)) return` runs **before** checking `migration-strategy`. If `migration-prompted` was set in a previous session (from any prior cloud-mode visit, or from previously clicking "Switch without copying"), the auto-migration branch is never reached — `importCloudData` is never called and the dialog never renders.

Affected: `apps/web/src/components/settings/DataModeCard/DataModeCard.tsx` — `doEnableSwitch()`

## Fix applied

Added `localStorage.removeItem(MIGRATION_PROMPTED_KEY)` in `doEnableSwitch()` when a strategy is stored. This ensures `usePostLoginMigration` can proceed past its early-return guard on the next cloud-mode load.

## Test added

Regression test in `index.test.tsx`: `'clears migration-prompted when storing a strategy so auto-migration can run'` — seeds a stale `migration-prompted` key, walks through the full Switch flow, asserts the key is cleared and `migration-strategy` is stored.

## PR / commit

Commit `b500cc9` — `fix(settings): clear migration-prompted when storing copy strategy`
