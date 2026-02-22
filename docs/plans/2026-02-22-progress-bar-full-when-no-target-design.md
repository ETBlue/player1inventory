# Progress Bar Full When No Target — Design

Date: 2026-02-22

## Summary

When an item has `targetQuantity === 0` but `current > 0`, render the progress bar as 100% full instead of an empty track.

## Motivation

Currently `ItemProgressBar` always renders an empty track when `target === 0`. This looks wrong when a user has stock but hasn't configured a target — the bar should communicate "you have something" rather than "you have nothing".

## Behavior

| target | current | Rendered |
|--------|---------|----------|
| 0 | 0 | Empty border track (unchanged) |
| 0 | > 0 | Full-width filled bar using status color |
| > 0 | any | Normal segmented/continuous bar (unchanged) |

The status color follows the same mapping already used everywhere in the component:
- `ok` → `bg-status-ok` (green)
- `warning` → `bg-status-warning` (orange)
- `error` → `bg-status-error` (red)
- no status → `bg-accessory-emphasized` (grey)

Inactive items always have `status = 'ok'` (because `refillThreshold === 0` means neither warning nor error threshold is reached), so in practice the bar will be green.

## Implementation

**File:** `src/components/ItemProgressBar.tsx`

Modify the `target === 0` early return guard (currently lines 214–220). Split into two branches:

```tsx
if (target === 0) {
  if (current > 0) {
    const fillColor =
      status === 'ok'
        ? 'bg-status-ok'
        : status === 'warning'
          ? 'bg-status-warning'
          : status === 'error'
            ? 'bg-status-error'
            : 'bg-accessory-emphasized'
    return (
      <div className="flex-1">
        <div className="h-2 w-full rounded-xs border border-accessory-emphasized overflow-hidden">
          <div className={cn('h-full w-full', fillColor)} />
        </div>
      </div>
    )
  }
  return (
    <div className="flex-1">
      <div className="h-2 w-full rounded-xs border border-accessory-emphasized" />
    </div>
  )
}
```

No changes to `SegmentedProgressBar`, `ContinuousProgressBar`, or `ItemCard`.

## Testing

Add one test to `src/components/ItemProgressBar.test.tsx`:

```ts
it('renders full bar when target is 0 but current > 0', () => {
  const { container } = render(
    <ItemProgressBar current={2} target={0} status="ok" />,
  )
  const inner = container.querySelector('.flex-1 > div > div')
  expect(inner).toBeInTheDocument()
  expect(inner).toHaveClass('bg-status-ok')
})
```

Also verify the existing `'renders empty track when target is 0'` test still passes (it uses `current={0}` so it is unaffected).
