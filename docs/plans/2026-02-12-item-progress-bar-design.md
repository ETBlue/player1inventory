# Item Progress Bar Design

**Date:** 2026-02-12
**Status:** Design Complete

## Overview

Add a visual progress indicator to pantry item cards showing the quantity/target ratio. The progress bar adapts based on target size and displays warning colors when quantity is below the refill threshold.

## Requirements

1. **Replace quantity text** with progress bar
2. **Show target quantity** at the end of progress bar
3. **Adaptive display**:
   - Segmented bar (1-15 units): One segment per unit
   - Continuous bar (16+ units): Traditional smooth progress bar
4. **Warning state**: Orange color when quantity < refillThreshold

## Current Behavior

**File:** `src/components/ItemCard.tsx` (lines 50-52)

**Current display**:
```tsx
<p className="text-sm text-foreground-muted">
  {quantity} / {item.targetQuantity}
</p>
```

Shows text-only ratio without visual feedback.

## Design

### Component Structure

**Replace** lines 50-52 in `ItemCard.tsx` with:

```tsx
<div className="flex items-center gap-2 mt-1">
  <div className="flex-1">
    {item.targetQuantity <= 15 ? (
      <SegmentedProgressBar
        current={quantity}
        target={item.targetQuantity}
        warning={needsRefill}
      />
    ) : (
      <ContinuousProgressBar
        current={quantity}
        target={item.targetQuantity}
        warning={needsRefill}
      />
    )}
  </div>
  <span className="text-xs text-foreground-muted whitespace-nowrap">
    {quantity}/{item.targetQuantity}
  </span>
</div>
```

**Visual layout**:
```
[Progress bar ==================] 8/12
```

### Segmented Progress Bar Component

**Purpose**: Display 1-15 segments where each segment represents 1 unit

**Visual example** (8/12):
```
[■][■][■][■][■][■][■][■][□][□][□][□]
```

**Implementation**:
```tsx
interface SegmentedProgressBarProps {
  current: number
  target: number
  warning: boolean
}

function SegmentedProgressBar({ current, target, warning }: SegmentedProgressBarProps) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: target }, (_, i) => (
        <div
          key={i}
          className={cn(
            "h-2 flex-1 rounded-sm",
            i < current
              ? warning
                ? "bg-orange-500" // Filled - warning
                : "bg-primary"     // Filled - normal
              : "bg-background-surface" // Empty
          )}
        />
      ))}
    </div>
  )
}
```

**Styling**:
- Each segment: `h-2` (8px) height, `rounded-sm` corners
- Gap between segments: `gap-0.5` (2px)
- Filled segments: Primary color (normal) or orange (warning)
- Empty segments: Background surface color
- Flex-based equal width distribution

### Continuous Progress Bar Component

**Purpose**: Display smooth fill bar for 16+ unit targets

**Visual example** (45/60 = 75%):
```
[████████████████████░░░░░░░]
```

**Implementation**:
```tsx
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

interface ContinuousProgressBarProps {
  current: number
  target: number
  warning: boolean
}

function ContinuousProgressBar({ current, target, warning }: ContinuousProgressBarProps) {
  const percentage = Math.min((current / target) * 100, 100)

  return (
    <Progress
      value={percentage}
      className={cn(
        "[&>div]:transition-all [&>div]:duration-300",
        warning && "[&>div]:bg-orange-500"
      )}
    />
  )
}
```

**Features**:
- Uses shadcn/ui Progress component (Radix UI based)
- Percentage calculation capped at 100%
- Smooth animation on quantity changes
- Warning color override when needed
- Built-in accessibility (ARIA attributes)

## Implementation Steps

### 1. Install shadcn Progress Component

```bash
npx shadcn@latest add progress
```

This creates `src/components/ui/progress.tsx` with the shadcn Progress component.

### 2. Create Progress Bar Components

**File:** `src/components/ItemProgressBar.tsx` (new file)

```tsx
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

interface ProgressBarProps {
  current: number
  target: number
  warning: boolean
}

function SegmentedProgressBar({ current, target, warning }: ProgressBarProps) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: target }, (_, i) => (
        <div
          key={i}
          className={cn(
            "h-2 flex-1 rounded-sm",
            i < current
              ? warning
                ? "bg-orange-500"
                : "bg-primary"
              : "bg-background-surface"
          )}
        />
      ))}
    </div>
  )
}

function ContinuousProgressBar({ current, target, warning }: ProgressBarProps) {
  const percentage = Math.min((current / target) * 100, 100)

  return (
    <Progress
      value={percentage}
      className={cn(
        "[&>div]:transition-all [&>div]:duration-300",
        warning && "[&>div]:bg-orange-500"
      )}
    />
  )
}

export function ItemProgressBar({ current, target, warning }: ProgressBarProps) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1">
        {target <= 15 ? (
          <SegmentedProgressBar current={current} target={target} warning={warning} />
        ) : (
          <ContinuousProgressBar current={current} target={target} warning={warning} />
        )}
      </div>
      <span className="text-xs text-foreground-muted whitespace-nowrap">
        {current}/{target}
      </span>
    </div>
  )
}
```

### 3. Update ItemCard Component

**File:** `src/components/ItemCard.tsx`

**Import**:
```tsx
import { ItemProgressBar } from '@/components/ItemProgressBar'
```

**Replace** lines 50-52:
```tsx
<ItemProgressBar
  current={quantity}
  target={item.targetQuantity}
  warning={needsRefill}
/>
```

## Design Decisions

### Why Adaptive Display?

- **Segmented (1-15)**: Clear visual count of discrete units. User can quickly see "5 out of 8 bottles"
- **Continuous (16+)**: Prevents visual clutter with too many segments. Better for bulk items like "45/60 eggs"

### Why 15 as Threshold?

- Balances visual clarity with usefulness
- 15 segments are still readable without overwhelming the card
- Most pantry items have targets < 15 (anecdotal)

### Color Scheme

- **Primary color**: Normal state, aligns with theme
- **Orange (warning)**: Matches existing warning card variant and AlertTriangle icon
- **Background surface**: Subtle empty state, not pure white/black

## Testing

- Install shadcn Progress component
- Create ItemProgressBar component
- Update ItemCard to use new progress bar
- Verify segmented bar: targets 1-15 show segments
- Verify continuous bar: targets 16+ show smooth bar
- Verify warning color: quantity < refillThreshold shows orange
- Verify animation: quantity changes animate smoothly
- Test edge cases: 0 quantity, quantity > target, very large targets
- Test in light and dark modes

## Files to Modify/Create

1. `src/components/ui/progress.tsx` - Created by shadcn CLI
2. `src/components/ItemProgressBar.tsx` - New component (create)
3. `src/components/ItemCard.tsx` - Update to use ItemProgressBar

## Benefits

- **Visual feedback**: Immediate understanding of stock levels
- **Reduced cognitive load**: No math needed to assess "8/12"
- **Warning clarity**: Orange bar reinforces low stock state
- **Accessibility**: Using shadcn Progress with proper ARIA
- **Scalable design**: Works for both small and large quantities
