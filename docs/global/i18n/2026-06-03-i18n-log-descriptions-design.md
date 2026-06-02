# i18n: Dynamic Inventory Log Descriptions Design

## Problem

Inventory log entries store their description text as a pre-translated string at write time (e.g. `"purchased at Costco"` in English or `"在 Costco 買的"` in Chinese). When the user later switches their language setting, old log entries remain in the language they were created in — there is no way to re-render them.

## Goal

Log descriptions render dynamically in the user's current language, regardless of what language was active when the log was created.

## Non-Goals

- Migrating existing log entries that already have a `note` string — they continue to display as stored (backward-compatible fallback)
- User-typed free-form notes — all log descriptions are system-generated; no free-text input exists in the current UI

## Data Model Change

Add two optional fields to `InventoryLog` in `packages/types/src/index.ts`:

```ts
export interface InventoryLog {
  id: string
  itemId: string
  delta: number
  quantity: number
  note?: string              // legacy / fallback plain text
  logKey?: string            // i18n key, e.g. "shopping.log.purchasedAt"
  logParams?: Record<string, string>  // interpolation params, e.g. { vendor: "Costco" }
  occurredAt: Date
  createdAt: Date
}
```

`note` is kept for backward compatibility with existing entries. New entries set `logKey`/`logParams` and omit `note`.

## Dexie Schema Bump

The `inventoryLogs` table needs a schema version bump. Since `logKey` and `logParams` are new optional fields on an existing table, the migration is a no-op — Dexie only needs a version number increment to acknowledge the schema change.

## Write Path

Two code sites generate log notes today:

| Site | Current | After |
|------|---------|-------|
| `shopping.tsx` — checkout with vendor | `note: t('shopping.log.purchasedAt', { vendor })` | `logKey: 'shopping.log.purchasedAt', logParams: { vendor }` |
| `shopping.tsx` — checkout without vendor | `note: t('shopping.log.purchased')` | `logKey: 'shopping.log.purchased'` |
| `cooking.tsx` — consume with recipes | `note: t('cooking.log.consumedVia', { recipes })` | `logKey: 'cooking.log.consumedVia', logParams: { recipes }` |
| `cooking.tsx` — consume without recipe match | `note: t('cooking.log.consumedViaRecipe')` | `logKey: 'cooking.log.consumedViaRecipe'` |

The `t()` call moves from write time to render time.

## Read Path

In `apps/web/src/routes/items/$id/log.tsx`, resolve the display text per entry:

```ts
const { t } = useTranslation()

function resolveDescription(log: InventoryLog): string | undefined {
  if (log.logKey) return t(log.logKey, log.logParams)
  return log.note
}
```

Priority: `logKey` → `note` → nothing.

## DB Operations

`addInventoryLog()` in `src/db/operations.ts` (and the matching cloud mutation) must accept and forward the new fields. The signature gains `logKey?: string` and `logParams?: Record<string, string>`.

## No New i18n Keys Required

All four required keys (`shopping.log.purchasedAt`, `shopping.log.purchased`, `cooking.log.consumedVia`, `cooking.log.consumedViaRecipe`) already exist in both `en.json` and `tw.json`.

## Backward Compatibility

| Entry type | `logKey` present | Rendered as |
|---|---|---|
| New entry (post-deploy) | ✅ | `t(logKey, logParams)` — always current language |
| Legacy entry (pre-deploy) | ❌ | `note` string — frozen in creation language |
