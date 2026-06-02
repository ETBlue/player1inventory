# i18n: Dynamic Inventory Log Descriptions — Implementation Plan

See design doc: `2026-06-03-i18n-log-descriptions-design.md`

## Steps

### Step 1 — Types & DB schema

**Files:**
- `packages/types/src/index.ts` — add `logKey?: string` and `logParams?: Record<string, string>` to `InventoryLog`
- `apps/web/src/db/index.ts` (or wherever the Dexie schema version lives) — bump schema version for `inventoryLogs` table

**Acceptance:** `pnpm build` passes with no type errors.

---

### Step 2 — DB operations

**Files:**
- `apps/web/src/db/operations.ts` — update `addInventoryLog()` to accept `logKey?` and `logParams?`, persist them
- `apps/web/src/db/operations.test.ts` — add/update tests: verify `logKey`/`logParams` round-trip through `addInventoryLog`

**Acceptance:** `pnpm test` passes; new fields are persisted and retrievable.

---

### Step 3 — Write path: shopping

**Files:**
- `apps/web/src/routes/shopping.tsx` — replace `note: t('shopping.log.purchasedAt', { vendor })` and `note: t('shopping.log.purchased')` with `logKey`/`logParams`; remove the `t()` import if no longer needed for notes

**Acceptance:** Checkout creates logs with `logKey` set; `note` is omitted for new entries.

---

### Step 4 — Write path: cooking

**Files:**
- `apps/web/src/routes/cooking.tsx` — replace `note: t('cooking.log.consumedVia', { recipes })` and `note: t('cooking.log.consumedViaRecipe')` with `logKey`/`logParams`

**Acceptance:** Recipe consumption creates logs with `logKey` set.

---

### Step 5 — Read path: log display

**Files:**
- `apps/web/src/routes/items/$id/log.tsx` — add `useTranslation()`, resolve description via `logKey` → `note` fallback, render result

**Acceptance:** Log entries with `logKey` render in current language; legacy entries with only `note` still render their stored string.

---

### Step 6 — Stories & tests

**Files:**
- Log display stories (`.stories.tsx`) — add stories with `logKey`+`logParams` set; add story with only `note` (legacy fallback)
- Log display smoke test (`.stories.test.tsx`) — assert description text renders

**Acceptance:** Storybook builds; smoke tests pass.

---

### Step 7 — Verification gate

```bash
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
(cd apps/web && pnpm build-storybook)
(cd apps/web && pnpm check)
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL" || echo "OK"
pnpm test:e2e --grep "shopping|cooking|items|a11y"
```

All must pass before finishing the branch.
