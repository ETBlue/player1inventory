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

**Both halves were needed. Doing only one is a trap.**

1. The guard now reads the **post**-search list.
2. A nested ternary picks the message off the **pre**-search list, so a populated
   group gets a second, different message.

Widening the guard alone would have made the block print "No items are assigned to
this vendor" while items **are** assigned and merely do not match the query. That
trades a blank pane for a false statement, which is not an improvement.

The arrangement copied is `apps/web/src/routes/shopping/$vendorId.tsx` — one guard
on the post-search list, a nested ternary choosing the copy. `PantryListView.tsx`
uses a ternary chain instead, which would have pushed the whole item list into a
third arm.

| View | Guard before | Guard after |
|---|---|---|
| `VendorDetailView.tsx` | `!hasTail && sortedItems.length === 0` | `!hasTail && displayedItems.length === 0` |
| `RecipeDetailView.tsx` | `!hasTail && sortedItems.length === 0` | `!hasTail && displayedItems.length === 0` |
| `ShelfDetailView.tsx` | `!hasTail && sortedInShelfItems.length === 0` | `!hasTail && displayedInShelfItems.length === 0` |

**`ShelfDetailView` keeps all four of its states.** Its existing message already
branched three ways — `isUnsorted`, then `shelf?.type === 'filter'`, then the
selection-shelf default. The no-match case is a fourth state beside those three, not
a replacement for one of them.

**`ShelfDetailView` also needed a fifth state the other two do not.** Its toolbar is
`hideFiltersToggle={!isUnsorted}`, so on the `unsorted` page the list is narrowed by
the tag / vendor / recipe filters as well, with no search running. A message naming a
search would be false there, so its no-match description picks between
`pantry.detail.noMatch.shelf` (a search is live) and
`pantry.detail.noMatch.shelfFilters` (it is not). That filter case was its own blank
pane before this fix, with the same three conditions true at once. The vendor and
recipe views pass `hideFiltersToggle={true}` and narrow by search only, so they need
no such branch.

### i18n

All ten strings in the three blocks were hardcoded English, so the whole block
rendered in English for a Traditional Chinese user. They are now translated, together
with the new no-match copy, in a new `pantry.detail.*` namespace — 13 keys in
`apps/web/src/i18n/locales/en.json` and the same 13 in `tw.json`. The namespace is new
because `pantry.*` had no key for the detail views at all.

| Key | English | Traditional Chinese |
|---|---|---|
| `noItems` | No items | 沒有品項 |
| `vendor.allAssigned` | All items are assigned to vendors | 沒有未指定供應商的品項 |
| `vendor.noneAssigned` | No items are assigned to this vendor | 沒有任何品項指定給這個供應商 |
| `recipe.allAssigned` | All items are assigned to recipes | 沒有未加入食譜的品項 |
| `recipe.noneAssigned` | No items are assigned to this recipe | 沒有任何品項加入這個食譜 |
| `shelf.allAssigned` | All items are assigned to shelves | 沒有未放上貨架的品項 |
| `shelf.noFilterMatch` | No items match the filter | 沒有符合篩選條件的品項 |
| `shelf.searchToAdd` | Search to add items to this shelf | 可以透過搜尋功能新增品項到這個貨架 |
| `noMatch.title` | No matching items | 沒有符合的品項 |
| `noMatch.vendor` | No item from this vendor matches your search | 沒有符合搜尋條件的品項指定給這個供應商 |
| `noMatch.recipe` | No item in this recipe matches your search | 沒有符合搜尋條件的品項加入這個食譜 |
| `noMatch.shelf` | No item on this shelf matches your search | 沒有符合搜尋條件的品項加入這個貨架 |
| `noMatch.shelfFilters` | No item on this shelf matches the current filters | 沒有符合篩選條件的品項加入這個貨架 |

Two notes for anyone editing them:

- `noItems` ("No items") and `noMatch.title` ("No matching items") are two different
  states and must stay two different strings. Tests assert one is absent while the
  other is present, with exact string matching.
- No key interpolates an entity name, so none needs the `capitalize` span the
  i18n naming rule describes. "No items are assigned to this vendor" says *this
  vendor*, not the vendor's name, on purpose.

The nearest existing wording, `shopping.emptyFiltered.title` ("No items match the
current filters"), was not reused for the search cases: it talks about filters, and
these messages are about a search term. It **was** the model for
`noMatch.shelfFilters`, which really is about filters.

## Test Added

`apps/web/src/routes/index.test.tsx` — 3 new tests plus 1 for the shelf filter case.
`apps/web/src/routes/index.stories.tsx` + `index.stories.test.tsx` — 1 story and its
smoke test. The file went from 49 to 53 tests; the stories file from 23 to 24.

**The three existing tests were renamed, not reused.** They were called
*"user sees the empty state, not a blank pane, when a search matches nothing and the
tail is empty"* and every one of them builds a group with **no** items. With an empty
group the pre-search count is already 0, so the old guard fires and the message
renders — the fixture cannot tell broken code from correct code. They are now
*"user sees the empty-group state, not a blank pane, when an empty group is searched
and nothing matches"*, which says what they actually do, and they stay as a negative
control: they pass against the broken guard as well as the fixed one.

The new tests use the opposite fixture — a group that **has** an item, stocked at the
active location, searched for a query matching nothing:

| Test | View |
|---|---|
| `user sees a no-match message, not a blank pane, when the shelf HAS items and the search matches none of them` | `ShelfDetailView` |
| `user sees a no-match message, not a blank pane, when the vendor HAS items and the search matches none of them` | `VendorDetailView` |
| `user sees a no-match message, not a blank pane, when the recipe HAS items and the search matches none of them` | `RecipeDetailView` |
| `user sees a no-match message, not a blank pane, when a filter on the unsorted shelf page excludes every item` | `ShelfDetailView`, filter branch |

Each one asserts the item's heading is present **before** the search, then gone after
it, then the no-match message present and the empty-group message absent. The first
assertion is what stops the test passing on a half-rendered page; the last is what
stops the trap above from passing.

### Mutation checks

Every one was run, and every one went red on exactly the right test.

| Mutation | Result |
|---|---|
| `VendorDetailView` guard back to `sortedItems.length === 0` | 1 failed / 51 passed. `TestingLibraryElementError: Unable to find an element with the text: No matching items.` on the new vendor test |
| `RecipeDetailView` guard back to `sortedItems.length === 0` | 1 failed / 51 passed. Same error text, on the new recipe test |
| `ShelfDetailView` guard back to `sortedInShelfItems.length === 0` | 1 failed / 51 passed. Same error text, on the new shelf test |
| `ShelfDetailView`: always use `noMatch.shelf`, dropping the `trimmedSearch` branch | 1 failed / 52 passed. `Unable to find an element with the text: No item on this shelf matches the current filters.` on the filter test |
| `t('pantry.detail.noMatch.vendor')` renamed to a key that does not exist | 1 failed / 51 passed. `Unable to find an element with the text: No item from this vendor matches your search.` |
| `t('pantry.detail.vendor.noneAssigned')` renamed to a key that does not exist | 1 failed / 52 passed. `Unable to find an element with the text: No items are assigned to this vendor.` — so the extracted strings are asserted too, not only the new ones |

**In all three guard mutations the three renamed empty-group tests stayed green.**
That is the point of the rename: those fixtures cannot see this bug, and the new ones
can.

The i18n change is covered by tests for the English text only. The Traditional Chinese
strings are checked for key parity by
`apps/web/src/i18n/locales/locales.test.ts` and read by no assertion, so their wording
is unproven by tests.

## PR / Commit

Branch `fix/group-search-no-match`.

| Commit | Content |
|---|---|
| `fix(pantry): show a no-match message instead of a blank pane` | the three views, the `pantry.detail.*` keys in both locales, the four tests, the story and its smoke test |
| `docs(pantry): record the blank-pane fix and the vacuous fixtures` | this bug doc, `apps/web/src/routes/CLAUDE.md`, `apps/web/src/i18n/CLAUDE.md`, `docs/INDEX.md` |

E2E is **owed, not run** — another session held the machine, and only one Playwright
suite can run here at a time. The specs that matter are
`e2e/tests/shelves.spec.ts`, `e2e/tests/vendors-group.spec.ts`,
`e2e/tests/recipes-group.spec.ts` and `e2e/tests/a11y.spec.ts`.
