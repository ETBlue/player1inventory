# Design: item page tabs (stay after Save, one flat tab row)

Date: 2026-11-24. Branch `feature/item-tabs-flat`, from `develop` at `34693751`.
Brainstorming: `2026-11-24-brainstorming-item-tabs-flat.md`.

## Summary

1. **Where it sits.** The item page (`/items/$id`) has four tabs: Info, Stock, Relation
   (with Tags, Vendors and Recipes inside) and Log. Info and Stock each save and then leave
   the item page. To change several things of one item, the user opens the item again for
   every tab.
2. **Relations.** Web only. No server or schema change. Part C of the brainstorming (one
   shared Save, edits held until Save) is NOT in this design; it is decided later.
3. **What the user gets** once merged and deployed:
   - Save on Info and Stock keeps them on the item page, with a short "Saved" message.
   - One row of tabs: Info · Stock · Tags · Vendors · Recipes · Log. Icons only on a phone.
   - Tags, Vendors and Recipes are one click away, not two.
4. **What the developer gets:** one level of routes less (`relation/` is gone), and tests that
   pin "Save stays on the page".

## A. Save stays on the page

| Today | After |
|---|---|
| Info Save → writes → `goBack()` (`routes/items/$id/index.tsx`) | writes → stays on Info |
| Stock Save → writes → `goBack()` (`routes/items/$id/stock.tsx`) | writes → stays on Stock, on the same location page |

After a successful save:

- the form takes the saved values as its new starting point, so it is not dirty;
- Save is disabled again;
- a toast "Saved" shows (a new i18n key in `en.json` and `tw.json`).

Not changed:

- The discard dialog when leaving a tab with unsaved edits (`isOnEditableTab` in
  `routes/items/$id.tsx`).
- The unit-switch dialog on Info: it still opens before the write and can still cancel it.
  Only the `goBack()` at its end goes away.
- A failed save keeps today's error handling and stays on the page.
- **Delete item** still leaves the page.

## B. One flat tab row

- Row 1 (top bar): back, the item name, and the current tab's Save when it has one.
  - **Update 2026-11-25.** PR #417 shipped with Save still at the bottom of each form. The
    owner then chose to move it into the top bar ("I prefer moving the save button to top
    bar", brainstorming Q4). Since branch `feature/item-save-top-bar`, Save on Info and
    Stock is in row 1 and no longer at the bottom of the form. Tags, Vendors, Recipes and
    Log have no Save, so row 1 shows none there.
  - How: `$id.tsx` puts an empty slot element at the end of row 1 (`toolbarEnd`) and shares
    it through `useItemLayout()` (`saveSlot`). The Info and Stock tabs pass it to `ItemForm`
    as `submitSlot`, and `ItemForm` renders its Save there with a React portal, as
    `<button type="submit" form="<form id>">`. The HTML `form` attribute links the button to
    the form, so a click, Enter in a field, the validation, the spinner and the unit-switch
    dialog work as before. A read-only person (household `member` on Info, location
    `viewer` on Stock) gets no Save, as before.
  - On a phone (390 px) row 1 is back, the item name (truncated) and Save with its visible
    label "Save" (「儲存」). A short word is clearer than an icon and fits. The button has the
    default size (`h-8`), the same height as the back button.
  - **Delete item** did not move.
- Row 2: Info · Stock · Tags · Vendors · Recipes · Log.
  - Below the `sm` width: icons only. Each tab keeps its name as its accessible name
    (`aria-label`, or visually hidden text).
  - From `sm` up: icon and text.
- **Relation** is removed. New routes:

  | Old | New |
  |---|---|
  | `/items/$id/relation` | redirect to `/items/$id/tags` |
  | `/items/$id/relation/tags` | `/items/$id/tags` (old address redirects) |
  | `/items/$id/relation/vendors` | `/items/$id/vendors` (old address redirects) |
  | `/items/$id/relation/recipes` | `/items/$id/recipes` (old address redirects) |

  The redirects keep saved links and page history working. They replace the history entry,
  so Back does not land on a redirect.
- Tags, Vendors and Recipes still save on each click, with no Save button.
- Every place that links to `relation/…` (code, tests, stories, E2E page objects, docs) moves
  to the new address.

## Tests

- Info and Stock: after Save, the page stays (no navigation), the form is clean, Save is
  disabled, and the toast shows. Local and cloud. Mutation check: put `goBack()` back → red.
- The 6 tabs each open their page; the active tab is marked (`aria-current` or the tab role
  the toolbar uses today).
- Each old `relation/…` address redirects to the new one.
- E2E: update the item page object and every spec that clicks Relation or expects Save to
  leave the page. Add axe scans of the item page tab row in light and dark mode, at 390 px
  and at desktop width (`a11y.spec.ts`).
- Since 2026-11-25: Save is in the top bar on Info and Stock and submits the form; it is
  absent on Tags, Vendors, Recipes and Log and for a read-only person; disabled while the
  form is clean (`$id/saveTopBar.test.tsx`, `ItemForm.test.tsx`). Enter in a field still
  saves (E2E only, `item-management.spec.ts`: jsdom's user-event does not follow the `form`
  attribute). The tab row a11y scans also check that Save fits row 1 and scan it enabled.

## Not in this design

- One shared Save (part C).
- Any change to what Tags, Vendors and Recipes write.
