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
search would be false there. That filter case was its own blank pane before this fix,
with the same three conditions true at once. The vendor and recipe views pass
`hideFiltersToggle={true}` on **both** of their pages and narrow by search only, so
their filter case cannot be reached and they need no filter branch. They do read
`isUnsorted` here — see the 2026-10-15 revision below — but with two keys each, not
three.

**All three no-match descriptions read `isUnsorted`, and `ShelfDetailView`'s reads
`trimmedSearch` on top** — see the copy revisions of 2026-10-14 and 2026-10-15 below.
The first version of this fix read neither: `ShelfDetailView` branched on
`trimmedSearch` alone and the other two branched on nothing, so every message named
the real group ("is on this shelf", "is assigned to this vendor", "is assigned to
this recipe"). On the `unsorted` page each of those is false about every row. Seven
keys now cover the seven reachable cases:

| View | Page | Trigger | Key |
|---|---|---|---|
| `VendorDetailView` | a real vendor | search | `pantry.detail.noMatch.vendor` |
| `VendorDetailView` | `unsorted` ("No vendor") | search | `pantry.detail.noMatch.vendorUnsorted` |
| `RecipeDetailView` | a real recipe | search | `pantry.detail.noMatch.recipe` |
| `RecipeDetailView` | `unsorted` ("Not added to recipe") | search | `pantry.detail.noMatch.recipeUnsorted` |
| `ShelfDetailView` | a real shelf | search | `pantry.detail.noMatch.shelf` |
| `ShelfDetailView` | `unsorted` | search | `pantry.detail.noMatch.shelfUnsorted` |
| `ShelfDetailView` | `unsorted` | filters, no search | `pantry.detail.noMatch.shelfUnsortedFilters` |

**Only the `unsorted` shelf page has a filter case, so only `ShelfDetailView` has a
third key.** Two things make a real shelf's filter case unreachable:
`hideFiltersToggle={!isUnsorted}` means a real shelf page has no filters toggle at
all, and the `displayedInShelfItems` memo returns `sortedInShelfItems` unchanged when
there is no search text and `!isUnsorted`, so an empty displayed list there implies
an empty source list — which takes the empty-group branch instead. The same
reasoning rules out a filter case on both pages of the vendor and recipe views: they
pass `hideFiltersToggle={true}` whatever the page, and their `displayedItems` memo
returns `sortedItems` unchanged with no search text.

### i18n

All ten strings in the three blocks were hardcoded English, so the whole block
rendered in English for a Traditional Chinese user. They are now translated, together
with the new no-match copy, in a new `pantry.detail.*` namespace — **16** keys in
`apps/web/src/i18n/locales/en.json` and the same 16 in `tw.json`, after three rounds
of copy work: 13 on 2026-10-13, 14 on 2026-10-14, 16 on 2026-10-15. The namespace is new
because `pantry.*` had no key for the detail views at all.

The table below is generated from those two files, not written by hand. To regenerate
it, and to check that the version in this file still matches, run from the repo root:

```bash
python3 - <<'EOF'
import io, json
def flat(o, p=''):
    for k, v in o.items():
        key = f'{p}.{k}' if p else k
        if isinstance(v, dict): yield from flat(v, key)
        else: yield key, v
def load(f):
    return dict(flat(json.load(io.open(f, encoding='utf-8'))['pantry']['detail']))
en = load('apps/web/src/i18n/locales/en.json')
tw = load('apps/web/src/i18n/locales/tw.json')
assert list(en) == list(tw), 'en/tw key order or set differs'
print('| Key | English | Traditional Chinese |')
print('|---|---|---|')
for k in en:
    print(f'| `{k}` | {en[k]} | {tw[k]} |')
EOF
```

Diff its output against the table below. It printed 16 rows on 2026-10-15 and they
matched this file on every key, value and position.

| Key | English | Traditional Chinese |
|---|---|---|
| `noItems` | No items | 沒有品項 |
| `vendor.allAssigned` | All items are assigned to vendors | 沒有未指定供應商的品項 |
| `vendor.noneAssigned` | No items are assigned to this vendor | 沒有任何品項指定給這個供應商 |
| `recipe.allAssigned` | All items are assigned to recipes | 沒有未加入食譜的品項 |
| `recipe.noneAssigned` | No items are assigned to this recipe | 沒有任何品項加入這個食譜 |
| `shelf.allAssigned` | All items are assigned to shelves | 沒有未放上貨架的品項 |
| `shelf.noFilterMatch` | No items match the filter | 沒有符合篩選條件的品項 |
| `shelf.searchToAdd` | Search to add items to this shelf | 可以透過搜尋功能將品項放上這個貨架 |
| `noMatch.title` | No matching items | 沒有符合的品項 |
| `noMatch.vendor` | No item matching your search is assigned to this vendor | 沒有符合搜尋條件的品項指定給這個供應商 |
| `noMatch.vendorUnsorted` | No item matching your search is without a vendor | 沒有符合搜尋條件且未指定供應商的品項 |
| `noMatch.recipe` | No item matching your search is assigned to this recipe | 沒有符合搜尋條件的品項加入這個食譜 |
| `noMatch.recipeUnsorted` | No item matching your search is without a recipe | 沒有符合搜尋條件且未加入食譜的品項 |
| `noMatch.shelf` | No item matching your search is on this shelf | 沒有符合搜尋條件的品項放上這個貨架 |
| `noMatch.shelfUnsorted` | No item matching your search is without a shelf | 沒有符合搜尋條件且未放上貨架的品項 |
| `noMatch.shelfUnsortedFilters` | No item matching the filter is without a shelf | 沒有符合篩選條件且未放上貨架的品項 |

Two notes for anyone editing them:

- `noItems` ("No items") and `noMatch.title` ("No matching items") are two different
  states and must stay two different strings. Tests assert one is absent while the
  other is present, with exact string matching.
- No key interpolates an entity name, so none needs the `capitalize` span the
  i18n naming rule describes. "No items are assigned to this vendor" says *this
  vendor*, not the vendor's name, on purpose.

The nearest existing wording, `shopping.emptyFiltered.title` ("No items match the
current filters"), was not reused for the search cases: it talks about filters, and
these messages are about a search term. It was the first model for the filter key
(then named `noMatch.shelfFilters`, since renamed to `noMatch.unsortedFilters`),
which really is about filters, but the copy revisions below replaced that shape.

#### Copy revision, same day

The first version of these strings — 13 of them at that point — gave the empty-group
case and the no-match case two different sentence shapes. The owner rewrote the Traditional Chinese so the two
read as a matched pair, then the English followed.

The Chinese shape is: 沒有 + qualifier + 品項 + relationship clause. Only the
qualifier changes between the pair — 任何 for the empty case, 符合搜尋條件的 or
符合篩選條件的 for the no-match case. The shelf verb was also unified to 放上.

The four `noMatch.*` descriptions in `en.json` now use the same shape: the qualifier
sits on the subject and the relationship clause is the same as its partner's.

| Key | English before | English after |
|---|---|---|
| `noMatch.vendor` | No item from this vendor matches your search | No item matching your search is assigned to this vendor |
| `noMatch.recipe` | No item in this recipe matches your search | No item matching your search is assigned to this recipe |
| `noMatch.shelf` | No item on this shelf matches your search | No item matching your search is on this shelf |
| `noMatch.shelfFilters` | No item on this shelf matches the current filters | No item matching the filter is on this shelf |

`noMatch.title` ("No matching items") was not touched, and neither was any
`noneAssigned`, `allAssigned`, `noFilterMatch` or `searchToAdd` value.

The shelf keys say "is on this shelf" rather than "is assigned to this shelf". That
matches TW's 放上 and `shelf.searchToAdd` ("Search to add items to this shelf"): an
item is *added to* a shelf, and then it *is on* it.

Checked after the edit: all 13 `pantry.detail.*` values then present were different
from each other, and none equalled any of the other 581 string values in `en.json`.

#### Copy revision, 2026-10-14 — the unsorted page gets its own two keys

The 2026-10-13 copy above left one statement false. `ShelfDetailView` renders two
different pages, and the no-match branch did not know which one it was on:

| Page | `shelfId` | Lists |
|---|---|---|
| a real shelf | that shelf's id | the items **on** that shelf |
| Unsorted | the literal `'unsorted'` | the items on **no** shelf |

The empty-group branch was already mode-aware — it checks `isUnsorted` and says
`shelf.allAssigned` ("All items are assigned to shelves"), wording that never calls
the Unsorted page "this shelf". The no-match branch branched on `trimmedSearch`
alone, and both of its keys ended "is on this shelf". On the Unsorted page that is
wrong about every row.

`noMatch.shelfFilters` was wrong in **every** case it rendered, because the
no-filter-match case is reachable only on the Unsorted page. So it was renamed rather
than kept beside a new key:

| Key | Change |
|---|---|
| `noMatch.shelf` | kept, unchanged — it is correct for a real shelf |
| `noMatch.unsorted` | **new** — the Unsorted page, search case |
| `noMatch.unsortedFilters` | **renamed** from `noMatch.shelfFilters` |

The key count went 13 → 14. No reference to `shelfFilters` is left anywhere in
`apps/web/src` or `e2e/`.

The two new values keep the pair rule: the qualifier goes on the subject, and the
relationship clause matches the partner message `shelf.allAssigned`.

| Key | English | Traditional Chinese |
|---|---|---|
| `noMatch.unsorted` | No item matching your search is without a shelf | 沒有符合搜尋條件且未放上貨架的品項 |
| `noMatch.unsortedFilters` | No item matching the filter is without a shelf | 沒有符合篩選條件且未放上貨架的品項 |

English says "is without a shelf", not "is not on a shelf". Both are accurate; the
second puts two negatives in one short sentence ("No item … is not on a shelf"),
which is harder to read.

The Traditional Chinese inserts the qualifier into the shape `shelf.allAssigned`
already uses — 沒有未放上貨架的品項 — joined with 且, and keeps 放上 as the shelf
verb. **These two values are not reviewed by a native speaker and no test asserts
them.** The previous two revisions of this copy were both owner rewrites, so treat
them as drafts.

`ShelfDetailView.tsx` carries a comment saying the branch reads `isUnsorted` on
purpose, so the next editor does not collapse it back.

**Both key names above were renamed the next day.** They are written here as they
were on 2026-10-14; `noMatch.unsorted` is now `noMatch.shelfUnsorted` and
`noMatch.unsortedFilters` is now `noMatch.shelfUnsortedFilters`. See the 2026-10-15
revision below for why.

#### Copy revision, 2026-10-15 — the vendor and recipe views get theirs, and the shelf keys are renamed

The 2026-10-14 fix above was applied to `ShelfDetailView` only, and the identical
statement was still false in the other two views. Each of them also renders two
pages off one id, and its no-match branch did not know which one it was on:

| View | Real page | `unsorted` page | Lists on the `unsorted` page |
|---|---|---|---|
| `VendorDetailView` | a real vendor | "No vendor" | the items assigned to **no** vendor |
| `RecipeDetailView` | a real recipe | "Not added to recipe" | the items in **no** recipe |

So on the "No vendor" page a no-match search said *"No item matching your search is
assigned to this vendor"*. Every row on that page is there because it is assigned to
no vendor at all. Same for the recipe page. In both files the mode-aware empty-group
branch sat a few lines **below** the mode-blind no-match branch.

**Two renames first.** The 2026-10-14 keys were named by MODE while every sibling in
the block is named by VIEW, so extending the same idea to two more views would have
collided:

| from | to |
|---|---|
| `pantry.detail.noMatch.unsorted` | `pantry.detail.noMatch.shelfUnsorted` |
| `pantry.detail.noMatch.unsortedFilters` | `pantry.detail.noMatch.shelfUnsortedFilters` |

Values unchanged in both locales. No reference to the old names is left anywhere in
`apps/web/src` or `e2e/`.

**Then one new key per view, not two.** The vendor and recipe views have no filter
case to name: both pass `hideFiltersToggle={true}` on **both** pages, and their
`displayedItems` memo is `if (!trimmedSearch) return sortedItems`, so with no search
text the displayed list equals the source list and an empty one takes the
empty-group branch instead.

| Key | Change |
|---|---|
| `noMatch.vendor` | kept, unchanged — correct for a real vendor |
| `noMatch.vendorUnsorted` | **new** — the "No vendor" page, search case |
| `noMatch.recipe` | kept, unchanged — correct for a real recipe |
| `noMatch.recipeUnsorted` | **new** — the "Not added to recipe" page, search case |

The key count went 14 → 16.

The two new values keep the pair rule: the qualifier goes on the subject, and the
relationship clause matches each view's own `allAssigned` partner.

| Key | Partner | English | Traditional Chinese |
|---|---|---|---|
| `noMatch.vendorUnsorted` | `vendor.allAssigned` (沒有未指定供應商的品項) | No item matching your search is without a vendor | 沒有符合搜尋條件且未指定供應商的品項 |
| `noMatch.recipeUnsorted` | `recipe.allAssigned` (沒有未加入食譜的品項) | No item matching your search is without a recipe | 沒有符合搜尋條件且未加入食譜的品項 |

English says "is without a vendor" / "is without a recipe", matching the shelf key's
"is without a shelf", so all three `unsorted` pages read the same way. "is without a
recipe" is the weakest of the three — an item is *added to* a recipe rather than
*having* one, so "is in no recipe" reads slightly better on its own. It was not used:
it breaks the shared shape, and the page's own partner message
(`recipe.allAssigned`) already says "assigned to recipes", which makes "without a
recipe" the matching half.

The Traditional Chinese inserts the qualifier into each partner's own shape with 且,
and keeps that view's own verb — 指定給 for vendor, 加入 for recipe, the same verbs
`vendor.noneAssigned` and `recipe.noneAssigned` use.

**All four `*Unsorted` TW values are unreviewed** — the two new ones here and the two
renamed shelf ones. No test asserts a TW string, and the owner rewrote this copy
three times in two days, so treat all four as drafts.

Both files carry a comment saying the branch reads `isUnsorted` on purpose, so the
next editor does not collapse it back. `ShelfDetailView.tsx`'s own comment was
corrected too: it said the other two views "need no such branch", which stopped being
true.

**No fourth surface has this shape.** Checked across `apps/web/src` on 2026-10-15:
only these three components render a sentence that claims a group relationship, and
only these three take an `'unsorted'` id. The three group views (`VendorGroupView`,
`RecipeGroupView`, `ShelfGroupView`) render cards, not an empty-state sentence.
`routes/shopping/$vendorId.tsx` has the same two-message arrangement and a
`'no-vendor'` cart, but its two strings — `shopping.empty.title` ("No items yet") and
`shopping.emptyFiltered.title` ("No items match the current filters") — claim no group
relationship, so they are already true on both pages. `settings.vendors.items.empty`
and `settings.recipes.items.empty` do name "this vendor" / "this recipe", but those
pages exist only for a real row and have no `unsorted` mode.

## Test Added

`apps/web/src/routes/index.test.tsx` — 3 new tests plus 1 for the shelf filter case,
then 1 more on 2026-10-14 for the Unsorted shelf search case, then 2 more on
2026-10-15 for the Unsorted vendor and recipe search cases.
`apps/web/src/routes/index.stories.tsx` + `index.stories.test.tsx` — 1 story and its
smoke test. The file went from 49 to 53 tests, then to 54, then to **56**; the stories
file from 23 to 24. The web suite went from 2308 to 2309 to **2311**. Measured
2026-10-15 with `pnpm test:web` from the repo root: **2311 passed across 251 files**.
`apps/server` is untouched at 391 across 27, and `scripts/spec` at 70.

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
| `user sees the unsorted wording, not the shelf wording, when the unsorted shelf page HAS items and the search matches none of them` | `ShelfDetailView`, Unsorted search branch (added 2026-10-14) |
| `user sees the unsorted wording, not the vendor wording, when the "No vendor" page HAS items and the search matches none of them` | `VendorDetailView`, Unsorted search branch (added 2026-10-15) |
| `user sees the unsorted wording, not the recipe wording, when the "Not added to recipe" page HAS items and the search matches none of them` | `RecipeDetailView`, Unsorted search branch (added 2026-10-15) |

Each one asserts the item's heading is present **before** the search, then gone after
it, then the no-match message present and the empty-group message absent. The first
assertion is what stops the test passing on a half-rendered page; the last is what
stops the trap above from passing.

### Mutation checks

Every one was run, and every one went red on exactly the right test.

| Mutation | Result |
|---|---|
| `VendorDetailView` guard back to `sortedItems.length === 0` | 1 failed / 52 passed. `TestingLibraryElementError: Unable to find an element with the text: No matching items.` on the new vendor test |
| `RecipeDetailView` guard back to `sortedItems.length === 0` | 1 failed / 52 passed. Same error text, on the new recipe test |
| `ShelfDetailView` guard back to `sortedInShelfItems.length === 0` | **2** failed / 51 passed. Same error text, on the new shelf test AND on the unsorted-filter test — both reach this one guard. **Now 3 failed / 51 passed** — see the 2026-10-14 table below |
| `ShelfDetailView`: always use `noMatch.shelf`, dropping the `trimmedSearch` branch | 1 failed / 52 passed. `Unable to find an element with the text: No item matching the filter is on this shelf.` on the filter test. Superseded 2026-10-14, when that branch became `isUnsorted` first |
| `t('pantry.detail.noMatch.vendor')` renamed to a key that does not exist | 2 failed / 75 passed across `index.test.tsx` + `index.stories.test.tsx`. `Unable to find an element with the text: No item matching your search is assigned to this vendor.` in both |
| `t('pantry.detail.vendor.noneAssigned')` renamed to a key that does not exist | 1 failed / 52 passed. `Unable to find an element with the text: No items are assigned to this vendor.` — so the extracted strings are asserted too, not only the new ones |

**In all three guard mutations the three renamed empty-group tests stayed green.**
That is the point of the rename: those fixtures cannot see this bug, and the new ones
can.

**Every row above was re-run after the copy revision**, with
`npx vitest run src/routes/index.test.tsx src/routes/index.stories.test.tsx` from
`apps/web`. Changing a test assertion to match new copy is exactly how a test stops
being able to fail, so the whole table was re-measured rather than edited.

The re-run corrected three figures that had been wrong since the first write-up. The
file holds **53** tests, so "1 failed / 51 passed" cannot be right for any of them:
the two single-failure guard rows are 1 failed / **52** passed, and the
`ShelfDetailView` guard row is **2** failed / 51 passed. The bad-key row also now
names both files, because the story smoke test asserts the same string.

#### Mutation checks for the 2026-10-14 revision

Run from `apps/web` with `npx vitest run src/routes/index.test.tsx`, which holds
**54** tests after the new one.

| Mutation | Result |
|---|---|
| drop the `isUnsorted` check in the no-match branch, so it always uses `noMatch.shelf` | **2 failed / 52 passed**. The new Unsorted test: `TestingLibraryElementError: Unable to find an element with the text: No item matching your search is without a shelf.` The unsorted-filter test: the same error for `No item matching the filter is without a shelf.` |
| the same mutation, with the new test's "present" assertion removed, to check its "absent" assertion alone | **1 failed / 53 skipped**. `expect(element).not.toBeInTheDocument()` — the real-shelf wording was found on the page. So both halves of the new test catch this mutation, not just the first one to run |
| `ShelfDetailView` guard back to `sortedInShelfItems.length === 0` | **3 failed / 51 passed** — one more than before, because the new test reaches the same guard. All three: `Unable to find an element with the text: No matching items.` The 3 empty-group tests stayed **green** (`-t "empty-group"` → 3 passed / 51 skipped) |
| `t('pantry.detail.noMatch.unsortedFilters')` pointed at `noMatch.unsortedFiltersTypo` | **1 failed / 53 passed**. `Unable to find an element with the text: No item matching the filter is without a shelf.` on the unsorted-filter test |

The first row is the one that proves the mode-awareness is real. The second row
matters because `getByText` throws before any later assertion runs, so without it the
"absent" assertion would be unproven.

#### Mutation checks for the 2026-10-15 revision

Run from `apps/web` with `npx vitest run src/routes/index.test.tsx`, which holds
**56** tests after the two new ones.

| Mutation | Result |
|---|---|
| collapse `VendorDetailView`'s branch so it always uses `noMatch.vendor` | **1 failed / 55 passed**. The new vendor test: `TestingLibraryElementError: Unable to find an element with the text: No item matching your search is without a vendor.` |
| collapse `RecipeDetailView`'s branch so it always uses `noMatch.recipe` | **1 failed / 55 passed**. The new recipe test: the same error for `No item matching your search is without a recipe.` |
| the vendor mutation again, with the new vendor test's "present" assertion removed, to check its "absent" assertion alone | **1 failed / 55 skipped**. `Error: expect(element).not.toBeInTheDocument()` at line 2028 — the real-vendor wording was found on the page. So both halves of the new test catch this mutation, not only the first one to run |
| collapse `ShelfDetailView`'s branch so it always uses `noMatch.shelf`, to prove the rename did not break it | **2 failed / 54 passed** — the Unsorted shelf search test and the unsorted-filter test, with the same two error texts the 2026-10-14 table records |

**The two views are separate code paths and were measured separately.** Collapsing the
vendor branch leaves the recipe test green and the other way round, so neither
mutation can stand in for the other.

The third row is the measurement the 2026-10-14 round added to this doc as a rule, and
it is needed again here for the same reason: `getByText` throws, so when one test
asserts both a present string and an absent string on the same branch, a failure in the
present assertion stops the absent one from ever running. Removing the present
assertion and re-running the mutation is what proves the absent half.

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
| `fix(pantry): name the right page in the Unsorted no-match message` | `ShelfDetailView`, its two new keys, the Unsorted shelf test (2026-10-14) |
| `docs(pantry): record the Unsorted no-match keys and the rename` | the 2026-10-14 sections of this doc and the two `CLAUDE.md` files |
| `refactor(i18n): name the two Unsorted shelf no-match keys by view` | `noMatch.unsorted` → `noMatch.shelfUnsorted`, `noMatch.unsortedFilters` → `noMatch.shelfUnsortedFilters`, in both locales and in `ShelfDetailView` (2026-10-15) |
| `fix(pantry): name the right page in the Unsorted no-match message` | `VendorDetailView` and `RecipeDetailView`, their two new keys in both locales, the two new tests (2026-10-15) |
| `docs(pantry): record the Unsorted vendor and recipe keys` | the 2026-10-15 sections of this doc and the two `CLAUDE.md` files |

E2E is **owed, not run** — another session held the machine, and only one Playwright
suite can run here at a time. The specs that matter are
`e2e/tests/shelves.spec.ts`, `e2e/tests/vendors-group.spec.ts`,
`e2e/tests/recipes-group.spec.ts` and `e2e/tests/a11y.spec.ts`.

**No E2E spec names any string or key this branch changed.** Checked on 2026-10-15:
`grep -rn` over `e2e/` finds 0 matches for `noMatch`, `pantry.detail.noMatch`,
`No matching items`, `No item matching`, `without a vendor`, `without a recipe`,
`without a shelf` and `unsortedFilters`. The only hit for `pantry.detail` is a prose
comment in `e2e/tests/settings/shelves.spec.ts:36` that says "the pantry detail view",
not a key. So no spec needs editing; the run is still owed as a regression check on the
pages themselves.
