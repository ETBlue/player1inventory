# Shopping Confirmation Dialog Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace browser `confirm()` on the shopping page Cancel button with a proper `AlertDialog`, add a confirmation dialog to the Done button, and remove post-action navigation so the page stays on the shopping page after either action.

**Architecture:** Both dialogs are inline `AlertDialog` components in `shopping.tsx`, each controlled by a dedicated `useState` boolean. This follows the exact same pattern used in `src/routes/settings/vendors/$id.tsx`.

**Tech Stack:** React 19, shadcn/ui `AlertDialog` (Radix UI), TanStack Query mutations

---

### Task 1: Add confirmation dialogs to `shopping.tsx`

**Files:**
- Modify: `src/routes/shopping.tsx`

**Context:**

The current Cancel button uses browser `confirm()`:
```tsx
onClick={() => {
  if (cart && confirm('Abandon this shopping trip?')) {
    abandonCart.mutate(cart.id, {
      onSuccess: () => navigate({ to: '/' }),
    })
  }
}}
```

The current Done button has no confirmation:
```tsx
onClick={() => {
  if (cart) {
    checkout.mutate(cart.id, {
      onSuccess: () => navigate({ to: '/' }),
    })
  }
}}
```

Both navigate to `/` on success — we want them to stay on the shopping page instead.

**Reference pattern** (from `src/routes/settings/vendors/$id.tsx`):
```tsx
const [showDiscardDialog, setShowDiscardDialog] = useState(false)

// Button that opens dialog:
<Button onClick={() => setShowDiscardDialog(true)}>...</Button>

// Dialog at bottom of JSX:
<AlertDialog open={showDiscardDialog} onOpenChange={setShowDiscardDialog}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
      <AlertDialogDescription>
        You have unsaved changes. Discard changes?
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel onClick={cancelDiscard}>Cancel</AlertDialogCancel>
      <AlertDialogAction onClick={confirmDiscard}>Discard</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

---

**Step 1: Add the AlertDialog imports**

In `src/routes/shopping.tsx`, add these imports at the top (after the existing ui imports):

```tsx
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
```

---

**Step 2: Add dialog state variables**

In the `Shopping` function, after the existing state declarations (after `filtersVisible` useState), add:

```tsx
const [showAbandonDialog, setShowAbandonDialog] = useState(false)
const [showCheckoutDialog, setShowCheckoutDialog] = useState(false)
```

---

**Step 3: Update the Cancel button onClick**

Replace the current Cancel button `onClick` handler:

Old:
```tsx
onClick={() => {
  if (cart && confirm('Abandon this shopping trip?')) {
    abandonCart.mutate(cart.id, {
      onSuccess: () => navigate({ to: '/' }),
    })
  }
}}
```

New:
```tsx
onClick={() => setShowAbandonDialog(true)}
```

---

**Step 4: Update the Done button onClick**

Replace the current Done button `onClick` handler:

Old:
```tsx
onClick={() => {
  if (cart) {
    checkout.mutate(cart.id, {
      onSuccess: () => navigate({ to: '/' }),
    })
  }
}}
```

New:
```tsx
onClick={() => setShowCheckoutDialog(true)}
```

---

**Step 5: Add the two AlertDialog components**

Before the final closing `</div>` of the Shopping return, add both dialogs:

```tsx
{/* Abandon Cart Confirmation Dialog */}
<AlertDialog open={showAbandonDialog} onOpenChange={setShowAbandonDialog}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Abandon this shopping trip?</AlertDialogTitle>
      <AlertDialogDescription>
        All items will be removed from the cart.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Go back</AlertDialogCancel>
      <AlertDialogAction
        className={buttonVariants({ variant: 'destructive' })}
        onClick={() => {
          if (cart) abandonCart.mutate(cart.id)
        }}
      >
        Abandon
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>

{/* Checkout Confirmation Dialog */}
<AlertDialog open={showCheckoutDialog} onOpenChange={setShowCheckoutDialog}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Complete shopping trip?</AlertDialogTitle>
      <AlertDialogDescription>
        Quantities will be updated based on your cart.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Go back</AlertDialogCancel>
      <AlertDialogAction
        onClick={() => {
          if (cart) checkout.mutate(cart.id)
        }}
      >
        Done
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

Note: `buttonVariants` must also be imported from `@/components/ui/button`:
```tsx
import { Button, buttonVariants } from '@/components/ui/button'
```

---

**Step 6: Run the dev server and manually test**

```bash
pnpm dev
```

Verify:
1. Add items to cart on the shopping page
2. Click "Cancel" → AlertDialog appears with "Abandon this shopping trip?" title
3. Click "Go back" → dialog closes, cart unchanged
4. Click "Cancel" again → click "Abandon" → cart clears, page stays on `/shopping`
5. Add items to cart again
6. Click "Done" → AlertDialog appears with "Complete shopping trip?" title
7. Click "Go back" → dialog closes, cart unchanged
8. Click "Done" again → click "Done" in dialog → cart resets, page stays on `/shopping`
9. Confirm browser `confirm()` is gone (no system dialog appears)

---

**Step 7: Run the existing tests**

```bash
pnpm test src/routes/shopping.test.tsx
```

Expected: all existing tests pass

---

**Step 8: Commit**

```bash
git add src/routes/shopping.tsx
git commit -m "feat(shopping): replace confirm() with AlertDialog for cancel and done buttons"
```
