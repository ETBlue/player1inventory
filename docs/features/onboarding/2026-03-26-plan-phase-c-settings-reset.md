# Phase C Implementation Plan — Settings Reset Entry Point

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Add a "Reset & restart onboarding" entry point in Settings that clears all data and redirects to `/onboarding`.

**Design doc:** `docs/features/onboarding/2026-03-26-design-onboarding.md`

**Prerequisite:** Phase B (onboarding flow) must be merged first.

**Tech stack:** React, TanStack Router, Dexie.js, shadcn/ui Dialog, i18n.

---

## Verification Gate (run after every step)

```bash
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-phase-c.log
(cd apps/web && pnpm build-storybook)
(cd apps/web && pnpm check)
grep 'TS6385' /tmp/p1i-phase-c.log && echo "FAIL: deprecated imports" || echo "OK"
```

Final step only — also run:
```bash
pnpm test:e2e --grep "settings|onboarding|a11y"
```

---

## Step 1 — Add `clearAllData` database operation

**Files:**
- Modify: `apps/web/src/db/operations.ts`
- Modify: `apps/web/src/db/operations.test.ts`

**What to do:**

Add a `clearAllData()` function that clears all Dexie tables:
```ts
export async function clearAllData() {
  await db.transaction('rw', db.items, db.tags, db.tagTypes, db.vendors, db.recipes, db.cartItems, db.carts, db.logs, async () => {
    await Promise.all([
      db.items.clear(),
      db.tags.clear(),
      db.tagTypes.clear(),
      db.vendors.clear(),
      db.recipes.clear(),
      db.cartItems.clear(),
      db.carts.clear(),
      db.logs.clear(),
    ])
  })
}
```

Verify the actual table names match what's in `src/db/index.ts` — adjust if needed.

**Tests:**
- `clearAllData removes all items, tags, tagTypes, vendors, recipes, carts, cartItems, and logs`
- `clearAllData leaves the database open and ready for new data`

**Commit:** `feat(db): add clearAllData operation`

---

## Step 2 — Add `useClearAllData` hook

**Files:**
- Modify: `apps/web/src/hooks/index.ts` (or create `apps/web/src/hooks/useClearAllData.ts`)

**What to do:**

```ts
function useClearAllData() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: clearAllData,
    onSuccess: () => {
      queryClient.clear()
    },
  })
}
```

After clearing, invalidate / clear the entire query cache so all `useItems`, `useTags`, etc. hooks re-fetch and return empty arrays — which triggers the onboarding redirect in `__root.tsx`.

**Commit:** `feat(hooks): add useClearAllData hook`

---

## Step 3 — Add Reset card to Settings page

**Files:**
- Modify: `apps/web/src/routes/settings/index.tsx`
- Modify: `apps/web/src/routes/settings/index.stories.tsx`
- Modify: `apps/web/src/routes/settings/index.stories.test.tsx`
- Modify: `apps/web/src/i18n/locales/en.json`
- Modify: `apps/web/src/i18n/locales/tw.json`

**What to do:**

Add a new card/section at the bottom of the Settings page (after Import/Export):

```
┌──────────────────────────────┐
│  ⚠ Reset                     │
│  Clear all data and restart  │
│  onboarding                  │
│                    [Reset →] │
└──────────────────────────────┘
```

Use a destructive / warning visual style (red border or warning icon). The "Reset" button opens a confirmation dialog (Step 4).

i18n keys:
```json
"settings": {
  "reset": {
    "title": "Reset",
    "description": "Clear all data and restart onboarding",
    "button": "Reset",
    "confirm": {
      "title": "Reset all data?",
      "description": "This will permanently delete all your items, tags, vendors, recipes, and purchase history. This cannot be undone.",
      "cancel": "Cancel",
      "confirm": "Reset everything"
    }
  }
}
```

**Stories:** Update the settings `Default` story to show the new reset card.

**Commit:** `feat(settings): add reset card to settings page`

---

## Step 4 — Wire confirmation dialog and clear + redirect

**Files:**
- Modify: `apps/web/src/routes/settings/index.tsx`

**What to do:**

Add local state `showResetDialog: boolean`. When "Reset" button clicked, set `showResetDialog = true`.

Render a confirmation dialog (reuse shadcn/ui `AlertDialog` pattern — same as delete confirmation dialogs used elsewhere):
- Title: "Reset all data?"
- Description: destructive warning text
- Cancel button (neutral)
- Confirm button (destructive variant, red)

On confirm:
1. Call `useClearAllData()` mutation
2. On success: navigate to `/onboarding` (the empty-data redirect in `__root.tsx` would also catch this, but explicit navigation is cleaner)
3. Close dialog

**Tests:** Add integration test:
- `user can reset all data from settings and is redirected to onboarding`

**Commit:** `feat(settings): wire reset confirmation dialog and clear-and-redirect flow`

---

## Final E2E check

```bash
pnpm test:e2e --grep "settings|onboarding|a11y"
```

Fix any failures before marking Phase C complete.
