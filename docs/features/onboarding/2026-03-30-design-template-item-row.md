# Design: TemplateItemRow — custom item layout for onboarding item selection

**Date:** 2026-03-30
**Branch:** feature-onboarding-b

## Context

`TemplateItemsBrowser` currently renders each template item using `ItemCard variant="template"`. `ItemCard` is a complex component built for pantry/shopping/cooking contexts: it uses `useLastPurchaseDate` (requires `QueryClientProvider`), renders a `<Link>` to the item detail route (requires router context), and carries quantity controls, stock-status coloring, and expiration logic — none of which apply to onboarding item selection. The mismatch forces heavy adapter code (`templateItemToItem`) and makes stories fragile.

The requirement change: replace `ItemCard` in `TemplateItemsBrowser` with a purpose-built `TemplateItemRow`.

## Layout

```
[✓]  ┌────────────────────────────────────────────┐
     │  [item name]  ...  [tag badge] [tag badge] │
     └────────────────────────────────────────────┘
```

- Checkbox sits **outside** the Card (consistent with how ItemCard positions it in other views).
- Tags are **always visible** — no toggle. The Tags toggle button is removed from the `TemplateItemsBrowser` toolbar.
- Clicking the row does **not** toggle the checkbox — only the checkbox itself toggles selection.

## New file: `TemplateItemRow.tsx`

Co-located inside `apps/web/src/components/onboarding/TemplateItemsBrowser/`:

```
TemplateItemsBrowser/
  index.tsx
  TemplateItemRow.tsx               ← new
  TemplateItemRow.stories.tsx       ← new
  TemplateItemRow.stories.test.tsx  ← new
  TemplateItemsBrowser.stories.tsx
  TemplateItemsBrowser.stories.test.tsx
```

### Props

```ts
interface TemplateItemRowProps {
  itemKey: string    // used for aria-label ("Add {name}" / "Remove {name}")
  name: string       // resolved, translated item name
  tags: Tag[]        // resolved Tag objects (always rendered)
  tagTypes: TagType[]
  isChecked: boolean
  onToggle: () => void
}
```

### Render structure

```tsx
<div className="relative">
  <Checkbox
    checked={isChecked}
    onCheckedChange={onToggle}
    aria-label={isChecked ? `Remove ${name}` : `Add ${name}`}
    className="absolute -ml-10 mt-2"
  />
  <Card className="ml-10">
    <CardHeader className="flex flex-row items-center gap-2 min-h-8">
      <span className="flex-1 truncate min-w-0 capitalize">{name}</span>
      {tags.map((tag) => (
        <TagBadge key={tag.id} tag={tag} tagType={tagTypes.find(...)} />
      ))}
    </CardHeader>
  </Card>
</div>
```

No `CardContent`, no `CardFooter`. `Card` uses default variant (no stock-status coloring).

## Changes to `TemplateItemsBrowser/index.tsx`

1. **Remove** `templateItemToItem` helper — no longer needed (was only used to shape data for `ItemCard`).
2. **Remove** `tagsVisible` state and the Tags toggle button from the second toolbar.
3. **Replace** `ItemCard` in the render loop with `TemplateItemRow`.
4. **Keep** `buildMockTag`, `buildMockTagType`, `mockTagMap`, `mockTagTypes` — still needed for `TagBadge` rendering inside `TemplateItemRow`.

## Stories

`TemplateItemRow.stories.tsx` — two stories:
- `Unchecked` — single row, `isChecked: false`
- `Checked` — single row, `isChecked: true`, with tags

`TemplateItemRow.stories.test.tsx` — smoke tests:
- `Unchecked`: renders item name
- `Checked`: renders checkbox in checked state

## What is NOT changed

- `ItemCard` itself is unchanged — the `template` variant stays for any future reuse.
- `TemplateVendorsBrowser` is unaffected.
- `TemplateItemsBrowser` toolbar structure (two rows, Filters/Search/Select All/Clear) is unchanged except for the Tags toggle removal.
