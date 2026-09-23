# Brainstorming: Refill Threshold Marker

Date: 2026-09-23

## User story

As a home asset manager, I want to see the refill threshold in the item list view,
so that I can know the stock status in quantity (how low the stock is compared to
the refill threshold), not only in quality (by item card colors).

## Starting point

The item card shows `current / target unit` text and a progress bar. The card
color shows the status: red when stock is below the refill threshold, yellow when
it equals the threshold, normal when above. The threshold number itself is not
shown anywhere on the card.

## Questions and answers

| # | Question | Options | Answer |
|---|---|---|---|
| 1 | How should the card show the refill threshold? | Tick marker on the progress bar / text only (`3 / 5 packs · refill at 2`) / both | **Tick marker on the bar** |
| 2 | Where should the marker appear? | Everywhere `ItemProgressBar` is used for an item / item cards only | **Everywhere**: item cards, the Quick Update dialog, and the item Stock tab |
| 3 | Approve the design? | — | **Approved** |

## Decision

Build the marker into `ItemProgressBar` as an optional `refillThreshold` prop, so
every item surface gets it from one implementation. See the
[design doc](2026-09-23-refill-threshold-marker-design.md).

## Rationale

- A marker shows the *distance* to the threshold at a glance. Text makes the user
  compare two numbers.
- The text row is already full on narrow screens (`3 (+1) / 5 packs`). More text
  there can truncate the item name.
- One component means one set of tests, and the same meaning on every surface.
