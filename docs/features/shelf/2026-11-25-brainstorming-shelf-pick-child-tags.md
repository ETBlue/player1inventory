# Brainstorming: pick a child tag when adding to a filter shelf

Date: 2026-11-25. Owner and main session.

## The request (owner)

Pantry › shelf page, the "Add to shelf" dialog (`ShelfFilterPicksDialog`): when the shelf's
filter rule names a tag that has child tags, let the user choose a child tag. Today only the
tag the rule names can be chosen.

## What the code does today (checked)

| Part | Today |
|---|---|
| Options | `deriveFilterAxes` (`lib/shelfUtils.ts`): one axis per tag type, options = the tags the rule names, nothing else |
| Matching | `matchesFilterConfig` and the `metBy` check already expand each named tag to its descendants (`getTagAndDescendantIds`), so an item with a child tag already shows on the shelf |
| Default pick | `defaultPicksFor`: an axis with exactly one option is picked |
| Server | `applyShelfFilterPicks` checks only that each tag is the household's (`requireCatalogIds`). It does not check the tag is named by the rule. So no server change |

## Decisions

| # | Question | Answer |
|---|---|---|
| Q1 | Layout | **Indented list**: each named tag, then its children and grandchildren indented below. The parent can still be picked |
| Q2 | Default pick | **The parent tag**, when the rule names one tag of that type (the same result as today). Several named tags of one type: nothing picked, as today |

See `2026-11-25-shelf-pick-child-tags-design.md`.
