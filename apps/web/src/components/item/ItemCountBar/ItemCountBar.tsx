import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

// At most this many squares. More pieces show as a `+N` label after the last
// square, so a card never grows taller or wraps (design decision Q3).
export const MAX_COUNT_SQUARES = 20

// One square is `size-2` (8px) and the gap is `gap-1` (4px). The refill
// marker's position is computed from these two, so they must match the
// classes below.
const SQUARE_PX = 8
const GAP_PX = 4

interface ItemCountBarProps {
  /** Pieces in stock. Only whole pieces are drawn; a fraction is dropped. */
  current: number
  /** Pieces wanted. Squares past `current` up to this are drawn outlined. */
  target: number
  status?: 'ok' | 'warning' | 'error' | 'inactive'
  /** Refill threshold, in pieces. Draws a marker, like `ItemProgressBar`. */
  refillThreshold?: number
}

const FILL_BY_STATUS = {
  ok: 'bg-status-ok-background-muted',
  warning: 'bg-status-warning-background-muted',
  error: 'bg-status-error-background-muted',
  inactive: 'bg-status-inactive-background-muted',
} as const

/**
 * CSS `left` of the refill marker, in px from the left end of the row.
 *
 * A whole threshold `k` goes to the centre of the gap after square `k`. A
 * fractional one goes inside square `floor(x)`. 0 goes to the left end.
 */
export function getCountMarkerLeft(threshold: number): number {
  if (threshold <= 0) return 0
  const k = Math.floor(threshold)
  if (threshold === k) return k * (SQUARE_PX + GAP_PX) - GAP_PX / 2
  return k * (SQUARE_PX + GAP_PX) + (threshold - k) * SQUARE_PX
}

/**
 * The stock bar of a non-consumable item (cups, slippers): one fixed-size
 * square per whole piece. A filled square is a piece in stock. An outlined
 * square is a piece missing up to the target. Unlike `ItemProgressBar`, the
 * squares do not stretch with the card.
 */
export function ItemCountBar({
  current,
  target,
  status,
  refillThreshold,
}: ItemCountBarProps) {
  const { t } = useTranslation()
  const inStock = Math.max(0, Math.floor(current))
  const wanted = Math.max(0, Math.floor(target))
  // More pieces than the target are still drawn, all filled.
  const total = Math.max(inStock, wanted)
  const shown = Math.min(total, MAX_COUNT_SQUARES)
  const hidden = total - shown
  const fill = status ? FILL_BY_STATUS[status] : 'bg-accessory-emphasized'

  // The marker is drawn only where a square is drawn. A threshold past the
  // last drawn square (more than 20 pieces) has no place on the row.
  const showMarker =
    refillThreshold !== undefined &&
    refillThreshold >= 0 &&
    shown > 0 &&
    refillThreshold <= shown

  return (
    // `h-2`: the same height as `ItemProgressBar`, so a card keeps its height
    // whichever bar it shows.
    <div className="relative flex h-2 items-center gap-1">
      {Array.from({ length: shown }, (_, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: squares are static presentational elements
          key={i}
          data-testid="count-square"
          data-filled={i < inStock}
          aria-hidden="true"
          className={cn(
            'size-2 shrink-0 rounded-xs border border-accessory-default',
            i < inStock ? fill : 'bg-transparent',
          )}
        />
      ))}
      {hidden > 0 && (
        <span
          data-testid="count-more"
          className="text-[10px] leading-none text-foreground-muted"
        >
          {t('itemCountBar.more', { count: hidden })}
        </span>
      )}
      {showMarker && (
        <>
          <div
            data-testid="refill-marker"
            data-threshold={refillThreshold}
            aria-hidden="true"
            className={cn(
              'pointer-events-none absolute -top-0.5 h-3 w-2 rounded-full bg-foreground-muted border border-accessory-default',
              refillThreshold <= 0 ? 'translate-x-0' : '-translate-x-1/2',
            )}
            style={{ left: `${getCountMarkerLeft(refillThreshold)}px` }}
          />
          <span className="sr-only">
            {t('common.refillWhenBelow', { value: refillThreshold })}
          </span>
        </>
      )}
    </div>
  )
}
