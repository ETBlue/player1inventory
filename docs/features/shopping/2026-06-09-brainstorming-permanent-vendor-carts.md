# Brainstorming: Permanent Vendor Carts

**Date:** 2026-06-09  
**Related plan:** `2026-06-09-permanent-vendor-carts-plan.md`

---

## Context

After implementing Phase 7 (cloud mode GraphQL/Prisma for vendor carts), the multiple-cart model proved wrong. The current model creates a new cart each time a user checks out, keeping completed carts forever for history. This complicates the data model, causes stale-count bugs, and makes the "last purchased" sort require querying completed carts.

The proposed redesign makes carts permanent and 1:1 with vendors.

---

## Questions and Answers

**Q1: How should we track "last purchased" sort data if carts no longer have status/completedAt?**  
→ Keep a `lastPurchasedAt` timestamp on the cart. Updated at checkout. No separate history table needed.

**Q2: Does cart status go away?**  
→ Yes. Status is derived from cart item count (any items with quantity > 0 → "shopping"). No `status` field stored.

**Q3: Should the no-vendor cart also be permanent?**  
→ Yes. Created at app startup if missing. ID = `'no-vendor'` (matches URL sentinel).

**Q4: Do pinned items (quantity = 0) survive checkout?**  
→ Yes. Checkout clears only items with `quantity > 0`. Pinned items remain.

**Q5: What does Abandon do with the new model?**  
→ Clears ALL items (including pinned). Does not update `lastPurchasedAt`.

**Q6: What ID does the no-vendor cart use?**  
→ `'no-vendor'` — matches the URL sentinel already in use.

**Q7: When are carts created?**  
→ Same transaction as vendor creation. For legacy vendors (no cart yet), bootstrap at app startup.

**Q8: What happens to existing cart data during migration?**  
→ Active carts: move items to permanent vendor cart.  
→ Completed carts: extract `completedAt` → write to `lastPurchasedAt` on permanent cart → delete.  
→ Abandoned carts: delete.

---

## Final Decisions

| Concern | Decision |
|---|---|
| Cart ID | = vendor ID; `'no-vendor'` for null-vendor |
| Lifecycle | Created with vendor, deleted with vendor |
| No-vendor cart | Permanent, ID = `'no-vendor'`, created at bootstrap |
| Bootstrap | On app startup: create carts for any vendor without one |
| Last purchased | `lastPurchasedAt?: Date` on cart, updated at checkout |
| Status field | Removed — derived from `cartItems.some(ci => ci.quantity > 0)` |
| Checkout | Clear `quantity > 0` items; keep `quantity === 0` (pinned) |
| Abandon | Clear ALL items; no `lastPurchasedAt` update |
| Migration | Move active items; extract lastPurchasedAt from completed; delete old records |

---

## Rationale

Permanent carts eliminate the entire "stale cache after create" class of bugs (the root cause of several Phase 7 regressions). The data model becomes simpler: one cart per vendor, always exists, never created on demand. `lastPurchasedAt` on the cart is sufficient for sort without querying history.
