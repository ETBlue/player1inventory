# Brainstorming: mark an item as inactive at the current location

Date: 2026-11-26. Design: `2026-11-26-item-stock-active-design.md`. Plan:
`2026-11-26-item-stock-active-plan.md`.

## The request (owner, 2026-11-26)

> mark item as inactive for current location
>
> the problem: currently we depend on target quantity value for active/inactive switch.
> however, there are times that I want to turn an item with a large target quantity to
> inactive or turn it back to active, in this case I'll need to tap on the +/- buttons
> multiple times. also, when turning an item back to active, I may not correctly remember
> what the last target quantity was
>
> the solution: another boolean field for item stock, accessible in both quick edit dialog
> and item page stock tab. render active/inactive style in UI based on this new boolean
> field, instead of taking target quantity values

## Today

"Inactive at this location" means `ItemStock.targetQuantity === 0`. The rule lives in
`isInactive` and `isInactiveHere` (`apps/web/src/lib/quantityUtils.ts`). To make an item
inactive, the person taps the target `−` button down to 0. To make it active again, they
must remember the old target and tap back up to it.

## The main session's proposal

- A per-location boolean on `ItemStock` (`isActive`, default `true`).
- One switch, **Active here**, in the pantry quick edit dialog (`QuickUpdateDialog`) and on
  the item Stock tab (`ItemForm sections={['stock']}`).
- The switch is the ONLY source of "inactive". Every reader of "inactive" moves to it.
- Existing data: every row with `targetQuantity === 0` becomes inactive. This happens in the
  server migration, in a new Dexie version, and on import of an old backup without the field.
- Release: server first (column, backfill, GraphQL, imports, export), then web. Two PRs.

The owner accepted the proposal.

## Questions and answers

| # | Question | Owner answer |
|---|---|---|
| 1 | What does an ACTIVE item with target 0 mean? | "Active, no target." Target 0 no longer means inactive |
| 2 | Can Target and Refill be edited while the item is inactive? | Yes, they stay editable |
| 3 | Does inactive block anything (add to cart, cook, check out)? | No. Inactive is only for the person's focus. It blocks nothing |
| 4 | Is there a switch on the item card too? | No, there is no room on mobile. Only the quick edit dialog and the Stock tab |

## Decision

Build the proposal with the four answers above. The design doc lists every place that reads
"inactive" today and what it reads after the change. A few smaller choices that came up while
reading the code are decided in the design doc, and the ones that need the owner are at its
end as numbered questions.

## Rationale

- A boolean keeps the target. Turning an item back on restores it exactly as it was, with no
  tapping and nothing to remember.
- Per location, because the target is per location too: an item can be active at home and
  inactive at the office.
- The backfill keeps every screen looking the same on the day of the release: every item that
  showed as inactive still does.
