# Brainstorming: consumable and non-consumable items

Date: 2026-11-25. Owner and main session.

## The request (owner)

Add an item property **consumable**. Most items are consumable (tissue paper); some are not
(cups, slippers). For a non-consumable item, replace the percentage progress bar with an
amount bar: one square per piece, a fixed size that does not stretch with the card. Add
"consumable" to the item list filters, so the person can focus on consumables while
shopping.

## What the code does today (checked)

| Part | Today |
|---|---|
| Bar | `ItemProgressBar`: segmented up to a target of 30 (`SEGMENTED_MODE_MAX_TARGET`), continuous above. Segments stretch to the card width. A refill tick |
| Filters | `ItemFilters`: vendor, recipe and one dropdown per tag type; `lib/filterUtils.ts` |
| Schema | no such field on `Item` (Prisma, GraphQL, Dexie) |

## Decisions

| # | Question | Answer |
|---|---|---|
| Q1 | Target for non-consumables | **Kept.** Filled squares = in stock, outlined squares = missing up to the target. Low and out of stock still work |
| Q2 | Units | **Whole pieces only.** Measurement units, opened packs and expiration settings are hidden for a non-consumable |
| Q3 | Many pieces | **At most 20 squares, then `+N`.** The card height never changes |
| Q4 | Filter | **A Consumable dropdown on every item list**, default All, remembered like the other filters |
| Q5 | Releases | Two PRs. **PR 1 (server) is released to `main` on its own, soon.** PR 2 (web) goes into `develop` after PR 1 is live, and ships with the next batch release |

See `2026-11-25-item-consumable-design.md`.
