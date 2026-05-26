# Bug: Recipe Items Page — +/- Buttons Missing Loading State

## Bug Description

On the settings > recipe > items page (`/settings/recipes/:id/items`), clicking the +/- buttons on ItemCard does not show a loading spinner while the mutation is in flight.

## Root Cause

`apps/web/src/routes/settings/recipes/$id/items.tsx` tracks pending state with `savingItemIds: Set<string>` and passes `disabled={savingItemIds.has(item.id)}` to ItemCard, but does not pass `isPending={savingItemIds.has(item.id)}`. Without `isPending`, ItemCard's internal `pendingDirection` state never triggers the spinner.

## Fix Applied

TBD

## Test Added

TBD

## PR / Commit

TBD
