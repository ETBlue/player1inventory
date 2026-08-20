import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Location } from '@/types'

interface LocationPagerProps {
  /** Every location, in display order. */
  locations: Location[]
  /** Index into `locations` of the page currently on screen. */
  currentIndex: number
  /** The globally active location — named in the caption and in its dot's accessible name. */
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
// Two channels, neither of them colour:
//   • FILL says which page you are viewing. Every dot is the same size
//     (`size-3`) and the same colour (`foreground-muted`); the viewed one is
//     solid and the rest are hollow — a 2px stroke of that same colour around
//     a transparent centre. This is the standard pager-dot idiom, and because
//     the difference is shape rather than hue it survives greyscale, low
//     vision and low contrast. `foreground-muted` measures 8.73:1 against
//     `background-elevated` in light mode and 7.30:1 in dark, well clear of
//     WCAG 1.4.11's 3:1 for non-text indicators; the hollow dot's stroke IS
//     that colour and its centre IS the page, so the stroke inherits the same
//     ratio. (Do not reach for a halo ring to add a third state: the
//     `ring-importance-primary-accessory` this replaced measured 2.44:1
//     against the page and 1.16:1 against the dot it wrapped — both fail.)
//   • WORDS say which location is the globally active one. The dots do not
//     mark it at all — fill is spent on page position — so the caption under
//     the heading carries it on every page: "Active" when you are standing on
//     it, "Active: <name>" while you are looking elsewhere. The active dot's
//     accessible name also keeps its "(active location)" suffix wherever it
//     sits in the list, so assistive tech gets the fact per-dot too.
//
// `data-viewed` mirrors the styled state onto the DOM so a test can bind the
// fill to the right dot; the CSS itself can only be judged by eye (see
// LocationPager.stories.tsx, both themes).
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
  // Set by a keyboard move, consumed once the page actually turns. The parent
  // may refuse the change (unsaved edits open a discard dialog instead), and
  // focusing a dot the pager never moved to would strand focus on the wrong
  // one when the user cancels.
  const focusOnPageChange = useRef(false)

  useEffect(() => {
    if (!focusOnPageChange.current) return
    focusOnPageChange.current = false
    tabRefs.current[currentIndex]?.focus()
  }, [currentIndex])

  const current = locations[currentIndex]
  const activeLocation = locations.find((l) => l.id === activeLocationId)
  if (!current) return null

  // Automatic activation (the ARIA tabs pattern): an arrow key selects the
  // page it moves to. Movement clamps rather than wraps, matching the chevrons
  // — which disable at the ends so the boundary is visible, not silent.
  const move = (index: number) => {
    const next = Math.min(Math.max(index, 0), locations.length - 1)
    if (next === currentIndex) return
    focusOnPageChange.current = true
    onChange(next)
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

      <div className="flex min-w-0 flex-col items-center gap-0.5">
        <p className="min-w-0 truncate text-sm font-medium">{current.name}</p>

        {/* Always present, so the active location never stops being named. */}
        {activeLocation && (
          <p className="min-w-0 truncate text-xs text-foreground-muted">
            {activeLocation.id === current.id
              ? t('items.detail.locationPager.activeHint')
              : t('items.detail.locationPager.activeElsewhere', {
                  location: activeLocation.name,
                })}
          </p>
        )}

        {/* Arrow/Home/End handling lives here on the tablist; the dots
            themselves are real buttons, so click and Enter/Space are native. */}
        <div
          role="tablist"
          aria-label={t('items.detail.locationPager.label')}
          aria-orientation="horizontal"
          className="mt-0.5 flex items-center"
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
                  data-viewed={isViewed || undefined}
                  className={cn(
                    // One geometry for every dot — only the fill changes, so
                    // nothing shifts or resizes as the page turns.
                    'block size-3 rounded-full border-2 border-foreground-muted transition-colors',
                    isViewed ? 'bg-foreground-muted' : 'bg-transparent',
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
