# Bug: AddShelfDialog not using UI library radio components

## Bug Description

Settings > Shelves: The "Add shelf" dialog uses native HTML `<input type="radio">` elements for the shelf type selection (Filter vs Selection) instead of the project's shadcn/ui `RadioGroup` and `RadioGroupItem` components.

## Root Cause

`AddShelfDialog.tsx` (lines 128–155) renders plain `<input type="radio">` wrapped in `<label>` tags with `className="accent-importance-primary"`. The project's UI library provides `RadioGroup`/`RadioGroupItem` from `@/components/ui/radio-group`, which are already used correctly in the ShelfInfoTab form.

## Fix Applied

Replaced native `<input type="radio">` elements with `RadioGroup` and `RadioGroupItem` from `@/components/ui/radio-group`, matching the pattern used in ShelfInfoTab. Commit: 26058a5.

## Test Added

No new test required — the existing `AddShelfDialog.stories.test.tsx` smoke tests cover the dialog renders correctly. The change is visual/component-consistency only with no logic change.

## PR / Commit

Commit: 26058a5 on branch `fix/shelf-add-dialog-radio`
