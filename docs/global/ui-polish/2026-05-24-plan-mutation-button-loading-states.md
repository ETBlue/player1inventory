# Mutation Button Loading States Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add loading spinners and disabled state to all buttons that trigger HTTP mutations beyond form submit buttons (which were already handled in PR #204).

**Architecture:** Three affected pages: shopping, cooking, and shelf detail. For dialog action buttons (shopping abandon/checkout, cooking done), replace Radix `AlertDialogAction` with a regular `Button` component so the dialog stays open during the async mutation (Radix's `AlertDialogAction` auto-closes the dialog on click, so loading state in the dialog would be invisible). For non-dialog buttons in shelf detail, add `isLoading`/`disabled` directly. All three pages already import `Button` from `@/components/ui/button`.

**Tech Stack:** React 19, TypeScript (strict), TanStack Query (local mode) + Apollo GraphQL (cloud mode), Lucide React icons, Radix UI AlertDialog, react-i18next, Vitest + React Testing Library

**Worktree:** `.worktrees/feature-button-loading-states` · **Branch:** `worktree-feature-button-loading-states`

**Status: ✅ Complete** — All three planned tasks implemented. Additional scope delivered beyond the plan:

- **Per-item loading state** (`shopping.tsx`): `Set<string>` tracks pending item IDs; each `ItemCard` gets `disabled` during its own add/remove/update mutation.
- **Post-checkout refetch overlay** (`shopping.tsx`): after checkout completes, a semi-transparent spinner overlays the item list while `refetchItems()` runs.
- **`isFetching` from `useItems`** (`hooks/useItems.ts`): exposed for both local (TanStack `isFetching`) and cloud (Apollo `networkStatus < 7`) modes.
- **Cloud-mode `isPending` fixes** (`hooks/useShoppingCart.ts`): all five cart mutation hooks now return `isPending` in cloud mode.
- **`isCreating` on `ItemListToolbar`** (`ItemListToolbar.tsx` + 6 routes): all item-list pages pass `createItem.isPending` (plus any chained mutation) to suppress the create button during creation.
- **Button `icon` prop** (`components/ui/button.tsx`): new `icon` slot replaces itself with a Loader2 spinner when `isLoading` is true, eliminating double-icon rendering.
- **Checkbox `cursor-pointer`** (`components/ui/checkbox.tsx`): visual affordance on hover.

---

## Background: Why AlertDialogAction Must Be Replaced

Radix's `AlertDialogAction` component inherits from `DialogPrimitive.Close`. When clicked, it calls `context.onOpenChange(false)`, closing the dialog immediately — before any async work in the `onClick` handler completes. This means a loading spinner added to an `AlertDialogAction` would never be visible (the dialog closes before React re-renders with `isLoading: true`).

The fix is to replace `AlertDialogAction` with a regular `Button` component whose `onClick` is `async`, awaits the mutation, then closes the dialog manually via `setShowXxxDialog(false)`. This keeps the dialog open during the pending state, making the loading spinner visible. We also need to prevent the user from escaping the dialog mid-mutation via Escape key or clicking outside.

## File Structure

**Modified files:**
- `apps/web/src/routes/shopping.tsx` — replace `AlertDialogAction` with `Button` in abandon-cart and checkout dialogs; add loading/disabled state; remove now-unused `AlertDialogAction` and `buttonVariants` imports; add `Loader2` import
- `apps/web/src/routes/cooking.tsx` — replace `AlertDialogAction` with `Button` in done dialog; add `isConfirmingDone` local state; add `Loader2` import; remove `setShowDoneDialog(false)` from `handleConfirmDone` (moved to button's onClick)
- `apps/web/src/routes/shelves/$shelfId.tsx` — add loading state to Create and Add-to-shelf buttons; add `Loader2` import

---

## Task 1: Shopping page — abandon cart and checkout dialog loading states

**Files:**
- Modify: `apps/web/src/routes/shopping.tsx`

### Context

`shopping.tsx` has two confirmation dialogs:
1. **Abandon Cart dialog**: confirms clearing the cart. Calls `abandonCart.mutate()`.
2. **Checkout dialog**: confirms completing the shopping trip. Calls `checkout.mutate()`.

Both use `AlertDialogAction` which auto-closes the dialog on click. We replace it with `Button` + async handler that closes the dialog manually after the mutation.

Current imports relevant to this change:
```tsx
import { Check, X } from 'lucide-react'                          // add Loader2
import { Button, buttonVariants } from '@/components/ui/button'   // remove buttonVariants
import {
  AlertDialog,
  AlertDialogAction,                                              // remove this
  AlertDialogCancel,
  AlertDialogContent,
  ...
} from '@/components/ui/alert-dialog'
```

Current abandon cart dialog footer (lines ~367-385 in shopping.tsx):
```tsx
<AlertDialogFooter>
  <AlertDialogCancel>{t('common.back')}</AlertDialogCancel>
  <AlertDialogAction
    className={buttonVariants({ variant: 'destructive' })}
    onClick={() => {
      if (cart)
        abandonCart.mutate(cart.id, {
          onSuccess: () =>
            navigate({
              to: '/shopping',
              search: (prev) => ({ ...prev, vendor: '' }),
              replace: true,
            }),
        })
    }}
  >
    {t('common.confirm')}
  </AlertDialogAction>
</AlertDialogFooter>
```

Current checkout dialog footer (lines ~403-432 in shopping.tsx):
```tsx
<AlertDialogFooter>
  <AlertDialogCancel>{t('common.back')}</AlertDialogCancel>
  <AlertDialogAction
    onClick={() => {
      if (cart) {
        const selectedVendor = vendors.find(
          (v) => v.id === selectedVendorId,
        )
        const note = selectedVendor
          ? t('shopping.log.purchasedAt', {
              vendor: selectedVendor.name,
            })
          : t('shopping.log.purchased')
        checkout.mutate(
          { cartId: cart.id, note },
          {
            onSuccess: () =>
              navigate({
                to: '/shopping',
                search: (prev) => ({ ...prev, vendor: '' }),
                replace: true,
              }),
          },
        )
      }
    }}
  >
    {t('common.confirm')}
  </AlertDialogAction>
</AlertDialogFooter>
```

- [x] **Step 1.1: Update imports**

In `apps/web/src/routes/shopping.tsx`:

Change lucide import from:
```tsx
import { Check, X } from 'lucide-react'
```
to:
```tsx
import { Check, Loader2, X } from 'lucide-react'
```

Change button import from:
```tsx
import { Button, buttonVariants } from '@/components/ui/button'
```
to:
```tsx
import { Button } from '@/components/ui/button'
```

Change alert-dialog import — remove `AlertDialogAction`:
```tsx
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
```

- [x] **Step 1.2: Replace abandon cart dialog action button**

Replace the entire `<AlertDialogContent>` block inside the Abandon Cart `<AlertDialog>` with this updated version. The key changes are: (a) add `onEscapeKeyDown`/`onInteractOutside` to `AlertDialogContent`, (b) replace `AlertDialogAction` with `Button`, (c) use `mutateAsync` + manual close, (d) disable cancel button during pending.

```tsx
{/* Abandon Cart Confirmation Dialog */}
<AlertDialog open={showAbandonDialog} onOpenChange={setShowAbandonDialog}>
  <AlertDialogContent
    onEscapeKeyDown={(e) => {
      if (abandonCart.isPending) e.preventDefault()
    }}
    onInteractOutside={(e) => {
      if (abandonCart.isPending) e.preventDefault()
    }}
  >
    <AlertDialogHeader>
      <AlertDialogTitle>
        {t('shopping.abandonDialog.title')}
      </AlertDialogTitle>
    </AlertDialogHeader>
    <AlertDialogDescription>
      {t('shopping.abandonDialog.description')}
    </AlertDialogDescription>
    <AlertDialogFooter>
      <AlertDialogCancel disabled={abandonCart.isPending}>
        {t('common.back')}
      </AlertDialogCancel>
      <Button
        variant="destructive"
        isLoading={abandonCart.isPending}
        onClick={async () => {
          if (cart) {
            try {
              await abandonCart.mutateAsync(cart.id)
              navigate({
                to: '/shopping',
                search: (prev) => ({ ...prev, vendor: '' }),
                replace: true,
              })
              setShowAbandonDialog(false)
            } catch {
              // mutation failed; dialog stays open so user can retry
            }
          }
        }}
      >
        {t('common.confirm')}
      </Button>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

- [x] **Step 1.3: Replace checkout dialog action button**

Replace the entire `<AlertDialogContent>` block inside the Checkout `<AlertDialog>`:

```tsx
{/* Checkout Confirmation Dialog */}
<AlertDialog
  open={showCheckoutDialog}
  onOpenChange={setShowCheckoutDialog}
>
  <AlertDialogContent
    onEscapeKeyDown={(e) => {
      if (checkout.isPending) e.preventDefault()
    }}
    onInteractOutside={(e) => {
      if (checkout.isPending) e.preventDefault()
    }}
  >
    <AlertDialogHeader>
      <AlertDialogTitle>
        {t('shopping.checkoutDialog.title')}
      </AlertDialogTitle>
    </AlertDialogHeader>
    <AlertDialogDescription>
      {t('shopping.checkoutDialog.description')}
    </AlertDialogDescription>
    <AlertDialogFooter>
      <AlertDialogCancel disabled={checkout.isPending}>
        {t('common.back')}
      </AlertDialogCancel>
      <Button
        isLoading={checkout.isPending}
        onClick={async () => {
          if (cart) {
            const selectedVendor = vendors.find(
              (v) => v.id === selectedVendorId,
            )
            const note = selectedVendor
              ? t('shopping.log.purchasedAt', {
                  vendor: selectedVendor.name,
                })
              : t('shopping.log.purchased')
            try {
              await checkout.mutateAsync({ cartId: cart.id, note })
              navigate({
                to: '/shopping',
                search: (prev) => ({ ...prev, vendor: '' }),
                replace: true,
              })
              setShowCheckoutDialog(false)
            } catch {
              // mutation failed; dialog stays open so user can retry
            }
          }
        }}
      >
        {t('common.confirm')}
      </Button>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

- [x] **Step 1.4: Verify TypeScript and tests pass**

```bash
cd apps/web && pnpm typecheck
cd apps/web && pnpm test
```

Expected: 0 TypeScript errors, all tests pass (1296 tests).

- [x] **Step 1.5: Commit**

```bash
git add apps/web/src/routes/shopping.tsx
git commit -m "feat(shopping): loading state on abandon cart and checkout dialog buttons"
```

---

## Task 2: Cooking page — done dialog loading state

**Files:**
- Modify: `apps/web/src/routes/cooking.tsx`

### Context

`cooking.tsx` has a Done confirmation dialog. When confirmed, `handleConfirmDone` runs multiple sequential `mutateAsync` calls:
1. `updateItem.mutateAsync()` for each consumed item
2. `addInventoryLog.mutateAsync()` for each item
3. `updateRecipeLastCookedAt.mutateAsync()` for each cooked recipe

This can take 2–10+ seconds depending on how many items are being consumed. Currently the dialog auto-closes on action click (Radix behavior), so there's no loading indicator during this time.

The fix adds `isConfirmingDone` local state and replaces `AlertDialogAction` with `Button` so the dialog stays open while mutations run.

**Important:** `handleConfirmDone` currently calls `setShowDoneDialog(false)` at the very end. That line must be removed — the button's async onClick will close the dialog after `handleConfirmDone` resolves.

**Note:** The Cancel dialog (`showCancelDialog`) uses `AlertDialogAction` for `handleConfirmCancel`, which is synchronous state-only (no mutations). That dialog is left unchanged.

Current `handleConfirmDone` ending (the last 4 lines):
```tsx
    setSessionServings(new Map())
    setSessionAmounts(new Map())
    setCheckedItemIds(new Map())
    setShowDoneDialog(false)   // ← REMOVE THIS LINE
  }
```

Current Done dialog footer:
```tsx
<AlertDialogFooter>
  <AlertDialogCancel>{t('common.back')}</AlertDialogCancel>
  <AlertDialogAction onClick={handleConfirmDone}>
    {t('common.confirm')}
  </AlertDialogAction>
</AlertDialogFooter>
```

- [x] **Step 2.1: Add `Loader2` to lucide imports**

In `apps/web/src/routes/cooking.tsx`, change:
```tsx
import { Check, ChevronDown, ChevronLeft, Minus, Plus, X } from 'lucide-react'
```
to:
```tsx
import { Check, ChevronDown, ChevronLeft, Loader2, Minus, Plus, X } from 'lucide-react'
```

- [x] **Step 2.2: Add `isConfirmingDone` state**

After the existing state declarations (near `const [showCancelDialog, setShowCancelDialog] = useState(false)`), add:

```tsx
const [isConfirmingDone, setIsConfirmingDone] = useState(false)
```

- [x] **Step 2.3: Remove `setShowDoneDialog(false)` from `handleConfirmDone`**

The last line inside the `handleConfirmDone` async function is `setShowDoneDialog(false)`. Remove only that line. The rest of the function is unchanged. After the edit, `handleConfirmDone` ends with:

```tsx
    // Reset session state (expand/collapse is preserved)
    setSessionServings(new Map())
    setSessionAmounts(new Map())
    setCheckedItemIds(new Map())
  }
```

- [x] **Step 2.4: Replace Done dialog action button**

Replace the entire `<AlertDialogContent>` block inside the Done `<AlertDialog>` (the first AlertDialog, around line 667):

```tsx
{/* Done Confirmation Dialog */}
<AlertDialog open={showDoneDialog} onOpenChange={setShowDoneDialog}>
  <AlertDialogContent
    onEscapeKeyDown={(e) => {
      if (isConfirmingDone) e.preventDefault()
    }}
    onInteractOutside={(e) => {
      if (isConfirmingDone) e.preventDefault()
    }}
  >
    <AlertDialogHeader>
      <AlertDialogTitle>
        {t('cooking.doneDialog.title', {
          count: recipesBeingConsumed,
          names: selectedRecipeNames.join(', '),
        })}
      </AlertDialogTitle>
    </AlertDialogHeader>
    <AlertDialogDescription>
      {t('cooking.doneDialog.description')}
      {insufficientItems.length > 0 && (
        <span className="block mt-2 text-importance-destructive-foreground">
          {t('cooking.doneDialog.warningHeader')}
          {insufficientItems.map(({ item, requested, available }) => (
            <span key={item.id} className="block">
              {item.name}: {requested} {t('cooking.doneDialog.requested')}
              , {available} {t('cooking.doneDialog.available')}
            </span>
          ))}
        </span>
      )}
    </AlertDialogDescription>
    <AlertDialogFooter>
      <AlertDialogCancel disabled={isConfirmingDone}>
        {t('common.back')}
      </AlertDialogCancel>
      <Button
        isLoading={isConfirmingDone}
        onClick={async () => {
          setIsConfirmingDone(true)
          try {
            await handleConfirmDone()
            setShowDoneDialog(false)
          } catch {
            // mutation failed; dialog stays open so user can retry
          } finally {
            setIsConfirmingDone(false)
          }
        }}
      >
        {t('common.confirm')}
      </Button>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

- [x] **Step 2.5: Verify TypeScript and tests pass**

```bash
cd apps/web && pnpm typecheck
cd apps/web && pnpm test
```

Expected: 0 TypeScript errors, all tests pass.

- [x] **Step 2.6: Commit**

```bash
git add apps/web/src/routes/cooking.tsx
git commit -m "feat(cooking): loading state on done confirmation dialog button"
```

---

## Task 3: Shelf detail page — Create and Add-to-shelf button loading states

**Files:**
- Modify: `apps/web/src/routes/shelves/$shelfId.tsx`

### Context

`shelves/$shelfId.tsx` has two buttons that trigger mutations outside of dialogs:

1. **Create button** (in the search row, visible when a search term is typed and no exact match exists): calls `handleCreateFromSearch(search.trim())` which uses `createItem.mutateAsync()`. 

   Current code (around line 490):
   ```tsx
   {!hasExactMatch && (
     <Button
       variant="primary"
       size="sm"
       onClick={() => handleCreateFromSearch(search.trim())}
       aria-label="Create item"
     >
       <Plus />
       Create
     </Button>
   )}
   ```

2. **Add-to-shelf button** (icon button shown next to each "not in this shelf" item during search, only for `selection` type shelves): calls `handleAddToSelectionShelf(item.id)` which uses `updateShelf.mutate()`.

   Current code (around line 599):
   ```tsx
   {shelf?.type === 'selection' && (
     <Button
       size="icon"
       variant="neutral-outline"
       className="mx-2"
       aria-label={`Add ${item.name} to shelf`}
       onClick={() => handleAddToSelectionShelf(item.id)}
     >
       <ArrowUpFromLine />
     </Button>
   )}
   ```

For these buttons, we render the `Loader2` spinner as the icon child when the mutation is pending, replacing the original icon. This is better than using the `isLoading` prop for icon buttons because `isLoading` prepends a spinner without removing the existing icon, producing two icons side by side.

The `createItem` and `updateShelf` mutations are already instantiated at the top of `ShelfDetailPage` (lines ~82-84):
```tsx
const updateShelf = useUpdateShelfMutation()
const updateItem = useUpdateItem()
const createItem = useCreateItem()
```

Current lucide import:
```tsx
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ArrowUpFromLine,
  Filter,
  Plus,
  Search,
  Settings,
  Tags,
  X,
} from 'lucide-react'
```

- [x] **Step 3.1: Add `Loader2` to lucide imports**

```tsx
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ArrowUpFromLine,
  Filter,
  Loader2,
  Plus,
  Search,
  Settings,
  Tags,
  X,
} from 'lucide-react'
```

- [x] **Step 3.2: Update Create button**

Replace:
```tsx
{!hasExactMatch && (
  <Button
    variant="primary"
    size="sm"
    onClick={() => handleCreateFromSearch(search.trim())}
    aria-label="Create item"
  >
    <Plus />
    Create
  </Button>
)}
```

With:
```tsx
{!hasExactMatch && (
  <Button
    variant="primary"
    size="sm"
    onClick={() => handleCreateFromSearch(search.trim())}
    disabled={createItem.isPending}
    aria-label="Create item"
  >
    {createItem.isPending ? (
      <Loader2 className="h-4 w-4 animate-spin" />
    ) : (
      <Plus />
    )}
    Create
  </Button>
)}
```

- [x] **Step 3.3: Update Add-to-shelf button**

Replace:
```tsx
{shelf?.type === 'selection' && (
  <Button
    size="icon"
    variant="neutral-outline"
    className="mx-2"
    aria-label={`Add ${item.name} to shelf`}
    onClick={() => handleAddToSelectionShelf(item.id)}
  >
    <ArrowUpFromLine />
  </Button>
)}
```

With:
```tsx
{shelf?.type === 'selection' && (
  <Button
    size="icon"
    variant="neutral-outline"
    className="mx-2"
    aria-label={`Add ${item.name} to shelf`}
    onClick={() => handleAddToSelectionShelf(item.id)}
    disabled={updateShelf.isPending}
  >
    {updateShelf.isPending ? (
      <Loader2 className="h-4 w-4 animate-spin" />
    ) : (
      <ArrowUpFromLine />
    )}
  </Button>
)}
```

- [x] **Step 3.4: Verify TypeScript and tests pass**

```bash
cd apps/web && pnpm typecheck
cd apps/web && pnpm test
```

Expected: 0 TypeScript errors, all tests pass.

- [x] **Step 3.5: Commit**

```bash
git add "apps/web/src/routes/shelves/\$shelfId.tsx"
git commit -m "feat(shelves): loading state on Create and Add-to-shelf buttons"
```
