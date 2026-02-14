# player1inventory
Player 1 Inventory is built for players pursuing ultimate real life assets management. Designed by ETBlue.

## Migration to Dual-Unit Tracking (v2)

The app now supports dual-unit tracking for items (e.g., bottles of 1L milk). Existing items will be automatically migrated on app start:

- Old `unit` field → `packageUnit`
- `targetQuantity` → `packedQuantity`
- New field defaults: `unpackedQuantity = 0`, `consumeAmount = 1`, `targetUnit = 'package'`

No data loss. Backwards compatible with existing workflows.
