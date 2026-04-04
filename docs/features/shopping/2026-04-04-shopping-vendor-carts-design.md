# Shopping — One Cart Per Vendor

## Overview

Restructure the shopping page so that users shop one vendor at a time. A new landing screen shows all vendors with their cart item counts. Tapping a vendor enters a locked single-vendor shopping view.

## Motivation

Real shopping trips are per-store. Mixing all vendors in one list creates cognitive load. Per-vendor checkout makes it natural to "do a Costco run" or "do a grocery run" as discrete actions.

## UX Flow

### Landing Screen (new)
- Route: `/shopping` (replaces current shopping page as the landing)
- Shows a grid of vendor cards, each displaying:
  - Vendor name
  - Number of cart items assigned to that vendor
  - Visual indicator if count > 0 (e.g. badge or highlighted border)
- Vendors with 0 cart items are shown but de-emphasized (or hidden — TBD)
- Tapping a vendor navigates to `/shopping?vendor=<vendorId>`

### Per-Vendor Shopping View
- Route: `/shopping?vendor=<vendorId>` (existing shopping page, vendor locked)
- Top bar shows vendor name + back button (back → `/shopping` landing)
- Vendor filter dropdown is hidden or replaced by the locked vendor name
- All existing shopping features remain (pinning, checkout, tag filter, etc.)
- Checkout only processes items for the selected vendor

### Items in Multiple Vendor Carts
- An item assigned to multiple vendors appears in each vendor's cart
- Checking out vendor A does not remove the item from vendor B's cart
- Each vendor cart tracks its own quantity/pin state independently (or shared — TBD)

## Key Design Decisions (from brainstorming)

- **Per-vendor checkout** is the core feature (not just visual grouping)
- **Landing page is a vendor grid** with item counts
- **Back button** returns to vendor grid
- **Items appear in multiple carts** — no deduplication

## Open Questions

- Do vendors with 0 cart items appear on the landing grid? Hidden? Or shown greyed out?
- Is cart state (item quantities, pin state) shared across vendor views or per-vendor?
- What happens to items with no vendor assigned? Is there an "Unassigned" cart?
- Does checkout clear items from all vendor carts, or only the current vendor's?
- How does this interact with the existing `?vendor` URL param and pinned items logic?
- Mobile layout for the vendor grid — how many columns at 390px?

## Status

🔲 Pending — no implementation plan yet
