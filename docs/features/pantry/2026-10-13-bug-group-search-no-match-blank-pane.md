# Bug: searching a populated group for something that matches nothing shows a blank pane

Issue: #267

## Bug Description

Searching inside a group that **has** items, for a query that matches nothing,
renders a completely blank content pane. No list, no tail, no message.

Steps to reproduce:

1. Two locations. A vendor (or recipe, or shelf) with several items stocked at the
   **active** location.
2. Open its detail page. The items list normally.
3. Search for something no item matches, for example `zzz`.
4. The pane goes blank, with no explanation.

All three group detail views behave the same way: `VendorDetailView`,
`RecipeDetailView` and `ShelfDetailView`.

This is **pre-existing**. It behaves the same at `f6d54fd6`, before unified item
search PR C. It is not the `!hasTail` problem that PR #266 fixed — that one was a
genuinely empty group. This one is a populated group with no matches.

## Root Cause

Each of the three views gates its single empty state on the **pre-search** count:

| View | Line | Guard |
|---|---|---|
| `VendorDetailView.tsx` | 347 | `!hasTail && sortedItems.length === 0` |
| `RecipeDetailView.tsx` | 353 | `!hasTail && sortedItems.length === 0` |
| `ShelfDetailView.tsx` | 526 | `!hasTail && sortedInShelfItems.length === 0` |

Three things are then all false or empty at once:

- the pre-search list is not empty, because the group has items, so the empty-state
  block does not render;
- the post-search list **is** empty, so no rows render;
- `hasTail` is false, so no tail renders.

`hasTail` can never be true when the query matches nothing. It comes from
`hasVisibleTail` in `ItemSearchTail.tsx:49-56`, and both of its buckets hold global
items whose name contains the query, minus the page's own list. A query that matches
nothing anywhere leaves both buckets empty. So the blank pane is the guaranteed
result, not a rare race.

## Why no test caught it

Three tests already carry the name of this behaviour, in
`apps/web/src/routes/index.test.tsx`:

> `user sees the empty state, not a blank pane, when a search matches nothing and
> the tail is empty`

At `:1181` (shelf), `:1701` (vendor) and `:2040` (recipe).

**All three build a group with NO items.** With an empty group the pre-search count
is already zero, so the existing guard fires and the message renders. The fixture
cannot tell the broken code from the correct code. The populated-group case is
covered nowhere.

This is the vacuous-fixture failure the root `CLAUDE.md` describes under *Proving a
Test Works*: the fault is in the fixture, not the assertion.

## Fix Applied

*TBD*

## Test Added

*TBD*

## PR / Commit

*TBD*
