# Shopping Confirmation Dialog Design

**Date:** 2026-02-21
**Status:** Approved

## Overview

Replace the browser `confirm()` dialog on the shopping page Cancel button with a proper `AlertDialog` component. Also add a confirmation dialog to the Done button, which currently has no confirmation. After confirming either action, the page stays on the shopping page (no navigation to home).

## Behavior

### Cancel button (Abandon cart)

- Clicking "Cancel" opens an abandon confirmation dialog
- Dialog title: "Abandon this shopping trip?"
- Dialog description: "All items will be removed from the cart."
- "Go back" button (cancel): closes dialog, nothing happens
- "Abandon" button (confirm): calls `abandonCart.mutate(cart.id)` with no `onSuccess` navigation
- After abandoning: cart section disappears, items return to pending section — fresh shopping page state

### Done button (Checkout)

- Clicking "Done" opens a checkout confirmation dialog
- Dialog title: "Complete shopping trip?"
- Dialog description: "Quantities will be updated based on your cart."
- "Go back" button (cancel): closes dialog, nothing happens
- "Done" button (confirm): calls `checkout.mutate(cart.id)` with no `onSuccess` navigation
- After checkout: cart resets to fresh empty state — cart section disappears, items return to pending section

## Implementation

**File changed:** `src/routes/shopping.tsx` only

**Approach:** Two separate `AlertDialog` components inline in `Shopping`, each controlled by its own `useState` boolean.

**Changes:**
1. Add two state variables: `showAbandonDialog` and `showCheckoutDialog`
2. Cancel button `onClick`: set `showAbandonDialog = true` (replaces current `confirm()` + navigate-on-success)
3. Done button `onClick`: set `showCheckoutDialog = true` (replaces current navigate-on-success)
4. Remove `onSuccess: () => navigate({ to: '/' })` from both mutate calls
5. Add two `AlertDialog` JSX blocks at bottom of return, following the pattern in `vendors/$id.tsx`
6. Import `AlertDialog` family from `@/components/ui/alert-dialog`

**Note:** `useNavigate` stays — it's still used for the vendor management redirect in the vendor select dropdown.

## Pattern Reference

Follows the exact `AlertDialog` usage pattern established in `src/routes/settings/vendors/$id.tsx` (discard confirmation dialog).
