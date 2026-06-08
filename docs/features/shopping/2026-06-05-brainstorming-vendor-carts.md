# Brainstorming Log — Vendor-Based Carts

**Date:** 2026-06-05
**Topic:** Expanding the single shopping cart into per-vendor carts
**Design doc:** `2026-06-05-vendor-carts-design.md`

---

## Problem Statement (from user)

Currently there is only 1 shopping cart per user. When a user plans a shopping trip across multiple vendors, and items are sold by multiple vendors, they have no way to track which item to buy from which vendor. The cart mixes everything together.

## Proposed Solution (from user)

- Expand to multiple carts, 1 per vendor
- Existing shopping page → vendor cart list page (root)
- New nested route → per-vendor cart page
- Checkout is per-vendor (only checks out the current vendor's cart)

---

## Questions Asked & Answers

**Q1: Items can belong to multiple vendors. If a user checks an item in Vendor A's cart, should it also appear (as checked) in Vendor B's cart — or is each check exclusive to one vendor's cart?**

→ **Independent** — each cart tracks the item separately. An item can be planned in multiple vendor carts simultaneously (e.g. buy 2 from Costco and 3 from iHerb).

*Implication:* Cart items are truly per-vendor. No cross-cart deduplication. The data model needs per-vendor `CartItem` rows, each associated with their vendor's cart.

---

**Q2: What happens to items that have no vendor assigned?**

→ **A separate "No vendor" cart** — special cart card on the root page, URL sentinel `/shopping/no-vendor`, maps to `vendorId: null` in the database.

*Implication:* Items with no vendors are not excluded from shopping — they get their own cart. This maintains parity with the current behaviour where all items can be added to the cart.

---

**Q3: Should an empty vendor cart (no items checked yet) still show as a card?**

→ **Show all vendors, always** — every vendor gets a cart card, even with 0 checked items.

*Implication:* The root page is essentially a vendor list with cart context. Users can browse any vendor's items even if they haven't started planning. This also makes the root page predictable — no cards appearing/disappearing as items are checked.

---

**Q4: Should filter/sort/search controls be available on the per-vendor cart page?**

→ **Keep filter/sort/search** — the vendor cart page has its own filter, sort, and search controls scoped to that vendor's items. The vendor dropdown is removed (redundant when already inside a vendor's cart).

*Implication:* The per-vendor cart page is functionally identical to the current shopping page, minus the vendor dropdown. The three-toolbar layout (back+name / count+actions / filter+sort+search) accommodates this.

---

## Key Decisions Made

1. **Multiple active carts** — the uniqueness constraint shifts from "one active cart per user" to "one active cart per vendor per user"
2. **Migration** — existing active cart becomes the "No vendor" cart; items are not redistributed
3. **Routing** — file-based nested routes: `shopping.tsx` (list) + `shopping.$vendorId.tsx` (per-vendor cart)
4. **"No vendor" sentinel** — literal string `'no-vendor'` in URL, `null` in database
5. **Sort on root page** — last visited (default), alphabetical, most items; "No vendor" always last
6. **`lastVisitedAt`** — tracked on the cart entity, updated on navigation to the vendor cart page
