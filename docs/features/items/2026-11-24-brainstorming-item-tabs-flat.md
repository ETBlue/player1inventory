# Brainstorming: item page tabs (stay after Save, one flat tab row)

Date: 2026-11-24. Owner and main session.

## The problem (owner)

Each item tab has its own Save, and Save takes the user back to the page before the item.
To change settings, amounts and tags of one item, the user must open the item again for
every tab.

## The owner's first idea

One shared Save in the top bar. Tabs on a second row, with Tags, Vendors and Recipes at the
same level as the other tabs. No GraphQL mutation until Save.

## What the code does today (checked)

- Info (`routes/items/$id/index.tsx`) and Stock (`routes/items/$id/stock.tsx`) each save and
  then call `goBack()`.
- Tags, Vendors and Recipes sit under **Relation** (`routes/items/$id/relation/*`) and save
  on each click.
- Leaving Info or Stock with unsaved edits shows the discard dialog (`isOnEditableTab` in
  `routes/items/$id.tsx`).

## The idea split into three parts

| Part | Cost | What it fixes alone |
|---|---|---|
| A. Save stays on the page | very small | opening the item again after every save |
| B. One flat tab row: Info · Stock · Tags · Vendors · Recipes · Log | small to medium | one level of clicks |
| C. One shared Save; tab edits held until Save | large | one Save click per tab |

Why C is large:

1. One Save becomes several writes (`updateItem`, `upsertItemStock` per location changed,
   recipe updates). They are not one transaction without a new server mutation, so a partial
   failure needs a design.
2. Rights differ by tab: catalog role (`manager`) for Info and Tags, location role
   (`participant`) for Stock, recipes for Recipes.
3. The Stock tab has one form per location; held edits must survive paging.
4. Creating a tag, vendor or recipe from a tab is a catalog write; holding it is harder.
5. The unit-switch dialog on Info would have to run inside the shared Save.
6. Live updates: another person may change the item while edits are held.

## Decisions

| # | Question | Answer |
|---|---|---|
| Q1 | Build A + B now and C later only if still needed; or all of it; or a shared Save for Info and Stock only? | **A + B first** (option 1). C is decided later, after using A + B |
| Q2 | The 6 tabs do not fit with text on a 390 px phone. How should the row look? | **Icons only on a phone**, icon and text from a wider width. Each tab keeps its name as its accessible name |
| Q3 | The design as presented (below) | **Approved** ("sounds good") |
| Q4 | (2026-11-25) PR #417 left Save at the bottom of each form, but the design put it in row 1. Keep it at the bottom, move it to the top bar, or wait for part C? | **Move Save to the top bar** ("I prefer moving the save button to top bar"). Built on `feature/item-save-top-bar` |

## The approved design, short

- **A.** Save on Info and Stock no longer leaves the page. The form takes the saved values,
  Save is disabled again, and a short "Saved" toast shows. The discard dialog stays. The
  unit-switch dialog still runs before an Info save. **Delete item** still leaves the page.
- **B.** Row 1: back, item name, the tab's Save. Row 2: Info · Stock · Tags · Vendors ·
  Recipes · Log. **Relation** goes away. New addresses `/items/$id/tags`, `/items/$id/vendors`,
  `/items/$id/recipes`; the old `/items/$id/relation/…` addresses redirect to them. Tags,
  Vendors and Recipes still save on each click.

See `2026-11-24-item-tabs-flat-design.md`.
