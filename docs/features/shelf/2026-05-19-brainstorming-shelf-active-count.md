# Brainstorming: Shelf Card Active/Inactive Item Count

## Questions & Answers

**Q: What problem are you solving by showing active/inactive counts?**
A: Show both counts separately — user cares about both how many items are actively tracked and how many are archived.

**Q: How should this replace or extend the existing "N item(s)" count?**
A: Split it — replace "N item(s)" with "N active · M inactive" inline.

**Q: Should inactive count be shown on every card, or only when inactive items exist?**
A: Only when inactive items exist — hide when 0 to keep cards clean.

**Q: How should the inactive portion be styled?**
A: Muted text — "2 inactive" in `text-muted-foreground` to de-emphasize archived items.

**Q: What label wording?**
A: "active / inactive" — explicit and clear.

## Final Design

```
5 active · 2 inactive
           ^^^^^^^^^^^
           text-muted-foreground (only shown when > 0)
```

- When all active: `5 active`
- When mixed: `5 active · 2 inactive`

## Implementation Notes

- Add `getActiveCount(shelfId)` and `getInactiveCount(shelfId)` helpers in `src/routes/shelves/index.tsx`
- Pass through `ShelfList` → `ShelfCard` as new props
- Replace the "N item(s)" render in `ShelfCard.tsx` with the new format
- Update ShelfCard Storybook stories to show both states
