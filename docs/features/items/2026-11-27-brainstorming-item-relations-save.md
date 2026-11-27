# Brainstorming: save item tags, vendors and recipes with one Save

Date: 2026-11-27. Design: `2026-11-27-item-relations-save-design.md`. Plan:
`2026-11-27-item-relations-save-plan.md`.

## The request (owner, 2026-11-27)

On the item page, the Tags, Vendors and Recipes tabs send one HTTP request for each badge
press. Each press waits for its answer, so the tabs feel slow. The owner wants:

- a press adds or removes the badge on screen at once, with no wait;
- all edits of the tab are sent with a **Save** button in the top bar;
- the rules for who may create a new tag, vendor or recipe from these tabs (RBAC) are
  checked too.

## Today

| Tab | A badge press | "New …" from the tab |
|---|---|---|
| Tags | one `updateItem` with the whole `tagIds` list; a spinner on the badge; other presses wait | `createTag`, then a second `updateItem` that assigns it |
| Vendors | one `updateItem` with the whole `vendorIds` list | `createVendor`, then a second `updateItem` |
| Recipes | one `updateRecipe` with that recipe's whole item list | `createRecipe` with this item in it, one request |

The Info and Stock tabs already have a Save in the top bar, a "Saved" toast, and the
unsaved-changes dialog (Cancel · Discard · Save).

## Questions and answers

| # | Question | Options | Owner answer |
|---|---|---|---|
| 1 | What happens when the person creates a new tag, vendor or recipe from the tab? | **A**: the create is sent at once (its own request); the new badge shows as selected but NOT saved, and the assign waits for Save with the other edits. **B**: nothing is sent until Save, not even the create. **C**: keep today's create and assign at once | **A**. Today's second request (create, then assign) is gone. A new recipe is created with NO items and shows as selected; Save adds this item. Discard keeps the created row, not assigned |
| 2 | One Save for each tab, or one Save for all three tabs? | **One per tab**, the same as Info and Stock; leaving a tab with unsaved edits opens Cancel · Discard · Save. Or one Save for the three tabs | **One per tab** |
| 3 | How does the Recipes tab save? | **A new server mutation**, for example `setItemRecipes(itemId, recipeIds)`: all recipes in one transaction, one request, released on the server first. Local mode: one Dexie transaction. Or one `updateRecipe` for each changed recipe, which can fail part way | **The new mutation** |

## The outline the owner approved

- A badge press changes the screen at once and sends nothing. **Save** is in the top bar. It
  is off until something differs from the saved state, shows a spinner while it saves, stays
  on the page, and shows the toast "Saved". The three tabs join `isOnEditableTab` in
  `routes/items/$id.tsx` and register a `SaveControl`. A read-only household `member` sees no
  Save. A failed Save shows `showSaveError` and keeps the edits.
- Tags and Vendors Save = one `updateItem` with the new list. Recipes Save = the new
  mutation. It adds the item with `defaultAmount: consumeAmount || 1`, removes it from the
  other recipes, needs the catalog `manager` role, refuses with `NOT_CONSUMABLE` when it would
  ADD a non-consumable item, and publishes household `CATALOG`. It must be in the `publishes`
  list of `apps/server/src/resolvers/live-publish.guard.test.ts`.
- Live updates while editing: the tab keeps the person's own choices. "Unsaved" means
  "differs from the latest server answer". A badge another tab added shows as selected,
  unless this person pressed it.
- Release order: PR A (server, `setItemRecipes`), release, wait until Railway shows it
  active, then PR B (web).
- Timing: PR B is built next to the Active switch PR 2 (`feature/item-stock-active-web`),
  which is in progress. PR B merges after it and rebases.

## Decision

Build the outline with the three answers above. The design doc records the RBAC research the
owner asked for, the smaller choices made while reading the code, and the questions that are
still open, at its end.

## Rationale

- One request per Save, not per press, removes the wait from every press. The person sees the
  result at once and decides when to send it.
- Creating at once (answer 1A) keeps the create dialog's error handling as it is: a refused
  create still shows its message while the dialog is open, with the name kept.
- One Save per tab (answer 2) is the same rule as Info and Stock, so the page behaves the same
  on every tab that can be edited.
- One mutation for recipes (answer 3) means a Save that touches three recipes cannot leave two
  changed and one not.

## Found while writing the design (for the owner)

- **The Recipes tab adds an item with `defaultAmount: 0` today**, not `consumeAmount || 1`
  (`apps/web/src/routes/items/$id/recipes.tsx:52` and `:67`). `consumeAmount || 1` is the rule
  of the other three places that add an item to a recipe. So the outline's "today's rule" is
  a change for this tab. It is open question 4 in the design doc.
- **`updateItem` does not replace the tag and vendor lists in one transaction**
  (`apps/server/src/resolvers/item.resolver.ts:264-283`). This is older than this work. Open
  question 7.
- **The Active switch PR 2 does not change `routes/items/$id.tsx`** (checked on
  `feature/item-stock-active-web` at `bc72878f`, and in its plan). The two PRs share docs, the
  i18n files and maybe `e2e/playwright.config.ts`, not that file. See the design doc,
  *Release order*.
