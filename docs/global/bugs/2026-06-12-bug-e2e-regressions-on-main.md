# Bug: E2E failures on `main` — regressions from recent refactors

**Date:** 2026-06-12
**Branch:** `worktree-fix-e2e-regressions`
**Reported by:** another AI agent ran the full e2e suite on `main` and found 26 failures.

## Summary

A full `pnpm test:e2e` run on `main` failed **26 tests**. Investigation traced them to several
distinct root causes from recent "style"/refactor commits that changed behaviour without updating the
code or tests that depended on it. Fixing the first layer surfaced further cloud-only blockers.

This branch fixes **all of them except #3** (the group-card badge color-contrast WCAG violation), which
is intentionally deferred per maintainer decision — the four group-by a11y tests remain red until a
follow-up addresses the badge text-span colors.

Several were **genuine production bugs**, not stale tests: data export/backup threw, group cards were not
keyboard-accessible, scroll restoration silently saved/restored 0, the settings page crashed in E2E cloud
mode, and cloud vendor mutations failed because the dev server never regenerated the Prisma client.

## Root causes & fixes

### 1. Data export/backup broken (real regression) — ✅ fixed
- **Cause:** `apps/web/src/lib/exportData.ts` queried `db.shoppingCarts.where('status').equals('active')`,
  but the `status` index was dropped in Dexie v13 (permanent carts). Dexie threw `SchemaError`; export aborted.
- **Fix:** export all permanent carts (`db.shoppingCarts.toArray()`), scope cartItems to existing cart ids.
- **Test:** `exportData.test.ts` — local export with permanent carts resolves and includes carts + cartItems.
- **Commit:** `fix(settings): export all permanent carts instead of querying removed status index`

### 1b. Data import broken for permanent carts (real regression) — ✅ fixed
- **Cause:** import re-created sentinel carts with `bulkAdd`, colliding with the app's bootstrap carts →
  Dexie `ConstraintError` aborted the whole import. `toShoppingCartInput` also sent dropped `status`/`createdAt`.
- **Fix:** always upsert carts (never conflict), normalize to `{id, lastPurchasedAt?}`, drop legacy fields.
- **Test:** `importData.test.ts` — import permanent carts over a bootstrapped cart without throwing; updated
  the two stale cart tests to the v13+ shape.
- **Commit:** `fix(settings): import permanent carts via upsert, dropping legacy fields`

### 2. Group cards lost `<button>` role — keyboard a11y regression (real regression) — ✅ fixed
- **Cause:** `GroupCard.tsx` (commit `fa42e857`) replaced the `<button>` name with a clickable `<div>` with
  no `role="button"`/`tabIndex`/key handler. Keyboard users couldn't activate cards; `getByRole('button')` broke.
- **Fix:** `role="button"` + `tabIndex` + `aria-label` + Enter/Space `onKeyDown` (VendorCartCard pattern).
- **Test:** `GroupCard.test.tsx` (new) — button role, accessible name, descendant text, click + keyboard activation.
- **Commit:** `fix(pantry): restore button role and keyboard support on group cards`

### 3. Group-card badge color-contrast WCAG AA violation — ⏸️ DEFERRED (left red)
- **Cause:** commit `49ac7cf9` switched Badges to colored text spans (`text-status-error/warning-foreground`)
  failing AA contrast. axe reports 1 serious violation on group-by pages.
- **Breaks:** a11y `shelves`, `vendor group-by`, `recipe group-by`, mobile `shelves` (×4) — **not fixed.**

### 4. Scroll restoration broken (real regression) — ✅ fixed
- **Cause:** `useScrollRestoration.ts` read/wrote `window.scrollY`, but list views scroll inside an inner
  `[container-type:size]` container (commit `b467b5ef`); the window never scrolls, so it always saved/restored 0.
- **Fix:** the hook takes a scroll-container ref; all 8 callers pass theirs; `LayoutInnerPages` exposes its
  scroller via context for detail-tab routes.
- **Test:** `useScrollRestoration.test.ts` (ref-based); e2e targets `data-testid="pantry-scroll"`.
- **Commit:** `fix(pantry): restore scroll on the inner scroll container, not window`

### 5. Cloud vendor mutations fail — stale Prisma client (real env/build regression) — ✅ fixed
- **Cause:** `apps/server` `dev` = `tsx watch` never runs `prisma generate`. After the `permanent_vendor_carts`
  migration the stale client demanded `Cart.status` on `cart.upsert`, so `createVendor` threw and the dialog
  never redirected.
- **Fix:** add `predev: prisma generate`.
- **Commit:** `fix(server): run prisma generate before dev so the client matches the schema`

### 6. Group-card badge text changed (stale test) — ✅ fixed
- **Cause:** commit `49ac7cf9` changed out-of-stock text `"N out of stock"` → `"N empty"`.
- **Fix:** update `shelves`/`vendors-group`/`recipes-group` assertions to `"N empty"`.
- **Commit:** `test(e2e): align specs with vendor-cart shopping, group-card badges, and cloud setup`

### 7. `item-logs` test missing vendor-cart navigation (stale test) — ✅ fixed
- **Cause:** `/shopping` is a vendor-grouped overview; add-to-cart checkboxes live inside a vendor cart.
- **Fix:** `navigateToVendorCart('no-vendor')` before add-to-cart; assert post-checkout nav back to `/shopping`.
- **Commit:** `test(e2e): align specs with vendor-cart shopping, group-card badges, and cloud setup`

## Additional root causes discovered while fixing the cloud import-export tests

### 8. Settings page crashes in E2E cloud mode (real regression) — ✅ fixed
- **Cause:** `DataModeCard.tsx:308` rendered `CloudModeSection` (calls `useClerk()`) in cloud mode with no
  E2E guard. In E2E test mode there is no `ClerkProvider` (main.tsx), so the hook threw → error boundary →
  no Export/Import cards rendered.
- **Fix:** guard `CloudModeSection` with `!import.meta.env.VITE_E2E_TEST_USER_ID` (same pattern as the header,
  `__root.tsx`, and `settings/index.tsx`).
- **Commit:** `fix(settings): guard CloudModeSection behind ClerkProvider in E2E mode`

### 9. E2E cleanup never deleted shelves (test-infra bug) — ✅ fixed
- **Cause:** the `/e2e/cleanup` endpoint deleted every user-scoped entity except shelves, so shelves
  accumulated in the shared cloud DB and collided by id with imported fixture shelves → spurious
  "Conflicts detected" dialog that hung the cloud import/export tests.
- **Fix:** add `prisma.shelf.deleteMany({ where: { userId } })` to the cleanup transaction.
- **Commit:** `fix(server): delete shelves in the e2e cleanup endpoint`

## Result

- Original 26 failures → only the **4 deferred a11y color-contrast** tests remain red (by decision).
- Full quality gate green: root `pnpm build` (web + server tsc + codegen), `pnpm lint`, `pnpm check`,
  `build-storybook`, 1412 web unit tests.
- Each previously-failing cluster re-run green, including both cloud import-export tests.
