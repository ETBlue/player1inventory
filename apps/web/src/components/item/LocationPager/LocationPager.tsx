import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Location } from '@/types'

interface LocationPagerProps {
  /** Every location, in display order. */
  locations: Location[]
  /** Index into `locations` of the page currently on screen. */
  currentIndex: number
  /** The globally active location — marked wherever it sits in the list. */
  activeLocationId: string
  onChange: (index: number) => void
  /** `id` of the panel these tabs control. */
  panelId: string
  /** Prefix for each tab's `id`, so the panel can point back at its tab. */
  tabIdPrefix: string
}

// Dot pager over the locations of the item-detail Stock tab. Rendered only
// when there is more than one location — the caller owns that decision,
// because the panel's tabpanel/aria-labelledby wiring has to appear and
// disappear along with the tablist.
//
// Two independent visual channels, so they compose instead of competing:
//   • FILL says which page you are viewing — solid `importance-primary`
//     against the muted `accessory-emphasized` of the others.
//   • RING says which location is the globally active one — an
//     `importance-primary-accessory` ring that stays put while you page
//     through the others (both at once when you are viewing the active one).
// Neither marker is colour-only: the viewed page is `aria-selected` and named
// in the heading above the dots, and the active location carries "(active
// location)" in its accessible name plus a visible "Active" hint.
export function LocationPager({
  locations,
  currentIndex,
  activeLocationId,
  onChange,
  panelId,
  tabIdPrefix,
}: LocationPagerProps) {
  const { t } = useTranslation()
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])

  const current = locations[currentIndex]
  if (!current) return null

  // Automatic activation (the ARIA tabs pattern): an arrow key selects the
  // page it moves to. Movement clamps rather than wraps, matching the chevrons
  // — which disable at the ends so the boundary is visible, not silent.
  const move = (index: number) => {
    const next = Math.min(Math.max(index, 0), locations.length - 1)
    if (next === currentIndex) return
    onChange(next)
    tabRefs.current[next]?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      move(currentIndex + 1)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      move(currentIndex - 1)
    } else if (e.key === 'Home') {
      e.preventDefault()
      move(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      move(locations.length - 1)
    }
  }

  return (
    <div className="mb-4 flex items-center justify-center gap-2">
      <Button
        type="button"
        variant="neutral-ghost"
        size="icon-sm"
        aria-label={t('items.detail.locationPager.previous')}
        disabled={currentIndex === 0}
        onClick={() => onChange(currentIndex - 1)}
      >
        <ChevronLeft />
      </Button>

      <div className="flex min-w-0 flex-col items-center gap-1">
        <p className="flex min-w-0 items-baseline gap-1.5">
          <span className="truncate text-sm font-medium">{current.name}</span>
          {current.id === activeLocationId && (
            <span className="shrink-0 text-xs text-foreground-muted">
              {t('items.detail.locationPager.activeHint')}
            </span>
          )}
        </p>

        {/* Arrow/Home/End handling lives here on the tablist; the dots
            themselves are real buttons, so click and Enter/Space are native. */}
        <div
          role="tablist"
          aria-label={t('items.detail.locationPager.label')}
          aria-orientation="horizontal"
          className="flex items-center"
          onKeyDown={handleKeyDown}
        >
          {locations.map((location, index) => {
            const isViewed = index === currentIndex
            const isActive = location.id === activeLocationId
            return (
              <button
                key={location.id}
                id={`${tabIdPrefix}-${location.id}`}
                ref={(el) => {
                  tabRefs.current[index] = el
                }}
                type="button"
                role="tab"
                aria-selected={isViewed}
                aria-controls={panelId}
                tabIndex={isViewed ? 0 : -1}
                aria-label={
                  isActive
                    ? t('items.detail.locationPager.pageActive', {
                        location: location.name,
                      })
                    : location.name
                }
                onClick={() => onChange(index)}
                className="flex size-6 cursor-pointer items-center justify-center rounded-full"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'block size-2 rounded-full transition-colors',
                    isViewed
                      ? 'bg-importance-primary-background'
                      : 'bg-accessory-emphasized',
                    isActive &&
                      'ring-2 ring-importance-primary-accessory ring-offset-2 ring-offset-background-elevated',
                  )}
                />
              </button>
            )
          })}
        </div>
      </div>

      <Button
        type="button"
        variant="neutral-ghost"
        size="icon-sm"
        aria-label={t('items.detail.locationPager.next')}
        disabled={currentIndex === locations.length - 1}
        onClick={() => onChange(currentIndex + 1)}
      >
        <ChevronRight />
      </Button>

      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {t('items.detail.locationPager.viewing', { location: current.name })}
      </p>
    </div>
  )
}
