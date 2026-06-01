# Quick Update Dialog — Implementation Plan

**Date:** 2026-05-31  
**Branch:** `feature/quick-update-dialog`  
**Design doc:** `2026-05-31-quick-update-dialog-design.md`

---

## Step 1 — Create `QuickUpdateDialog` component

**Files to create:**
- `apps/web/src/components/item/QuickUpdateDialog/QuickUpdateDialog.tsx`
- `apps/web/src/components/item/QuickUpdateDialog/index.ts`
- `apps/web/src/components/item/QuickUpdateDialog/QuickUpdateDialog.stories.tsx`
- `apps/web/src/components/item/QuickUpdateDialog/QuickUpdateDialog.stories.test.tsx`

**Implementation:**

1. Component accepts `{ item, isOpen, onClose, onSubmit }` props
2. Internal state: `localPacked`, `localUnpacked`, `isPending`
3. Initialize local state from `item.packedQuantity` / `item.unpackedQuantity` when `isOpen` becomes true (reset on each open)
4. Row layout: two rows (Packed, Unpacked), each with `-` button, number input, `+` button — stepping by `item.consumeAmount`
5. Inputs clamp to `>= 0` on blur; `-` buttons disabled at 0
6. Quick-action buttons: Clear, Fill to Full, Open Package (hidden if no `item.packageUnit`; disabled if `localPacked === 0`)
7. Live progress bar below the actions
8. Cancel and Update buttons in footer; all controls disabled while `isPending`
9. On submit: call `onSubmit({ packedQuantity: localPacked, unpackedQuantity: localUnpacked })`, handle errors

**Stories:**
- Default (single-unit item, small quantities)
- Dual-unit item (shows Open Package button)
- Pending state (simulated submit in-flight)
- At-zero item (Clear and +/- edge cases)
- Full-stock item (Fill to Full is effectively a no-op preview)

**Smoke test:** assert dialog title or an input is visible when `isOpen=true`.

**Verification:**
```bash
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
(cd apps/web && pnpm build-storybook)
(cd apps/web && pnpm check)
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL: deprecated imports found" || echo "OK"
```

---

## Step 2 — Modify `ItemCard` pantry mode

**Files to modify:**
- `apps/web/src/components/item/ItemCard/ItemCard.tsx`
- `apps/web/src/components/item/ItemCard/ItemCard.stories.tsx`

**Implementation:**

1. Add optional prop `onQuickUpdate?: () => void`
2. In pantry mode: remove the two `−` / `+` buttons; render a single icon button (`Pencil` from lucide-react) that calls `onQuickUpdate`
3. Keep `isPending` prop — it still shows a spinner on the icon button while dialog submit is in-flight
4. `onAmountChange` prop can be removed (or kept optional and unused for pantry mode if other modes still use it — check)

> **Note:** verify whether `onAmountChange` is still needed for any non-pantry mode before removing. If shopping/cooking still need it, keep the prop but stop calling it from pantry mode.

**Stories:** update or add a pantry-mode story showing the new icon button instead of +/- pair.

**Verification:** same 5-command gate as Step 1.

---

## Step 3 — Wire `QuickUpdateDialog` into `PantryView`

**Files to modify:**
- `apps/web/src/routes/index.tsx`

**Implementation:**

1. Add state: `const [quickUpdateItemId, setQuickUpdateItemId] = useState<string | null>(null)`
2. Derive `quickUpdateItem`: `items.find(i => i.id === quickUpdateItemId) ?? null`
3. Remove the `onAmountChange` handler body that called `addItem`/`consumeItem` + `updateItem.mutateAsync`
4. Pass `onQuickUpdate={() => setQuickUpdateItemId(item.id)}` to each `<ItemCard>` in pantry mode
5. Still pass `isPending={pendingItemIds.has(item.id)}` (spinner while dialog is submitting)
6. Render after the item list:
   ```tsx
   {quickUpdateItem && (
     <QuickUpdateDialog
       item={quickUpdateItem}
       isOpen={true}
       onClose={() => setQuickUpdateItemId(null)}
       onSubmit={async ({ packedQuantity, unpackedQuantity }) => {
         setPendingItemIds(prev => new Set(prev).add(quickUpdateItem.id))
         try {
           await updateItem.mutateAsync({
             id: quickUpdateItem.id,
             updates: { packedQuantity, unpackedQuantity },
           })
           setQuickUpdateItemId(null)
         } finally {
           setPendingItemIds(prev => {
             const next = new Set(prev)
             next.delete(quickUpdateItem.id)
             return next
           })
         }
       }}
     />
   )}
   ```
7. Remove unused imports (`addItem`, `consumeItem`, `purchaseDate` logic) if they're no longer referenced elsewhere

**Verification:** same 5-command gate, then final E2E run:
```bash
pnpm test:e2e --grep "pantry|items|a11y"
```

---

## Commit Plan

- **Commit 1**: `QuickUpdateDialog` component + stories + smoke test
- **Commit 2**: `ItemCard` pantry-mode changes + updated stories  
- **Commit 3**: `PantryView` wiring (`routes/index.tsx`)
- **Commit 4**: docs (brainstorming log + design doc + this plan + `docs/INDEX.md` update)

---

## docs/INDEX.md Update

Add row in the Pantry section:

| Feature | Design doc | Plan | Status |
|---|---|---|---|
| Quick Update Dialog | 2026-05-31-quick-update-dialog-design.md | 2026-05-31-quick-update-dialog-plan.md | 🔲 Pending |
